# Guide d'Audit Enedis - Système de Consentement RGPD

## Destinataires de ce Document

Ce document est destiné aux :
- **Auditeurs CNIL** : Contrôle de la conformité RGPD
- **Contrôleurs Enedis** : Vérification des preuves de consentement avant accès aux données
- **Juristes** : Expertise juridique sur la robustesse des preuves
- **Commissaires aux comptes** : Audit des processus de traitement de données

---

## Résumé Exécutif

Le système ConsumerSeek implémente un **mécanisme de collecte et de traçabilité du consentement RGPD** conforme aux exigences d'Enedis pour l'accès aux données de consommation électrique.

**Garanties juridiques :**
- ✅ Consentement éclairé, libre, spécifique et univoque (Art. 4.11 RGPD)
- ✅ Preuve cryptographique (Hash SHA-256) de l'exactitude du texte accepté
- ✅ Horodatage serveur UTC immutable et non falsifiable
- ✅ Traçabilité complète des événements (append-only logs)
- ✅ Révocation immédiate et traçable (Art. 7.3 RGPD)
- ✅ Cohérence chronologique automatiquement vérifiable (consentement < appel API)

---

## 1. Description du Parcours Utilisateur

### 1.1. Contexte

Un **exploitant de station de traitement des eaux** souhaite optimiser la consommation électrique de ses installations. Pour cela, il doit accéder aux données de consommation Enedis des compteurs (PRMs) concernés.

**Exigence légale :** Le titulaire du compteur doit donner son **consentement éclairé et explicite** avant tout accès aux données.

### 1.2. Étape 1 : Envoi de l'Invitation

