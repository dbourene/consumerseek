/*
  # Fix get_communes_for_sirene_loading function with real column names

  1. Changes
    - Replace the `get_communes_for_sirene_loading()` function to use actual column names
    - Fix: `c.code` → `c.codgeo`
    - Keep: `c.nom_commune` (already correct)
    - Fix: `c.geom` → `c.geomgeo`
  
  2. Notes
    - The real communes table structure uses `codgeo`, `nom_commune`, and `geomgeo`
    - This fixes the "column c.code does not exist" error
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
    c.codgeo::text as code_commune,
    c.nom_commune as nom_commune,
    needs_sirene_reload(c.codgeo::text) as needs_reload
  FROM communes c
  WHERE c.geomgeo IS NOT NULL
  ORDER BY c.nom_commune;
END;
$$;
