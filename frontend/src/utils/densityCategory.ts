/**
 * Détermine le rayon réglementaire en mètres selon la densité de la commune
 * - Densités 1 et 2 (urbain dense) : 2 km
 * - Densités 3 et 4 (urbain/péri-urbain) : 10 km
 * - Densités 5, 6 et 7 (rural) : 20 km
 */
export function getRayonReglementaire(densite: number): number {
  if (densite === 1 || densite === 2) {
    return 2000;
  } else if (densite === 3 || densite === 4) {
    return 10000;
  } else {
    return 20000;
  }
}

/**
 * Détermine la catégorie de densité (utilisée pour comparer les restrictions)
 * - Catégorie 1 : Densités 1-2 (rayon 2km) - la plus restrictive
 * - Catégorie 2 : Densités 3-4 (rayon 10km)
 * - Catégorie 3 : Densités 5-6-7 (rayon 20km) - la moins restrictive
 */
export function getCategorieReglementaire(densite: number): number {
  if (densite === 1 || densite === 2) {
    return 1;
  } else if (densite === 3 || densite === 4) {
    return 2;
  } else {
    return 3;
  }
}

/**
 * Vérifie si une catégorie est plus restrictive qu'une autre
 * Une catégorie avec un numéro plus petit est plus restrictive
 */
export function estCategorieRestrictive(
  categorieCommune: number,
  categorieInstallation: number
): boolean {
  return categorieCommune < categorieInstallation;
}
