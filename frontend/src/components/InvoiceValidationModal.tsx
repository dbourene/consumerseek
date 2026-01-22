import React, { useState, useEffect } from 'react';
import { X, Save, FileText, AlertCircle, Eye, Download, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../supabaseClient';
import type { Facture } from '../types/consumerstat';

interface InvoiceValidationModalProps {
  facture: Facture;
  onClose: () => void;
  onSave: (data: Partial<Facture>) => Promise<void>;
}

export default function InvoiceValidationModal({ facture, onClose, onSave }: InvoiceValidationModalProps) {
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [initialExtractedData, setInitialExtractedData] = useState<Record<string, any>>({});
  const [expandedSections, setExpandedSections] = useState({
    general: true,
    compteur: true,
    consommations: true,
    tarifs: false,
    montants: true,
    autres: false,
  });

  const [formData, setFormData] = useState({
    fournisseur: facture.fournisseur || '',
    pdl: facture.pdl || '',
    annee: facture.annee || new Date().getFullYear(),
    periode_debut: facture.periode_debut || '',
    periode_fin: facture.periode_fin || '',

    type_compteur: facture.type_compteur || '',
    puissance_souscrite_kva: facture.puissance_souscrite_kva || 0,
    temporalite: facture.temporalite || '',
    version_tarif: facture.version_tarif || '',

    conso_totale: facture.conso_totale || 0,
    conso_base: facture.conso_base || 0,
    conso_hp: facture.conso_hp || 0,
    conso_hc: facture.conso_hc || 0,
    conso_hph: facture.conso_hph || 0,
    conso_hch: facture.conso_hch || 0,
    conso_hpb: facture.conso_hpb || 0,
    conso_hcb: facture.conso_hcb || 0,
    conso_pointe: facture.conso_pointe || 0,

    tarif_base_parkwh: facture.tarif_base_parkwh || 0,
    tarif_hp_parkwh: facture.tarif_hp_parkwh || 0,
    tarif_hc_parkwh: facture.tarif_hc_parkwh || 0,
    tarif_hph_parkwh: facture.tarif_hph_parkwh || 0,
    tarif_hch_parkwh: facture.tarif_hch_parkwh || 0,
    tarif_hpb_parkwh: facture.tarif_hpb_parkwh || 0,
    tarif_hcb_parkwh: facture.tarif_hcb_parkwh || 0,
    tarif_pointe_parkwh: facture.tarif_pointe_parkwh || 0,
    tarif_accise_parkwh: facture.tarif_accise_parkwh || 0,

    tarif_abonnement: facture.tarif_abonnement || 0,
    montant_fourniture_ht: facture.montant_fourniture_ht || 0,
    montant_acheminement_ht: facture.montant_acheminement_ht || 0,
    montant_arenh: facture.montant_arenh || 0,
    montant_taxes_total: facture.montant_taxes_total || 0,
    tarif_acheminement_total: facture.tarif_acheminement_total || 0,
    tarif_cta_total: facture.tarif_cta_total || 0,
    tarif_cta_unitaire: facture.tarif_cta_unitaire || 0,
    prix_total_ht: facture.prix_total_ht || 0,
    prix_total_ttc: facture.prix_total_ttc || 0,

    contient_arenh: facture.contient_arenh || false,
    contient_turpe: facture.contient_turpe || false,

    nom_commune: facture.nom_commune || '',
    code_departement: facture.code_departement || '',
    code_naf: facture.code_naf || '',
    code_naf2: facture.code_naf2 || '',
    tranche_conso: facture.tranche_conso || '',
    categorie_activite: facture.categorie_activite || '',
  });

  useEffect(() => {
    loadPreview();

    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [facture.id]);

  const loadPreview = async () => {
    try {
      console.log('Loading preview for:', {
        bucket_id: facture.bucket_id,
        fichier_path: facture.fichier_path
      });

      const { data, error } = await supabase.storage
        .from(facture.bucket_id)
        .download(facture.fichier_path);

      if (error) {
        console.error('Error downloading file:', error);
        setPreviewError(`Erreur: ${error.message}`);
        throw error;
      }

      const blobUrl = URL.createObjectURL(data);
      console.log('Blob URL created:', blobUrl);
      setPreviewUrl(blobUrl);
      setPreviewError(null);
    } catch (error) {
      console.error('Error loading preview:', error);
      setPreviewError(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const extractDataFromOCR = async () => {
    try {
      setExtracting(true);
      console.log('Starting intelligent extraction...');

      const { data, error } = await supabase.functions.invoke('extract-facture', {
        body: {
          factureId: facture.id,
          supplierHint: formData.fournisseur || null
        }
      });

      if (error) {
        console.error('Extraction error:', error);
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Extraction failed');
      }

      const extractedData = data.extracted_data || {};
      const fieldsExtracted = Object.keys(extractedData).length;

      console.log('Extracted data:', extractedData);
      console.log('Confidence:', data.confidence);

      setExtractionId(data.extraction_id);
      setInitialExtractedData({ ...extractedData });

      setFormData(prev => ({
        ...prev,
        ...extractedData,
      }));

      alert(`Extraction terminée ! ${fieldsExtracted} champs extraits avec ${Math.round(data.confidence.global * 100)}% de confiance`);
    } catch (error) {
      console.error('Extraction error:', error);
      alert('Erreur lors de l\'extraction intelligente: ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
    } finally {
      setExtracting(false);
    }
  };

  const detectCorrections = () => {
    const corrections: Record<string, { extracted: any, corrected: any }> = {};

    Object.keys(initialExtractedData).forEach(key => {
      const initialValue = initialExtractedData[key];
      const currentValue = (formData as any)[key];

      if (initialValue !== currentValue && currentValue !== null && currentValue !== undefined) {
        corrections[key] = {
          extracted: initialValue,
          corrected: currentValue
        };
      }
    });

    return corrections;
  };

  const sendLearningFeedback = async (corrections: Record<string, any>) => {
    if (!extractionId || Object.keys(corrections).length === 0) {
      return;
    }

    try {
      const pythonServiceUrl = import.meta.env.VITE_PYTHON_SERVICE_URL || 'http://localhost:8000';

      await fetch(`${pythonServiceUrl}/learn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extraction_id: extractionId,
          facture_id: facture.id,
          corrections: corrections
        })
      });

      console.log(`Sent ${Object.keys(corrections).length} corrections for learning`);
    } catch (error) {
      console.error('Failed to send learning feedback:', error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.fournisseur || !formData.prix_total_ttc) {
      alert('Veuillez remplir au minimum le fournisseur et le prix TTC');
      return;
    }

    try {
      setLoading(true);

      const corrections = detectCorrections();

      await onSave({
        ...formData,
        statut_extraction: 'validée',
      });

      if (Object.keys(corrections).length > 0) {
        await sendLearningFeedback(corrections);
      }

      onClose();
    } catch (error) {
      console.error('Error saving facture:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Validation de facture</h2>
              <p className="text-sm text-gray-500">{facture.fichier_nom}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Aperçu</h3>
                <button
                  onClick={downloadFile}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Télécharger
                </button>
              </div>

              {previewError ? (
                <div className="border border-red-200 rounded-lg p-12 text-center bg-red-50">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                  <p className="text-red-700 font-medium mb-2">Erreur de chargement</p>
                  <p className="text-sm text-red-600">{previewError}</p>
                  <button
                    onClick={loadPreview}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                  >
                    Réessayer
                  </button>
                </div>
              ) : previewUrl ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  {facture.fichier_nom.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      src={previewUrl}
                      className="w-full h-[600px]"
                      title="Aperçu PDF"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Aperçu facture"
                      className="w-full h-auto"
                    />
                  )}
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg p-12 text-center bg-gray-50">
                  <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Chargement de l'aperçu...</p>
                </div>
              )}

              {facture.confiance_globale !== null && facture.confiance_globale !== undefined && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-2">
                        Confiance OCR : {facture.confiance_globale.toFixed(0)}%
                      </p>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            facture.confiance_globale >= 80
                              ? 'bg-green-500'
                              : facture.confiance_globale >= 60
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${facture.confiance_globale}%` }}
                        />
                      </div>
                      <p className="text-xs text-blue-700 mt-2">
                        {facture.confiance_globale < 60
                          ? 'Vérifiez attentivement les données extraites'
                          : facture.confiance_globale < 80
                          ? 'Vérifiez les données avant validation'
                          : 'Les données semblent fiables'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Form */}
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Informations extraites</h3>
                <button
                  onClick={extractDataFromOCR}
                  disabled={extracting || !previewUrl}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <Wand2 className="w-4 h-4" />
                  {extracting ? 'Extraction intelligente...' : 'Extraction Intelligente'}
                </button>
              </div>

              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {/* Section: Informations générales */}
                <div className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => toggleSection('general')}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900">Informations générales</h4>
                    {expandedSections.general ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  {expandedSections.general && (
                    <div className="p-4 pt-0 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur *</label>
                        <input
                          type="text"
                          value={formData.fournisseur}
                          onChange={(e) => handleChange('fournisseur', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="EDF, Engie, Total Energies..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">N° PDL</label>
                        <input
                          type="text"
                          value={formData.pdl}
                          onChange={(e) => handleChange('pdl', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
                          <input
                            type="number"
                            value={formData.annee}
                            onChange={(e) => handleChange('annee', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Période début</label>
                          <input
                            type="date"
                            value={formData.periode_debut}
                            onChange={(e) => handleChange('periode_debut', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Période fin</label>
                          <input
                            type="date"
                            value={formData.periode_fin}
                            onChange={(e) => handleChange('periode_fin', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Compteur */}
                <div className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => toggleSection('compteur')}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900">Compteur</h4>
                    {expandedSections.compteur ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  {expandedSections.compteur && (
                    <div className="p-4 pt-0 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Type compteur</label>
                          <input
                            type="text"
                            value={formData.type_compteur}
                            onChange={(e) => handleChange('type_compteur', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Linky, ancien..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Puissance (kVA)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.puissance_souscrite_kva}
                            onChange={(e) => handleChange('puissance_souscrite_kva', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Temporalité</label>
                          <select
                            value={formData.temporalite}
                            onChange={(e) => handleChange('temporalite', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- Sélectionner --</option>
                            <option value="base">Base</option>
                            <option value="hp_hc">HP/HC</option>
                            <option value="tempo">Tempo</option>
                            <option value="ejp">EJP</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Version tarif</label>
                          <input
                            type="text"
                            value={formData.version_tarif}
                            onChange={(e) => handleChange('version_tarif', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Consommations */}
                <div className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => toggleSection('consommations')}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900">Consommations (kWh)</h4>
                    {expandedSections.consommations ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  {expandedSections.consommations && (
                    <div className="p-4 pt-0 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Consommation totale</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.conso_totale}
                          onChange={(e) => handleChange('conso_totale', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Base</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_base}
                            onChange={(e) => handleChange('conso_base', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Pointe</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_pointe}
                            onChange={(e) => handleChange('conso_pointe', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HP</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_hp}
                            onChange={(e) => handleChange('conso_hp', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HC</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_hc}
                            onChange={(e) => handleChange('conso_hc', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HPH</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_hph}
                            onChange={(e) => handleChange('conso_hph', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HCH</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_hch}
                            onChange={(e) => handleChange('conso_hch', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HPB</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_hpb}
                            onChange={(e) => handleChange('conso_hpb', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HCB</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.conso_hcb}
                            onChange={(e) => handleChange('conso_hcb', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Tarifs unitaires */}
                <div className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => toggleSection('tarifs')}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900">Tarifs unitaires (€/kWh)</h4>
                    {expandedSections.tarifs ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  {expandedSections.tarifs && (
                    <div className="p-4 pt-0 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Base</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_base_parkwh}
                            onChange={(e) => handleChange('tarif_base_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Pointe</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_pointe_parkwh}
                            onChange={(e) => handleChange('tarif_pointe_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HP</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_hp_parkwh}
                            onChange={(e) => handleChange('tarif_hp_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HC</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_hc_parkwh}
                            onChange={(e) => handleChange('tarif_hc_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HPH</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_hph_parkwh}
                            onChange={(e) => handleChange('tarif_hph_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HCH</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_hch_parkwh}
                            onChange={(e) => handleChange('tarif_hch_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HPB</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_hpb_parkwh}
                            onChange={(e) => handleChange('tarif_hpb_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">HCB</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={formData.tarif_hcb_parkwh}
                            onChange={(e) => handleChange('tarif_hcb_parkwh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Accise</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={formData.tarif_accise_parkwh}
                          onChange={(e) => handleChange('tarif_accise_parkwh', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Montants */}
                <div className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => toggleSection('montants')}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900">Montants (€)</h4>
                    {expandedSections.montants ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  {expandedSections.montants && (
                    <div className="p-4 pt-0 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Prix HT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.prix_total_ht}
                            onChange={(e) => handleChange('prix_total_ht', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Prix TTC *</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.prix_total_ttc}
                            onChange={(e) => handleChange('prix_total_ttc', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Abonnement</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.tarif_abonnement}
                            onChange={(e) => handleChange('tarif_abonnement', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Fourniture HT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.montant_fourniture_ht}
                            onChange={(e) => handleChange('montant_fourniture_ht', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Acheminement HT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.montant_acheminement_ht}
                            onChange={(e) => handleChange('montant_acheminement_ht', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">ARENH</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.montant_arenh}
                            onChange={(e) => handleChange('montant_arenh', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Taxes totales</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.montant_taxes_total}
                            onChange={(e) => handleChange('montant_taxes_total', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Acheminement total</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.tarif_acheminement_total}
                            onChange={(e) => handleChange('tarif_acheminement_total', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">CTA total</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.tarif_cta_total}
                            onChange={(e) => handleChange('tarif_cta_total', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">CTA unitaire</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.tarif_cta_unitaire}
                            onChange={(e) => handleChange('tarif_cta_unitaire', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="arenh"
                            checked={formData.contient_arenh}
                            onChange={(e) => handleChange('contient_arenh', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor="arenh" className="text-sm font-medium text-gray-700">Contient ARENH</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="turpe"
                            checked={formData.contient_turpe}
                            onChange={(e) => handleChange('contient_turpe', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor="turpe" className="text-sm font-medium text-gray-700">Contient TURPE</label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Autres informations */}
                <div className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => toggleSection('autres')}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900">Autres informations</h4>
                    {expandedSections.autres ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  {expandedSections.autres && (
                    <div className="p-4 pt-0 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Commune</label>
                          <input
                            type="text"
                            value={formData.nom_commune}
                            onChange={(e) => handleChange('nom_commune', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Département</label>
                          <input
                            type="text"
                            value={formData.code_departement}
                            onChange={(e) => handleChange('code_departement', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Code NAF</label>
                          <input
                            type="text"
                            value={formData.code_naf}
                            onChange={(e) => handleChange('code_naf', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Code NAF2</label>
                          <input
                            type="text"
                            value={formData.code_naf2}
                            onChange={(e) => handleChange('code_naf2', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tranche conso</label>
                          <input
                            type="text"
                            value={formData.tranche_conso}
                            onChange={(e) => handleChange('tranche_conso', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie activité</label>
                          <input
                            type="text"
                            value={formData.categorie_activite}
                            onChange={(e) => handleChange('categorie_activite', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">
            * Champs obligatoires
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.fournisseur || !formData.prix_total_ttc}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Sauvegarde...' : 'Valider la facture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
