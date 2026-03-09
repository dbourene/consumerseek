/*
  # Add Company Information Fields to Contacts Table

  1. Changes
    - Add `adresse` (text) - Company address
    - Add `code_postal` (text) - Postal code
    - Add `ville` (text) - City
    - Add `siret` (text) - SIRET number
    - Add `statut_commande` (text) - Order status (Non contacté, En cours, Devis envoyé, etc.)
    - Add `commentaires` (text) - Comments and notes

  2. Notes
    - All new fields are nullable to maintain backward compatibility
    - Default value for statut_commande is 'Non contacté'
    - Index added on siret for potential lookup performance
*/

-- Add company information fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'adresse'
  ) THEN
    ALTER TABLE contacts ADD COLUMN adresse text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'code_postal'
  ) THEN
    ALTER TABLE contacts ADD COLUMN code_postal text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'ville'
  ) THEN
    ALTER TABLE contacts ADD COLUMN ville text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'siret'
  ) THEN
    ALTER TABLE contacts ADD COLUMN siret text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'statut_commande'
  ) THEN
    ALTER TABLE contacts ADD COLUMN statut_commande text DEFAULT 'Non contacté';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'commentaires'
  ) THEN
    ALTER TABLE contacts ADD COLUMN commentaires text;
  END IF;
END $$;

-- Add index on SIRET for potential lookups
CREATE INDEX IF NOT EXISTS idx_contacts_siret ON contacts(siret) WHERE siret IS NOT NULL;
