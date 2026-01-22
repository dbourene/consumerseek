/*
  # Correction des rayons réglementaires selon la densité

  1. Modification
    - Met à jour la fonction `get_rayon_densite` avec les valeurs réglementaires officielles
    
  2. Valeurs réglementaires
    - Densités 1 et 2 (urbain dense) : 2 km
    - Densités 3 et 4 (urbain/péri-urbain) : 10 km
    - Densités 5, 6 et 7 (rural) : 20 km
*/

CREATE OR REPLACE FUNCTION get_rayon_densite(densite smallint)
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN densite IN (1, 2) THEN 2000
    WHEN densite IN (3, 4) THEN 10000
    WHEN densite IN (5, 6, 7) THEN 20000
    ELSE 10000
  END;
END;
$$;
