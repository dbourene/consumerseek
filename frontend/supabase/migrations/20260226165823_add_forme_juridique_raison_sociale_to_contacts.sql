/*
  Migration: Add forme_juridique and raison_sociale columns to contacts table
  
  This migration adds:
  - forme_juridique: Legal form of the entity (e.g., SARL, SAS, etc.)
  - raison_sociale: Company name/business name
  
  Both columns are nullable to support both particuliers and professionnels.
  Indexes are added to improve query performance on these frequently searched fields.
*/

-- Add forme_juridique column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'forme_juridique'
  ) THEN
    ALTER TABLE public.contacts 
    ADD COLUMN forme_juridique text;
    
    COMMENT ON COLUMN public.contacts.forme_juridique IS 'Forme juridique de l''entité (SARL, SAS, EURL, etc.)';
  END IF;
END $$;

-- Note: raison_sociale already exists in the contacts table, skipping creation

-- Create index on forme_juridique for better query performance
CREATE INDEX IF NOT EXISTS idx_contacts_forme_juridique 
  ON public.contacts(forme_juridique) 
  WHERE forme_juridique IS NOT NULL;

-- Create index on raison_sociale for better search performance
CREATE INDEX IF NOT EXISTS idx_contacts_raison_sociale 
  ON public.contacts(raison_sociale) 
  WHERE raison_sociale IS NOT NULL;