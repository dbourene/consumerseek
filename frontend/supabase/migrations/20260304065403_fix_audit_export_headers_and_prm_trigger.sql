/*
  # Fix audit export headers and add PRM trigger for consent events
  
  1. Changes
    - Update get_registre_consentements to return data with exact header names required
    - Add trigger on PRM table to create consent events when PRMs are inserted
    - Fix trigger logic to run AFTER PRM insert instead of authorization insert
  
  2. Headers Required
    authorization_id, prm, consent_status, consent_timestamp, declarant_type,
    declarant_identity, declarant_email, declarant_phone, declarant_role,
    mandate_declared, titulaire_identity, titulaire_type, legal_basis,
    rgpd_version, privacy_policy_version, consent_hash, ip_address,
    user_agent, source, created_at
*/

-- Disable the old trigger on autorisations_communication
DROP TRIGGER IF EXISTS log_autorisation_creation_trigger ON autorisations_communication;

-- Create new trigger on PRM table instead
CREATE OR REPLACE FUNCTION log_prm_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_policy_version_id uuid;
  v_autorisation RECORD;
BEGIN
  -- Get the authorization details
  SELECT * INTO v_autorisation
  FROM autorisations_communication
  WHERE id = NEW.autorisation_id;

  IF v_autorisation IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get policy version
  v_policy_version_id := v_autorisation.policy_version_id;
  
  IF v_policy_version_id IS NULL THEN
    SELECT id INTO v_policy_version_id
    FROM policy_versions
    WHERE policy_code = 'CONSENT_TEXT' AND version = 'V1'
    LIMIT 1;
  END IF;

  -- Create consent event for this PRM
  PERFORM create_consent_event(
    p_event_type := 'CREATION',
    p_autorisation_id := v_autorisation.id,
    p_prm_id := NEW.id,
    p_prm_number := NEW.prm_numero,
    p_identity_client := jsonb_build_object(
      'civilite', v_autorisation.civilite,
      'prenom', v_autorisation.prenom,
      'nom', v_autorisation.nom,
      'email', v_autorisation.email,
      'raison_sociale', v_autorisation.raison_sociale,
      'siret', v_autorisation.siret,
      'type_titulaire', v_autorisation.type_titulaire
    ),
    p_ip_address := COALESCE(v_autorisation.ip_address, '0.0.0.0'::inet),
    p_user_agent := COALESCE(v_autorisation.user_agent, 'web-form'),
    p_policy_version_id := v_policy_version_id,
    p_consent_text_hash := COALESCE(v_autorisation.consent_text_hash, encode(sha256('v1.0'::bytea), 'hex')),
    p_consent_given := COALESCE(v_autorisation.consent_rgpd, true),
    p_triggered_by := NULL,
    p_triggered_by_type := 'user',
    p_metadata := jsonb_build_object('source', 'prm_creation_trigger')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on PRM table
CREATE TRIGGER log_prm_creation_trigger
AFTER INSERT ON prm
FOR EACH ROW
WHEN (NEW.autorisation_id IS NOT NULL)
EXECUTE FUNCTION log_prm_creation();

-- Recreate get_registre_consentements with exact column mappings
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
    COALESCE(pv.version, 'V1')::text,
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
