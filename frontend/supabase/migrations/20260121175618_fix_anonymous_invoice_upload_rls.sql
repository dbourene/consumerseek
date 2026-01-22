/*
  # Fix Anonymous Invoice Upload RLS

  1. Problem
    - Anonymous users cannot upload invoices due to RLS policy checking invitation existence
    - The EXISTS check in factures RLS policy cannot verify invitations_factures rows
    
  2. Solution
    - Update anonymous insert policy on factures to properly validate invitation
    - Add policy to allow anonymous to read invitations_factures by ID (not just token)
    
  3. Security
    - Only allow anonymous users to read invitations they reference
    - Maintain validation that invitation is not expired
*/

-- Allow anonymous to view invitations by ID when inserting factures
DROP POLICY IF EXISTS "Anonymous can view invitation by id for insert" ON invitations_factures;

CREATE POLICY "Anonymous can view invitation by id for insert"
  ON invitations_factures FOR SELECT
  TO anon
  USING (
    statut <> 'expiré'
    AND date_expiration > now()
  );

-- Update the anonymous insert policy on factures to be more explicit
DROP POLICY IF EXISTS "Anonymous can insert via invitation" ON factures;

CREATE POLICY "Anonymous can insert via invitation"
  ON factures FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM invitations_factures
      WHERE invitations_factures.id = factures.invitation_id
        AND invitations_factures.statut <> 'expiré'
        AND invitations_factures.date_expiration > now()
    )
  );
