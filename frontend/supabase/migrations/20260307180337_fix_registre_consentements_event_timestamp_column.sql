/*
  # Fix get_registre_consentements function - correct column name

  1. Changes
    - Fix reference to ce.event_timestamp → ce.server_timestamp_utc
    - The consent_events table uses server_timestamp_utc, not event_timestamp
*/

DROP FUNCTION IF EXISTS get_registre_consentements();

CREATE OR REPLACE FUNCTION get_registre_consentements()
RETURNS TABLE (
  authorization_id text,
  prm text,
  consent_status text,
  consent_timestamp text,
  declarant_type text,
  declarant_identity text,
  declarant_email text,
  declarant_phone text,
  declarant_role text,
  mandate_declared text,
  titulaire_identity text,
  titulaire_type text,
  legal_basis text,
  rgpd_version text,
  privacy_policy_version text,
  consent_hash text,
  ip_address text,
  user_agent text,
  source text,
  created_at text,
  revoked_at text,
  revocation_reason text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.autorisation_id::text,
    p.prm_numero::text,
    -- PRM status takes precedence over authorization status
    CASE 
      WHEN p.statut = 'REVOKED' THEN 'REVOKED'
      WHEN ac.consent_status = 'REVOKED' THEN 'REVOKED'
      ELSE COALESCE(ac.consent_status, 'ACTIVE')
    END::text as consent_status,
    COALESCE(ac.date_autorisation::text, '')::text,
    COALESCE(ac.type_titulaire, 'particulier')::text,
    CONCAT(COALESCE(ac.civilite, ''), ' ', COALESCE(ac.prenom, ''), ' ', COALESCE(ac.nom, ''))::text,
    COALESCE(ac.email, '')::text,
    COALESCE(ac.telephone, '')::text,
    COALESCE(ac.declarant_role, COALESCE(p.declarant_role, 'TITULAIRE'))::text,
    CASE WHEN COALESCE(ac.declarant_role, p.declarant_role) IS NOT NULL 
         AND COALESCE(ac.declarant_role, p.declarant_role) != 'TITULAIRE' 
    THEN 'true' ELSE 'false' END::text,
    CASE 
      WHEN ac.type_titulaire = 'professionnel' THEN COALESCE(p.titulaire_raison_sociale, ac.raison_sociale, '')
      ELSE CONCAT(COALESCE(p.titulaire_civilite, ac.civilite, ''), ' ', 
                  COALESCE(p.titulaire_prenom, ac.prenom, ''), ' ', 
                  COALESCE(p.titulaire_nom, ac.nom, ''))
    END::text,
    COALESCE(p.titulaire_type, ac.type_titulaire, 'particulier')::text,
    'CONSENTEMENT_ECLAIRE'::text,
    COALESCE(pv.version, 'V1')::text,
    COALESCE(pv.version, 'V1')::text,
    COALESCE(ac.consent_text_hash, '')::text,
    COALESCE(ac.ip_address::text, '')::text,
    COALESCE(ac.user_agent, '')::text,
    'FORMULAIRE_WEB'::text,
    COALESCE(ac.created_at::text, '')::text,
    -- Show revocation date from PRM or authorization (whichever is revoked)
    COALESCE(p.revoked_at::text, ac.revoked_at::text, '')::text,
    -- Get revocation reason from consent_events (fixed column name)
    COALESCE(
      (SELECT ce.metadata->>'revocation_reason' 
       FROM consent_events ce 
       WHERE ce.prm_id = p.id 
         AND ce.event_type IN ('PRM_REVOKED', 'CONSENT_REVOKED', 'REVOCATION')
       ORDER BY ce.server_timestamp_utc DESC 
       LIMIT 1),
      ac.revocation_reason,
      ''
    )::text
  FROM prm p
  LEFT JOIN autorisations_communication ac ON p.autorisation_id = ac.id
  LEFT JOIN policy_versions pv ON ac.policy_version_id = pv.id
  WHERE p.autorisation_id IS NOT NULL
  ORDER BY ac.date_autorisation DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_registre_consentements() TO authenticated;