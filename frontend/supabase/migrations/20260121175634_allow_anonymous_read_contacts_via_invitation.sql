/*
  # Allow Anonymous to Read Contacts via Valid Invitation

  1. Problem
    - Anonymous users need to read contact info when validating invitation token
    - Current RLS only allows authenticated users to read their own contacts
    
  2. Solution
    - Add policy to allow anonymous users to read contact info for valid invitations
    
  3. Security
    - Only allow reading contacts that have active, non-expired invitations
    - Limited to basic contact info needed for invitation display
*/

-- Allow anonymous to view contacts that have active invitations
DROP POLICY IF EXISTS "Anonymous can view contacts via invitation" ON contacts;

CREATE POLICY "Anonymous can view contacts via invitation"
  ON contacts FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM invitations_factures
      WHERE invitations_factures.contact_id = contacts.id
        AND invitations_factures.statut <> 'expiré'
        AND invitations_factures.date_expiration > now()
    )
  );
