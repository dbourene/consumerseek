/*
  # Add geocoding columns to consommateurs table

  1. Changes
    - Add `latitude` column (numeric) to store geocoded latitude
    - Add `longitude` column (numeric) to store geocoded longitude
  
  2. Purpose
    - Enable storage of geocoded coordinates for consumer addresses
    - Support map visualization of consumers with validated addresses
  
  3. Notes
    - Columns are nullable as not all addresses may be geocoded
    - Uses numeric type for precision in geolocation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN latitude numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN longitude numeric;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consommateurs_coords ON consommateurs(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consommateurs_annee_commune ON consommateurs(annee, code_commune);
CREATE INDEX IF NOT EXISTS idx_consommateurs_filters ON consommateurs(annee, tranche_conso, categorie_activite);
