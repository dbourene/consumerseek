export function normalizeAddress(address: string): string {
  if (!address) return address;

  let normalized = address;

  normalized = normalized.trim();

  normalized = normalized.replace(/\s+/g, ' ');

  normalized = normalized.replace(/([A-ZÀ-Ý])([A-ZÀ-Ý]{2,})/g, (match) => {
    return match.charAt(0) + match.slice(1).toLowerCase();
  });

  normalized = normalized.replace(/\bDEL'/gi, "DE L'");
  normalized = normalized.replace(/\bDEL\b/gi, "DE L'");
  normalized = normalized.replace(/\bDES'/gi, "DES ");
  normalized = normalized.replace(/\bAL'/gi, "A L'");

  normalized = normalized.replace(/\b([AÀÂÄ])\s*L'/gi, "À L'");

  normalized = normalized.replace(/(\w)(L')/gi, '$1 $2');

  normalized = normalized.replace(/\s+,/g, ',');
  normalized = normalized.replace(/,\s*/g, ', ');

  const abbreviations: Record<string, string> = {
    'AV ': 'Avenue ',
    'BD ': 'Boulevard ',
    'CHE ': 'Chemin ',
    'IMP ': 'Impasse ',
    'PL ': 'Place ',
    'R ': 'Rue ',
    'RTE ': 'Route ',
    'ALL ': 'Allée ',
    'CRS ': 'Cours ',
    'QU ': 'Quai ',
    'SQ ': 'Square ',
    'ALLEE ': 'Allée ',
    'ST ': 'Saint ',
    'STE ': 'Sainte ',
  };

  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    normalized = normalized.replace(regex, full);
  }

  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.trim();

  return normalized;
}

export function detectAddressIssues(address: string): string[] {
  const issues: string[] = [];

  if (/([A-ZÀ-Ý])([A-ZÀ-Ý]{2,})/.test(address)) {
    issues.push('Tout en majuscules - normalisé');
  }

  if (/\w(L'|D')/.test(address)) {
    issues.push('Espace manquant avant apostrophe - corrigé');
  }

  if (/\s{2,}/.test(address)) {
    issues.push('Espaces multiples - corrigés');
  }

  if (/\b(AV|BD|CHE|IMP|PL|R|RTE|ALL|CRS|QU|SQ)\b/i.test(address)) {
    issues.push('Abréviation détectée - développée');
  }

  return issues;
}
