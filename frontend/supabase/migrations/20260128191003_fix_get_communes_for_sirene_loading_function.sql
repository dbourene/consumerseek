/*
  # Fix get_communes_for_sirene_loading function

  1. Changes
    - Replace the `get_communes_for_sirene_loading()` function to use correct column names
    - Fix: `c.code_commune` → `c.code`
    - Fix: `c.nom_commune` → `c.nom`
    - Fix: `c.geometry` → `c.geom`
  
  2. Notes
    - The communes table uses `code`, `nom`, and `geom` as column names
    - This fixes the "column c.code_commune does not exist" error
*/

-- Drop and recreate the function with correct column names
DROP FUNCTION IF EXISTS get_communes_for_sirene_loading();

CREATE OR REPLACE FUNCTION get_communes_for_sirene_loading()
RETURNS TABLE(code_commune text, nom_commune text, needs_reload boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    c.code as code_commune,
    c.nom as nom_commune,
    needs_sirene_reload(c.code) as needs_reload
  FROM communes c
  WHERE c.geom IS NOT NULL
  ORDER BY c.nom;
END;
$$;
