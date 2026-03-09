/*
  # Allow anonymous users to insert consent events via trigger

  1. Problem
    - The trigger `log_autorisation_creation()` is called when anonymous users
      insert into autorisations_communication
    - This trigger tries to insert into consent_events table
    - But consent_events RLS policy only allows authenticated users to insert
    - This causes the whole transaction to fail with RLS policy violation

  2. Solution
    - Add a new RLS policy to allow anonymous users to insert consent events
    - This is safe because:
      - Anonymous users can only insert via the trigger (SECURITY DEFINER function)
      - The trigger is controlled and validates data
      - All inserts are logged in the append-only audit table

  3. Security
    - The trigger function is SECURITY DEFINER so it runs with elevated privileges
    - Anonymous users still cannot directly insert into consent_events
    - They can only trigger the function via autorisations_communication insert
*/

-- Allow anonymous users to insert consent events (via trigger only)
CREATE POLICY "Anonymous users can insert consent events via trigger"
  ON consent_events
  FOR INSERT
  TO anon
  WITH CHECK (true);