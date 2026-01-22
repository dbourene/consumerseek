# Architecture du Système d'Extraction Intelligente de Factures

## Vue d'ensemble

Système 100% open-source et auto-apprenant pour l'extraction automatique de données de factures d'électricité avec amélioration continue basée sur les corrections utilisateur.

## Stack Technique

### Backend d'Extraction (Python - Self-Hosted)
- **FastAPI** : API REST pour l'extraction
- **PaddleOCR** : OCR performant open-source
- **Ollama + Mistral 7B** : LLM local pour parsing intelligent
- **PostgreSQL/Supabase** : Stockage et apprentissage

### Frontend (React/TypeScript)
- Interface de validation avec preview PDF/image
- Feedback utilisateur pour corrections
- Visualisation de la confiance d'extraction

### Orchestration
- **Supabase Edge Function** : Proxy entre frontend et service Python
- Communication async pour traitement long

## Architecture du Pipeline

```
┌─────────────────┐
│   Frontend      │
│  (React/TS)     │
└────────┬────────┘
         │ 1. Upload facture
         ▼
┌─────────────────┐
│  Supabase       │
│  Storage        │
└────────┬────────┘
         │ 2. Trigger extraction
         ▼
┌─────────────────┐
│  Edge Function  │
│  (Orchestrator) │
└────────┬────────┘
         │ 3. Call extraction
         ▼
┌─────────────────────────────────────────┐
│  Python Service (Self-Hosted)           │
│  ┌─────────────────────────────────┐   │
│  │ 1. PDF → Images (pdf2image)     │   │
│  └──────────────┬──────────────────┘   │
│                 ▼                       │
│  ┌─────────────────────────────────┐   │
│  │ 2. OCR (PaddleOCR)              │   │
│  │    - Text extraction            │   │
│  │    - Bounding boxes             │   │
│  │    - Confidence scores          │   │
│  └──────────────┬──────────────────┘   │
│                 ▼                       │
│  ┌─────────────────────────────────┐   │
│  │ 3. Context Enhancement          │   │
│  │    - Load supplier patterns     │   │
│  │    - Apply learned rules        │   │
│  │    - Few-shot examples          │   │
│  └──────────────┬──────────────────┘   │
│                 ▼                       │
│  ┌─────────────────────────────────┐   │
│  │ 4. LLM Parsing (Ollama/Mistral) │   │
│  │    - Structured JSON output     │   │
│  │    - Field-level confidence     │   │
│  └──────────────┬──────────────────┘   │
│                 ▼                       │
│  ┌─────────────────────────────────┐   │
│  │ 5. Post-Processing              │   │
│  │    - Validation rules           │   │
│  │    - Coherence checks           │   │
│  │    - Format normalization       │   │
│  └──────────────┬──────────────────┘   │
└──────────────────┼──────────────────────┘
                   │ 4. Return extracted data
                   ▼
┌─────────────────────────────────────────┐
│  Supabase Database                      │
│  ┌─────────────────────────────────┐   │
│  │ - extractions_brutes            │   │
│  │ - factures (update)             │   │
│  └─────────────────────────────────┘   │
└─────────────────┬───────────────────────┘
                  │ 5. Display for validation
                  ▼
┌─────────────────────────────────────────┐
│  Frontend Validation Modal              │
│  - User reviews/corrects data           │
│  - Saves corrections                    │
└─────────────────┬───────────────────────┘
                  │ 6. Learning feedback
                  ▼
┌─────────────────────────────────────────┐
│  Learning System                        │
│  ┌─────────────────────────────────┐   │
│  │ - extractions_validees          │   │
│  │ - historique_corrections        │   │
│  │ - patterns_fournisseurs         │   │
│  │ - llm_prompts (improvement)     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Schéma de Base de Données

### Tables Existantes
- `factures` : Données de factures validées
- `patterns_fournisseurs` : Patterns existants

### Nouvelles Tables (créées)
- `extractions_brutes` : Résultats bruts OCR + LLM
- `extractions_validees` : Ground truth après validation utilisateur
- `historique_corrections` : Toutes les corrections utilisateur
- `llm_prompts` : Versions de prompts avec métriques de performance

## Mécanisme d'Apprentissage

### 1. Détection de Patterns (Auto)
Après chaque validation utilisateur, le système :
- Analyse les positions des champs extraits correctement
- Identifie les patterns regex qui fonctionnent
- Stocke les labels courants par fournisseur
- Calcule le taux de succès par champ

### 2. Amélioration du Prompt (Semi-Auto)
- Tracking des erreurs fréquentes par type de champ
- Suggestions d'amélioration du prompt
- A/B testing de versions de prompt
- Métriques : précision, temps d'extraction

### 3. Few-Shot Learning
Pour chaque fournisseur, après N validations (ex: 5) :
- Création d'exemples few-shot automatiques
- Injection dans le contexte du LLM
- Amélioration significative de la précision

### 4. Règles Heuristiques
Détection automatique de règles métier :
- Cohérence prix unitaire × consommation ≈ montant
- Période de facturation logique
- Puissance souscrite vs consommation

## Installation du Service Python

### Prérequis
```bash
# Python 3.10+
sudo apt-get update
sudo apt-get install python3.10 python3-pip python3-venv

