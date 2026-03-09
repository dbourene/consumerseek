/*
  # Enrichissement des consommateurs avec données d'entreprises

  ## Nouvelles colonnes
  
  Ajoute des colonnes pour stocker les informations d'enrichissement depuis l'API SIRENE :
  
  1. **Identification entreprise**
    - `siren` (text) : Numéro SIREN (9 chiffres) - identifiant unique de l'entreprise
    - `siret` (text) : Numéro SIRET (14 chiffres) - identifiant unique de l'établissement
    - `nom_entreprise` (text) : Raison sociale ou dénomination de l'entreprise
  
  2. **Adresse INSEE**
    - `adresse_insee` (text) : Adresse complète de l'établissement selon l'INSEE
    - `code_postal_insee` (text) : Code postal INSEE
    - `commune_insee` (text) : Libellé de la commune INSEE
  
  3. **Activité**
    - `code_naf` (text) : Code NAF complet (5 caractères : 4 chiffres + 1 lettre)
    - `intitule_naf` (text) : Libellé complet du code NAF
  
  4. **Métadonnées de rapprochement**
    - `sirene_matched_at` (timestamptz) : Date du rapprochement
    - `sirene_match_score` (float) : Score de confiance du rapprochement (0-100)
    - `sirene_match_method` (text) : Méthode utilisée pour le rapprochement
    - `sirene_validated` (boolean) : Validation manuelle par l'utilisateur
    - `sirene_notes` (text) : Notes sur le rapprochement
  
  ## Notes importantes
  
  - Les colonnes sont nullables car tous les consommateurs ne seront pas enrichis
  - Le score de confiance aide à prioriser les validations manuelles
  - La méthode de match permet de comprendre comment le rapprochement a été fait
*/

-- Identification entreprise
ALTER TABLE consommateurs
ADD COLUMN IF NOT EXISTS siren text,
ADD COLUMN IF NOT EXISTS siret text,
ADD COLUMN IF NOT EXISTS nom_entreprise text;

-- Adresse INSEE
ALTER TABLE consommateurs
ADD COLUMN IF NOT EXISTS adresse_insee text,
ADD COLUMN IF NOT EXISTS code_postal_insee text,
ADD COLUMN IF NOT EXISTS commune_insee text;

-- Activité
ALTER TABLE consommateurs
ADD COLUMN IF NOT EXISTS code_naf text,
ADD COLUMN IF NOT EXISTS intitule_naf text;

-- Métadonnées de rapprochement
ALTER TABLE consommateurs
ADD COLUMN IF NOT EXISTS sirene_matched_at timestamptz,
ADD COLUMN IF NOT EXISTS sirene_match_score float,
ADD COLUMN IF NOT EXISTS sirene_match_method text,
ADD COLUMN IF NOT EXISTS sirene_validated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sirene_notes text;

-- Index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_consommateurs_siren ON consommateurs(siren) WHERE siren IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consommateurs_siret ON consommateurs(siret) WHERE siret IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consommateurs_code_naf ON consommateurs(code_naf) WHERE code_naf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consommateurs_sirene_validated ON consommateurs(sirene_validated) WHERE sirene_validated IS NOT NULL;

-- Commentaires pour documentation
COMMENT ON COLUMN consommateurs.siren IS 'Numéro SIREN (9 chiffres) depuis API SIRENE';
COMMENT ON COLUMN consommateurs.siret IS 'Numéro SIRET (14 chiffres) depuis API SIRENE';
COMMENT ON COLUMN consommateurs.nom_entreprise IS 'Raison sociale de l''entreprise';
COMMENT ON COLUMN consommateurs.sirene_match_score IS 'Score de confiance du rapprochement (0-100)';
COMMENT ON COLUMN consommateurs.sirene_match_method IS 'Méthode: address_exact, address_fuzzy, naf_proximity, manual';
