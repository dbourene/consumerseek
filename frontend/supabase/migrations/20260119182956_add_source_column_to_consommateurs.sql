/*
  # Add source tracking to consommateurs table

  1. Changes
    - Add `source` column to track data origin
      - 'api': Raw data from external API (can be updated by new API calls)
      - 'manual': Manually corrected/geocoded data (NEVER overwrite)
    - Default to 'api' for existing records
    - Add index for filtering by source
  
  2. Purpose
    - Preserve manual corrections when re-fetching API data
    - Distinguish between automated and human-validated records
    - Prevent data loss from API re-synchronization

  3. Migration Safety
    - Uses IF NOT EXISTS to prevent errors on re-run
    - Sets default value for existing rows
    - Non-destructive operation
*/

-- Add source column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'source'
  ) THEN
    ALTER TABLE consommateurs 
    ADD COLUMN source text NOT NULL DEFAULT 'api' 
    CHECK (source IN ('api', 'manual'));
  END IF;
END $$;

-- Create index for efficient filtering by source
CREATE INDEX IF NOT EXISTS idx_consommateurs_source ON consommateurs(source);

-- Add comment to document the column
COMMENT ON COLUMN consommateurs.source IS 'Data source: api (from external API, can be updated) or manual (user-corrected, never overwrite)';
