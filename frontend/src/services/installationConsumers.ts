import { supabase } from '../supabaseClient';
import { calculateDistance } from '../utils/distance';
import {
  getRayonReglementaire,
  getCategorieReglementaire,
  estCategorieRestrictive
} from '../utils/densityCategory';

export interface LinkConsumersResult {
  total: number;
  linked: number;
  alreadyLinked: number;
}

export async function linkEligibleConsumersToInstallation(
  installationId: string,
  installationLat: number,
  installationLon: number,
  marge: number = 200
): Promise<LinkConsumersResult> {
  console.log(`🔗 Liaison des consommateurs pour l'installation ${installationId}`);

  const { data: rpcData } = await supabase.rpc(
    'rpc_communes_autour_installation',
    { p_lat: installationLat, p_lon: installationLon }
  );

  if (!rpcData) {
    console.log('⚠️ Aucune commune trouvée autour de l\'installation');
    return { total: 0, linked: 0, alreadyLinked: 0 };
  }

  const communeCodes = [
    ...(rpcData.commune_installation ? [rpcData.commune_installation.codgeo] : []),
    ...rpcData.communes_dans_rayon.map((c: any) => c.codgeo)
  ];

  console.log(`📍 ${communeCodes.length} communes à analyser`);

  const densiteInstallation = rpcData.commune_installation?.dens7 || 5;
  const categorieInstallation = getCategorieReglementaire(densiteInstallation);
  const rayonInstallation = getRayonReglementaire(densiteInstallation);

  const { data: communesData } = await supabase
    .from('communes')
    .select('codgeo, dens7')
    .in('codgeo', communeCodes);

  const densiteMap = new Map<string, number>();
  communesData?.forEach(c => {
    densiteMap.set(c.codgeo, c.dens7);
  });

  const { data: allConsumers, error } = await supabase
    .from('consommateurs')
    .select('id, code_commune, latitude, longitude, installation_recherche_id')
    .eq('annee', 2024)
    .in('code_commune', communeCodes)
    .eq('geocode_status', 'success')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) {
    console.error('Erreur lors du chargement des consommateurs:', error);
    throw error;
  }

  const eligibleConsumers = (allConsumers || []).filter(consumer => {
    if (!consumer.latitude || !consumer.longitude || !consumer.code_commune) return false;

    const distance = calculateDistance(
      installationLat,
      installationLon,
      consumer.latitude,
      consumer.longitude
    );

    const densiteConsommateur = densiteMap.get(consumer.code_commune) || 5;
    const categorieConsommateur = getCategorieReglementaire(densiteConsommateur);
    const rayonConsommateur = getRayonReglementaire(densiteConsommateur);

    if (estCategorieRestrictive(categorieConsommateur, categorieInstallation)) {
      const rayonMax = rayonConsommateur + marge;
      return distance <= rayonMax;
    } else {
      const rayonMax = rayonInstallation + marge;
      return distance <= rayonMax;
    }
  });

  console.log(`✅ ${eligibleConsumers.length} consommateurs éligibles trouvés`);

  const consumersToLink = eligibleConsumers.filter(c => !c.installation_recherche_id);
  const alreadyLinked = eligibleConsumers.length - consumersToLink.length;

  console.log(`🔗 ${consumersToLink.length} à lier, ${alreadyLinked} déjà liés à une autre installation`);

  if (consumersToLink.length > 0) {
    const consumerIds = consumersToLink.map(c => c.id);

    const { error: updateError } = await supabase
      .from('consommateurs')
      .update({ installation_recherche_id: installationId })
      .in('id', consumerIds);

    if (updateError) {
      console.error('Erreur lors de la liaison:', updateError);
      throw updateError;
    }

    console.log(`✅ ${consumersToLink.length} consommateurs liés avec succès`);
  }

  return {
    total: eligibleConsumers.length,
    linked: consumersToLink.length,
    alreadyLinked
  };
}