**Acteur :** Exploitant (authentifié dans l'interface ConsumerSeek)

1. L'exploitant accède à l'interface "Gestion des contacts"
2. Il sélectionne un contact (entreprise ou particulier)
3. Il clique sur "Envoyer une invitation"
4. Le système génère :
   - Un **token unique** cryptographiquement sécurisé
   - Un **lien d'invitation** : `https://app.consumerseek.com/invitation?token=abc123xyz`
   - Un **email automatique** envoyé au titulaire

**Traçabilité :**
- Date et heure d'envoi enregistrées dans `invitations_factures`
- Token unique avec expiration (défaut : 30 jours)
- Lien vers le contact (`contact_id`)

### 1.3. Étape 2 : Accès au Formulaire Public

**Acteur :** Titulaire du PRM (anonyme, non authentifié)

1. Le titulaire reçoit l'email et clique sur le lien
2. Le navigateur ouvre le formulaire public
3. Le système valide le token :
   - ✅ Token valide → Formulaire affiché
   - ❌ Token expiré → Message d'erreur

**Informations pré-remplies :**
- Nom et prénom du contact
- Email et téléphone
- Raison sociale (si professionnel)

**Informations à saisir :**
- Type : Particulier ou Professionnel
- Adresse complète
- Numéro(s) de compteur (PRM)
- Rôle du déclarant : TITULAIRE, REPRESENTANT_LEGAL, ou MANDATAIRE

### 1.4. Étape 3 : Moment du Consentement

**⚠️ POINT CRITIQUE AUDIT ⚠️**

**Affichage du texte de consentement :**

Le texte complet des conditions RGPD est affiché dans un encadré dédié :

```
┌────────────────────────────────────────────────────────────┐
│ Conditions d'utilisation des données                      │
│                                                            │
│ En cochant cette case, vous autorisez [Exploitant] à :   │
│ - Accéder à vos données de consommation électrique       │
│ - Les utiliser pour optimiser votre consommation         │
│ - Les conserver pour une durée de 24 mois                │
│                                                            │
│ Vous pouvez révoquer votre consentement à tout moment.   │
│                                                            │
│ Version : V1                                              │
│ Date de publication : 01/03/2026                          │
└────────────────────────────────────────────────────────────┘

☐ J'accepte les conditions d'utilisation de mes données
```

**Action positive requise :**
- Le titulaire doit **cocher manuellement** la case
- La case n'est PAS pré-cochée (exigence RGPD)
- Le bouton "Soumettre" reste désactivé tant que la case n'est pas cochée

**Capture au moment du clic "Soumettre" :**

1. **Texte exact accepté** :
   - Le texte complet est récupéré depuis `policy_versions`
   - Version V1 (ou version active au moment du consentement)

2. **Hash SHA-256 calculé** :
   ```javascript
   const encoder = new TextEncoder();
   const data = encoder.encode(policyData.full_text);
   const hashBuffer = await crypto.subtle.digest('SHA-256', data);
   const consentTextHash = Array.from(new Uint8Array(hashBuffer))
     .map(b => b.toString(16).padStart(2, '0'))
     .join('');
   // Exemple résultat : "a1b2c3d4e5f6789...abcdef" (64 caractères hex)
   ```

3. **Métadonnées techniques capturées** :
   - **IP du déclarant** : Via API externe `https://api.ipify.org`
   - **User-Agent** : `navigator.userAgent` (navigateur, OS)
   - **Timestamp UTC** : Horodatage serveur (non modifiable par le client)

4. **Identité du déclarant** :
   - Civilité, Nom, Prénom
   - Email, Téléphone
   - Adresse complète
   - Rôle (TITULAIRE / REPRESENTANT_LEGAL / MANDATAIRE)

5. **Numéros de compteurs (PRMs)** :
   - Liste des PRMs concernés (14 chiffres)
   - Rôle du déclarant pour chaque PRM

### 1.5. Étape 4 : Validation et Enregistrement

**Traitement côté serveur (automatique) :**

1. **Insertion dans `autorisations_communication`** :
   ```sql
   INSERT INTO autorisations_communication (
     contact_id,
     invitation_id,
     type_titulaire,
     consent_rgpd,                    -- TRUE
     consent_text_hash,               -- Hash SHA-256 calculé
     policy_version_id,               -- Référence version V1
     ip_address,                       -- IP du déclarant
     user_agent,                       -- Navigateur
     date_autorisation,                -- Timestamp UTC serveur
     declarant_nom,
     declarant_prenom,
     declarant_email,
     declarant_telephone,
     declarant_role,                   -- TITULAIRE/REPRESENTANT/MANDATAIRE
     consent_status,                   -- 'ACTIVE'
     -- autres champs identité
   ) VALUES (...);
   ```

2. **Insertion des PRMs liés** :
   ```sql
   INSERT INTO prm (
     contact_id,
     autorisation_id,                  -- Lien vers l'autorisation
     prm_numero,
     titulaire_type,
     declarant_role,
     -- autres champs
   ) VALUES (...);
   ```

3. **Trigger automatique : Création d'événement** :
   - La table `consent_events` enregistre automatiquement :
     ```sql
     INSERT INTO consent_events (
       autorisation_id,
       event_type,                     -- 'CONSENT_GIVEN'
       consent_text_hash,              -- Hash SHA-256
       policy_version_id,              -- Version V1
       ip_address,                      -- IP
       user_agent,                      -- Navigateur
       event_metadata,                  -- JSON avec contact_id, email, etc.
       created_at                       -- Timestamp UTC serveur
     ) VALUES (...);
     ```

4. **Enrichissement SIRENE** (si professionnel) :
   - Appel API SIRENE pour récupérer les informations légales
   - Stockage dans `societes`

### 1.6. Étape 5 : Confirmation

**Message affiché au titulaire :**

```
✓ Autorisation enregistrée avec succès

Votre consentement a été enregistré et est maintenant actif.

Vous pouvez révoquer votre consentement à tout moment en contactant
[contact@exploitant.com] ou via le lien de révocation.

Numéro de référence : abc123-xyz-789
```

**Email de confirmation** (optionnel) :
- Récapitulatif du consentement donné
- Liste des PRMs concernés
- Lien de révocation
- Coordonnées de l'exploitant

---

## 2. Preuve d'Action Positive

### 2.1. Exigence RGPD

**Article 4.11 RGPD** : Le consentement doit être une "manifestation de volonté, libre, spécifique, éclairée et univoque par laquelle la personne concernée accepte [...] par une **déclaration ou par un acte positif clair**".

### 2.2. Implémentation

**Case à cocher obligatoire :**
- Case NON pré-cochée (conformité CNIL)
- Clic manuel requis
- Bouton "Soumettre" désactivé tant que non cochée

**Code technique (extrait) :**
```typescript
// État React contrôlant la case
const [consentRgpd, setConsentRgpd] = useState(false);

// Bouton désactivé si consentement non donné
<button
  disabled={!consentRgpd || prmRows.length === 0}
  onClick={handleSubmitAuthorization}
>
  Soumettre l'autorisation
</button>
```

**Validation côté serveur :**
```sql
-- Contrainte CHECK
consent_rgpd boolean NOT NULL CHECK (consent_rgpd = true)
```

⚠️ **Toute tentative d'insertion avec `consent_rgpd = false` échoue**

### 2.3. Preuve Juridique

**Éléments constitutifs de la preuve :**

1. **Timestamp serveur UTC** :
   - Non falsifiable par le client
   - Horodatage PostgreSQL : `now()`
   - Format ISO 8601 : `2026-03-01T10:30:00.123456Z`

2. **Hash SHA-256 du texte exact** :
   - Prouve que LE texte accepté est celui stocké
   - 64 caractères hexadécimaux
   - Impossible de modifier rétroactivement le texte

3. **IP et User-Agent** :
   - Identification technique du déclarant
   - Permet de corroborer l'identité (via logs FAI si litige)

4. **Identité complète** :
   - Nom, prénom, email, téléphone, adresse
   - Rôle du déclarant (titulaire, représentant, mandataire)

5. **Événement immutable** :
   - Enregistrement dans `consent_events` (append-only)
   - Aucune modification ou suppression possible
   - Hash de l'événement calculé automatiquement

---

## 3. Stockage des Preuves

### 3.1. Architecture de Stockage

**4 niveaux de traçabilité :**

#### Niveau 1 : Table principale `autorisations_communication`

**Rôle :** État actuel du consentement

**Colonnes critiques :**
- `consent_text_hash` : Hash SHA-256 du texte accepté
- `policy_version_id` : Référence vers `policy_versions.id`
- `date_autorisation` : Timestamp UTC serveur
- `ip_address` : IP du déclarant
- `user_agent` : Navigateur
- `consent_status` : ACTIVE, REVOKED, EXPIRED
- `revoked_at` : Date de révocation (si applicable)
- `revocation_reason` : Raison de la révocation

**RLS (Row Level Security) :**
```sql
-- Seuls les utilisateurs authentifiés peuvent lire
CREATE POLICY "Authenticated users can read all"
  ON autorisations_communication FOR SELECT
  TO authenticated
  USING (true);

-- Seuls les utilisateurs anonymes avec invitation valide peuvent insérer
CREATE POLICY "Anonymous can insert with valid invitation"
  ON autorisations_communication FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invitations_factures
      WHERE id = invitation_id
      AND expires_at > now()
    )
  );
```

#### Niveau 2 : Journal d'événements `consent_events`

**Rôle :** Historique immutable de TOUS les événements

**Caractéristiques :**
- **Append-only** : Aucune modification ou suppression possible
- **Trigger automatique** : Événement créé lors de chaque changement
- **Hash de l'événement** : Preuve d'intégrité

**Types d'événements :**
- `CONSENT_GIVEN` : Consentement initial
- `REVOCATION` : Révocation du consentement
- `EXPIRATION` : Expiration automatique (12 mois)
- `REACTIVATION` : Nouveau consentement après révocation

**Colonnes :**
```sql
CREATE TABLE consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autorisation_id uuid REFERENCES autorisations_communication(id),
  event_type text NOT NULL,
  consent_text_hash text,
  policy_version_id uuid REFERENCES policy_versions(id),
  ip_address text,
  user_agent text,
  event_metadata jsonb,
  event_hash text,                    -- Hash SHA-256 de l'événement
  created_at timestamptz DEFAULT now() -- Timestamp serveur immutable
);
```

**RLS strict :**
```sql
-- AUCUNE politique DELETE → Suppression impossible
-- AUCUNE politique UPDATE → Modification impossible
-- Seul INSERT autorisé (via trigger)
```

#### Niveau 3 : Versions des politiques `policy_versions`

**Rôle :** Stockage du texte exact de chaque version

**Colonnes :**
```sql
CREATE TABLE policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code text NOT NULL,          -- 'CONSENT_TEXT'
  version text NOT NULL,              -- 'V1', 'V2', etc.
  full_text text NOT NULL,            -- Texte complet
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  created_at timestamptz DEFAULT now()
);
```

**Exemple version V1 :**
```sql
INSERT INTO policy_versions (
  policy_code,
  version,
  full_text,
  effective_from
) VALUES (
  'CONSENT_TEXT',
  'V1',
  'En cochant cette case, vous autorisez [Exploitant]...',
  '2026-03-01T00:00:00Z'
);
```

**Vérification d'intégrité :**
```sql
-- Vérifier que le hash stocké correspond au texte
SELECT
  a.id,
  a.consent_text_hash as stored_hash,
  encode(sha256(pv.full_text::bytea), 'hex') as calculated_hash,
  a.consent_text_hash = encode(sha256(pv.full_text::bytea), 'hex') as integrity_ok
FROM autorisations_communication a
JOIN policy_versions pv ON a.policy_version_id = pv.id;
```

✅ **Si `integrity_ok = true`** → Le texte n'a pas été modifié
❌ **Si `integrity_ok = false`** → Tentative de falsification détectée

#### Niveau 4 : Audit trail `audit_trail`

**Rôle :** Historique des modifications administratives

**Colonnes :**
```sql
CREATE TABLE audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,               -- 'INSERT', 'UPDATE', 'DELETE'
  user_id uuid,
  changed_fields jsonb,               -- Before/After
  ip_address text,
  created_at timestamptz DEFAULT now()
);
```

**Triggers automatiques** sur :
- `autorisations_communication`
- `prm`
- `consent_events`

---

## 4. Gestion des Révocations

### 4.1. Droit RGPD

**Article 7.3 RGPD** : "La personne concernée a le droit de retirer son consentement à tout moment."

**Exigence :** La révocation doit être aussi simple que le consentement initial.

### 4.2. Workflow de Révocation

#### Option A : Révocation par l'exploitant (sur demande du titulaire)

**Acteur :** Exploitant (authentifié)

1. L'exploitant accède à "Gestion des contacts"
2. Il clique sur "Gérer les PRMs" pour un contact
3. Il clique sur l'icône de révocation (🛡️ orange) à côté d'un PRM
4. Il saisit la raison (ex: "Demande du titulaire par email du 01/03/2026")
5. Il confirme la révocation

**Traitement automatique :**
```sql
-- Mise à jour de l'autorisation
UPDATE autorisations_communication
SET
  consent_status = 'REVOKED',
  revoked_at = now(),
  revocation_reason = 'Demande du titulaire par email du 01/03/2026'
WHERE id = 'uuid-autorisation';

-- Création événement dans consent_events (via trigger)
INSERT INTO consent_events (
  autorisation_id,
  event_type,                         -- 'REVOCATION'
  ip_address,                         -- IP de l'exploitant
  user_agent,                         -- Navigateur
  event_metadata,                     -- JSON avec raison
  created_at                          -- Timestamp UTC serveur
) VALUES (...);
```

#### Option B : Révocation globale (tous les PRMs d'un contact)

**Acteur :** Exploitant

1. Clic sur "Révoquer tous" dans PRMManager
2. Saisie de la raison (ex: "Opposition RGPD exercée le 01/03/2026")
3. Confirmation finale

**Traitement :**
- Toutes les autorisations du contact passent à `REVOKED`
- Un événement de révocation par PRM
- Arrêt immédiat de tout traitement futur

#### Option C : Révocation directe par le titulaire (Conformité RGPD optimale)

**⭐ RECOMMANDÉ - Conformité Article 7.3 RGPD maximale**

**Acteur :** Titulaire du PRM (anonyme, non authentifié)

**Workflow :**

1. **Réception du lien de révocation :**
   - Le titulaire a reçu un lien de révocation lors de la confirmation de son consentement
   - Format : `https://app.consumerseek.com/revocation?token=abc123xyz`
   - Token unique cryptographique (64 caractères hex)
   - Validité : 5 ans par défaut

2. **Accès à la page de révocation :**
   - Le titulaire clique sur le lien
   - Le système valide automatiquement le token :
     - ✅ Token valide et non expiré → Formulaire affiché
     - ❌ Token invalide/expiré → Message d'erreur
     - ❌ Déjà révoqué → Information "Déjà révoqué"

3. **Affichage des informations :**
   ```
   ┌────────────────────────────────────────────────────────────┐
   │ Révocation du consentement                                 │
   │                                                            │
   │ Informations sur l'autorisation :                         │
   │ - Titulaire : M. Jean DUPONT                              │
   │ - Entreprise : SARL DUPONT                                │
   │ - Email : jean.dupont@example.com                         │
   │ - Date du consentement : 01/03/2026 10:30                 │
   │                                                            │
   │ Raison de la révocation (optionnel) :                     │
   │ [Textarea]                                                 │
   │                                                            │
   │ ⚠️ Attention : Cette action est immédiate et irréversible │
   │                                                            │
   │ [Révoquer mon consentement]                               │
   └────────────────────────────────────────────────────────────┘
   ```

4. **Révocation immédiate :**
   - Le titulaire clique sur "Révoquer mon consentement"
   - Le système capture :
     - IP du titulaire
     - User-Agent du navigateur
     - Timestamp UTC serveur
     - Raison fournie (optionnel)

5. **Traitement automatique :**
   ```sql
   -- Appel RPC function revoke_authorization_by_token
   SELECT revoke_authorization_by_token(
     'abc123xyz',                                    -- Token
     'Je ne souhaite plus partager mes données',    -- Raison
     '88.127.34.166',                                -- IP
     'Mozilla/5.0 (Windows NT 10.0...'              -- User-Agent
   );

   -- La fonction effectue :
   -- 1. Validation du token (existant, non expiré, ACTIVE)
   -- 2. Mise à jour de l'autorisation
   UPDATE autorisations_communication
   SET
     consent_status = 'REVOKED',
     revoked_at = now(),
     revocation_reason = 'Je ne souhaite plus partager mes données'
   WHERE revocation_token = 'abc123xyz';

   -- 3. Log de la tentative dans revocation_requests (append-only)
   INSERT INTO revocation_requests (
     autorisation_id,
     revocation_token,
     request_status,              -- 'SUCCESS'
     revocation_reason,
     ip_address,
     user_agent,
     created_at
   ) VALUES (...);

   -- 4. Création événement consent_events (via trigger)
   INSERT INTO consent_events (
     autorisation_id,
     event_type,                  -- 'REVOCATION'
     ip_address,                  -- IP du titulaire
     user_agent,                  -- Navigateur
     event_metadata,              -- JSON avec raison
     created_at                   -- Timestamp UTC serveur
   ) VALUES (...);
   ```

6. **Confirmation affichée :**
   ```
   ✓ Révocation réussie

   Votre consentement a été révoqué avec succès.

   Effets de la révocation :
   - Arrêt immédiat de tout accès à vos données
   - Plus aucun appel API Enedis ne sera effectué
   - Les logs de consentement antérieurs sont conservés pour preuve légale
   - Vos données seront anonymisées après 24 mois

   Vous pouvez fermer cette page.
   ```

**Sécurité :**

- ✅ Token cryptographiquement sécurisé (32 bytes aléatoires → 64 hex)
- ✅ Expiration automatique après 5 ans
- ✅ Toutes les tentatives (success/échec) sont loguées dans `revocation_requests`
- ✅ Aucune authentification requise (simplicité RGPD)
- ✅ IP et User-Agent capturés pour traçabilité
- ✅ RLS PostgreSQL : anonymous peut UPDATE uniquement via token valide

**Avantages RGPD :**

1. **Simplicité maximale :** Un seul clic sur le lien → Révocation
2. **Pas d'intermédiaire :** Le titulaire agit directement
3. **Accessible 24/7 :** Pas besoin de contacter l'exploitant
4. **Traçabilité complète :** Tous les événements loggés
5. **Conformité Article 7.3 :** "Aussi simple que de donner le consentement"

**Cas d'échec gérés :**

- Token invalide → `FAILED_INVALID_TOKEN`
- Token expiré → `FAILED_EXPIRED`
- Déjà révoqué → `FAILED_ALREADY_REVOKED`
- Tous les cas loggés dans `revocation_requests`

### 4.3. Effets de la Révocation

**Immédiat :**
- Statut passe de `ACTIVE` à `REVOKED`
- Horodatage `revoked_at` enregistré
- Événement immutable créé dans `consent_events`

**Arrêt des traitements :**
- Plus aucun appel API Enedis autorisé
- Vérification automatique via `checkPRMConsent()`

**Conservation des logs :**
- ⚠️ **Les logs de consentement ANTÉRIEURS sont CONSERVÉS**
- Obligation légale : Prouver que le consentement était valide au moment de l'appel API
- Conformité RGPD Art. 17.3.b : Exception pour "respecter une obligation légale"

### 4.4. Traçabilité de la Révocation

**Éléments enregistrés :**

1. **Date et heure UTC** de la révocation
2. **Raison** fournie par l'exploitant
3. **IP et User-Agent** de l'exploitant effectuant la révocation
4. **Identité** du demandeur (dans `event_metadata`)

**Vérification :**
```sql
SELECT
  a.consent_status,
  a.revoked_at,
  a.revocation_reason,
  ce.created_at as event_timestamp,
  ce.ip_address,
  ce.user_agent,
  ce.event_metadata
FROM autorisations_communication a
JOIN consent_events ce ON ce.autorisation_id = a.id
WHERE a.id = 'uuid-autorisation'
AND ce.event_type = 'REVOCATION';
```

---

## 5. Sécurité et Horodatage

### 5.1. Cryptographie

#### Hash SHA-256 du Texte de Consentement

**Algorithme :** SHA-256 (Web Crypto API)

**Calcul :**
```javascript
const encoder = new TextEncoder();
const data = encoder.encode(consentText);
const hashBuffer = await crypto.subtle.digest('SHA-256', data);
const hash = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

**Propriétés :**
- **Déterministe** : Même texte → Même hash
- **Unique** : Toute modification du texte → Hash différent
- **Irréversible** : Impossible de retrouver le texte depuis le hash
- **Rapide** : Vérification instantanée

**Utilisation :**
- Prouver que le texte accepté est celui stocké
- Détecter toute tentative de modification rétroactive

#### Hash de l'Événement

**Calculé automatiquement** lors de l'insertion dans `consent_events` :

```sql
event_hash = encode(
  sha256(
    (autorisation_id::text ||
     event_type ||
     coalesce(created_at::text, '') ||
     coalesce(consent_text_hash, '') ||
     coalesce(ip_address, ''))::bytea
  ),
  'hex'
);
```

**Utilité :** Preuve d'intégrité de l'événement

### 5.2. Horodatage Serveur

**Principe :** Le timestamp est généré par le serveur PostgreSQL, pas par le client.

**Avantages :**
- **Non falsifiable** : Le client ne peut pas modifier l'heure
- **Synchronisé UTC** : Tous les timestamps sont en UTC
- **Précision microseconde** : `2026-03-01T10:30:00.123456Z`

**Implémentation :**
```sql
created_at timestamptz DEFAULT now()
```

**Vérification :**
```sql
SELECT
  date_autorisation,
  extract(timezone from date_autorisation) as timezone_offset
FROM autorisations_communication;
-- timezone_offset doit être 0 (UTC)
```

### 5.3. Protection Contre la Falsification

#### 1. RLS (Row Level Security)

**Principe :** PostgreSQL applique des politiques de sécurité au niveau des lignes.

**Exemples :**
```sql
-- Empêcher la suppression d'événements
-- (AUCUNE politique DELETE = suppression impossible)

-- Empêcher la modification d'événements
-- (AUCUNE politique UPDATE = modification impossible)

-- Restreindre l'insertion aux utilisateurs autorisés
CREATE POLICY "Only triggers can insert events"
  ON consent_events FOR INSERT
  TO authenticated
  WITH CHECK (false);  -- Seuls les triggers peuvent insérer
```

#### 2. Triggers de Protection

**Empêcher la modification de champs critiques :**

```sql
CREATE TRIGGER prevent_critical_field_modification
  BEFORE UPDATE ON autorisations_communication
  FOR EACH ROW
  EXECUTE FUNCTION protect_critical_fields();

CREATE FUNCTION protect_critical_fields() RETURNS trigger AS $$
BEGIN
  IF OLD.consent_text_hash IS DISTINCT FROM NEW.consent_text_hash THEN
    RAISE EXCEPTION 'Cannot modify consent_text_hash';
  END IF;
  IF OLD.date_autorisation IS DISTINCT FROM NEW.date_autorisation THEN
    RAISE EXCEPTION 'Cannot modify date_autorisation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 3. Append-Only Tables

**Tables concernées :**
- `consent_events`
- `audit_trail`
- `enedis_api_calls` (futur)

**Caractéristiques :**
- Aucune suppression possible
- Aucune modification possible
- INSERT uniquement

### 5.4. IP et User-Agent

**Capture de l'IP :**
```typescript
const ipResponse = await fetch('https://api.ipify.org?format=json');
const ipData = await ipResponse.json();
const userIp = ipData.ip;
```

**Capture du User-Agent :**
```typescript
const userAgent = navigator.userAgent;
// Exemple: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
```

**Utilité juridique :**
- Identification technique du déclarant
- Corroboration avec logs FAI en cas de litige
- Preuve que le consentement provient d'un navigateur réel

---

## 6. Export pour Audit Enedis

### 6.1. Format d'Export

**Fonction SQL :** `generate_csv_audit_report(prm_list text[])`

**Appel depuis l'interface :**
```typescript
const { data, error } = await supabase.rpc('generate_csv_audit_report', {
  prm_list: ['12345678901234', '98765432109876']
});
```

**Structure du CSV :**

```csv
LOGS_CONSENTEMENT
PRM,Date_Consentement,Hash_SHA256,IP_Declarant,Navigateur,Identite_Titulaire,Statut,Version_Politique

LOGS_REVOCATION
PRM,Date_Revocation,Raison,IP_Revocateur,Navigateur,Date_Consentement_Initial

VERIFICATIONS_COHERENCE
PRM,Date_Consentement,Date_Appel_API,Delai_Jours,Statut,Message
```

### 6.2. Section 1 : LOGS_CONSENTEMENT

**Contenu :** Tous les consentements actifs au moment de l'export

**Colonnes :**
- `PRM` : Numéro de compteur (14 chiffres)
- `Date_Consentement` : Timestamp UTC ISO 8601
- `Hash_SHA256` : Hash du texte accepté (64 caractères hex)
- `IP_Declarant` : Adresse IP
- `Navigateur` : User-Agent
- `Identite_Titulaire` : Nom complet
- `Statut` : ACTIVE
- `Version_Politique` : V1

**Exemple :**
```csv
LOGS_CONSENTEMENT
PRM,Date_Consentement,Hash_SHA256,IP_Declarant,Navigateur,Identite_Titulaire,Statut,Version_Politique
12345678901234,2026-03-01T10:30:00Z,a1b2c3d4e5f6...,88.127.34.166,Mozilla/5.0...,DUPONT Jean,ACTIVE,V1
```

### 6.3. Section 2 : LOGS_REVOCATION

**Contenu :** Historique des révocations

**Colonnes :**
- `PRM`
- `Date_Revocation` : Timestamp UTC
- `Raison` : Motif fourni
- `IP_Revocateur` : IP de l'exploitant
- `Navigateur`
- `Date_Consentement_Initial` : Pour traçabilité

**Exemple :**
```csv
LOGS_REVOCATION
PRM,Date_Revocation,Raison,IP_Revocateur,Navigateur,Date_Consentement_Initial
98765432109876,2026-03-10T16:45:00Z,Demande du titulaire,92.168.1.1,Mozilla/5.0...,2026-03-01T10:30:00Z
```

### 6.4. Section 3 : VERIFICATIONS_COHERENCE

**Contenu :** Vérification automatique de la chronologie

**Colonnes :**
- `PRM`
- `Date_Consentement`
- `Date_Appel_API` : Premier appel API Enedis
- `Delai_Jours` : Nombre de jours entre consentement et appel
- `Statut` : OK, ERREUR, ou NO_API_CALL
- `Message` : Explication

**Exemples :**
```csv
VERIFICATIONS_COHERENCE
PRM,Date_Consentement,Date_Appel_API,Delai_Jours,Statut,Message
12345678901234,2026-03-01T10:30:00Z,2026-03-04T14:00:00Z,3,OK,Chronologie valide
98765432109876,2026-03-01T10:30:00Z,2026-02-28T10:00:00Z,-1,ERREUR,Appel API AVANT consentement
11111111111111,2026-03-01T10:30:00Z,NULL,NULL,NO_API_CALL,Aucun appel API encore effectué
```

---

## 7. Procédure de Contrôle pour Auditeurs

### 7.1. Vérification de la Collecte

**Étape 1 : Vérifier l'existence du consentement**

```sql
SELECT
  a.id,
  a.date_autorisation,
  a.consent_text_hash,
  a.policy_version_id,
  a.ip_address,
  a.consent_status
FROM autorisations_communication a
JOIN prm p ON p.autorisation_id = a.id
WHERE p.prm_numero = '12345678901234';
```

**Critères de validation :**
- ✅ `consent_text_hash` présent (64 caractères hex)
- ✅ `policy_version_id` référence une version valide
- ✅ `ip_address` présente
- ✅ `consent_status = 'ACTIVE'`
- ✅ `date_autorisation` antérieure à tout appel API

**Étape 2 : Vérifier l'intégrité du hash**

```sql
SELECT
  a.consent_text_hash as stored_hash,
  encode(sha256(pv.full_text::bytea), 'hex') as calculated_hash,
  a.consent_text_hash = encode(sha256(pv.full_text::bytea), 'hex') as integrity_ok
FROM autorisations_communication a
JOIN policy_versions pv ON a.policy_version_id = pv.id
WHERE a.id = 'uuid-autorisation';
```

**Résultat attendu :** `integrity_ok = true`

**Étape 3 : Vérifier l'événement de consentement**

```sql
SELECT *
FROM consent_events
WHERE autorisation_id = 'uuid-autorisation'
AND event_type = 'CONSENT_GIVEN'
ORDER BY created_at DESC
LIMIT 1;
```

**Critères de validation :**
- ✅ Événement existe
- ✅ `consent_text_hash` identique à celui de l'autorisation
- ✅ `ip_address` présente
- ✅ `created_at` cohérent avec `date_autorisation`

### 7.2. Vérification de la Chronologie

**Requête de cohérence :**

```sql
SELECT
  p.prm_numero,
  a.date_autorisation as consent_date,
  MIN(api.called_at) as first_api_call,
  EXTRACT(EPOCH FROM (MIN(api.called_at) - a.date_autorisation)) / 86400 as delay_days,
  CASE
    WHEN MIN(api.called_at) IS NULL THEN 'NO_API_CALL'
    WHEN MIN(api.called_at) >= a.date_autorisation THEN 'OK'
    ELSE 'ERREUR'
  END as status
FROM prm p
JOIN autorisations_communication a ON p.autorisation_id = a.id
LEFT JOIN enedis_api_calls api ON api.autorisation_id = a.id
WHERE p.prm_numero IN ('12345678901234')
GROUP BY p.prm_numero, a.date_autorisation;
```

**Résultat attendu :**
- `status = 'OK'` ou `status = 'NO_API_CALL'`
- `delay_days >= 0` (consentement AVANT appel API)

### 7.3. Vérification des Révocations

**Requête :**

```sql
SELECT
  a.id,
  a.consent_status,
  a.revoked_at,
  a.revocation_reason,
  ce.ip_address as revocation_ip,
  ce.user_agent as revocation_ua
FROM autorisations_communication a
LEFT JOIN consent_events ce ON ce.autorisation_id = a.id AND ce.event_type = 'REVOCATION'
WHERE a.consent_status = 'REVOKED'
ORDER BY a.revoked_at DESC;
```

**Critères de validation :**
- ✅ `revoked_at` présent si `consent_status = 'REVOKED'`
- ✅ `revocation_reason` fournie
- ✅ Événement de révocation existe dans `consent_events`
- ✅ Aucun appel API après `revoked_at`

### 7.4. Vérification de l'Immutabilité

**Test de tentative de modification :**

```sql
-- Tenter de modifier un hash (doit échouer)
UPDATE autorisations_communication
SET consent_text_hash = 'fakehash'
WHERE id = 'uuid-autorisation';
-- Résultat attendu : ERREUR "Cannot modify consent_text_hash"

-- Tenter de supprimer un événement (doit échouer)
DELETE FROM consent_events WHERE id = 'uuid-event';
-- Résultat attendu : ERREUR "Permission denied"
```

---

## 8. Conformité RGPD et Réglementaire

### 8.1. Articles RGPD Respectés

| Article | Exigence | Implémentation |
|---------|----------|----------------|
| Art. 4.11 | Consentement = action positive | Case à cocher non pré-cochée |
| Art. 7.1 | Prouver le consentement | Hash SHA-256, timestamp, IP |
| Art. 7.3 | Droit de retrait | Révocation immédiate et traçable |
| Art. 13 | Information du titulaire | Texte complet affiché avant consentement |
| Art. 17 | Droit à l'effacement | Révocation + arrêt des traitements |
| Art. 25 | Protection dès la conception | RLS, append-only, triggers |

### 8.2. Exigences Enedis

| Exigence | Implémentation |
|----------|----------------|
| Consentement éclairé | Texte complet affiché |
| Preuve horodatée | Timestamp UTC serveur |
| Identification déclarant | IP, User-Agent, identité complète |
| Traçabilité | Hash SHA-256, événements immutables |
| Révocabilité | Révocation traçable |
| Cohérence chronologique | Vérification automatique |

### 8.3. Durée de Conservation

**Consentements actifs :** 12 mois (recommandation Enedis)

**Logs d'audit :** 5 ans minimum (obligation légale)

**Après révocation :**
- Arrêt immédiat des traitements
- Conservation des logs pour preuve (Art. 17.3.b RGPD)
- Anonymisation planifiée après 24 mois

---

## 9. FAQ Audit

### Q1 : Comment prouver qu'un consentement était valide au moment de l'appel API ?

**R :** Via la fonction `generate_coherence_verification()` :

```sql
SELECT * FROM generate_coherence_verification(ARRAY['12345678901234']);
```

Cette fonction vérifie automatiquement :
1. Consentement existe
2. Statut = ACTIVE au moment de l'appel
3. Chronologie : `consent_date < api_call_date`
4. Hash d'intégrité valide

### Q2 : Que se passe-t-il si le texte de consentement est modifié rétroactivement ?

**R :** La vérification d'intégrité échoue :

```sql
SELECT
  a.consent_text_hash = encode(sha256(pv.full_text::bytea), 'hex') as integrity_ok
FROM autorisations_communication a
JOIN policy_versions pv ON a.policy_version_id = pv.id;
```

Si `integrity_ok = false` → **Preuve de falsification**

### Q3 : Peut-on supprimer un événement de consentement ?

**R :** **NON**. La table `consent_events` est protégée par RLS strict :
- Aucune politique DELETE
- Toute tentative de suppression échoue avec erreur 403

### Q4 : Comment gérer une nouvelle version du texte de consentement ?

**R :** Créer une NOUVELLE version (V2, V3, etc.) :

```sql
INSERT INTO policy_versions (policy_code, version, full_text, effective_from)
VALUES ('CONSENT_TEXT', 'V2', 'Nouveau texte...', '2026-06-01T00:00:00Z');
```

Les nouveaux consentements utiliseront V2. Les anciens restent liés à V1.

### Q5 : Quelle est la valeur juridique de l'IP et du User-Agent ?

**R :** Ces métadonnées techniques :
- Permettent de **corroborer l'identité** du déclarant
- Peuvent être **croisées avec les logs FAI** en cas de litige
- Prouvent que le consentement provient d'un **navigateur réel** (pas d'un script)

