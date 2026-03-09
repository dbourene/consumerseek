/*
  # Vues et fonctions d'export pour audit Enedis

  1. Vue `v_consent_audit_export`
    - Export formaté pour audit Enedis
    - Tous les consentements avec métadonnées critiques

  2. Vue `v_revocations_audit_export`
    - Export des révocations uniquement

  3. Vue `v_chronological_consistency_audit`
    - Vérification que consent_timestamp < api_call_timestamp pour tous les PRMs

  4. Fonction `get_audit_report_for_prms(prm_list)`
    - Export complet filtré par liste de PRMs
    - Prêt pour Excel/CSV

  5. Fonction `get_consent_proof_for_prm(prm)`
    - Preuve complète pour un PRM donné
    - Consent + API calls + chronologie
*/

-- Vue 1 : Export des consentements pour audit Enedis
CREATE OR REPLACE VIEW v_consent_audit_export AS
SELECT 
  ce.prm_number AS prm,
  (ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text AS identite_client,
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

-- Vue 2 : Export des révocations uniquement
CREATE OR REPLACE VIEW v_revocations_audit_export AS
SELECT 
  ce.prm_number AS prm,
  (ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text AS identite_client,
  ce.server_timestamp_utc AS timestamp_revocation_utc,
  ce.ip_address AS adresse_ip_revocation,
  ce.user_agent AS navigateur_revocation,
  (ce.metadata->>'revocation_reason')::text AS raison_revocation,
  ce.event_hash AS hash_evenement_revocation_sha256,
  ce.created_at AS date_creation_log
FROM consent_events ce
WHERE ce.event_type = 'REVOCATION'
ORDER BY ce.server_timestamp_utc DESC;

-- Vue 3 : Cohérence chronologique consent < api_call
CREATE OR REPLACE VIEW v_chronological_consistency_audit AS
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
  ct.prm_number AS prm,
  ct.derniere_consent_timestamp AS timestamp_consentement_utc,
  at.premier_appel_api_timestamp AS timestamp_premier_appel_api_utc,
  at.dernier_appel_api_timestamp AS timestamp_dernier_appel_api_utc,
  at.nombre_appels_api,
  CASE 
    WHEN at.premier_appel_api_timestamp IS NULL THEN 'NO_API_CALL'
    WHEN ct.derniere_consent_timestamp < at.premier_appel_api_timestamp THEN 'VALID'
    ELSE 'INVALID_CHRONOLOGY'
  END AS statut_conformite,
  EXTRACT(EPOCH FROM (at.premier_appel_api_timestamp - ct.derniere_consent_timestamp)) AS ecart_secondes,
  CASE 
    WHEN ct.derniere_consent_timestamp < at.premier_appel_api_timestamp 
    THEN 'Conforme : consentement précède tous les appels API'
    WHEN at.premier_appel_api_timestamp IS NULL
    THEN 'Aucun appel API effectué'
    ELSE 'NON CONFORME : appel API avant consentement'
  END AS message_conformite
FROM consent_timestamps ct
LEFT JOIN api_call_timestamps at ON ct.prm_number = at.prm_number
ORDER BY ct.prm_number;

-- Fonction d'export complet pour une liste de PRMs
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
  -- Onglet 1 : Consentements
  RETURN QUERY
  SELECT 
    'CONSENTEMENTS'::text AS onglet,
    ce.prm_number AS prm,
    (ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text AS identite_client,
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
  
  -- Onglet 2 : Révocations
  RETURN QUERY
  SELECT 
    'REVOCATIONS'::text AS onglet,
    ce.prm_number AS prm,
    (ce.identity_client->>'nom')::text || ' ' || (ce.identity_client->>'prenom')::text AS identite_client,
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
    AND ce.event_type = 'REVOCATION'
  ORDER BY ce.server_timestamp_utc DESC;
  
  -- Onglet 3 : Cohérence chronologique
  RETURN QUERY
  SELECT 
    'COHERENCE_CHRONOLOGIQUE'::text AS onglet,
    v.prm AS prm,
    NULL::text AS identite_client,
    v.timestamp_consentement_utc AS timestamp_utc,
    NULL::inet AS adresse_ip,
    NULL::text AS user_agent,
    NULL::text AS version_politique,
    v.statut_conformite AS statut,
    NULL::text AS hash_sha256,
    jsonb_build_object(
      'timestamp_premier_appel_api', v.timestamp_premier_appel_api_utc,
      'timestamp_dernier_appel_api', v.timestamp_dernier_appel_api_utc,
      'nombre_appels_api', v.nombre_appels_api,
      'ecart_secondes', v.ecart_secondes,
      'message', v.message_conformite
    ) AS details
  FROM v_chronological_consistency_audit v
  WHERE v.prm = ANY(prm_list)
  ORDER BY v.prm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour prouver qu'un consentement précède un appel API pour un PRM donné
CREATE OR REPLACE FUNCTION get_consent_proof_for_prm(
  p_prm_number text
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_consent consent_events%ROWTYPE;
  v_first_api_call enedis_api_calls%ROWTYPE;
  v_is_valid boolean;
BEGIN
  -- Récupérer le dernier consentement valide
  SELECT * INTO v_consent
  FROM consent_events
  WHERE prm_number = p_prm_number
    AND event_type = 'CREATION'
    AND consent_given = true
  ORDER BY server_timestamp_utc DESC
  LIMIT 1;
  
  -- Récupérer le premier appel API
  SELECT * INTO v_first_api_call
  FROM enedis_api_calls
  WHERE prm_number = p_prm_number
  ORDER BY server_timestamp_utc ASC
  LIMIT 1;
  
  -- Vérifier la chronologie
  IF v_consent IS NULL THEN
    v_is_valid := false;
  ELSIF v_first_api_call IS NULL THEN
    v_is_valid := true;
  ELSE
    v_is_valid := v_consent.server_timestamp_utc < v_first_api_call.server_timestamp_utc;
  END IF;
  
  -- Construire le résultat JSON
  v_result := jsonb_build_object(
    'prm', p_prm_number,
    'is_valid', v_is_valid,
    'consent', CASE 
      WHEN v_consent IS NOT NULL THEN
        jsonb_build_object(
          'timestamp_utc', v_consent.server_timestamp_utc,
          'event_id', v_consent.id,
          'event_hash', v_consent.event_hash,
          'identity_client', v_consent.identity_client,
          'ip_address', v_consent.ip_address,
          'user_agent', v_consent.user_agent
        )
      ELSE NULL
    END,
    'first_api_call', CASE 
      WHEN v_first_api_call IS NOT NULL THEN
        jsonb_build_object(
          'timestamp_utc', v_first_api_call.server_timestamp_utc,
          'call_id', v_first_api_call.id,
          'endpoint', v_first_api_call.endpoint,
          'success', v_first_api_call.success
        )
      ELSE NULL
    END,
    'time_diff_seconds', CASE 
      WHEN v_consent IS NOT NULL AND v_first_api_call IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (v_first_api_call.server_timestamp_utc - v_consent.server_timestamp_utc))
      ELSE NULL
    END,
    'message', CASE 
      WHEN v_consent IS NULL THEN 'No consent found'
      WHEN v_first_api_call IS NULL THEN 'Valid consent, no API calls yet'
      WHEN v_is_valid THEN 'VALID: Consent precedes API call'
      ELSE 'INVALID: API call precedes consent'
    END
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour générer un rapport CSV complet (prêt pour Excel)
CREATE OR REPLACE FUNCTION generate_csv_audit_report(
  prm_list text[] DEFAULT NULL
) RETURNS TABLE (
  section text,
  ligne_csv text
) AS $$
BEGIN
  -- Header section consentements
  RETURN QUERY SELECT 
    'CONSENTEMENTS'::text,
    'PRM,Identité Client,Timestamp UTC Serveur,Adresse IP,User Agent,Version Politique,Statut,Hash SHA-256,Raison Sociale,SIRET'::text;
  
  -- Data section consentements
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
  
  -- Separator + Header révocations
  RETURN QUERY SELECT ''::text, ''::text;
  RETURN QUERY SELECT 
    'REVOCATIONS'::text,
    'PRM,Identité Client,Timestamp Révocation UTC,Adresse IP,User Agent,Raison,Hash SHA-256'::text;
  
  -- Data section révocations
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
    AND ce.event_type = 'REVOCATION'
  ORDER BY ce.server_timestamp_utc DESC;
  
  -- Separator + Header cohérence
  RETURN QUERY SELECT ''::text, ''::text;
  RETURN QUERY SELECT 
    'COHERENCE'::text,
    'PRM,Timestamp Consentement UTC,Timestamp Premier Appel API UTC,Nombre Appels API,Écart (secondes),Statut Conformité,Message'::text;
  
  -- Data section cohérence
  RETURN QUERY
  SELECT 
    'COHERENCE'::text,
    v.prm || ',' ||
    COALESCE(v.timestamp_consentement_utc::text, '') || ',' ||
    COALESCE(v.timestamp_premier_appel_api_utc::text, '') || ',' ||
    COALESCE(v.nombre_appels_api::text, '0') || ',' ||
    COALESCE(v.ecart_secondes::text, '') || ',' ||
    v.statut_conformite || ',' ||
    v.message_conformite AS ligne_csv
  FROM v_chronological_consistency_audit v
  WHERE (prm_list IS NULL OR v.prm = ANY(prm_list))
  ORDER BY v.prm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;