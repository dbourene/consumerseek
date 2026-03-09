/*
  # Create SIRENE matching infrastructure

  1. New Tables
    - `societes`
      - `id` (uuid, primary key)
      - `siret` (text, unique) - Identifiant SIRET
      - `siren` (text) - Identifiant SIREN
      - `code_commune` (text) - Code commune de l'établissement
      - `denomination` (text) - Nom de l'unité légale
      - `nom_complet` (text) - Nom complet de l'établissement
      - `adresse_complete` (text) - Adresse complète
      - `adresse_numero` (text) - Numéro de voie
      - `adresse_type_voie` (text) - Type de voie
      - `adresse_libelle_voie` (text) - Libellé de voie
      - `code_postal` (text) - Code postal
      - `libelle_commune` (text) - Libellé commune
      - `activite_principale_etablissement` (text) - Code NAF de l'établissement
      - `activite_principale_unite_legale` (text) - Code NAF de l'unité légale
      - `tranche_effectifs_etablissement` (text) - Tranche d'effectifs
      - `etat_administratif_unite_legale` (text) - État administratif (A=Actif, C=Cessé)
      - `date_creation_etablissement` (date) - Date de création
      - `latitude` (double precision) - Coordonnées GPS
      - `longitude` (double precision) - Coordonnées GPS
      - `nom_voie_normalise` (text) - Nom de voie normalisé pour matching
      - `loaded_at` (timestamptz) - Date de chargement depuis l'API
      - `updated_at` (timestamptz) - Date de dernière mise à jour
      - `created_at` (timestamptz) - Date de création dans notre BDD

    - `sirene_loading_log`
      - `id` (uuid, primary key)
      - `code_commune` (text) - Code commune chargée
      - `loaded_at` (timestamptz) - Date du chargement
      - `nb_societes` (integer) - Nombre de sociétés chargées
      - `status` (text) - success/error
      - `error_message` (text) - Message d'erreur éventuel

  2. Changes to existing tables
    - `consommateurs`
      - Add `societe_id` (uuid, foreign key to societes) - Reference to matched société
      - Add `match_score` (numeric) - Score de confiance du rapprochement (0-100)
      - Add `match_method` (text) - Méthode utilisée (exact/fuzzy/geographic/manual)
      - Add `nom_voie_normalise` (text) - Nom de voie normalisé pour matching
      - Add `tranche_effectifs_etablissement` (text) - Tranche d'effectifs
      - Add `activite_principale_naf25_etablissement` (text) - Code NAF25

  3. Indexes
    - Index on societes(code_commune) for fast commune filtering
    - Index on societes(nom_voie_normalise) for fuzzy matching
    - Index on societes(activite_principale_etablissement) for NAF filtering
    - Index on societes(siret) unique
    - Index on consommateurs(nom_voie_normalise) for fuzzy matching
    - Index on consommateurs(code_secteur_naf2) for NAF filtering
    - Index on consommateurs(societe_id) for joins

  4. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

-- Create societes table
CREATE TABLE IF NOT EXISTS societes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siret text UNIQUE NOT NULL,
  siren text,
  code_commune text,
  denomination text,
  nom_complet text,
  adresse_complete text,
  adresse_numero text,
  adresse_type_voie text,
  adresse_libelle_voie text,
  code_postal text,
  libelle_commune text,
  activite_principale_etablissement text,
  activite_principale_unite_legale text,
  tranche_effectifs_etablissement text,
  etat_administratif_unite_legale text DEFAULT 'A',
  date_creation_etablissement date,
  latitude double precision,
  longitude double precision,
  nom_voie_normalise text,
  loaded_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create SIRENE loading log table
CREATE TABLE IF NOT EXISTS sirene_loading_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_commune text NOT NULL,
  loaded_at timestamptz DEFAULT now(),
  nb_societes integer DEFAULT 0,
  status text DEFAULT 'success',
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Add new columns to consommateurs table (only if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'societe_id'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN societe_id uuid REFERENCES societes(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'match_score'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN match_score numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'match_method'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN match_method text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'nom_voie_normalise'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN nom_voie_normalise text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'tranche_effectifs_etablissement'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN tranche_effectifs_etablissement text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consommateurs' AND column_name = 'activite_principale_naf25_etablissement'
  ) THEN
    ALTER TABLE consommateurs ADD COLUMN activite_principale_naf25_etablissement text;
  END IF;
END $$;

-- Create indexes on societes
CREATE INDEX IF NOT EXISTS idx_societes_code_commune ON societes(code_commune);
CREATE INDEX IF NOT EXISTS idx_societes_nom_voie_normalise ON societes(nom_voie_normalise);
CREATE INDEX IF NOT EXISTS idx_societes_activite_principale ON societes(activite_principale_etablissement);
CREATE INDEX IF NOT EXISTS idx_societes_siret ON societes(siret);
CREATE INDEX IF NOT EXISTS idx_societes_etat_administratif ON societes(etat_administratif_unite_legale);

-- Create indexes on consommateurs for matching
CREATE INDEX IF NOT EXISTS idx_consommateurs_nom_voie_normalise ON consommateurs(nom_voie_normalise);
CREATE INDEX IF NOT EXISTS idx_consommateurs_code_secteur_naf2 ON consommateurs(code_secteur_naf2);
CREATE INDEX IF NOT EXISTS idx_consommateurs_societe_id ON consommateurs(societe_id);
CREATE INDEX IF NOT EXISTS idx_consommateurs_code_commune ON consommateurs(code_commune);

-- Create index on sirene_loading_log
CREATE INDEX IF NOT EXISTS idx_sirene_loading_log_code_commune ON sirene_loading_log(code_commune, loaded_at DESC);

-- Enable RLS
ALTER TABLE societes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sirene_loading_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for societes
CREATE POLICY "Authenticated users can read societes"
  ON societes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert societes"
  ON societes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update societes"
  ON societes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete societes"
  ON societes FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for sirene_loading_log
CREATE POLICY "Authenticated users can read loading log"
  ON sirene_loading_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert loading log"
  ON sirene_loading_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to check if commune needs SIRENE reload (> 6 months)
CREATE OR REPLACE FUNCTION needs_sirene_reload(p_code_commune text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_load timestamptz;
BEGIN
  SELECT MAX(loaded_at) INTO last_load
  FROM sirene_loading_log
  WHERE code_commune = p_code_commune AND status = 'success';

  -- If never loaded or loaded more than 6 months ago
  RETURN last_load IS NULL OR last_load < now() - interval '6 months';
END;
$$;

-- Function to get communes needing SIRENE data
CREATE OR REPLACE FUNCTION get_communes_for_sirene_loading()
RETURNS TABLE(code_commune text, nom_commune text, needs_reload boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    c.code_commune,
    c.nom_commune,
    needs_sirene_reload(c.code_commune) as needs_reload
  FROM communes c
  WHERE c.geometry IS NOT NULL
  ORDER BY c.nom_commune;
END;
$$;