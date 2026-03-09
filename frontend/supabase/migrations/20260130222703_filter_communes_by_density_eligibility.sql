/*
  # Filtrage intelligent des communes selon leur densité

  ## Problème résolu
  - Évite de charger inutilement les données SIRENE pour des communes dont la densité les rend inéligibles
  - Exemple : Une installation rurale (densité 7, rayon 20km) ne doit pas charger les consommateurs
    d'une commune urbaine dense (densité 1, rayon 2km) située à 15km, car ces consommateurs
    seraient de toute façon exclus (15km > 2km)

  ## Logique appliquée
  - Si la commune est MOINS restrictive (catégorie >= catégorie installation) : on la garde
  - Si la commune est PLUS restrictive (catégorie < catégorie installation) :
    - On calcule la distance minimale entre l'installation et la commune
    - On ne garde la commune que si cette distance <= rayon réglementaire de la commune

  ## Catégories de densité
  - Catégorie 1 (densités 1-2) : rayon 2km - la plus restrictive
  - Catégorie 2 (densités 3-4) : rayon 10km
  - Catégorie 3 (densités 5-7) : rayon 20km - la moins restrictive
*/

-- Helper function to get density category
CREATE OR REPLACE FUNCTION get_categorie_densite(densite smallint)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN densite IN (1, 2) THEN 1
    WHEN densite IN (3, 4) THEN 2
    WHEN densite IN (5, 6, 7) THEN 3
    ELSE 2
  END;
END;
$$;

-- Update get_communes_for_installations with density filtering
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
  v_categorie_installation integer;
  v_point_installation geography;
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
      c.codgeo as codgeo,
      c.nom_commune as nom_commune,
      c.dens7 as dens7
    INTO v_commune_installation
    FROM communes c
    WHERE ST_Contains(
      c.geomgeo,
      ST_SetSRID(ST_MakePoint(v_installation.longitude, v_installation.latitude), 4326)
    )
    LIMIT 1;

    -- If commune found, calculate radius and find all eligible communes within it
    IF v_commune_installation IS NOT NULL THEN
      -- Calculate the regulatory radius based on density
      v_rayon := get_rayon_densite(v_commune_installation.dens7);
      v_categorie_installation := get_categorie_densite(v_commune_installation.dens7);

      -- Create the search disk around the installation
      v_disque := ST_Buffer(
        ST_SetSRID(
          ST_MakePoint(v_installation.longitude, v_installation.latitude),
          4326
        )::geography,
        v_rayon
      )::geometry;

      -- Point for distance calculations
      v_point_installation := ST_SetSRID(
        ST_MakePoint(v_installation.longitude, v_installation.latitude),
        4326
      )::geography;

      -- Insert eligible communes into temp table
      INSERT INTO temp_communes_for_loading (code_commune, nom_commune)
      SELECT DISTINCT
        c.codgeo::text,
        c.nom_commune
      FROM communes c
      WHERE ST_Intersects(c.geomgeo, v_disque)
        -- Apply density-based filtering
        AND (
          -- Keep communes that are less restrictive or equal (category >= installation category)
          get_categorie_densite(c.dens7) >= v_categorie_installation
          OR
          -- For more restrictive communes, check if they're within their own regulatory radius
          (
            get_categorie_densite(c.dens7) < v_categorie_installation
            AND
            ST_Distance(c.geomgeo::geography, v_point_installation) <= get_rayon_densite(c.dens7)
          )
        )
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
