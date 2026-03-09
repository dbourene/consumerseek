/*
  # Réinitialisation des coordonnées GPS incorrectes

  ## Contexte
  La migration précédente `fix_societes_gps_coordinates_from_lambert_columns` a copié 
  directement des valeurs Lambert 93 dans les colonnes latitude/longitude, ce qui est 
  mathématiquement incorrect.

  ## Problème identifié
  - Les colonnes coordonneeLambertAbscisse/Ordonnee contiennent des coordonnées Lambert 93 
    (EPSG:2154) en mètres
  - Ces valeurs ont été copiées directement dans latitude/longitude qui attendent du WGS84 
    (EPSG:4326) en degrés décimaux
  - Résultat : coordonnées pointant vers l'Angleterre au lieu de la France

  ## Solution
  1. Réinitialiser latitude/longitude à NULL pour les 58 133 sociétés concernées
  2. La conversion correcte Lambert93→WGS84 sera appliquée par le code avec proj4

  ## Impact
  - Les coordonnées GPS incorrectes sont supprimées
  - Les coordonnées Lambert 93 sources restent intactes
  - Une conversion correcte sera appliquée ensuite
*/

-- Réinitialiser les coordonnées GPS incorrectes
UPDATE societes
SET 
  latitude = NULL,
  longitude = NULL
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL;
