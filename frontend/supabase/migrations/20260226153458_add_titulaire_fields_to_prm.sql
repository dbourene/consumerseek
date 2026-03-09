/*
  # Add titulaire fields to PRM table

  1. Changes
    - Add `titulaire_type` column to distinguish between particulier/professionnel
    - Add `titulaire_forme_juridique` column for professional legal form

  2. New Columns
    - `titulaire_type` (text) - Type of holder: 'particulier' or 'professionnel'
    - `titulaire_forme_juridique` (text) - Legal form for professionals (SARL, SAS, etc.)

  3. Important Notes
    - These fields help distinguish between individual and business holders
    - titulaire_forme_juridique is typically populated from SIRENE API when titulaire_siret is provided
    - titulaire_type defaults to 'professionnel' for consistency with existing business-focused data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prm' AND column_name = 'titulaire_type'
  ) THEN
    ALTER TABLE prm ADD COLUMN titulaire_type text DEFAULT 'professionnel';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prm' AND column_name = 'titulaire_forme_juridique'
  ) THEN
    ALTER TABLE prm ADD COLUMN titulaire_forme_juridique text;
  END IF;
END $$;