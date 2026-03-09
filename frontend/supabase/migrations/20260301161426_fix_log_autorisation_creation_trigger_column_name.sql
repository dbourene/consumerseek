/*
  # Fix log_autorisation_creation trigger to use correct column name

  1. Problem
    - The trigger function `log_autorisation_creation()` references `numero_prm` column
    - The actual column name in the `prm` table is `prm_numero`
    - This causes INSERT failures on `autorisations_communication` table with error:
      "column numero_prm does not exist"

  2. Solution
    - Update the trigger function to use the correct column name `prm_numero`
    - Replace `numero_prm` with `prm_numero` in both SELECT and variable usage

  3. Impact
    - Fixes authorization submission workflow
    - Allows consent events to be created correctly when users submit authorization forms
*/

-- Recreate the trigger function with correct column name
CREATE OR REPLACE FUNCTION log_autorisation_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_policy_version_id uuid;
  v_prm_record RECORD;
BEGIN
  -- Récupérer la version de politique utilisée
  v_policy_version_id := NEW.policy_version_id;
  
  -- Si pas de version, utiliser la version actuelle
  IF v_policy_version_id IS NULL THEN
    SELECT id INTO v_policy_version_id
    FROM policy_versions
    WHERE policy_code = 'CONSENT_TEXT' AND version = 'V1'
    LIMIT 1;
  END IF;
  
  -- Créer un événement pour chaque PRM associé au contact
  -- FIXED: Changed numero_prm to prm_numero (correct column name)
  FOR v_prm_record IN 
    SELECT id, prm_numero
    FROM prm
    WHERE contact_id = NEW.contact_id
  LOOP
    PERFORM create_consent_event(
      p_event_type := 'CREATION',
      p_autorisation_id := NEW.id,
      p_prm_id := v_prm_record.id,
      p_prm_number := v_prm_record.prm_numero,
      p_identity_client := jsonb_build_object(
        'civilite', NEW.civilite,
        'prenom', NEW.prenom,
        'nom', NEW.nom,
        'email', NEW.email,
        'raison_sociale', NEW.raison_sociale,
        'siret', NEW.siret,
        'type_titulaire', NEW.type_titulaire
      ),
      p_ip_address := NEW.ip_address,
      p_user_agent := NEW.user_agent,
      p_policy_version_id := v_policy_version_id,
      p_consent_text_hash := COALESCE(NEW.consent_text_hash, calculate_text_hash('legacy')),
      p_consent_given := NEW.consent_rgpd,
      p_triggered_by := NULL,
      p_triggered_by_type := 'user'
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
