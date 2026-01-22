# Guide de Déploiement - Système d'Extraction Intelligente

Ce guide détaille le déploiement complet du système d'extraction intelligente de factures.

## Architecture

Le système est composé de 3 parties :
1. **Frontend React** (Supabase/Vite)
2. **Edge Function** (Supabase) - Proxy/orchestrateur
3. **Service Python** (Self-hosted) - OCR + LLM

## Étape 1 : Déployer le Service Python

### Option A : Docker Compose (Recommandé)

```bash
cd python-extraction-service

# Configurer l'environnement
cp .env.example .env
nano .env  # Ajouter vos clés Supabase

# Lancer les services
docker-compose up -d

# Télécharger le modèle Mistral (première fois)
docker exec -it ollama ollama pull mistral:7b

# Vérifier le statut
docker-compose ps
curl http://localhost:8000/
```

### Option B : Installation Manuelle

```bash
cd python-extraction-service

# Prérequis système
sudo apt-get update
sudo apt-get install -y python3.10 python3-pip python3-venv \
    libgomp1 libglib2.0-0 libsm6 libxext6 libxrender-dev poppler-utils

# Installer Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull mistral:7b

# Installer Python dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configuration
cp .env.example .env
nano .env  # Ajouter vos clés Supabase

# Lancer le service
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Vérification

```bash
# Test de santé
curl http://localhost:8000/

# Test d'extraction (nécessite une facture uploadée)
curl -X POST http://localhost:8000/extract \
  -H "Content-Type: application/json" \
  -d '{
    "facture_id": "your-uuid",
    "file_url": "https://...",
    "supplier_hint": "EDF"
  }'
```

## Étape 2 : Configuration de l'Edge Function

La Edge Function est déjà déployée. Vous devez configurer la variable d'environnement :

### Via Supabase Dashboard

1. Aller sur https://supabase.com/dashboard/project/YOUR_PROJECT/settings/functions
2. Cliquer sur "Edge Functions"
3. Sélectionner "extract-facture"
4. Ajouter la variable d'environnement :
   - **Nom** : `PYTHON_SERVICE_URL`
   - **Valeur** : URL de votre service Python (ex: `http://your-server-ip:8000`)

### Via CLI (Alternative)

```bash
# Si vous avez la Supabase CLI
supabase secrets set PYTHON_SERVICE_URL=http://your-server:8000

# Redéployer la fonction
supabase functions deploy extract-facture
```

## Étape 3 : Configuration Frontend

### Fichier .env

Votre fichier `.env` doit contenir :

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# URL du service Python (pour le feedback d'apprentissage)
VITE_PYTHON_SERVICE_URL=http://your-server:8000
```

### Build et Déploiement

```bash
# Installation des dépendances
npm install

# Build
npm run build

# Preview local
npm run preview
```

## Étape 4 : Test du Système Complet

### 1. Téléverser une Facture

Via l'interface utilisateur :
1. Se connecter à l'application
2. Aller dans "Gestion des Factures"
3. Téléverser une facture PDF ou image

### 2. Lancer l'Extraction

1. Cliquer sur une facture en attente de validation
2. Cliquer sur "Extraction Intelligente"
3. Attendre 5-10 secondes
4. Vérifier les champs extraits

### 3. Valider et Apprendre

1. Corriger les champs erronés
2. Cliquer sur "Valider la facture"
3. Le système apprend automatiquement des corrections

### 4. Vérifier l'Apprentissage

```sql
-- Via Supabase SQL Editor

-- Vérifier les extractions brutes
SELECT * FROM extractions_brutes ORDER BY created_at DESC LIMIT 5;

-- Vérifier les corrections
SELECT * FROM historique_corrections ORDER BY created_at DESC LIMIT 10;

-- Vérifier les patterns appris
SELECT * FROM patterns_fournisseurs;
```

## Architecture Réseau

### Production : Serveur Séparé

```
┌──────────────┐         ┌────────────────┐         ┌──────────────────┐
│   Frontend   │────────▶│  Edge Function │────────▶│  Python Service  │
│  (Supabase)  │         │   (Supabase)   │         │  (VPS/Serveur)   │
└──────────────┘         └────────────────┘         └──────────────────┘
                                                              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │     Ollama       │
                                                     │   (Mistral 7B)   │
                                                     └──────────────────┘
```

### Configuration Réseau

Le service Python doit être accessible depuis l'Edge Function :
- **Option 1** : Serveur avec IP publique + port ouvert
- **Option 2** : VPN/Tailscale pour connexion sécurisée
- **Option 3** : Reverse proxy (nginx) avec HTTPS

### Exemple nginx (Option 3)

```nginx
server {
    listen 443 ssl;
    server_name extraction.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/extraction.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/extraction.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
```

## Sécurité

### 1. API Key pour le Service Python

Ajouter une authentification à `main.py` :

```python
from fastapi import Header, HTTPException

API_KEY = os.getenv("API_KEY", "your-secret-key")

async def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

@app.post("/extract", dependencies=[Depends(verify_api_key)])
async def extract_facture(request: ExtractionRequest):
    # ...
```

Puis configurer l'Edge Function :

```typescript
const response = await fetch(`${PYTHON_SERVICE_URL}/extract`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': Deno.env.get('PYTHON_SERVICE_API_KEY')!
  },
  body: JSON.stringify({...})
});
```

### 2. Firewall

Limiter l'accès au service Python :

```bash
# UFW (Ubuntu)
sudo ufw allow from SUPABASE_IP to any port 8000
sudo ufw enable
```

### 3. Rate Limiting

Activer dans `main.py` avec `slowapi` :

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/extract")
@limiter.limit("10/minute")
async def extract_facture(request: Request):
    # ...
```

## Monitoring

### Logs

```bash
# Docker
docker-compose logs -f

# Systemd (si installé en service)
journalctl -u extraction-service -f
```

### Métriques

Installer Prometheus + Grafana pour monitorer :
- Temps d'extraction moyen
- Taux de succès
- Utilisation CPU/RAM
- Taille de la queue

## Troubleshooting

### Service Python ne démarre pas

```bash
# Vérifier les logs
docker-compose logs extraction-service

# Vérifier Ollama
docker exec -it ollama ollama list
```

### Extraction échoue

```bash
# Tester directement le service
curl -X POST http://localhost:8000/extract -H "Content-Type: application/json" -d '{...}'

# Vérifier les modèles disponibles
docker exec -it ollama ollama list
```

### Mémoire insuffisante

```bash
# Réduire la taille du modèle
docker exec -it ollama ollama pull phi:3b

# Ou augmenter la swap
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Évolution et Scaling

### Scaling Horizontal

Pour gérer plus de charge :

1. **Queue System** : Redis + Celery
2. **Load Balancer** : nginx/HAProxy devant plusieurs instances Python
3. **GPU** : Utiliser des instances GPU pour accélérer OCR et LLM

### Amélioration de la Précision

Le système s'améliore automatiquement, mais vous pouvez :
1. Annoter plus de factures
2. Créer des templates par fournisseur
3. Upgrader le modèle LLM (Mixtral 8x7B, etc.)

## Support

Pour toute question :
- Consulter `ARCHITECTURE_EXTRACTION.md`
- Consulter `python-extraction-service/README.md`
- Vérifier les logs du service
