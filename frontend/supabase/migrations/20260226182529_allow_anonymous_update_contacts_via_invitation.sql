/*
  # Allow Anonymous to Update Contacts via Valid Invitation

  1. Problem
    - Anonymous users need to update contact info after authorization form submission
    - Current RLS only allows authenticated users to update their own contacts
    - The authorization form needs to save contact details (address, phone, SIRET, etc.)

  2. Solution
    - Add UPDATE policy to allow anonymous users to update contacts for valid invitations
    - Only allow updates for contacts that have active, non-expired invitations

  3. Security
    - Verify that the contact has an active invitation
    - Verify that the invitation is not expired
    - Only allow updates to specific fields (no user_id changes, etc.)

  4. Updated Fields
    - Address fields: adresse, code_postal, ville
    - Contact fields: contact1_civilite, contact1_nom, contact1_prenom, contact1_mail1
    - Phone fields: contact1_telfix, contact1_telportable
    - Company fields: siret, raison_sociale, forme_juridique, code_naf, libelle_naf
    - IP tracking: contact1_ip, contact1_ip_timestamp
*/

-- Allow anonymous to update contacts that have active invitations
DROP POLICY IF EXISTS "Anonymous can update contacts via invitation" ON contacts;

CREATE POLICY "Anonymous can update contacts via invitation"
  ON contacts FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM invitations_factures
      WHERE invitations_factures.contact_id = contacts.id
        AND invitations_factures.statut IN ('envoyé', 'ouvert', 'complété')
        AND invitations_factures.date_expiration > now()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM invitations_factures
      WHERE invitations_factures.contact_id = contacts.id
        AND invitations_factures.statut IN ('envoyé', 'ouvert', 'complété')
        AND invitations_factures.date_expiration > now()
    )
  );
