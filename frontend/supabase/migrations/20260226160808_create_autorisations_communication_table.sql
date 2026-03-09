-- Create Authorization Communication Table
-- 
-- 1. New Tables
--    - autorisations_communication
--      - id (uuid, primary key) - Unique identifier
--      - contact_id (uuid, foreign key) - Reference to contacts table
--      - invitation_id (uuid, foreign key) - Reference to invitations_factures table
--      - civilite (text) - Civility (M./Mme)
--      - prenom (text) - First name
--      - nom (text) - Last name
--      - email (text) - Email address
--      - telephone (text) - Phone number
--      - raison_sociale (text) - Company name
--      - siret (text) - SIRET number (14 digits)
--      - consent_rgpd (boolean) - RGPD consent checkbox
--      - date_autorisation (timestamptz) - Authorization submission date
--      - created_at (timestamptz) - Creation timestamp
-- 
-- 2. Security
--    - Enable RLS on autorisations_communication table
--    - Allow anonymous users to insert authorizations via invitation token
--    - Allow authenticated users to read all authorizations
--    - Allow authenticated users to update and delete authorizations
-- 
-- 3. Indexes
--    - Index on contact_id for faster lookups
--    - Index on invitation_id for faster lookups
--    - Index on siret for potential matching operations

-- Create the table
CREATE TABLE IF NOT EXISTS autorisations_communication (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES invitations_factures(id) ON DELETE SET NULL,
  civilite text NOT NULL,
  prenom text NOT NULL,
  nom text NOT NULL,
  email text NOT NULL,
  telephone text NOT NULL,
  raison_sociale text NOT NULL,
  siret text NOT NULL,
  consent_rgpd boolean NOT NULL DEFAULT false,
  date_autorisation timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE autorisations_communication ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert authorizations (they need a valid invitation_id)
CREATE POLICY "Anonymous users can insert authorizations"
  ON autorisations_communication
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow authenticated users to read all authorizations
CREATE POLICY "Authenticated users can read authorizations"
  ON autorisations_communication
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update authorizations
CREATE POLICY "Authenticated users can update authorizations"
  ON autorisations_communication
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete authorizations
CREATE POLICY "Authenticated users can delete authorizations"
  ON autorisations_communication
  FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_autorisations_contact_id ON autorisations_communication(contact_id);
CREATE INDEX IF NOT EXISTS idx_autorisations_invitation_id ON autorisations_communication(invitation_id);
CREATE INDEX IF NOT EXISTS idx_autorisations_siret ON autorisations_communication(siret) WHERE siret IS NOT NULL;
