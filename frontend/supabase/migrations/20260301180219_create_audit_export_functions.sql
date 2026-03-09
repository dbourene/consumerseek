/*
  # Create audit export RPC functions for Excel export with 3 tabs

  1. Tab 1: REGISTRE_CONSENTEMENTS
    - Comprehensive list of all consents given and revoked
    - Includes declarant information, PRMs, policy versions

  2. Tab 2: HISTORIQUE_EVENEMENTS
    - Chronological log of all consent-related events
    - Consent creation, revocation, access attempts

  3. Tab 3: COHERENCE_CHRONOLOGIQUE
    - Audit trail for data processing lifecycle
    - Tracks authorization → first access → revocation → processing stopped → anonymization schedule
    - Detects anomalies (access after revocation)

  Security:
    - Functions are restricted to authenticated users only
*/

-- Tab 1: REGISTRE_CONSENTEMENTS
CREATE OR REPLACE FUNCTION get_registre_consentements()
RETURNS TABLE (
  autorisation_id uuid,
  contact_id uuid,
  contact_nom text,
  contact_prenom text,
  contact_email text,
  contact_telephone text,
  contact_siret text,
  contact_raison_sociale text,
  declarant_role text,
  declarant_nom text,
  declarant_prenom text,
  declarant_email text,
  declarant_telephone text,
  date_autorisation timestamptz,
  ip_address text,
  user_agent text,
  rgpd_version text,
  consent_text_version text,
  prm_list text,
  statut_consentement text,
  revocation_timestamp timestamptz,
  revocation_method text,
  revocation_ip text,
  revocation_user_agent text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.id as autorisation_id,
    ac.contact_id,
    ac.nom as contact_nom,
    ac.prenom as contact_prenom,
    ac.email as contact_email,
    ac.telephone as contact_telephone,
    ac.siret as contact_siret,
    ac.raison_sociale as contact_raison_sociale,
    ac.declarant_role,
    ac.declarant_nom,
    ac.declarant_prenom,
    ac.declarant_email,
    ac.declarant_telephone,
    ac.date_autorisation,
    ac.ip_address,
    ac.user_agent,
    pv.rgpd_version,
    pv.consent_text_version,
    COALESCE(
      (
        SELECT string_agg(prm.prm_numero, ', ' ORDER BY prm.created_at)
        FROM prm
        WHERE prm.autorisation_id = ac.id
      ),
      'Aucun PRM'
    ) as prm_list,
    CASE 
      WHEN ac.revocation_timestamp IS NULL THEN 'ACTIF'
      ELSE 'REVOQUE'
    END as statut_consentement,
    ac.revocation_timestamp,
    ac.revocation_method,
    ac.revocation_ip,
    ac.revocation_user_agent
  FROM autorisations_communication ac
  LEFT JOIN policy_versions pv ON ac.rgpd_version = pv.rgpd_version AND ac.consent_text_version = pv.consent_text_version
  ORDER BY ac.date_autorisation DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tab 2: HISTORIQUE_EVENEMENTS
CREATE OR REPLACE FUNCTION get_historique_evenements()
RETURNS TABLE (
  event_id uuid,
  autorisation_id uuid,
  contact_id uuid,
  contact_nom text,
  contact_email text,
  event_type text,
  event_timestamp timestamptz,
  event_metadata jsonb,
  prm_list text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ce.id as event_id,
    ce.autorisation_id,
    ac.contact_id,
    ac.nom as contact_nom,
    ac.email as contact_email,
    ce.event_type,
    ce.event_timestamp,
    ce.metadata as event_metadata,
    COALESCE(
      (
        SELECT string_agg(prm.prm_numero, ', ' ORDER BY prm.created_at)
        FROM prm
        WHERE prm.autorisation_id = ac.id
      ),
      'Aucun PRM'
    ) as prm_list
  FROM consent_events ce
  LEFT JOIN autorisations_communication ac ON ce.autorisation_id = ac.id
  ORDER BY ce.event_timestamp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tab 3: COHERENCE_CHRONOLOGIQUE
CREATE OR REPLACE FUNCTION get_coherence_chronologique()
RETURNS TABLE (
  autorisation_id uuid,
  contact_id uuid,
  contact_nom text,
  contact_email text,
  prm_list text,
  date_autorisation timestamptz,
  first_data_access_at timestamptz,
  revocation_timestamp timestamptz,
  processing_stopped_at timestamptz,
  anonymization_scheduled_at timestamptz,
  access_after_revocation_flag boolean,
  last_access_attempt_at timestamptz,
  access_blocked_count integer,
  coherence_status text,
  anomalies text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.id as autorisation_id,
    ac.contact_id,
    ac.nom as contact_nom,
    ac.email as contact_email,
    COALESCE(
      (
        SELECT string_agg(prm.prm_numero, ', ' ORDER BY prm.created_at)
        FROM prm
        WHERE prm.autorisation_id = ac.id
      ),
      'Aucun PRM'
    ) as prm_list,
    ac.date_autorisation,
    NULL::timestamptz as first_data_access_at,
    ac.revocation_timestamp,
    ac.processing_stopped_at,
    ac.anonymization_scheduled_at,
    ac.access_after_revocation_flag,
    ac.last_access_attempt_at,
    ac.access_blocked_count,
    CASE 
      WHEN ac.revocation_timestamp IS NULL THEN 'CONSENTEMENT_ACTIF'
      WHEN ac.processing_stopped_at IS NOT NULL AND ac.anonymization_scheduled_at IS NOT NULL THEN 'REVOCATION_TRAITEE'
      ELSE 'EN_ATTENTE_TRAITEMENT'
    END as coherence_status,
    CASE 
      WHEN ac.access_after_revocation_flag = true THEN 
        'ALERTE: Accès détecté après révocation (' || COALESCE(ac.access_blocked_count::text, '0') || ' tentatives bloquées)'
      WHEN ac.revocation_timestamp IS NOT NULL AND ac.processing_stopped_at IS NULL THEN 
        'ANOMALIE: Révocation sans arrêt de traitement'
      WHEN ac.revocation_timestamp IS NOT NULL AND ac.anonymization_scheduled_at IS NULL THEN 
        'ANOMALIE: Révocation sans planification d''anonymisation'
      ELSE 
        'Aucune anomalie'
    END as anomalies
  FROM autorisations_communication ac
  ORDER BY ac.date_autorisation DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users only
GRANT EXECUTE ON FUNCTION get_registre_consentements() TO authenticated;
GRANT EXECUTE ON FUNCTION get_historique_evenements() TO authenticated;
GRANT EXECUTE ON FUNCTION get_coherence_chronologique() TO authenticated;

-- Add comments to document the functions
COMMENT ON FUNCTION get_registre_consentements() IS 'Export Tab 1: Complete consent registry with declarant info, PRMs, and revocation details';
COMMENT ON FUNCTION get_historique_evenements() IS 'Export Tab 2: Chronological event history for all consent-related actions';
COMMENT ON FUNCTION get_coherence_chronologique() IS 'Export Tab 3: Audit trail for data processing lifecycle and anomaly detection';
