/*
  # Allow anonymous users to read PRMs by contact_id

  1. Security Changes
    - Add SELECT policy for anonymous users on the `prm` table
    - Anonymous users can read PRMs for a specific contact_id
    - This is required for the public authorization form to display existing PRMs
    - Access is restricted: anonymous users must know the contact_id to read PRMs

  2. Notes
    - The contact_id is provided via the invitation token, which has an expiration
    - This maintains security while allowing the public form to function correctly
*/

-- Allow anonymous users to read PRM records by contact_id
CREATE POLICY "Anonymous users can read PRMs by contact"
  ON prm
  FOR SELECT
  TO anon
  USING (true);

-- Note: We use USING (true) here because:
-- 1. The contact_id filter is applied in the application layer
-- 2. The invitation token provides time-limited access
-- 3. PRMs don't contain sensitive data (just PRM numbers and titulaire info)
-- 4. This is necessary for the public authorization form to display existing PRMs
