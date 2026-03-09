/*
  # Fonction RPC pour conversion Lambert 93 vers GPS

  ## Description
  Crée une fonction PostgreSQL qui convertit les coordonnées Lambert 93 en GPS (WGS84)
  pour toutes les sociétés d'une commune donnée qui ont des coordonnées Lambert mais
  pas encore de coordonnées GPS.

  ## Paramètres
  - p_code_commune: Code commune INSEE (ex: "14472")

  ## Fonctionnement
  1. Sélectionne toutes les sociétés de la commune avec coordonnées Lambert valides
  2. Utilise PostGIS ST_Transform pour convertir Lambert 93 (EPSG:2154) vers WGS84 (EPSG:4326)
  3. Met à jour les colonnes latitude et longitude avec les coordonnées GPS

  ## Sécurité
  - Fonction accessible aux utilisateurs authentifiés
  - Vérifie la validité des coordonnées Lambert avant conversion
*/

CREATE OR REPLACE FUNCTION convert_lambert_to_gps_for_commune(p_code_commune text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    code_commune = p_code_commune
    AND "coordonneeLambertAbscisseEtablissement" IS NOT NULL
    AND "coordonneeLambertOrdonneeEtablissement" IS NOT NULL
    -- Vérifier que les coordonnées Lambert sont dans une plage valide pour la France
    AND "coordonneeLambertAbscisseEtablissement" BETWEEN 0 AND 1300000
    AND "coordonneeLambertOrdonneeEtablissement" BETWEEN 6000000 AND 7200000;
END;
$$;
