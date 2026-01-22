import { supabase } from '../supabaseClient';
import { calculateTrancheConso } from '../utils/trancheConso';

export interface ExternalConsumer {
  adresse: string;
  code_commune: string;
  nom_commune: string;
  nombre_sites: number;
  consommation_annuelle_mwh: number;
  tranche_conso: string;
  categorie_activite: string;
  annee: number;
  [key: string]: any;
}

export interface APIConfig {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export interface LoadResult {
  communes: string[];
  totalConsumers: number;
  loadedFromAPI: number;
  loadedFromCache: number;
  duration: number;
  errors: string[];
}

const DEFAULT_CONFIG: APIConfig = {
  baseUrl: 'https://opendata.enedis.fr/data-fair/api/v1/datasets/consommation-annuelle-entreprise-par-adresse',
  headers: {
    'Content-Type': 'application/json',
  }
};

let apiConfig: APIConfig = DEFAULT_CONFIG;

export function configureAPI(config: Partial<APIConfig>) {
  apiConfig = { ...apiConfig, ...config };
  if (config.apiKey) {
    apiConfig.headers = {
      ...apiConfig.headers,
      'Authorization': `Bearer ${config.apiKey}`
    };
  }
}

export async function fetchConsumersFromAPI(
  communeCodes: string[],
  annee: number
): Promise<ExternalConsumer[]> {
  if (!apiConfig.baseUrl) {
    throw new Error('API non configurée. Utilisez configureAPI() d\'abord.');
  }

  const allConsumers: ExternalConsumer[] = [];

  for (const codeCommune of communeCodes) {
    let page = 1;
    let hasMorePages = true;
    const pageSize = 10000;

    try {
      while (hasMorePages) {
        const url = `${apiConfig.baseUrl}/lines?code_commune_eq=${codeCommune}&annee_eq=${annee}&size=${pageSize}&page=${page}`;

        console.log(`📡 Appel API: ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: apiConfig.headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        const results = data.results || [];

        if (results.length === 0) {
          hasMorePages = false;
        } else {
          const consumers = results.map((item: any) => {
            const consoMWh = item.consommation_annuelle_totale_de_ladresse_mwh || 0;
            const codeGrandSecteur = item.code_grand_secteur || '';
            const codeSecteurNaf2 = item.code_secteur_naf2 || '';

            // Déterminer categorie_activite
            // Priorité 1: Identifier les établissements publics par code NAF2
            let categorieActivite = '';
            if (['84', '85', '86', '87', '88'].includes(codeSecteurNaf2)) {
              categorieActivite = 'Etablissement public';
            }
            // Priorité 2: Mapper depuis code_grand_secteur
            // Pour l'API entreprise, Autres/NULL → Tertiaire
            else if (codeGrandSecteur === 'AGRICULTURE') categorieActivite = 'Agriculture';
            else if (codeGrandSecteur === 'INDUSTRIE') categorieActivite = 'Industrie';
            else if (codeGrandSecteur === 'TERTIAIRE') categorieActivite = 'Tertiaire';
            else if (codeGrandSecteur === 'RESIDENTIEL') categorieActivite = 'Residentiel';
            else categorieActivite = 'Tertiaire'; // API entreprise: Autres/NULL = Tertiaire

            return {
              adresse: item.adresse || '',
              code_commune: item.code_commune || codeCommune,
              nom_commune: item.nom_commune || '',
              nombre_sites: item.nombre_de_sites || 0,
              consommation_annuelle_mwh: consoMWh,
              tranche_conso: calculateTrancheConso(consoMWh),
              categorie_activite: categorieActivite,
              annee: annee,
              code_grand_secteur: codeGrandSecteur || null,
              code_secteur_naf2: item.code_secteur_naf2 || null,
              code_categorie_consommation: item.code_categorie_consommation || null,
              code_departement: item.code_departement || null,
              code_region: item.code_region || null,
              code_epci: item.code_epci || null,
              code_iris: item.code_iris || null,
              nom_iris: item.nom_iris || null,
              numero_voie: item.numero_de_voie || null,
              indice_repetition: item.indice_de_repetition || null,
              type_voie: item.type_de_voie || null,
              libelle_voie: item.libelle_de_voie || null,
              tri_adresses: item.tri_des_adresses || null
            };
          });

          allConsumers.push(...consumers);

          console.log(`   ✅ Page ${page}: ${results.length} consommateurs récupérés`);

          if (results.length < pageSize) {
            hasMorePages = false;
          } else {
            page++;
          }
        }
      }

      console.log(`✅ Commune ${codeCommune}: ${allConsumers.filter(c => c.code_commune === codeCommune).length} consommateurs au total`);
    } catch (error) {
      console.error(`❌ Erreur pour la commune ${codeCommune}:`, error);
      throw error;
    }
  }

  return allConsumers;
}

export async function checkCachedConsumers(
  communeCodes: string[],
  annee: number
): Promise<{ commune: string; count: number; cached: boolean }[]> {
  const results = await Promise.all(
    communeCodes.map(async (commune) => {
      const { count, error } = await supabase
        .from('consommateurs')
        .select('*', { count: 'exact', head: true })
        .eq('code_commune', commune)
        .eq('annee', annee);

      return {
        commune,
        count: count || 0,
        cached: !error && (count || 0) > 0
      };
    })
  );

  return results;
}

export async function loadConsumersOnDemand(
  communeCodes: string[],
  annee: number,
  forceReload: boolean = false
): Promise<LoadResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let loadedFromAPI = 0;
  let loadedFromCache = 0;

  const cacheStatus = await checkCachedConsumers(communeCodes, annee);

  const communesToLoad = forceReload
    ? communeCodes
    : cacheStatus.filter(c => !c.cached).map(c => c.commune);

  const communesCached = cacheStatus.filter(c => c.cached).map(c => c.commune);
  loadedFromCache = communesCached.length;

  console.log(`📊 Analyse du cache:`);
  console.log(`   → ${communesCached.length} communes déjà en cache`);
  console.log(`   → ${communesToLoad.length} communes à charger depuis l'API`);

  if (communesToLoad.length > 0) {
    try {
      console.log(`🌐 Chargement depuis l'API pour ${communesToLoad.length} communes...`);
      const apiConsumers = await fetchConsumersFromAPI(communesToLoad, annee);

      console.log(`✅ ${apiConsumers.length} consommateurs récupérés depuis l'API`);

      if (apiConsumers.length > 0) {
        // Add source field to all API consumers
        const apiConsumersWithSource = apiConsumers.map(consumer => ({
          ...consumer,
          source: 'api' as const
        }));

        // Get existing consumers to avoid overwriting manual corrections and creating duplicates
        const { data: existingConsumers } = await supabase
          .from('consommateurs')
          .select('code_commune, annee, nombre_sites, consommation_annuelle_mwh, tranche_conso, categorie_activite, adresse, source')
          .in('code_commune', communesToLoad)
          .eq('annee', annee);

        // Create deduplication keys based on technical data only
        // We DON'T use address for deduplication because:
        // - Geocoding auto may have changed the address (empty → commune name)
        // - This would cause duplicates on reload from API
        const existingKeys = new Set<string>();
        const manualAddressKeys = new Set<string>();

        (existingConsumers || []).forEach(c => {
          // Key 1: Primary technical key (used for all consumers)
          const technicalKey = `${c.code_commune}|${c.annee}|${c.nombre_sites}|${c.consommation_annuelle_mwh}|${c.tranche_conso}|${c.categorie_activite}`;
          existingKeys.add(technicalKey);

          // Key 2: Simplified technical key (in case tranche_conso or categorie_activite varies slightly)
          const simplifiedKey = `${c.code_commune}|${c.annee}|${c.nombre_sites}|${c.consommation_annuelle_mwh}`;
          existingKeys.add(simplifiedKey);

          // Key 3: Address-based key ONLY for manual corrections
          // This protects manually corrected addresses from being overwritten
          if (c.source === 'manual' && c.adresse) {
            const addressKey = `${c.code_commune}|${c.annee}|${c.adresse.toLowerCase().trim()}`;
            manualAddressKeys.add(addressKey);
          }
        });

        // Filter out existing consumers
        const newConsumers = apiConsumersWithSource.filter(consumer => {
          const technicalKey = `${consumer.code_commune}|${consumer.annee}|${consumer.nombre_sites}|${consumer.consommation_annuelle_mwh}|${consumer.tranche_conso}|${consumer.categorie_activite}`;
          const simplifiedKey = `${consumer.code_commune}|${consumer.annee}|${consumer.nombre_sites}|${consumer.consommation_annuelle_mwh}`;
          const addressKey = `${consumer.code_commune}|${consumer.annee}|${consumer.adresse.toLowerCase().trim()}`;

          // Exclude if technical key matches OR if it's a manually corrected address
          return !existingKeys.has(technicalKey) &&
                 !existingKeys.has(simplifiedKey) &&
                 !manualAddressKeys.has(addressKey);
        });

        console.log(`📊 ${existingKeys.size} consommateurs existants préservés`);
        console.log(`📥 ${newConsumers.length} nouveaux consommateurs à insérer`);

        if (newConsumers.length > 0) {
          const batchSize = 1000;
          for (let i = 0; i < newConsumers.length; i += batchSize) {
            const batch = newConsumers.slice(i, i + batchSize);

            const { error } = await supabase
              .from('consommateurs')
              .insert(batch);

            if (error) {
              errors.push(`Erreur insertion batch ${i}: ${error.message}`);
              console.error(`❌ Erreur insertion:`, error);
            } else {
              console.log(`✅ Batch ${i}-${i + batch.length} inséré`);
            }
          }
        }
      }

      loadedFromAPI = communesToLoad.length;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
      errors.push(errorMsg);
      console.error(`❌ Erreur chargement API:`, error);
    }
  }

  const { count } = await supabase
    .from('consommateurs')
    .select('*', { count: 'exact', head: true })
    .in('code_commune', communeCodes)
    .eq('annee', annee);

  const duration = Date.now() - startTime;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ CHARGEMENT TERMINÉ`);
  console.log(`   ⏱️  Durée: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
  console.log(`   📊 Total consommateurs: ${count || 0}`);
  console.log(`   🌐 Communes chargées depuis API: ${loadedFromAPI}`);
  console.log(`   💾 Communes depuis cache: ${loadedFromCache}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return {
    communes: communeCodes,
    totalConsumers: count || 0,
    loadedFromAPI,
    loadedFromCache,
    duration,
    errors
  };
}

export async function cleanupUnusedConsumers(): Promise<{
  deleted: number;
  kept: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const { data: installations, error: installError } = await supabase
      .from('installations')
      .select('id, latitude, longitude');

    if (installError) throw installError;

    if (!installations || installations.length === 0) {
      console.log('⚠️ Aucune installation enregistrée, nettoyage annulé');
      return { deleted: 0, kept: 0, errors: ['Aucune installation trouvée'] };
    }

    const allCommuneCodes = new Set<string>();

    for (const installation of installations) {
      const { data: rpcData } = await supabase.rpc(
        'rpc_communes_autour_installation',
        {
          p_lat: installation.latitude,
          p_lon: installation.longitude,
        }
      );

      if (rpcData) {
        if (rpcData.commune_installation) {
          allCommuneCodes.add(rpcData.commune_installation.codgeo);
        }
        if (rpcData.communes_dans_rayon) {
          rpcData.communes_dans_rayon.forEach((c: any) => {
            allCommuneCodes.add(c.codgeo);
          });
        }
      }
    }

    console.log(`📊 Communes à conserver: ${allCommuneCodes.size}`);

    const { count: beforeCount } = await supabase
      .from('consommateurs')
      .select('*', { count: 'exact', head: true });

    const { error: deleteError } = await supabase
      .from('consommateurs')
      .delete()
      .not('code_commune', 'in', `(${Array.from(allCommuneCodes).join(',')})`);

    if (deleteError) throw deleteError;

    const { count: afterCount } = await supabase
      .from('consommateurs')
      .select('*', { count: 'exact', head: true });

    const deleted = (beforeCount || 0) - (afterCount || 0);

    console.log(`✅ Nettoyage terminé: ${deleted} consommateurs supprimés, ${afterCount} conservés`);

    return {
      deleted,
      kept: afterCount || 0,
      errors: []
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
    errors.push(errorMsg);
    console.error('❌ Erreur nettoyage:', error);
    return { deleted: 0, kept: 0, errors };
  }
}

