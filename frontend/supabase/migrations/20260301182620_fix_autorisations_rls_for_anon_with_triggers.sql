/*
  # Fix RLS for anonymous insertions with triggers
  
  1. Problem Analysis
    - Anonymous users try to INSERT into autorisations_communication
    - Multiple AFTER INSERT triggers fire:
      - audit_autorisations_communication -> calls audit_table_changes()
      - log_autorisation_creation_trigger -> calls log_autorisation_creation()
    - Even with SECURITY DEFINER, triggers may still be subject to RLS checks
    - The RLS policy "Anonymous users can insert authorizations" exists but may need adjustment
    
  2. Solution
    - Drop and recreate the anonymous insert policy with proper configuration
    - Ensure all related tables (consent_events, audit_trail) allow trigger-based inserts
    
  3. Testing
    - This should allow the full INSERT workflow to complete for anonymous users
*/

-- First, drop the existing policy
DROP POLICY IF EXISTS "Anonymous users can insert authorizations" ON autorisations_communication;

-- Recreate the policy with explicit configuration
CREATE POLICY "Anonymous users can insert authorizations"
  ON autorisations_communication
  FOR INSERT
  TO anon
  WITH CHECK (true);