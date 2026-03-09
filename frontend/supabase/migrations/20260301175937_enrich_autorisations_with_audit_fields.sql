/*
  # Enrich autorisations_communication with audit tracking fields

  1. Changes to autorisations_communication table
    - Add declarant_role: Role of the person giving consent (TITULAIRE, REPRESENTANT_LEGAL, MANDATAIRE)
    - Add declarant_nom: Last name of the person giving consent
    - Add declarant_prenom: First name of the person giving consent
    - Add declarant_email: Email of the person giving consent
    - Add declarant_telephone: Phone of the person giving consent
    - Add processing_stopped_at: Timestamp when data processing stopped (auto-filled on revocation)
    - Add anonymization_scheduled_at: Timestamp when anonymization is scheduled (auto: J+24 months after revocation)
    - Add access_after_revocation_flag: Boolean flag tracking if data was accessed after revocation
    - Add last_access_attempt_at: Timestamp of the last access attempt (for audit)
    - Add access_blocked_count: Counter of blocked access attempts after revocation

  2. Audit triggers
    - Trigger to automatically set processing_stopped_at when revocation_timestamp is set
    - Trigger to automatically calculate anonymization_scheduled_at (revocation + 24 months)
    
  3. Security
    - RLS policies already exist for autorisations_communication
*/

-- Add new columns to autorisations_communication
DO $$ 
BEGIN
  -- Declarant information
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'declarant_role'
  ) THEN
    ALTER TABLE autorisations_communication 
    ADD COLUMN declarant_role text CHECK (declarant_role IN ('TITULAIRE', 'REPRESENTANT_LEGAL', 'MANDATAIRE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'declarant_nom'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN declarant_nom text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'declarant_prenom'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN declarant_prenom text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'declarant_email'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN declarant_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'declarant_telephone'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN declarant_telephone text;
  END IF;

  -- Processing and anonymization tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'processing_stopped_at'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN processing_stopped_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'anonymization_scheduled_at'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN anonymization_scheduled_at timestamptz;
  END IF;

  -- Access after revocation tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'access_after_revocation_flag'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN access_after_revocation_flag boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'last_access_attempt_at'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN last_access_attempt_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'autorisations_communication' AND column_name = 'access_blocked_count'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN access_blocked_count integer DEFAULT 0;
  END IF;
END $$;

-- Create trigger function to auto-fill processing_stopped_at and anonymization_scheduled_at on revocation
CREATE OR REPLACE FUNCTION handle_autorisation_revocation()
RETURNS trigger AS $$
BEGIN
  -- When revocation_timestamp is set (going from NULL to a value)
  IF NEW.revocation_timestamp IS NOT NULL AND OLD.revocation_timestamp IS NULL THEN
    -- Set processing_stopped_at to the revocation timestamp
    NEW.processing_stopped_at = NEW.revocation_timestamp;
    
    -- Set anonymization_scheduled_at to 24 months after revocation
    NEW.anonymization_scheduled_at = NEW.revocation_timestamp + INTERVAL '24 months';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_autorisation_revocation ON autorisations_communication;

CREATE TRIGGER trigger_autorisation_revocation
  BEFORE UPDATE ON autorisations_communication
  FOR EACH ROW
  EXECUTE FUNCTION handle_autorisation_revocation();

-- Add comment to document the audit fields
COMMENT ON COLUMN autorisations_communication.declarant_role IS 'Role of the person giving consent: TITULAIRE (holder), REPRESENTANT_LEGAL (legal representative), or MANDATAIRE (proxy)';
COMMENT ON COLUMN autorisations_communication.processing_stopped_at IS 'Timestamp when data processing stopped (automatically set to revocation_timestamp when consent is revoked)';
COMMENT ON COLUMN autorisations_communication.anonymization_scheduled_at IS 'Timestamp when anonymization is scheduled (automatically set to revocation_timestamp + 24 months)';
COMMENT ON COLUMN autorisations_communication.access_after_revocation_flag IS 'Flag indicating if data was accessed after consent revocation (for audit purposes)';
COMMENT ON COLUMN autorisations_communication.last_access_attempt_at IS 'Timestamp of the last access attempt to this authorization data';
COMMENT ON COLUMN autorisations_communication.access_blocked_count IS 'Counter of blocked access attempts after revocation';
