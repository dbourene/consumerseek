/*
  # Création de la table enedis_api_calls

  1. Table `enedis_api_calls`
    - Journalise TOUS les appels API Enedis
    - Horodatage serveur uniquement (immutable)
    - Lien avec l'autorisation de consentement utilisée
    - Données requête/réponse pour traçabilité complète
    - Append-only (immutable)

  2. Champs critiques
    - prm_number : PRM interrogé
    - server_timestamp_utc : Timestamp serveur (preuve temporelle)
    - consent_event_id : Lien vers l'événement de consentement
    - endpoint : Endpoint API Enedis appelé
    - http_status : Code de réponse HTTP
    - request_data : Données de requête (sanitizées)
    - response_summary : Résumé de réponse (sans données sensibles)

  3. Sécurité
    - RLS lecture seule
    - Immutabilité stricte
    - Hash de l'appel API

  4. Conformité Enedis
    - Permet de prouver que consentement précède appel API
    - Traçabilité complète de la chaîne de consentement
*/

CREATE TABLE IF NOT EXISTS enedis_api_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Référence au PRM
  prm_number text NOT NULL,
  prm_id uuid REFERENCES prm(id),
  
  -- Référence au consentement utilisé
  autorisation_id uuid REFERENCES autorisations_communication(id),
  consent_event_id uuid REFERENCES consent_events(id),
  
  -- Timestamp serveur immutable
  server_timestamp_utc timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  
  -- Détails de l'appel API
  endpoint text NOT NULL,
  http_method text NOT NULL DEFAULT 'GET' CHECK (http_method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  http_status integer,
  
  -- Données de requête et réponse (sanitizées, sans clés API)
  request_data jsonb,
  response_summary jsonb,
  
  -- Succès ou échec
  success boolean NOT NULL DEFAULT false,
  error_message text,
  
  -- Métadonnées techniques
  execution_time_ms integer,
  ip_source inet,
  user_agent text,
  
  -- Hash de l'appel pour intégrité
  call_hash text NOT NULL,
  
  -- Qui a déclenché l'appel
  triggered_by uuid REFERENCES auth.users(id),
  triggered_by_type text DEFAULT 'system' CHECK (triggered_by_type IN ('user', 'system', 'api', 'batch')),
  
  -- Métadonnées additionnelles
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_call_hash CHECK (call_hash ~ '^[a-f0-9]{64}$')
);

-- Index pour audit par PRM
CREATE INDEX IF NOT EXISTS idx_enedis_calls_prm_number ON enedis_api_calls(prm_number);
CREATE INDEX IF NOT EXISTS idx_enedis_calls_prm_id ON enedis_api_calls(prm_id);
CREATE INDEX IF NOT EXISTS idx_enedis_calls_autorisation ON enedis_api_calls(autorisation_id);
CREATE INDEX IF NOT EXISTS idx_enedis_calls_consent_event ON enedis_api_calls(consent_event_id);

