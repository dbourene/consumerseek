import React, { useState, useEffect } from 'react';
import { Search, FileDown, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import type { PRM } from '../types/prm';
import type { Contact } from '../types/consumerstat';

interface PRMWithDetails extends PRM {
  contact?: Contact;
  autorisation_date?: string;
  autorisation_ip?: string;
}

interface ValidationResult {
  representant: {
    civilite?: string;
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    ip?: string;
    date_autorisation?: string;
    type?: 'particulier' | 'professionnel';
    raison_sociale?: string;
    forme_juridique?: string;
    siren?: string;
    code_naf?: string;
  };
  prms: Array<{
    numero: string;
    titulaire_civilite?: string;
    titulaire_nom?: string;
    titulaire_prenom?: string;
    titulaire_raison_sociale?: string;
    titulaire_siret?: string;
    titulaire_adresse?: string;
    titulaire_code_postal?: string;
    titulaire_ville?: string;
    titulaire_type?: string;
  }>;
}

export default function PRMValidation() {
  const [prmInput, setPrmInput] = useState('');
  const [prmList, setPrmList] = useState<string[]>([]);
  const [validationStatus, setValidationStatus] = useState<Record<string, boolean>>({});
  const [allPRMs, setAllPRMs] = useState<PRM[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAllPRMs();
  }, []);

  const loadAllPRMs = async () => {
    const { data, error } = await supabase
      .from('prm')
      .select('*')
      .order('prm_numero');

    if (!error && data) {
      setAllPRMs(data);
    }
  };

  const handlePRMInputChange = (value: string) => {
    setPrmInput(value);

    const prms = value
      .split('\n')
      .map(line => line.trim().replace(/\D/g, '').substring(0, 14))
      .filter(line => line.length > 0);

    setPrmList(prms);

    const status: Record<string, boolean> = {};
    prms.forEach(prm => {
      status[prm] = allPRMs.some(p => p.prm_numero === prm);
    });
    setValidationStatus(status);
  };

  const handleValidate = async () => {
    setLoading(true);
    setValidationResults([]);

    try {
      const recognizedPRMs = prmList.filter(prm => validationStatus[prm]);
      console.log('PRMs reconnus:', recognizedPRMs);

      if (recognizedPRMs.length === 0) {
        console.log('Aucun PRM reconnu');
        setLoading(false);
        return;
      }

      const { data: prmsData, error: prmError } = await supabase
        .from('prm')
        .select('*')
        .in('prm_numero', recognizedPRMs);

      console.log('PRMs data:', prmsData);
      if (prmError) {
        console.error('Erreur PRM:', prmError);
        throw prmError;
      }

      const contactIds = [...new Set(prmsData?.map(p => p.contact_id))];
      console.log('Contact IDs:', contactIds);

      if (contactIds.length === 0) {
        console.log('Aucun contact trouvé');
        setLoading(false);
        return;
      }

      const { data: contactsData, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .in('id', contactIds);

      console.log('Contacts data:', contactsData);
      if (contactError) {
        console.error('Erreur contacts:', contactError);
        throw contactError;
      }

      const autorisationIds = [...new Set(prmsData?.map(p => p.autorisation_id).filter(Boolean))];
      console.log('Autorisation IDs:', autorisationIds);

      const { data: autorisationsData } = await supabase
        .from('autorisations_communication')
        .select('id, contact_id, created_at, raison_sociale, forme_juridique, siret, type_titulaire, ip_address')
        .in('id', autorisationIds);

      console.log('Autorisations data:', autorisationsData);

      const results: ValidationResult[] = [];

      contactsData?.forEach(contact => {
        const contactPRMs = prmsData?.filter(p => p.contact_id === contact.id) || [];

        const firstPRMWithAutorisation = contactPRMs.find(p => p.autorisation_id);
        const autorisation = firstPRMWithAutorisation
          ? autorisationsData?.find(a => a.id === firstPRMWithAutorisation.autorisation_id)
          : undefined;

        if (contactPRMs.length > 0) {
          const isEntreprise = (autorisation?.type_titulaire === 'professionnel') ||
                               (contact.siret && contact.siret.length > 0);

          const raisonSociale = autorisation?.raison_sociale || contact.entreprise;
          const formeJuridique = autorisation?.forme_juridique || contact.forme_juridique;
          const siret = autorisation?.siret || contact.siret;

          results.push({
            representant: {
              civilite: contact.contact1_civilite,
              nom: contact.contact1_nom,
              prenom: contact.contact1_prenom,
              email: contact.contact1_mail1,
              telephone: contact.contact1_telportable || contact.contact1_telfix,
              ip: autorisation?.ip_address || contact.contact1_ip,
              date_autorisation: autorisation?.created_at
                ? new Date(autorisation.created_at).toLocaleDateString('fr-FR')
                : contact.contact1_ip_timestamp
                  ? new Date(contact.contact1_ip_timestamp).toLocaleDateString('fr-FR')
                  : undefined,
              type: isEntreprise ? 'professionnel' : 'particulier',
              raison_sociale: isEntreprise ? raisonSociale : undefined,
              forme_juridique: isEntreprise ? formeJuridique : undefined,
              siren: isEntreprise && siret ? siret.substring(0, 9) : undefined,
              code_naf: isEntreprise ? contact.code_naf : undefined,
            },
            prms: contactPRMs.map(prm => ({
              numero: prm.prm_numero || '',
              titulaire_civilite: prm.titulaire_civilite,
              titulaire_nom: prm.titulaire_nom,
              titulaire_prenom: prm.titulaire_prenom,
              titulaire_raison_sociale: prm.titulaire_raison_sociale,
              titulaire_siret: prm.titulaire_siret,
              titulaire_adresse: prm.titulaire_adresse,
              titulaire_code_postal: prm.titulaire_code_postal,
              titulaire_ville: prm.titulaire_ville,
              titulaire_type: prm.titulaire_type,
            }))
          });
        }
      });

      console.log('Résultats finaux:', results);
      setValidationResults(results);
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      console.log('🚀 DÉBUT EXPORT AUDIT ENEDIS 🚀');
      const prmNumbers = validationResults.flatMap(r => r.prms.map(p => p.numero));
      console.log('📋 PRMs à exporter:', prmNumbers);

      if (prmNumbers.length === 0) {
        alert('Aucun PRM à exporter');
        return;
      }

      // Appeler les 3 fonctions RPC pour récupérer les données
      console.log('📊 Récupération des données LOGS_CONSENTEMENT...');
      const { data: registreData, error: registreError } = await supabase.rpc('get_registre_consentements');
      if (registreError) {
        console.error('❌ Erreur registre:', registreError);
        throw registreError;
      }
      console.log('✅ Registre récupéré:', registreData?.length, 'lignes');

      console.log('📊 Récupération des données LOGS_REVOCATION...');
      const { data: revocationsData, error: revocationsError } = await supabase.rpc('get_historique_evenements');
      if (revocationsError) {
        console.error('❌ Erreur revocations:', revocationsError);
        throw revocationsError;
      }
      console.log('✅ Révocations récupérées:', revocationsData?.length, 'lignes');

      console.log('📊 Récupération des données CONTROLE_COHERENCE...');
      const { data: coherenceData, error: coherenceError } = await supabase.rpc('get_coherence_chronologique');
      if (coherenceError) {
        console.error('❌ Erreur cohérence:', coherenceError);
        throw coherenceError;
      }
      console.log('✅ Cohérence récupérée:', coherenceData?.length, 'lignes');

      // Filtrer les données pour ne garder que les PRMs validés
      const filteredRegistre = registreData?.filter((row: any) =>
        prmNumbers.includes(row.prm)
      ) || [];

      const filteredRevocations = revocationsData?.filter((row: any) =>
        row.prm && prmNumbers.some(prm => row.prm.includes(prm))
      ) || [];

      const filteredCoherence = coherenceData?.filter((row: any) =>
        row.prm && prmNumbers.some(prm => row.prm.includes(prm))
      ) || [];

      console.log('📋 Données filtrées:', {
        registre: filteredRegistre.length,
        revocations: filteredRevocations.length,
        coherence: filteredCoherence.length
      });

      if (filteredRegistre.length === 0 && filteredRevocations.length === 0 && filteredCoherence.length === 0) {
        alert('Aucune donnée d\'audit disponible pour ces PRMs');
        return;
      }

      // Créer le workbook avec 3 onglets
      const workbook = XLSX.utils.book_new();

      // Onglet 1: LOGS_CONSENTEMENT
      if (filteredRegistre.length > 0) {
        const ws1 = XLSX.utils.json_to_sheet(filteredRegistre);
        XLSX.utils.book_append_sheet(workbook, ws1, 'LOGS_CONSENTEMENT');
        console.log('✅ Onglet LOGS_CONSENTEMENT créé avec', filteredRegistre.length, 'lignes');
      } else {
        // Créer un onglet vide avec juste les en-têtes
        const ws1 = XLSX.utils.aoa_to_sheet([[
          'authorization_id', 'prm', 'consent_status', 'consent_timestamp', 'declarant_type',
          'declarant_identity', 'declarant_email', 'declarant_phone', 'declarant_role',
          'mandate_declared', 'titulaire_identity', 'titulaire_type', 'legal_basis',
          'rgpd_version', 'privacy_policy_version', 'consent_hash', 'ip_address',
          'user_agent', 'source', 'created_at'
        ]]);
        XLSX.utils.book_append_sheet(workbook, ws1, 'LOGS_CONSENTEMENT');
        console.log('⚠️ Onglet LOGS_CONSENTEMENT créé vide (headers seulement)');
      }

      // Onglet 2: LOGS_REVOCATION
      if (filteredRevocations.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(filteredRevocations);
        XLSX.utils.book_append_sheet(workbook, ws2, 'LOGS_REVOCATION');
        console.log('✅ Onglet LOGS_REVOCATION créé avec', filteredRevocations.length, 'lignes');
      } else {
        const ws2 = XLSX.utils.aoa_to_sheet([[
          'prm', 'client_identity', 'revocation_timestamp_utc', 'ip_address',
          'user_agent', 'reason', 'consent_hash', 'siret'
        ]]);
        XLSX.utils.book_append_sheet(workbook, ws2, 'LOGS_REVOCATION');
        console.log('⚠️ Onglet LOGS_REVOCATION créé vide (headers seulement)');
      }

      // Onglet 3: CONTROLE_COHERENCE
      if (filteredCoherence.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(filteredCoherence);
        XLSX.utils.book_append_sheet(workbook, ws3, 'CONTROLE_COHERENCE');
        console.log('✅ Onglet CONTROLE_COHERENCE créé avec', filteredCoherence.length, 'lignes');
      } else {
        const ws3 = XLSX.utils.aoa_to_sheet([[
          'prm', 'consent_timestamp_utc', 'first_api_call_timestamp_utc',
          'api_call_count', 'processing_duration_seconds', 'conformity_status', 'message'
        ]]);
        XLSX.utils.book_append_sheet(workbook, ws3, 'CONTROLE_COHERENCE');
        console.log('⚠️ Onglet CONTROLE_COHERENCE créé vide (headers seulement)');
      }

      const filename = `audit_enedis_${new Date().toISOString().split('T')[0]}.xlsx`;
      console.log('💾 Téléchargement:', filename);
      XLSX.writeFile(workbook, filename);
      console.log('✅ Export terminé avec succès');
    } catch (error) {
      console.error('❌ Erreur lors de l\'export:', error);
      alert('Erreur lors de l\'export Excel');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Validation des données Enedis</h3>
          <p className="text-sm text-gray-600 mb-4">
            Saisissez ou collez une liste de numéros PRM pour vérifier les autorisations de communication.
          </p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Liste des PRM (un par ligne)
            </label>
            <textarea
              value={prmInput}
              onChange={(e) => handlePRMInputChange(e.target.value)}
              placeholder="50046967141510&#10;50066859615263&#10;..."
              className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              {prmList.length} PRM détecté{prmList.length > 1 ? 's' : ''}
            </p>
          </div>

          <button
            onClick={handleValidate}
            disabled={prmList.length === 0 || loading}
            className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Search className="w-5 h-5" />
            <span>{loading ? 'Validation en cours...' : 'Valider les PRM'}</span>
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 h-64 overflow-y-auto">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Statut de validation</h4>
          {prmList.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Aucun PRM saisi</p>
          ) : (
            <div className="space-y-2">
              {prmList.map((prm, index) => (
                <div key={index} className="flex items-center justify-between py-2 px-3 bg-white rounded border border-gray-200">
                  <span className="font-mono text-sm">{prm}</span>
                  {validationStatus[prm] ? (
                    <div className="flex items-center space-x-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">Reconnu</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 text-red-600">
                      <XCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">Non reconnu</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {validationResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-900">
              Résultats de validation ({validationResults.length} représentant{validationResults.length > 1 ? 's' : ''})
            </h4>
            <button
              onClick={handleExportExcel}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              <span>Exporter Excel</span>
            </button>
          </div>

          <div className="p-6 space-y-6">
            {validationResults.map((result, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-blue-50 border-b border-gray-200 p-4">
                  <h5 className="font-semibold text-gray-900 mb-2">Représentant</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 block">Civilité</span>
                      <span className="font-medium">{result.representant.civilite || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block">Nom</span>
                      <span className="font-medium">{result.representant.nom}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block">Prénom</span>
                      <span className="font-medium">{result.representant.prenom}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block">Email</span>
                      <span className="font-medium">{result.representant.email}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block">Téléphone</span>
                      <span className="font-medium">{result.representant.telephone || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block">Adresse IP</span>
                      <span className="font-medium font-mono text-xs">{result.representant.ip || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block">Date autorisation</span>
                      <span className="font-medium">{result.representant.date_autorisation || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 block">Type</span>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        result.representant.type === 'professionnel'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {result.representant.type === 'professionnel' ? 'Professionnel' : 'Particulier'}
                      </span>
                    </div>
                    {result.representant.type === 'professionnel' && (
                      <>
                        <div>
                          <span className="text-gray-600 block">Raison sociale</span>
                          <span className="font-medium">{result.representant.raison_sociale || '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 block">Forme juridique</span>
                          <span className="font-medium">{result.representant.forme_juridique || '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 block">SIREN</span>
                          <span className="font-medium font-mono">{result.representant.siren || '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 block">Code NAF</span>
                          <span className="font-medium">{result.representant.code_naf || '-'}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  <h6 className="font-semibold text-gray-900 mb-3">PRM associés ({result.prms.length})</h6>
                  <div className="space-y-2">
                    {result.prms.map((prm, prmIdx) => {
                      const isEntreprise = prm.titulaire_type === 'professionnel' || prm.titulaire_raison_sociale;
                      const adresseComplete = [
                        prm.titulaire_adresse,
                        prm.titulaire_code_postal,
                        prm.titulaire_ville
                      ].filter(Boolean).join(' ');

                      return (
                        <div key={prmIdx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <span className="text-gray-600 block">
                                {isEntreprise ? 'Raison sociale' : 'Nom Prénom'}
                              </span>
                              <span className="font-medium">
                                {isEntreprise
                                  ? prm.titulaire_raison_sociale || '-'
                                  : [prm.titulaire_nom, prm.titulaire_prenom].filter(Boolean).join(' ') || '-'
                                }
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600 block">Numéro de SIRET</span>
                              <span className="font-medium font-mono">
                                {prm.titulaire_siret || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600 block">Adresse du titulaire</span>
                              <span className="font-medium">{adresseComplete || '-'}</span>
                            </div>
                            <div>
                              <span className="text-gray-600 block">PRM</span>
                              <span className="font-medium font-mono text-blue-600">{prm.numero}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
