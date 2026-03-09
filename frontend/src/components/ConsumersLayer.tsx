import { useEffect, useState, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../supabaseClient';
import {
  ConsoAggregate,
  TrancheConso,
  CategorieActivite
} from '../types/consommateur';
import { ActiveInstallation } from '../types/installation';
import { calculateDistance } from '../utils/distance';
import {
  getRayonReglementaire,
  getCategorieReglementaire,
  estCategorieRestrictive
} from '../utils/densityCategory';

interface ConsumersLayerProps {
  selectedCommuneCodes: string[];
  selectedTranches: Set<TrancheConso>;
  selectedCategories: Set<CategorieActivite>;
  installationLat?: number;
  installationLon?: number;
  rayon: number;
  marge: number;
  onStatsUpdate: (nbSites: number, consoTotal: number) => void;
  activeInstallations?: ActiveInstallation[];
  geocodingRefreshKey?: number;
  circleFilterActive?: boolean;
  circleFilterPosition?: [number, number] | null;
}

export default function ConsumersLayer({
  selectedCommuneCodes,
  selectedTranches,
  selectedCategories,
  installationLat,
  installationLon,
  rayon,
  marge,
  onStatsUpdate,
  activeInstallations = [],
  geocodingRefreshKey = 0,
  circleFilterActive = false,
  circleFilterPosition = null
}: ConsumersLayerProps) {
  const map = useMap();
  const [layerGroup] = useState(() => {
    const group = L.layerGroup();
    return group;
  });
  const [currentZoom, setCurrentZoom] = useState(map.getZoom());
  const onStatsUpdateRef = useRef(onStatsUpdate);

  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
  }, [onStatsUpdate]);

  useEffect(() => {
    if (!map.getPane('consumersPane')) {
      map.createPane('consumersPane');
      const pane = map.getPane('consumersPane');
      if (pane) {
        pane.style.zIndex = '700';
      }
    }

    layerGroup.addTo(map);

    const onZoom = () => {
      setCurrentZoom(map.getZoom());
    };

    map.on('zoomend', onZoom);

    return () => {
      map.off('zoomend', onZoom);
      layerGroup.remove();
    };
  }, [map, layerGroup]);

  useEffect(() => {
    console.log('🔄 NOUVELLE RECHERCHE - Nettoyage des cercles existants');
    layerGroup.clearLayers();
    onStatsUpdateRef.current(0, 0);

    const fetchAndDisplayData = async () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 DÉBUT fetchAndDisplayData');

      const installations = activeInstallations.length > 0
        ? activeInstallations
        : (installationLat && installationLon
          ? [{ latitude: installationLat, longitude: installationLon, rayon, marge }]
          : []);

      const hasInstallations = installations.length > 0;
      console.log(`  ${installations.length} installation(s) à traiter`);

      if (selectedTranches.size === 0 || selectedCategories.size === 0) {
        console.log(`⚠️ Filtres vides (Tranches: ${selectedTranches.size}, Catégories: ${selectedCategories.size}) - ARRÊT`);
        return;
      }

      const aggregationLevel = getAggregationLevel(currentZoom);
      console.log(`📐 Zoom: ${currentZoom}, Agrégation: ${aggregationLevel}`);

      let allFilteredData: ConsoAggregate[] = [];

      if (!hasInstallations && selectedCommuneCodes.length === 0) {
        console.log('🌍 Mode affichage global: chargement de TOUS les consommateurs géocodés');
        const allData = await fetchAllGeocodedConsumersGlobal();
        console.log(`  → ${allData.length} consommateurs récupérés au total`);

        console.log('📊 Exemples de données reçues (premiers 3):');
        allData.slice(0, 3).forEach((d, i) => {
          console.log(`    [${i}] tranche="${d.tranche_conso}", categorie="${d.categorie_activite}", nb_sites=${d.nb_sites}, conso=${d.conso_totale_mwh}`);
        });

        let tempFilteredData = allData.filter(d =>
          selectedTranches.has(d.tranche_conso as TrancheConso) &&
          selectedCategories.has(d.categorie_activite as CategorieActivite)
        );
        console.log(`  → ${tempFilteredData.length} après filtres`);

        if (circleFilterActive && circleFilterPosition && activeInstallations.length === 1) {
          const circleFilterRadius = (activeInstallations[0].rayon || 20000) / 2 + 100;
          tempFilteredData = tempFilteredData.filter(d => {
            if (!d.latitude || !d.longitude) return false;
            const distanceToCircle = calculateDistance(
              circleFilterPosition[0],
              circleFilterPosition[1],
              d.latitude,
              d.longitude
            );
            return distanceToCircle <= circleFilterRadius;
          });
          console.log(`  → ${tempFilteredData.length} après filtre circulaire (rayon: ${circleFilterRadius}m)`);
        }

        allFilteredData = tempFilteredData;
      } else {
        for (const installation of installations) {
        const instLat = installation.latitude;
        const instLon = installation.longitude;
        const instRayon = installation.rayon || 20000;
        const instMarge = installation.marge || 200;

        console.log(`\n📍 Installation: (${instLat}, ${instLon}), Rayon: ${instRayon}m`);

        const { data: rpcData } = await supabase.rpc(
          'rpc_communes_autour_installation',
          { p_lat: instLat, p_lon: instLon }
        );

        if (!rpcData) continue;

        const communeCodes = [
          ...(rpcData.commune_installation ? [rpcData.commune_installation.codgeo] : []),
          ...rpcData.communes_dans_rayon.map((c: any) => c.codgeo)
        ];

        console.log(`  Communes: ${communeCodes.length}`);

        // Récupération de la densité de la commune de l'installation
        const densiteInstallation = rpcData.commune_installation?.dens7 || 5;
        const categorieInstallation = getCategorieReglementaire(densiteInstallation);
        const rayonInstallation = getRayonReglementaire(densiteInstallation);
        console.log(`  Catégorie installation: ${categorieInstallation} (densité: ${densiteInstallation}, rayon: ${rayonInstallation}m)`);

        // Récupération des densités de toutes les communes
        const { data: communesData } = await supabase
          .from('communes')
          .select('codgeo, dens7')
          .in('codgeo', communeCodes);

        const densiteMap = new Map<string, number>();
        communesData?.forEach(c => {
          densiteMap.set(c.codgeo, c.dens7);
        });

        const allData = await fetchAllGeocodedConsumers(communeCodes);
        console.log(`  → ${allData.length} consommateurs récupérés`);

        // Filtrage avec prise en compte des catégories de densité
        const dataInRadius = allData.filter(item => {
          if (!item.latitude || !item.longitude || !item.code_commune) return false;

          const distance = calculateDistance(instLat, instLon, item.latitude, item.longitude);

          // Récupération de la densité de la commune du consommateur
          const densiteConsommateur = densiteMap.get(item.code_commune) || 5;
          const categorieConsommateur = getCategorieReglementaire(densiteConsommateur);
          const rayonConsommateur = getRayonReglementaire(densiteConsommateur);

          // Si la commune du consommateur est de catégorie plus restrictive
          if (estCategorieRestrictive(categorieConsommateur, categorieInstallation)) {
            // Appliquer le rayon de la commune du consommateur + marge
            const rayonMax = rayonConsommateur + instMarge;
            return distance <= rayonMax;
          } else {
            // Appliquer le rayon de l'installation + marge
            const rayonMax = rayonInstallation + instMarge;
            return distance <= rayonMax;
          }
        });

        console.log(`  → ${dataInRadius.length} dans rayon (avec filtrage par catégorie)`);

        let filteredData = dataInRadius.filter(d =>
          selectedTranches.has(d.tranche_conso as TrancheConso) &&
          selectedCategories.has(d.categorie_activite as CategorieActivite)
        );

        console.log(`  → ${filteredData.length} après filtres`);

        if (circleFilterActive && circleFilterPosition) {
          const circleFilterRadius = (installation.rayon || 20000) / 2 + 100;
          filteredData = filteredData.filter(d => {
            if (!d.latitude || !d.longitude) return false;
            const distanceToCircle = calculateDistance(
              circleFilterPosition[0],
              circleFilterPosition[1],
              d.latitude,
              d.longitude
            );
            return distanceToCircle <= circleFilterRadius;
          });
          console.log(`  → ${filteredData.length} après filtre circulaire (rayon: ${circleFilterRadius}m)`);
        }

        allFilteredData = allFilteredData.concat(filteredData);
        }
      }

      if (allFilteredData.length === 0) {
        console.log('  ❌ AUCUNE donnée après tous les filtres !');
        onStatsUpdateRef.current(0, 0);
        return;
      }

      console.log(`\n📦 Total données filtrées: ${allFilteredData.length}`);

      // Logs détaillés pour comprendre la différence nombre de consommateurs vs nombre de sites
      const sitesParConsommateur = allFilteredData.map(d => (d as any).nombre_sites || (d as any).nb_sites || 1);
      const totalSitesCalculated = sitesParConsommateur.reduce((sum, n) => sum + n, 0);
      const consommateursMultiSites = allFilteredData.filter(d => ((d as any).nombre_sites || (d as any).nb_sites || 1) > 1);
      console.log(`\n🔍 ANALYSE SITES:`);
      console.log(`  → ${allFilteredData.length} consommateurs (lignes)`);
      console.log(`  → ${totalSitesCalculated} sites au total (somme nombre_sites)`);
      console.log(`  → ${consommateursMultiSites.length} consommateurs avec plusieurs sites`);
      if (consommateursMultiSites.length > 0) {
        console.log(`  → Exemples multi-sites:`, consommateursMultiSites.slice(0, 3).map(d => ({
          adresse: (d as any).adresse,
          nombre_sites: (d as any).nombre_sites || (d as any).nb_sites
        })));
      }

      let aggregatedData = allFilteredData;
      if (aggregationLevel === 'global') {
        aggregatedData = await aggregateByInstallation(allFilteredData);
      } else if (aggregationLevel === 'commune') {
        aggregatedData = await aggregateByCommune(allFilteredData);
      }
      console.log(`  → ${aggregatedData.length} items après agrégation`);

      displayCircles(aggregatedData);

      // Calculer le nombre total de sites et la consommation totale
      const totalSites = allFilteredData.reduce((sum, d) => sum + ((d as any).nombre_sites || (d as any).nb_sites || 1), 0);
      const totalConso = allFilteredData.reduce((sum, d) => sum + ((d as any).consommation_annuelle_mwh || (d as any).conso_totale_mwh || 0), 0);
      console.log(`\n📊 STATS TOTALES: ${totalSites} sites, ${totalConso.toFixed(2)} MWh`);
      console.log('✅ FIN\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      onStatsUpdateRef.current(totalSites, totalConso);
    };

    fetchAndDisplayData();
  }, [
    selectedCommuneCodes,
    selectedTranches,
    selectedCategories,
    currentZoom,
    layerGroup,
    installationLat,
    installationLon,
    rayon,
    marge,
    activeInstallations,
    geocodingRefreshKey,
    circleFilterActive,
    circleFilterPosition
  ]);


  const getAggregationLevel = (zoom: number): string => {
    if (zoom <= 8) return 'global';
    if (zoom <= 12) return 'commune';
    return 'individual';
  };

  const fetchAllGeocodedConsumersGlobal = async (): Promise<ConsoAggregate[]> => {
    try {
      const { count } = await supabase
        .from('consommateurs')
        .select('*', { count: 'exact', head: true })
        .eq('annee', 2024)
        .eq('geocode_status', 'success')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      console.log('🔢 NOMBRE TOTAL (global):', count);

      const totalCount = count || 0;
      const pageSize = 1000;
      const allData: any[] = [];

      for (let i = 0; i < totalCount; i += pageSize) {
        const { data, error } = await supabase
          .from('consommateurs')
          .select('code_commune, nom_commune, nombre_sites, consommation_annuelle_mwh, tranche_conso, categorie_activite, annee, latitude, longitude')
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
          allData.push(...data);
        }
      }

      console.log(`✅ Récupéré ${allData.length} sur ${totalCount} consommateurs (global)`);

      return allData.map(d => ({
        code_commune: d.code_commune,
        nom_commune: d.nom_commune,
        annee: d.annee,
        tranche_conso: d.tranche_conso,
        categorie_activite: d.categorie_activite,
        nb_sites: d.nombre_sites,
        conso_totale_mwh: d.consommation_annuelle_mwh,
        latitude: parseFloat(d.latitude),
        longitude: parseFloat(d.longitude)
      }));
    } catch (error) {
      console.error('Error fetching consumers:', error);
      return [];
    }
  };

  const fetchAllGeocodedConsumers = async (
    communeCodes: string[]
  ): Promise<ConsoAggregate[]> => {
    try {
      const { count } = await supabase
        .from('consommateurs')
        .select('*', { count: 'exact', head: true })
        .eq('annee', 2024)
        .in('code_commune', communeCodes)
        .eq('geocode_status', 'success')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      console.log('🔢 NOMBRE TOTAL:', count);

      const totalCount = count || 0;
      const pageSize = 1000;
      const allData: any[] = [];

      for (let i = 0; i < totalCount; i += pageSize) {
        const { data, error } = await supabase
          .from('consommateurs')
          .select('code_commune, nom_commune, nombre_sites, consommation_annuelle_mwh, tranche_conso, categorie_activite, annee, latitude, longitude')
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
          allData.push(...data);
        }
      }

      console.log(`✅ Récupéré ${allData.length} sur ${totalCount} consommateurs`);

      return allData.map(d => ({
        code_commune: d.code_commune,
        nom_commune: d.nom_commune,
        annee: d.annee,
        tranche_conso: d.tranche_conso,
        categorie_activite: d.categorie_activite,
        nb_sites: d.nombre_sites,
        conso_totale_mwh: d.consommation_annuelle_mwh,
        latitude: parseFloat(d.latitude),
        longitude: parseFloat(d.longitude)
      }));
    } catch (error) {
      console.error('Error fetching consumers:', error);
      return [];
    }
  };

  const aggregateByInstallation = async (
    data: ConsoAggregate[]
  ): Promise<ConsoAggregate[]> => {
    if (data.length === 0 || activeInstallations.length === 0) return [];

    const aggregated: ConsoAggregate[] = [];

    activeInstallations.forEach(installation => {
      const rayonMetres = installation.rayon || 20000;

      const consumersInRadius = data.filter(consumer => {
        if (!consumer.latitude || !consumer.longitude) return false;
        const distance = calculateDistance(
          installation.latitude,
          installation.longitude,
          consumer.latitude,
          consumer.longitude
        );
        return distance <= rayonMetres;
      });

      if (consumersInRadius.length > 0) {
        const totalSites = consumersInRadius.reduce((sum, c) => sum + (c.nb_sites || 0), 0);
        const totalConso = consumersInRadius.reduce((sum, c) => sum + (c.conso_totale_mwh || 0), 0);

        aggregated.push({
          code_commune: undefined,
          nom_commune: installation.nom,
          annee: 2024,
          tranche_conso: '',
          categorie_activite: '',
          nb_sites: totalSites,
          conso_totale_mwh: totalConso,
          latitude: installation.latitude,
          longitude: installation.longitude
        });
      }
    });

    console.log(`📦 Agrégation par installation: ${aggregated.length} installations avec consommateurs`);
    return aggregated;
  };

  const aggregateByCommune = async (
    data: ConsoAggregate[]
  ): Promise<ConsoAggregate[]> => {
    const grouped = new Map<string, ConsoAggregate>();

    data.forEach(item => {
      const key = item.code_commune!;
      if (!grouped.has(key)) {
        grouped.set(key, {
          code_commune: item.code_commune,
          nom_commune: item.nom_commune,
          annee: item.annee,
          tranche_conso: '',
          categorie_activite: '',
          nb_sites: 0,
          conso_totale_mwh: 0
        });
      }

      const agg = grouped.get(key)!;
      agg.nb_sites += item.nb_sites || 0;
      agg.conso_totale_mwh += item.conso_totale_mwh || 0;
    });

    const aggregates = Array.from(grouped.values());
    console.log(`📦 Agrégé en ${aggregates.length} communes`);

    return await enrichWithCoordinates(aggregates);
  };

  const enrichWithCoordinates = async (
    aggregates: ConsoAggregate[]
  ): Promise<ConsoAggregate[]> => {
    console.log(`📍 enrichWithCoordinates: ${aggregates.length} communes à enrichir`);
    const results = await Promise.all(
      aggregates.map(async agg => {
        if (agg.code_commune) {
          const { data, error } = await supabase
            .from('communes')
            .select('latitude, longitude')
            .eq('codgeo', agg.code_commune)
            .maybeSingle();

          if (error) {
            console.error(`❌ Erreur coordonnées pour ${agg.code_commune}:`, error);
          }

          if (data?.latitude && data?.longitude) {
            const result = {
              ...agg,
              latitude: parseFloat(data.latitude),
              longitude: parseFloat(data.longitude)
            };
            console.log(`  ✅ ${agg.code_commune} (${agg.nom_commune}): lat=${result.latitude}, lon=${result.longitude}`);
            return result;
          } else {
            console.log(`  ⚠️ ${agg.code_commune} (${agg.nom_commune}): PAS de coordonnées dans communes`);
          }
        }
        return agg;
      })
    );
    const withCoords = results.filter(r => r.latitude && r.longitude);
    console.log(`📍 Résultat enrichWithCoordinates: ${withCoords.length}/${results.length} avec coordonnées`);
    return results;
  };

  const displayCircles = (data: ConsoAggregate[]) => {
    console.log(`  displayCircles: reçu ${data.length} items`);
    layerGroup.clearLayers();

    if (data.length > 0) {
      console.log(`  Premier item:`, data[0]);
    }

    let displayed = 0;
    let noCoords = 0;

    data.forEach((item, index) => {
      if (item.latitude && item.longitude) {
        displayed++;
        const radius = calculateRadius(item.conso_totale_mwh);

        const circle = L.circleMarker([item.latitude, item.longitude], {
          radius: radius,
          fillColor: '#3b82f6',
          fillOpacity: 0.4,
          color: '#1d4ed8',
          weight: 2,
          pane: 'consumersPane'
        });

        const formatNumber = (num: number) =>
          new Intl.NumberFormat('fr-FR').format(Math.round(num));

        const categoryLabel = item.categorie_activite ? getCategoryLabel(item.categorie_activite) : '';
        const isInstallationAgg = !item.code_commune && item.nom_commune;

        const popupContent = `
          <div class="text-sm">
            ${isInstallationAgg ? `<div><strong>${item.nom_commune}</strong></div>` : ''}
            <div><strong>Nb:</strong> ${formatNumber(item.nb_sites)}</div>
            <div><strong>${formatNumber(item.conso_totale_mwh)} MWh</strong></div>
            ${categoryLabel ? `<div><strong>Cat:</strong> ${categoryLabel}</div>` : ''}
          </div>
        `;

        circle.bindPopup(popupContent);
        circle.addTo(layerGroup);

        if (index < 3) {
          console.log(`  [${index}] Cercle créé: lat=${item.latitude}, lon=${item.longitude}, radius=${radius}`);
        }
      } else {
        noCoords++;
        if (noCoords <= 3) {
          console.log(`  [${index}] SANS COORDS:`, item);
        }
      }
    });

    console.log(`  → ${displayed} cercles affichés, ${noCoords} sans coordonnées`);
    console.log(`  LayerGroup contient ${layerGroup.getLayers().length} layers`);
  };

  const calculateRadius = (consoMwh: number): number => {
    const minRadius = 5;
    const maxRadius = 30;
    const logConso = Math.log10(consoMwh + 1);
    const maxLogConso = 4;
    return minRadius + (logConso / maxLogConso) * (maxRadius - minRadius);
  };

  const getCategoryLabel = (category: string): string => {
    switch (category.toLowerCase()) {
      case 'agriculture':
        return 'Agri';
      case 'industrie':
        return 'Indus';
      case 'tertiaire':
        return 'Ent';
      case 'etablissement public':
        return 'Pub';
      default:
        return category;
    }
  };

  return null;
}
