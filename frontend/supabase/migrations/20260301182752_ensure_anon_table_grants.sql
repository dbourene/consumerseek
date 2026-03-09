/*
  # Ensure anon role has proper table-level grants

  1. Issue
    - RLS policy exists but insertion still fails
    - May be missing table-level GRANT permissions
    
  2. Solution
    - Explicitly GRANT INSERT on table to anon role
    - GRANT INSERT on all related tables used by triggers
    
  3. Note
    - Table-level grants are SEPARATE from RLS policies
    - Both are required for access
*/

-- Ensure anon has INSERT privilege on the table itself
GRANT INSERT ON TABLE autorisations_communication TO anon;
GRANT INSERT ON TABLE consent_events TO anon;
GRANT INSERT ON TABLE audit_trail TO anon;

-- Also grant SELECT for trigger functions that may need to read
GRANT SELECT ON TABLE policy_versions TO anon;
GRANT SELECT ON TABLE prm TO anon;