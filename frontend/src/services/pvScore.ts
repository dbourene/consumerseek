import { Consommateur } from '../types/consommateur';

export interface PVScoreResult {
  id: string;
  code_secteur_naf2: string;
  consommation_annuelle_mwh: number;
  s_stab: number;
  s_vol: number;
  s_pv: number;
  score_pv: number;
  categorie: 'Très forte' | 'Forte' | 'Moyenne' | 'Faible';
}

interface NAFScores {
  s_stab: number;
  s_pv: number;
}

const NAF_SCORES: Record<string, NAFScores> = {
  '87': { s_stab: 1.00, s_pv: 0.85 }, // Hébergement médico-social
  '55': { s_stab: 0.95, s_pv: 1.00 }, // Hébergement
  '86': { s_stab: 0.95, s_pv: 0.80 }, // Santé humaine
  '10': { s_stab: 0.90, s_pv: 0.85 }, // Industries alimentaires
  '47': { s_stab: 0.85, s_pv: 0.90 }, // Commerce de détail
  '93': { s_stab: 0.80, s_pv: 1.00 }, // Activités sportives
};

const DEFAULT_SCORES: NAFScores = { s_stab: 0.50, s_pv: 0.50 };

const VOLUME_PLAFOND_MWH = 500; // 500 MWh
const WEIGHT_STAB = 0.4;
const WEIGHT_VOL = 0.35;
const WEIGHT_PV = 0.25;

/**
 * Calcule le score de stabilité selon le code NAF2
 */
function getStabilityScore(naf2: string): number {
  return NAF_SCORES[naf2]?.s_stab ?? DEFAULT_SCORES.s_stab;
}

/**
 * Calcule le score d'adéquation PV selon le code NAF2
 */
function getPVAdequacyScore(naf2: string): number {
  return NAF_SCORES[naf2]?.s_pv ?? DEFAULT_SCORES.s_pv;
}

/**
 * Calcule le score de volume (plafonné à 500 MWh = 1.0)
 */
function getVolumeScore(consoAnnuelleMWh: number): number {
  if (consoAnnuelleMWh <= 0) return 0;
  return Math.min(consoAnnuelleMWh / VOLUME_PLAFOND_MWH, 1.0);
}

/**
 * Calcule le score PV global
 */
function calculatePVScore(s_stab: number, s_vol: number, s_pv: number): number {
  return WEIGHT_STAB * s_stab + WEIGHT_VOL * s_vol + WEIGHT_PV * s_pv;
}

/**
 * Détermine la catégorie de priorité selon le score PV
 */
function getCategorie(score_pv: number): 'Très forte' | 'Forte' | 'Moyenne' | 'Faible' {
  if (score_pv > 0.75) return 'Très forte';
  if (score_pv > 0.60) return 'Forte';
  if (score_pv > 0.45) return 'Moyenne';
  return 'Faible';
}

/**
 * Analyse un consommateur et calcule son score PV
 */
export function analyzePVPotential(consommateur: Consommateur): PVScoreResult | null {
  // Exclure les particuliers et résidentiels
  if (consommateur.categorie_activite === 'Particulier' || consommateur.categorie_activite === 'Residentiel') {
    return null;
  }

  // Vérifier que nous avons les données nécessaires
  if (!consommateur.code_secteur_naf2 || !consommateur.consommation_annuelle_mwh) {
    return null;
  }

  const s_stab = getStabilityScore(consommateur.code_secteur_naf2);
  const s_vol = getVolumeScore(consommateur.consommation_annuelle_mwh);
  const s_pv = getPVAdequacyScore(consommateur.code_secteur_naf2);
  const score_pv = calculatePVScore(s_stab, s_vol, s_pv);
  const categorie = getCategorie(score_pv);

  return {
    id: consommateur.id ? String(consommateur.id) : '',
    code_secteur_naf2: consommateur.code_secteur_naf2,
    consommation_annuelle_mwh: consommateur.consommation_annuelle_mwh,
    s_stab,
    s_vol,
    s_pv,
    score_pv,
    categorie,
  };
}

