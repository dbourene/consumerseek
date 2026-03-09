import { supabase } from '../supabaseClient';
import {
  parseAddress,
  normalizeStreetName,
  calculateSimilarity
} from './addressNormalization';

export interface MatchResult {
  consommateurId: number;
  societeId?: string;
  matchScore: number;
  matchMethod: 'exact' | 'fuzzy' | 'geographic' | 'none';
  details: string;
}

export interface MatchingProgress {
  current: number;
  total: number;
  status: 'loading' | 'success' | 'error';
  message: string;
  matched: number;
  unmatched: number;
}

const FUZZY_SIMILARITY_THRESHOLD = 80;
const MAX_GEOGRAPHIC_DISTANCE_KM = 0.5;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getNaf2FromCode(code: string | null): string {
  if (!code) return '';
  return code.substring(0, 2);
}

async function normalizeConsommateursAddresses(
  consommateurs: any[]
): Promise<void> {
  const updates = consommateurs.map(c => {
    const normalized = parseAddress(
      c.adresse || '',
      c.numero_voie,
      c.type_voie,
      c.libelle_voie,
      c.code_commune,
      c.nom_commune,
      undefined
    );

    return {
      id: c.id,
      nom_voie_normalise: normalized.nomVoieNormalise
    };
  });

  for (const update of updates) {
    await supabase
      .from('consommateurs')
      .update({ nom_voie_normalise: update.nom_voie_normalise })
      .eq('id', update.id);
  }
}

async function exactMatch(
  consommateur: any,
  societes: any[]
): Promise<MatchResult | null> {
  const naf2Consommateur = getNaf2FromCode(
    consommateur.code_secteur_naf2 || consommateur.code_naf
  );

  if (!naf2Consommateur || !consommateur.nom_voie_normalise) {
    return null;
  }

  const exactMatches = societes.filter(s => {
    const naf2Societe = getNaf2FromCode(s.activite_principale_etablissement);

    if (naf2Societe !== naf2Consommateur) return false;

    if (s.code_commune !== consommateur.code_commune) return false;

    if (s.nom_voie_normalise !== consommateur.nom_voie_normalise) return false;

    const numeroConsommateur = consommateur.numero_voie?.trim() || '';
    const numeroSociete = s.adresse_numero?.trim() || '';

    if (numeroConsommateur && numeroSociete) {
      if (numeroConsommateur !== numeroSociete) return false;
    }

    return true;
  });

  if (exactMatches.length === 1) {
    return {
      consommateurId: consommateur.id,
      societeId: exactMatches[0].id,
      matchScore: 100,
      matchMethod: 'exact',
      details: 'Match exact: adresse + NAF2'
    };
  }

  if (exactMatches.length > 1) {
    return {
      consommateurId: consommateur.id,
      societeId: exactMatches[0].id,
      matchScore: 95,
      matchMethod: 'exact',
      details: `Match exact mais ${exactMatches.length} candidats trouvés`
    };
  }

  return null;
}

async function fuzzyMatch(
  consommateur: any,
  societes: any[]
): Promise<MatchResult | null> {
  const naf2Consommateur = getNaf2FromCode(
    consommateur.code_secteur_naf2 || consommateur.code_naf
  );

  if (!naf2Consommateur || !consommateur.nom_voie_normalise) {
    return null;
  }

  const candidatesBySameCommune = societes.filter(s => {
    const naf2Societe = getNaf2FromCode(s.activite_principale_etablissement);
    return naf2Societe === naf2Consommateur && s.code_commune === consommateur.code_commune;
  });

  if (candidatesBySameCommune.length === 0) {
    return null;
  }

  let bestMatch: any = null;
  let bestScore = 0;

  for (const societe of candidatesBySameCommune) {
    const similarity = calculateSimilarity(
      consommateur.nom_voie_normalise,
      societe.nom_voie_normalise
    );

    if (similarity >= FUZZY_SIMILARITY_THRESHOLD && similarity > bestScore) {
      bestScore = similarity;
      bestMatch = societe;
    }
  }

  if (bestMatch) {
    return {
      consommateurId: consommateur.id,
      societeId: bestMatch.id,
      matchScore: bestScore,
      matchMethod: 'fuzzy',
      details: `Match flou: similarité ${bestScore}% avec NAF2 exact`
    };
  }

  return null;
}

