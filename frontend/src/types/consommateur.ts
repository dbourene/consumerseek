export interface Consommateur {
  id?: number;
  annee: number;
  code_iris: string;
  nom_iris: string;
  numero_voie: string;
  indice_repetition: string;
  type_voie: string;
  libelle_voie: string;
  adresse: string;
  nombre_sites: number;
  consommation_annuelle_mwh: number;
  code_grand_secteur: string;
  code_categorie_consommation: string;
  code_secteur_naf2: string;
  code_commune: string;
  nom_commune: string;
  code_epci: string;
  code_departement: string;
  code_region: string;
  tri_adresses: string;
  tranche_conso: string;
  categorie_activite: string;
  latitude?: number;
  longitude?: number;
  geocode_score?: number;
  geocode_source?: string;
  geocode_status?: string;
  source?: 'api' | 'manual';
  installation_recherche_id?: string;
}

export interface ConsoAggregate {
  code_commune?: string;
  nom_commune?: string;
  code_epci?: string;
  nom_epci?: string;
  code_departement?: string;
  nom_departement?: string;
  code_region?: string;
  nom_region?: string;
  code_iris?: string;
  nom_iris?: string;
  annee: number;
  tranche_conso: string;
  categorie_activite: string;
  nb_sites: number;
  conso_totale_mwh: number;
  latitude?: number;
  longitude?: number;
}

export interface AddressValidation {
  id: string;
  adresse: string;
  adresse_corrigee: string;
  latitude?: number;
  longitude?: number;
  score?: number;
  isValid: boolean;
  code_commune: string;
  nom_commune: string;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  label: string;
  score: number;
  extractedBrandName?: string;
}

export const TRANCHES_CONSO = [
  '[0-10]',
  ']10-50]',
  ']50-100]',
  ']100-250]',
  ']250-500]',
  ']500-1000]',
  ']1000-2000]',
  '>2000'
] as const;

export const CATEGORIES_ACTIVITE = [
  'Agriculture',
  'Industrie',
  'Tertiaire',
  'Residentiel',
  'Etablissement public',
  'Inconnu'
] as const;

export type TrancheConso = typeof TRANCHES_CONSO[number];
export type CategorieActivite = typeof CATEGORIES_ACTIVITE[number];
