import { loadFilteredConsumers } from './pvConsumersLoader';
import { TrancheConso, CategorieActivite, Consommateur } from '../types/consommateur';
import { ActiveInstallation } from '../types/installation';

interface ExportConsumersParams {
  selectedCommuneCodes: string[];
  selectedTranches: Set<TrancheConso>;
  selectedCategories: Set<CategorieActivite>;
  activeInstallations: ActiveInstallation[];
  circleFilterActive: boolean;
  circleFilterPosition: [number, number] | null;
}

export async function exportConsumersToCSV(params: ExportConsumersParams): Promise<void> {
  try {
    console.log('🔍 Export CSV - Chargement des consommateurs...');

    const consumers = await loadFilteredConsumers(params);

    if (consumers.length === 0) {
      console.warn('Aucun consommateur à exporter');
      alert('Aucun consommateur ne correspond aux filtres sélectionnés.');
      return;
    }

    console.log(`📊 Export CSV - ${consumers.length} consommateurs à exporter`);

    const csvContent = generateCSVContent(consumers);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `consommateurs_export_${timestamp}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Export CSV réussi : ${filename}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'export CSV:', error);
    alert('Une erreur est survenue lors de l\'export CSV.');
  }
}

function generateCSVContent(consumers: Consommateur[]): string {
  const headers = [
    'categorie_activite',
    'adresse_standardisee',
    'code_commune',
    'nom_commune',
    'consommation_annuelle_mwh',
    'latitude',
    'longitude',
    'nombre_sites'
  ];

  const rows = consumers.map(consumer => {
    const consommationArrondie = consumer.consommation_annuelle_mwh
      ? Math.round(consumer.consommation_annuelle_mwh).toString()
      : '';

    return [
      escapeCSVField(consumer.categorie_activite || ''),
      escapeCSVField(consumer.adresse_standardisee || ''),
      escapeCSVField(consumer.code_commune || ''),
      escapeCSVField(consumer.nom_commune || ''),
      consommationArrondie,
      consumer.latitude?.toString() || '',
      consumer.longitude?.toString() || '',
      consumer.nombre_sites?.toString() || ''
    ];
  });

  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ];

  return csvLines.join('\n');
}

function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
