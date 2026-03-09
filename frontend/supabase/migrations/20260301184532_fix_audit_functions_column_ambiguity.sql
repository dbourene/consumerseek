/*
  # Fix column ambiguity in audit export functions

  1. Problem
    - "created_at" is ambiguous between function output and table column
    - Need to use qualified column names and rename output columns

  2. Solution
    - Fully qualify all column references
    - Rename output columns to avoid conflicts
*/

DROP FUNCTION IF EXISTS get_registre_consentements();
DROP FUNCTION IF EXISTS get_historique_evenements();
DROP FUNCTION IF EXISTS get_coherence_chronologique();

-- Tab 1: LOGS_CONSENTEMENT
CREATE OR REPLACE FUNCTION get_registre_consentements()
RETURNS TABLE (
  authorization_id uuid,
  prm text,
  consent_status text,
  consent_timestamp timestamptz,
  declarant_type text,
  declarant_identity text,
  declarant_email text,
  declarant_phone text,
  declarant_role text,
  mandate_declared boolean,
  titulaire_identity text,
  titulaire_type text,
  legal_basis text,
  cgu_version text,
  privacy_policy_version text,
  consent_hash text,
  ip_address text,
  user_agent text,
  source text,
  record_created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  WITH prm_agg AS (
    SELECT 
      p.autorisation_id,
      string_agg(p.prm_numero, ', ' ORDER BY p.created_at) as prm_list
    FROM prm p
    GROUP BY p.autorisation_id
  )
  SELECT 
    ac.id as authorization_id,
    COALESCE(pa.prm_list, 'N/A') as prm,
    COALESCE(ac.consent_status, 
      CASE WHEN ac.revoked_at IS NULL THEN 'ACTIF' ELSE 'REVOQUE' END
    ) as consent_status,
    ac.date_autorisation as consent_timestamp,
    ac.type_titulaire as declarant_type,
    CONCAT(COALESCE(ac.civilite, ''), ' ', ac.prenom, ' ', ac.nom) as declarant_identity,
    ac.email as declarant_email,
    ac.telephone as declarant_phone,
    COALESCE(ac.declarant_role, 'TITULAIRE') as declarant_role,
    (ac.declarant_role IS NOT NULL AND ac.declarant_role != 'TITULAIRE') as mandate_declared,
    CONCAT(COALESCE(ac.civilite, ''), ' ', ac.prenom, ' ', ac.nom) as titulaire_identity,
    ac.type_titulaire as titulaire_type,
    'CONSENTEMENT_ECLAIRE' as legal_basis,
    COALESCE(pv.rgpd_version, 'v1.0') as cgu_version,
    COALESCE(pv.consent_text_version, 'v1.0') as privacy_policy_version,
    COALESCE(ac.consent_text_hash, 'N/A') as consent_hash,
    COALESCE(ac.ip_address::text, 'N/A') as ip_address,
    COALESCE(ac.user_agent, 'N/A') as user_agent,
    'FORMULAIRE_WEB' as source,
    ac.created_at as record_created_at
  FROM autorisations_communication ac
  LEFT JOIN prm_agg pa ON pa.autorisation_id = ac.id
  LEFT JOIN policy_versions pv ON ac.policy_version_id = pv.id
  ORDER BY ac.date_autorisation DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tab 2: LOGS_REVOCATION
CREATE OR REPLACE FUNCTION get_historique_evenements()
RETURNS TABLE (
  prm text,
  client_identity text,
  revocation_timestamp_utc timestamptz,
  ip_address text,
  user_agent text,
  reason text,
  consent_hash text,
  siret text
) AS $$
BEGIN
  RETURN QUERY
  WITH prm_agg AS (
    SELECT 
      p.autorisation_id,
      string_agg(p.prm_numero, ', ' ORDER BY p.created_at) as prm_list
    FROM prm p
    GROUP BY p.autorisation_id
  )
  SELECT 
    COALESCE(pa.prm_list, 'N/A') as prm,
    CONCAT(COALESCE(ac.civilite, ''), ' ', ac.prenom, ' ', ac.nom) as client_identity,
    ac.revoked_at as revocation_timestamp_utc,
    COALESCE(ac.ip_address::text, 'N/A') as ip_address,
    COALESCE(ac.user_agent, 'N/A') as user_agent,
    COALESCE(ac.revocation_reason, 'N/A') as reason,
    COALESCE(ac.consent_text_hash, 'N/A') as consent_hash,
    COALESCE(ac.siret, '') as siret
  FROM autorisations_communication ac
  LEFT JOIN prm_agg pa ON pa.autorisation_id = ac.id
  WHERE ac.revoked_at IS NOT NULL
  ORDER BY ac.revoked_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tab 3: LOGS_APPELS_API
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
      MIN(eac.called_at) as first_call,
      COUNT(*) as call_count
    FROM enedis_api_calls eac
    GROUP BY eac.autorisation_id
  )
  SELECT 
    COALESCE(pa.prm_list, 'N/A') as prm,
    ac.date_autorisation as consent_timestamp_utc,
    ast.first_call as first_api_call_timestamp_utc,
    COALESCE(ast.call_count, 0)::integer as api_call_count,
    CASE 
      WHEN ast.first_call IS NOT NULL AND ac.date_autorisation IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (ast.first_call - ac.date_autorisation))::integer
      ELSE 0
    END as processing_duration_seconds,
    CASE 
      WHEN ac.revoked_at IS NOT NULL AND ac.processing_stopped_at IS NULL THEN 'NON_CONFORME'
      WHEN ac.access_after_revocation_flag = true THEN 'ALERTE'
      WHEN ast.first_call IS NULL THEN 'EN_ATTENTE'
      ELSE 'CONFORME'
    END as conformity_status,
    CASE 
      WHEN ac.access_after_revocation_flag = true THEN 
        'Accès détecté après révocation (' || COALESCE(ac.access_blocked_count::text, '0') || ' bloqués)'
      WHEN ac.revoked_at IS NOT NULL AND ac.processing_stopped_at IS NULL THEN 
        'Révocation sans arrêt de traitement'
      WHEN ast.first_call IS NULL THEN 
        'Aucun appel API enregistré'
      ELSE 
        'Conforme'
    END as message
  FROM autorisations_communication ac
  LEFT JOIN prm_agg pa ON pa.autorisation_id = ac.id
  LEFT JOIN api_stats ast ON ast.autorisation_id = ac.id
  ORDER BY ac.date_autorisation DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_registre_consentements() TO authenticated;
GRANT EXECUTE ON FUNCTION get_historique_evenements() TO authenticated;
GRANT EXECUTE ON FUNCTION get_coherence_chronologique() TO authenticated;