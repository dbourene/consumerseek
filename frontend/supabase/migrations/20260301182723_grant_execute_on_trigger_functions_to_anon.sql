/*
  # Grant EXECUTE privileges on trigger functions to anon role

  1. Context
    - Trigger functions need to be executable by the anon role
    - Even though they are SECURITY DEFINER, explicit grants may be needed
    
  2. Solution
    - Grant EXECUTE on all trigger functions used in autorisations workflow
    
  3. Security
    - Functions are SECURITY DEFINER so they run with elevated privileges
    - Anon users can only trigger them indirectly via INSERT operations
*/

-- Grant execute on audit function to anon
GRANT EXECUTE ON FUNCTION audit_table_changes() TO anon;

-- Grant execute on consent event creation to anon  
GRANT EXECUTE ON FUNCTION log_autorisation_creation() TO anon;

GRANT EXECUTE ON FUNCTION create_consent_event(
  p_event_type text,
  p_autorisation_id uuid,
  p_prm_id uuid,
  p_prm_number text,
  p_identity_client jsonb,
  p_ip_address inet,
  p_user_agent text,
  p_policy_version_id uuid,
  p_consent_text_hash text,
  p_consent_given boolean,
  p_triggered_by uuid,
  p_triggered_by_type text,
  p_metadata jsonb
) TO anon;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION set_server_timestamp_on_insert() TO anon;
GRANT EXECUTE ON FUNCTION protect_consent_critical_fields() TO anon;
GRANT EXECUTE ON FUNCTION handle_autorisation_revocation() TO anon;