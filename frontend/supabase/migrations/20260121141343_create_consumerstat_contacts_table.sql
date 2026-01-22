/*
  # Create ConsumerStat Contacts Table

  1. New Tables
    - `contacts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users) - Owner of the contact
      - `consommateur_id` (bigint, foreign key to consommateurs, nullable) - Future link
      - `entreprise` (text) - Company name
      - Contact 1 fields (nom, prenom, mail1, mail2, telfix, telportable, civilite, fonction)
      - Contact 2 fields (same structure with contact2_ prefix)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `contacts` table
    - Add policy for authenticated users to manage their own contacts
*/

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  consommateur_id bigint REFERENCES consommateurs(id) ON DELETE SET NULL,
  entreprise text NOT NULL,
  
  -- Contact 1
  contact1_civilite text,
  contact1_nom text NOT NULL,
  contact1_prenom text NOT NULL,
  contact1_mail1 text NOT NULL,
  contact1_mail2 text,
  contact1_telfix text,
  contact1_telportable text,
  contact1_fonction text,
  
  -- Contact 2
  contact2_civilite text,
  contact2_nom text,
  contact2_prenom text,
  contact2_mail1 text,
  contact2_mail2 text,
  contact2_telfix text,
  contact2_telportable text,
  contact2_fonction text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_consommateur_id ON contacts(consommateur_id);
CREATE INDEX IF NOT EXISTS idx_contacts_entreprise ON contacts(entreprise);

-- Enable RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own contacts
CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_contacts_updated_at();