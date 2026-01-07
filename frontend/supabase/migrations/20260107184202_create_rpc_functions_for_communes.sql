/*
  # Fonctions RPC pour recherche de communes

  1. Nouvelles Fonctions
    - `get_rayon_densite(dens7)` - Calcule le rayon de recherche selon la densité (1-7)
      - Densité 1 (Urbain dense) : 5 km
      - Densité 2 (Urbain) : 10 km
      - Densité 3 (Ceinture urbaine) : 15 km
      - Densité 4 (Rural) : 20 km
      - Densité 5 (Rural) : 25 km
      - Densité 6 (Rural dispersé) : 30 km
      - Densité 7 (Rural très dispersé) : 40 km
    
    - `rpc_communes_autour_installation(p_lat, p_lon)` - Trouve les communes dans un rayon
      - Identifie la commune contenant le point d'installation
      - Calcule le rayon selon la densité
      - Retourne toutes les communes dans ce rayon

  2. Sécurité
    - Fonctions accessibles aux utilisateurs authentifiés
    - Utilise la table communes existante avec RLS activé
*/

-- Fonction pour calculer le rayon selon la densité
CREATE OR REPLACE FUNCTION get_rayon_densite(densite smallint)
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN densite = 1 THEN 5000
    WHEN densite = 2 THEN 10000
    WHEN densite = 3 THEN 15000
    WHEN densite = 4 THEN 20000
    WHEN densite = 5 THEN 25000
    WHEN densite = 6 THEN 30000
    WHEN densite = 7 THEN 40000
    ELSE 20000
  END;
END;
$$;

-- Fonction principale de recherche
CREATE OR REPLACE FUNCTION rpc_communes_autour_installation(
  p_lat double precision,
  p_lon double precision
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_commune_installation record;
  v_rayon double precision;
  v_disque geometry;
BEGIN
  -- Trouver la commune contenant le point
  SELECT
    codgeo,
    nom_commune,
    dens7,
    libdens7,
    code_epci,
    ST_AsGeoJSON(geomgeo)::json AS geomgeo
  INTO v_commune_installation
  FROM communes
  WHERE ST_Contains(
    geomgeo,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
  )
  LIMIT 1;

  -- Si aucune commune trouvée
  IF v_commune_installation IS NULL THEN
    RETURN json_build_object(
      'commune_installation', null,
      'rayon', null,
      'communes_dans_rayon', '[]'::json
    );
  END IF;

  -- Calculer le rayon
  v_rayon := get_rayon_densite(v_commune_installation.dens7);

  -- Créer le disque de recherche
  v_disque := ST_Buffer(
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    v_rayon
  )::geometry;

  -- Retourner le résultat
  RETURN json_build_object(
    'commune_installation', json_build_object(
      'codgeo', v_commune_installation.codgeo,
      'nom_commune', v_commune_installation.nom_commune,
      'dens7', v_commune_installation.dens7,
      'libdens7', v_commune_installation.libdens7,
      'code_epci', v_commune_installation.code_epci,
      'geomgeo', v_commune_installation.geomgeo
    ),
    'rayon', v_rayon,
    'communes_dans_rayon', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'codgeo', c.codgeo,
            'nom_commune', c.nom_commune,
            'dens7', c.dens7,
            'libdens7', c.libdens7,
            'code_epci', c.code_epci,
            'geomgeo', ST_AsGeoJSON(c.geomgeo)::json
          )
        )
        FROM communes c
        WHERE ST_Intersects(c.geomgeo, v_disque)
      ),
      '[]'::json
    )
  );
END;
$$;
