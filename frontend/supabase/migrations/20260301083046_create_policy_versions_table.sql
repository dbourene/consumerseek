/*
  # Création de la table de versioning des politiques RGPD et CGU

  1. Nouvelle table `policy_versions`
    - Stocke toutes les versions des textes légaux (RGPD, CGU, textes de consentement)
    - Hash SHA-256 pour garantir l'intégrité
    - Immutabilité totale via RLS et triggers
    - Horodatage serveur uniquement

  2. Sécurité
    - RLS activé avec lecture seule pour authenticated
    - Aucune modification/suppression possible
    - Trigger empêchant toute modification

  3. Indexation
    - Index sur code de politique + version
    - Index sur hash pour vérification d'intégrité
*/

-- Table de versioning des politiques RGPD/CGU
CREATE TABLE IF NOT EXISTS policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  full_text text NOT NULL,
  text_hash text NOT NULL,
  effective_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  server_timestamp_utc timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  created_by uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,

  CONSTRAINT unique_policy_version UNIQUE(policy_code, version),
  CONSTRAINT valid_hash CHECK (text_hash ~ '^[a-f0-9]{64}$')
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_policy_versions_code ON policy_versions(policy_code);
CREATE INDEX IF NOT EXISTS idx_policy_versions_effective_date ON policy_versions(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_policy_versions_hash ON policy_versions(text_hash);

-- Activer RLS
ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;

-- Politique : lecture seule pour tous les utilisateurs authentifiés
CREATE POLICY "Authenticated users can read policy versions"
  ON policy_versions FOR SELECT
  TO authenticated
  USING (true);

-- Politique : seuls les utilisateurs authentifiés peuvent insérer (création initiale)
CREATE POLICY "Authenticated users can insert policy versions"
  ON policy_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Fonction pour empêcher toute modification ou suppression
CREATE OR REPLACE FUNCTION prevent_policy_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Policy versions are immutable and cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers d'immutabilité
DROP TRIGGER IF EXISTS prevent_policy_update ON policy_versions;
CREATE TRIGGER prevent_policy_update
  BEFORE UPDATE ON policy_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_policy_modification();

DROP TRIGGER IF EXISTS prevent_policy_delete ON policy_versions;
CREATE TRIGGER prevent_policy_delete
  BEFORE DELETE ON policy_versions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_policy_modification();

-- Fonction helper pour calculer le hash SHA-256
CREATE OR REPLACE FUNCTION calculate_text_hash(input_text text)
RETURNS text AS $$
BEGIN
  RETURN encode(digest(input_text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Insertion de la version actuelle de la politique RGPD (FRO027-V1-RGPD)
INSERT INTO policy_versions (
  policy_code,
  version,
  title,
  full_text,
  text_hash,
  effective_date,
  metadata
) VALUES (
  'RGPD',
  'V1',
  'Politique de protection des données à caractère personnel - Version 1',
  'Helioze est soucieux de la protection de vos données à caractère personnel. Il s''engage à ce titre à les protéger, en conformité avec la règlementation française et européenne applicable en matière de protection des données à caractère personnel.

ARTICLE 1 : RESPONSABLE DU TRAITEMENT
Les données personnelles que vous pouvez saisir sur Site font l''objet d''un traitement le cas échéant par Helioze, Société à Responsabilité Limitée, immatriculée au RCS de NANTES sous le N°977 700 616 00013, dont le siège social est sis 1 allée de la Blottière, 44240 La Chapelle-sur-Erdre – FRANCE, dénommée « Helioze», en qualité de responsable de traitement (ci-après le « Responsable du traitement »).

ARTICLE 2 : DONNÉES COLLECTÉES ET DURÉE DE CONSERVATION
Helioze par le biais de formulaires récupère les données suivantes :
• Pour les particuliers, données d''identification personnelles (ex : nom, prénom) et coordonnées (ex : adresse email, adresse postale) conservées pendant toute la durée de la fourniture du service à laquelle s''ajoutent les délais de prescriptions légaux qui sont généralement de 5 ans.
• Pour les professionnels, données d''identification personnelles (ex : nom, prénom, poste, entreprise, service, etc.) et coordonnées (ex : adresse email et téléphone professionnel, etc.) conservées pendant toute la durée de la fourniture du service à laquelle s''ajoutent les délais de prescriptions légaux qui sont généralement de 5 ans.
• Données relatives à la vie personnelle (ex : index de consommation, courbes de charge, puissances maximales quotidiennes etc.) ainsi que vos données techniques et contractuelles de vos sites raccordés au réseau public de distribution, conservées pendant toute la durée nécessaire à la réalisation de la prestation.
• Adresse email conservée jusqu''à la suppression de votre compte.
• Données de connexion (ex : logs, adresse IP, etc.) conservées pendant une durée de 1 an.
• Cookies qui sont en général conservés pendant une durée de 13 mois maximum.',
  calculate_text_hash('Helioze est soucieux de la protection de vos données à caractère personnel. Il s''engage à ce titre à les protéger, en conformité avec la règlementation française et européenne applicable en matière de protection des données à caractère personnel.

ARTICLE 1 : RESPONSABLE DU TRAITEMENT
Les données personnelles que vous pouvez saisir sur Site font l''objet d''un traitement le cas échéant par Helioze, Société à Responsabilité Limitée, immatriculée au RCS de NANTES sous le N°977 700 616 00013, dont le siège social est sis 1 allée de la Blottière, 44240 La Chapelle-sur-Erdre – FRANCE, dénommée « Helioze», en qualité de responsable de traitement (ci-après le « Responsable du traitement »).

ARTICLE 2 : DONNÉES COLLECTÉES ET DURÉE DE CONSERVATION
Helioze par le biais de formulaires récupère les données suivantes :
• Pour les particuliers, données d''identification personnelles (ex : nom, prénom) et coordonnées (ex : adresse email, adresse postale) conservées pendant toute la durée de la fourniture du service à laquelle s''ajoutent les délais de prescriptions légaux qui sont généralement de 5 ans.
• Pour les professionnels, données d''identification personnelles (ex : nom, prénom, poste, entreprise, service, etc.) et coordonnées (ex : adresse email et téléphone professionnel, etc.) conservées pendant toute la durée de la fourniture du service à laquelle s''ajoutent les délais de prescriptions légaux qui sont généralement de 5 ans.
• Données relatives à la vie personnelle (ex : index de consommation, courbes de charge, puissances maximales quotidiennes etc.) ainsi que vos données techniques et contractuelles de vos sites raccordés au réseau public de distribution, conservées pendant toute la durée nécessaire à la réalisation de la prestation.
• Adresse email conservée jusqu''à la suppression de votre compte.
• Données de connexion (ex : logs, adresse IP, etc.) conservées pendant une durée de 1 an.
• Cookies qui sont en général conservés pendant une durée de 13 mois maximum.'),
  '2024-01-01T00:00:00Z',
  jsonb_build_object(
    'document_reference', 'FRO027-V1-RGPD',
    'company', 'Helioze SARL',
    'rcs', 'Nantes 977 700 616'
  )
) ON CONFLICT (policy_code, version) DO NOTHING;

-- Insertion du texte de consentement standard
INSERT INTO policy_versions (
  policy_code,
  version,
  title,
  full_text,
  text_hash,
  effective_date,
  metadata
) VALUES (
  'CONSENT_TEXT',
  'V1',
  'Texte de consentement pour accès aux données Enedis',
  'J''accepte qu''Helioze accède à mes données de consommation et techniques auprès d''Enedis pour les Points de Référence et de Mesure (PRM) listés ci-dessus, dans le cadre de l''étude de faisabilité d''un projet photovoltaïque. Je reconnais avoir pris connaissance de la Politique de protection des données à caractère personnel (FRO027-V1-RGPD) et accepte le traitement de mes données conformément à celle-ci.',
  calculate_text_hash('J''accepte qu''Helioze accède à mes données de consommation et techniques auprès d''Enedis pour les Points de Référence et de Mesure (PRM) listés ci-dessus, dans le cadre de l''étude de faisabilité d''un projet photovoltaïque. Je reconnais avoir pris connaissance de la Politique de protection des données à caractère personnel (FRO027-V1-RGPD) et accepte le traitement de mes données conformément à celle-ci.'),
  '2024-01-01T00:00:00Z',
  jsonb_build_object(
    'purpose', 'Consentement explicite pour accès données Enedis',
    'scope', 'Données de consommation et techniques par PRM'
  )
) ON CONFLICT (policy_code, version) DO NOTHING;