# Guide d'enrichissement SIRENE

Ce guide explique comment utiliser le module de rapprochement avec l'API SIRENE de l'INSEE pour enrichir vos données de consommateurs avec les informations officielles des entreprises françaises.

## Vue d'ensemble

Le module de rapprochement SIRENE permet de :
- **Identifier automatiquement** les entreprises correspondant à vos consommateurs
- **Enrichir les données** avec les informations officielles (SIREN, SIRET, raison sociale, code NAF complet)
- **Valider la cohérence** des données via un scoring intelligent
- **Gérer les correspondances** avec une interface de validation manuelle

## Prérequis

Le module fonctionne en **deux modes** :

### Mode Public (par défaut)
- ✅ Aucune configuration requise
- ✅ Utilise l'API SIRENE V3 publique en données ouvertes
- ⚠️ Rate limiting strict de l'API INSEE (limitée pour usage intensif)

### Mode Authentifié (recommandé pour usage intensif)
- ✅ Quotas plus élevés
- ✅ Moins de limitations de débit
- ✅ Meilleure stabilité pour traiter de gros volumes

**Configuration requise :**

Si vous avez déjà configuré les secrets Supabase suivants, le module utilisera automatiquement le mode authentifié :
- `INSEE_CLIENT_ID` : votre Consumer Key INSEE
- `INSEE_CLIENT_SECRET` : votre Consumer Secret INSEE

