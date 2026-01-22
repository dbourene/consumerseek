export interface Installation {
  id: string;
  nom: string;
  puissance_kWc: number | null;
  injection_MWh: number | null;
  latitude: number;
  longitude: number;
  commune: string;
  created_at: string;
}

export interface ActiveInstallation extends Installation {
  rayon?: number;
  marge?: number;
}
