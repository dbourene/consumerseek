/*
  # Add installation-based commune loading for SIRENE

  1. New Function
    - `get_communes_for_installations(installation_ids bigint[])`
    - Returns only communes that have consumers linked to the specified installations
    - Filters by needs_reload (6 months freshness check)
  
  2. Purpose
    - Enable targeted SIRENE loading based on selected installations
    - Avoid loading data for all communes unnecessarily
    - Optimize API calls by focusing on relevant geographical areas
  
  3. Logic
    - JOIN installations -> consommateurs -> communes
    - Group by commune to avoid duplicates
    - Apply 6-month freshness check (needs_sirene_reload)
    - Return code_commune, nom_commune, needs_reload
*/

CREATE OR REPLACE FUNCTION get_communes_for_installations(installation_ids bigint[])
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
  WHERE cons.installation_id = ANY(installation_ids)
    AND c.geomgeo IS NOT NULL
  ORDER BY c.nom_commune;
END;
$$;