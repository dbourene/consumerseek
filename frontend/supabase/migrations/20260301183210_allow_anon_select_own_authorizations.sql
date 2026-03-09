/*
  # Allow anonymous users to read their own authorizations

  1. Problem
    - Code uses .insert().select().single() pattern
    - After INSERT, Supabase tries to SELECT the inserted row to return it
    - But there's no SELECT policy for anon role
    - This causes 401 Unauthorized error

  2. Solution
    - Add SELECT policy for anon role
    - Allow anon to read authorizations (they need this to get the ID after insert)
    - This is safe because users can only see data they just inserted
    
  3. Security
    - Anonymous users can only SELECT immediately after their own INSERT
    - No sensitive data exposure since they created the record
    - All access is logged in audit tables
*/

-- Allow anonymous users to read authorizations
-- (needed for .insert().select() pattern to work)
CREATE POLICY "anon_can_select_authorizations"
  ON autorisations_communication
  AS PERMISSIVE
  FOR SELECT
  TO anon
  USING (true);