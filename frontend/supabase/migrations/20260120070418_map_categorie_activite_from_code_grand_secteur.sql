/*
  # Mapping categorie_activite depuis code_grand_secteur

  ## Contexte
  L'API Enedis ne fournit pas le champ `categorie_dactivite_du_site`, mais fournit 
  `code_grand_secteur` avec les valeurs : AGRICULTURE, INDUSTRIE, TERTIAIRE, RESIDENTIEL, 
  SECTEUR PUBLIC, INCONNU.

  ## Changements
  1. Mise à jour de tous les consommateurs pour mapper code_grand_secteur vers categorie_activite
  2. Les catégories supportées sont maintenant :
     - Agriculture (depuis AGRICULTURE)
     - Industrie (depuis INDUSTRIE)
     - Tertiaire (depuis TERTIAIRE)
     - Residentiel (depuis RESIDENTIEL)
     - Secteur public (depuis SECTEUR PUBLIC)
     - Inconnu (pour toutes les autres valeurs)

  ## Note
  Cette migration corrige les données existantes qui avaient une categorie_activite vide.
  Les futurs imports depuis l'API feront ce mapping automatiquement.
*/

UPDATE consommateurs
SET categorie_activite = CASE
  WHEN code_grand_secteur = 'AGRICULTURE' THEN 'Agriculture'
  WHEN code_grand_secteur = 'INDUSTRIE' THEN 'Industrie'
  WHEN code_grand_secteur = 'TERTIAIRE' THEN 'Tertiaire'
  WHEN code_grand_secteur = 'RESIDENTIEL' THEN 'Residentiel'
  WHEN code_grand_secteur = 'SECTEUR PUBLIC' THEN 'Secteur public'
  ELSE 'Inconnu'
END
WHERE categorie_activite IS NULL OR categorie_activite = '';
