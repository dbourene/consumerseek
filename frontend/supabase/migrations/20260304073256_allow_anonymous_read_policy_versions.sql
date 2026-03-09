/*
  # Allow anonymous read access to policy versions
  
  1. Changes
    - Add RLS policy to allow anonymous users to read policy_versions
    - This is needed for consent hash calculation in public forms
  
  2. Security
    - Read-only access for public
    - No sensitive data exposed (policy texts are meant to be public)
*/

-- Allow anonymous users to read policy versions (needed for consent hash calculation)
CREATE POLICY "Anonymous users can read policy versions"
  ON policy_versions
  FOR SELECT
  TO anon
  USING (true);

-- Grant table access to anon role
GRANT SELECT ON policy_versions TO anon;
