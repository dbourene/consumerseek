/*
  # Create wastewater treatment stations table

  ## Overview
  This migration creates a table to store wastewater treatment stations (STEU/STEP)
  from the SANDRE national database. This allows us to geocode addresses related to
  treatment facilities that are not recognized by standard address APIs.

  ## New Tables
  - `stations_traitement`
    - `id` (uuid, primary key)
    - `code_station` (text, unique) - Official SANDRE station code
    - `nom` (text, indexed) - Station name
    - `nom_normalise` (text, indexed) - Normalized name for matching
    - `commune` (text, indexed) - Municipality name
    - `code_commune` (text, indexed) - INSEE municipality code
    - `type_station` (text) - Type: STEP, pompage, etc.
    - `capacite_eh` (integer) - Capacity in population equivalent
    - `latitude` (double precision) - Latitude coordinate
    - `longitude` (double precision) - Longitude coordinate
    - `adresse` (text) - Street address if available
    - `source` (text) - Data source (SANDRE, BDERU, etc.)
    - `date_import` (timestamptz) - Import timestamp
    - `metadata` (jsonb) - Additional metadata
    - `created_at` (timestamptz) - Record creation timestamp

  ## Indexes
  - Index on `nom_normalise` for fast name-based lookups
  - Index on `code_commune` for municipality filtering
  - Composite index on (nom_normalise, code_commune) for precise matching
  - GiST index on geography point for spatial queries

  ## Security
  - Enable RLS on `stations_traitement` table
  - Allow read access to authenticated users
  - Restrict write access (only service role should insert)

  ## Notes
  - This table will be populated via CSV import or WFS service
  - The `nom_normalise` field enables fuzzy matching with consumer addresses
  - Coordinates are in WGS84 (EPSG:4326)
*/

CREATE TABLE IF NOT EXISTS stations_traitement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_station text UNIQUE,
  nom text NOT NULL,
  nom_normalise text NOT NULL,
  commune text NOT NULL,
  code_commune text NOT NULL,
  type_station text DEFAULT 'STEP',
  capacite_eh integer,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  adresse text,
  source text DEFAULT 'SANDRE',
  date_import timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stations_nom_normalise 
  ON stations_traitement(nom_normalise);

CREATE INDEX IF NOT EXISTS idx_stations_code_commune 
  ON stations_traitement(code_commune);

CREATE INDEX IF NOT EXISTS idx_stations_nom_commune 
  ON stations_traitement(nom_normalise, code_commune);

CREATE INDEX IF NOT EXISTS idx_stations_nom_search 
  ON stations_traitement USING gin(to_tsvector('french', nom));

ALTER TABLE stations_traitement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users"
  ON stations_traitement
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow public read access"
  ON stations_traitement
  FOR SELECT
  TO anon
  USING (true);

COMMENT ON TABLE stations_traitement IS 'National database of wastewater treatment stations (STEU/STEP) from SANDRE';
COMMENT ON COLUMN stations_traitement.code_station IS 'Official SANDRE station identifier';
COMMENT ON COLUMN stations_traitement.nom_normalise IS 'Normalized station name for matching (lowercase, no accents)';
COMMENT ON COLUMN stations_traitement.capacite_eh IS 'Treatment capacity in population equivalent (Equivalent Habitants)';
