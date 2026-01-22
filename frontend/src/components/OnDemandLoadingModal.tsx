import { useState } from 'react';
import { Loader2, Database, CheckCircle, AlertCircle } from 'lucide-react';
import { loadConsumersOnDemand, LoadResult } from '../services/externalConsumersAPI';

interface OnDemandLoadingModalProps {
  communeCodes: string[];
  annee: number;
  onComplete: () => void;
  onCancel: () => void;
}

export default function OnDemandLoadingModal({
  communeCodes,
  annee,
  onComplete,
  onCancel
}: OnDemandLoadingModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const loadResult = await loadConsumersOnDemand(communeCodes, annee, false);
      setResult(loadResult);

      if (loadResult.errors.length > 0) {
        setError(loadResult.errors.join(', '));
      }

      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">
            Chargement des consommateurs
          </h2>
        </div>

        {loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
            <p className="text-center text-gray-600">
              Chargement des données pour {communeCodes.length} commune(s)...
            </p>
            <div className="bg-blue-50 border-blue-200 border rounded-lg p-4">
              <p className="text-sm text-gray-800">
                Les données sont chargées depuis l'API Enedis et mises en cache localement.
                Cette opération peut prendre quelques secondes.
              </p>
            </div>
          </div>
        )}


        {!loading && result && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-3">
                  Chargement terminé
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-gray-900">
                      {result.totalConsumers.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-600">Consommateurs</div>
                  </div>
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-gray-900">
                      {(result.duration / 1000).toFixed(2)}s
                    </div>
                    <div className="text-xs text-gray-600">Durée</div>
                  </div>
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-blue-600">
                      {result.loadedFromAPI}
                    </div>
                    <div className="text-xs text-gray-600">Depuis API</div>
                  </div>
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-green-600">
                      {result.loadedFromCache}
                    </div>
                    <div className="text-xs text-gray-600">Depuis cache</div>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">Avertissement</p>
                  <p className="text-sm text-yellow-700 mt-1">{error}</p>
                </div>
              </div>
            )}

            <p className="text-center text-sm text-gray-600">
              Redirection automatique vers la carte...
            </p>
          </div>
        )}

        {!loading && error && !result && !testResult && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Erreur</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
              >
                Annuler
              </button>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {!loading && !result && !error && (
          <div className="space-y-4">
            <div className="bg-blue-50 border-blue-200 border rounded-lg p-4">
              <p className="text-sm text-gray-800 mb-4">
                Les données seront chargées depuis l'API Enedis et insérées dans la base de données locale.
              </p>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-sm text-gray-700">
                  <strong>Communes:</strong> {communeCodes.join(', ')}
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  <strong>Année:</strong> {annee}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
              >
                Annuler
              </button>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                Charger les données
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-end mt-4">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
            >
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
