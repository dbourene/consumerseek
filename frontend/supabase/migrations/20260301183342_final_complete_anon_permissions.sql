/*
  # Complete anonymous permissions for authorization workflow
  
  1. Summary
    - Ensure all RLS policies are properly configured for anon role
    - Ensure all table grants are in place
    - This fixes the 401 error from REST API
    
  2. Tables affected
    - autorisations_communication: INSERT, SELECT
    - prm: INSERT
    - contacts: SELECT, UPDATE (already exists)
    - consent_events: INSERT (for triggers)
    - audit_trail: INSERT (for triggers)
    
  3. Security
    - All policies are appropriate for public authorization workflow
    - Audit trails capture all actions
    - No sensitive data exposure
*/

-- Ensure GRANT on all necessary tables
GRANT INSERT, SELECT ON TABLE autorisations_communication TO anon;
GRANT INSERT ON TABLE prm TO anon;
GRANT SELECT, UPDATE ON TABLE contacts TO anon;
GRANT INSERT ON TABLE consent_events TO anon;
GRANT INSERT ON TABLE audit_trail TO anon;
GRANT SELECT ON TABLE invitations_factures TO anon;

-- Ensure RLS policies exist and are correct
-- Drop all existing anon policies and recreate them cleanly
DROP POLICY IF EXISTS "anon_can_insert" ON autorisations_communication;
DROP POLICY IF EXISTS "anon_can_select_authorizations" ON autorisations_communication;

-- Recreate with explicit configuration
CREATE POLICY "anon_insert_authorizations"
  ON autorisations_communication
  AS PERMISSIVE
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon_select_authorizations"
  ON autorisations_communication
  AS PERMISSIVE
  FOR SELECT
  TO anon
  USING (true);

-- Ensure consent_events has proper policy
DROP POLICY IF EXISTS "Anonymous users can insert consent events via trigger" ON consent_events;
CREATE POLICY "anon_insert_consent_events"
  ON consent_events
  AS PERMISSIVE
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Ensure audit_trail has proper policy
DROP POLICY IF EXISTS "Anonymous users can insert audit trail via trigger" ON audit_trail;
CREATE POLICY "anon_insert_audit_trail"
  ON audit_trail
  AS PERMISSIVE
  FOR INSERT
  TO anon
  WITH CHECK (true);