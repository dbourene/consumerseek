import { supabase } from '../supabaseClient';
import { lambert93ToWGS84, isValidLambert93Coordinates } from '../utils/coordinateConversion';

export interface SireneEtablissement {
  siret: string;
  siren: string;
  dateCreationEtablissement?: string;
  trancheEffectifsEtablissement?: string;
  activitePrincipaleEtablissement?: string;
  etatAdministratifEtablissement?: string;
  numeroVoieEtablissement?: string;
  indiceRepetitionEtablissement?: string;
  typeVoieEtablissement?: string;
  libelleVoieEtablissement?: string;
  codePostalEtablissement?: string;
  libelleCommuneEtablissement?: string;
  codeCommuneEtablissement?: string;
  coordonneeLambertAbscisse?: string;
  coordonneeLambertOrdonnee?: string;
  denominationUniteLegale?: string;
  activitePrincipaleUniteLegale?: string;
  etatAdministratifUniteLegale?: string;
}

export interface SireneResponse {
  header: {
    statut: number;
    message: string;
    total: number;
    debut: number;
    nombre: number;
  };
  etablissements?: SireneEtablissement[];
}

export interface LoadingSireneProgress {
  commune: string;
  communeName: string;
  communeIndex: number;
  totalCommunes: number;
  current: number;
  total: number;
  status: 'loading' | 'success' | 'error';
  message: string;
}

