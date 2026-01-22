import { useState } from 'react';
import { Upload, AlertCircle, CheckCircle, Loader2, Database } from 'lucide-react';
import { importStationsFromCSV, getTreatmentStationStats } from '../services/treatmentStations';

export default function TreatmentStationsImport() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await getTreatmentStationStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error('Le fichier CSV doit contenir au moins une ligne de données');
      }

      const headers = lines[0].split(';').map(h => h.trim());

      const requiredHeaders = ['nom', 'commune', 'code_commune', 'latitude', 'longitude'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

      if (missingHeaders.length > 0) {
        throw new Error(`Colonnes manquantes: ${missingHeaders.join(', ')}`);
      }

      const data = lines.slice(1).map(line => {
        const values = line.split(';').map(v => v.trim());
        const row: any = {};

        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        return {
          code_station: row.code_station || undefined,
          nom: row.nom,
          commune: row.commune,
          code_commune: row.code_commune,
          type_station: row.type_station || row.type || 'STEP',
          capacite_eh: row.capacite_eh ? parseInt(row.capacite_eh, 10) : undefined,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          adresse: row.adresse || undefined,
        };
      });

      const importResult = await importStationsFromCSV(data);
      setResult(importResult);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Database className="w-6 h-6 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">
          Import des stations de traitement
        </h3>
      </div>

      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            Importez les données des stations de traitement des eaux usées (STEP/STEU) depuis un fichier CSV.
            Les stations seront utilisées pour géocoder automatiquement les adresses contenant des mots-clés
            comme "station", "épuration", "pompage", etc.
          </p>
          <div className="mt-3">
            <p className="text-xs text-blue-800 font-medium mb-1">Format CSV attendu :</p>
            <code className="text-xs bg-white px-2 py-1 rounded border border-blue-200 block">
              nom;commune;code_commune;latitude;longitude;code_station;type_station;capacite_eh;adresse
            </code>
          </div>
        </div>

        {stats && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 mb-2">
              Statistiques actuelles :
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded p-3 border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-xs text-gray-600">Stations totales</div>
              </div>
              <div className="bg-white rounded p-3 border border-gray-200">
                <div className="text-sm text-gray-700">
                  {Object.entries(stats.byType).map(([type, count]) => (
                    <div key={type} className="flex justify-between">
                      <span>{type}:</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="flex-1">
            <div className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer">
              <Upload className="w-5 h-5" />
              <span className="font-medium">
                {importing ? 'Import en cours...' : 'Importer un fichier CSV'}
              </span>
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={importing}
              className="hidden"
            />
          </label>

          <button
            onClick={loadStats}
            disabled={loadingStats}
            className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
          >
            {loadingStats ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Actualiser'
            )}
          </button>
        </div>

        {importing && (
          <div className="flex items-center justify-center gap-2 text-blue-600 py-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Import en cours...</span>
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
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-900">Import terminé</p>
              <p className="text-sm text-green-700 mt-1">
                {result.success} station(s) importée(s) avec succès
                {result.errors > 0 && `, ${result.errors} erreur(s)`}
              </p>
            </div>
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-700 font-medium mb-2">
            Sources de données recommandées :
          </p>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>
              • <a
                href="https://assainissement.developpement-durable.gouv.fr/pages/data/basededonneesteu.php"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Portail national de l'assainissement (SANDRE)
              </a>
            </li>
            <li>
              • <a
                href="https://www.data.gouv.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Base de données BDERU sur data.gouv.fr
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
