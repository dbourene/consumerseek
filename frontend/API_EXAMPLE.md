# Exemple d'Intégration API Externe

## Format de l'API Externe

Votre API externe doit exposer un endpoint qui retourne les consommateurs pour une commune donnée.

### Endpoint Requis

```
GET /consommateurs?code_commune={code}&annee={annee}
```

### Paramètres

- `code_commune` (string) : Code INSEE de la commune (ex: "76540")
- `annee` (number) : Année des données (ex: 2024)

### Réponse Attendue

```json
[
  {
    "adresse": "1 Rue de la Paix",
    "code_commune": "76540",
    "nom_commune": "Rouen",
    "nombre_sites": 1,
    "consommation_annuelle_mwh": 150.5,
    "tranche_conso": "100 à 250 MWh",
    "categorie_activite": "Activités de services",
    "annee": 2024
  },
  {
    "adresse": "25 Boulevard des Belges",
    "code_commune": "76540",
    "nom_commune": "Rouen",
    "nombre_sites": 2,
    "consommation_annuelle_mwh": 450.8,
    "tranche_conso": "250 à 500 MWh",
    "categorie_activite": "Commerce et réparation",
    "annee": 2024
  }
]
```

### Champs Requis

| Champ | Type | Description | Exemple |
|-------|------|-------------|---------|
| `adresse` | string | Adresse complète | "1 Rue de la Paix" |
| `code_commune` | string | Code INSEE | "76540" |
| `nom_commune` | string | Nom de la commune | "Rouen" |
| `nombre_sites` | number | Nombre de sites | 1 |
| `consommation_annuelle_mwh` | number | Consommation en MWh | 150.5 |
| `tranche_conso` | string | Tranche de consommation | "100 à 250 MWh" |
| `categorie_activite` | string | Catégorie d'activité | "Activités de services" |
| `annee` | number | Année | 2024 |

### Champs Optionnels

Vous pouvez ajouter des champs supplémentaires qui seront stockés dans la base :

```json
{
  "adresse": "1 Rue de la Paix",
  "code_commune": "76540",
  "nom_commune": "Rouen",
  "nombre_sites": 1,
  "consommation_annuelle_mwh": 150.5,
  "tranche_conso": "100 à 250 MWh",
  "categorie_activite": "Activités de services",
  "annee": 2024,

  "latitude": 49.4432,
  "longitude": 1.0993,
  "geocode_status": "success",
  "geocode_score": 0.95,
  "raison_sociale": "Entreprise XYZ",
  "siret": "12345678901234"
}
```

## Exemples d'Implémentation

### Node.js + Express

```javascript
const express = require('express');
const app = express();

app.get('/consommateurs', async (req, res) => {
  const { code_commune, annee } = req.query;

  // Récupérez vos données depuis votre base de données
  const consommateurs = await db.query(
    'SELECT * FROM consommateurs WHERE code_commune = $1 AND annee = $2',
    [code_commune, annee]
  );

  res.json(consommateurs);
});

app.listen(3000);
```

### Python + FastAPI

```python
from fastapi import FastAPI
from typing import List

app = FastAPI()

@app.get("/consommateurs")
async def get_consommateurs(code_commune: str, annee: int):
    # Récupérez vos données depuis votre base de données
    consommateurs = db.query(
        "SELECT * FROM consommateurs WHERE code_commune = ? AND annee = ?",
        (code_commune, annee)
    )
    return consommateurs
```

### PHP + Laravel

```php
Route::get('/consommateurs', function (Request $request) {
    $codeCommune = $request->query('code_commune');
    $annee = $request->query('annee');

    $consommateurs = DB::table('consommateurs')
        ->where('code_commune', $codeCommune)
        ->where('annee', $annee)
        ->get();

    return response()->json($consommateurs);
});
```

## Authentification

Si votre API nécessite une authentification, ajoutez le header approprié :

### Bearer Token

```typescript
configureAPI({
  baseUrl: 'https://api.example.com',
  apiKey: 'votre-token-secret',
  headers: {
    'Authorization': 'Bearer votre-token-secret'
  }
});
```

### API Key

```typescript
configureAPI({
  baseUrl: 'https://api.example.com',
  headers: {
    'X-API-Key': 'votre-clé-api'
  }
});
```

### Basic Auth

```typescript
const credentials = btoa('username:password');
configureAPI({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': `Basic ${credentials}`
  }
});
```

## CORS

Assurez-vous que votre API autorise les requêtes CORS depuis votre domaine :

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://votre-domaine.com');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
```

## Pagination

Si vous avez beaucoup de consommateurs par commune, implémentez la pagination :

```javascript
app.get('/consommateurs', async (req, res) => {
  const { code_commune, annee, page = 1, limit = 1000 } = req.query;

  const offset = (page - 1) * limit;

  const consommateurs = await db.query(
    'SELECT * FROM consommateurs WHERE code_commune = $1 AND annee = $2 LIMIT $3 OFFSET $4',
    [code_commune, annee, limit, offset]
  );

  res.json({
    results: consommateurs,
    page: parseInt(page),
    total: totalCount
  });
});
```

Puis adaptez le service dans ConsumerSeek :

```typescript
export async function fetchConsumersFromAPI(
  communeCodes: string[],
  annee: number
): Promise<ExternalConsumer[]> {
  const allConsumers: ExternalConsumer[] = [];

  for (const codeCommune of communeCodes) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${apiConfig.baseUrl}/consommateurs?code_commune=${codeCommune}&annee=${annee}&page=${page}`;
      const response = await fetch(url, { headers: apiConfig.headers });
      const data = await response.json();

      allConsumers.push(...data.results);

      hasMore = data.results.length === 1000;
      page++;
    }
  }

  return allConsumers;
}
```

## Test avec cURL

Testez votre API :

```bash
curl -X GET "https://api.example.com/consommateurs?code_commune=76540&annee=2024" \
  -H "Authorization: Bearer votre-token"
```

Réponse attendue :

```json
[
  {
    "adresse": "1 Rue de la Paix",
    "code_commune": "76540",
    "nom_commune": "Rouen",
    ...
  }
]
```

## Performance

Pour optimiser les performances :

1. **Index** : Créez des index sur `code_commune` et `annee`
2. **Cache** : Utilisez Redis pour mettre en cache les réponses fréquentes
3. **Compression** : Activez la compression gzip
4. **CDN** : Si possible, utilisez un CDN pour distribuer l'API

```sql
CREATE INDEX idx_consommateurs_commune_annee
ON consommateurs(code_commune, annee);
```
