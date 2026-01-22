/*
  # Remove unused materialized views

  1. Cleanup
    - Drop materialized view `conso_commune_annee_tranche_categorie`
    - Drop materialized view `conso_departement_annee_tranche_categorie`
    - Drop materialized view `conso_epci_annee_tranche_categorie`
  
  2. Notes
    - These views were never used in the application
    - All aggregations are currently done client-side in JavaScript
    - The spatial_ref_sys table is kept as it's required by PostGIS extension
*/

-- Drop materialized views if they exist
DROP MATERIALIZED VIEW IF EXISTS public.conso_commune_annee_tranche_categorie;
DROP MATERIALIZED VIEW IF EXISTS public.conso_departement_annee_tranche_categorie;
DROP MATERIALIZED VIEW IF EXISTS public.conso_epci_annee_tranche_categorie;
