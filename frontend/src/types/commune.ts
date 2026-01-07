export interface Commune {
  id: string;
  nom: string;
  code: string;
  densite: number;
  latitude: number;
  longitude: number;
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
