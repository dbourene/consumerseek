/*
  # Mapper 'Inconnu' vers 'Tertiaire' pour l'API entreprise

  ## Contexte
  L'API entreprise d'Enedis retourne des données pour des entreprises.
  Quand code_grand_secteur est NULL ou "Autres", il s'agit d'entreprises
  qui doivent être classées dans la catégorie Tertiaire par défaut.

  ## Logique de catégorisation complète
  Priorité 1: Si code_secteur_naf2 IN ('84','85','86','87','88') → 'Etablissement public'
  Priorité 2: Mapper depuis code_grand_secteur
    - AGRICULTURE → Agriculture
    - INDUSTRIE → Industrie
    - TERTIAIRE → Tertiaire
    - RESIDENTIEL → Residentiel
    - Autres/NULL → Tertiaire (API entreprise)

  ## Changements
  1. Mise à jour des consommateurs avec categorie_activite = 'Inconnu'
  2. Ces consommateurs deviennent 'Tertiaire' sauf s'ils sont des établissements publics
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
  -- API entreprise: Autres/NULL = Tertiaire
  ELSE 'Tertiaire'
END;