/**
 * Analyse une liste de consommateurs et retourne les résultats triés par score décroissant
 */
export function analyzeConsumersPVPotential(consommateurs: Consommateur[]): PVScoreResult[] {
  console.log('🔍 analyzeConsumersPVPotential - Consommateurs reçus:', consommateurs.length);

  const results: PVScoreResult[] = [];
  let excludedParticuliers = 0;
  let excludedMissingData = 0;

  for (const consommateur of consommateurs) {
    if (consommateur.categorie_activite === 'Particulier' || consommateur.categorie_activite === 'Residentiel') {
      excludedParticuliers++;
      continue;
    }

    if (!consommateur.code_secteur_naf2 || !consommateur.consommation_annuelle_mwh) {
      excludedMissingData++;
      continue;
    }

    const result = analyzePVPotential(consommateur);
    if (result) {
      results.push(result);
    }
  }

  console.log('🔍 Exclus - Particuliers/Résidentiels:', excludedParticuliers);
  console.log('🔍 Exclus - Données manquantes:', excludedMissingData);
  console.log('🔍 Résultats PV analysés:', results.length);

  if (results.length > 0) {
    console.log('🔍 Exemple de scores:', results.slice(0, 3).map(r => ({
      naf2: r.code_secteur_naf2,
      conso: r.consommation_annuelle_mwh,
      score: r.score_pv.toFixed(3),
      categorie: r.categorie
    })));
  }

  // Trier par score décroissant
  results.sort((a, b) => b.score_pv - a.score_pv);

  return results;
}

/**
 * Calcule les statistiques agrégées par catégorie
 */
export interface CategoryStats {
  categorie: 'Très forte' | 'Forte' | 'Moyenne' | 'Faible';
  count: number;
  consommation_totale_MWh: number;
}

export function getCategoryStats(results: PVScoreResult[]): CategoryStats[] {
  const categories: ('Très forte' | 'Forte' | 'Moyenne' | 'Faible')[] = [
    'Très forte',
    'Forte',
    'Moyenne',
    'Faible',
  ];

  return categories.map((categorie) => {
    const filtered = results.filter((r) => r.categorie === categorie);
    const consommation_totale_MWh = filtered.reduce((sum, r) => sum + r.consommation_annuelle_mwh, 0);

    return {
      categorie,
      count: filtered.length,
      consommation_totale_MWh,
    };
  });
}

/**
 * Calcule la distribution du scoring pour le graphique
 */
export interface ScoreDistribution {
  scoreRange: string;
  count: number;
  scoreMid: number;
}

export function getScoreDistribution(results: PVScoreResult[], binCount: number = 20): ScoreDistribution[] {
  console.log('📊 getScoreDistribution - Nombre de résultats:', results.length);

  const distribution: ScoreDistribution[] = [];
  const binSize = 1.0 / binCount;

  for (let i = 0; i < binCount; i++) {
    const minScore = i * binSize;
    const maxScore = (i + 1) * binSize;
    const count = results.filter((r) => r.score_pv >= minScore && r.score_pv < maxScore).length;

    distribution.push({
      scoreRange: `${minScore.toFixed(2)}-${maxScore.toFixed(2)}`,
      count,
      scoreMid: (minScore + maxScore) / 2,
    });
  }

  // Gérer le cas où score_pv = 1.0 exactement
  const exactlyOne = results.filter((r) => r.score_pv === 1.0);
  if (exactlyOne.length > 0) {
    console.log('📊 Scores exactement 1.0:', exactlyOne.length);
    distribution[binCount - 1].count += exactlyOne.length;
  }

  const totalCounted = distribution.reduce((sum, d) => sum + d.count, 0);
  console.log('📊 Total compté dans distribution:', totalCounted);
  console.log('📊 Distribution (premiers 5 bins):', distribution.slice(0, 5));

  return distribution;
}
