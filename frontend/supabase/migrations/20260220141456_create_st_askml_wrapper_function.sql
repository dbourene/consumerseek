/*
  # Create ST_AsKML wrapper function

  1. Purpose
    - Creates a wrapper function to convert WKB hex geometry to KML format
    - Needed for KML export functionality

  2. Function
    - `st_askml(geom_hex text)` - Converts WKB hex to KML string
    - Uses PostGIS ST_GeomFromText and ST_AsKML functions
    - Returns KML geometry string

  3. Security
    - Function is marked as SECURITY DEFINER to allow execution
    - Available to authenticated users only
*/

CREATE OR REPLACE FUNCTION st_askml(geom_hex text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  geom geometry;
BEGIN
  geom := ST_GeomFromWKB(decode(geom_hex, 'hex'));
  RETURN ST_AsKML(geom);
END;
$$;

GRANT EXECUTE ON FUNCTION st_askml(text) TO authenticated;
