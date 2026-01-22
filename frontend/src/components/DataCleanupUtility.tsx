import { useState } from 'react';
import { Trash2, AlertCircle, CheckCircle, Loader2, Info } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function DataCleanupUtility() {
  const [cleaning, setCleaning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<{ deleted: number; kept: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanupDuplicates = async () => {
    if (!confirm(
      '⚠️ ATTENTION ⚠️\n\n' +
      'Cette opération va supprimer les consommateurs en double dans la base de données.\n' +
      'Cette opération peut prendre plusieurs minutes pour 2 millions d\'entrées.\n\n' +
      'Continuer ?'
    )) {
      return;
    }

    setCleaning(true);
    setError(null);
    setResult(null);
    setProgress('Analyse des doublons...');

    try {
      const { count: beforeCount } = await supabase
        .from('consommateurs')
        .select('*', { count: 'exact', head: true });

      setProgress(`Total actuel: ${beforeCount?.toLocaleString()} consommateurs. Suppression des doublons par lots...`);

      const batchSize = 10000;
      let totalDeleted = 0;

      const { data: communes } = await supabase
        .from('consommateurs')
        .select('code_commune')
        .limit(1000);

      const uniqueCommunes = [...new Set(communes?.map(c => c.code_commune) || [])];

      for (let i = 0; i < uniqueCommunes.length; i += 10) {
        const batchCommunes = uniqueCommunes.slice(i, i + 10);
        setProgress(`Traitement des communes ${i + 1}-${Math.min(i + 10, uniqueCommunes.length)}/${uniqueCommunes.length}...`);

        for (const commune of batchCommunes) {
          const { data: duplicates } = await supabase.rpc('find_duplicate_consumers', {
            p_code_commune: commune
          });

          if (duplicates && duplicates.length > 0) {
            const idsToDelete = duplicates.map((d: any) => d.id);
            const { error: deleteError } = await supabase
              .from('consommateurs')
              .delete()
              .in('id', idsToDelete);

            if (!deleteError) {
              totalDeleted += idsToDelete.length;
            }
          }
        }

        setProgress(`${totalDeleted} doublons supprimés jusqu'à présent...`);
      }

      const { count: afterCount } = await supabase
        .from('consommateurs')
        .select('*', { count: 'exact', head: true });

      setResult({
        deleted: totalDeleted,
        kept: afterCount || 0
      });

      setProgress('Nettoyage terminé !');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du nettoyage');
    } finally {
      setCleaning(false);
    }
  };

  const addUniqueConstraint = async () => {
    if (!confirm(
      'Ajouter une contrainte unique ?\n\n' +
      'Cette opération va ajouter une contrainte pour empêcher les doublons futurs.\n' +
      'Assurez-vous d\'avoir d\'abord nettoyé les doublons existants.\n\n' +
      'Continuer ?'
    )) {
      return;
    }

    setCleaning(true);
    setError(null);

    try {
      const { error } = await supabase.rpc('add_unique_constraint_safe');

      if (error) throw error;

      setProgress('Contrainte unique ajoutée avec succès !');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout de la contrainte');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Trash2 className="w-6 h-6 text-red-600" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Utilitaire de nettoyage
          </h3>
          <p className="text-sm text-gray-600">
            Supprimez les doublons pour optimiser votre base de données
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-900 mb-1">
                Information importante
              </p>
              <p className="text-sm text-yellow-800">
                Avec 2 millions de consommateurs, le nettoyage des doublons peut prendre du temps.
                L'opération se fait par lots pour éviter les timeouts.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-blue-900 mb-2">
            📋 Procédure recommandée :
          </p>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Testez d'abord l'API externe avec le composant de test</li>
            <li>Si les performances sont bonnes, nettoyez la base complète avec le bouton "Nettoyer la BDD" dans le test API</li>
            <li>Les données seront rechargées automatiquement à la demande</li>
          </ol>
        </div>

        {progress && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              {cleaning ? (
                <Loader2 className="w-5 h-5 text-gray-600 animate-spin flex-shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              )}
              <p className="text-sm text-gray-700">{progress}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Erreur</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-3">
                  Nettoyage terminé
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-red-600">
                      {result.deleted.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-600">Supprimés</div>
                  </div>
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-2xl font-bold text-green-600">
                      {result.kept.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-600">Conservés</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-700 font-medium mb-2">
            💡 Alternative recommandée :
          </p>
          <p className="text-sm text-gray-600">
            Au lieu de nettoyer les doublons, utilisez la stratégie de "chargement à la demande" :
          </p>
          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside mt-2">
            <li>Supprimez toutes les données sauf celles liées aux installations (bouton dans le test API)</li>
            <li>Les données seront rechargées automatiquement depuis l'API lors des recherches</li>
            <li>Votre base Supabase servira de cache intelligent</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