async function geographicMatch(
  consommateur: any,
  societes: any[]
): Promise<MatchResult | null> {
  const naf2Consommateur = getNaf2FromCode(
    consommateur.code_secteur_naf2 || consommateur.code_naf
  );

  if (
    !naf2Consommateur ||
    !consommateur.latitude ||
    !consommateur.longitude
  ) {
    return null;
  }

  const candidatesBySameCommune = societes.filter(s => {
    const naf2Societe = getNaf2FromCode(s.activite_principale_etablissement);
    return (
      naf2Societe === naf2Consommateur &&
      s.code_commune === consommateur.code_commune &&
      s.latitude &&
      s.longitude
    );
  });

  if (candidatesBySameCommune.length === 0) {
    return null;
  }

  let bestMatch: any = null;
  let bestDistance = Infinity;

  for (const societe of candidatesBySameCommune) {
    const distance = haversineDistance(
      parseFloat(consommateur.latitude),
      parseFloat(consommateur.longitude),
      parseFloat(societe.latitude),
      parseFloat(societe.longitude)
    );

    if (distance <= MAX_GEOGRAPHIC_DISTANCE_KM && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = societe;
    }
  }

  if (bestMatch) {
    const score = Math.max(
      60,
      Math.round(100 - (bestDistance / MAX_GEOGRAPHIC_DISTANCE_KM) * 40)
    );

    return {
      consommateurId: consommateur.id,
      societeId: bestMatch.id,
      matchScore: score,
      matchMethod: 'geographic',
      details: `Match géographique: ${Math.round(bestDistance * 1000)}m avec NAF2 exact`
    };
  }

  return null;
}

export async function matchConsommateursWithSocietes(
  codeCommunes?: string[],
  onProgress?: (progress: MatchingProgress) => void
): Promise<{
  matched: number;
  unmatched: number;
  results: MatchResult[];
}> {
  let query = supabase
    .from('consommateurs')
    .select('*')
    .is('societe_id', null);

  if (codeCommunes && codeCommunes.length > 0) {
    query = query.in('code_commune', codeCommunes);
  }

  const { data: consommateurs, error: consommateursError } = await query;

  if (consommateursError || !consommateurs) {
    throw new Error(
      `Erreur lors de la récupération des consommateurs: ${consommateursError?.message}`
    );
  }

  const total = consommateurs.length;

  if (onProgress) {
    onProgress({
      current: 0,
      total,
      status: 'loading',
      message: 'Normalisation des adresses...',
      matched: 0,
      unmatched: 0
    });
  }

  await normalizeConsommateursAddresses(consommateurs);

  const communesUniques = [
    ...new Set(consommateurs.map(c => c.code_commune).filter(Boolean))
  ];

  const { data: societes, error: societesError } = await supabase
    .from('societes')
    .select('*')
    .in('code_commune', communesUniques)
    .eq('etat_administratif_unite_legale', 'A');

  if (societesError || !societes) {
    throw new Error(
      `Erreur lors de la récupération des sociétés: ${societesError?.message}`
    );
  }

  const results: MatchResult[] = [];
  let matched = 0;
  let unmatched = 0;

  for (let i = 0; i < consommateurs.length; i++) {
    const consommateur = consommateurs[i];

    const societesCommune = societes.filter(
      s => s.code_commune === consommateur.code_commune
    );

    let matchResult = await exactMatch(consommateur, societesCommune);

    if (!matchResult) {
      matchResult = await fuzzyMatch(consommateur, societesCommune);
    }

    if (!matchResult) {
      matchResult = await geographicMatch(consommateur, societesCommune);
    }

    if (!matchResult) {
      matchResult = {
        consommateurId: consommateur.id,
        matchScore: 0,
        matchMethod: 'none',
        details: 'Aucun match trouvé'
      };
      unmatched++;
    } else {
      matched++;

      await supabase
        .from('consommateurs')
        .update({
          societe_id: matchResult.societeId,
          match_score: matchResult.matchScore,
          match_method: matchResult.matchMethod
        })
        .eq('id', consommateur.id);
    }

    results.push(matchResult);

    if (onProgress && (i % 10 === 0 || i === consommateurs.length - 1)) {
      onProgress({
        current: i + 1,
        total,
        status: 'loading',
        message: `Rapprochement en cours... ${i + 1}/${total}`,
        matched,
        unmatched
      });
    }
  }

  if (onProgress) {
    onProgress({
      current: total,
      total,
      status: 'success',
      message: `Rapprochement terminé: ${matched} matchés, ${unmatched} non matchés`,
      matched,
      unmatched
    });
  }

  return { matched, unmatched, results };
}

export async function getUnmatchedConsommateurs(
  limit = 100
): Promise<any[]> {
  const { data, error } = await supabase
    .from('consommateurs')
    .select('*')
    .is('societe_id', null)
    .limit(limit);

  if (error) {
    console.error('Erreur lors de la récupération des non matchés:', error);
    return [];
  }

  return data || [];
}

export async function exportUnmatchedToCSV(): Promise<string> {
  const unmatched = await getUnmatchedConsommateurs(10000);

  const headers = [
    'id',
    'nom_societe',
    'adresse',
    'code_commune',
    'nom_commune',
    'code_naf',
    'code_secteur_naf2',
    'consommation_annuelle_mwh'
  ];

  const rows = unmatched.map(c =>
    headers.map(h => c[h] || '').join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export async function matchConsumerWithSirene(
  consommateur: any
): Promise<any | null> {
  console.warn('matchConsumerWithSirene is deprecated. Use matchConsommateursWithSocietes instead.');
  return null;
}

export async function saveMatchResult(matchResult: any): Promise<void> {
  console.warn('saveMatchResult is deprecated. Matching results are now saved automatically.');
}
