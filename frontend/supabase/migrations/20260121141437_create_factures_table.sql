/*
  # Create Factures Table

  1. New Tables
    - `factures`
      - File metadata (fichier_path, fichier_nom, etc.)
      - Extraction status and confidence
      - Consumer identification (consommateur_id, commune, etc.)
      - Billing period and supplier
      - Detailed energy tariffs by temporality (base, HP/HC, HPH/HCH, HPB/HCB, pointe)
      - Consumption by temporality
      - Network costs (TURPE, CTA)
      - Taxes (Accise)
      - Business intelligence flags (ARENH, coherence checks)

  2. Security
    - Enable RLS on `factures` table
    - Add policy for authenticated users to manage their own invoices
    - Add limited access for anonymous users via invitation token
*/

CREATE TABLE IF NOT EXISTS factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES invitations_factures(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  consommateur_id bigint REFERENCES consommateurs(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- File metadata
  fichier_path text NOT NULL,
  fichier_nom text NOT NULL,
  fichier_taille bigint NOT NULL,
  fichier_hash text,
  date_upload timestamptz DEFAULT now(),
  
  -- Extraction status
  statut_extraction text DEFAULT 'en_attente' CHECK (statut_extraction IN ('en_attente', 'en_cours', 'extraite', 'validée', 'erreur')),
  date_extraction timestamptz,
  confiance_globale float CHECK (confiance_globale >= 0 AND confiance_globale <= 100),
  necessite_validation boolean DEFAULT true,
  
  -- Consumer identification
  nom_commune text,
  code_departement text,
  code_naf text,
  code_naf2 text,
  tranche_conso text,
  categorie_activite text,
  pdl text, -- Point De Livraison
  
  -- Billing period and supplier
  annee int,
  periode_debut date,
  periode_fin date,
  fournisseur text,
  version_tarif text, -- C5, TURPE 5, TURPE 6, etc.
  type_compteur text, -- C1-C5, Linky, etc.
  
  -- Power subscription
  puissance_souscrite_kva decimal(10,2),
  temporalite text, -- 'base', 'hphc', 'tempo', 'ejp', etc.
  
  -- Unit tariffs by temporality (€/kWh)
  tarif_base_parkwh decimal(10,6),
  tarif_hp_parkwh decimal(10,6),
  tarif_hc_parkwh decimal(10,6),
  tarif_hph_parkwh decimal(10,6), -- Heures Pleines Hiver
  tarif_hch_parkwh decimal(10,6), -- Heures Creuses Hiver
  tarif_hpb_parkwh decimal(10,6), -- Heures Pleines Été (Basse saison)
  tarif_hcb_parkwh decimal(10,6), -- Heures Creuses Été
  tarif_pointe_parkwh decimal(10,6),
  
  -- Consumption by temporality (kWh)
  conso_totale decimal(12,2),
  conso_base decimal(12,2),
  conso_hp decimal(12,2),
  conso_hc decimal(12,2),
  conso_hph decimal(12,2),
  conso_hch decimal(12,2),
  conso_hpb decimal(12,2),
  conso_hcb decimal(12,2),
  conso_pointe decimal(12,2),
  
  -- Network and taxes
  tarif_abonnement decimal(10,2), -- Fixed part
  tarif_accise_parkwh decimal(10,6), -- Ex-TICFE
  tarif_acheminement_total decimal(10,2), -- TURPE total
  tarif_cta_total decimal(10,2), -- CTA total
  tarif_cta_unitaire decimal(10,6), -- CTA per kWh
  
  -- Total amounts
  montant_fourniture_ht decimal(10,2), -- Supply only
  montant_acheminement_ht decimal(10,2), -- TURPE
  montant_arenh decimal(10,2), -- If ARENH applied
  montant_taxes_total decimal(10,2), -- Total taxes
  prix_total_ht decimal(10,2),
  prix_total_ttc decimal(10,2),
  
  -- Business intelligence flags
  contient_arenh boolean DEFAULT false,
  contient_turpe boolean DEFAULT false,
  
  -- Coherence checks
  coherence_prix_unitaire boolean,
  coherence_periode boolean,
  coherence_puissance boolean,
  alertes_coherence jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_factures_user_id ON factures(user_id);
CREATE INDEX IF NOT EXISTS idx_factures_contact_id ON factures(contact_id);
CREATE INDEX IF NOT EXISTS idx_factures_consommateur_id ON factures(consommateur_id);
CREATE INDEX IF NOT EXISTS idx_factures_invitation_id ON factures(invitation_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures(statut_extraction);
CREATE INDEX IF NOT EXISTS idx_factures_fournisseur ON factures(fournisseur);
CREATE INDEX IF NOT EXISTS idx_factures_periode ON factures(periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_factures_pdl ON factures(pdl);
CREATE INDEX IF NOT EXISTS idx_factures_hash ON factures(fichier_hash);

-- Enable RLS
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own invoices
CREATE POLICY "Users can view own invoices"
  ON factures FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own invoices
CREATE POLICY "Users can insert own invoices"
  ON factures FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own invoices
CREATE POLICY "Users can update own invoices"
  ON factures FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own invoices
CREATE POLICY "Users can delete own invoices"
  ON factures FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Anonymous users can insert invoices via invitation token
CREATE POLICY "Anonymous can insert via invitation"
  ON factures FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invitations_factures
      WHERE invitations_factures.id = invitation_id
      AND invitations_factures.statut != 'expiré'
      AND invitations_factures.date_expiration > now()
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_factures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER factures_updated_at
  BEFORE UPDATE ON factures
  FOR EACH ROW
  EXECUTE FUNCTION update_factures_updated_at();