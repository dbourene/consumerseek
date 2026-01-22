/*
  # Create Pattern System and Business Intelligence Tables

  1. New Tables
    - `patterns_globaux` - Global regex patterns (dates, amounts, kWh, etc.)
    - `patterns_fournisseurs` - Supplier-specific templates
    - `patterns_utilisateurs` - User-specific patterns for local suppliers
    - `regles_coherence_metier` - Business coherence rules
    - `referentiel_tarifs_energie` - Energy tariff reference data

  2. Security
    - Global and supplier patterns: read public, write admin
    - User patterns: RLS by user_id
    - Coherence rules: read public, write admin
    - Tariff reference: read public, write admin
*/

-- Global patterns (universal regex)
CREATE TABLE IF NOT EXISTS patterns_globaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('date', 'montant', 'kwh', 'puissance', 'pdl', 'fournisseur', 'tarif', 'autre')),
  regex text NOT NULL,
  description text NOT NULL,
  priorite int DEFAULT 100,
  actif boolean DEFAULT true,
  exemples jsonb, -- Examples for testing
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patterns_globaux_type ON patterns_globaux(type);
CREATE INDEX IF NOT EXISTS idx_patterns_globaux_actif ON patterns_globaux(actif);

-- Supplier-specific patterns
CREATE TABLE IF NOT EXISTS patterns_fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_fournisseur text NOT NULL,
  alias_detection text[] NOT NULL, -- Variants for detection (e.g., ['EDF', 'Electricité de France'])
  template_structure jsonb, -- Typical field positions
  regex_specifiques jsonb, -- Supplier-specific regex
  intelligence_metier jsonb, -- Business rules (e.g., {"arenh_position": "page_2"})
  confiance_moyenne float DEFAULT 0,
  nb_utilisations int DEFAULT 0,
  derniere_utilisation timestamptz,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patterns_fournisseurs_nom ON patterns_fournisseurs(nom_fournisseur);
CREATE INDEX IF NOT EXISTS idx_patterns_fournisseurs_actif ON patterns_fournisseurs(actif);

-- User-specific patterns (learning from corrections)
CREATE TABLE IF NOT EXISTS patterns_utilisateurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  base_sur_fournisseur_id uuid REFERENCES patterns_fournisseurs(id) ON DELETE SET NULL,
  fournisseur_local text, -- For local utilities (e.g., "Régie Municipale Grenoble")
  customisations jsonb NOT NULL, -- User-specific adjustments
  confiance_moyenne float DEFAULT 0,
  nb_utilisations int DEFAULT 0,
  derniere_utilisation timestamptz,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patterns_utilisateurs_user_id ON patterns_utilisateurs(user_id);
CREATE INDEX IF NOT EXISTS idx_patterns_utilisateurs_fournisseur_id ON patterns_utilisateurs(base_sur_fournisseur_id);

-- Business coherence rules
CREATE TABLE IF NOT EXISTS regles_coherence_metier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_regle text NOT NULL,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('calcul', 'plage', 'obligatoire_si', 'format', 'logique')),
  formule jsonb NOT NULL, -- Rule formula (e.g., {"check": "prix_unitaire ≈ total / kwh", "tolerance": 0.05})
  severite text DEFAULT 'avertissement' CHECK (severite IN ('erreur', 'avertissement', 'info')),
  actif boolean DEFAULT true,
  ordre_execution int DEFAULT 100,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regles_coherence_actif ON regles_coherence_metier(actif);
CREATE INDEX IF NOT EXISTS idx_regles_coherence_severite ON regles_coherence_metier(severite);

-- Energy tariff reference (for coherence checks)
CREATE TABLE IF NOT EXISTS referentiel_tarifs_energie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annee int NOT NULL,
  mois int NOT NULL CHECK (mois >= 1 AND mois <= 12),
  type_tarif text NOT NULL, -- 'bleu', 'jaune', 'vert', 'turpe_5', 'turpe_6', etc.
  puissance_min_kva decimal(10,2),
  puissance_max_kva decimal(10,2),
  prix_moyen_kwh decimal(10,6) NOT NULL,
  prix_min_kwh decimal(10,6) NOT NULL,
  prix_max_kwh decimal(10,6) NOT NULL,
  source text DEFAULT 'CRE', -- 'CRE', 'manuel', etc.
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referentiel_periode ON referentiel_tarifs_energie(annee, mois);
CREATE INDEX IF NOT EXISTS idx_referentiel_type_tarif ON referentiel_tarifs_energie(type_tarif);

-- RLS Policies

-- Global patterns: read public, write admin only
ALTER TABLE patterns_globaux ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view global patterns"
  ON patterns_globaux FOR SELECT
  TO authenticated
  USING (true);

-- Supplier patterns: read public, write admin only
ALTER TABLE patterns_fournisseurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view supplier patterns"
  ON patterns_fournisseurs FOR SELECT
  TO authenticated
  USING (true);

-- User patterns: full RLS by user_id
ALTER TABLE patterns_utilisateurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own patterns"
  ON patterns_utilisateurs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own patterns"
  ON patterns_utilisateurs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patterns"
  ON patterns_utilisateurs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own patterns"
  ON patterns_utilisateurs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Coherence rules: read public, write admin only
ALTER TABLE regles_coherence_metier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view coherence rules"
  ON regles_coherence_metier FOR SELECT
  TO authenticated
  USING (true);

-- Tariff reference: read public, write admin only
ALTER TABLE referentiel_tarifs_energie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tariff reference"
  ON referentiel_tarifs_energie FOR SELECT
  TO authenticated
  USING (true);