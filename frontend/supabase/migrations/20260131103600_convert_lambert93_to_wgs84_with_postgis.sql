/*
  # Conversion Lambert 93 vers WGS84 avec PostGIS

  ## Contexte
  Les coordonnées Lambert 93 (EPSG:2154) stockées dans les colonnes 
  coordonneeLambertAbscisse/Ordonnee doivent être converties en coordonnées 
  GPS WGS84 (EPSG:4326) pour les colonnes latitude/longitude.

  ## Système de coordonnées
  - Source : Lambert 93 (EPSG:2154) - coordonnées planes en mètres
  - Cible : WGS84 (EPSG:4326) - coordonnées géographiques en degrés décimaux

  ## Validation des coordonnées
  Coordonnées Lambert 93 valides pour la France métropolitaine :
  - X (abscisse) : entre 100 000 et 1 300 000 mètres
  - Y (ordonnée) : entre 6 000 000 et 7 200 000 mètres

  ## Méthode
  Utilisation de PostGIS ST_Transform pour une conversion précise et normalisée

  ## Impact
  Conversion des coordonnées Lambert 93 existantes vers GPS pour toutes les 
  sociétés ayant des coordonnées Lambert valides
*/

-- Conversion Lambert 93 → WGS84 pour toutes les sociétés avec coordonnées Lambert valides
UPDATE societes
SET 
  latitude = ST_Y(
    ST_Transform(
      ST_SetSRID(
        ST_Point(
          "coordonneeLambertAbscisseEtablissement",
          "coordonneeLambertOrdonneeEtablissement"
        ),
        2154
      ),
      4326
    )
  ),
  longitude = ST_X(
    ST_Transform(
      ST_SetSRID(
        ST_Point(
          "coordonneeLambertAbscisseEtablissement",
          "coordonneeLambertOrdonneeEtablissement"
        ),
        2154
      ),
      4326
    )
  )
WHERE "coordonneeLambertAbscisseEtablissement" IS NOT NULL
  AND "coordonneeLambertOrdonneeEtablissement" IS NOT NULL
  AND "coordonneeLambertAbscisseEtablissement" >= 100000
  AND "coordonneeLambertAbscisseEtablissement" <= 1300000
  AND "coordonneeLambertOrdonneeEtablissement" >= 6000000
  AND "coordonneeLambertOrdonneeEtablissement" <= 7200000;
