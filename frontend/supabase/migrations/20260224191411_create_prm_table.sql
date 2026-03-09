/*
  # Create PRM (Point de Référence et de Mesure) table

  1. New Tables
    - `prm`
      - `id` (uuid, primary key) - Unique identifier for the PRM record
      - `contact_id` (uuid, foreign key) - Reference to the contact owning this PRM
      - `prm_numero` (text) - The actual PRM number (point delivery identifier)
      - `entreprise` (text) - Company name
      - `titulaire_adresse` (text) - Holder's address
      - `titulaire_code_postal` (text) - Holder's postal code
      - `titulaire_ville` (text) - Holder's city
      - `titulaire_siret` (text) - Holder's SIRET number
      - `titulaire_code_naf` (text) - Holder's NAF code
      - `titulaire_civilite` (text) - Holder's title (M./Mme/etc.)
      - `titulaire_prenom` (text) - Holder's first name
      - `titulaire_nom` (text) - Holder's last name
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record last update timestamp

  2. Security
    - Enable RLS on `prm` table
    - Add policy for authenticated users to read their own PRMs
    - Add policy for authenticated users to insert their own PRMs
    - Add policy for authenticated users to update their own PRMs
    - Add policy for authenticated users to delete their own PRMs

  3. Important Notes
    - A contact can have multiple PRMs (subsidiaries, SIRET, personal name)
    - Users can only access PRMs linked to their own contacts
    - Foreign key constraint ensures data integrity with contacts table
*/

CREATE TABLE IF NOT EXISTS prm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  prm_numero text,
  entreprise text,
  titulaire_adresse text,
  titulaire_code_postal text,
  titulaire_ville text,
  titulaire_siret text,
  titulaire_code_naf text,
  titulaire_civilite text,
  titulaire_prenom text,
  titulaire_nom text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE prm ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own PRMs (via contact ownership)
CREATE POLICY "Users can read own PRMs"
  ON prm
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = prm.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Policy: Users can insert PRMs for their own contacts
CREATE POLICY "Users can insert own PRMs"
  ON prm
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = prm.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Policy: Users can update their own PRMs
CREATE POLICY "Users can update own PRMs"
  ON prm
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = prm.contact_id
      AND contacts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = prm.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Policy: Users can delete their own PRMs
CREATE POLICY "Users can delete own PRMs"
  ON prm
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = prm.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Create index for faster lookups by contact_id
CREATE INDEX IF NOT EXISTS idx_prm_contact_id ON prm(contact_id);

-- Create index for faster lookups by prm_numero
CREATE INDEX IF NOT EXISTS idx_prm_numero ON prm(prm_numero);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_prm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_prm_updated_at
  BEFORE UPDATE ON prm
  FOR EACH ROW
  EXECUTE FUNCTION update_prm_updated_at();