/*
  # Création de la table communes et fonction RPC

  1. Nouvelles Tables
    - `communes`
      - `id` (uuid, clé primaire)
      - `nom` (text, nom de la commune)
      - `code` (text, code commune INSEE)
      - `densite` (integer, niveau de densité de 1 à 7)
      - `latitude` (double precision)
      - `longitude` (double precision)
      - `geom` (geometry, géométrie PostGIS de type POLYGON ou MULTIPOLYGON)
      - `created_at` (timestamptz)

  2. Extensions
    - Active PostGIS pour les fonctionnalités géospatiales

  3. Fonctions RPC
    - `rpc_communes_autour_installation(p_lat, p_lon)` : 
      * Identifie la commune de l'installation
      * Calcule le rayon selon la densité
      * Retourne les communes dans le rayon avec leurs informations

  4. Sécurité
    - Enable RLS sur la table communes
    - Politique de lecture pour tous les utilisateurs authentifiés
*/

-- Activer PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Créer la table communes
CREATE TABLE IF NOT EXISTS communes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  code text NOT NULL UNIQUE,
  densite integer NOT NULL CHECK (densite >= 1 AND densite <= 7),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geom geometry(MULTIPOLYGON, 4326),
  created_at timestamptz DEFAULT now()
);

-- Créer un index spatial sur la géométrie
CREATE INDEX IF NOT EXISTS communes_geom_idx ON communes USING GIST (geom);

-- Créer un index sur le code commune
CREATE INDEX IF NOT EXISTS communes_code_idx ON communes (code);

-- Enable RLS
ALTER TABLE communes ENABLE ROW LEVEL SECURITY;

-- Politique de lecture pour tous les utilisateurs authentifiés
CREATE POLICY "Utilisateurs authentifiés peuvent lire les communes"
  ON communes
  FOR SELECT
  TO authenticated
  USING (true);

-- Fonction pour calculer le rayon selon la densité
CREATE OR REPLACE FUNCTION get_rayon_densite(p_densite integer)
RETURNS double precision
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN CASE
    WHEN p_densite IN (1, 2) THEN 30000  -- 30 km pour densité faible
    WHEN p_densite IN (3, 4) THEN 20000  -- 20 km pour densité moyenne
    WHEN p_densite IN (5, 6, 7) THEN 10000  -- 10 km pour densité forte
    ELSE 20000  -- valeur par défaut
  END;
END;
$$;

-- Fonction RPC principale
CREATE OR REPLACE FUNCTION rpc_communes_autour_installation(
  p_lat double precision,
  p_lon double precision
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_commune_installation record;
  v_rayon double precision;
  v_result json;
BEGIN
  -- Trouver la commune de l'installation (commune la plus proche)
  SELECT 
    id,
    nom,
    code,
    densite,
    latitude,
    longitude,
    ST_AsGeoJSON(geom)::json as geomgeo,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    ) as distance
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
        WHERE ST_DWithin(
          ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
          v_rayon
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
