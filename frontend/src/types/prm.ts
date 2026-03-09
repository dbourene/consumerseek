export interface PRM {
  id: string;
  contact_id: string;
  prm_numero?: string;
  entreprise?: string;
  titulaire_type?: 'particulier' | 'professionnel';
  titulaire_forme_juridique?: string;
  titulaire_adresse?: string;
  titulaire_code_postal?: string;
  titulaire_ville?: string;
  titulaire_siret?: string;
  titulaire_code_naf?: string;
  titulaire_civilite?: string;
  titulaire_prenom?: string;
  titulaire_nom?: string;
  declarant_role?: 'TITULAIRE' | 'REPRESENTANT_LEGAL' | 'MANDATAIRE';
  created_at: string;
  updated_at: string;
}
