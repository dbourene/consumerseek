/*
  # Fix consent version header and prepare for hash calculation
  
  1. Changes
    - Rename privacy_policy_version to consent_version in get_registre_consentements
    - Add consent_text_hash column to return type
    - Ensure hash is properly returned from database
  
  2. Headers
    Changed: privacy_policy_version → consent_version
*/

-- Drop and recreate with correct header
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
  consent_version text,
  consent_hash text,
  ip_address text,
  user_agent text,
  source text,
  created_at text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.autorisation_id::text,
    p.prm_numero::text,
    COALESCE(ac.consent_status, 
      CASE WHEN ac.revoked_at IS NULL THEN 'ACTIVE' ELSE 'REVOKED' END
    )::text,
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
    COALESCE(pv.version, 'V1')::text AS consent_version,
    COALESCE(ac.consent_text_hash, '')::text,
    COALESCE(ac.ip_address::text, '')::text,
    COALESCE(ac.user_agent, '')::text,
    'FORMULAIRE_WEB'::text,
    COALESCE(ac.created_at::text, '')::text
  FROM prm p
  LEFT JOIN autorisations_communication ac ON p.autorisation_id = ac.id
  LEFT JOIN policy_versions pv ON ac.policy_version_id = pv.id
  WHERE p.autorisation_id IS NOT NULL
  ORDER BY ac.date_autorisation DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_registre_consentements() TO authenticated;
