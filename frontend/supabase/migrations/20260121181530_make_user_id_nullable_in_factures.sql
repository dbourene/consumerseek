/*
  # Make user_id nullable in factures table

  1. Changes
    - Modify `factures.user_id` to be nullable
    - This allows anonymous users to upload invoices via invitation
    - The user_id can be filled in later when:
      - The invoice is validated by an authenticated user
      - The anonymous uploader creates an account
      - An admin assigns the invoice to a user

  2. Security
    - No changes to RLS policies
    - Anonymous uploads still require a valid invitation token
    - Authenticated users can only access their own invoices (where user_id matches)

  3. Notes
    - For anonymous uploads via invitation, user_id will be NULL initially
    - The contact_id remains NOT NULL to maintain the link to the consumer
    - Later processing can populate user_id based on contact or validation workflow
*/

-- Make user_id nullable for anonymous uploads via invitation
ALTER TABLE factures 
  ALTER COLUMN user_id DROP NOT NULL;
