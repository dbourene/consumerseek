/*
  # Création de la table consent_events (append-only)

  1. Table `consent_events`
    - Journal immutable de TOUS les événements de consentement
    - CREATION, MODIFICATION, REVOCATION, EXPIRATION
    - Hash cryptographique de chaque événement
    - Impossible de modifier/supprimer (append-only)
    - Horodatage serveur uniquement

  2. Champs obligatoires
    - prm (peut être array pour consentements multiples)
    - event_type (CREATION, MODIFICATION, REVOCATION, EXPIRATION)
    - identity_client (données du titulaire)
    - server_timestamp_utc
    - ip_address
    - user_agent
    - policy_version_id
    - consent_text_hash
    - event_hash (hash de l'événement complet)

  3. Sécurité
    - RLS avec lecture seule
    - Aucune modification/suppression possible
    - Journalisation automatique via triggers

  4. Indexation
    - Index sur PRM pour recherche rapide
    - Index sur type d'événement
    - Index sur timestamp pour audit chronologique
*/

CREATE TABLE IF NOT EXISTS consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Type d'événement
  event_type text NOT NULL CHECK (event_type IN ('CREATION', 'MODIFICATION', 'REVOCATION', 'EXPIRATION', 'REACTIVATION')),
  
  -- Référence à l'autorisation
  autorisation_id uuid REFERENCES autorisations_communication(id),
  
  -- Référence au PRM
  prm_id uuid REFERENCES prm(id),
  prm_number text NOT NULL,
  
  -- Identité du client (snapshot immutable)
  identity_client jsonb NOT NULL,
  
  -- Métadonnées techniques
  server_timestamp_utc timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  ip_address inet,
  user_agent text,
  
  -- Référence politique et consentement
  policy_version_id uuid REFERENCES policy_versions(id) NOT NULL,
  consent_text_hash text NOT NULL,
  consent_given boolean NOT NULL,
  
  -- Snapshot JSON canonique de l'événement
  event_data jsonb NOT NULL,
  
  -- Hash cryptographique SHA-256 de l'événement complet
  event_hash text NOT NULL,
  
  -- Qui a déclenché l'événement (user_id ou system)
  triggered_by uuid REFERENCES auth.users(id),
  triggered_by_type text DEFAULT 'user' CHECK (triggered_by_type IN ('user', 'system', 'api')),
  
  -- Métadonnées additionnelles
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_event_hash CHECK (event_hash ~ '^[a-f0-9]{64}$')
);

-- Index pour audit par PRM
CREATE INDEX IF NOT EXISTS idx_consent_events_prm_number ON consent_events(prm_number);
CREATE INDEX IF NOT EXISTS idx_consent_events_prm_id ON consent_events(prm_id);
CREATE INDEX IF NOT EXISTS idx_consent_events_autorisation ON consent_events(autorisation_id);

