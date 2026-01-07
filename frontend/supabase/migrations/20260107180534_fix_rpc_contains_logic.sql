/*
  # Fix RPC function to use ST_Contains instead of proximity

  1. Changes
    - Replace proximity search with ST_Contains to find the commune that actually contains the installation point
    - Change return type to return a JSON array with a single element to match TypeScript expectations
    - Use ST_Intersects to find all communes that intersect the radius circle (disk), not just the border
  
  2. Logic Flow
    - Step 1: Find the commune that contains the installation point using ST_Contains
    - Step 2: Determine the radius based on that commune's density classification
    - Step 3: Find all communes whose geometry intersects with a circle of that radius centered on the installation
    - Step 4: Return all these communes with their density-based colors
*/

-- Drop existing function
DROP FUNCTION IF EXISTS rpc_communes_autour_installation(double precision, double precision);

CREATE OR REPLACE FUNCTION rpc_communes_autour_installation(
  p_lat double precision,
  p_lon double precision
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commune_installation record;
  v_rayon double precision;
  v_result json;
  v_point geometry;
BEGIN
  -- Créer le point de l'installation
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);

  -- Trouver la commune qui CONTIENT le point de l'installation (pas la plus proche!)
  SELECT 
    id,
    nom,
    code,
    densite,
    latitude,
    longitude,
    ST_AsGeoJSON(geom)::json as geomgeo
  INTO v_commune_installation
  FROM communes
  WHERE ST_Contains(geom, v_point)
  LIMIT 1;

  -- Si aucune commune ne contient le point, chercher la plus proche en dernier recours
  IF v_commune_installation IS NULL THEN
    SELECT 
      id,
      nom,
      code,
      densite,
      latitude,
      longitude,
      ST_AsGeoJSON(geom)::json as geomgeo
    INTO v_commune_installation
    FROM communes
    ORDER BY geom <-> v_point
    LIMIT 1;
  END IF;

  -- Si toujours aucune commune trouvée
  IF v_commune_installation IS NULL THEN
    -- Retourner un tableau JSON avec un objet indiquant qu'aucune commune n'a été trouvée
    RETURN json_build_array(
      json_build_object(
        'commune_installation', null,
        'rayon', null,
        'communes_dans_rayon', '[]'::json
      )
    );
  END IF;

  -- Calculer le rayon selon la densité de la commune d'installation
  v_rayon := get_rayon_densite(v_commune_installation.densite);

  -- Construire le résultat JSON (retourner un TABLEAU avec un seul élément)
  SELECT json_build_array(
    json_build_object(
      'commune_installation', json_build_object(
        'id', v_commune_installation.id,
        'nom', v_commune_installation.nom,
        'code', v_commune_installation.code,
        'densite', v_commune_installation.densite,
        'latitude', v_commune_installation.latitude,
        'longitude', v_commune_installation.longitude,
        'geomgeo', v_commune_installation.geomgeo
      ),
      'rayon', v_rayon,
      'communes_dans_rayon', COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', c.id,
              'nom', c.nom,
              'code', c.code,
              'densite', c.densite,
              'latitude', c.latitude,
              'longitude', c.longitude,
              'geomgeo', ST_AsGeoJSON(c.geom)::json
            )
          )
          FROM communes c
          WHERE ST_Intersects(
            c.geom,
            ST_Buffer(
              v_point::geography,
              v_rayon
            )::geometry
          )
          AND c.code != v_commune_installation.code
        ),
        '[]'::json
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;