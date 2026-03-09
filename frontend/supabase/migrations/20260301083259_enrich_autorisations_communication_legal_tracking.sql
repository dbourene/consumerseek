/*
  # Enrichissement de la table autorisations_communication pour conformité juridique

  1. Nouveaux champs ajoutés
    - `user_agent` : Navigateur et OS de l'utilisateur
    - `policy_version_id` : Référence vers la version exacte de la politique acceptée
    - `consent_text_hash` : Hash SHA-256 du texte de consentement accepté
    - `consent_snapshot` : Snapshot JSON complet de l'événement de consentement
    - `server_timestamp_utc` : Timestamp serveur UTC (immutable)
    - `revoked_at` : Date de révocation du consentement
    - `revoked_by` : Qui a révoqué (user_id)
    - `revocation_reason` : Raison de la révocation

  2. Sécurité
    - Trigger pour empêcher modification des champs critiques
    - Horodatage serveur uniquement
    - Snapshot immutable

  3. Migration des données existantes
    - Génération de hash pour les données existantes
    - Assignation de la version V1 de la politique par défaut
*/

-- Ajouter les nouveaux champs de traçabilité juridique
DO $$
BEGIN
  -- User agent (navigateur)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN user_agent text;
  END IF;

  -- Référence vers la version de politique acceptée
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'policy_version_id'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN policy_version_id uuid REFERENCES policy_versions(id);
  END IF;

  -- Hash du texte de consentement
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'consent_text_hash'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN consent_text_hash text;
  END IF;

  -- Snapshot JSON complet de l'événement
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'consent_snapshot'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN consent_snapshot jsonb;
  END IF;

  -- Timestamp serveur UTC (horodatage fiable)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'server_timestamp_utc'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN server_timestamp_utc timestamptz DEFAULT (now() AT TIME ZONE 'UTC');
  END IF;

  -- Champs de révocation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'revoked_at'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN revoked_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'revoked_by'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN revoked_by uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'revocation_reason'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN revocation_reason text;
  END IF;

  -- Statut de consentement (ACTIVE, REVOKED, EXPIRED)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'consent_status'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN consent_status text DEFAULT 'ACTIVE' CHECK (consent_status IN ('ACTIVE', 'REVOKED', 'EXPIRED'));
  END IF;

  -- IP address (copie centralisée depuis contacts)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'autorisations_communication' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE autorisations_communication ADD COLUMN ip_address inet;
  END IF;
END $$;

-- Créer des index pour optimiser les requêtes d'audit
CREATE INDEX IF NOT EXISTS idx_autorisations_consent_status ON autorisations_communication(consent_status);
CREATE INDEX IF NOT EXISTS idx_autorisations_revoked_at ON autorisations_communication(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_autorisations_server_timestamp ON autorisations_communication(server_timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_autorisations_policy_version ON autorisations_communication(policy_version_id);

-- Migrer les données existantes AVANT d'ajouter les triggers de protection
UPDATE autorisations_communication
SET policy_version_id = (
  SELECT id FROM policy_versions WHERE policy_code = 'CONSENT_TEXT' AND version = 'V1' LIMIT 1
)
WHERE policy_version_id IS NULL;

-- Générer un hash pour les consentements existants (approximatif)
UPDATE autorisations_communication
SET consent_text_hash = calculate_text_hash(
  COALESCE(contact_id::text, '') || '|' || 
  COALESCE(created_at::text, '') || '|' ||
  'legacy_consent'
)
WHERE consent_text_hash IS NULL;

-- Trigger pour auto-remplir server_timestamp_utc lors de l'insertion
CREATE OR REPLACE FUNCTION set_server_timestamp_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.server_timestamp_utc IS NULL THEN
    NEW.server_timestamp_utc := (now() AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fonction trigger pour empêcher modification des champs critiques après création
CREATE OR REPLACE FUNCTION protect_consent_critical_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Empêcher modification des champs critiques (sauf révocation)
  IF OLD.contact_id IS DISTINCT FROM NEW.contact_id THEN
    RAISE EXCEPTION 'Cannot modify contact_id after consent creation';
  END IF;

  IF OLD.consent_text_hash IS DISTINCT FROM NEW.consent_text_hash THEN
    RAISE EXCEPTION 'Cannot modify consent_text_hash after creation';
  END IF;

  IF OLD.server_timestamp_utc IS DISTINCT FROM NEW.server_timestamp_utc THEN
    RAISE EXCEPTION 'Cannot modify server_timestamp_utc - it is immutable';
  END IF;

  IF OLD.consent_snapshot IS DISTINCT FROM NEW.consent_snapshot THEN
    RAISE EXCEPTION 'Cannot modify consent_snapshot - it is immutable';
  END IF;

  IF OLD.policy_version_id IS DISTINCT FROM NEW.policy_version_id THEN
    RAISE EXCEPTION 'Cannot modify policy_version_id after creation';
  END IF;

  IF OLD.consent_rgpd IS DISTINCT FROM NEW.consent_rgpd THEN
    RAISE EXCEPTION 'Cannot modify consent_rgpd after creation';
  END IF;

  -- Autoriser uniquement la révocation
  IF NEW.consent_status = 'REVOKED' AND OLD.consent_status != 'REVOKED' THEN
    IF NEW.revoked_at IS NULL THEN
      NEW.revoked_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Appliquer le trigger de protection
DROP TRIGGER IF EXISTS protect_consent_fields ON autorisations_communication;
CREATE TRIGGER protect_consent_fields
  BEFORE UPDATE ON autorisations_communication
  FOR EACH ROW
  EXECUTE FUNCTION protect_consent_critical_fields();

-- Appliquer le trigger de timestamp
DROP TRIGGER IF EXISTS set_server_timestamp_autorisations ON autorisations_communication;
CREATE TRIGGER set_server_timestamp_autorisations
  BEFORE INSERT ON autorisations_communication
  FOR EACH ROW
  EXECUTE FUNCTION set_server_timestamp_on_insert();