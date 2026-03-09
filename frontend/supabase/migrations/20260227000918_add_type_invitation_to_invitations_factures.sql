/*
  # Add type_invitation column to invitations_factures

  1. Changes
    - Add `type_invitation` column to `invitations_factures` table
      - Type: text with check constraint ('factures' or 'autorisation')
      - Default: 'factures' (to maintain backward compatibility)
    
  2. Purpose
    - Distinguish between invoice upload invitations and authorization requests
    - Both use the same token-based workflow but show different forms
*/

-- Add type_invitation column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invitations_factures' AND column_name = 'type_invitation'
  ) THEN
    ALTER TABLE invitations_factures 
    ADD COLUMN type_invitation text NOT NULL DEFAULT 'factures'
    CHECK (type_invitation IN ('factures', 'autorisation'));
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invitations_factures_type 
ON invitations_factures(type_invitation);
