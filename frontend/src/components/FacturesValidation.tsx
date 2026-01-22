import React, { useState, useEffect } from 'react';
import { FileText, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { getFactures, updateFacture } from '../services/consumerstat';
import InvoiceValidationModal from './InvoiceValidationModal';
import type { Facture } from '../types/consumerstat';

export default function FacturesValidation() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'en_attente' | 'extraite' | 'validée'>('all');
  const [selectedFacture, setSelectedFacture] = useState<Facture | null>(null);

  useEffect(() => {
    loadFactures();
  }, [filter]);

  async function loadFactures() {
    try {
      setLoading(true);
      const data = await getFactures(
        filter === 'all' ? undefined : { statut: filter }
      );
      setFactures(data);
    } catch (error) {
      console.error('Error loading factures:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (id: string, data: Partial<Facture>) => {
    await updateFacture(id, data);
    await loadFactures();
  };

  const stats = {
    total: factures.length,
    en_attente: factures.filter(f => f.statut_extraction === 'en_attente').length,
    extraite: factures.filter(f => f.statut_extraction === 'extraite').length,
    validée: factures.filter(f => f.statut_extraction === 'validée').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des factures...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats */}
      <div className="p-6 border-b border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total</p>
                <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-600 opacity-50" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 font-medium">En attente</p>
                <p className="text-2xl font-bold text-yellow-900">{stats.en_attente}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600 opacity-50" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">À valider</p>
                <p className="text-2xl font-bold text-orange-900">{stats.extraite}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-600 opacity-50" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Validées</p>
                <p className="text-2xl font-bold text-green-900">{stats.validée}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600 opacity-50" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Toutes
          </button>
          <button
            onClick={() => setFilter('en_attente')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'en_attente'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            En attente
          </button>
          <button
            onClick={() => setFilter('extraite')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'extraite'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            À valider
          </button>
          <button
            onClick={() => setFilter('validée')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'validée'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Validées
          </button>
        </div>
      </div>

      {/* Factures list */}
      <div className="flex-1 overflow-auto p-6">
        {factures.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">Aucune facture</h4>
            <p className="text-gray-500">
              Les factures déposées par vos contacts apparaîtront ici
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {factures.map(facture => (
              <div
                key={facture.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="font-semibold text-gray-900">{facture.fichier_nom}</h4>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          facture.statut_extraction === 'validée'
                            ? 'bg-green-100 text-green-800'
                            : facture.statut_extraction === 'extraite'
                            ? 'bg-orange-100 text-orange-800'
                            : facture.statut_extraction === 'en_cours'
                            ? 'bg-blue-100 text-blue-800'
                            : facture.statut_extraction === 'erreur'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {facture.statut_extraction}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {facture.fournisseur && (
                        <div>
                          <p className="text-gray-500">Fournisseur</p>
                          <p className="font-medium text-gray-900">{facture.fournisseur}</p>
                        </div>
                      )}
                      {facture.periode_debut && (
                        <div>
                          <p className="text-gray-500">Période</p>
                          <p className="font-medium text-gray-900">
                            {new Date(facture.periode_debut).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      )}
                      {facture.conso_totale && (
                        <div>
                          <p className="text-gray-500">Consommation</p>
                          <p className="font-medium text-gray-900">{facture.conso_totale.toLocaleString()} kWh</p>
                        </div>
                      )}
                      {facture.prix_total_ttc && (
                        <div>
                          <p className="text-gray-500">Montant TTC</p>
                          <p className="font-medium text-gray-900">{facture.prix_total_ttc.toFixed(2)} €</p>
                        </div>
                      )}
                    </div>

                    {facture.confiance_globale !== null && facture.confiance_globale !== undefined && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-500">Confiance OCR</span>
                          <span className="font-medium text-gray-900">{facture.confiance_globale.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
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
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedFacture(facture)}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Valider
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedFacture && (
        <InvoiceValidationModal
          facture={selectedFacture}
          onClose={() => setSelectedFacture(null)}
          onSave={(data) => handleSave(selectedFacture.id, data)}
        />
      )}
    </div>
  );
}
