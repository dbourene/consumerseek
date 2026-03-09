import { useState, useMemo } from 'react';
import { Search, Check, X, AlertCircle, Building2, MapPin, Activity, CheckCircle2 } from 'lucide-react';
import { matchConsumerWithSirene, saveMatchResult, type MatchResult } from '../services/sireneMatching';

interface SireneMatchingProps {
  consommateurs: any[];
  onMatchComplete?: () => void;
}

export default function SireneMatching({ consommateurs, onMatchComplete }: SireneMatchingProps) {
  const [isMatching, setIsMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<MatchResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isSaving, setIsSaving] = useState<number | null>(null);

  const { enrichedConsumers, unenrichedConsumers, stats } = useMemo(() => {
    const enriched = consommateurs.filter(c => c.siren || c.siret);
    const unenriched = consommateurs.filter(c => !c.siren && !c.siret);

    console.log(`📊 Analyse des consommateurs:`);
    console.log(`   Total: ${consommateurs.length}`);
    console.log(`   Enrichis (avec SIREN/SIRET): ${enriched.length}`);
    console.log(`   Non enrichis: ${unenriched.length}`);

    if (enriched.length > 0) {
      console.log(`   Exemples enrichis:`, enriched.slice(0, 3).map(c => ({
        id: c.id,
        adresse: c.adresse,
        siren: c.siren,
        siret: c.siret
      })));
    }

    if (unenriched.length > 0) {
      console.log(`   Exemples non enrichis:`, unenriched.slice(0, 3).map(c => ({
        id: c.id,
        adresse: c.adresse,
        siren: c.siren,
        siret: c.siret
      })));
    }

    return {
      enrichedConsumers: enriched,
      unenrichedConsumers: unenriched,
      stats: {
        total: consommateurs.length,
        enriched: enriched.length,
        toProcess: unenriched.length,
        enrichedPercentage: consommateurs.length > 0
          ? Math.round((enriched.length / consommateurs.length) * 100)
          : 0
      }
    };
  }, [consommateurs]);

  const startMatching = async () => {
    if (unenrichedConsumers.length === 0) {
      alert('Tous les consommateurs ont déjà été enrichis !');
      return;
    }

    setIsMatching(true);
    setMatchResults([]);
    setProgress({ current: 0, total: unenrichedConsumers.length });

    const results: MatchResult[] = [];

    console.log(`🔍 Lancement du rapprochement SIRENE sur ${unenrichedConsumers.length} consommateurs non enrichis`);

    for (let i = 0; i < unenrichedConsumers.length; i++) {
      const consommateur = unenrichedConsumers[i];
      setProgress({ current: i + 1, total: unenrichedConsumers.length });

      try {
        const match = await matchConsumerWithSirene(consommateur);
        if (match && match.score >= 50) {
          results.push(match);
        }
      } catch (error) {
        console.error(`Erreur pour ${consommateur.adresse}:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`✅ Rapprochement terminé: ${results.length} correspondances trouvées`);
    setMatchResults(results.sort((a, b) => b.score - a.score));
    setIsMatching(false);
  };

  const handleValidate = async (result: MatchResult) => {
    setIsSaving(result.consommateurId);
    try {
      console.log(`👍 Validation du rapprochement pour le consommateur ID: ${result.consommateurId}`);
      await saveMatchResult(result);

      console.log('🔄 Retrait de la liste des résultats et déclenchement du rechargement');
      setMatchResults((prev) => prev.filter((r) => r.consommateurId !== result.consommateurId));

      if (onMatchComplete) {
        console.log('📡 Appel du callback onMatchComplete pour rafraîchir les données');
        onMatchComplete();
      }

      console.log('✅ Validation terminée avec succès');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde du rapprochement');
    } finally {
      setIsSaving(null);
    }
  };

  const handleReject = (result: MatchResult) => {
    setMatchResults((prev) => prev.filter((r) => r.consommateurId !== result.consommateurId));
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-orange-600 bg-orange-50';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Bon';
    return 'Moyen';
  };

  const consommateur = selectedResult
    ? consommateurs.find((c) => c.id === selectedResult.consommateurId)
    : null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Rapprochement SIRENE
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Enrichissez vos données avec les informations officielles des entreprises
            </p>
          </div>
          <button
            onClick={startMatching}
            disabled={isMatching || stats.toProcess === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isMatching || stats.toProcess === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Search className="w-5 h-5" />
            {isMatching ? 'Recherche en cours...' : 'Lancer le rapprochement'}
          </button>
        </div>

        {/* Statistiques d'enrichissement */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Building2 className="w-8 h-8 text-gray-400" />
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">Enrichis</p>
                <p className="text-2xl font-bold text-green-900">{stats.enriched}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">À traiter</p>
                <p className="text-2xl font-bold text-blue-900">{stats.toProcess}</p>
              </div>
              <Search className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-indigo-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-indigo-600">Progression</p>
                <p className="text-2xl font-bold text-indigo-900">{stats.enrichedPercentage}%</p>
              </div>
              <div className="w-8 h-8 flex items-center justify-center">
                <div className="text-xs text-indigo-600 font-semibold">
                  {stats.enrichedPercentage}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {stats.enriched > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-800">
                <p className="font-medium">
                  {stats.enriched} consommateur{stats.enriched > 1 ? 's' : ''} déjà enrichi{stats.enriched > 1 ? 's' : ''}
                </p>
                <p className="mt-1">
                  Le rapprochement ne sera effectué que sur les {stats.toProcess} consommateur{stats.toProcess > 1 ? 's' : ''} restant{stats.toProcess > 1 ? 's' : ''}.
                </p>
              </div>
            </div>
          </div>
        )}

        {isMatching && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>
                Analyse en cours: {progress.current} / {progress.total}
              </span>
              <span>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {matchResults.length > 0 && !isMatching && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">
                  {matchResults.length} rapprochements trouvés
                </p>
                <p className="mt-1">
                  Vérifiez et validez les correspondances ci-dessous
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {matchResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Adresse consommateur
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entreprise trouvée
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Détails
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {matchResults.map((result) => {
                  const cons = consommateurs.find((c) => c.id === result.consommateurId);
                  const { etablissement } = result;
                  const nomEntreprise =
                    etablissement.denominationUniteLegale ||
                    (etablissement.nomUniteLegale && etablissement.prenomUniteLegale
                      ? `${etablissement.prenomUniteLegale} ${etablissement.nomUniteLegale}`
                      : 'Non renseigné');

                  return (
                    <tr
                      key={result.consommateurId}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedResult(result)}
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{cons?.adresse}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {cons?.code_commune?.substring(0, 5)} - Conso:{' '}
                          {Math.round(cons?.consommation_annuelle_mwh || 0)} MWh
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {nomEntreprise}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              SIRET: {etablissement.siret}
                            </div>
                            <div className="text-xs text-gray-500">
                              NAF: {etablissement.activitePrincipaleEtablissement}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScoreColor(
                              result.score
                            )}`}
                          >
                            {result.score}%
                          </span>
                          <span className="text-xs text-gray-500">
                            {getScoreLabel(result.score)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-600">
                              Adresse: {result.details.addressSimilarity}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Activity className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-600">
                              NAF: {result.details.nafConsistency}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Activity className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-600">
                              Conso: {result.details.consumptionConsistency}%
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleValidate(result);
                          }}
                          disabled={isSaving === result.consommateurId}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                        >
                          <Check className="w-4 h-4" />
                          {isSaving === result.consommateurId ? 'Enregistrement...' : 'Valider'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReject(result);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        >
                          <X className="w-4 h-4" />
                          Rejeter
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Panneau de détails */}
      {selectedResult && consommateur && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  Détails du rapprochement
                </h3>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Données consommateur */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Données consommateur
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div>
                      <span className="text-sm text-gray-600">Adresse:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {consommateur.adresse}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Code commune:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {consommateur.code_commune}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Code NAF:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {consommateur.code_secteur_naf2 || 'Non renseigné'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Consommation:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {Math.round(consommateur.consommation_annuelle_mwh || 0)} MWh/an
                      </p>
                    </div>
                  </div>
                </div>

                {/* Données SIRENE */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-green-600" />
                    Données SIRENE
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div>
                      <span className="text-sm text-gray-600">Entreprise:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedResult.etablissement.denominationUniteLegale ||
                          `${selectedResult.etablissement.prenomUniteLegale} ${selectedResult.etablissement.nomUniteLegale}` ||
                          'Non renseigné'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">SIREN / SIRET:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedResult.etablissement.siren} /{' '}
                        {selectedResult.etablissement.siret}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Adresse:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {[
                          selectedResult.etablissement.numeroVoieEtablissement,
                          selectedResult.etablissement.typeVoieEtablissement,
                          selectedResult.etablissement.libelleVoieEtablissement,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      <p className="text-sm text-gray-600">
                        {selectedResult.etablissement.codePostalEtablissement}{' '}
                        {selectedResult.etablissement.libelleCommuneEtablissement}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Code NAF:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedResult.etablissement.activitePrincipaleEtablissement}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scores détaillés */}
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-4">Analyse du rapprochement</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-2">Score global</div>
                    <div
                      className={`text-2xl font-bold ${
                        selectedResult.score >= 80
                          ? 'text-green-600'
                          : selectedResult.score >= 60
                          ? 'text-yellow-600'
                          : 'text-orange-600'
                      }`}
                    >
                      {selectedResult.score}%
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-2">Similarité adresse</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {selectedResult.details.addressSimilarity}%
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-2">Cohérence NAF</div>
                    <div className="text-2xl font-bold text-purple-600">
                      {selectedResult.details.nafConsistency}%
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-2">Cohérence conso</div>
                    <div className="text-2xl font-bold text-indigo-600">
                      {selectedResult.details.consumptionConsistency}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedResult(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Fermer
                </button>
                <button
                  onClick={() => {
                    handleReject(selectedResult);
                    setSelectedResult(null);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <X className="w-5 h-5" />
                  Rejeter
                </button>
                <button
                  onClick={() => {
                    handleValidate(selectedResult);
                    setSelectedResult(null);
                  }}
                  disabled={isSaving === selectedResult.consommateurId}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
                >
                  <Check className="w-5 h-5" />
                  {isSaving === selectedResult.consommateurId ? 'Enregistrement...' : 'Valider'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
