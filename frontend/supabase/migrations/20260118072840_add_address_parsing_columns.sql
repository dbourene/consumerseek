/*
  # Ajout des colonnes de parsing d'adresse

  1. Nouvelles Colonnes
    - `nom_societe` (text) - Nom de la société/établissement extrait de l'adresse
    - `complement_adresse` (text) - Complément d'adresse (ZI, ZA, lieu-dit, station, etc.)
    - `adresse_standardisee` (text) - Adresse nettoyée et standardisée pour le géocodage
    - `type_adresse_specifique` (text) - Type d'adresse spécifique détecté (zone_activite, lieu_dit, societe, station_technique, standard)
  
  2. Objectif
    - Améliorer significativement le géocodage des adresses non standard
    - Permettre l'extraction et la structuration des informations d'adresse
    - Faciliter la correction manuelle des adresses problématiques
  
  3. Notes
    - Ces colonnes seront remplies par un service de parsing intelligent
    - L'adresse_standardisee sera utilisée en priorité pour le géocodage
    - Le type_adresse_specifique permet d'identifier les cas particuliers
*/

-- Ajouter les nouvelles colonnes pour le parsing d'adresse
DO $$
BEGIN
  -- Colonne pour le nom de société/établissement
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'nom_societe'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN nom_societe text;
  END IF;

  -- Colonne pour le complément d'adresse (ZI, ZA, lieu-dit, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'complement_adresse'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN complement_adresse text;
  END IF;

  -- Colonne pour l'adresse standardisée (nettoyée pour géocodage)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'adresse_standardisee'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN adresse_standardisee text;
  END IF;

  -- Colonne pour le type d'adresse spécifique
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'type_adresse_specifique'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN type_adresse_specifique text;
  END IF;
END $$;

-- Créer un index sur le type d'adresse pour faciliter les analyses
CREATE INDEX IF NOT EXISTS idx_consommateurs_type_adresse_specifique 
ON consommateurs(type_adresse_specifique);

-- Créer un index sur l'adresse standardisée
CREATE INDEX IF NOT EXISTS idx_consommateurs_adresse_standardisee 
ON consommateurs(adresse_standardisee);
