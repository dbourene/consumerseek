/*
  # Fix get_communes_for_installations to load all communes in installation radius

  ## Problem
  The current function only returns communes that already have loaded consumers,
  which means it misses the majority of communes covered by an installation's radius.

  ## Solution
  For each selected installation:
  1. Get the installation's coordinates (latitude, longitude)
  2. Find the commune containing the installation
  3. Calculate the regulatory radius based on commune density (dens7)
  4. Find ALL communes within that radius
  5. Return the union of communes from all installations with their reload status

  ## Changes
  - Drop and recreate `get_communes_for_installations` function
  - Use the same logic as `rpc_communes_autour_installation`
  - Return all communes in regulatory radius, not just those with loaded consumers
*/

DROP FUNCTION IF EXISTS get_communes_for_installations(uuid[]);

CREATE OR REPLACE FUNCTION get_communes_for_installations(installation_ids uuid[])
RETURNS TABLE(code_commune text, nom_commune text, needs_reload boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_installation record;
  v_commune_installation record;
  v_rayon double precision;
  v_disque geometry;
BEGIN
  -- If no installations provided, return empty result
  IF installation_ids IS NULL OR array_length(installation_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Create a temporary table to collect all communes
  CREATE TEMP TABLE IF NOT EXISTS temp_communes_for_loading (
    code_commune text,
    nom_commune text
  ) ON COMMIT DROP;

  -- Process each installation
  FOR v_installation IN 
    SELECT id, latitude, longitude, nom
    FROM installations
    WHERE id = ANY(installation_ids)
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
  LOOP
    -- Find the commune containing this installation
    SELECT
      codgeo,
      nom_commune,
      dens7
    INTO v_commune_installation
    FROM communes
    WHERE ST_Contains(
      geomgeo,
      ST_SetSRID(ST_MakePoint(v_installation.longitude, v_installation.latitude), 4326)
    )
    LIMIT 1;

    -- If commune found, calculate radius and find all communes within it
    IF v_commune_installation IS NOT NULL THEN
      -- Calculate the regulatory radius based on density
      v_rayon := get_rayon_densite(v_commune_installation.dens7);

      -- Create the search disk around the installation
      v_disque := ST_Buffer(
        ST_SetSRID(
          ST_MakePoint(v_installation.longitude, v_installation.latitude),
          4326
        )::geography,
        v_rayon
      )::geometry;

      -- Insert all communes within the radius into temp table
      INSERT INTO temp_communes_for_loading (code_commune, nom_commune)
      SELECT DISTINCT
        c.codgeo::text,
        c.nom_commune
      FROM communes c
      WHERE ST_Intersects(c.geomgeo, v_disque)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- Return distinct communes with their reload status
  RETURN QUERY
  SELECT DISTINCT
    t.code_commune,
    t.nom_commune,
    needs_sirene_reload(t.code_commune) as needs_reload
  FROM temp_communes_for_loading t
  ORDER BY t.nom_commune;
END;
$$;
