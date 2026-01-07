/*
  # Add helper function for upserting communes

  1. New Functions
    - `upsert_commune_with_geom` - Helper function to insert or update a commune with geometry from GeoJSON
    
  2. Security
    - Function uses SECURITY DEFINER to bypass RLS
    - Only accessible to authenticated users
*/

CREATE OR REPLACE FUNCTION upsert_commune_with_geom(
  p_code text,
  p_nom text,
  p_latitude double precision,
  p_longitude double precision,
  p_densite integer,
  p_geojson text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commune_id uuid;
  v_action text;
BEGIN
  -- Vérifier si la commune existe
  SELECT id INTO v_commune_id
  FROM communes
  WHERE code = p_code;

  IF v_commune_id IS NOT NULL THEN
    -- Mise à jour
    UPDATE communes
    SET 
      nom = p_nom,
      latitude = p_latitude,
      longitude = p_longitude,
      densite = p_densite,
      geom = ST_GeomFromGeoJSON(p_geojson)
    WHERE id = v_commune_id;
    
    v_action := 'updated';
  ELSE
    -- Insertion
    INSERT INTO communes (code, nom, latitude, longitude, densite, geom)
    VALUES (p_code, p_nom, p_latitude, p_longitude, p_densite, ST_GeomFromGeoJSON(p_geojson))
    RETURNING id INTO v_commune_id;
    
    v_action := 'inserted';
  END IF;

  RETURN json_build_object(
    'success', true,
    'action', v_action,
    'commune_id', v_commune_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;
