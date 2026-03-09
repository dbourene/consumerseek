/*
  # Normaliser les noms de voie des consommateurs pour le matching

  1. Fonction de normalisation
    - Active l'extension unaccent si nécessaire
    - Crée une fonction PostgreSQL `normalize_street_name` qui reproduit la logique TypeScript
    - Supprime les accents, ponctuation, met en minuscules
    - Normalise les espaces
  
  2. Application
    - Calcule `nom_voie_normalise` pour tous les consommateurs où il est NULL
    - Utilise `libelle_voie` en priorité, sinon extrait de `adresse`
  
  3. Objectif
    - Permettre le rapprochement entre consommateurs et sociétés
    - Les deux tables doivent avoir des noms de voie normalisés de la même façon
*/

-- Activer l'extension unaccent
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Fonction de normalisation des noms de voie
CREATE OR REPLACE FUNCTION normalize_street_name(street_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized text;
BEGIN
  IF street_name IS NULL OR street_name = '' THEN
    RETURN NULL;
  END IF;

  -- Convertir en minuscules
  normalized := LOWER(street_name);
  
  -- Supprimer les accents
  normalized := unaccent(normalized);
  
  -- Supprimer la ponctuation et caractères spéciaux, remplacer par espaces
  normalized := regexp_replace(normalized, '[^\w\s]', ' ', 'g');
  
  -- Normaliser les espaces multiples en un seul espace
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  
  -- Trim les espaces de début et fin
  normalized := TRIM(normalized);
  
  RETURN normalized;
END;
$$;

-- Calculer nom_voie_normalise pour tous les consommateurs où c'est NULL
UPDATE consommateurs
SET nom_voie_normalise = normalize_street_name(
  COALESCE(libelle_voie, adresse)
)
WHERE nom_voie_normalise IS NULL
  AND (libelle_voie IS NOT NULL OR adresse IS NOT NULL);

-- Créer un index sur nom_voie_normalise pour améliorer les performances du matching
CREATE INDEX IF NOT EXISTS idx_consommateurs_nom_voie_normalise 
ON consommateurs(nom_voie_normalise) 
WHERE nom_voie_normalise IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consommateurs_matching_keys 
ON consommateurs(code_commune, nom_voie_normalise, code_secteur_naf2) 
WHERE nom_voie_normalise IS NOT NULL;

-- Index pour la table societes également
CREATE INDEX IF NOT EXISTS idx_societes_nom_voie_normalise 
ON societes(nom_voie_normalise) 
WHERE nom_voie_normalise IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_societes_matching_keys 
ON societes(code_commune, nom_voie_normalise, activite_principale_etablissement) 
WHERE nom_voie_normalise IS NOT NULL;