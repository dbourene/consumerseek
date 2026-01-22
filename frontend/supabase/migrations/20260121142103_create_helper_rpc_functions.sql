/*
  # Create Helper RPC Functions

  1. Functions
    - `increment_factures_deposees` - Increments the nb_factures_deposees counter for an invitation
*/

-- Function to increment factures counter
CREATE OR REPLACE FUNCTION increment_factures_deposees(invitation_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE invitations_factures
  SET nb_factures_deposees = nb_factures_deposees + 1
  WHERE id = invitation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;