-- Index pour audit par type et timestamp
CREATE INDEX IF NOT EXISTS idx_consent_events_type ON consent_events(event_type);
CREATE INDEX IF NOT EXISTS idx_consent_events_timestamp ON consent_events(server_timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_consent_events_hash ON consent_events(event_hash);

-- Index composite pour requêtes d'audit
CREATE INDEX IF NOT EXISTS idx_consent_events_prm_timestamp ON consent_events(prm_number, server_timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_consent_events_type_timestamp ON consent_events(event_type, server_timestamp_utc DESC);

-- Activer RLS
ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;

-- Politique : lecture seule pour utilisateurs authentifiés
CREATE POLICY "Authenticated users can read consent events"
  ON consent_events FOR SELECT
  TO authenticated
  USING (true);

-- Politique : insertion uniquement (append-only)
CREATE POLICY "Authenticated users can insert consent events"
  ON consent_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Fonction pour empêcher toute modification ou suppression (immutabilité stricte)
CREATE OR REPLACE FUNCTION prevent_consent_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Consent events are immutable (append-only). Modifications and deletions are strictly forbidden for audit compliance.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers d'immutabilité
DROP TRIGGER IF EXISTS prevent_consent_event_update ON consent_events;
CREATE TRIGGER prevent_consent_event_update
  BEFORE UPDATE ON consent_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_consent_event_modification();

DROP TRIGGER IF EXISTS prevent_consent_event_delete ON consent_events;
CREATE TRIGGER prevent_consent_event_delete
  BEFORE DELETE ON consent_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_consent_event_modification();

-- Fonction helper pour créer un événement de consentement avec hash automatique
CREATE OR REPLACE FUNCTION create_consent_event(
  p_event_type text,
  p_autorisation_id uuid,
  p_prm_id uuid,
  p_prm_number text,
  p_identity_client jsonb,
  p_ip_address inet,
  p_user_agent text,
  p_policy_version_id uuid,
  p_consent_text_hash text,
  p_consent_given boolean,
  p_triggered_by uuid DEFAULT NULL,
  p_triggered_by_type text DEFAULT 'user',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
  v_event_id uuid;
  v_event_data jsonb;
  v_event_hash text;
BEGIN
  -- Construire le snapshot canonique de l'événement
  v_event_data := jsonb_build_object(
    'event_type', p_event_type,
    'prm_number', p_prm_number,
    'identity_client', p_identity_client,
    'timestamp_utc', (now() AT TIME ZONE 'UTC')::text,
    'ip_address', host(p_ip_address),
    'user_agent', p_user_agent,
    'policy_version_id', p_policy_version_id,
    'consent_text_hash', p_consent_text_hash,
    'consent_given', p_consent_given,
    'metadata', p_metadata
  );
  
  -- Calculer le hash SHA-256 de l'événement
  v_event_hash := calculate_text_hash(v_event_data::text);
  
  -- Insérer l'événement
  INSERT INTO consent_events (
    event_type,
    autorisation_id,
    prm_id,
    prm_number,
    identity_client,
    ip_address,
    user_agent,
    policy_version_id,
    consent_text_hash,
    consent_given,
    event_data,
    event_hash,
    triggered_by,
    triggered_by_type,
    metadata
  ) VALUES (
    p_event_type,
    p_autorisation_id,
    p_prm_id,
    p_prm_number,
    p_identity_client,
    p_ip_address,
    p_user_agent,
    p_policy_version_id,
    p_consent_text_hash,
    p_consent_given,
    v_event_data,
    v_event_hash,
    p_triggered_by,
    p_triggered_by_type,
    p_metadata
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour journaliser automatiquement les créations d'autorisation
CREATE OR REPLACE FUNCTION log_autorisation_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_policy_version_id uuid;
  v_prm_record RECORD;
BEGIN
  -- Récupérer la version de politique utilisée
  v_policy_version_id := NEW.policy_version_id;
  
  -- Si pas de version, utiliser la version actuelle
  IF v_policy_version_id IS NULL THEN
    SELECT id INTO v_policy_version_id
    FROM policy_versions
    WHERE policy_code = 'CONSENT_TEXT' AND version = 'V1'
    LIMIT 1;
  END IF;
  
  -- Créer un événement pour chaque PRM associé au contact
  FOR v_prm_record IN
    SELECT id, prm_numero
    FROM prm
    WHERE contact_id = NEW.contact_id
  LOOP
    PERFORM create_consent_event(
      p_event_type := 'CREATION',
      p_autorisation_id := NEW.id,
      p_prm_id := v_prm_record.id,
      p_prm_number := v_prm_record.prm_numero,
      p_identity_client := jsonb_build_object(
        'civilite', NEW.civilite,
        'prenom', NEW.prenom,
        'nom', NEW.nom,
        'email', NEW.email,
        'raison_sociale', NEW.raison_sociale,
        'siret', NEW.siret,
        'type_titulaire', NEW.type_titulaire
      ),
      p_ip_address := NEW.ip_address,
      p_user_agent := NEW.user_agent,
      p_policy_version_id := v_policy_version_id,
      p_consent_text_hash := COALESCE(NEW.consent_text_hash, calculate_text_hash('legacy')),
      p_consent_given := NEW.consent_rgpd,
      p_triggered_by := NULL,
      p_triggered_by_type := 'user'
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_autorisation_creation_trigger ON autorisations_communication;
CREATE TRIGGER log_autorisation_creation_trigger
  AFTER INSERT ON autorisations_communication
  FOR EACH ROW
  WHEN (NEW.consent_rgpd = true)
  EXECUTE FUNCTION log_autorisation_creation();