const BATCH_SIZE = 500;
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sirene-search`;
const MIN_DELAY_BETWEEN_REQUESTS_MS = 2500;
const MAX_DELAY_BETWEEN_REQUESTS_MS = 10000;
const DELAY_BETWEEN_COMMUNES_MS = 2000;
const MAX_RETRIES = 3;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30000;
const RATE_LIMIT_WAIT_MS = 30000;

let currentDelay = MIN_DELAY_BETWEEN_REQUESTS_MS;
let consecutiveRateLimitErrors = 0;
let lastRequestTime = 0;

async function delay(ms: number): Promise<void> {
  const jitter = Math.random() * 300;
  return new Promise(resolve => setTimeout(resolve, ms + jitter));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  if (consecutiveRateLimitErrors >= CIRCUIT_BREAKER_THRESHOLD) {
    console.warn(`🚨 Circuit breaker activé! Pause de ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s après ${consecutiveRateLimitErrors} erreurs consécutives...`);
    await delay(CIRCUIT_BREAKER_COOLDOWN_MS);
    consecutiveRateLimitErrors = 0;
    currentDelay = MIN_DELAY_BETWEEN_REQUESTS_MS;
    console.log('✅ Circuit breaker réinitialisé, reprise des requêtes...');
  }

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < currentDelay) {
    await delay(currentDelay - timeSinceLastRequest);
  }

  try {
    lastRequestTime = Date.now();
    const response = await fetch(url, options);

    if (response.status === 429) {
      consecutiveRateLimitErrors++;
      if (retries > 0) {
        currentDelay = Math.min(currentDelay * 1.5, MAX_DELAY_BETWEEN_REQUESTS_MS);
        console.warn(`⚠️ Rate limit 429 hit (${consecutiveRateLimitErrors} consécutif), augmentation du délai à ${Math.round(currentDelay)}ms, retry... (${retries} restants)`);
        await delay(currentDelay);
        return fetchWithRetry(url, options, retries - 1);
      } else {
        throw new Error('Rate limit exceeded: Too many requests to INSEE API');
      }
    }

    if (response.status === 500) {
      const errorData = await response.json().catch(() => ({ error: '' }));
      const errorMessage = errorData.error || '';

      if (errorMessage.toLowerCase().includes('rate limit') ||
          errorMessage.toLowerCase().includes('pagination')) {
        consecutiveRateLimitErrors++;
        if (retries > 0) {
          console.warn(`⚠️ Rate limit 500 détecté (${consecutiveRateLimitErrors} consécutif): "${errorMessage}", attente de ${RATE_LIMIT_WAIT_MS / 1000}s... (${retries} restants)`);
          await delay(RATE_LIMIT_WAIT_MS);
          return fetchWithRetry(url, options, retries - 1);
        } else {
          throw new Error(`Rate limit exceeded (500): ${errorMessage}`);
        }
      }

      throw new Error(`Erreur serveur 500: ${errorMessage}`);
    }

    if (response.ok) {
      if (consecutiveRateLimitErrors > 0) {
        console.log(`✅ Requête réussie, réinitialisation du compteur d'erreurs (était à ${consecutiveRateLimitErrors})`);
      }
      consecutiveRateLimitErrors = 0;
      if (currentDelay > MIN_DELAY_BETWEEN_REQUESTS_MS) {
        currentDelay = Math.max(MIN_DELAY_BETWEEN_REQUESTS_MS, currentDelay * 0.9);
      }
    }

    return response;
  } catch (error) {
    if (retries > 0 && (error instanceof Error && error.message.includes('network'))) {
      console.warn(`⚠️ Network error, retrying... (${retries} retries left)`);
      await delay(2000);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

function normalizeStreetName(street: string | undefined): string {
  if (!street) return '';

  return street
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchSireneByCommune(
  codeCommune: string,
  communeName: string,
  communeIndex: number,
  totalCommunes: number,
  onProgress?: (progress: LoadingSireneProgress) => void
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    let firstResponse: Response;
    try {
      firstResponse = await fetchWithRetry(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codeCommune: codeCommune,
          limit: BATCH_SIZE,
          debut: 0
        })
      });
    } catch (retryError) {
      if (retryError instanceof Error && retryError.message.toLowerCase().includes('rate limit')) {
        console.warn(`⏸️ Rate limit pour commune ${communeName}, attente de ${RATE_LIMIT_WAIT_MS / 1000}s avant de continuer...`);
        await delay(RATE_LIMIT_WAIT_MS);
        throw retryError;
      }
      throw retryError;
    }

    if (!firstResponse.ok) {
      const errorData = await firstResponse.json().catch(() => ({ error: 'Erreur inconnue' }));
      throw new Error(errorData.error || `Erreur API (${firstResponse.status})`);
    }

    const firstResult = await firstResponse.json();

    if (!firstResult.success || !firstResult.results) {
      throw new Error('Réponse invalide de l\'API');
    }

    const total = firstResult.total || 0;

    if (onProgress) {
      onProgress({
        commune: codeCommune,
        communeName,
        communeIndex,
        totalCommunes,
        current: 0,
        total,
        status: 'loading',
        message: `[${communeIndex}/${totalCommunes}] ${communeName}: Chargement de ${total} établissements...`
      });
    }

    let allEtablissements: SireneEtablissement[] = firstResult.results.map((etab: any) => ({
      siret: etab.siret,
      siren: etab.siren,
      dateCreationEtablissement: etab.dateCreationEtablissement,
      trancheEffectifsEtablissement: etab.trancheEffectifsEtablissement,
      activitePrincipaleEtablissement: etab.activitePrincipaleEtablissement,
      etatAdministratifEtablissement: etab.etatAdministratifEtablissement,
      numeroVoieEtablissement: etab.numeroVoieEtablissement,
      indiceRepetitionEtablissement: etab.indiceRepetitionEtablissement,
      typeVoieEtablissement: etab.typeVoieEtablissement,
      libelleVoieEtablissement: etab.libelleVoieEtablissement,
      codePostalEtablissement: etab.codePostalEtablissement,
      libelleCommuneEtablissement: etab.libelleCommuneEtablissement,
      codeCommuneEtablissement: etab.codeCommuneEtablissement,
      coordonneeLambertAbscisse: etab.coordonneeLambertAbscisse,
      coordonneeLambertOrdonnee: etab.coordonneeLambertOrdonnee,
      denominationUniteLegale: etab.denominationUniteLegale,
      activitePrincipaleUniteLegale: etab.activitePrincipaleUniteLegale,
      etatAdministratifUniteLegale: etab.etatAdministratifUniteLegale
    }));

    let loaded = allEtablissements.length;

    while (loaded < total) {
      const nextResponse = await fetchWithRetry(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codeCommune: codeCommune,
          limit: BATCH_SIZE,
          debut: loaded
        })
      });

      if (!nextResponse.ok) {
        throw new Error(`Erreur lors de la pagination (${nextResponse.status})`);
      }

      const nextResult = await nextResponse.json();
      const nextEtablissements = (nextResult.results || []).map((etab: any) => ({
        siret: etab.siret,
        siren: etab.siren,
        dateCreationEtablissement: etab.dateCreationEtablissement,
        trancheEffectifsEtablissement: etab.trancheEffectifsEtablissement,
        activitePrincipaleEtablissement: etab.activitePrincipaleEtablissement,
        etatAdministratifEtablissement: etab.etatAdministratifEtablissement,
        numeroVoieEtablissement: etab.numeroVoieEtablissement,
        indiceRepetitionEtablissement: etab.indiceRepetitionEtablissement,
        typeVoieEtablissement: etab.typeVoieEtablissement,
        libelleVoieEtablissement: etab.libelleVoieEtablissement,
        codePostalEtablissement: etab.codePostalEtablissement,
        libelleCommuneEtablissement: etab.libelleCommuneEtablissement,
        codeCommuneEtablissement: etab.codeCommuneEtablissement,
        coordonneeLambertAbscisse: etab.coordonneeLambertAbscisse,
        coordonneeLambertOrdonnee: etab.coordonneeLambertOrdonnee,
        denominationUniteLegale: etab.denominationUniteLegale,
        activitePrincipaleUniteLegale: etab.activitePrincipaleUniteLegale,
        etatAdministratifUniteLegale: etab.etatAdministratifUniteLegale
      }));

      allEtablissements = [...allEtablissements, ...nextEtablissements];
      loaded += nextEtablissements.length;

      if (onProgress) {
        onProgress({
          commune: codeCommune,
          communeName,
          communeIndex,
          totalCommunes,
          current: loaded,
          total,
          status: 'loading',
          message: `[${communeIndex}/${totalCommunes}] ${communeName}: ${loaded}/${total} établissements`
        });
      }

      if (nextEtablissements.length === 0) break;
    }

    const filteredEtablissements = allEtablissements.filter(etab => {
      const hasValidEtatAdministratif = etab.etatAdministratifUniteLegale === 'A';
      const hasValidDenomination = etab.denominationUniteLegale && etab.denominationUniteLegale.trim().length > 0;
      return hasValidEtatAdministratif && hasValidDenomination;
    });

    const excludedCount = allEtablissements.length - filteredEtablissements.length;
    if (excludedCount > 0) {
      console.log(`[${communeName}] ${excludedCount} établissement(s) exclu(s) (état non actif ou dénomination vide)`);
    }

    if (onProgress) {
      onProgress({
        commune: codeCommune,
        communeName,
        communeIndex,
        totalCommunes,
        current: filteredEtablissements.length,
        total,
        status: 'loading',
        message: `[${communeIndex}/${totalCommunes}] ${communeName}: Insertion de ${filteredEtablissements.length} établissements...`
      });
    }

    const societesToInsert = filteredEtablissements.map(etab => {
      const lambertX = etab.coordonneeLambertAbscisse ? parseFloat(etab.coordonneeLambertAbscisse) : null;
      const lambertY = etab.coordonneeLambertOrdonnee ? parseFloat(etab.coordonneeLambertOrdonnee) : null;

      let latitude: number | null = null;
      let longitude: number | null = null;

      if (isValidLambert93Coordinates(lambertX, lambertY)) {
        const gps = lambert93ToWGS84(lambertX!, lambertY!);
        latitude = gps.latitude;
        longitude = gps.longitude;
      }

      return {
        siret: etab.siret,
        siren: etab.siren,
        code_commune: etab.codeCommuneEtablissement,
        denomination: etab.denominationUniteLegale || '',
        nom_complet: etab.denominationUniteLegale || '',
        adresse_complete: [
          etab.numeroVoieEtablissement,
          etab.indiceRepetitionEtablissement,
          etab.typeVoieEtablissement,
          etab.libelleVoieEtablissement
        ].filter(Boolean).join(' '),
        adresse_numero: etab.numeroVoieEtablissement || '',
        adresse_type_voie: etab.typeVoieEtablissement || '',
        adresse_libelle_voie: etab.libelleVoieEtablissement || '',
        code_postal: etab.codePostalEtablissement || '',
        libelle_commune: etab.libelleCommuneEtablissement || '',
        activite_principale_etablissement: etab.activitePrincipaleEtablissement || '',
        activite_principale_unite_legale: etab.activitePrincipaleUniteLegale || '',
        tranche_effectifs_etablissement: etab.trancheEffectifsEtablissement || '',
        etat_administratif_unite_legale: etab.etatAdministratifUniteLegale || 'A',
        date_creation_etablissement: etab.dateCreationEtablissement || null,
        coordonneeLambertAbscisseEtablissement: lambertX,
        coordonneeLambertOrdonneeEtablissement: lambertY,
        latitude,
        longitude,
        nom_voie_normalise: normalizeStreetName(etab.libelleVoieEtablissement),
        loaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    const siretMap = new Map();
    societesToInsert.forEach(societe => {
      siretMap.set(societe.siret, societe);
    });
    const deduplicatedSocietes = Array.from(siretMap.values());

    const duplicatesCount = societesToInsert.length - deduplicatedSocietes.length;
    if (duplicatesCount > 0) {
      console.log(`[${communeName}] ${duplicatesCount} doublon(s) détecté(s) et supprimé(s) avant insertion`);
    }

    const { error: upsertError } = await supabase
      .from('societes')
      .upsert(deduplicatedSocietes, {
        onConflict: 'siret',
        ignoreDuplicates: false
      });

    if (upsertError) {
      throw new Error(`Erreur lors de l'insertion: ${upsertError.message}`);
    }

    const { error: logError } = await supabase
      .from('sirene_loading_log')
      .insert({
        code_commune: codeCommune,
        nb_societes: deduplicatedSocietes.length,
        status: 'success',
        loaded_at: new Date().toISOString()
      });

    if (logError) {
      console.error('Erreur lors du log:', logError);
    }

    if (onProgress) {
      const message = duplicatesCount > 0
        ? `[${communeIndex}/${totalCommunes}] ${communeName}: ${deduplicatedSocietes.length} établissements chargés (${duplicatesCount} doublon(s) ignoré(s)) ✓`
        : `[${communeIndex}/${totalCommunes}] ${communeName}: ${deduplicatedSocietes.length} établissements chargés ✓`;

      onProgress({
        commune: codeCommune,
        communeName,
        communeIndex,
        totalCommunes,
        current: deduplicatedSocietes.length,
        total,
        status: 'success',
        message
      });
    }

    return { success: true, count: deduplicatedSocietes.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';

    const { error: logError } = await supabase
      .from('sirene_loading_log')
      .insert({
        code_commune: codeCommune,
        nb_societes: 0,
        status: 'error',
        error_message: errorMessage,
        loaded_at: new Date().toISOString()
      });

    if (logError) {
      console.error('Erreur lors du log:', logError);
    }

    if (onProgress) {
      onProgress({
        commune: codeCommune,
        communeName: '',
        communeIndex: 0,
        totalCommunes: 0,
        current: 0,
        total: 0,
        status: 'error',
        message: errorMessage
      });
    }

    return { success: false, count: 0, error: errorMessage };
  }
}

export async function getCommunesForSireneLoading(installationIds?: string[]): Promise<{
  code_commune: string;
  nom_commune: string;
  needs_reload: boolean;
}[]> {
  if (installationIds && installationIds.length > 0) {
    const { data, error } = await supabase.rpc('get_communes_for_installations', {
      installation_ids: installationIds
    });

    if (error) {
      console.error('Erreur lors de la récupération des communes pour installations:', error);
      return [];
    }

    return data || [];
  }

  const { data, error } = await supabase.rpc('get_communes_for_sirene_loading');

  if (error) {
    console.error('Erreur lors de la récupération des communes:', error);
    return [];
  }

  return data || [];
}

export async function loadSireneForCommunes(
  communesData: { code_commune: string; nom_commune: string }[],
  onProgress?: (progress: LoadingSireneProgress) => void
): Promise<{ success: number; failed: number; errors: string[] }> {
  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  const totalCommunes = communesData.length;
  const startTime = Date.now();

  console.log(`🚀 Démarrage du chargement de ${totalCommunes} commune(s) avec les paramètres:`);
  console.log(`   - Délai minimum: ${MIN_DELAY_BETWEEN_REQUESTS_MS}ms`);
  console.log(`   - Délai entre communes: ${DELAY_BETWEEN_COMMUNES_MS}ms`);
  console.log(`   - Taille des batches: ${BATCH_SIZE} établissements`);
  console.log(`   - Taux théorique: ~${Math.round(60000 / MIN_DELAY_BETWEEN_REQUESTS_MS)} requêtes/minute`);

  for (let i = 0; i < communesData.length; i++) {
    const { code_commune, nom_commune } = communesData[i];

    if (i > 0) {
      await delay(DELAY_BETWEEN_COMMUNES_MS);
    }

    const result = await fetchSireneByCommune(
      code_commune,
      nom_commune,
      i + 1,
      totalCommunes,
      onProgress
    );

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
      if (result.error) {
        errors.push(`${nom_commune} (${code_commune}): ${result.error}`);
      }
    }

    const elapsed = Date.now() - startTime;
    const avgTimePerCommune = elapsed / (i + 1);
    const remainingCommunes = totalCommunes - (i + 1);
    const estimatedTimeRemaining = Math.round((avgTimePerCommune * remainingCommunes) / 1000);

    console.log(`📊 Progression: ${i + 1}/${totalCommunes} communes (${successCount} ✓, ${failedCount} ✗) - Temps restant estimé: ${estimatedTimeRemaining}s`);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`✅ Chargement terminé en ${totalTime}s: ${successCount} succès, ${failedCount} échecs`);

  return { success: successCount, failed: failedCount, errors };
}

export async function cleanupClosedSocietes(): Promise<number> {
  const { data: closedSocietes, error: fetchError } = await supabase
    .from('societes')
    .select('siret, siren, code_commune')
    .eq('etat_administratif_unite_legale', 'C');

  if (fetchError || !closedSocietes) {
    console.error('Erreur lors de la récupération des sociétés fermées:', fetchError);
    return 0;
  }

  if (closedSocietes.length === 0) {
    return 0;
  }

  const { error: deleteError } = await supabase
    .from('societes')
    .delete()
    .eq('etat_administratif_unite_legale', 'C');

  if (deleteError) {
    console.error('Erreur lors de la suppression:', deleteError);
    return 0;
  }

  return closedSocietes.length;
}

export async function searchSireneBySiret(siret: string): Promise<{
  siret: string;
  forme_juridique?: string;
  code_naf?: string;
} | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        siret: siret,
        limit: 1,
        debut: 0
      })
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    if (!result.success || !result.results || result.results.length === 0) {
      return null;
    }

    const etab = result.results[0];

    return {
      siret: etab.siret,
      forme_juridique: etab.categorieJuridiqueUniteLegale,
      code_naf: etab.activitePrincipaleUniteLegale || etab.activitePrincipaleEtablissement
    };
  } catch (error) {
    console.error('Error searching SIRENE by SIRET:', error);
    return null;
  }
}
