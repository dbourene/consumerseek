/*
  # Backfill consent_events with historical data (direct insert)
  
  1. Purpose
    - Populate consent_events table with historical authorization data
    - Ensures audit export works for all existing PRMs
    - Direct INSERT to preserve original timestamps
  
  2. Process
    - Get default policy version
    - Direct INSERT into consent_events (bypassing create_consent_event to control timestamps)
    - Creates CREATION and REVOCATION events with original dates
  
  3. Notes
    - Idempotent: won't create duplicates
    - Preserves original timestamps from autorisations_communication
*/

DO $$
DECLARE
  v_policy_version_id uuid;
  v_prm_record RECORD;
  v_autorisation RECORD;
  v_existing_count integer;
  v_event_data jsonb;
  v_event_hash text;
BEGIN
  -- Get or create policy version
  SELECT id INTO v_policy_version_id
  FROM policy_versions
  WHERE policy_code = 'CONSENT_TEXT' AND version = 'V1'
  LIMIT 1;

  IF v_policy_version_id IS NULL THEN
    INSERT INTO policy_versions (policy_code, version, effective_from, policy_text, policy_text_hash)
    VALUES (
      'CONSENT_TEXT',
      'V1',
      '2026-01-01'::timestamptz,
      'Consentement Enedis v1.0',
      encode(sha256('Consentement Enedis v1.0'::bytea), 'hex')
    )
    RETURNING id INTO v_policy_version_id;
  END IF;

  RAISE NOTICE 'Using policy version: %', v_policy_version_id;

  -- Process all PRMs
  FOR v_prm_record IN
    SELECT 
      p.id as prm_id,
      p.prm_numero,
      p.autorisation_id
    FROM prm p
    WHERE p.autorisation_id IS NOT NULL
    ORDER BY p.created_at
  LOOP
    SELECT * INTO v_autorisation
    FROM autorisations_communication
    WHERE id = v_prm_record.autorisation_id;

    IF v_autorisation IS NULL THEN
      CONTINUE;
    END IF;

    -- Check for existing CREATION event
    SELECT COUNT(*) INTO v_existing_count
    FROM consent_events
    WHERE prm_number = v_prm_record.prm_numero
    AND event_type = 'CREATION';

    IF v_existing_count = 0 THEN
      -- Build event data
      v_event_data := jsonb_build_object(
        'event_type', 'CREATION',
        'prm_number', v_prm_record.prm_numero,
        'identity_client', jsonb_build_object(
          'civilite', v_autorisation.civilite,
          'prenom', v_autorisation.prenom,
          'nom', v_autorisation.nom,
          'email', v_autorisation.email,
          'raison_sociale', v_autorisation.raison_sociale,
          'siret', v_autorisation.siret,
          'type_titulaire', v_autorisation.type_titulaire
        ),
        'timestamp_utc', v_autorisation.date_autorisation::text,
        'ip_address', COALESCE(host(v_autorisation.ip_address), '0.0.0.0'),
        'user_agent', COALESCE(v_autorisation.user_agent, 'system-backfill'),
        'policy_version_id', v_policy_version_id::text,
        'consent_text_hash', COALESCE(v_autorisation.consent_text_hash, encode(sha256('legacy'::bytea), 'hex')),
        'consent_given', COALESCE(v_autorisation.consent_rgpd, true),
        'metadata', jsonb_build_object('backfilled', true)
      );

      v_event_hash := encode(sha256(v_event_data::text::bytea), 'hex');

      -- Direct INSERT with original timestamp
      INSERT INTO consent_events (
        event_type,
        autorisation_id,
        prm_id,
        prm_number,
        identity_client,
        server_timestamp_utc,
        ip_address,
        user_agent,
        policy_version_id,
        consent_text_hash,
        consent_given,
        event_data,
        event_hash,
        triggered_by,
        triggered_by_type,
        metadata
      ) VALUES (
        'CREATION',
        v_autorisation.id,
        v_prm_record.prm_id,
        v_prm_record.prm_numero,
        jsonb_build_object(
          'civilite', v_autorisation.civilite,
          'prenom', v_autorisation.prenom,
          'nom', v_autorisation.nom,
          'email', v_autorisation.email,
          'raison_sociale', v_autorisation.raison_sociale,
          'siret', v_autorisation.siret,
          'type_titulaire', v_autorisation.type_titulaire
        ),
        v_autorisation.date_autorisation,
        COALESCE(v_autorisation.ip_address, '0.0.0.0'::inet),
        COALESCE(v_autorisation.user_agent, 'system-backfill'),
        v_policy_version_id,
        COALESCE(v_autorisation.consent_text_hash, encode(sha256('legacy'::bytea), 'hex')),
        COALESCE(v_autorisation.consent_rgpd, true),
        v_event_data,
        v_event_hash,
        NULL,
        'system',
        jsonb_build_object('backfilled', true, 'original_date', v_autorisation.date_autorisation)
      );

      RAISE NOTICE 'Created CREATION event for PRM: %', v_prm_record.prm_numero;
    END IF;

    -- Process REVOCATION if applicable
    IF v_autorisation.revoked_at IS NOT NULL THEN
      SELECT COUNT(*) INTO v_existing_count
      FROM consent_events
      WHERE prm_number = v_prm_record.prm_numero
      AND event_type = 'REVOCATION';

      IF v_existing_count = 0 THEN
        v_event_data := jsonb_build_object(
          'event_type', 'REVOCATION',
          'prm_number', v_prm_record.prm_numero,
          'identity_client', jsonb_build_object(
            'civilite', v_autorisation.civilite,
            'prenom', v_autorisation.prenom,
            'nom', v_autorisation.nom,
            'email', v_autorisation.email,
            'raison_sociale', v_autorisation.raison_sociale,
            'siret', v_autorisation.siret,
            'type_titulaire', v_autorisation.type_titulaire
          ),
          'timestamp_utc', v_autorisation.revoked_at::text,
          'ip_address', COALESCE(host(v_autorisation.ip_address), '0.0.0.0'),
          'user_agent', COALESCE(v_autorisation.user_agent, 'system-backfill'),
          'metadata', jsonb_build_object('revocation_reason', v_autorisation.revocation_reason)
        );

        v_event_hash := encode(sha256(v_event_data::text::bytea), 'hex');

        INSERT INTO consent_events (
          event_type,
          autorisation_id,
          prm_id,
          prm_number,
          identity_client,
          server_timestamp_utc,
          ip_address,
          user_agent,
          policy_version_id,
          consent_text_hash,
          consent_given,
          event_data,
          event_hash,
          triggered_by,
          triggered_by_type,
          metadata
        ) VALUES (
          'REVOCATION',
          v_autorisation.id,
          v_prm_record.prm_id,
          v_prm_record.prm_numero,
          jsonb_build_object(
            'civilite', v_autorisation.civilite,
            'prenom', v_autorisation.prenom,
            'nom', v_autorisation.nom,
            'email', v_autorisation.email,
            'raison_sociale', v_autorisation.raison_sociale,
            'siret', v_autorisation.siret,
            'type_titulaire', v_autorisation.type_titulaire
          ),
          v_autorisation.revoked_at,
          COALESCE(v_autorisation.ip_address, '0.0.0.0'::inet),
          COALESCE(v_autorisation.user_agent, 'system-backfill'),
          v_policy_version_id,
          COALESCE(v_autorisation.consent_text_hash, encode(sha256('legacy'::bytea), 'hex')),
          false,
          v_event_data,
          v_event_hash,
          v_autorisation.revoked_by,
          'system',
          jsonb_build_object(
            'backfilled', true,
            'revocation_reason', v_autorisation.revocation_reason,
            'original_revocation_date', v_autorisation.revoked_at
          )
        );

        RAISE NOTICE 'Created REVOCATION event for PRM: %', v_prm_record.prm_numero;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete!';
END $$;
