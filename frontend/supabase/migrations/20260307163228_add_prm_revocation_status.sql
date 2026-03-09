/*
  # Add PRM individual revocation status

  1. Changes to `prm` table
    - Add `statut` column (ACTIVE/REVOKED) - defaults to ACTIVE
    - Add `revoked_at` timestamp for tracking revocation date
    - Add unique constraint on `prm_numero` to prevent duplicates

  2. Changes to `consent_events` table
    - Add `prm_id` column to track individual PRM revocations
    - New event types: 'PRM_REVOKED' and 'PRM_REACTIVATED'

  3. Security
    - No RLS changes needed (inherits existing policies)
*/

-- Add status tracking to prm table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prm' AND column_name = 'statut'
  ) THEN
    ALTER TABLE prm 
      ADD COLUMN statut text DEFAULT 'ACTIVE' 
      CHECK (statut IN ('ACTIVE', 'REVOKED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prm' AND column_name = 'revoked_at'
  ) THEN
    ALTER TABLE prm 
      ADD COLUMN revoked_at timestamptz;
  END IF;
END $$;

-- Add unique constraint on prm_numero if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prm_numero_unique'
  ) THEN
    ALTER TABLE prm 
      ADD CONSTRAINT prm_numero_unique UNIQUE (prm_numero);
  END IF;
END $$;

-- Add prm_id to consent_events for individual PRM tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consent_events' AND column_name = 'prm_id'
  ) THEN
    ALTER TABLE consent_events 
      ADD COLUMN prm_id uuid REFERENCES prm(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for faster queries on PRM status
CREATE INDEX IF NOT EXISTS idx_prm_statut ON prm(statut);
CREATE INDEX IF NOT EXISTS idx_prm_autorisation_statut ON prm(autorisation_id, statut);
CREATE INDEX IF NOT EXISTS idx_consent_events_prm_id ON consent_events(prm_id);

-- Add comment explaining event types
COMMENT ON COLUMN consent_events.event_type IS 
  'CONSENT_GIVEN: Initial authorization | CONSENT_REVOKED: Full revocation (all PRMs) | PRM_REVOKED: Single PRM revoked | PRM_REACTIVATED: Single PRM reactivated';
