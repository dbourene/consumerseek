import { useState } from 'react';
import { Database, MapPin, GitMerge } from 'lucide-react';
import { getCommunesForSireneLoading, loadSireneForCommunes, LoadingSireneProgress } from '../services/sireneAPI';
import { matchConsommateursWithSocietes, MatchingProgress } from '../services/sireneMatching';

interface SireneOperationsPanelProps {
  selectedInstallations?: string[];
  onStartGeocoding?: () => void;
}

export function SireneOperationsPanel({ selectedInstallations = [], onStartGeocoding }: SireneOperationsPanelProps) {
  const [isLoadingSirene, setIsLoadingSirene] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [forceReload, setForceReload] = useState(false);
  const [sireneProgress, setSireneProgress] = useState<LoadingSireneProgress | null>(null);
  const [matchingProgress, setMatchingProgress] = useState<MatchingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLoadSirene = async () => {
    setIsLoadingSirene(true);
    setError(null);
    setSuccess(null);
    setSireneProgress(null);

    try {
      if (selectedInstallations.length === 0) {
        setError('Veuillez sélectionner au moins une installation dans le sélecteur "Installations existantes"');
        setIsLoadingSirene(false);
        return;
      }

      const communes = await getCommunesForSireneLoading(selectedInstallations);

      const communesToLoad = forceReload
        ? communes
        : communes.filter(c => c.needs_reload);

      if (communesToLoad.length === 0) {
        setSuccess(`Toutes les communes des ${selectedInstallations.length} installation(s) sélectionnée(s) sont à jour (chargées il y a moins de 6 mois)`);
        setIsLoadingSirene(false);
        return;
      }

      const result = await loadSireneForCommunes(
        communesToLoad,
        (progress) => {
          setSireneProgress(progress);
        }
      );

      if (result.failed > 0) {
        setError(
          `Chargement terminé avec des erreurs: ${result.success} succès, ${result.failed} échecs.\n${result.errors.join('\n')}`
        );
      } else {
        const reloadType = forceReload ? 'rechargé' : 'chargé';
        setSuccess(
          `Chargement SIRENE terminé avec succès: ${result.success} commune(s) ${reloadType}(s) pour ${selectedInstallations.length} installation(s) sélectionnée(s)`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors du chargement SIRENE'
      );
    } finally {
      setIsLoadingSirene(false);
    }
  };

  const handleMatchConsommateurs = async () => {
    setIsMatching(true);
    setError(null);
    setSuccess(null);
    setMatchingProgress(null);

    try {
      const result = await matchConsommateursWithSocietes(undefined, (progress) => {
        setMatchingProgress(progress);
      });

      setSuccess(
        `Rapprochement terminé: ${result.matched} consommateurs matchés, ${result.unmatched} non matchés`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors du rapprochement'
      );
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <input
          type="checkbox"
          id="forceReload"
          checked={forceReload}
          onChange={(e) => setForceReload(e.target.checked)}
          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
          disabled={isLoadingSirene}
        />
        <label htmlFor="forceReload" className="text-sm text-gray-700 cursor-pointer">
          <span className="font-medium">Forcer le rechargement</span> - Recharger toutes les communes même si elles ont été chargées récemment (moins de 6 mois)
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={onStartGeocoding}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <MapPin className="w-5 h-5" />
          <span>Géocoder les consommateurs</span>
        </button>

        <button
          onClick={handleLoadSirene}
          disabled={isLoadingSirene}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Database className="w-5 h-5" />
          <span>
            {isLoadingSirene
              ? 'Chargement en cours...'
              : 'Charger les sociétés'}
          </span>
        </button>

        <button
          onClick={handleMatchConsommateurs}
          disabled={isMatching}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GitMerge className="w-5 h-5" />
          <span>
            {isMatching ? 'Rapprochement en cours...' : 'Rapprocher consommateurs'}
          </span>
        </button>
      </div>

      {sireneProgress && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-3">
            Progression du chargement SIRENE
          </h3>

          <div className="mb-3 p-3 bg-white rounded border border-blue-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-blue-900">
                {sireneProgress.communeName} ({sireneProgress.commune})
              </span>
              <span className="text-xs text-blue-600">
                Commune {sireneProgress.communeIndex} / {sireneProgress.totalCommunes}
              </span>
            </div>

            {sireneProgress.total > 0 && (
              <>
                <div className="flex justify-between text-xs text-blue-700 mb-1">
                  <span>Établissements</span>
                  <span>{sireneProgress.current} / {sireneProgress.total}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(sireneProgress.current / sireneProgress.total) * 100}%`
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="mb-2">
            <div className="flex justify-between text-xs text-blue-700 mb-1">
              <span>Progression globale</span>
              <span>{sireneProgress.communeIndex} / {sireneProgress.totalCommunes} communes</span>
            </div>
            <div className="w-full bg-blue-300 rounded-full h-3">
              <div
                className="bg-green-600 h-3 rounded-full transition-all duration-300 flex items-center justify-center text-xs text-white font-semibold"
                style={{
                  width: `${(sireneProgress.communeIndex / sireneProgress.totalCommunes) * 100}%`
                }}
              >
                {Math.round((sireneProgress.communeIndex / sireneProgress.totalCommunes) * 100)}%
              </div>
            </div>
          </div>

          <p className="text-sm text-blue-800 mt-3 font-medium">
            {sireneProgress.message}
          </p>
        </div>
      )}

      {matchingProgress && (
        <div className="mb-4 p-4 bg-purple-50 rounded-lg">
          <h3 className="font-semibold text-purple-900 mb-2">
            Progression du rapprochement
          </h3>
          <p className="text-sm text-purple-800 mb-2">{matchingProgress.message}</p>
          <div className="grid grid-cols-2 gap-4 mb-2 text-sm">
            <div>
              <span className="font-semibold">Matchés:</span>{' '}
              {matchingProgress.matched}
            </div>
            <div>
              <span className="font-semibold">Non matchés:</span>{' '}
              {matchingProgress.unmatched}
            </div>
          </div>
          {matchingProgress.total > 0 && (
            <div className="w-full bg-purple-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(matchingProgress.current / matchingProgress.total) * 100}%`
                }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm whitespace-pre-line">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2">
          Processus de rapprochement
        </h3>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
          <li>
            <strong>Match exact:</strong> Adresse complète + 2 premiers chiffres du
            code NAF
          </li>
          <li>
            <strong>Match flou:</strong> Similarité d'adresse (Jaro-Winkler ≥ 80%)
            avec NAF2 exact
          </li>
          <li>
            <strong>Match géographique:</strong> Distance ≤ 500m avec NAF2 exact
          </li>
        </ol>
      </div>
    </>
  );
}
