/*
  Migration: Update autorisations_communication table schema
  
  This migration updates the autorisations_communication table to support both
  particuliers and professionnels by:
  
  1. Making raison_sociale and siret nullable (for particuliers)
  2. Adding forme_juridique column (nullable, for professionnels)
  3. Adding address fields: adresse, code_postal, ville (all required)
  4. Adding type_titulaire column with check constraint ('particulier' or 'professionnel')
  
  Indexes are added on type_titulaire and siret for improved query performance.
*/

-- Make raison_sociale nullable if it's not already
DO $$ 
BEGIN
  ALTER TABLE public.autorisations_communication 
  ALTER COLUMN raison_sociale DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL; -- Column is already nullable or doesn't have NOT NULL constraint
END $$;

-- Make siret nullable if it's not already
DO $$ 
BEGIN
  ALTER TABLE public.autorisations_communication 
  ALTER COLUMN siret DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL; -- Column is already nullable or doesn't have NOT NULL constraint
END $$;

-- Add forme_juridique column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'autorisations_communication' 
    AND column_name = 'forme_juridique'
  ) THEN
    ALTER TABLE public.autorisations_communication 
    ADD COLUMN forme_juridique text;
    
    COMMENT ON COLUMN public.autorisations_communication.forme_juridique IS 'Forme juridique de l''entité (SARL, SAS, EURL, etc.) - for professionnels only';
  END IF;
END $$;

-- Add adresse column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'autorisations_communication' 
    AND column_name = 'adresse'
  ) THEN
    ALTER TABLE public.autorisations_communication 
    ADD COLUMN adresse text NOT NULL DEFAULT '';
    
    -- Remove default after adding the column
    ALTER TABLE public.autorisations_communication 
    ALTER COLUMN adresse DROP DEFAULT;
    
    COMMENT ON COLUMN public.autorisations_communication.adresse IS 'Adresse complète du titulaire';
  END IF;
END $$;

-- Add code_postal column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'autorisations_communication' 
    AND column_name = 'code_postal'
  ) THEN
    ALTER TABLE public.autorisations_communication 
    ADD COLUMN code_postal text NOT NULL DEFAULT '';
    
    -- Remove default after adding the column
    ALTER TABLE public.autorisations_communication 
    ALTER COLUMN code_postal DROP DEFAULT;
    
    COMMENT ON COLUMN public.autorisations_communication.code_postal IS 'Code postal du titulaire';
  END IF;
END $$;

-- Add ville column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'autorisations_communication' 
    AND column_name = 'ville'
  ) THEN
    ALTER TABLE public.autorisations_communication 
    ADD COLUMN ville text NOT NULL DEFAULT '';
    
    -- Remove default after adding the column
    ALTER TABLE public.autorisations_communication 
    ALTER COLUMN ville DROP DEFAULT;
    
    COMMENT ON COLUMN public.autorisations_communication.ville IS 'Ville du titulaire';
  END IF;
END $$;

-- Add type_titulaire column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'autorisations_communication' 
    AND column_name = 'type_titulaire'
  ) THEN
    ALTER TABLE public.autorisations_communication 
    ADD COLUMN type_titulaire text NOT NULL DEFAULT 'professionnel' 
    CHECK (type_titulaire IN ('particulier', 'professionnel'));
    
    -- Remove default after adding the column
    ALTER TABLE public.autorisations_communication 
    ALTER COLUMN type_titulaire DROP DEFAULT;
    
    COMMENT ON COLUMN public.autorisations_communication.type_titulaire IS 'Type de titulaire: particulier ou professionnel';
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_autorisations_communication_type_titulaire 
  ON public.autorisations_communication(type_titulaire);

CREATE INDEX IF NOT EXISTS idx_autorisations_communication_siret 
  ON public.autorisations_communication(siret) 
  WHERE siret IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autorisations_communication_code_postal 
  ON public.autorisations_communication(code_postal);

CREATE INDEX IF NOT EXISTS idx_autorisations_communication_ville 
  ON public.autorisations_communication(ville);