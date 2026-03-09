/*
  # Create function to get communes as KML

  1. New Function
    - `get_communes_kml(commune_codes text[])` 
      - Takes an array of commune codes
      - Returns KML geometry for each commune
      - Uses ST_AsKML directly on the geometry column

  2. Security
    - Function is SECURITY DEFINER to allow access to ST_AsKML
    - Returns only the data requested by commune codes
*/

CREATE OR REPLACE FUNCTION get_communes_kml(commune_codes text[])
RETURNS TABLE(
  codgeo text,
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