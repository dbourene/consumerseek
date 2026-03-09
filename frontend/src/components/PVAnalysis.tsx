import { useMemo } from 'react';
import { Consommateur } from '../types/consommateur';
import {
  analyzeConsumersPVPotential,
  getCategoryStats,
  getScoreDistribution,
} from '../services/pvScore';
import { Sun, TrendingUp, BarChart3 } from 'lucide-react';

interface PVAnalysisProps {
  consommateurs: Consommateur[];
}

const CATEGORY_COLORS = {
  'Très forte': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  Forte: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  Moyenne: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  Faible: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
};

export default function PVAnalysis({ consommateurs }: PVAnalysisProps) {
  console.log('📈 PVAnalysis - Consommateurs reçus:', consommateurs.length);

  const analysisResults = useMemo(() => {
    const results = analyzeConsumersPVPotential(consommateurs);
    console.log('📈 PVAnalysis - Résultats analyse:', results.length);
    return results;
  }, [consommateurs]);

  const categoryStats = useMemo(() => {
    return getCategoryStats(analysisResults);
  }, [analysisResults]);

  const scoreDistribution = useMemo(() => {
    const distribution = getScoreDistribution(analysisResults, 20);
    console.log('📈 PVAnalysis - Distribution calculée, bins avec données:', distribution.filter(d => d.count > 0).length);
    return distribution;
  }, [analysisResults]);

  const totalConsommation = useMemo(() => {
    return categoryStats.reduce((sum, cat) => sum + cat.consommation_totale_MWh, 0);
  }, [categoryStats]);

  const totalEntreprises = analysisResults.length;

  console.log('📈 PVAnalysis - Total entreprises:', totalEntreprises);
  console.log('📈 PVAnalysis - Total consommation:', totalConsommation.toFixed(2), 'MWh');

  if (totalEntreprises === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        Aucune entreprise à analyser dans la sélection actuelle.
      </p>
    );
  }

  const maxCount = scoreDistribution.length > 0
    ? Math.max(...scoreDistribution.map((d) => d.count))
    : 0;
  console.log('📈 PVAnalysis - maxCount:', maxCount);
  console.log('📈 PVAnalysis - scoreDistribution:', scoreDistribution.map((d, i) => ({ bin: i, count: d.count, mid: d.scoreMid.toFixed(2) })).filter(d => d.count > 0));

  return (
    <div className="space-y-6">

      {/* Vue d'ensemble */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-4 border border-yellow-200">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total entreprises analysées</p>
            <p className="text-2xl font-bold text-gray-800">{totalEntreprises}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Consommation totale</p>
            <p className="text-2xl font-bold text-gray-800">
              {totalConsommation.toFixed(1)} MWh/an
            </p>
          </div>
        </div>
      </div>

      {/* Cartes récapitulatives par catégorie */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-800">
            Répartition par Catégorie de Priorité
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categoryStats.map((stat) => {
            const colors = CATEGORY_COLORS[stat.categorie];
            const percentage =
              totalEntreprises > 0 ? (stat.count / totalEntreprises) * 100 : 0;

            return (
              <div
                key={stat.categorie}
                className={`${colors.bg} ${colors.border} border-2 rounded-lg p-4 transition-transform hover:scale-105`}
              >
                <h4 className={`text-sm font-semibold ${colors.text} mb-2`}>
                  {stat.categorie}
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xl font-bold text-gray-800">
                      {stat.count}
                    </span>
                    <span className="text-sm text-gray-600">
                      ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">entreprises</p>
                  <p className="text-sm font-semibold text-gray-700 mt-2">
                    {stat.consommation_totale_MWh.toFixed(1)} MWh/an
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Graphique de distribution du scoring */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-800">
            Distribution des Scores PV
          </h3>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="h-48 flex items-end gap-1">
            {scoreDistribution.map((bin, index) => {
              const heightPercent = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
              let barColor = 'bg-gray-400';
              if (bin.scoreMid > 0.75) barColor = 'bg-green-500';
              else if (bin.scoreMid > 0.60) barColor = 'bg-blue-500';
              else if (bin.scoreMid > 0.45) barColor = 'bg-yellow-500';

              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col justify-end items-center group relative"
                  style={{ height: '100%' }}
                >
                  {bin.count > 0 && (
                    <>
                      <div
                        className={`w-full ${barColor} rounded-t transition-all hover:opacity-80`}
                        style={{
                          height: `${heightPercent}%`,
                          minHeight: '4px'
                        }}
                      />
                      <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none z-10">
                        Score: {bin.scoreMid.toFixed(2)}
                        <br />
                        Nombre: {bin.count}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-2">
            <span>0.0</span>
            <span>Score PV</span>
            <span>1.0</span>
          </div>
        </div>
      </div>

      {/* Tableau détaillé des meilleures entreprises */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Top 20 Entreprises par Score PV
        </h3>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Rang
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  NAF2
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Conso (MWh/an)
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  S_stab
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  S_vol
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  S_pv
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Score PV
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Catégorie
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analysisResults.slice(0, 20).map((result, index) => {
                const colors = CATEGORY_COLORS[result.categorie];
                return (
                  <tr key={result.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">#{index + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {result.code_secteur_naf2}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {result.consommation_annuelle_mwh.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">
                      {result.s_stab.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">
                      {result.s_vol.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">
                      {result.s_pv.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          {result.score_pv.toFixed(3)}
                        </span>
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`${colors.bg.replace('100', '500')} h-2 rounded-full`}
                            style={{ width: `${result.score_pv * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
                      >
                        {result.categorie}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {analysisResults.length > 20 && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Affichage des 20 meilleurs résultats sur {analysisResults.length} entreprises
            analysées
          </p>
        )}
      </div>
    </div>
  );
}
