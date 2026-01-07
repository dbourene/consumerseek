/*
  # Add debug logs to RPC function

  1. Changes
    - Add RAISE NOTICE statements to log the search process
    - Log input coordinates
    - Log which commune is found
    - Log the calculated radius
    - Log how many communes are found in the radius
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
  v_nb_communes_rayon integer;
BEGIN
  -- LOG: Coordonnées de l'installation recherchée
  RAISE NOTICE 'RPC - Recherche pour lat=%, lon=%', p_lat, p_lon;

  -- Créer le point de l'installation
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  
  RAISE NOTICE 'RPC - Point créé: %', ST_AsText(v_point);

  -- Trouver la commune qui CONTIENT le point de l'installation
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

  -- LOG: Résultat de ST_Contains
  IF v_commune_installation IS NOT NULL THEN
    RAISE NOTICE 'RPC - Commune trouvée avec ST_Contains: % (code: %, densité: %)', 
      v_commune_installation.nom, v_commune_installation.code, v_commune_installation.densite;
  ELSE
    RAISE NOTICE 'RPC - Aucune commune trouvée avec ST_Contains, recherche de la plus proche...';
  END IF;

  -- Si aucune commune ne contient le point, chercher la plus proche
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
    
    IF v_commune_installation IS NOT NULL THEN
      RAISE NOTICE 'RPC - Commune la plus proche trouvée: % (code: %, densité: %)', 
        v_commune_installation.nom, v_commune_installation.code, v_commune_installation.densite;
    END IF;
  END IF;

  -- Si toujours aucune commune trouvée
  IF v_commune_installation IS NULL THEN
    RAISE NOTICE 'RPC - ERREUR: Aucune commune trouvée du tout!';
    RETURN json_build_array(
      json_build_object(
        'commune_installation', null,
        'rayon', null,
        'communes_dans_rayon', '[]'::json
      )
    );
  END IF;

  -- Calculer le rayon selon la densité
  v_rayon := get_rayon_densite(v_commune_installation.densite);
  RAISE NOTICE 'RPC - Rayon calculé: % mètres (pour densité: %)', v_rayon, v_commune_installation.densite;

  -- Compter les communes dans le rayon
  SELECT COUNT(*)
  INTO v_nb_communes_rayon
  FROM communes c
  WHERE ST_Intersects(
    c.geom,
    ST_Buffer(
      v_point::geography,
      v_rayon
    )::geometry
  )
  AND c.code != v_commune_installation.code;
  
  RAISE NOTICE 'RPC - Nombre de communes intersectant le rayon: %', v_nb_communes_rayon;

  -- Construire le résultat JSON
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

  RAISE NOTICE 'RPC - Résultat construit avec succès';
  RETURN v_result;
END;
$$;