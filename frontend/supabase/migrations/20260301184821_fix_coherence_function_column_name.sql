/*
  # Fix get_coherence_chronologique function column name

  1. Problem
    - Function references eac.called_at which doesn't exist
    - Actual column is server_timestamp_utc

  2. Solution
    - Update function to use correct column name
*/

DROP FUNCTION IF EXISTS get_coherence_chronologique();

CREATE OR REPLACE FUNCTION get_coherence_chronologique()
RETURNS TABLE (
  prm text,
  consent_timestamp_utc timestamptz,
  first_api_call_timestamp_utc timestamptz,
  api_call_count integer,
  processing_duration_seconds integer,
  conformity_status text,
  message text
) AS $$
BEGIN
  RETURN QUERY
  WITH prm_agg AS (
    SELECT 
      p.autorisation_id,
      string_agg(p.prm_numero, ', ' ORDER BY p.created_at) as prm_list
    FROM prm p
    GROUP BY p.autorisation_id
  ),
  api_stats AS (
    SELECT 
      eac.autorisation_id,
      MIN(eac.server_timestamp_utc) as first_call,
      COUNT(*) as call_count
    FROM enedis_api_calls eac
    GROUP BY eac.autorisation_id
  )
  SELECT 
    COALESCE(pa.prm_list, 'N/A'),
    ac.date_autorisation,
    ast.first_call,
    COALESCE(ast.call_count, 0)::integer,
    CASE 
      WHEN ast.first_call IS NOT NULL AND ac.date_autorisation IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (ast.first_call - ac.date_autorisation))::integer
      ELSE 0
    END,
    CASE 
      WHEN ac.revoked_at IS NOT NULL AND ac.processing_stopped_at IS NULL THEN 'NON_CONFORME'
      WHEN ac.access_after_revocation_flag = true THEN 'ALERTE'
      WHEN ast.first_call IS NULL THEN 'EN_ATTENTE'
      ELSE 'CONFORME'
    END,
    CASE 
      WHEN ac.access_after_revocation_flag = true THEN 
        'Accès détecté après révocation (' || COALESCE(ac.access_blocked_count::text, '0') || ' bloqués)'
      WHEN ac.revoked_at IS NOT NULL AND ac.processing_stopped_at IS NULL THEN 
        'Révocation sans arrêt de traitement'
      WHEN ast.first_call IS NULL THEN 
        'Aucun appel API enregistré'
      ELSE 
        'Conforme'
    END
  FROM autorisations_communication ac
  LEFT JOIN prm_agg pa ON pa.autorisation_id = ac.id
  LEFT JOIN api_stats ast ON ast.autorisation_id = ac.id
  ORDER BY ac.date_autorisation DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_coherence_chronologique() TO authenticated;