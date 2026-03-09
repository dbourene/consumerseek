# Système d'Audit ENEDIS - Documentation d'Implémentation

## Vue d'ensemble

Ce document décrit l'implémentation complète du système d'audit ENEDIS pour la gestion des consentements et autorisations de communication des données de consommation électrique.

## Architecture

### 1. Schéma de base de données

#### Table `autorisations_communication` (enrichie)

**Nouveaux champs ajoutés :**

```sql
-- Informations du déclarant
declarant_role text CHECK (declarant_role IN ('TITULAIRE', 'REPRESENTANT_LEGAL', 'MANDATAIRE'))
declarant_nom text
declarant_prenom text
declarant_email text
declarant_telephone text

-- Gestion du cycle de vie
processing_stopped_at timestamptz
anonymization_scheduled_at timestamptz

-- Tracking des accès après révocation
access_after_revocation_flag boolean DEFAULT false
last_access_attempt_at timestamptz
access_blocked_count integer DEFAULT 0
```

**Triggers automatiques :**

1. **`handle_autorisation_revocation`** : Lors de la révocation d'un consentement :
   - `processing_stopped_at` = timestamp de révocation
   - `anonymization_scheduled_at` = timestamp de révocation + 24 mois

#### Table `prm`

**Nouveau champ :**

```sql
autorisation_id uuid REFERENCES autorisations_communication(id) ON DELETE SET NULL
```

**Relation :** Un PRM → Une autorisation | Une autorisation → Plusieurs PRMs

### 2. Formulaire Public d'Autorisation

**Fichier :** `src/components/PublicInvoiceUpload.tsx`

**Nouveautés :**

1. **Sélection du rôle du déclarant** (boutons radio) :
   - TITULAIRE : Titulaire du compteur
   - REPRESENTANT_LEGAL : Représentant légal du titulaire
   - MANDATAIRE : Mandataire agissant au nom du titulaire

2. **Workflow de création :**
   ```
   a. Récupération IP et User-Agent du client
   b. Insertion de l'autorisation avec rôle déclarant
   c. Récupération de l'autorisation_id
   d. Insertion des PRMs liés à cette autorisation
   e. Mise à jour des informations du contact
   f. Enrichissement SIRENE si professionnel
   ```

3. **Validation stricte :**
   - Le rôle du déclarant est obligatoire
   - Au moins un PRM doit être déclaré
   - Chaque PRM doit avoir 14 chiffres

### 3. Service de Vérification du Consentement

**Fichier :** `src/services/consentVerification.ts`

**Fonctions principales :**

#### `checkPRMConsent(prmNumero: string)`

Vérifie en temps réel si l'accès aux données d'un PRM est autorisé.

**Retour :**
```typescript
{
  isValid: boolean,        // true si accès autorisé
  isRevoked: boolean,      // true si consentement révoqué
  autorisationId?: string, // ID de l'autorisation
  revocationDate?: string, // Date de révocation
  errorMessage?: string    // Message d'erreur si applicable
}
```

**Comportement :**
- ✅ Accès autorisé → Met à jour `last_access_attempt_at`
- 🚫 Accès après révocation →
  - Flag `access_after_revocation_flag` = true
  - Incrémente `access_blocked_count`
  - Enregistre un événement `ACCESS_DENIED_AFTER_REVOCATION` dans `consent_events`
  - Bloque l'accès

#### `checkContactConsent(contactId: string)`

Vérifie si un contact a au moins une autorisation active.

**Usage recommandé :**

Avant tout accès aux données d'un PRM ou d'un contact :

```typescript
import { checkPRMConsent } from '../services/consentVerification';

const result = await checkPRMConsent('12345678901234');

if (!result.isValid) {
  alert(result.errorMessage);
  return; // Bloquer l'accès
}

// Continuer avec l'accès aux données
```

### 4. Export Audit Excel (3 onglets)

**Fichier :** `src/components/AuditEnedisExport.tsx`

**Accessible depuis :** Dashboard → "+ Afficher l'export audit ENEDIS"

#### Onglet 1 : REGISTRE_CONSENTEMENTS

**Contenu :**
- Liste complète de tous les consentements (actifs et révoqués)
- Informations du contact
- Informations du déclarant (rôle, nom, prénom, email, téléphone)
- Date d'autorisation, IP, User-Agent
- Versions RGPD et texte de consentement
- Liste des PRMs associés
- Statut du consentement (ACTIF / REVOQUE)
- Détails de révocation si applicable

**RPC Function :** `get_registre_consentements()`

#### Onglet 2 : HISTORIQUE_EVENEMENTS

**Contenu :**
- Journal chronologique de tous les événements liés aux consentements
- Types d'événements :
  - `CONSENT_GIVEN` : Consentement donné
  - `CONSENT_REVOKED` : Consentement révoqué
  - `ACCESS_DENIED_AFTER_REVOCATION` : Tentative d'accès après révocation
- Métadonnées associées à chaque événement
- Informations du contact
- Liste des PRMs

**RPC Function :** `get_historique_evenements()`

