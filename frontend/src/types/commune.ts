export interface Commune {
  codgeo: string;
  nom_commune: string;
  dens7: number;
  libdens7: string;
  code_epci: string | null;
  geomgeo: GeoJSON.Geometry | null;
}

export interface ResultatRPC {
  commune_installation: Commune | null;
  rayon: number | null;
  communes_dans_rayon: Commune[];
}

export interface Coordonnees {
  latitude: number;
  longitude: number;
}
