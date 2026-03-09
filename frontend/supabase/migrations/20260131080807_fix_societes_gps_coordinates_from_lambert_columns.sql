/*
  # Correction des coordonnées GPS dans la table societes

  ## Problème identifié
  L'API SIRENE retourne en fait des coordonnées GPS (pas Lambert 93) dans ses champs 
  `coordonneeLambertAbscisse` et `coordonneeLambertOrdonnee`. Les colonnes ont été mal nommées 
  dans l'API, mais contiennent bien des coordonnées GPS WGS84.

  ## Analyse des données
  - 110 005 sociétés au total
  - 58 133 ont des coordonnées GPS stockées dans les mauvaises colonnes
  - Les valeurs sont : X entre 51.8-52.3 et Y entre -0.97 à -0.24
  - Ces plages correspondent à des coordonnées GPS du nord-ouest de la France

  ## Mapping constaté (inhabituel)
  - coordonneeLambertAbscisseEtablissement (X) contient en fait la LATITUDE
  - coordonneeLambertOrdonneeEtablissement (Y) contient en fait la LONGITUDE

  ## Solution
  Copier les coordonnées des colonnes "Lambert" vers les vraies colonnes GPS :
  - coordonneeLambertAbscisseEtablissement → latitude
  - coordonneeLambertOrdonneeEtablissement → longitude

  ## Impact
  - 58 133 établissements auront leurs coordonnées GPS corrigées
  - Le matching géographique pourra fonctionner correctement
  - Les futurs chargements devront aussi être corrigés
*/

-- Copier les coordonnées GPS depuis les colonnes "Lambert" mal nommées
UPDATE societes
SET 
  latitude = "coordonneeLambertAbscisseEtablissement",
  longitude = "coordonneeLambertOrdonneeEtablissement"
WHERE "coordonneeLambertAbscisseEtablissement" IS NOT NULL
  AND "coordonneeLambertOrdonneeEtablissement" IS NOT NULL;
