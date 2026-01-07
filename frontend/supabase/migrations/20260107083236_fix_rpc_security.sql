/*
  # Fix RPC function security

  1. Changes
    - Add SECURITY DEFINER to rpc_communes_autour_installation function
    - This allows the function to bypass RLS and execute with owner permissions
*/

-- Supprime l'ancienne fonction si elle existe
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
BEGIN
  -- Trouver la commune la plus proche de l'installation
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
  ORDER BY ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography <-> 
           ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
  LIMIT 1;

  -- Si aucune commune trouvée
  IF v_commune_installation IS NULL THEN
    RETURN json_build_object(
      'commune_installation', null,
      'rayon', null,
      'communes_dans_rayon', '[]'::json
    );
  END IF;

  -- Calculer le rayon selon la densité
  v_rayon := get_rayon_densite(v_commune_installation.densite);

  -- Construire le résultat JSON
  SELECT json_build_object(
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
            ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
            v_rayon
          )::geometry
        )
        AND c.code != v_commune_installation.code
      ),
      '[]'::json
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
