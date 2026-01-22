/*
  # Add bucket_id column to factures table

  1. Changes
    - Add `bucket_id` column to track which storage bucket contains the file
    - Possible values: 'factures-privees', 'factures-temporaires'
    - Default to 'factures-temporaires' for existing records (anonymous uploads)

  2. Reason
    - Anonymous uploads go to 'factures-temporaires'
    - Authenticated uploads go to 'factures-privees'
    - Need to know which bucket to query when retrieving files
    - After validation, files can be moved from temporaires to privees

  3. Notes
    - Set default value for existing records
    - Update existing anonymous uploads to use 'factures-temporaires'
*/

-- Add bucket_id column
ALTER TABLE factures 
  ADD COLUMN IF NOT EXISTS bucket_id text NOT NULL DEFAULT 'factures-temporaires';

-- Add check constraint to ensure valid bucket names
ALTER TABLE factures
  ADD CONSTRAINT factures_bucket_id_check 
  CHECK (bucket_id IN ('factures-privees', 'factures-temporaires'));

-- Update existing records that were uploaded to temporaires
UPDATE factures 
SET bucket_id = 'factures-temporaires'
WHERE user_id IS NULL;
