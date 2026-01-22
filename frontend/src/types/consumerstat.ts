export interface Contact {
  id: string;
  user_id: string;
  consommateur_id?: number;
  entreprise: string;

  // Contact 1
  contact1_civilite?: string;
  contact1_nom: string;
  contact1_prenom: string;
  contact1_mail1: string;
  contact1_mail2?: string;
  contact1_telfix?: string;
  contact1_telportable?: string;
  contact1_fonction?: string;

  // Contact 2
  contact2_civilite?: string;
  contact2_nom?: string;
  contact2_prenom?: string;
  contact2_mail1?: string;
  contact2_mail2?: string;
  contact2_telfix?: string;
  contact2_telportable?: string;
  contact2_fonction?: string;

  created_at: string;
  updated_at: string;
}

export interface InvitationFacture {
  id: string;
  contact_id: string;
  token: string;
  email_destinataire: string;
  statut: 'envoyé' | 'ouvert' | 'complété' | 'expiré';
  date_envoi: string;
  date_expiration: string;
  date_ouverture?: string;
  message_personnalise?: string;
  nb_factures_deposees: number;
  created_at: string;
}

export interface Facture {
  id: string;
  invitation_id?: string;
  contact_id: string;
  consommateur_id?: number;
  user_id: string;

  // File metadata
  fichier_path: string;
  fichier_nom: string;
  fichier_taille: number;
  fichier_hash?: string;
  bucket_id: string;
  date_upload: string;

  // Extraction status
  statut_extraction: 'en_attente' | 'en_cours' | 'extraite' | 'validée' | 'erreur';
  date_extraction?: string;
  confiance_globale?: number;
  necessite_validation: boolean;

  // Consumer identification
  nom_commune?: string;
  code_departement?: string;
  code_naf?: string;
  code_naf2?: string;
  tranche_conso?: string;
  categorie_activite?: string;
  pdl?: string;

  // Billing period and supplier
  annee?: number;
  periode_debut?: string;
  periode_fin?: string;
  fournisseur?: string;
  version_tarif?: string;
  type_compteur?: string;

  // Power subscription
  puissance_souscrite_kva?: number;
  temporalite?: string;

  // Unit tariffs (€/kWh)
  tarif_base_parkwh?: number;
  tarif_hp_parkwh?: number;
  tarif_hc_parkwh?: number;
  tarif_hph_parkwh?: number;
  tarif_hch_parkwh?: number;
  tarif_hpb_parkwh?: number;
  tarif_hcb_parkwh?: number;
  tarif_pointe_parkwh?: number;

  // Consumption (kWh)
  conso_totale?: number;
  conso_base?: number;
  conso_hp?: number;
  conso_hc?: number;
  conso_hph?: number;
  conso_hch?: number;
  conso_hpb?: number;
  conso_hcb?: number;
  conso_pointe?: number;

  // Network and taxes
  tarif_abonnement?: number;
  tarif_accise_parkwh?: number;
  tarif_acheminement_total?: number;
  tarif_cta_total?: number;
  tarif_cta_unitaire?: number;

  // Total amounts
  montant_fourniture_ht?: number;
  montant_acheminement_ht?: number;
  montant_arenh?: number;
  montant_taxes_total?: number;
  prix_total_ht?: number;
  prix_total_ttc?: number;

  // Business intelligence
  contient_arenh: boolean;
  contient_turpe: boolean;

  // Coherence checks
  coherence_prix_unitaire?: boolean;
  coherence_periode?: boolean;
  coherence_puissance?: boolean;
  alertes_coherence?: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface ValidationFacture {
  id: string;
  facture_id: string;
  user_id: string;
  date_validation: string;
  temps_validation_secondes?: number;

  // Validated data
  fournisseur: string;
  pdl?: string;
  periode_debut: string;
  periode_fin: string;
  nom_commune?: string;
  code_departement?: string;
  puissance_souscrite_kva?: number;
  temporalite?: string;
  type_compteur?: string;
  version_tarif?: string;

  // Validated tariffs
  tarif_base_parkwh?: number;
  tarif_hp_parkwh?: number;
  tarif_hc_parkwh?: number;
  tarif_hph_parkwh?: number;
  tarif_hch_parkwh?: number;
  tarif_hpb_parkwh?: number;
  tarif_hcb_parkwh?: number;
  tarif_pointe_parkwh?: number;

  // Validated consumption
  conso_totale: number;
  conso_base?: number;
  conso_hp?: number;
  conso_hc?: number;
  conso_hph?: number;
  conso_hch?: number;
  conso_hpb?: number;
  conso_hcb?: number;
  conso_pointe?: number;

  // Validated costs
  tarif_abonnement?: number;
  tarif_accise_parkwh?: number;
  tarif_acheminement_total?: number;
  tarif_cta_total?: number;
  tarif_cta_unitaire?: number;
  montant_fourniture_ht?: number;
  montant_acheminement_ht?: number;
  montant_arenh?: number;
  montant_taxes_total?: number;
  prix_total_ht: number;
  prix_total_ttc: number;

  // Business intelligence
  contient_arenh: boolean;
  montant_arenh_detail?: number;
  contient_turpe: boolean;
  type_tarif?: string;

  // ML preparation
  utilise_pour_training: boolean;
  qualite_ground_truth: 'haute' | 'moyenne' | 'faible';
  notes_validation?: string;

  created_at: string;
}

export interface PatternGlobal {
  id: string;
  type: 'date' | 'montant' | 'kwh' | 'puissance' | 'pdl' | 'fournisseur' | 'tarif' | 'autre';
  regex: string;
  description: string;
  priorite: number;
  actif: boolean;
  exemples?: Record<string, unknown>;
  created_at: string;
}

export interface PatternFournisseur {
  id: string;
  nom_fournisseur: string;
  alias_detection: string[];
  template_structure?: Record<string, unknown>;
  regex_specifiques?: Record<string, unknown>;
  intelligence_metier?: Record<string, unknown>;
  confiance_moyenne: number;
  nb_utilisations: number;
  derniere_utilisation?: string;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegleCoherenceMetier {
  id: string;
  nom_regle: string;
  description: string;
  type: 'calcul' | 'plage' | 'obligatoire_si' | 'format' | 'logique';
  formule: Record<string, unknown>;
  severite: 'erreur' | 'avertissement' | 'info';
  actif: boolean;
  ordre_execution: number;
  created_at: string;
}

export interface AlerteCoherence {
  regle: string;
  severite: 'erreur' | 'avertissement' | 'info';
  message: string;
  champs_concernes: string[];
  valeur_attendue?: string | number;
  valeur_trouvee?: string | number;
}
