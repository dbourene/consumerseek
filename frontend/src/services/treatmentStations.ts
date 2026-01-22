import { supabase } from '../supabaseClient';

export interface TreatmentStation {
  id: string;
  code_station: string | null;
  nom: string;
  nom_normalise: string;
  commune: string;
  code_commune: string;
  type_station: string;
  capacite_eh: number | null;
  latitude: number;
  longitude: number;
  adresse: string | null;
  source: string;
  date_import: string;
  metadata: Record<string, any>;
  created_at: string;
}

const STATION_KEYWORDS = [
  'station',
  'step',
  'steu',
  'epuration',
  'épuration',
  'assainissement',
  'pompage',
  'traitement',
  'eaux usees',
  'eaux usées',
  'relevage',
  'lagunage',
  'assainisseur',
];

export function detectTreatmentStation(address: string): boolean {
  const normalizedAddress = address.toLowerCase();

  return STATION_KEYWORDS.some(keyword =>
    normalizedAddress.includes(keyword)
  );
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchTreatmentStation(
  name: string,
  codeCommune: string
): Promise<TreatmentStation | null> {
  const normalizedName = normalizeName(name);

  const { data, error } = await supabase
    .from('stations_traitement')
    .select('*')
    .eq('code_commune', codeCommune)
    .ilike('nom_normalise', `%${normalizedName}%`)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error searching treatment station:', error);
    return null;
  }

  return data;
}

export async function searchTreatmentStationByName(
  name: string
): Promise<TreatmentStation[]> {
  const normalizedName = normalizeName(name);

  const keywords = normalizedName.split(' ').filter(k => k.length > 3);

  if (keywords.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('stations_traitement')
    .select('*')
    .textSearch('nom', keywords.join(' & '), {
      type: 'websearch',
      config: 'french'
    })
    .limit(10);

  if (error) {
    console.error('Error searching treatment stations:', error);
    return [];
  }

  return data || [];
}

export async function importStationsFromCSV(
  csvData: Array<{
    code_station?: string;
    nom: string;
    commune: string;
    code_commune: string;
    type_station?: string;
    capacite_eh?: number;
    latitude: number;
    longitude: number;
    adresse?: string;
  }>
): Promise<{ success: number; errors: number }> {
  let success = 0;
  let errors = 0;

  for (const station of csvData) {
    try {
      const { error } = await supabase
        .from('stations_traitement')
        .upsert({
          code_station: station.code_station || null,
          nom: station.nom,
          nom_normalise: normalizeName(station.nom),
          commune: station.commune,
          code_commune: station.code_commune,
          type_station: station.type_station || 'STEP',
          capacite_eh: station.capacite_eh || null,
          latitude: station.latitude,
          longitude: station.longitude,
          adresse: station.adresse || null,
          source: 'SANDRE',
          date_import: new Date().toISOString(),
        }, {
          onConflict: 'code_station',
        });

      if (error) throw error;
      success++;
    } catch (err) {
      console.error('Error importing station:', err);
      errors++;
    }
  }

  return { success, errors };
}

export async function getTreatmentStationStats(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const { count } = await supabase
    .from('stations_traitement')
    .select('*', { count: 'exact', head: true });

  const { data: typeData } = await supabase
    .from('stations_traitement')
    .select('type_station');

  const byType: Record<string, number> = {};
  if (typeData) {
    typeData.forEach(row => {
      const type = row.type_station || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    });
  }

  return {
    total: count || 0,
    byType,
  };
}
