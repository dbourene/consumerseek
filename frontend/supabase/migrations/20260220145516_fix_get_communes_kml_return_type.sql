/*
  # Fix get_communes_kml function return type

  1. Changes
    - Drop the existing function
    - Recreate it with correct return type matching codgeo column type (varchar)
*/

DROP FUNCTION IF EXISTS get_communes_kml(text[]);

CREATE OR REPLACE FUNCTION get_communes_kml(commune_codes text[])
RETURNS TABLE(
  codgeo varchar(5),
  kml_geometry text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.codgeo,
    ST_AsKML(c.geomgeo) as kml_geometry
  FROM communes c
  WHERE c.codgeo = ANY(commune_codes)
  AND c.geomgeo IS NOT NULL;
END;
$$;