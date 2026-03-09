/*
  # Stratégie d'archivage long terme (5 ans+)

  1. Partitioning par année pour les tables critiques
    - consent_events partitionné par année
    - enedis_api_calls partitionné par année
    - audit_trail partitionné par année

  2. Fonction d'archivage vers Supabase Storage
    - Export automatique des données > 2 ans
    - Hash SHA-256 des archives
    - Métadonnées d'archivage

  3. Table de suivi des archives
    - audit_archives : métadonnées des archives créées

  4. Politiques de rétention
    - Données récentes (<2 ans) : PostgreSQL (partitions)
    - Données anciennes (2-5 ans) : Archivage froid Supabase Storage
    - Données très anciennes (>5 ans) : Option future vers S3 externe

  Note: Le partitioning PostgreSQL est une opération avancée.
  Pour le moment, nous créons la table de suivi des archives et
  les fonctions d'archivage. Le partitioning peut être ajouté
  ultérieurement selon les besoins.
*/

-- Table de suivi des archives
CREATE TABLE IF NOT EXISTS audit_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification de l'archive
  archive_name text NOT NULL UNIQUE,
  table_name text NOT NULL,
  
  -- Période archivée
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  
  -- Localisation
  storage_bucket text NOT NULL DEFAULT 'audit-archives',
  storage_path text NOT NULL,
  
  -- Métadonnées
  record_count bigint NOT NULL,
  file_size_bytes bigint,
  compression_type text DEFAULT 'gzip',
  
  -- Hash pour intégrité
  file_hash_sha256 text NOT NULL,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  server_timestamp_utc timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  
  -- Qui a créé l'archive
  created_by uuid REFERENCES auth.users(id),
  
  -- Métadonnées additionnelles
  metadata jsonb DEFAULT '{}'::jsonb,
  
  CONSTRAINT valid_archive_hash CHECK (file_hash_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT valid_period CHECK (period_end > period_start)
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_audit_archives_table_name ON audit_archives(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_archives_period ON audit_archives(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_audit_archives_created_at ON audit_archives(created_at DESC);

-- Activer RLS
ALTER TABLE audit_archives ENABLE ROW LEVEL SECURITY;

-- Politique : lecture seule pour utilisateurs authentifiés
CREATE POLICY "Authenticated users can read audit archives"
  ON audit_archives FOR SELECT
  TO authenticated
  USING (true);

-- Politique : insertion uniquement par système
CREATE POLICY "System can insert audit archives"
  ON audit_archives FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Fonction pour empêcher modification/suppression
CREATE OR REPLACE FUNCTION prevent_archive_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Archive metadata is immutable. Modifications and deletions are forbidden.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_archive_update ON audit_archives;
CREATE TRIGGER prevent_archive_update
  BEFORE UPDATE ON audit_archives
  FOR EACH ROW
  EXECUTE FUNCTION prevent_archive_modification();

DROP TRIGGER IF EXISTS prevent_archive_delete ON audit_archives;
CREATE TRIGGER prevent_archive_delete
  BEFORE DELETE ON audit_archives
  FOR EACH ROW
  EXECUTE FUNCTION prevent_archive_modification();

-- Fonction pour préparer les données d'archivage (JSON)
CREATE OR REPLACE FUNCTION prepare_archive_data(
  p_table_name text,
  p_period_start timestamptz,
  p_period_end timestamptz
) RETURNS jsonb AS $$
DECLARE
  v_data jsonb;
  v_count bigint;
BEGIN
  -- Selon la table, récupérer les données
  IF p_table_name = 'consent_events' THEN
    SELECT jsonb_agg(row_to_json(ce.*)), COUNT(*)
    INTO v_data, v_count
    FROM consent_events ce
    WHERE ce.server_timestamp_utc >= p_period_start
      AND ce.server_timestamp_utc < p_period_end;
      
  ELSIF p_table_name = 'enedis_api_calls' THEN
    SELECT jsonb_agg(row_to_json(eac.*)), COUNT(*)
    INTO v_data, v_count
    FROM enedis_api_calls eac
    WHERE eac.server_timestamp_utc >= p_period_start
      AND eac.server_timestamp_utc < p_period_end;
      
  ELSIF p_table_name = 'audit_trail' THEN
    SELECT jsonb_agg(row_to_json(at.*)), COUNT(*)
    INTO v_data, v_count
    FROM audit_trail at
    WHERE at.server_timestamp_utc >= p_period_start
      AND at.server_timestamp_utc < p_period_end;
      
  ELSE
    RAISE EXCEPTION 'Unknown table name for archiving: %', p_table_name;
  END IF;
  
  RETURN jsonb_build_object(
    'table_name', p_table_name,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'record_count', v_count,
    'data', v_data,
    'archived_at', now(),
    'version', '1.0'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour enregistrer une archive (à appeler après upload vers Storage)
CREATE OR REPLACE FUNCTION register_archive(
  p_archive_name text,
  p_table_name text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_storage_path text,
  p_record_count bigint,
  p_file_size_bytes bigint,
  p_file_hash_sha256 text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
  v_archive_id uuid;
BEGIN
  INSERT INTO audit_archives (
    archive_name,
    table_name,
    period_start,
    period_end,
    storage_path,
    record_count,
    file_size_bytes,
    file_hash_sha256,
    created_by,
    metadata
  ) VALUES (
    p_archive_name,
    p_table_name,
    p_period_start,
    p_period_end,
    p_storage_path,
    p_record_count,
    p_file_size_bytes,
    p_file_hash_sha256,
    auth.uid(),
    p_metadata
  ) RETURNING id INTO v_archive_id;
  
  RETURN v_archive_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vue pour monitoring des archives
CREATE OR REPLACE VIEW v_archive_summary AS
SELECT 
  table_name,
  COUNT(*) AS nombre_archives,
  MIN(period_start) AS periode_debut,
  MAX(period_end) AS periode_fin,
  SUM(record_count) AS total_enregistrements_archives,
  SUM(file_size_bytes) AS taille_totale_bytes,
  pg_size_pretty(SUM(file_size_bytes)) AS taille_totale_readable
FROM audit_archives
GROUP BY table_name
ORDER BY table_name;

-- Fonction helper pour déterminer si des données doivent être archivées
CREATE OR REPLACE FUNCTION get_archivable_periods(
  p_table_name text,
  p_retention_months integer DEFAULT 24
) RETURNS TABLE (
  period_start timestamptz,
  period_end timestamptz,
  record_count bigint
) AS $$
DECLARE
  v_cutoff_date timestamptz;
BEGIN
  v_cutoff_date := now() - (p_retention_months || ' months')::interval;
  
  IF p_table_name = 'consent_events' THEN
    RETURN QUERY
    SELECT 
      date_trunc('year', ce.server_timestamp_utc) AS period_start,
      date_trunc('year', ce.server_timestamp_utc) + interval '1 year' AS period_end,
      COUNT(*) AS record_count
    FROM consent_events ce
    WHERE ce.server_timestamp_utc < v_cutoff_date
    GROUP BY date_trunc('year', ce.server_timestamp_utc)
    ORDER BY date_trunc('year', ce.server_timestamp_utc);
    
  ELSIF p_table_name = 'enedis_api_calls' THEN
    RETURN QUERY
    SELECT 
      date_trunc('year', eac.server_timestamp_utc) AS period_start,
      date_trunc('year', eac.server_timestamp_utc) + interval '1 year' AS period_end,
      COUNT(*) AS record_count
    FROM enedis_api_calls eac
    WHERE eac.server_timestamp_utc < v_cutoff_date
    GROUP BY date_trunc('year', eac.server_timestamp_utc)
    ORDER BY date_trunc('year', eac.server_timestamp_utc);
    
  ELSIF p_table_name = 'audit_trail' THEN
    RETURN QUERY
    SELECT 
      date_trunc('year', at.server_timestamp_utc) AS period_start,
      date_trunc('year', at.server_timestamp_utc) + interval '1 year' AS period_end,
      COUNT(*) AS record_count
    FROM audit_trail at
    WHERE at.server_timestamp_utc < v_cutoff_date
    GROUP BY date_trunc('year', at.server_timestamp_utc)
    ORDER BY date_trunc('year', at.server_timestamp_utc);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Commentaire sur la stratégie d'archivage
COMMENT ON TABLE audit_archives IS 'Suivi des archives long terme (5 ans+) stockées dans Supabase Storage. Les archives sont immutables et hashées pour garantir l''intégrité.';
COMMENT ON FUNCTION prepare_archive_data IS 'Prépare les données JSON pour archivage vers Supabase Storage.';
COMMENT ON FUNCTION register_archive IS 'Enregistre les métadonnées d''une archive après upload vers Storage.';
COMMENT ON FUNCTION get_archivable_periods IS 'Identifie les périodes de données éligibles à l''archivage (> retention_months).';