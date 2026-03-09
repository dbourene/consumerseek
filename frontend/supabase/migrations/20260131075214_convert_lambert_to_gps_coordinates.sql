/*
  # Conversion des coordonnées Lambert 93 en GPS (WGS84)

  ## Problème
  L'API SIRENE fournit des coordonnées Lambert 93 (EPSG:2154) mais elles étaient
  stockées dans les colonnes latitude/longitude comme si c'étaient des coordonnées GPS.
  Cela plaçait les établissements au mauvais endroit géographiquement.

  ## Solution
  1. Activation de l'extension PostGIS si nécessaire
  2. Migration des données existantes :
     - Copie des coordonnées actuelles (Lambert) vers les colonnes dédiées
     - Conversion Lambert 93 → WGS84 avec PostGIS
     - Mise à jour des colonnes latitude/longitude avec les vraies coordonnées GPS

  ## Détails techniques
  - Système source : Lambert 93 (EPSG:2154) - projection française
  - Système cible : WGS84 (EPSG:4326) - coordonnées GPS standard
  - Outil : PostGIS ST_Transform
*/

-- Activer l'extension PostGIS si elle n'est pas déjà active
CREATE EXTENSION IF NOT EXISTS postgis;

-- Étape 1 : Sauvegarder les coordonnées actuelles (qui sont en Lambert) dans les colonnes dédiées
-- Seulement pour les lignes où les colonnes Lambert sont NULL
UPDATE societes
SET
  "coordonneeLambertAbscisseEtablissement" = longitude,
  "coordonneeLambertOrdonneeEtablissement" = latitude
WHERE
  longitude IS NOT NULL
  AND latitude IS NOT NULL
  AND "coordonneeLambertAbscisseEtablissement" IS NULL
  AND "coordonneeLambertOrdonneeEtablissement" IS NULL;

-- Étape 2 : Convertir les coordonnées Lambert 93 en GPS (WGS84)
-- et mettre à jour les colonnes latitude/longitude avec les vraies coordonnées GPS
UPDATE societes
SET
  longitude = ST_X(
    ST_Transform(
      ST_SetSRID(
        ST_MakePoint("coordonneeLambertAbscisseEtablissement", "coordonneeLambertOrdonneeEtablissement"),
        2154  -- Lambert 93 (EPSG:2154)
      ),
      4326  -- WGS84 (EPSG:4326)
    )
  ),
  latitude = ST_Y(
    ST_Transform(
      ST_SetSRID(
        ST_MakePoint("coordonneeLambertAbscisseEtablissement", "coordonneeLambertOrdonneeEtablissement"),
        2154  -- Lambert 93
      ),
      4326  -- WGS84
    )
  )
WHERE
  "coordonneeLambertAbscisseEtablissement" IS NOT NULL
  AND "coordonneeLambertOrdonneeEtablissement" IS NOT NULL
  -- Vérifier que les coordonnées Lambert sont dans une plage valide
  AND "coordonneeLambertAbscisseEtablissement" BETWEEN 0 AND 1300000
  AND "coordonneeLambertOrdonneeEtablissement" BETWEEN 6000000 AND 7200000;

-- Étape 3 : Marquer comme NULL les coordonnées GPS qui n'ont pas pu être converties
-- (coordonnées Lambert invalides ou hors limites)
UPDATE societes
SET
  latitude = NULL,
  longitude = NULL
WHERE
  "coordonneeLambertAbscisseEtablissement" IS NOT NULL
  AND "coordonneeLambertOrdonneeEtablissement" IS NOT NULL
  AND (
    "coordonneeLambertAbscisseEtablissement" NOT BETWEEN 0 AND 1300000
    OR "coordonneeLambertOrdonneeEtablissement" NOT BETWEEN 6000000 AND 7200000
  );
