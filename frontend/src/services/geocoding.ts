import { GeocodingResult, Consommateur } from '../types/consommateur';
import { supabase } from '../supabaseClient';
import { fixEncodingIssues } from '../utils/textEncoding';
import { parseAddress, buildFullAddress } from './addressParser';
import { normalizeAddress } from '../utils/addressNormalizer';
import { detectTreatmentStation, searchTreatmentStation } from './treatmentStations';

const API_BASE_URL = 'https://api-adresse.data.gouv.fr';
const CONFIDENCE_THRESHOLD = 0.5;
const BATCH_SIZE = 50;
const DELAY_MS = 100;

interface CommercialAddressInfo {
  brandName: string | null;
  variations: string[];
}

function extractCommercialInfo(address: string): CommercialAddressInfo {
  const variations: string[] = [];
  let brandName: string | null = null;
  let cleaned = address;

  const commercialKeywords = [
    'MAIL ',
    'HYPERMARCHE ',
    'HYPER ',
    'SUPERMARCHE ',
    'SUPER ',
    'CENTRE COMMERCIAL ',
    'CC ',
    'GALERIE ',
    'ZAC ',
    'ZONE ARTISANALE ',
    'ZI ',
    'ZONE INDUSTRIELLE ',
    'PARC D\'ACTIVITES ',
    'PARC COMMERCIAL '
  ];

  const brandKeywords = [
    { pattern: /\bAUCHAN\b/i, name: 'AUCHAN' },
    { pattern: /\bLECLERC\b/i, name: 'E.LECLERC' },
    { pattern: /\bCARREFOUR\b/i, name: 'CARREFOUR' },
    { pattern: /\bINTERMARCHE\b/i, name: 'INTERMARCHÉ' },
    { pattern: /\bCASINO\b/i, name: 'CASINO' },
    { pattern: /\bLIDL\b/i, name: 'LIDL' },
    { pattern: /\bALDI\b/i, name: 'ALDI' },
    { pattern: /\b(SUPER U|HYPER U)\b/i, name: 'SYSTÈME U' },
    { pattern: /\bMONOPRIX\b/i, name: 'MONOPRIX' },
    { pattern: /\bFRANPRIX\b/i, name: 'FRANPRIX' },
    { pattern: /\bCORA\b/i, name: 'CORA' }
  ];

  for (const brand of brandKeywords) {
    const match = address.match(brand.pattern);
    if (match) {
      brandName = brand.name;
      break;
    }
  }

  for (const keyword of commercialKeywords) {
    cleaned = cleaned.replace(new RegExp(keyword, 'gi'), '');
  }

  variations.push(cleaned.trim());

  for (const brand of brandKeywords) {
    const withoutBrand = cleaned.replace(brand.pattern, '').trim();
    if (withoutBrand && withoutBrand !== cleaned.trim()) {
      variations.push(withoutBrand);
    }
  }

  if (brandName) {
    variations.push(brandName);
  }

  return {
    brandName,
    variations: variations.filter(v => v.length > 0)
  };
}

