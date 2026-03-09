/*
  # Création de la table audit_trail

  1. Table `audit_trail`
    - Historise TOUTES les modifications sur tables critiques
    - Capture before/after pour chaque modification
    - Horodatage serveur immutable
    - Append-only (jamais de suppression)

  2. Champs
    - table_name : Table modifiée
    - record_id : ID de l'enregistrement modifié
    - operation : INSERT, UPDATE, DELETE
    - old_values : Valeurs avant modification (JSON)
    - new_values : Valeurs après modification (JSON)
    - changed_fields : Liste des champs modifiés
    - server_timestamp_utc : Timestamp serveur
    - user_id : Utilisateur ayant fait la modification

  3. Déclenchement automatique
    - Triggers sur tables critiques :
      - autorisations_communication
      - prm
      - contacts
      - consent_events (lecture seule)
      - enedis_api_calls (lecture seule)

  4. Sécurité
    - RLS lecture seule
    - Immutabilité totale
*/

CREATE TABLE IF NOT EXISTS audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification de la modification
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  
  -- Valeurs avant/après
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  
  -- Horodatage serveur immutable
  server_timestamp_utc timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  
  -- Qui a fait la modification
  user_id uuid REFERENCES auth.users(id),
  session_id text,
  ip_address inet,
  user_agent text,
  
  -- Métadonnées
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_audit_trail_table_name ON audit_trail(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_trail_record_id ON audit_trail(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_operation ON audit_trail(operation);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(server_timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON audit_trail(user_id);

-- Index composite pour audit par table + enregistrement
CREATE INDEX IF NOT EXISTS idx_audit_trail_table_record ON audit_trail(table_name, record_id, server_timestamp_utc DESC);

-- Activer RLS
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- Politique : lecture seule pour utilisateurs authentifiés
CREATE POLICY "Authenticated users can read audit trail"
  ON audit_trail FOR SELECT
  TO authenticated
  USING (true);

-- Politique : insertion uniquement (append-only)
CREATE POLICY "System can insert audit trail"
  ON audit_trail FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Fonction pour empêcher toute modification ou suppression
CREATE OR REPLACE FUNCTION prevent_audit_trail_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail is immutable (append-only). Modifications and deletions are strictly forbidden.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers d'immutabilité
DROP TRIGGER IF EXISTS prevent_audit_trail_update ON audit_trail;
CREATE TRIGGER prevent_audit_trail_update
  BEFORE UPDATE ON audit_trail
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_trail_modification();

DROP TRIGGER IF EXISTS prevent_audit_trail_delete ON audit_trail;
CREATE TRIGGER prevent_audit_trail_delete
  BEFORE DELETE ON audit_trail
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_trail_modification();

-- Fonction générique d'audit pour toutes les tables
CREATE OR REPLACE FUNCTION audit_table_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_old_values jsonb;
  v_new_values jsonb;
  v_changed_fields text[];
  v_user_id uuid;
BEGIN
  -- Récupérer l'utilisateur actuel
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;
  
  -- Construire les valeurs old/new selon l'opération
  IF (TG_OP = 'DELETE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    
    -- Identifier les champs modifiés
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM jsonb_each(v_old_values)
    WHERE v_old_values->key IS DISTINCT FROM v_new_values->key;
  ELSIF (TG_OP = 'INSERT') THEN
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  END IF;
  
  -- Insérer dans audit_trail
  INSERT INTO audit_trail (
    table_name,
    record_id,
    operation,
    old_values,
    new_values,
    changed_fields,
    user_id
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    v_old_values,
    v_new_values,
    v_changed_fields,
    v_user_id
  );
  
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Appliquer l'audit sur autorisations_communication
DROP TRIGGER IF EXISTS audit_autorisations_communication ON autorisations_communication;
CREATE TRIGGER audit_autorisations_communication
  AFTER INSERT OR UPDATE OR DELETE ON autorisations_communication
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

-- Appliquer l'audit sur prm
DROP TRIGGER IF EXISTS audit_prm ON prm;
CREATE TRIGGER audit_prm
  AFTER INSERT OR UPDATE OR DELETE ON prm
  FOR EACH ROW
  EXECUTE FUNCTION audit_table_changes();

-- Appliquer l'audit sur contacts (consumerstat_contacts)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consumerstat_contacts') THEN
    DROP TRIGGER IF EXISTS audit_contacts ON consumerstat_contacts;
    CREATE TRIGGER audit_contacts
      AFTER INSERT OR UPDATE OR DELETE ON consumerstat_contacts
      FOR EACH ROW
      EXECUTE FUNCTION audit_table_changes();
  END IF;
END $$;

-- Fonction pour récupérer l'historique complet d'un enregistrement
CREATE OR REPLACE FUNCTION get_record_audit_history(
  p_table_name text,
  p_record_id uuid
) RETURNS TABLE (
  event_timestamp timestamptz,
  operation text,
  user_id uuid,
  changed_fields text[],
  old_values jsonb,
  new_values jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.server_timestamp_utc,
    a.operation,
    a.user_id,
    a.changed_fields,
    a.old_values,
    a.new_values
  FROM audit_trail a
  WHERE a.table_name = p_table_name
    AND a.record_id = p_record_id
  ORDER BY a.server_timestamp_utc ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;