-- Index pour audit chronologique
CREATE INDEX IF NOT EXISTS idx_enedis_calls_timestamp ON enedis_api_calls(server_timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_enedis_calls_endpoint ON enedis_api_calls(endpoint);
CREATE INDEX IF NOT EXISTS idx_enedis_calls_success ON enedis_api_calls(success);

-- Index composite pour vérification consent < api_call
CREATE INDEX IF NOT EXISTS idx_enedis_calls_prm_timestamp ON enedis_api_calls(prm_number, server_timestamp_utc DESC);

-- Activer RLS
ALTER TABLE enedis_api_calls ENABLE ROW LEVEL SECURITY;

-- Politique : lecture seule pour utilisateurs authentifiés
CREATE POLICY "Authenticated users can read API calls"
  ON enedis_api_calls FOR SELECT
  TO authenticated
  USING (true);

-- Politique : insertion uniquement (append-only)
CREATE POLICY "Authenticated users can insert API calls"
  ON enedis_api_calls FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Fonction pour empêcher toute modification ou suppression
CREATE OR REPLACE FUNCTION prevent_api_call_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'API call logs are immutable (append-only). Modifications and deletions are strictly forbidden for audit compliance.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers d'immutabilité
DROP TRIGGER IF EXISTS prevent_api_call_update ON enedis_api_calls;
CREATE TRIGGER prevent_api_call_update
  BEFORE UPDATE ON enedis_api_calls
  FOR EACH ROW
  EXECUTE FUNCTION prevent_api_call_modification();

DROP TRIGGER IF EXISTS prevent_api_call_delete ON enedis_api_calls;
CREATE TRIGGER prevent_api_call_delete
  BEFORE DELETE ON enedis_api_calls
  FOR EACH ROW
  EXECUTE FUNCTION prevent_api_call_modification();

-- Fonction helper pour logger un appel API Enedis
CREATE OR REPLACE FUNCTION log_enedis_api_call(
  p_prm_number text,
  p_prm_id uuid,
  p_autorisation_id uuid,
  p_endpoint text,
  p_http_method text DEFAULT 'GET',
  p_http_status integer DEFAULT NULL,
  p_request_data jsonb DEFAULT NULL,
  p_response_summary jsonb DEFAULT NULL,
  p_success boolean DEFAULT false,
  p_error_message text DEFAULT NULL,
  p_execution_time_ms integer DEFAULT NULL,
  p_triggered_by uuid DEFAULT NULL,
  p_triggered_by_type text DEFAULT 'system',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
  v_call_id uuid;
  v_call_hash text;
  v_call_data jsonb;
  v_consent_event_id uuid;
BEGIN
  -- Récupérer le dernier événement de consentement valide pour ce PRM
  SELECT id INTO v_consent_event_id
  FROM consent_events
  WHERE prm_number = p_prm_number
    AND event_type = 'CREATION'
    AND consent_given = true
  ORDER BY server_timestamp_utc DESC
  LIMIT 1;
  
  -- Construire les données de l'appel pour le hash
  v_call_data := jsonb_build_object(
    'prm_number', p_prm_number,
    'timestamp_utc', (now() AT TIME ZONE 'UTC')::text,
    'endpoint', p_endpoint,
    'http_method', p_http_method,
    'http_status', p_http_status
  );
  
  -- Calculer le hash
  v_call_hash := calculate_text_hash(v_call_data::text);
  
  -- Insérer le log d'appel API
  INSERT INTO enedis_api_calls (
    prm_number,
    prm_id,
    autorisation_id,
    consent_event_id,
    endpoint,
    http_method,
    http_status,
    request_data,
    response_summary,
    success,
    error_message,
    execution_time_ms,
    call_hash,
    triggered_by,
    triggered_by_type,
    metadata
  ) VALUES (
    p_prm_number,
    p_prm_id,
    p_autorisation_id,
    v_consent_event_id,
    p_endpoint,
    p_http_method,
    p_http_status,
    p_request_data,
    p_response_summary,
    p_success,
    p_error_message,
    p_execution_time_ms,
    v_call_hash,
    p_triggered_by,
    p_triggered_by_type,
    p_metadata
  ) RETURNING id INTO v_call_id;
  
  RETURN v_call_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction de vérification : le consentement précède-t-il l'appel API ?
CREATE OR REPLACE FUNCTION verify_consent_before_api_call(
  p_prm_number text,
  p_api_call_timestamp timestamptz DEFAULT now()
) RETURNS TABLE (
  is_valid boolean,
  consent_timestamp timestamptz,
  api_call_timestamp timestamptz,
  time_diff_seconds numeric,
  consent_event_id uuid,
  message text
) AS $$
DECLARE
  v_latest_consent consent_events%ROWTYPE;
BEGIN
  -- Récupérer le dernier consentement valide
  SELECT * INTO v_latest_consent
  FROM consent_events
  WHERE prm_number = p_prm_number
    AND event_type = 'CREATION'
    AND consent_given = true
  ORDER BY server_timestamp_utc DESC
  LIMIT 1;
  
  -- Si pas de consentement trouvé
  IF v_latest_consent IS NULL THEN
    RETURN QUERY SELECT 
      false,
      NULL::timestamptz,
      p_api_call_timestamp,
      NULL::numeric,
      NULL::uuid,
      'No valid consent found for this PRM'::text;
    RETURN;
  END IF;
  
  -- Vérifier que le consentement précède l'appel API
  IF v_latest_consent.server_timestamp_utc < p_api_call_timestamp THEN
    RETURN QUERY SELECT 
      true,
      v_latest_consent.server_timestamp_utc,
      p_api_call_timestamp,
      EXTRACT(EPOCH FROM (p_api_call_timestamp - v_latest_consent.server_timestamp_utc)),
      v_latest_consent.id,
      'Valid: consent precedes API call'::text;
  ELSE
    RETURN QUERY SELECT 
      false,
      v_latest_consent.server_timestamp_utc,
      p_api_call_timestamp,
      EXTRACT(EPOCH FROM (p_api_call_timestamp - v_latest_consent.server_timestamp_utc)),
      v_latest_consent.id,
      'INVALID: API call timestamp precedes consent timestamp'::text;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;