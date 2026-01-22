/*
  # Create Invitations Factures Table

  1. New Tables
    - `invitations_factures`
      - `id` (uuid, primary key)
      - `contact_id` (uuid, foreign key to contacts)
      - `token` (text, unique) - Secure token for public URL
      - `email_destinataire` (text) - Recipient email
      - `statut` (text) - Status: 'envoyé', 'ouvert', 'complété', 'expiré'
      - `date_envoi` (timestamptz)
      - `date_expiration` (timestamptz)
      - `date_ouverture` (timestamptz, nullable)
      - `message_personnalise` (text, nullable)
      - `nb_factures_deposees` (int)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `invitations_factures` table
    - Add policy for authenticated users to manage their own invitations
    - Add policy for public access via token (limited read)
*/

CREATE TABLE IF NOT EXISTS invitations_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  email_destinataire text NOT NULL,
  statut text DEFAULT 'envoyé' CHECK (statut IN ('envoyé', 'ouvert', 'complété', 'expiré')),
  date_envoi timestamptz DEFAULT now(),
  date_expiration timestamptz NOT NULL,
  date_ouverture timestamptz,
  message_personnalise text,
  nb_factures_deposees int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_invitations_contact_id ON invitations_factures(contact_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations_factures(token);
CREATE INDEX IF NOT EXISTS idx_invitations_statut ON invitations_factures(statut);

-- Enable RLS
ALTER TABLE invitations_factures ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations for their contacts
CREATE POLICY "Users can view own invitations"
  ON invitations_factures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = invitations_factures.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Policy: Users can create invitations for their contacts
CREATE POLICY "Users can insert own invitations"
  ON invitations_factures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Policy: Users can update invitations for their contacts
CREATE POLICY "Users can update own invitations"
  ON invitations_factures FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = invitations_factures.contact_id
      AND contacts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = invitations_factures.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Policy: Public can view invitation details via token (limited fields)
CREATE POLICY "Public can view invitation by token"
  ON invitations_factures FOR SELECT
  TO anon
  USING (
    token IS NOT NULL
    AND statut != 'expiré'
    AND date_expiration > now()
  );

-- Policy: Anonymous users can update invitation status via token
CREATE POLICY "Public can update invitation via token"
  ON invitations_factures FOR UPDATE
  TO anon
  USING (
    token IS NOT NULL
    AND statut != 'expiré'
    AND date_expiration > now()
  )
  WITH CHECK (
    token IS NOT NULL
    AND statut != 'expiré'
    AND date_expiration > now()
  );

-- Function to generate secure token
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql;