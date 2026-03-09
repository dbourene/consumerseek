import { supabase } from '../supabaseClient';
import { Consommateur, TrancheConso, CategorieActivite } from '../types/consommateur';
import { ActiveInstallation } from '../types/installation';
import { calculateDistance } from '../utils/distance';
import { getRayonReglementaire, getCategorieReglementaire, estCategorieRestrictive } from '../utils/densityCategory';

interface LoadConsumersParams {
  selectedCommuneCodes: string[];
  selectedTranches: Set<TrancheConso>;
  selectedCategories: Set<CategorieActivite>;
  activeInstallations?: ActiveInstallation[];
  circleFilterActive?: boolean;
  circleFilterPosition?: [number, number] | null;
}

/**
 * Charge les consommateurs individuels selon les critères de filtrage
 * (même logique que ConsumersLayer mais retourne des consommateurs individuels)
 */
export async function loadFilteredConsumers(params: LoadConsumersParams): Promise<Consommateur[]> {
  const {
    selectedCommuneCodes,
    selectedTranches,
    selectedCategories,
    activeInstallations = [],
    circleFilterActive = false,
    circleFilterPosition = null,
  } = params;

  console.log('🔍 PV Analysis - Chargement des consommateurs individuels');

  // Si aucun filtre n'est sélectionné, retourner un tableau vide
  if (selectedTranches.size === 0 || selectedCategories.size === 0) {
    console.log('⚠️ Aucun filtre sélectionné');
    return [];
  }

  let allConsommateurs: Consommateur[] = [];

  // Cas 1 : Affichage global (pas d'installation, pas de communes sélectionnées)
  if (activeInstallations.length === 0 && selectedCommuneCodes.length === 0) {
    console.log('🌍 Mode global : chargement de tous les consommateurs géocodés');
    allConsommateurs = await fetchAllGeocodedConsumersGlobal();
  }
  // Cas 2 : Installations actives ou communes sélectionnées
  else {
    const installations = activeInstallations.length > 0
      ? activeInstallations
      : [];

    if (installations.length > 0) {
      console.log(`📍 Chargement pour ${installations.length} installation(s)`);

      for (const installation of installations) {
        const instLat = installation.latitude;
        const instLon = installation.longitude;
        const instMarge = installation.marge || 200;

        const { data: rpcData } = await supabase.rpc(
          'rpc_communes_autour_installation',
          { p_lat: instLat, p_lon: instLon }
        );

        if (!rpcData) continue;

        const communeCodes = [
          ...(rpcData.commune_installation ? [rpcData.commune_installation.codgeo] : []),
          ...rpcData.communes_dans_rayon.map((c: any) => c.codgeo)
        ];

        const densiteInstallation = rpcData.commune_installation?.dens7 || 5;
        const categorieInstallation = getCategorieReglementaire(densiteInstallation);
        const rayonInstallation = getRayonReglementaire(densiteInstallation);

        // Récupération des densités des communes
        const { data: communesData } = await supabase
          .from('communes')
          .select('codgeo, dens7')
          .in('codgeo', communeCodes);

        const densiteMap = new Map<string, number>();
        communesData?.forEach(c => {
          densiteMap.set(c.codgeo, c.dens7);
        });

        const consommateurs = await fetchConsumersForCommunes(communeCodes);

        // Filtrage par rayon avec prise en compte des catégories de densité
        const consumersInRadius = consommateurs.filter(consumer => {
          if (!consumer.latitude || !consumer.longitude || !consumer.code_commune) return false;

          const distance = calculateDistance(instLat, instLon, consumer.latitude, consumer.longitude);

          const densiteConsommateur = densiteMap.get(consumer.code_commune) || 5;
          const categorieConsommateur = getCategorieReglementaire(densiteConsommateur);
          const rayonConsommateur = getRayonReglementaire(densiteConsommateur);

          if (estCategorieRestrictive(categorieConsommateur, categorieInstallation)) {
            const rayonMax = rayonConsommateur + instMarge;
            return distance <= rayonMax;
          } else {
            const rayonMax = rayonInstallation + instMarge;
            return distance <= rayonMax;
          }
        });

        allConsommateurs = allConsommateurs.concat(consumersInRadius);
      }
    } else if (selectedCommuneCodes.length > 0) {
      console.log(`📍 Chargement pour ${selectedCommuneCodes.length} commune(s)`);
      allConsommateurs = await fetchConsumersForCommunes(selectedCommuneCodes);
    }
  }

  console.log(`  → ${allConsommateurs.length} consommateurs chargés`);

  // Filtrage par tranches et catégories
  let filteredConsommateurs = allConsommateurs.filter(c =>
    selectedTranches.has(c.tranche_conso as TrancheConso) &&
    selectedCategories.has(c.categorie_activite as CategorieActivite)
  );

  console.log(`  → ${filteredConsommateurs.length} après filtres de tranches/catégories`);

  // Filtrage par cercle draggable si actif
  if (circleFilterActive && circleFilterPosition && activeInstallations.length === 1) {
    const circleFilterRadius = (activeInstallations[0].rayon || 20000) / 2 + 100;
    filteredConsommateurs = filteredConsommateurs.filter(c => {
      if (!c.latitude || !c.longitude) return false;
      const distanceToCircle = calculateDistance(
        circleFilterPosition[0],
        circleFilterPosition[1],
        c.latitude,
        c.longitude
      );
      return distanceToCircle <= circleFilterRadius;
    });
    console.log(`  → ${filteredConsommateurs.length} après filtre circulaire`);
  }

  console.log(`✅ PV Analysis - ${filteredConsommateurs.length} consommateurs filtrés`);
  return filteredConsommateurs;
}

/**
 * Récupère tous les consommateurs géocodés (mode global)
 */
async function fetchAllGeocodedConsumersGlobal(): Promise<Consommateur[]> {
  try {
    const { count } = await supabase
      .from('consommateurs')
      .select('*', { count: 'exact', head: true })
      .eq('annee', 2024)
      .eq('geocode_status', 'success')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    const totalCount = count || 0;
    const pageSize = 1000;
    const allData: Consommateur[] = [];

    for (let i = 0; i < totalCount; i += pageSize) {
      const { data, error } = await supabase
        .from('consommateurs')
        .select('*')
        .eq('annee', 2024)
        .eq('geocode_status', 'success')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(i, i + pageSize - 1);

      if (error) {
        console.error('Error fetching consumers:', error);
        break;
      }

      if (data) {
        allData.push(...(data as Consommateur[]));
      }
    }

    return allData;
  } catch (error) {
    console.error('Error fetching global consumers:', error);
    return [];
  }
}

/**
 * Récupère les consommateurs pour des communes spécifiques
 */
async function fetchConsumersForCommunes(communeCodes: string[]): Promise<Consommateur[]> {
  try {
    const { count } = await supabase
      .from('consommateurs')
      .select('*', { count: 'exact', head: true })
      .eq('annee', 2024)
      .in('code_commune', communeCodes)
      .eq('geocode_status', 'success')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    const totalCount = count || 0;
    const pageSize = 1000;
    const allData: Consommateur[] = [];

    for (let i = 0; i < totalCount; i += pageSize) {
      const { data, error } = await supabase
        .from('consommateurs')
        .select('*')
        .eq('annee', 2024)
        .in('code_commune', communeCodes)
        .eq('geocode_status', 'success')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(i, i + pageSize - 1);

      if (error) {
        console.error('Error fetching consumers:', error);
        break;
      }

      if (data) {
        allData.push(...(data as Consommateur[]));
      }
    }

    return allData;
  } catch (error) {
    console.error('Error fetching consumers for communes:', error);
    return [];
  }
}
