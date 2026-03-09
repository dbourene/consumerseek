export interface NormalizedAddress {
  numero: string;
  typeVoie: string;
  nomVoie: string;
  nomVoieNormalise: string;
  codeCommune: string;
  commune: string;
  codePostal: string;
  adresseComplete: string;
}

const TYPE_VOIE_ABBREVIATIONS: Record<string, string> = {
  'rue': 'r',
  'avenue': 'av',
  'boulevard': 'bd',
  'chemin': 'ch',
  'route': 'rte',
  'place': 'pl',
  'impasse': 'imp',
  'allée': 'all',
  'allee': 'all',
  'cours': 'crs',
  'square': 'sq',
  'passage': 'pass',
  'quai': 'q',
  'voie': 'v',
  'montée': 'mte',
  'montee': 'mte',
  'côte': 'cte',
  'cote': 'cte',
  'hameau': 'ham',
  'lotissement': 'lot',
  'résidence': 'res',
  'residence': 'res',
  'lieu-dit': 'ld',
  'lieu dit': 'ld'
};

const REVERSED_ABBREVIATIONS: Record<string, string> = Object.entries(TYPE_VOIE_ABBREVIATIONS)
  .reduce((acc, [key, value]) => ({ ...acc, [value]: key }), {});

export function removeAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function removePunctuation(text: string): string {
  return text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function abbreviateTypeVoie(typeVoie: string): string {
  const normalized = removeAccents(typeVoie.toLowerCase().trim());
  return TYPE_VOIE_ABBREVIATIONS[normalized] || typeVoie;
}

export function expandTypeVoie(abbreviation: string): string {
  const normalized = removeAccents(abbreviation.toLowerCase().trim());
  return REVERSED_ABBREVIATIONS[normalized] || abbreviation;
}

export function normalizeStreetName(street: string): string {
  if (!street) return '';

  let normalized = street.toLowerCase();
  normalized = removeAccents(normalized);
  normalized = removePunctuation(normalized);

  Object.entries(TYPE_VOIE_ABBREVIATIONS).forEach(([full, abbr]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'g');
    normalized = normalized.replace(regex, abbr);
  });

  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

export function parseAddress(
  adresse: string,
  numeroVoie?: string,
  typeVoie?: string,
  libelleVoie?: string,
  codeCommune?: string,
  commune?: string,
  codePostal?: string
): NormalizedAddress {
  let numero = numeroVoie || '';
  let type = typeVoie || '';
  let nomVoie = libelleVoie || '';

  if (!numero || !type || !nomVoie) {
    const tokens = adresse.split(/\s+/);

    if (!numero && tokens.length > 0) {
      const firstToken = tokens[0];
      if (/^\d+[a-z]?$/i.test(firstToken)) {
        numero = firstToken;
        tokens.shift();
      }
    }

    const remainingText = tokens.join(' ');

    if (!type || !nomVoie) {
      const commonTypes = Object.keys(TYPE_VOIE_ABBREVIATIONS);
      const foundType = commonTypes.find(t =>
        remainingText.toLowerCase().startsWith(t + ' ')
      );

      if (foundType) {
        type = foundType;
        nomVoie = remainingText.substring(foundType.length).trim();
      } else {
        nomVoie = remainingText;
      }
    }
  }

  const typeAbbreviated = type ? abbreviateTypeVoie(type) : '';
  const nomVoieNormalise = normalizeStreetName(nomVoie);

  const adresseComplete = [numero, type, nomVoie]
    .filter(Boolean)
    .join(' ');

  return {
    numero: numero.trim(),
    typeVoie: typeAbbreviated,
    nomVoie: nomVoie.trim(),
    nomVoieNormalise,
    codeCommune: codeCommune || '',
    commune: commune || '',
    codePostal: codePostal || '',
    adresseComplete
  };
}

export function buildMatchingKeys(normalized: NormalizedAddress): {
  key1: string;
  key2: string;
} {
  const key1 = `${normalized.codeCommune}_${normalized.numero}_${normalized.nomVoieNormalise}`;
  const key2 = `${normalized.codePostal}_${normalized.nomVoieNormalise}`;

  return { key1, key2 };
}

export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

export function jaroWinklerSimilarity(str1: string, str2: string): number {
  const jaroSim = jaroSimilarity(str1, str2);

  let prefixLength = 0;
  const maxPrefixLength = 4;

  for (let i = 0; i < Math.min(str1.length, str2.length, maxPrefixLength); i++) {
    if (str1[i] === str2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  return jaroSim + (prefixLength * 0.1 * (1 - jaroSim));
}

function jaroSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  const str1Matches = new Array(str1.length).fill(false);
  const str2Matches = new Array(str2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < str1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, str2.length);

    for (let j = start; j < end; j++) {
      if (str2Matches[j] || str1[i] !== str2[j]) continue;
      str1Matches[i] = true;
      str2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < str1.length; i++) {
    if (!str1Matches[i]) continue;
    while (!str2Matches[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }

  return (
    (matches / str1.length +
      matches / str2.length +
      (matches - transpositions / 2) / matches) /
    3.0
  );
}

export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 100;
  if (!str1 || !str2) return 0;

  const normalized1 = normalizeStreetName(str1);
  const normalized2 = normalizeStreetName(str2);

  if (normalized1 === normalized2) return 100;

  const jaroWinkler = jaroWinklerSimilarity(normalized1, normalized2);

  return Math.round(jaroWinkler * 100);
}
