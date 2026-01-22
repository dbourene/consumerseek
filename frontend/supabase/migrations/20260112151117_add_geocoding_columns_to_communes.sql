/*
  # Add geocoding columns to communes table

  1. Changes
    - Add `latitude` column (numeric) to store commune centroid latitude
    - Add `longitude` column (numeric) to store commune centroid longitude
    - Populate latitude and longitude from existing geometry
  
  2. Purpose
    - Enable quick access to commune centroids for map visualization
    - Support aggregated consumer display at commune level
  
  3. Notes
    - Uses ST_Centroid and ST_Transform to calculate centroids in WGS84
    - Columns are nullable but should be populated for all communes with geometry
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'communes' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE communes ADD COLUMN latitude numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'communes' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE communes ADD COLUMN longitude numeric;
  END IF;
END $$;

UPDATE communes
SET 
  latitude = ST_Y(ST_Transform(ST_Centroid(geomgeo), 4326)),
  longitude = ST_X(ST_Transform(ST_Centroid(geomgeo), 4326))
WHERE geomgeo IS NOT NULL AND (latitude IS NULL OR longitude IS NULL);

CREATE INDEX IF NOT EXISTS idx_communes_coords ON communes(latitude, longitude);
