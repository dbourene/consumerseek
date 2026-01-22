# Service d'Extraction Intelligente de Factures

Service Python self-hosted pour l'extraction automatique de données de factures d'électricité avec apprentissage continu.

## Stack Technique

- **FastAPI** : API REST
- **PaddleOCR** : OCR performant open-source
- **Ollama + Mistral 7B** : LLM local pour parsing
- **PostgreSQL/Supabase** : Base de données

## Installation Rapide (Docker)

### 1. Prérequis
```bash
# Docker et Docker Compose
sudo apt-get update
sudo apt-get install docker.io docker-compose
```

### 2. Configuration
```bash
# Copier le fichier d'environnement
cp .env.example .env

# Éditer avec vos clés Supabase
nano .env
```

### 3. Lancement
```bash
# Build et démarrage
docker-compose up -d

# Télécharger le modèle Mistral (première fois uniquement)
docker exec -it ollama ollama pull mistral:7b

# Vérifier les logs
docker-compose logs -f
```

### 4. Test
```bash
curl http://localhost:8000/
```

## Installation Manuelle (Sans Docker)

### 1. Prérequis Système
```bash
# Python 3.10+
sudo apt-get update
sudo apt-get install python3.10 python3-pip python3-venv

# Dépendances PaddleOCR
sudo apt-get install libgomp1 libglib2.0-0 libsm6 libxext6 libxrender-dev

# Poppler pour PDF
sudo apt-get install poppler-utils

# Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull mistral:7b
```

### 2. Installation Python
```bash
# Créer environnement virtuel
python3 -m venv venv
source venv/bin/activate

# Installer dépendances
pip install -r requirements.txt
```

### 3. Configuration
```bash
cp .env.example .env
# Éditer .env avec vos credentials
```

### 4. Lancement
```bash
# Démarrer Ollama (dans un terminal séparé)
ollama serve

# Démarrer le service (dans un autre terminal)
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Utilisation

### API Extract
Extraction complète d'une facture :

```bash
curl -X POST http://localhost:8000/extract \
  -H "Content-Type: application/json" \
  -d '{
    "facture_id": "uuid-here",
    "file_url": "https://your-storage.com/facture.pdf",
    "supplier_hint": "EDF"
  }'
```

Réponse :
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
      "pdl": 0.88
    }
  },
  "ocr_metadata": {
    "total_words": 342,
    "avg_confidence": 0.87
  }
}
```

### API Learn
Feedback après correction utilisateur :

```bash
curl -X POST http://localhost:8000/learn \
  -H "Content-Type: application/json" \
  -d '{
    "extraction_id": "uuid",
    "facture_id": "uuid",
    "corrections": {
      "conso_totale": {
        "extracted": 1500,
        "corrected": 1520
      }
    }
  }'
```

## Performance

- **Temps d'extraction** : 5-8 secondes par facture
- **OCR** : 2-3 secondes
- **LLM parsing** : 3-5 secondes
- **Précision initiale** : 60-70%
- **Après apprentissage** : 90-95%

## Configuration Avancée

### Améliorer les Performances

#### Utiliser GPU (si disponible)
Modifier `main.py` :
```python
ocr_engine = PaddleOCR(
    use_angle_cls=True,
    lang='fr',
    use_gpu=True,  # Activer GPU
    show_log=False
)
```

#### Optimiser Ollama
```bash
# Augmenter le contexte
docker exec -it ollama ollama run mistral:7b --ctx-size 4096
```

### Changer de Modèle LLM

```bash
# Utiliser Mixtral 8x7B (nécessite 32GB RAM)
docker exec -it ollama ollama pull mixtral:8x7b

# Ou LLaMA 3
docker exec -it ollama ollama pull llama3:8b
```

Puis dans la base de données, mettre à jour la table `llm_prompts` :
```sql
UPDATE llm_prompts
SET model_name = 'mixtral:8x7b', is_active = true
WHERE version = 'v1.0';
```

## Monitoring

### Logs
```bash
# Docker
docker-compose logs -f extraction-service

# Manuel
tail -f /var/log/extraction-service.log
```

### Métriques
- Endpoint `/metrics` (Prometheus compatible, à activer)
- Dashboard Grafana disponible dans `/monitoring`

## Troubleshooting

### Erreur "No text could be extracted"
- Vérifier qualité de l'image/PDF
- Augmenter la résolution (DPI)
- Vérifier langue OCR (français par défaut)

### Ollama ne répond pas
```bash
# Vérifier le statut
curl http://localhost:11434

# Redémarrer
docker-compose restart ollama
```

### Mémoire insuffisante
- Réduire le batch size OCR
- Utiliser un modèle LLM plus petit (mistral:7b → phi:3b)
- Augmenter la swap

## Architecture

Voir `ARCHITECTURE_EXTRACTION.md` pour l'architecture complète du système.

## Évolution du Système

Le système s'améliore automatiquement :
1. Chaque correction utilisateur est enregistrée
2. Les patterns fréquents sont détectés
3. Le prompt LLM s'adapte par fournisseur
4. La précision augmente avec l'utilisation

## Support

Pour toute question ou problème :
- Vérifier les logs
- Consulter la documentation complète
- Ouvrir une issue sur le projet
