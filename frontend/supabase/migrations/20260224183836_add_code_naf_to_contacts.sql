/*
  # Add Code NAF Field to Contacts Table

  1. Changes
    - Add `code_naf` (text) - NAF/APE code from SIRENE API (e.g., "62.01Z")
    - Add `libelle_naf` (text) - NAF/APE label description

  2. Notes
    - Both fields are nullable for backward compatibility
    - Index added on code_naf for filtering and reporting
*/

-- Add NAF code fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'code_naf'
  ) THEN
    ALTER TABLE contacts ADD COLUMN code_naf text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'libelle_naf'
  ) THEN
    ALTER TABLE contacts ADD COLUMN libelle_naf text;
  END IF;
END $$;

-- Add index on code_naf for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_code_naf ON contacts(code_naf) WHERE code_naf IS NOT NULL;
