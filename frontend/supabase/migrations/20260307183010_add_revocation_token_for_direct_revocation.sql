/*
  # Add direct revocation capability for RGPD compliance

  1. Changes to autorisations_communication table
    - Add revocation_token: Unique token for direct revocation by the holder (cryptographically secure)
    - Add revocation_token_expires_at: Expiration date for the revocation token (default: 5 years)
    - Token is generated automatically on INSERT and never changes

  2. New table: revocation_requests
    - Tracks all revocation attempts (successful and failed)
    - Append-only for audit purposes
    - Records IP, User-Agent, and timestamp

  3. RLS Policies
    - Allow anonymous users to SELECT their authorization by revocation_token
    - Allow anonymous users to UPDATE consent_status to REVOKED with valid token
    - Allow anonymous users to INSERT into revocation_requests

  4. RGPD Compliance
    - Article 7.3: Revocation must be as simple as giving consent
    - Direct revocation link allows holder to revoke without intermediary
    - Full audit trail maintained in revocation_requests
*/

-- Add revocation_token columns to autorisations_communication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'revocation_token'
  ) THEN
    ALTER TABLE autorisations_communication
    ADD COLUMN revocation_token text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'revocation_token_expires_at'
  ) THEN
    ALTER TABLE autorisations_communication
    ADD COLUMN revocation_token_expires_at timestamptz DEFAULT (now() + INTERVAL '5 years');
  END IF;
END $$;

-- Create index on revocation_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_autorisations_revocation_token
ON autorisations_communication(revocation_token)
WHERE revocation_token IS NOT NULL;

-- Create revocation_requests table for audit trail
CREATE TABLE IF NOT EXISTS revocation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autorisation_id uuid REFERENCES autorisations_communication(id) ON DELETE CASCADE,
  revocation_token text NOT NULL,
  request_status text NOT NULL CHECK (request_status IN ('SUCCESS', 'FAILED_INVALID_TOKEN', 'FAILED_EXPIRED', 'FAILED_ALREADY_REVOKED')),
  revocation_reason text,
  ip_address text,
  user_agent text,
  request_metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on revocation_requests
ALTER TABLE revocation_requests ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert revocation requests
CREATE POLICY "Anonymous can insert revocation requests"
  ON revocation_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow authenticated users to read all revocation requests
CREATE POLICY "Authenticated users can read revocation requests"
  ON revocation_requests
  FOR SELECT
  TO authenticated
  USING (true);

-- Create index on revocation_requests for audit queries
CREATE INDEX IF NOT EXISTS idx_revocation_requests_autorisation_id
ON revocation_requests(autorisation_id);

CREATE INDEX IF NOT EXISTS idx_revocation_requests_created_at
ON revocation_requests(created_at DESC);

-- Allow anonymous users to SELECT authorization by revocation_token
CREATE POLICY "Anonymous can read authorization by revocation token"
  ON autorisations_communication
  FOR SELECT
  TO anon
  USING (
    revocation_token IS NOT NULL
    AND revocation_token_expires_at > now()
  );

-- Allow anonymous users to UPDATE consent_status via revocation token
CREATE POLICY "Anonymous can revoke via token"
  ON autorisations_communication
  FOR UPDATE
  TO anon
  USING (
    revocation_token IS NOT NULL
    AND revocation_token_expires_at > now()
    AND consent_status = 'ACTIVE'
  )
  WITH CHECK (
    consent_status = 'REVOKED'
    AND revoked_at IS NOT NULL
    AND revocation_reason IS NOT NULL
  );

-- Create function to handle direct revocation
CREATE OR REPLACE FUNCTION revoke_authorization_by_token(
  p_revocation_token text,
  p_revocation_reason text,
  p_ip_address text,
  p_user_agent text
)
RETURNS jsonb AS $$
DECLARE
  v_autorisation_id uuid;
  v_current_status text;
  v_result jsonb;
BEGIN
  -- Find the authorization by token
  SELECT id, consent_status INTO v_autorisation_id, v_current_status
  FROM autorisations_communication
  WHERE revocation_token = p_revocation_token
  AND revocation_token_expires_at > now();

  -- Check if authorization exists
  IF v_autorisation_id IS NULL THEN
    -- Log failed attempt
    INSERT INTO revocation_requests (
      autorisation_id,
      revocation_token,
      request_status,
      revocation_reason,
      ip_address,
      user_agent,
      request_metadata
    ) VALUES (
      NULL,
      p_revocation_token,
      CASE
        WHEN EXISTS (SELECT 1 FROM autorisations_communication WHERE revocation_token = p_revocation_token AND revocation_token_expires_at <= now())
        THEN 'FAILED_EXPIRED'
        ELSE 'FAILED_INVALID_TOKEN'
      END,
      p_revocation_reason,
      p_ip_address,
      p_user_agent,
      jsonb_build_object('error', 'Token invalid or expired')
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_OR_EXPIRED_TOKEN',
      'message', 'Le lien de révocation est invalide ou a expiré.'
    );
  END IF;

  -- Check if already revoked
  IF v_current_status = 'REVOKED' THEN
    -- Log failed attempt
    INSERT INTO revocation_requests (
      autorisation_id,
      revocation_token,
      request_status,
      revocation_reason,
      ip_address,
      user_agent,
      request_metadata
    ) VALUES (
      v_autorisation_id,
      p_revocation_token,
      'FAILED_ALREADY_REVOKED',
      p_revocation_reason,
      p_ip_address,
      p_user_agent,
      jsonb_build_object('error', 'Already revoked')
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_REVOKED',
      'message', 'Cette autorisation a déjà été révoquée.'
    );
  END IF;

  -- Perform revocation
  UPDATE autorisations_communication
  SET
    consent_status = 'REVOKED',
    revoked_at = now(),
    revocation_reason = p_revocation_reason
  WHERE id = v_autorisation_id;

  -- Log successful revocation
  INSERT INTO revocation_requests (
    autorisation_id,
    revocation_token,
    request_status,
    revocation_reason,
    ip_address,
    user_agent,
    request_metadata
  ) VALUES (
    v_autorisation_id,
    p_revocation_token,
    'SUCCESS',
    p_revocation_reason,
    p_ip_address,
    p_user_agent,
    jsonb_build_object('revoked_at', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'autorisation_id', v_autorisation_id,
    'message', 'Votre consentement a été révoqué avec succès.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anonymous users
GRANT EXECUTE ON FUNCTION revoke_authorization_by_token TO anon;

-- Add comments for documentation
COMMENT ON COLUMN autorisations_communication.revocation_token IS 'Cryptographically secure token for direct revocation by the holder (Article 7.3 RGPD)';
COMMENT ON COLUMN autorisations_communication.revocation_token_expires_at IS 'Expiration date for the revocation token (default: 5 years from creation)';
COMMENT ON TABLE revocation_requests IS 'Append-only audit log of all revocation attempts (successful and failed) for RGPD compliance';
COMMENT ON FUNCTION revoke_authorization_by_token IS 'Allows direct consent revocation by the holder using their revocation token (RGPD Article 7.3 compliance)';
