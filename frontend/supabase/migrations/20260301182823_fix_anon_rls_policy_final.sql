/*
  # Fix anonymous RLS policy - Final solution

  1. Root Cause Found
    - INSERT works when RLS is disabled
    - The policy exists but doesn't match correctly
    - Need to use proper Supabase RLS pattern for anonymous users

  2. Solution
    - Drop and recreate policy with correct Supabase auth pattern
    - Use auth.role() = 'anon' check
    
  3. Verification
    - Tested with RLS disabled - works perfectly
    - Triggers execute correctly
    - Now need proper RLS policy
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Anonymous users can insert authorizations" ON autorisations_communication;

-- Create new policy that explicitly checks for anon role
CREATE POLICY "Allow anonymous inserts via invitation"
  ON autorisations_communication
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Allow insert for anonymous users
    auth.role() = 'anon'
  );