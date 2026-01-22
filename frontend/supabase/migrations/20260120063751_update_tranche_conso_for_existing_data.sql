/*
  # Mise à jour automatique des tranches de consommation

  Ce script met à jour la colonne `tranche_conso` pour tous les consommateurs
  qui ont une valeur vide ou NULL en la calculant à partir de `consommation_annuelle_mwh`.

  Les tranches sont calculées selon les règles suivantes:
  - [0-10] : consommation <= 10 MWh
  - ]10-50] : 10 < consommation <= 50 MWh
  - ]50-100] : 50 < consommation <= 100 MWh
  - ]100-250] : 100 < consommation <= 250 MWh
  - ]250-500] : 250 < consommation <= 500 MWh
  - ]500-1000] : 500 < consommation <= 1000 MWh
  - ]1000-2000] : 1000 < consommation <= 2000 MWh
  - >2000 : consommation > 2000 MWh
*/

UPDATE consommateurs
SET tranche_conso = CASE
  WHEN consommation_annuelle_mwh <= 10 THEN '[0-10]'
  WHEN consommation_annuelle_mwh <= 50 THEN ']10-50]'
  WHEN consommation_annuelle_mwh <= 100 THEN ']50-100]'
  WHEN consommation_annuelle_mwh <= 250 THEN ']100-250]'
  WHEN consommation_annuelle_mwh <= 500 THEN ']250-500]'
  WHEN consommation_annuelle_mwh <= 1000 THEN ']500-1000]'
  WHEN consommation_annuelle_mwh <= 2000 THEN ']1000-2000]'
  ELSE '>2000'
END
WHERE tranche_conso IS NULL OR tranche_conso = '';
