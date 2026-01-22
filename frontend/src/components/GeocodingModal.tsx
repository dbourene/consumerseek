import { useState, useEffect } from 'react';
import { X, MapPin, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { geocodeConsommateurs, GeocodeResult, countConsommateursToGeocode } from '../services/geocoding';
import { Consommateur } from '../types/consommateur';
import { loadConsumersOnDemand, LoadResult } from '../services/externalConsumersAPI';
import { linkEligibleConsumersToInstallation } from '../services/installationConsumers';
import { ActiveInstallation } from '../types/installation';

interface GeocodingModalProps {
  communes: string[];
  annee: number;
  installations?: ActiveInstallation[];
  onClose: () => void;
  onComplete: (result: GeocodeResult) => void;
}

export function GeocodingModal({ communes, annee, installations = [], onClose, onComplete }: GeocodingModalProps) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLoadingCount, setIsLoadingCount] = useState(true);
  const [isLoadingConsumers, setIsLoadingConsumers] = useState(false);
  const [totalToGeocode, setTotalToGeocode] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [result, setResult] = useState<GeocodeResult | null>(null);
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const loadConsumersAndCount = async () => {
      setIsLoadingConsumers(true);
      try {
        const loadRes = await loadConsumersOnDemand(communes, annee, false);
        setLoadResult(loadRes);

        setIsLoadingCount(true);
        const count = await countConsommateursToGeocode(communes, annee);
        setTotalToGeocode(count);
      } catch (error) {
        console.error('Erreur lors du chargement des consommateurs:', error);
      } finally {
        setIsLoadingConsumers(false);
        setIsLoadingCount(false);
      }
    };
    loadConsumersAndCount();
  }, [communes, annee]);

  const handleGeocode = async () => {
    setIsGeocoding(true);
    try {
      const geocodeResult = await geocodeConsommateurs({
        communes,
        annee,
        onProgress: (current, total, success, failed) => {
          setProgress({ current, total, success, failed });
        }
      });

      if (installations.length > 0) {
        for (const installation of installations) {
          await linkEligibleConsumersToInstallation(
            installation.id,
            installation.latitude,
            installation.longitude,
            installation.marge || 200
          );
        }
      }

      setResult(geocodeResult);
      onComplete(geocodeResult);
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="flex justify-between items-center p-6 border-b">
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Géocodage des consommateurs</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {!result && !isGeocoding && (
            <div className="space-y-4">
              <p className="text-gray-600">
                Cette opération va d'abord charger les consommateurs depuis l'API Enedis, puis les géocoder
                en utilisant l'API adresse.data.gouv.fr.
              </p>

              {isLoadingConsumers && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-purple-800">
                    <Download className="w-5 h-5 animate-bounce" />
                    <p className="text-sm font-medium">
                      Chargement des consommateurs depuis l'API Enedis...
                    </p>
                  </div>
                </div>
              )}

              {loadResult && !isLoadingConsumers && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    <p className="text-sm font-medium">Chargement terminé</p>
                  </div>
                  <div className="text-sm text-green-700 space-y-1">
                    <p><strong>Consommateurs totaux :</strong> {loadResult.totalConsumers.toLocaleString('fr-FR')}</p>
                    <p><strong>Chargés depuis l'API :</strong> {loadResult.loadedFromAPI} commune(s)</p>
                    <p><strong>Depuis le cache :</strong> {loadResult.loadedFromCache} commune(s)</p>
                    <p><strong>Durée :</strong> {(loadResult.duration / 1000).toFixed(2)}s</p>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-sm text-blue-800">
                  <strong>Communes :</strong> {communes.length} sélectionnée(s)
                </p>
                <p className="text-sm text-blue-800">
                  <strong>Année :</strong> {annee}
                </p>
                {isLoadingCount || isLoadingConsumers ? (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    <span>{isLoadingConsumers ? 'Chargement des consommateurs...' : 'Calcul du nombre de consommateurs...'}</span>
                  </div>
                ) : (
                  <p className="text-sm text-blue-800">
                    <strong>Consommateurs à géocoder :</strong> {totalToGeocode.toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
              {totalToGeocode === 0 && !isLoadingCount && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    <p className="text-sm font-medium">
                      Tous les consommateurs sont déjà géocodés !
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {isGeocoding && (
            <div className="space-y-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-gray-700">{progress.current}</div>
                  <div className="text-sm text-gray-500">Traités</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-gray-700">{progress.total}</div>
                  <div className="text-sm text-gray-500">Total</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-600">{progress.success}</div>
                  <div className="text-sm text-green-600">Réussis</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-red-600">{progress.failed}</div>
                  <div className="text-sm text-red-600">Échoués</div>
                </div>
              </div>
            </div>
          )}

          {result && !isGeocoding && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Géocodage terminé</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-gray-700">{result.total}</div>
                  <div className="text-sm text-gray-500 mt-1">Total</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{result.success}</div>
                  <div className="text-sm text-green-600 mt-1">Réussis</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-600">{result.failed}</div>
                  <div className="text-sm text-red-600 mt-1">Échoués</div>
                </div>
              </div>
              {result.invalidAddresses.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                  <div className="flex items-center gap-2 text-yellow-800 mb-2">
                    <AlertCircle className="w-5 h-5" />
                    <p className="font-medium">
                      {result.invalidAddresses.length} adresse(s) nécessite(nt) une correction
                    </p>
                  </div>
                  <p className="text-sm text-yellow-700">
                    Utilisez le tableau de correction pour valider ces adresses.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          {!result && (
            <button
              onClick={handleGeocode}
              disabled={isGeocoding || isLoadingCount || isLoadingConsumers || totalToGeocode === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isGeocoding ? 'Géocodage en cours...' : isLoadingConsumers ? 'Chargement...' : isLoadingCount ? 'Calcul...' : totalToGeocode === 0 ? 'Rien à géocoder' : 'Lancer le géocodage'}
            </button>
          )}
          {result && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Fermer
            </button>
          )}
          {!isGeocoding && !result && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
