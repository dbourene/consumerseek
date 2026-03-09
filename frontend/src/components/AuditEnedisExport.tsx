import React, { useState } from 'react';
import { Download, Loader2, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

interface ExportStatus {
  loading: boolean;
  success: boolean;
  error: string | null;
  message: string | null;
}

export default function AuditEnedisExport() {
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    loading: false,
    success: false,
    error: null,
    message: null,
  });

  const exportAuditToExcel = async () => {
    try {
      console.log('🚀🚀🚀 EXPORT AUDIT ENEDIS - VERSION AVEC LOGS 🚀🚀🚀');
      console.log('🚀 Si vous ne voyez pas ce message, le cache n\'est pas vidé !');
      alert('Export Audit démarré - Vérifiez la console pour les logs détaillés');

      setExportStatus({ loading: true, success: false, error: null, message: 'Récupération des données...' });

      const { data: registreData, error: registreError } = await supabase.rpc('get_registre_consentements');
      if (registreError) throw new Error(`Erreur Tab 1: ${registreError.message}`);
      console.log('📊 REGISTRE DATA:', registreData);
      console.log('📊 Nombre de lignes registre:', registreData?.length || 0);

      const { data: historiqueData, error: historiqueError } = await supabase.rpc('get_historique_evenements');
      if (historiqueError) throw new Error(`Erreur Tab 2: ${historiqueError.message}`);
      console.log('📊 HISTORIQUE DATA:', historiqueData);
      console.log('📊 Nombre de lignes historique:', historiqueData?.length || 0);

      const { data: coherenceData, error: coherenceError } = await supabase.rpc('get_coherence_chronologique');
      if (coherenceError) throw new Error(`Erreur Tab 3: ${coherenceError.message}`);
      console.log('📊 COHERENCE DATA:', coherenceData);
      console.log('📊 Nombre de lignes cohérence:', coherenceData?.length || 0);

      setExportStatus({ loading: true, success: false, error: null, message: 'Génération du fichier Excel...' });

      console.log('📦 Création du workbook...');
      const workbook = XLSX.utils.book_new();
      console.log('📦 Workbook créé:', workbook);

      console.log('🔧 Construction onglet 1: LOGS_CONSENTEMENT');
      const registreHeaders = [
        'authorization_id', 'prm', 'consent_status', 'consent_timestamp',
        'declarant_type', 'declarant_identity', 'declarant_email', 'declarant_phone',
        'declarant_role', 'mandate_declared', 'titulaire_identity', 'titulaire_type',
        'legal_basis', 'rgpd_version', 'consent_text_version', 'consent_hash',
        'ip_address', 'user_agent', 'source', 'created_at'
      ];
      console.log('🔧 Headers onglet 1:', registreHeaders);
      const registreRows = (registreData || []).map(row => [
        row.authorization_id,
        row.prm,
        row.consent_status,
        row.consent_timestamp ? new Date(row.consent_timestamp).toLocaleString('fr-FR') : '',
        row.declarant_type,
        row.declarant_identity,
        row.declarant_email,
        row.declarant_phone,
        row.declarant_role,
        row.mandate_declared ? 'true' : 'false',
        row.titulaire_identity,
        row.titulaire_type,
        row.legal_basis,
        row.cgu_version,
        row.privacy_policy_version,
        row.consent_hash,
        row.ip_address,
        row.user_agent,
        row.source,
        row.record_created_at ? new Date(row.record_created_at).toLocaleString('fr-FR') : '',
      ]);
      console.log('🔧 Rows onglet 1:', registreRows.length, 'lignes');
      const registreDataForSheet = [registreHeaders, ...registreRows];
      console.log('🔧 Array complet onglet 1:', registreDataForSheet);
      const registreSheet = XLSX.utils.aoa_to_sheet(registreDataForSheet);
      console.log('🔧 Sheet créé pour onglet 1:', registreSheet);
      XLSX.utils.book_append_sheet(workbook, registreSheet, 'LOGS_CONSENTEMENT');
      console.log('✅ Onglet 1 ajouté au workbook. Nombre d\'onglets:', workbook.SheetNames.length);

      console.log('🔧 Construction onglet 2: LOGS_REVOCATION');
      const historiqueHeaders = [
        'prm', 'client_identity', 'revocation_timestamp_utc', 'ip_address',
        'user_agent', 'reason', 'consent_hash', 'siret'
      ];
      console.log('🔧 Headers onglet 2:', historiqueHeaders);
      const historiqueRows = (historiqueData || []).map(row => [
        row.prm,
        row.client_identity,
        row.revocation_timestamp_utc ? new Date(row.revocation_timestamp_utc).toLocaleString('fr-FR') : '',
        row.ip_address,
        row.user_agent,
        row.reason,
        row.consent_hash,
        row.siret,
      ]);
      console.log('🔧 Rows onglet 2:', historiqueRows.length, 'lignes');
      const historiqueDataForSheet = [historiqueHeaders, ...historiqueRows];
      console.log('🔧 Array complet onglet 2:', historiqueDataForSheet);
      const historiqueSheet = XLSX.utils.aoa_to_sheet(historiqueDataForSheet);
      console.log('🔧 Sheet créé pour onglet 2:', historiqueSheet);
      XLSX.utils.book_append_sheet(workbook, historiqueSheet, 'LOGS_REVOCATION');
      console.log('✅ Onglet 2 ajouté au workbook. Nombre d\'onglets:', workbook.SheetNames.length);

      console.log('🔧 Construction onglet 3: LOGS_APPELS_API');
      const coherenceHeaders = [
        'prm', 'consent_timestamp_utc', 'first_api_call_timestamp_utc',
        'api_call_count', 'processing_duration_seconds', 'conformity_status', 'message'
      ];
      console.log('🔧 Headers onglet 3:', coherenceHeaders);
      const coherenceRows = (coherenceData || []).map(row => [
        row.prm,
        row.consent_timestamp_utc ? new Date(row.consent_timestamp_utc).toLocaleString('fr-FR') : '',
        row.first_api_call_timestamp_utc ? new Date(row.first_api_call_timestamp_utc).toLocaleString('fr-FR') : '',
        row.api_call_count || 0,
        row.processing_duration_seconds || 0,
        row.conformity_status,
        row.message,
      ]);
      console.log('🔧 Rows onglet 3:', coherenceRows.length, 'lignes');
      const coherenceDataForSheet = [coherenceHeaders, ...coherenceRows];
      console.log('🔧 Array complet onglet 3:', coherenceDataForSheet);
      const coherenceSheet = XLSX.utils.aoa_to_sheet(coherenceDataForSheet);
      console.log('🔧 Sheet créé pour onglet 3:', coherenceSheet);
      XLSX.utils.book_append_sheet(workbook, coherenceSheet, 'LOGS_APPELS_API');
      console.log('✅ Onglet 3 ajouté au workbook. Nombre d\'onglets:', workbook.SheetNames.length);

      console.log('📋 WORKBOOK FINAL - Noms des onglets:', workbook.SheetNames);
      console.log('📋 WORKBOOK FINAL - Structure complète:', workbook);

      const fileName = `Audit_ENEDIS_${new Date().toISOString().split('T')[0]}.xlsx`;
      console.log('💾 Écriture du fichier:', fileName);
      XLSX.writeFile(workbook, fileName);
      console.log('✅ Fichier écrit avec succès');

      setExportStatus({
        loading: false,
        success: true,
        error: null,
        message: `Fichier exporté avec succès : ${fileName}`,
      });

      setTimeout(() => {
        setExportStatus({ loading: false, success: false, error: null, message: null });
      }, 5000);
    } catch (err) {
      console.error('Error exporting audit data:', err);
      setExportStatus({
        loading: false,
        success: false,
        error: err instanceof Error ? err.message : 'Erreur lors de l\'export',
        message: null,
      });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-3 mb-4">
        <FileSpreadsheet className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">Export Audit ENEDIS</h2>
      </div>

      <div className="mb-6">
        <p className="text-sm text-gray-600 mb-4">
          Exportez le registre complet des consentements et l'historique des événements pour l'audit ENEDIS.
          Le fichier Excel contient 3 onglets :
        </p>

        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="font-semibold text-blue-600 min-w-[24px]">1.</span>
            <div>
              <strong>LOGS_CONSENTEMENT :</strong> Registre principal des consentements (1 ligne = 1 PRM autorisé).
              Inclut l'identité du déclarant, du titulaire, la base légale, les versions des politiques et métadonnées techniques.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-semibold text-blue-600 min-w-[24px]">2.</span>
            <div>
              <strong>LOGS_REVOCATION :</strong> Journal des révocations de consentement avec timestamp UTC,
              adresse IP, user agent et raison de la révocation.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-semibold text-blue-600 min-w-[24px]">3.</span>
            <div>
              <strong>LOGS_APPELS_API :</strong> Traçabilité des appels API ENEDIS avec vérification de conformité
              (délai entre consentement et premier appel, détection d'accès après révocation).
            </div>
          </li>
        </ul>
      </div>

      {exportStatus.success && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-sm text-green-700">{exportStatus.message}</p>
          </div>
        </div>
      )}

      {exportStatus.error && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-700">{exportStatus.error}</p>
          </div>
        </div>
      )}

      <button
        onClick={exportAuditToExcel}
        disabled={exportStatus.loading}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {exportStatus.loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {exportStatus.message || 'Export en cours...'}
          </>
        ) : (
          <>
            <Download className="w-5 h-5" />
            Exporter l'audit ENEDIS (.xlsx)
          </>
        )}
      </button>

      <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-xs text-yellow-800">
          <strong>Important :</strong> Ce fichier contient des données personnelles sensibles.
          Assurez-vous de le stocker de manière sécurisée et de respecter les règles RGPD.
        </p>
      </div>
    </div>
  );
}
