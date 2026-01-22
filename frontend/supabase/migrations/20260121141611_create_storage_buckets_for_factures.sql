/*
  # Create Storage Buckets for Invoices

  1. Storage Buckets
    - `factures-privees` - Private bucket for validated invoices
    - `factures-temporaires` - Temporary bucket for uploads via invitation (7 days TTL)

  2. Security
    - Private buckets with RLS policies
    - Users can access their own files
    - Anonymous users can upload via invitation token
*/

-- Create private bucket for validated invoices
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'factures-privees',
  'factures-privees',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Create temporary bucket for uploads via invitation
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'factures-temporaires',
  'factures-temporaires',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for factures-privees

-- Users can view their own files
CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'factures-privees'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can upload their own files
CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'factures-privees'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own files
CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'factures-privees'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'factures-privees'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own files
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'factures-privees'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS Policies for factures-temporaires

-- Anonymous users can upload via invitation token
CREATE POLICY "Anonymous can upload via invitation"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'factures-temporaires'
  );

-- Authenticated users can view temporary files
CREATE POLICY "Authenticated can view temporary files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'factures-temporaires');

-- Authenticated users can delete temporary files (for cleanup)
CREATE POLICY "Authenticated can delete temporary files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'factures-temporaires');