function isLieuDit(address: string): boolean {
  const upperAddress = address.toUpperCase();

  const lieuDitPatterns = [
    /^(LE|LA|LES|L')\s+[A-Z]/,
    /LIEU DIT/i,
    /^CHATEAU /i,
    /^DOMAINE /i,
    /^FERME /i,
    /^MOULIN /i
  ];

  for (const pattern of lieuDitPatterns) {
    if (pattern.test(upperAddress)) {
      return true;
    }
  }

  const hasNoStreetIndicator = !/\b(RUE|AVENUE|BOULEVARD|PLACE|CHEMIN|ROUTE|IMPASSE|ALLEE|COURS)\b/i.test(upperAddress);
  const hasNoNumber = !/^\d/.test(upperAddress.trim());
  const isAllCaps = upperAddress === address && address.length > 3;

  return hasNoStreetIndicator && hasNoNumber && isAllCaps;
}

async function geocodeByCityCenter(cityCode: string, cityName: string): Promise<GeocodingResult | null> {
  try {
    const response = await fetch(`https://geo.api.gouv.fr/communes/${cityCode}?fields=centre&format=json`);

    if (!response.ok) return null;

    const data = await response.json();

    if (data.centre && data.centre.coordinates) {
      return {
        latitude: data.centre.coordinates[1],
        longitude: data.centre.coordinates[0],
        label: `Centre de ${cityName}`,
        score: 0.6
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting city center:', error);
    return null;
  }
}

export async function geocodeAddress(
  address: string,
  cityCode?: string,
  cityName?: string
): Promise<GeocodingResult | null> {
  try {
    const fixedAddress = fixEncodingIssues(address);
    const fixedCityName = cityName ? fixEncodingIssues(cityName) : undefined;

    const commercialInfo = extractCommercialInfo(fixedAddress);
    const extractedBrand = commercialInfo.brandName || undefined;

    if (detectTreatmentStation(fixedAddress) && cityCode) {
      console.log(`🏭 Station de traitement détectée: "${fixedAddress}"`);
      const station = await searchTreatmentStation(fixedAddress, cityCode);
      if (station) {
        console.log(`✅ Station trouvée dans la base: ${station.nom}`);
        return {
          latitude: station.latitude,
          longitude: station.longitude,
          label: `${station.nom}, ${station.commune}`,
          score: 1.0,
          extractedBrandName: extractedBrand
        };
      }
      console.log(`⚠️ Station non trouvée dans la base, tentative de géocodage standard`);
    }

    const isJustCityName = fixedCityName &&
      (fixedAddress.toLowerCase() === fixedCityName.toLowerCase() ||
       fixedAddress.trim() === '' ||
       fixedAddress.length < 5);

    if (isJustCityName && cityCode && fixedCityName) {
      console.log(`🏙️ Adresse = commune, recherche du centre pour: ${fixedCityName}`);
      const centerResult = await geocodeByCityCenter(cityCode, fixedCityName);
      if (centerResult) {
        console.log(`✅ Centre trouvé pour ${fixedCityName}`);
        return {
          ...centerResult,
          extractedBrandName: extractedBrand
        };
      }
    }

    const normalizedAddress = normalizeAddress(fixedAddress);
    const parsed = parseAddress(normalizedAddress);

    const addressForGeocoding = parsed.adresseStandardisee || normalizedAddress;

    const strategies: Array<{ q: string; citycode?: string; type?: string }> = [
      { q: addressForGeocoding, citycode: cityCode, type: 'housenumber' },
      { q: `${addressForGeocoding}, ${fixedCityName || ''}`, citycode: cityCode },
      { q: addressForGeocoding, citycode: cityCode },
      { q: fixedAddress, citycode: cityCode, type: 'housenumber' },
      { q: `${fixedAddress}, ${fixedCityName || ''}`, citycode: cityCode },
      { q: fixedAddress, citycode: cityCode }
    ];

    if (isLieuDit(fixedAddress)) {
      console.log(`🏞️ Lieu-dit détecté: "${fixedAddress}"`);
      strategies.unshift(
        { q: `${fixedAddress} ${fixedCityName || ''}`, citycode: cityCode },
        { q: `${fixedAddress}, ${fixedCityName || ''}` },
        { q: `${fixedAddress} ${fixedCityName || ''}` }
      );
    }

    if (commercialInfo.variations.length > 1 || commercialInfo.brandName) {
      console.log(`🏪 Adresse commerciale détectée${commercialInfo.brandName ? `: ${commercialInfo.brandName}` : ''}, variations: ${commercialInfo.variations.length}`);
      for (const variation of commercialInfo.variations) {
        strategies.unshift(
          { q: variation, citycode: cityCode },
          { q: `${variation}, ${fixedCityName || ''}`, citycode: cityCode },
          { q: `${variation} ${fixedCityName || ''}` }
        );
      }
    }

    strategies.push(
      { q: addressForGeocoding },
      { q: fixedAddress },
      { q: `${addressForGeocoding} ${fixedCityName || ''}` },
      { q: `${fixedAddress} ${fixedCityName || ''}` }
    );

    for (const strategy of strategies) {
      const params = new URLSearchParams({
        q: strategy.q,
        limit: '1'
      });

      if (strategy.citycode) {
        params.append('citycode', strategy.citycode);
      }

      if (strategy.type) {
        params.append('type', strategy.type);
      }

      const response = await fetch(`${API_BASE_URL}/search/?${params}`);

      if (!response.ok) continue;

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const score = feature.properties.score;

        if (score >= CONFIDENCE_THRESHOLD) {
          return {
            latitude: feature.geometry.coordinates[1],
            longitude: feature.geometry.coordinates[0],
            label: feature.properties.label,
            score: score,
            extractedBrandName: extractedBrand
          };
        }
      }
    }

    if (cityCode && fixedCityName) {
      console.log(`🔄 Toutes les stratégies échouées, tentative du centre de commune pour: ${fixedCityName}`);
      const centerResult = await geocodeByCityCenter(cityCode, fixedCityName);
      if (centerResult) {
        console.log(`✅ Centre trouvé en fallback pour ${fixedCityName}`);
        return {
          ...centerResult,
          extractedBrandName: extractedBrand
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function batchGeocode(
  addresses: Array<{ address: string; cityCode?: string }>
): Promise<Array<GeocodingResult | null>> {
  const results = await Promise.all(
    addresses.map(({ address, cityCode }) => geocodeAddress(address, cityCode))
  );
  return results;
}

export function isAddressGeocoded(address: string | null | undefined): boolean {
  if (!address) return false;

  const hasSpacedLetters = /\b[A-Z]\s+[A-Z]\s+[A-Z]/.test(address);
  const hasConsecutiveNumbers = /\d{5,}/.test(address);
  const isTooShort = address.trim().length < 5;

  return !hasSpacedLetters && !hasConsecutiveNumbers && !isTooShort;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface GeocodeConsommateursOptions {
  communes: string[];
  annee: number;
  limit?: number;
  onProgress?: (current: number, total: number, success: number, failed: number) => void;
}

export interface GeocodeResult {
  total: number;
  success: number;
  failed: number;
  invalidAddresses: Consommateur[];
}

export async function countConsommateursToGeocode(
  communes: string[],
  annee: number
): Promise<number> {
  const { count, error } = await supabase
    .from('consommateurs')
    .select('*', { count: 'exact', head: true })
    .in('code_commune', communes)
    .eq('annee', annee)
    .or('geocode_status.is.null,geocode_status.eq.failed');

  if (error) {
    console.error('Error counting consommateurs:', error);
    return 0;
  }

  return count || 0;
}

export async function geocodeConsommateurs(
  options: GeocodeConsommateursOptions
): Promise<GeocodeResult> {
  const { communes, annee, limit, onProgress } = options;

  const { count } = await supabase
    .from('consommateurs')
    .select('*', { count: 'exact', head: true })
    .in('code_commune', communes)
    .eq('annee', annee)
    .or('geocode_status.is.null,geocode_status.eq.failed');

  const totalCount = count || 0;

  if (totalCount === 0) {
    return { total: 0, success: 0, failed: 0, invalidAddresses: [] };
  }

  const allConsommateurs: any[] = [];
  const pageSize = 1000;
  const maxToProcess = limit || totalCount;

  console.log(`📊 GÉOCODAGE - Total dans la base: ${totalCount} consommateurs à géocoder`);
  console.log(`📊 GÉOCODAGE - Pagination: récupération par lots de ${pageSize}`);

  for (let offset = 0; offset < Math.min(totalCount, maxToProcess); offset += pageSize) {
    console.log(`   → Récupération du lot ${Math.floor(offset / pageSize) + 1}/${Math.ceil(Math.min(totalCount, maxToProcess) / pageSize)} (offset ${offset})`);

    const { data, error } = await supabase
      .from('consommateurs')
      .select('id, adresse, code_commune, nom_commune, nombre_sites, consommation_annuelle_mwh, tranche_conso, categorie_activite, latitude, longitude, geocode_status')
      .in('code_commune', communes)
      .eq('annee', annee)
      .or('geocode_status.is.null,geocode_status.eq.failed')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('❌ Error fetching consommateurs:', error);
      break;
    }

    if (data) {
      allConsommateurs.push(...data);
      console.log(`   ✅ ${data.length} consommateurs récupérés dans ce lot (total accumulé: ${allConsommateurs.length})`);
    }
  }

  console.log(`✅ GÉOCODAGE - Total récupéré: ${allConsommateurs.length} consommateurs`);

  if (allConsommateurs.length === 0) {
    return { total: 0, success: 0, failed: 0, invalidAddresses: [] };
  }

  let successCount = 0;
  let failedCount = 0;
  const invalidAddresses: Consommateur[] = [];
  let processedCount = 0;

  for (let i = 0; i < allConsommateurs.length; i += BATCH_SIZE) {
    const batch = allConsommateurs.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (conso) => {
        let addressWasEmpty = false;
        let addressToGeocode = conso.adresse;

        try {

          if (!addressToGeocode || addressToGeocode.trim() === '') {
            addressToGeocode = conso.nom_commune;
            addressWasEmpty = true;
            console.log(`🔄 Adresse vide remplacée par: "${addressToGeocode}" pour consommateur ID ${conso.id}`);
          }

          const localCommercialInfo = extractCommercialInfo(addressToGeocode);
          const result = await geocodeAddress(addressToGeocode, conso.code_commune, conso.nom_commune);

          if (result) {
            const parsed = parseAddress(fixEncodingIssues(addressToGeocode));

            const updateData: any = {
              latitude: result.latitude,
              longitude: result.longitude,
              geocode_score: result.score,
              geocode_source: 'adresse.data.gouv.fr',
              geocode_status: 'success',
              nom_commune: fixEncodingIssues(conso.nom_commune),
              nom_societe: result.extractedBrandName || localCommercialInfo.brandName || parsed.nomSociete,
              complement_adresse: parsed.complementAdresse,
              adresse_standardisee: parsed.adresseStandardisee,
              type_adresse_specifique: parsed.typeAdresseSpecifique
            };

            if (addressWasEmpty) {
              updateData.adresse = fixEncodingIssues(addressToGeocode);
            } else {
              updateData.adresse = fixEncodingIssues(conso.adresse);
            }

            const { error: updateError } = await supabase
              .from('consommateurs')
              .update(updateData)
              .eq('id', conso.id);

            if (!updateError) {
              successCount++;
              if (addressWasEmpty) {
                console.log(`✅ Géocodage réussi pour ID ${conso.id}: "${addressToGeocode}" (adresse vide remplacée)`);
              } else {
                console.log(`✅ Géocodage réussi pour ID ${conso.id}: "${addressToGeocode}"`);
              }
            } else {
              failedCount++;
              const updatedConso = {
                ...conso,
                adresse: fixEncodingIssues(addressWasEmpty ? addressToGeocode : conso.adresse),
                nom_commune: fixEncodingIssues(conso.nom_commune)
              };
              console.log(`❌ Erreur update DB pour ID ${conso.id}. Ajout à invalidAddresses avec adresse: "${updatedConso.adresse}"`, updateError);
              invalidAddresses.push(updatedConso as Consommateur);
            }
          } else {
            const parsed = parseAddress(fixEncodingIssues(addressToGeocode));

            const updateData: any = {
              geocode_status: 'failed',
              geocode_source: 'adresse.data.gouv.fr',
              nom_commune: fixEncodingIssues(conso.nom_commune),
              nom_societe: localCommercialInfo.brandName || parsed.nomSociete,
              complement_adresse: parsed.complementAdresse,
              adresse_standardisee: parsed.adresseStandardisee,
              type_adresse_specifique: parsed.typeAdresseSpecifique
            };

            if (addressWasEmpty) {
              updateData.adresse = fixEncodingIssues(addressToGeocode);
            } else {
              updateData.adresse = fixEncodingIssues(conso.adresse);
            }

            const { error: updateError } = await supabase
              .from('consommateurs')
              .update(updateData)
              .eq('id', conso.id);

            failedCount++;
            const updatedConso = {
              ...conso,
              adresse: fixEncodingIssues(addressWasEmpty ? addressToGeocode : conso.adresse),
              nom_commune: fixEncodingIssues(conso.nom_commune)
            };
            console.log(`⚠️ Géocodage échoué pour ID ${conso.id}: "${addressToGeocode}"${addressWasEmpty ? ' (adresse vide remplacée par commune)' : ''}`);
            console.log(`   → Ajout à invalidAddresses avec: id=${updatedConso.id}, adresse="${updatedConso.adresse}", commune="${updatedConso.nom_commune}"`);
            invalidAddresses.push(updatedConso as Consommateur);
          }
        } catch (err) {
          console.error(`❌ Erreur exception pour ID ${conso.id}:`, err);
          failedCount++;
          const updatedConso = {
            ...conso,
            adresse: fixEncodingIssues(addressWasEmpty ? addressToGeocode : conso.adresse),
            nom_commune: fixEncodingIssues(conso.nom_commune)
          };
          console.log(`   → Ajout à invalidAddresses avec: id=${updatedConso.id}, adresse="${updatedConso.adresse}", commune="${updatedConso.nom_commune}"`);
          invalidAddresses.push(updatedConso as Consommateur);
        }

        processedCount++;
        if (onProgress) {
          onProgress(processedCount, allConsommateurs.length, successCount, failedCount);
        }
      })
    );

    if (i + BATCH_SIZE < allConsommateurs.length) {
      await delay(DELAY_MS);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ GÉOCODAGE TERMINÉ`);
  console.log(`   📊 Total traité: ${allConsommateurs.length}`);
  console.log(`   ✅ Succès: ${successCount}`);
  console.log(`   ❌ Échecs: ${failedCount}`);
  console.log(`   📋 Adresses à corriger: ${invalidAddresses.length}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return {
    total: allConsommateurs.length,
    success: successCount,
    failed: failedCount,
    invalidAddresses
  };
}

export async function updateConsommateurAddress(
  id: number,
  newAddress: string,
  codeCommune: string,
  nomCommune: string
): Promise<boolean> {
  console.log('🟢 ════════════════════════════════════════════════════');
  console.log('🟢 updateConsommateurAddress APPELÉ');
  console.log('🟢 ID:', id);
  console.log('🟢 Adresse:', newAddress);
  console.log('🟢 Code commune:', codeCommune);
  console.log('🟢 Nom commune:', nomCommune);

  const fixedAddress = fixEncodingIssues(newAddress);
  const fixedCommune = fixEncodingIssues(nomCommune);

  console.log('🟢 Après fixEncoding - Adresse:', fixedAddress);
  console.log('🟢 Après fixEncoding - Commune:', fixedCommune);

  console.log('🟢 Appel à geocodeAddress...');
  const result = await geocodeAddress(fixedAddress, codeCommune, fixedCommune);

  console.log('🟢 Résultat de geocodeAddress:', result ? 'SUCCÈS' : 'ÉCHEC');
  if (result) {
    console.log('🟢   Latitude:', result.latitude);
    console.log('🟢   Longitude:', result.longitude);
    console.log('🟢   Score:', result.score);
    console.log('🟢   Label:', result.label);
  }

  if (!result) {
    console.log('🟢 Géocodage échoué - Retour false');
    console.log('🟢 ════════════════════════════════════════════════════');
    return false;
  }

  const parsed = parseAddress(fixedAddress);
  console.log('🟢 Adresse parsée:', JSON.stringify(parsed, null, 2));

  const localCommercialInfo = extractCommercialInfo(fixedAddress);

  console.log('🟢 Mise à jour dans Supabase...');
  const { error } = await supabase
    .from('consommateurs')
    .update({
      adresse: fixedAddress,
      nom_commune: fixedCommune,
      latitude: result.latitude,
      longitude: result.longitude,
      geocode_score: result.score,
      geocode_source: 'adresse.data.gouv.fr',
      geocode_status: 'success',
      nom_societe: result.extractedBrandName || localCommercialInfo.brandName || parsed.nomSociete,
      complement_adresse: parsed.complementAdresse,
      adresse_standardisee: parsed.adresseStandardisee,
      type_adresse_specifique: parsed.typeAdresseSpecifique,
      source: 'manual'
    })
    .eq('id', id);

  if (error) {
    console.error('🟢 ❌ ERREUR Supabase:', error);
    console.log('🟢 ════════════════════════════════════════════════════');
    return false;
  }

  console.log('🟢 ✅ Mise à jour Supabase réussie');
  console.log('🟢 ════════════════════════════════════════════════════');
  return true;
}
