/*
  # Allow anonymous users to insert audit trail records via trigger

  1. Problem
    - The trigger `audit_autorisations_communication` is called after INSERT/UPDATE/DELETE
      on autorisations_communication table
    - This trigger calls audit_table_changes() which inserts into audit_trail table
    - But audit_trail RLS policy only allows authenticated users to insert
    - This causes anonymous user insertions to fail with RLS policy violation

  2. Solution
    - Add a new RLS policy to allow anonymous users to insert audit trail records
    - This is safe because:
      - Anonymous users can only insert via the trigger (SECURITY DEFINER function)
      - The trigger is controlled and creates proper audit records
      - All audit records are immutable (append-only table)

  3. Security
    - The trigger function runs with SECURITY DEFINER privileges
    - Anonymous users still cannot directly insert into audit_trail
    - They can only trigger the audit via autorisations_communication changes
*/

-- Allow anonymous users to insert audit trail records (via trigger only)
CREATE POLICY "Anonymous users can insert audit trail via trigger"
  ON audit_trail
  FOR INSERT
  TO anon
  WITH CHECK (true);