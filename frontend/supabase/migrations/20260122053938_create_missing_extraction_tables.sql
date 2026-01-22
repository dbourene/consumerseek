/*
  # Create Missing Extraction and Learning Tables

  1. New Tables
    - `extractions_brutes` - Raw OCR and LLM extraction results
    - `extractions_validees` - User-validated ground truth data
    - `historique_corrections` - Correction tracking for learning
    - `llm_prompts` - Versioned prompts with performance metrics

  2. Security
    - Enable RLS on all tables
    - Authenticated users can manage all extraction data
*/

-- Table for raw OCR extractions
CREATE TABLE IF NOT EXISTS extractions_brutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  ocr_text text NOT NULL,
  ocr_confidence numeric,
  ocr_metadata jsonb DEFAULT '{}',
  llm_raw_output jsonb,
  llm_model_version text,
  extraction_timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Table for validated extractions (ground truth)
CREATE TABLE IF NOT EXISTS extractions_validees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  extraction_brute_id uuid REFERENCES extractions_brutes(id) ON DELETE SET NULL,
  validated_data jsonb NOT NULL,
  validation_user_id uuid REFERENCES auth.users(id),
  validation_timestamp timestamptz DEFAULT now(),
  nb_corrections integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table for correction history and analytics
CREATE TABLE IF NOT EXISTS historique_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  extraction_brute_id uuid REFERENCES extractions_brutes(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  valeur_initiale text,
  valeur_corrigee text,
  user_id uuid REFERENCES auth.users(id),
  correction_timestamp timestamptz DEFAULT now(),
  fournisseur_name text,
  ocr_confidence_at_location numeric,
  position_metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Table for LLM prompt versioning
CREATE TABLE IF NOT EXISTS llm_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  prompt_template text NOT NULL,
  model_name text,
  avg_extraction_accuracy numeric DEFAULT 0,
  total_uses integer DEFAULT 0,
  avg_processing_time_ms integer,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_extractions_brutes_facture ON extractions_brutes(facture_id);
CREATE INDEX IF NOT EXISTS idx_extractions_validees_facture ON extractions_validees(facture_id);
CREATE INDEX IF NOT EXISTS idx_historique_corrections_facture ON historique_corrections(facture_id);
CREATE INDEX IF NOT EXISTS idx_historique_corrections_field ON historique_corrections(field_name);
CREATE INDEX IF NOT EXISTS idx_llm_prompts_active ON llm_prompts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_llm_prompts_version ON llm_prompts(version);

-- Enable RLS
ALTER TABLE extractions_brutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions_validees ENABLE ROW LEVEL SECURITY;
ALTER TABLE historique_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for extractions_brutes
CREATE POLICY "Authenticated users can view raw extractions"
  ON extractions_brutes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert raw extractions"
  ON extractions_brutes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for extractions_validees
CREATE POLICY "Authenticated users can view validated extractions"
  ON extractions_validees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert validated extractions"
  ON extractions_validees FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update validated extractions"
  ON extractions_validees FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for historique_corrections
CREATE POLICY "Authenticated users can view corrections"
  ON historique_corrections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert corrections"
  ON historique_corrections FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for llm_prompts
CREATE POLICY "Authenticated users can view prompts"
  ON llm_prompts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage prompts"
  ON llm_prompts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default LLM prompt
INSERT INTO llm_prompts (version, prompt_template, model_name, is_active)
VALUES (
  'v1.0',
  E'Extraire toutes les informations de cette facture d''électricité française.\n\nTexte OCR :\n{ocr_text}\n\nExtraire et retourner un objet JSON avec ces champs exacts :\n{\n  "fournisseur": "nom du fournisseur (EDF, Engie, Total Energies, etc.)",\n  "pdl": "numéro PDL à 14 chiffres",\n  "annee": "année en entier",\n  "periode_debut": "date début YYYY-MM-DD",\n  "periode_fin": "date fin YYYY-MM-DD",\n  "type_compteur": "type de compteur",\n  "puissance_souscrite_kva": "puissance souscrite en kVA (nombre)",\n  "temporalite": "base, hp_hc, tempo, ou ejp",\n  "conso_totale": "consommation totale en kWh (nombre)",\n  "conso_base": "consommation base (nombre)",\n  "conso_hp": "consommation heures pleines (nombre)",\n  "conso_hc": "consommation heures creuses (nombre)",\n  "conso_hph": "consommation HPH (nombre)",\n  "conso_hch": "consommation HCH (nombre)",\n  "conso_hpb": "consommation HPB (nombre)",\n  "conso_hcb": "consommation HCB (nombre)",\n  "conso_pointe": "consommation pointe (nombre)",\n  "tarif_base_parkwh": "tarif base par kWh (nombre)",\n  "tarif_hp_parkwh": "tarif HP par kWh (nombre)",\n  "tarif_hc_parkwh": "tarif HC par kWh (nombre)",\n  "prix_total_ht": "prix total HT (nombre)",\n  "prix_total_ttc": "prix total TTC (nombre)",\n  "tarif_abonnement": "tarif abonnement (nombre)",\n  "montant_fourniture_ht": "montant fourniture HT (nombre)",\n  "montant_acheminement_ht": "montant acheminement HT (nombre)",\n  "montant_arenh": "montant ARENH (nombre)",\n  "contient_arenh": true/false,\n  "contient_turpe": true/false\n}\n\nRetourner UNIQUEMENT du JSON valide. Utiliser null pour les valeurs manquantes.',
  'mistral-7b',
  true
)
ON CONFLICT DO NOTHING;
