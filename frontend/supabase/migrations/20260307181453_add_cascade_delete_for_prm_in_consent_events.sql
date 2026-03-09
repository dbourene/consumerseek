/*
  # Add CASCADE delete for PRM foreign key in consent_events

  1. Changes
    - Drop existing foreign key constraint on consent_events.prm_id
    - Recreate the constraint with ON DELETE CASCADE
    - This allows administrators to delete PRMs and automatically removes related consent_events

  2. Security
    - Maintains audit trail integrity while allowing data cleanup
    - Only authenticated users with proper permissions can delete PRMs
*/

-- Drop existing foreign key constraint
ALTER TABLE consent_events
DROP CONSTRAINT IF EXISTS consent_events_prm_id_fkey;

-- Recreate with CASCADE delete
ALTER TABLE consent_events
ADD CONSTRAINT consent_events_prm_id_fkey
FOREIGN KEY (prm_id)
REFERENCES prm(id)
ON DELETE CASCADE;