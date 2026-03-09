/*
  # Add autorisation_id foreign key to prm table

  1. Changes to prm table
    - Add autorisation_id: Foreign key linking PRM to its authorization
    - A PRM can have only ONE authorization
    - An authorization can cover MULTIPLE PRMs
    - This is a one-to-many relationship: autorisation (1) -> prm (N)

  2. Security
    - RLS policies already exist for prm table
*/

-- Add autorisation_id column to prm table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prm' AND column_name = 'autorisation_id'
  ) THEN
    ALTER TABLE prm 
    ADD COLUMN autorisation_id uuid REFERENCES autorisations_communication(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for performance on autorisation_id lookups
CREATE INDEX IF NOT EXISTS idx_prm_autorisation_id ON prm(autorisation_id);

-- Add comment to document the relationship
COMMENT ON COLUMN prm.autorisation_id IS 'Foreign key to autorisations_communication. A PRM has ONE authorization, an authorization can cover MULTIPLE PRMs (1:N relationship)';