**Pour obtenir vos credentials :**
1. Créez un compte sur [api.insee.fr](https://api.insee.fr/catalogue/)
2. Créez une nouvelle application
3. Souscrivez à l'API "Sirene - données ouvertes"
4. Configurez les secrets dans Supabase (Project Settings > Edge Functions > Secrets)

Le module détecte automatiquement si les credentials sont disponibles et bascule entre les deux modes sans intervention.

## Architecture du système

### 1. Base de données

Les nouvelles colonnes suivantes ont été ajoutées à la table `consommateurs` :

**Identification entreprise :**
- `siren` : Numéro SIREN (9 chiffres)
- `siret` : Numéro SIRET (14 chiffres)
- `nom_entreprise` : Raison sociale

**Adresse INSEE :**
- `adresse_insee` : Adresse complète selon l'INSEE
- `code_postal_insee` : Code postal
- `commune_insee` : Nom de la commune

**Activité :**
- `code_naf` : Code NAF complet (ex: 01.11Z)
- `intitule_naf` : Libellé du code NAF

**Métadonnées de rapprochement :**
- `sirene_matched_at` : Date du rapprochement
- `sirene_match_score` : Score de confiance (0-100)
- `sirene_match_method` : Méthode utilisée
- `sirene_validated` : Validation manuelle
- `sirene_notes` : Notes

### 2. Edge Function : sirene-search

L'Edge Function `sirene-search` gère la communication sécurisée avec l'API SIRENE :

- Authentification OAuth2 automatique
- Recherche par adresse, commune, code postal, code NAF
- Filtrage des établissements actifs
- Limite de 20 résultats par recherche

### 3. Service de rapprochement intelligent

Le service `sireneMatching.ts` implémente un algorithme de scoring sophistiqué :

#### Score de similarité d'adresse (50% du score total)
- Utilise la distance de Levenshtein
- Normalise les adresses (minuscules, sans ponctuation)
- Score de 0 à 100%

#### Score de cohérence NAF (30% du score total)
- 100% si codes NAF identiques
- 70% si même section NAF (2 premiers caractères)
- 40% si même division NAF (1er caractère)
- 0% sinon

#### Score de cohérence consommation (20% du score total)
- Compare la consommation annuelle avec les moyennes par secteur d'activité
- Base de données de consommations typiques pour 96 sections NAF
- Prend en compte les fourchettes min/max par secteur
- Score élevé si dans la fourchette attendue

**Score global :** Moyenne pondérée des trois scores

### 4. Interface utilisateur

Le composant `SireneMatching` offre :
- Lancement du rapprochement sur les données filtrées
- Barre de progression en temps réel
- Tableau des résultats avec scores détaillés
- Panneau de détails pour chaque correspondance
- Actions de validation/rejet

## Utilisation

### 1. Accès au module

Dans le Dashboard, cliquez sur le bouton **"Rapprochement SIRENE"** dans le header.

### 2. Filtrer les données

Avant de lancer le rapprochement :
1. Utilisez les filtres habituels (tranches de consommation, catégories d'activité)
2. Activez le filtre circulaire si nécessaire
3. Vérifiez le nombre de consommateurs affichés

### 3. Lancer le rapprochement

1. Cliquez sur **"Lancer le rapprochement"**
2. Le système analyse chaque consommateur (environ 100ms par consommateur)
3. Seuls les matchs avec un score ≥ 50% sont affichés
4. Les résultats sont triés par score décroissant

### 4. Valider les correspondances

Pour chaque résultat :

**Dans le tableau :**
- Vérifiez le score global et les détails (adresse, NAF, consommation)
- Cliquez sur la ligne pour voir les détails complets

**Dans le panneau de détails :**
- Comparez les données consommateur avec les données SIRENE
- Analysez les scores détaillés
- Cliquez sur **"Valider"** pour enregistrer la correspondance
- Cliquez sur **"Rejeter"** pour l'ignorer

### 5. Interprétation des scores

| Score | Qualité | Action recommandée |
|-------|---------|-------------------|
| 80-100% | Excellent | Validation automatique possible |
| 60-79% | Bon | Vérification rapide recommandée |
| 50-59% | Moyen | Vérification approfondie nécessaire |
| < 50% | Faible | Non affiché (rejeté automatiquement) |

## Exemples d'utilisation

### Cas 1 : Entreprise industrielle

**Données consommateur :**
- Adresse : "15 RUE DE L'INDUSTRIE 69100 VILLEURBANNE"
- Code NAF : "25"
- Consommation : 3500 MWh/an

**Résultat SIRENE :**
- Entreprise : "METALLURGIE RHONE ALPES SA"
- SIRET : 12345678901234
- Adresse : "15 RUE DE L INDUSTRIE 69100 VILLEURBANNE"
- Code NAF : 25.11Z

**Scores :**
- Adresse : 98% (quasi identique)
- NAF : 100% (même section)
- Consommation : 85% (dans la fourchette typique)
- **Score global : 95%** → Validation recommandée

### Cas 2 : Commerce avec écart de consommation

**Données consommateur :**
- Adresse : "22 AVENUE COMMERCIALE 75001 PARIS"
- Code NAF : "47"
- Consommation : 2500 MWh/an

**Résultat SIRENE :**
- Entreprise : "SUPERMARCHE PARIS CENTER"
- Adresse : "22 AV COMMERCIALE 75001 PARIS"
- Code NAF : 47.11A

**Scores :**
- Adresse : 95%
- NAF : 100%
- Consommation : 45% (au-dessus de la fourchette typique pour ce secteur)
- **Score global : 82%** → Vérification recommandée

## Consommations moyennes par secteur

Le système utilise une base de données de consommations typiques pour 96 sections NAF. Exemples :

| Section NAF | Secteur | Consommation typique |
|------------|---------|---------------------|
| 10-12 | Industrie alimentaire | 2000-2500 MWh/an |
| 24 | Métallurgie | 8000 MWh/an |
| 35 | Électricité, gaz | 10000 MWh/an |
| 45-47 | Commerce | 300-600 MWh/an |
| 55-56 | Hébergement, restauration | 400-800 MWh/an |
| 84 | Administration publique | 1000 MWh/an |
| 85 | Enseignement | 800 MWh/an |
| 86 | Santé | 1500 MWh/an |

## Limitations et bonnes pratiques

### Limitations

1. **Limite de requêtes API :** L'API INSEE a des limites de débit. Une pause de 100ms est appliquée entre chaque recherche.

2. **Qualité des adresses :** Le rapprochement dépend de la qualité des adresses dans votre base de données et dans SIRENE.

3. **Établissements multiples :** Une entreprise peut avoir plusieurs établissements. Le système retourne le meilleur match mais il peut y avoir plusieurs correspondances possibles.

4. **Secteur informel :** Les auto-entrepreneurs et certaines activités peuvent ne pas être dans SIRENE.

### Bonnes pratiques

1. **Géocodage préalable :** Assurez-vous que vos adresses sont géocodées avant le rapprochement SIRENE.

2. **Validation progressive :** Commencez par valider les scores > 80%, puis descendez progressivement.

3. **Vérification manuelle :** Pour les scores < 80%, prenez le temps de vérifier les détails.

4. **Notes :** Utilisez le champ `sirene_notes` pour documenter les cas particuliers.

5. **Traitement par lots :** Traitez les données par petits lots (50-100 consommateurs) plutôt que tout d'un coup.

## Dépannage

### Erreur : "INSEE API credentials not configured"

**Solution :** Vérifiez que les secrets `INSEE_API_KEY` et `INSEE_API_SECRET` sont bien configurés dans Supabase.

### Erreur : "Failed to get INSEE token"

**Causes possibles :**
- Clés API invalides
- Clés expirées
- Problème de connexion à l'API INSEE

**Solution :** Vérifiez vos clés dans le portail INSEE et régénérez-les si nécessaire.

### Aucun résultat trouvé

**Causes possibles :**
- Adresse trop imprécise
- Établissement non présent dans SIRENE
- Établissement fermé (filtre actif uniquement)

**Solution :** Essayez de simplifier l'adresse ou de rechercher manuellement dans SIRENE.

### Scores trop faibles

**Causes possibles :**
- Adresses mal formatées
- Incohérence NAF
- Consommation atypique

**Solution :** Analysez les scores détaillés pour identifier le problème.

## Support et ressources

- **Documentation API SIRENE :** [api.insee.fr](https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=V3&provider=insee)
- **Nomenclature NAF :** [insee.fr/NAF](https://www.insee.fr/fr/information/2120875)
- **Base de données SIRENE :** [sirene.fr](https://www.sirene.fr/)

## Évolutions futures possibles

1. **Enrichissement automatique :** Rapprochement automatique pour les scores > 90%
2. **Apprentissage :** Amélioration du scoring basée sur les validations manuelles
3. **API Entreprise :** Intégration avec l'API Entreprise pour encore plus de données
4. **Historique :** Suivi de l'évolution des entreprises dans le temps
5. **Export :** Export des données enrichies pour analyse externe
