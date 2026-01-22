export interface ParsedAddress {
  nomSociete: string | null;
  complementAdresse: string | null;
  adresseStandardisee: string;
  typeAdresseSpecifique: 'zone_activite' | 'lieu_dit' | 'societe' | 'station_technique' | 'standard';
  originalAddress: string;
}

const ZONE_ACTIVITE_PATTERNS = [
  /^(Z\.?I\.?|ZONE INDUSTRIELLE|ZAI|Z\.?A\.?I\.?|ZONE ARTISANALE|ZONE D'ACTIVITE|ZONE D ACTIVITE|PARC D'ACTIVITE|PARC D ACTIVITE|PARC D'ACTIVITES|PARC D ACTIVITES|Z\.?A\.?|ZONE ARTISANALE|ZONE COMMERCIALE|Z\.?C\.?|PARC INDUSTRIEL|PARC COMMERCIAL|TECHNOPOLE|TECHNOPARC)/i,
];

const LIEU_DIT_PATTERNS = [
  /^(LIEU DIT|LIEU-DIT|L\.?D\.?|LD)\s+/i,
];

const STATION_PATTERNS = [
  /^(STATION|STA\.?|POMP\.?|POMPAGE|TRAITEMENT DES EAUX|TRAITEMENT DE L'EAU|IRRG\.?|IRRIG\.?|IRRIGATION|ASSAINISSEMENT|EPURATION)/i,
];

const SOCIETE_PATTERNS = [
  /^(SA|SAS|SARL|EURL|SCI|SCEA|EARL|GAEC|GFA|SCM|SCP|SELARL|SELAFA|SELAS|SNC|SEP)\s+/i,
  /^(SOCIETE|SOC\.?|ETS|ETABLISSEMENT|ETABLISSEMENTS|ENTREPRISE)\s+/i,
  /^(HOTEL|RESTAURANT|SCIERIE|MENUISERIE|BOULANGERIE|PATISSERIE|BOUCHERIE|EPICERIE|SUPERMARCHE|HYPERMARCHE)\s+/i,
];

export function parseAddress(address: string): ParsedAddress {
  if (!address || address.trim() === '') {
    return {
      nomSociete: null,
      complementAdresse: null,
      adresseStandardisee: '',
      typeAdresseSpecifique: 'standard',
      originalAddress: address,
    };
  }

  const trimmedAddress = address.trim();
  let nomSociete: string | null = null;
  let complementAdresse: string | null = null;
  let adresseStandardisee = trimmedAddress;
  let typeAdresseSpecifique: ParsedAddress['typeAdresseSpecifique'] = 'standard';

  for (const pattern of ZONE_ACTIVITE_PATTERNS) {
    const match = trimmedAddress.match(pattern);
    if (match) {
      typeAdresseSpecifique = 'zone_activite';
      complementAdresse = match[1].trim();

      const reste = trimmedAddress.substring(match[0].length).trim();

      const parts = reste.split(/[-,]/);
      if (parts.length > 1) {
        const potentialZoneName = parts[0].trim();
        if (potentialZoneName.length > 3) {
          complementAdresse = `${complementAdresse} ${potentialZoneName}`;
          adresseStandardisee = parts.slice(1).join(',').trim();
        } else {
          adresseStandardisee = reste;
        }
      } else {
        adresseStandardisee = reste;
      }

      break;
    }
  }

  if (typeAdresseSpecifique === 'standard') {
    for (const pattern of LIEU_DIT_PATTERNS) {
      const match = trimmedAddress.match(pattern);
      if (match) {
        typeAdresseSpecifique = 'lieu_dit';
        complementAdresse = match[1].trim();

        const reste = trimmedAddress.substring(match[0].length).trim();

        const parts = reste.split(/[-,]/);
        if (parts.length > 0) {
          const lieuDitName = parts[0].trim();
          complementAdresse = `${complementAdresse} ${lieuDitName}`;
          if (parts.length > 1) {
            adresseStandardisee = parts.slice(1).join(',').trim();
          } else {
            adresseStandardisee = '';
          }
        }

        break;
      }
    }
  }

  if (typeAdresseSpecifique === 'standard') {
    for (const pattern of STATION_PATTERNS) {
      const match = trimmedAddress.match(pattern);
      if (match) {
        typeAdresseSpecifique = 'station_technique';

        const parts = trimmedAddress.split(/[-,]/);
        if (parts.length > 0) {
          nomSociete = parts[0].trim();
          if (parts.length > 1) {
            adresseStandardisee = parts.slice(1).join(',').trim();
          } else {
            adresseStandardisee = '';
          }
        }

        break;
      }
    }
  }

  if (typeAdresseSpecifique === 'standard') {
    for (const pattern of SOCIETE_PATTERNS) {
      const match = trimmedAddress.match(pattern);
      if (match) {
        typeAdresseSpecifique = 'societe';

        const parts = trimmedAddress.split(/[-,]/);
        if (parts.length > 0) {
          nomSociete = parts[0].trim();
          if (parts.length > 1) {
            adresseStandardisee = parts.slice(1).join(',').trim();
          } else {
            adresseStandardisee = '';
          }
        }

        break;
      }
    }
  }

  if (!adresseStandardisee && complementAdresse) {
    adresseStandardisee = complementAdresse;
  }

  return {
    nomSociete,
    complementAdresse,
    adresseStandardisee: adresseStandardisee || trimmedAddress,
    typeAdresseSpecifique,
    originalAddress: address,
  };
}

export function buildFullAddress(parsed: ParsedAddress, commune: string): string {
  const parts: string[] = [];

  if (parsed.nomSociete) {
    parts.push(parsed.nomSociete);
  }

  if (parsed.complementAdresse) {
    parts.push(parsed.complementAdresse);
  }

  if (parsed.adresseStandardisee && parsed.adresseStandardisee !== parsed.complementAdresse) {
    parts.push(parsed.adresseStandardisee);
  }

  parts.push(commune);

  return parts.join(', ');
}
