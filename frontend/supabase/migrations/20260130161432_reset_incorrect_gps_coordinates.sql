/*
  # Réinitialisation des coordonnées GPS incorrectes
  
  1. Problème identifié
    - La fonction de conversion Lambert 93 vers WGS84 contenait une erreur de calcul
    - Toutes les coordonnées GPS dans la table societes sont décalées de ~2-3° vers le nord
    - Les établissements apparaissent en Angleterre au lieu de la France
    
  2. Solution
    - La formule de conversion a été corrigée dans l'Edge Function sirene-search
    - Cette migration réinitialise toutes les coordonnées GPS incorrectes à NULL
    - Les coordonnées seront rechargées correctement lors du prochain chargement SIRENE
    
  3. Critères de détection des coordonnées incorrectes
    - Latitude > 50.5° (les coordonnées françaises devraient être entre 41° et 51°)
    - Cela correspond aux coordonnées calculées avec l'ancienne formule erronée
    
  4. Impact
    - ~30,000 établissements auront leurs coordonnées réinitialisées
    - Ils ne seront plus affichés sur la carte jusqu'au rechargement
    - Les autres données (SIRET, adresse, NAF, etc.) restent intactes
*/

-- Réinitialiser les coordonnées GPS incorrectes
UPDATE societes
SET 
  latitude = NULL,
  longitude = NULL,
  updated_at = now()
WHERE latitude IS NOT NULL 
  AND latitude > 50.5;

-- Afficher le résultat
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Coordonnées réinitialisées pour % établissements', updated_count;
END $$;
