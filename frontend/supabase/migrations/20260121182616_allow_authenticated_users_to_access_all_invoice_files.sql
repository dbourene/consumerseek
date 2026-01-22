/*
  # Allow authenticated users to access all invoice files

  1. Problem
    - Anonymous uploads go to factures-temporaires bucket
    - Current policies only allow users to see their own files in factures-privees
    - Users cannot view files uploaded anonymously

  2. Solution
    - Drop restrictive policies for factures-privees
    - Create new policies allowing authenticated users to view ALL files in both buckets
    - This enables the validation workflow where admins need to see all invoices

  3. Security
    - Anonymous users can still only upload to factures-temporaires
    - Authenticated users get full access to view all invoices (appropriate for validators/admins)
    - Only authenticated users can access the validation interface

  4. Notes
    - Files in factures-temporaires are meant to be temporary (7 days TTL)
    - After validation, files could be moved to factures-privees
*/

-- Drop existing restrictive policies for factures-privees
DROP POLICY IF EXISTS "Users can view own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- Create new permissive policies for authenticated users on factures-privees
CREATE POLICY "Authenticated users can view all private files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'factures-privees');

CREATE POLICY "Authenticated users can upload private files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'factures-privees');

CREATE POLICY "Authenticated users can update private files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'factures-privees')
  WITH CHECK (bucket_id = 'factures-privees');

CREATE POLICY "Authenticated users can delete private files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'factures-privees');

-- Policies for factures-temporaires are already good (defined in previous migration)
-- They allow:
-- - Anonymous upload via invitation
-- - Authenticated users to view and delete temporary files
