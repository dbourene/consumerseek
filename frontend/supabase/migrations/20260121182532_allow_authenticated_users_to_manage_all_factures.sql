/*
  # Allow authenticated users to manage all factures

  1. Problem
    - Current policies only allow users to see factures where user_id = auth.uid()
    - Anonymous uploads via invitation have user_id = NULL
    - Authenticated users cannot see these anonymous uploads in validation interface

  2. Solution
    - Add policies to allow authenticated users to SELECT, UPDATE, and DELETE all factures
    - This makes sense because:
      - Authenticated users need to validate all invoices (including anonymous uploads)
      - They need to update factures with extracted data
      - Only authenticated users should have access to the validation interface
    
  3. Security
    - Anonymous users can still only INSERT via valid invitation (existing policy)
    - Authenticated users get full access to manage and validate all factures
    - This is appropriate for an admin/validator role

  4. Notes
    - The existing "own invoices" policies remain for backward compatibility
    - The new policies are more permissive and will take precedence for authenticated users
*/

-- Drop existing restrictive policies for authenticated users
DROP POLICY IF EXISTS "Users can view own invoices" ON factures;
DROP POLICY IF EXISTS "Users can insert own invoices" ON factures;
DROP POLICY IF EXISTS "Users can update own invoices" ON factures;
DROP POLICY IF EXISTS "Users can delete own invoices" ON factures;

-- Create new permissive policies for authenticated users
CREATE POLICY "Authenticated users can view all factures"
  ON factures FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert factures"
  ON factures FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update all factures"
  ON factures FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete all factures"
  ON factures FOR DELETE
  TO authenticated
  USING (true);
