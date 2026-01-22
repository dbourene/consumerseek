/*
  # Create Validation and Ground Truth Tables

  1. New Tables
    - `validations_factures` - Human validations (ground truth)
    - `corrections_historique` - Correction history for learning
    - `extractions_facture_details` - Detailed extraction results per field

  2. Security
    - Enable RLS on all tables
    - Users can only access their own data
*/

-- Validations (ground truth for future ML)
CREATE TABLE IF NOT EXISTS validations_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid REFERENCES factures(id) ON DELETE CASCADE NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date_validation timestamptz DEFAULT now(),
  temps_validation_secondes int, -- Quality metric
  
  -- Validated identification
  fournisseur text NOT NULL,
  pdl text,
  
  -- Validated period and location
  periode_debut date NOT NULL,
  periode_fin date NOT NULL,
  nom_commune text,
  code_departement text,
  
  -- Validated power and temporality
  puissance_souscrite_kva decimal(10,2),
  temporalite text,
  type_compteur text,
  version_tarif text,
  
  -- Validated tariffs (€/kWh)
  tarif_base_parkwh decimal(10,6),
  tarif_hp_parkwh decimal(10,6),
  tarif_hc_parkwh decimal(10,6),
  tarif_hph_parkwh decimal(10,6),
  tarif_hch_parkwh decimal(10,6),
  tarif_hpb_parkwh decimal(10,6),
  tarif_hcb_parkwh decimal(10,6),
  tarif_pointe_parkwh decimal(10,6),
  
  -- Validated consumption (kWh)
  conso_totale decimal(12,2) NOT NULL,
  conso_base decimal(12,2),
  conso_hp decimal(12,2),
  conso_hc decimal(12,2),
  conso_hph decimal(12,2),
  conso_hch decimal(12,2),
  conso_hpb decimal(12,2),
  conso_hcb decimal(12,2),
  conso_pointe decimal(12,2),
  
  -- Validated costs
  tarif_abonnement decimal(10,2),
  tarif_accise_parkwh decimal(10,6),
  tarif_acheminement_total decimal(10,2),
  tarif_cta_total decimal(10,2),
  tarif_cta_unitaire decimal(10,6),
  
  -- Validated amounts
  montant_fourniture_ht decimal(10,2),
  montant_acheminement_ht decimal(10,2),
  montant_arenh decimal(10,2),
  montant_taxes_total decimal(10,2),
  prix_total_ht decimal(10,2) NOT NULL,
  prix_total_ttc decimal(10,2) NOT NULL,
  
  -- Validated business intelligence
  contient_arenh boolean DEFAULT false,
  montant_arenh_detail decimal(10,2),
  contient_turpe boolean DEFAULT false,
  type_tarif text, -- 'bleu', 'jaune', 'vert', etc.
  
  -- ML preparation
  utilise_pour_training boolean DEFAULT false,
  qualite_ground_truth text DEFAULT 'haute' CHECK (qualite_ground_truth IN ('haute', 'moyenne', 'faible')),
  notes_validation text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validations_facture_id ON validations_factures(facture_id);
CREATE INDEX IF NOT EXISTS idx_validations_user_id ON validations_factures(user_id);
CREATE INDEX IF NOT EXISTS idx_validations_training ON validations_factures(utilise_pour_training);
CREATE INDEX IF NOT EXISTS idx_validations_qualite ON validations_factures(qualite_ground_truth);

-- Correction history (for learning)
CREATE TABLE IF NOT EXISTS corrections_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid REFERENCES factures(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  champ_corrige text NOT NULL,
  valeur_avant text,
  valeur_apres text NOT NULL,
  pattern_origine_id uuid, -- Pattern that failed (for improvement)
  confiance_avant float,
  date_correction timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_facture_id ON corrections_historique(facture_id);
CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON corrections_historique(user_id);
CREATE INDEX IF NOT EXISTS idx_corrections_champ ON corrections_historique(champ_corrige);
CREATE INDEX IF NOT EXISTS idx_corrections_pattern ON corrections_historique(pattern_origine_id);

-- Detailed extraction results
CREATE TABLE IF NOT EXISTS extractions_facture_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid REFERENCES factures(id) ON DELETE CASCADE NOT NULL,
  type_champ text NOT NULL, -- 'montant', 'date', 'kwh', 'fournisseur', etc.
  libelle text, -- Field label (e.g., "Consommation totale")
  valeur_brute text, -- Raw OCR text
  valeur_interpretee text, -- Parsed value
  confiance float CHECK (confiance >= 0 AND confiance <= 100),
  position_x int,
  position_y int,
  bbox jsonb, -- Bounding box coordinates
  pattern_id uuid, -- Pattern that matched
  page_numero int DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extractions_facture_id ON extractions_facture_details(facture_id);
CREATE INDEX IF NOT EXISTS idx_extractions_type ON extractions_facture_details(type_champ);
CREATE INDEX IF NOT EXISTS idx_extractions_pattern ON extractions_facture_details(pattern_id);

-- RLS Policies

ALTER TABLE validations_factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own validations"
  ON validations_factures FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own validations"
  ON validations_factures FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own validations"
  ON validations_factures FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE corrections_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own corrections"
  ON corrections_historique FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own corrections"
  ON corrections_historique FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE extractions_facture_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own extraction details"
  ON extractions_facture_details FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = extractions_facture_details.facture_id
      AND factures.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own extraction details"
  ON extractions_facture_details FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_id
      AND factures.user_id = auth.uid()
    )
  );