# Dépendances système pour PaddleOCR
sudo apt-get install libgomp1 libglib2.0-0

# Ollama pour LLM local
curl -fsSL https://ollama.com/install.sh | sh
ollama pull mistral:7b
```

### Installation
```bash
cd python-extraction-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Configuration
Créer `.env` :
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
OLLAMA_BASE_URL=http://localhost:11434
OCR_CONFIDENCE_THRESHOLD=0.6
LLM_TEMPERATURE=0.1
```

### Lancement
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API du Service Python

### POST /extract
Extraction complète d'une facture

**Request:**
```json
{
  "facture_id": "uuid",
  "file_url": "https://...",
  "supplier_hint": "EDF"
}
```

**Response:**
```json
{
  "extraction_id": "uuid",
  "extracted_data": {
    "fournisseur": "EDF",
    "pdl": "12345678901234",
    "conso_totale": 1500,
    "prix_total_ttc": 245.80,
    ...
  },
  "confidence": {
    "global": 0.85,
    "per_field": {
      "fournisseur": 0.95,
      "pdl": 0.88,
      ...
    }
  },
  "ocr_metadata": {
    "total_words": 342,
    "avg_confidence": 0.87
  }
}
```

### POST /learn
Feedback d'apprentissage après correction utilisateur

**Request:**
```json
{
  "extraction_id": "uuid",
  "corrections": {
    "conso_totale": {
      "extracted": 1500,
      "corrected": 1520
    }
  },
  "facture_id": "uuid"
}
```

## Déploiement

### Option 1 : VPS/Serveur Dédié
- Ubuntu 22.04 LTS
- 4 GB RAM minimum (8 GB recommandé pour Mistral 7B)
- 20 GB espace disque
- Docker + Docker Compose

### Option 2 : Docker Local
```bash
docker-compose up -d
```

### Option 3 : Kubernetes (Production)
Helm charts fournis dans `/k8s`

## Performance

### Temps d'extraction moyen
- OCR : 2-3 secondes
- LLM parsing : 3-5 secondes
- **Total : 5-8 secondes par facture**

### Précision attendue
- **Initial** : 60-70% des champs corrects
- **Après 10 validations** : 80-85%
- **Après 50 validations** : 90-95%

### Scalabilité
- 1 instance : ~100 factures/heure
- Parallélisation possible avec queue (Redis/Celery)

## Sécurité

- API key required pour tous les endpoints
- Rate limiting : 100 req/min par IP
- Validation des types de fichiers (PDF, PNG, JPEG uniquement)
- Limite de taille : 10 MB par fichier
- Pas de stockage permanent des fichiers dans le service Python

## Monitoring

Métriques clés à surveiller :
- Temps moyen d'extraction
- Taux de confiance global
- Nombre de corrections par champ
- Taux d'utilisation du CPU/RAM
- Taille de la queue d'attente

## Évolutions Futures

1. **Support multi-énergie** : Gaz, eau
2. **OCR amélioré** : EasyOCR, Tesseract 5
3. **LLM plus performants** : Mixtral 8x7B, LLaMA 3
4. **Auto-annotation** : Interface pour créer des datasets
5. **Export ONNX** : Modèle léger pour edge computing