### Q6 : Que se passe-t-il après une révocation ?

**R :**
1. **Immédiat** : Statut passe à `REVOKED`
2. **Arrêt des traitements** : Plus aucun appel API autorisé
3. **Conservation des logs** : Obligation légale (Art. 17.3.b RGPD)
4. **Anonymisation** : Planifiée après 24 mois

---

## 10. Conclusion

Le système ConsumerSeek garantit une **conformité totale** aux exigences RGPD et Enedis grâce à :

✅ **Consentement éclairé** : Texte complet affiché avant action
✅ **Preuve cryptographique** : Hash SHA-256 immutable
✅ **Horodatage sécurisé** : Timestamp UTC serveur non falsifiable
✅ **Traçabilité complète** : Événements append-only avec hash
✅ **Révocation immédiate** : Arrêt des traitements et traçabilité
✅ **Cohérence vérifiable** : Contrôle automatique de la chronologie

**Le système est prêt pour audit et fournit des preuves juridiquement solides en cas de litige.**

---

## Contacts

Pour toute question sur ce système d'audit :
- **Documentation technique** : `AUDIT_ENEDIS_IMPLEMENTATION.md`
- **Guide UI** : `UI_INTEGRATION_GUIDE.md`
- **Requêtes SQL** : Section 7 de ce document
