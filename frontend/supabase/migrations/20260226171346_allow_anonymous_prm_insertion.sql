/*
  Migration: Allow anonymous users to insert PRM records
  
  Purpose:
  This migration enables anonymous users to submit PRM (Point de Référence et de Mesure) 
  records through public invoice upload forms. When an invitation is sent to a contact, 
  they can access a public form via a unique token to provide their PRM information 
  without requiring authentication.
  
  Security Model:
  - Anonymous users can INSERT PRM records when they provide a valid contact_id
  - The contact_id foreign key constraint ensures referential integrity
  - The contact must exist in the contacts table for the insertion to succeed
  - This follows the same pattern as autorisations_communication table
  - Authenticated users retain full CRUD access to their own PRMs via existing policies
  
  Use Case:
  When a contact receives an invitation to upload invoices, they can also provide
  their PRM information through the public form. The frontend validates the invitation
  token and provides the correct contact_id for the insertion.
*/

-- Create policy to allow anonymous users to insert PRM records
-- The foreign key constraint on contact_id ensures data integrity
CREATE POLICY "Anonymous users can insert PRM records"
  ON prm
  FOR INSERT
  TO anon
  WITH CHECK (true);