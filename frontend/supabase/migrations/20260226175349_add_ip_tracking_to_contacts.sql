/*
  # Add IP tracking columns to contacts table

  1. Changes
    - Add `contact1_ip` column to store the IP address of the contact who validates the authorization
    - Add `contact1_ip_timestamp` column to store the timestamp when the IP was recorded
  
  2. Security
    - No changes to RLS policies needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'contact1_ip'
  ) THEN
    ALTER TABLE contacts ADD COLUMN contact1_ip text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'contact1_ip_timestamp'
  ) THEN
    ALTER TABLE contacts ADD COLUMN contact1_ip_timestamp timestamptz;
  END IF;
END $$;
