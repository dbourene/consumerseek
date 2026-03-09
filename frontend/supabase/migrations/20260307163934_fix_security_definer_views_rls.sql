/*
  # Fix Security Definer Views - Replace with RLS-Protected Functions

  1. Problem
    - 4 views use SECURITY DEFINER which bypasses RLS
    - Supabase linter flags this as CRITICAL security error
    - Views: v_consent_audit_export, v_revocations_audit_export, 
             v_chronological_consistency_audit, v_archive_summary

  2. Solution
    - DROP all SECURITY DEFINER views
    - Replace with standard RPC functions protected by RLS
    - Add proper authentication checks
    - Only authenticated users can call these functions

  3. Security
    - Functions use SECURITY INVOKER (default) instead of SECURITY DEFINER
    - RLS policies apply normally
    - No unrestricted access
*/

-- Drop the problematic SECURITY DEFINER views
DROP VIEW IF EXISTS v_consent_audit_export;
DROP VIEW IF EXISTS v_revocations_audit_export;
DROP VIEW IF EXISTS v_chronological_consistency_audit;
DROP VIEW IF EXISTS v_archive_summary;

-- Replace v_consent_audit_export with RPC function
CREATE OR REPLACE FUNCTION get_consent_audit_export()
RETURNS TABLE (
  prm text,
  identite_client text,
  raison_sociale text,
  siret text,
  timestamp_utc_serveur timestamptz,
  adresse_ip inet,
  navigateur_user_agent text,
  version_politique text,
  consentement_donne boolean,
  statut_consentement text,
  hash_consentement_sha256 text,
  hash_evenement_sha256 text,
  statut_actuel text,
  date_revocation timestamptz,
  raison_revocation text,
  date_creation_log timestamptz
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    ce.prm_number::text AS prm,
    ((ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text) AS identite_client,
    (ce.identity_client->>'raison_sociale')::text AS raison_sociale,
    (ce.identity_client->>'siret')::text AS siret,
    ce.server_timestamp_utc AS timestamp_utc_serveur,
    ce.ip_address AS adresse_ip,
    ce.user_agent AS navigateur_user_agent,
    pv.version AS version_politique,
    ce.consent_given AS consentement_donne,
    ce.event_type AS statut_consentement,
    ce.consent_text_hash AS hash_consentement_sha256,
    ce.event_hash AS hash_evenement_sha256,
    ac.consent_status AS statut_actuel,
    ac.revoked_at AS date_revocation,
    ac.revocation_reason AS raison_revocation,
    ce.created_at AS date_creation_log
  FROM consent_events ce
  LEFT JOIN policy_versions pv ON ce.policy_version_id = pv.id
  LEFT JOIN autorisations_communication ac ON ce.autorisation_id = ac.id
  WHERE ce.event_type IN ('CREATION', 'REACTIVATION')
  ORDER BY ce.server_timestamp_utc DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_consent_audit_export() TO authenticated;

-- Replace v_revocations_audit_export with RPC function
CREATE OR REPLACE FUNCTION get_revocations_audit_export()
RETURNS TABLE (
  prm text,
  identite_client text,
  timestamp_revocation_utc timestamptz,
  adresse_ip_revocation inet,
  navigateur_revocation text,
  raison_revocation text,
  hash_evenement_revocation_sha256 text,
  date_creation_log timestamptz
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    ce.prm_number::text AS prm,
    ((ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text) AS identite_client,
    ce.server_timestamp_utc AS timestamp_revocation_utc,
    ce.ip_address AS adresse_ip_revocation,
    ce.user_agent AS navigateur_revocation,
    (ce.metadata->>'revocation_reason')::text AS raison_revocation,
    ce.event_hash AS hash_evenement_revocation_sha256,
    ce.created_at AS date_creation_log
  FROM consent_events ce
  WHERE ce.event_type IN ('REVOCATION', 'PRM_REVOKED', 'CONSENT_REVOKED')
  ORDER BY ce.server_timestamp_utc DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_revocations_audit_export() TO authenticated;

-- Replace v_chronological_consistency_audit with RPC function
CREATE OR REPLACE FUNCTION get_chronological_consistency_audit()
RETURNS TABLE (
  prm text,
  timestamp_consentement_utc timestamptz,
  timestamp_premier_appel_api_utc timestamptz,
  timestamp_dernier_appel_api_utc timestamptz,
  nombre_appels_api bigint,
  statut_conformite text,
  ecart_secondes numeric,
  message_conformite text
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  WITH consent_timestamps AS (
    SELECT 
      prm_number,
      MAX(server_timestamp_utc) FILTER (WHERE event_type = 'CREATION' AND consent_given = true) AS derniere_consent_timestamp
    FROM consent_events
    GROUP BY prm_number
  ),
  api_call_timestamps AS (
    SELECT 
      prm_number,
      MIN(server_timestamp_utc) AS premier_appel_api_timestamp,
      MAX(server_timestamp_utc) AS dernier_appel_api_timestamp,
      COUNT(*) AS nombre_appels_api
    FROM enedis_api_calls
    GROUP BY prm_number
  )
  SELECT 
    ct.prm_number::text AS prm,
    ct.derniere_consent_timestamp AS timestamp_consentement_utc,
    at.premier_appel_api_timestamp AS timestamp_premier_appel_api_utc,
    at.dernier_appel_api_timestamp AS timestamp_dernier_appel_api_utc,
    at.nombre_appels_api,
    CASE 
      WHEN at.premier_appel_api_timestamp IS NULL THEN 'NO_API_CALL'
      WHEN ct.derniere_consent_timestamp < at.premier_appel_api_timestamp THEN 'VALID'
      ELSE 'INVALID_CHRONOLOGY'
    END::text AS statut_conformite,
    EXTRACT(EPOCH FROM (at.premier_appel_api_timestamp - ct.derniere_consent_timestamp)) AS ecart_secondes,
    CASE 
      WHEN ct.derniere_consent_timestamp < at.premier_appel_api_timestamp 
      THEN 'Conforme : consentement précède tous les appels API'
      WHEN at.premier_appel_api_timestamp IS NULL
      THEN 'Aucun appel API effectué'
      ELSE 'NON CONFORME : appel API avant consentement'
    END::text AS message_conformite
  FROM consent_timestamps ct
  LEFT JOIN api_call_timestamps at ON ct.prm_number = at.prm_number
  ORDER BY ct.prm_number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_chronological_consistency_audit() TO authenticated;

-- Replace v_archive_summary with RPC function
CREATE OR REPLACE FUNCTION get_archive_summary()
RETURNS TABLE (
  table_name text,
  nombre_archives bigint,
  periode_debut timestamptz,
  periode_fin timestamptz,
  total_enregistrements_archives bigint,
  taille_totale_bytes bigint,
  taille_totale_readable text
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    aa.table_name,
    COUNT(*)::bigint AS nombre_archives,
    MIN(aa.period_start) AS periode_debut,
    MAX(aa.period_end) AS periode_fin,
    SUM(aa.record_count)::bigint AS total_enregistrements_archives,
    SUM(aa.file_size_bytes)::bigint AS taille_totale_bytes,
    pg_size_pretty(SUM(aa.file_size_bytes)) AS taille_totale_readable
  FROM audit_archives aa
  GROUP BY aa.table_name
  ORDER BY aa.table_name;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_archive_summary() TO authenticated;

-- Update get_audit_report_for_prms to use function instead of view
DROP FUNCTION IF EXISTS get_audit_report_for_prms(text[]);

CREATE OR REPLACE FUNCTION get_audit_report_for_prms(
  prm_list text[]
) RETURNS TABLE (
  onglet text,
  prm text,
  identite_client text,
  timestamp_utc timestamptz,
  adresse_ip inet,
  user_agent text,
  version_politique text,
  statut text,
  hash_sha256 text,
  details jsonb
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    'CONSENTEMENTS'::text AS onglet,
    ce.prm_number::text AS prm,
    ((ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text) AS identite_client,
    ce.server_timestamp_utc AS timestamp_utc,
    ce.ip_address AS adresse_ip,
    ce.user_agent AS user_agent,
    pv.version AS version_politique,
    ce.event_type AS statut,
    ce.event_hash AS hash_sha256,
    jsonb_build_object(
      'raison_sociale', ce.identity_client->>'raison_sociale',
      'siret', ce.identity_client->>'siret',
      'consent_text_hash', ce.consent_text_hash,
      'policy_title', pv.title
    ) AS details
  FROM consent_events ce
  LEFT JOIN policy_versions pv ON ce.policy_version_id = pv.id
  WHERE ce.prm_number = ANY(prm_list)
    AND ce.event_type IN ('CREATION', 'REACTIVATION')
  ORDER BY ce.server_timestamp_utc DESC;
  
  RETURN QUERY
  SELECT 
    'REVOCATIONS'::text AS onglet,
    ce.prm_number::text AS prm,
    ((ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text) AS identite_client,
    ce.server_timestamp_utc AS timestamp_utc,
    ce.ip_address AS adresse_ip,
    ce.user_agent AS user_agent,
    NULL::text AS version_politique,
    'REVOKED'::text AS statut,
    ce.event_hash AS hash_sha256,
    jsonb_build_object(
      'raison_revocation', ce.metadata->>'revocation_reason'
    ) AS details
  FROM consent_events ce
  WHERE ce.prm_number = ANY(prm_list)
    AND ce.event_type IN ('REVOCATION', 'PRM_REVOKED', 'CONSENT_REVOKED')
  ORDER BY ce.server_timestamp_utc DESC;
  
  RETURN QUERY
  WITH consent_timestamps AS (
    SELECT 
      prm_number,
      MAX(server_timestamp_utc) FILTER (WHERE event_type = 'CREATION' AND consent_given = true) AS derniere_consent_timestamp
    FROM consent_events
    WHERE prm_number = ANY(prm_list)
    GROUP BY prm_number
  ),
  api_call_timestamps AS (
    SELECT 
      prm_number,
      MIN(server_timestamp_utc) AS premier_appel_api_timestamp,
      MAX(server_timestamp_utc) AS dernier_appel_api_timestamp,
      COUNT(*) AS nombre_appels_api
    FROM enedis_api_calls
    WHERE prm_number = ANY(prm_list)
    GROUP BY prm_number
  )
  SELECT 
    'COHERENCE_CHRONOLOGIQUE'::text AS onglet,
    ct.prm_number::text AS prm,
    NULL::text AS identite_client,
    ct.derniere_consent_timestamp AS timestamp_utc,
    NULL::inet AS adresse_ip,
    NULL::text AS user_agent,
    NULL::text AS version_politique,
    CASE 
      WHEN api_call_timestamps.premier_appel_api_timestamp IS NULL THEN 'NO_API_CALL'
      WHEN ct.derniere_consent_timestamp < api_call_timestamps.premier_appel_api_timestamp THEN 'VALID'
      ELSE 'INVALID_CHRONOLOGY'
    END::text AS statut,
    NULL::text AS hash_sha256,
    jsonb_build_object(
      'timestamp_premier_appel_api', api_call_timestamps.premier_appel_api_timestamp,
      'timestamp_dernier_appel_api', api_call_timestamps.dernier_appel_api_timestamp,
      'nombre_appels_api', api_call_timestamps.nombre_appels_api,
      'ecart_secondes', EXTRACT(EPOCH FROM (api_call_timestamps.premier_appel_api_timestamp - ct.derniere_consent_timestamp)),
      'message', CASE 
        WHEN ct.derniere_consent_timestamp < api_call_timestamps.premier_appel_api_timestamp 
        THEN 'Conforme : consentement précède tous les appels API'
        WHEN api_call_timestamps.premier_appel_api_timestamp IS NULL
        THEN 'Aucun appel API effectué'
        ELSE 'NON CONFORME : appel API avant consentement'
      END
    ) AS details
  FROM consent_timestamps ct
  LEFT JOIN api_call_timestamps ON ct.prm_number = api_call_timestamps.prm_number
  ORDER BY ct.prm_number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_audit_report_for_prms(text[]) TO authenticated;

-- Update generate_csv_audit_report to not use views
DROP FUNCTION IF EXISTS generate_csv_audit_report(text[]);

CREATE OR REPLACE FUNCTION generate_csv_audit_report(
  prm_list text[] DEFAULT NULL
) RETURNS TABLE (
  section text,
  ligne_csv text
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY SELECT 
    'CONSENTEMENTS'::text,
    'PRM,Identité Client,Timestamp UTC Serveur,Adresse IP,User Agent,Version Politique,Statut,Hash SHA-256,Raison Sociale,SIRET'::text;
  
  RETURN QUERY
  SELECT 
    'CONSENTEMENTS'::text,
    ce.prm_number || ',' ||
    COALESCE((ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text, '') || ',' ||
    ce.server_timestamp_utc::text || ',' ||
    COALESCE(host(ce.ip_address), '') || ',' ||
    COALESCE(ce.user_agent, '') || ',' ||
    COALESCE(pv.version, '') || ',' ||
    ce.event_type || ',' ||
    ce.event_hash || ',' ||
    COALESCE((ce.identity_client->>'raison_sociale')::text, '') || ',' ||
    COALESCE((ce.identity_client->>'siret')::text, '') AS ligne_csv
  FROM consent_events ce
  LEFT JOIN policy_versions pv ON ce.policy_version_id = pv.id
  WHERE (prm_list IS NULL OR ce.prm_number = ANY(prm_list))
    AND ce.event_type IN ('CREATION', 'REACTIVATION')
  ORDER BY ce.server_timestamp_utc DESC;
  
  RETURN QUERY SELECT ''::text, ''::text;
  RETURN QUERY SELECT 
    'REVOCATIONS'::text,
    'PRM,Identité Client,Timestamp Révocation UTC,Adresse IP,User Agent,Raison,Hash SHA-256'::text;
  
  RETURN QUERY
  SELECT 
    'REVOCATIONS'::text,
    ce.prm_number || ',' ||
    COALESCE((ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text, '') || ',' ||
    ce.server_timestamp_utc::text || ',' ||
    COALESCE(host(ce.ip_address), '') || ',' ||
    COALESCE(ce.user_agent, '') || ',' ||
    COALESCE((ce.metadata->>'revocation_reason')::text, '') || ',' ||
    ce.event_hash AS ligne_csv
  FROM consent_events ce
  WHERE (prm_list IS NULL OR ce.prm_number = ANY(prm_list))
    AND ce.event_type IN ('REVOCATION', 'PRM_REVOKED', 'CONSENT_REVOKED')
  ORDER BY ce.server_timestamp_utc DESC;
  
  RETURN QUERY SELECT ''::text, ''::text;
  RETURN QUERY SELECT 
    'COHERENCE'::text,
    'PRM,Timestamp Consentement UTC,Timestamp Premier Appel API UTC,Nombre Appels API,Écart (secondes),Statut Conformité,Message'::text;
  
  RETURN QUERY
  WITH consent_timestamps AS (
    SELECT 
      prm_number,
      MAX(server_timestamp_utc) FILTER (WHERE event_type = 'CREATION' AND consent_given = true) AS derniere_consent_timestamp
    FROM consent_events
    WHERE prm_list IS NULL OR prm_number = ANY(prm_list)
    GROUP BY prm_number
  ),
  api_call_timestamps AS (
    SELECT 
      prm_number,
      MIN(server_timestamp_utc) AS premier_appel_api_timestamp,
      MAX(server_timestamp_utc) AS dernier_appel_api_timestamp,
      COUNT(*) AS nombre_appels_api
    FROM enedis_api_calls
    WHERE prm_list IS NULL OR prm_number = ANY(prm_list)
    GROUP BY prm_number
  )
  SELECT 
    'COHERENCE'::text,
    ct.prm_number || ',' ||
    COALESCE(ct.derniere_consent_timestamp::text, '') || ',' ||
    COALESCE(at.premier_appel_api_timestamp::text, '') || ',' ||
    COALESCE(at.nombre_appels_api::text, '0') || ',' ||
    COALESCE(EXTRACT(EPOCH FROM (at.premier_appel_api_timestamp - ct.derniere_consent_timestamp))::text, '') || ',' ||
    CASE 
      WHEN at.premier_appel_api_timestamp IS NULL THEN 'NO_API_CALL'
      WHEN ct.derniere_consent_timestamp < at.premier_appel_api_timestamp THEN 'VALID'
      ELSE 'INVALID_CHRONOLOGY'
    END || ',' ||
    CASE 
      WHEN ct.derniere_consent_timestamp < at.premier_appel_api_timestamp 
      THEN 'Conforme : consentement précède tous les appels API'
      WHEN at.premier_appel_api_timestamp IS NULL
      THEN 'Aucun appel API effectué'
      ELSE 'NON CONFORME : appel API avant consentement'
    END AS ligne_csv
  FROM consent_timestamps ct
  LEFT JOIN api_call_timestamps at ON ct.prm_number = at.prm_number
  ORDER BY ct.prm_number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION generate_csv_audit_report(text[]) TO authenticated;