#### Onglet 3 : COHERENCE_CHRONOLOGIQUE

**Contenu :**
- Audit du cycle de vie du traitement des données
- Détection automatique d'anomalies :
  - ⚠️ Accès détecté après révocation
  - ⚠️ Révocation sans arrêt de traitement
  - ⚠️ Révocation sans planification d'anonymisation

**Champs trackés :**
- Date d'autorisation
- Premier accès aux données (NULL pour le moment, future intégration API ENEDIS)
- Date de révocation
- Date d'arrêt du traitement (auto: = date révocation)
- Date planifiée d'anonymisation (auto: révocation + 24 mois)
- Flag d'accès après révocation
- Dernière tentative d'accès
- Nombre d'accès bloqués

**Statuts de cohérence :**
- `CONSENTEMENT_ACTIF` : Autorisation active, aucune révocation
- `REVOCATION_TRAITEE` : Révocation correctement traitée
- `EN_ATTENTE_TRAITEMENT` : Révocation en attente de traitement

**RPC Function :** `get_coherence_chronologique()`

### 5. Migrations Supabase

**Fichiers créés :**

1. `enrich_autorisations_with_audit_fields.sql`
   - Ajoute les champs d'audit à `autorisations_communication`
   - Crée le trigger de révocation automatique

2. `add_autorisation_id_to_prm_table.sql`
   - Ajoute la foreign key `autorisation_id` à la table `prm`
   - Crée l'index pour les performances

3. `create_audit_export_functions.sql`
   - Crée les 3 fonctions RPC pour l'export Excel
   - Restreint l'accès aux utilisateurs authentifiés uniquement

## Conformité RGPD et Audit ENEDIS

### Principes respectés

✅ **Traçabilité complète** : Chaque consentement et événement est enregistré avec horodatage, IP, User-Agent

✅ **Rôle du déclarant** : Identification claire du rôle de la personne donnant le consentement

✅ **Révocation effective** :
- Arrêt immédiat du traitement
- Planification automatique de l'anonymisation (24 mois)
- Blocage en temps réel des accès

✅ **Détection d'anomalies** : Alertes automatiques sur les incohérences

✅ **Export audit** : Génération Excel conforme aux exigences ENEDIS

### Recommandations d'utilisation

1. **Avant tout accès aux données :**
   ```typescript
   const consent = await checkPRMConsent(prmNumero);
   if (!consent.isValid) {
     // Bloquer l'accès
     return;
   }
   ```

2. **Export régulier des audits :**
   - Mensuel pour les audits internes
   - À la demande pour les contrôles ENEDIS

3. **Surveillance des anomalies :**
   - Vérifier régulièrement l'onglet 3 (COHERENCE_CHRONOLOGIQUE)
   - Traiter immédiatement les alertes d'accès après révocation

## Évolutions Futures

### Intégration API ENEDIS

Lorsque l'intégration avec l'API ENEDIS sera effective :

1. **Modifier `enedis_api_calls` :**
   - Enregistrer chaque appel API
   - Lier à `autorisation_id` et `prm_numero`

2. **Mettre à jour `first_data_access_at` :**
   ```sql
   UPDATE autorisations_communication
   SET first_data_access_at = NOW()
   WHERE id = :autorisation_id
   AND first_data_access_at IS NULL;
   ```

3. **Vérifier le consentement avant chaque appel :**
   ```typescript
   const consent = await checkPRMConsent(prmNumero);
   if (!consent.isValid) {
     throw new Error('Consentement révoqué');
   }

   // Appel API ENEDIS
   const data = await enedisAPI.getData(prmNumero);

   // Logger l'appel
   await logEnedisAPICall(autorisation_id, prmNumero);
   ```

### Anonymisation automatique

Implémenter un job planifié (cron) qui :

1. Identifie les autorisations avec `anonymization_scheduled_at` < NOW()
2. Anonymise les données personnelles
3. Archive les données conformément aux exigences légales

## Tests

### Tests manuels recommandés

1. **Création d'autorisation :**
   - Tester les 3 rôles (TITULAIRE, REPRESENTANT_LEGAL, MANDATAIRE)
   - Vérifier l'enregistrement correct dans la BDD
   - Vérifier la liaison PRM ↔ Autorisation

2. **Révocation :**
   - Révoquer un consentement
   - Vérifier `processing_stopped_at` = timestamp révocation
   - Vérifier `anonymization_scheduled_at` = révocation + 24 mois

3. **Blocage d'accès après révocation :**
   - Révoquer un consentement
   - Tenter d'accéder aux données
   - Vérifier le blocage
   - Vérifier `access_after_revocation_flag` = true
   - Vérifier l'incrémentation de `access_blocked_count`

4. **Export Excel :**
   - Générer l'export
   - Vérifier les 3 onglets
   - Vérifier la cohérence des données

## Support

Pour toute question ou problème concernant le système d'audit ENEDIS, consultez :

- Ce document
- Les migrations dans `supabase/migrations/`
- Le code source dans `src/components/` et `src/services/`
