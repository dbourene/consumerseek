/*
  # Add declarant_role column to prm table

  1. Changes to prm table
    - Add declarant_role: Role of the declarant for THIS specific PRM
      (TITULAIRE, REPRESENTANT_LEGAL, or MANDATAIRE)
    - This allows the same person to have different roles for different PRMs

  2. Important Notes
    - A person can be TITULAIRE for one PRM and MANDATAIRE for another
    - This field is specific to each PRM, not to the global authorization
    - The global authorization (autorisations_communication) has a declarant_role
      that represents the overall role, but each PRM can have its own specific role

  3. Security
    - RLS policies already exist for prm table
*/

-- Add declarant_role column to prm table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prm' AND column_name = 'declarant_role'
  ) THEN
    ALTER TABLE prm 
    ADD COLUMN declarant_role text CHECK (declarant_role IN ('TITULAIRE', 'REPRESENTANT_LEGAL', 'MANDATAIRE'));
  END IF;
END $$;

-- Add index for performance on declarant_role lookups
CREATE INDEX IF NOT EXISTS idx_prm_declarant_role ON prm(declarant_role);

-- Add comment to document the field
COMMENT ON COLUMN prm.declarant_role IS 'Role of the declarant for this specific PRM: TITULAIRE (holder), REPRESENTANT_LEGAL (legal representative), or MANDATAIRE (proxy). This can be different for each PRM under the same authorization.';