/*
  # Identification des établissements publics par code NAF2

  ## Contexte
  Les établissements publics doivent être identifiés spécifiquement par leur code NAF2
  plutôt que par le code_grand_secteur générique.

  ## Codes NAF2 pour établissements publics
  - 84: Administration publique et défense; sécurité sociale obligatoire
  - 85: Enseignement
  - 86: Activités pour la santé humaine
  - 87: Hébergement médico-social et social
  - 88: Action sociale sans hébergement

  ## Logique de catégorisation
  Priorité 1: Si code_secteur_naf2 IN ('84','85','86','87','88') → 'Etablissement public'
  Priorité 2: Sinon, mapper depuis code_grand_secteur
    - AGRICULTURE → Agriculture
    - INDUSTRIE → Industrie
    - TERTIAIRE → Tertiaire
    - RESIDENTIEL → Residentiel
    - Autres → Inconnu

  ## Changements
  1. Mise à jour de tous les consommateurs existants selon cette logique
  2. Les futurs imports depuis l'API appliqueront automatiquement cette règle
*/

UPDATE consommateurs
SET categorie_activite = CASE
  -- Priorité 1: Établissements publics identifiés par code NAF2
  WHEN code_secteur_naf2 IN ('84', '85', '86', '87', '88') THEN 'Etablissement public'
  -- Priorité 2: Mapping depuis code_grand_secteur
  WHEN code_grand_secteur = 'AGRICULTURE' THEN 'Agriculture'
  WHEN code_grand_secteur = 'INDUSTRIE' THEN 'Industrie'
  WHEN code_grand_secteur = 'TERTIAIRE' THEN 'Tertiaire'
  WHEN code_grand_secteur = 'RESIDENTIEL' THEN 'Residentiel'
  ELSE 'Inconnu'
END;
