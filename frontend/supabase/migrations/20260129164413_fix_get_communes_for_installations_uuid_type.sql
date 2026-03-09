/*
  # Fix get_communes_for_installations to use uuid type

  1. Changes
    - Change parameter type from bigint[] to uuid[]
    - Use correct column name: installation_recherche_id (not installation_id)
    - Fix the ANY comparison to work with uuid type
  
  2. Purpose
    - Fix the "invalid input syntax for type bigint" error
    - Enable proper filtering of communes by selected installations
*/

DROP FUNCTION IF EXISTS get_communes_for_installations(bigint[]);

CREATE OR REPLACE FUNCTION get_communes_for_installations(installation_ids uuid[])
RETURNS TABLE(code_commune text, nom_commune text, needs_reload boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If no installations provided, return empty result
  IF installation_ids IS NULL OR array_length(installation_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    c.codgeo::text as code_commune,
    c.nom_commune as nom_commune,
    needs_sirene_reload(c.codgeo::text) as needs_reload
  FROM communes c
  INNER JOIN consommateurs cons ON cons.code_commune = c.codgeo::text
  WHERE cons.installation_recherche_id = ANY(installation_ids)
    AND c.geomgeo IS NOT NULL
  ORDER BY c.nom_commune;
END;
$$;