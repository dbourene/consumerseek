"""
Service d'extraction intelligente de factures d'électricité
OCR + LLM avec apprentissage continu
"""
import os
import json
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime
from io import BytesIO

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from paddleocr import PaddleOCR
from pdf2image import convert_from_bytes
import ollama
import httpx
from supabase import create_client, Client
from PIL import Image
import numpy as np

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OCR_CONFIDENCE_THRESHOLD = float(os.getenv("OCR_CONFIDENCE_THRESHOLD", "0.6"))
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))

# Initialize services
app = FastAPI(title="Facture Extraction Service", version="1.0.0")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize PaddleOCR (lazy loading)
ocr_engine = None

def get_ocr_engine():
    """Lazy initialization of OCR engine"""
    global ocr_engine
    if ocr_engine is None:
        ocr_engine = PaddleOCR(
            use_angle_cls=True,
            lang='fr',
            use_gpu=False,  # Set to True if GPU available
            show_log=False
        )
    return ocr_engine


# Pydantic models
class ExtractionRequest(BaseModel):
    facture_id: str
    file_url: str
    supplier_hint: Optional[str] = None


class CorrectionItem(BaseModel):
    extracted: Any
    corrected: Any


class LearningRequest(BaseModel):
    extraction_id: str
    facture_id: str
    corrections: Dict[str, CorrectionItem]


class ExtractionResponse(BaseModel):
    extraction_id: str
    extracted_data: Dict[str, Any]
    confidence: Dict[str, Any]
    ocr_metadata: Dict[str, Any]


# Helper functions
async def download_file(url: str) -> bytes:
    """Download file from URL"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


def pdf_to_images(pdf_bytes: bytes) -> List[Image.Image]:
    """Convert PDF to images"""
    return convert_from_bytes(pdf_bytes, dpi=300)


def image_to_numpy(image: Image.Image) -> np.ndarray:
    """Convert PIL Image to numpy array"""
    return np.array(image)


def extract_text_with_ocr(image: np.ndarray) -> Dict[str, Any]:
    """
    Extract text using PaddleOCR
    Returns: {
        'text': str,
        'confidence': float,
        'boxes': List[Dict],
        'words': List[str]
    }
    """
    ocr = get_ocr_engine()
    result = ocr.ocr(image, cls=True)

    if not result or not result[0]:
        return {
            'text': '',
            'confidence': 0.0,
            'boxes': [],
            'words': []
        }

    text_lines = []
    boxes = []
    words = []
    confidences = []

    for line in result[0]:
        box, (text, confidence) = line
        text_lines.append(text)
        words.extend(text.split())
        boxes.append({
            'box': box,
            'text': text,
            'confidence': confidence
        })
        confidences.append(confidence)

    full_text = '\n'.join(text_lines)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        'text': full_text,
        'confidence': avg_confidence,
        'boxes': boxes,
        'words': words
    }


async def get_active_prompt() -> Dict[str, Any]:
    """Fetch active LLM prompt from database"""
    result = supabase.table('llm_prompts')\
        .select('*')\
        .eq('is_active', True)\
        .limit(1)\
        .execute()

    if result.data and len(result.data) > 0:
        return result.data[0]

    # Fallback default prompt
    return {
        'version': 'v1.0',
        'prompt_template': '''Extraire toutes les informations de cette facture d'électricité française.

Texte OCR :
{ocr_text}

Extraire et retourner un objet JSON avec ces champs exacts :
{{
  "fournisseur": "nom du fournisseur",
  "pdl": "numéro PDL à 14 chiffres",
  "annee": année en entier,
  "periode_debut": "date YYYY-MM-DD",
  "periode_fin": "date YYYY-MM-DD",
  "type_compteur": "type de compteur",
  "puissance_souscrite_kva": nombre,
  "temporalite": "base, hp_hc, tempo, ou ejp",
  "conso_totale": nombre,
  "conso_base": nombre,
  "conso_hp": nombre,
  "conso_hc": nombre,
  "prix_total_ht": nombre,
  "prix_total_ttc": nombre,
  "tarif_abonnement": nombre,
  "montant_fourniture_ht": nombre,
  "montant_acheminement_ht": nombre,
  "contient_arenh": true/false,
  "contient_turpe": true/false
}}

Retourner UNIQUEMENT du JSON valide. Utiliser null pour les valeurs manquantes.''',
        'model_name': 'mistral:7b'
    }


async def get_supplier_patterns(supplier: str) -> List[Dict[str, Any]]:
    """Fetch learned patterns for a supplier"""
    result = supabase.table('patterns_fournisseurs')\
        .select('*')\
        .eq('nom_fournisseur', supplier)\
        .execute()

    return result.data if result.data else []


def build_few_shot_context(patterns: List[Dict[str, Any]], ocr_text: str) -> str:
    """Build few-shot examples from learned patterns"""
    if not patterns:
        return ""

    context = "\n\nExemples de patterns appris pour ce fournisseur :\n"
    for pattern in patterns[:3]:  # Limit to 3 examples
        if pattern.get('regex_specifiques'):
            context += f"- {pattern.get('field_name', 'field')}: utiliser regex ou patterns similaires\n"

    return context


async def parse_with_llm(ocr_text: str, supplier_hint: Optional[str] = None) -> Dict[str, Any]:
    """
    Parse OCR text using local LLM (Ollama + Mistral)
    Returns extracted structured data
    """
    # Get active prompt
    prompt_config = await get_active_prompt()

    # Get supplier patterns if hint provided
    few_shot_context = ""
    if supplier_hint:
        patterns = await get_supplier_patterns(supplier_hint)
        few_shot_context = build_few_shot_context(patterns, ocr_text)

    # Build final prompt
    prompt = prompt_config['prompt_template'].format(ocr_text=ocr_text)
    prompt += few_shot_context

    # Call Ollama
    try:
        response = ollama.chat(
            model=prompt_config.get('model_name', 'mistral:7b'),
            messages=[
                {
                    'role': 'system',
                    'content': 'Tu es un expert en extraction de données de factures. Réponds uniquement avec du JSON valide.'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            options={
                'temperature': LLM_TEMPERATURE,
                'num_predict': 1000
            }
        )

        # Extract JSON from response
        content = response['message']['content']

        # Try to find JSON in response
        start_idx = content.find('{')
        end_idx = content.rfind('}') + 1

        if start_idx != -1 and end_idx != 0:
            json_str = content[start_idx:end_idx]
            return json.loads(json_str)
        else:
            raise ValueError("No valid JSON found in LLM response")

    except Exception as e:
        print(f"LLM parsing error: {e}")
        return {}


def calculate_field_confidence(field_name: str, value: Any, ocr_boxes: List[Dict]) -> float:
    """
    Calculate confidence for a specific field based on OCR data
    """
    if value is None:
        return 0.0

    # Simple heuristic: check if value appears in OCR with good confidence
    value_str = str(value).lower()

    for box in ocr_boxes:
        if value_str in box['text'].lower():
            return box['confidence']

    # Default confidence if not found in OCR boxes
    return 0.7


async def save_extraction_to_db(
    facture_id: str,
    ocr_data: Dict[str, Any],
    llm_output: Dict[str, Any],
    model_version: str
) -> str:
    """Save raw extraction to database"""
    result = supabase.table('extractions_brutes').insert({
        'facture_id': facture_id,
        'ocr_text': ocr_data['text'],
        'ocr_confidence': ocr_data['confidence'],
        'ocr_metadata': {
            'total_words': len(ocr_data['words']),
            'total_boxes': len(ocr_data['boxes'])
        },
        'llm_raw_output': llm_output,
        'llm_model_version': model_version
    }).execute()

    return result.data[0]['id']


async def update_facture_with_extraction(facture_id: str, extracted_data: Dict[str, Any], confidence: float):
    """Update facture table with extracted data"""
    update_data = {
        **extracted_data,
        'statut_extraction': 'en_attente_validation',
        'confiance_globale': confidence,
        'necessite_validation': confidence < 0.8,
        'date_extraction': datetime.utcnow().isoformat()
    }

    supabase.table('factures').update(update_data).eq('id', facture_id).execute()


# API Endpoints
@app.get("/")
async def root():
    """Health check"""
    return {
        "service": "Facture Extraction Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.post("/extract", response_model=ExtractionResponse)
async def extract_facture(request: ExtractionRequest, background_tasks: BackgroundTasks):
    """
    Extract data from a facture
    Main extraction endpoint
    """
    try:
        # Download file
        file_bytes = await download_file(request.file_url)

        # Determine if PDF or image
        is_pdf = request.file_url.lower().endswith('.pdf')

        # Convert to images
        if is_pdf:
            images = pdf_to_images(file_bytes)
            image = images[0]  # Process first page
        else:
            image = Image.open(BytesIO(file_bytes))

        # Convert to numpy array
        image_array = image_to_numpy(image)

        # Perform OCR
        ocr_data = extract_text_with_ocr(image_array)

        if not ocr_data['text']:
            raise HTTPException(status_code=400, detail="No text could be extracted from the document")

        # Parse with LLM
        extracted_data = await parse_with_llm(ocr_data['text'], request.supplier_hint)

        # Calculate confidence per field
        field_confidences = {}
        for field, value in extracted_data.items():
            field_confidences[field] = calculate_field_confidence(field, value, ocr_data['boxes'])

        # Calculate global confidence
        valid_confidences = [c for c in field_confidences.values() if c > 0]
        global_confidence = sum(valid_confidences) / len(valid_confidences) if valid_confidences else 0.0

        # Blend OCR and field confidence
        blended_confidence = (ocr_data['confidence'] * 0.4 + global_confidence * 0.6)

        # Get prompt version
        prompt_config = await get_active_prompt()

        # Save to database
        extraction_id = await save_extraction_to_db(
            request.facture_id,
            ocr_data,
            extracted_data,
            prompt_config['version']
        )

        # Update facture in background
        background_tasks.add_task(
            update_facture_with_extraction,
            request.facture_id,
            extracted_data,
            blended_confidence
        )

        return ExtractionResponse(
            extraction_id=extraction_id,
            extracted_data=extracted_data,
            confidence={
                'global': round(blended_confidence, 2),
                'per_field': {k: round(v, 2) for k, v in field_confidences.items()}
            },
            ocr_metadata={
                'total_words': len(ocr_data['words']),
                'avg_confidence': round(ocr_data['confidence'], 2)
            }
        )

    except Exception as e:
        print(f"Extraction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/learn")
async def learn_from_corrections(request: LearningRequest):
    """
    Process user corrections and update learning system
    """
    try:
        # Save corrections to history
        for field_name, correction in request.corrections.items():
            supabase.table('historique_corrections').insert({
                'facture_id': request.facture_id,
                'extraction_brute_id': request.extraction_id,
                'field_name': field_name,
                'valeur_initiale': str(correction.extracted),
                'valeur_corrigee': str(correction.corrected)
            }).execute()

        # Get facture data to extract supplier
        facture = supabase.table('factures')\
            .select('fournisseur')\
            .eq('id', request.facture_id)\
            .single()\
            .execute()

        supplier = facture.data.get('fournisseur') if facture.data else None

        # Update patterns (simple frequency-based learning)
        if supplier:
            for field_name in request.corrections.keys():
                # Check if pattern exists
                pattern_result = supabase.table('patterns_fournisseurs')\
                    .select('*')\
                    .eq('nom_fournisseur', supplier)\
                    .eq('field_name', field_name)\
                    .execute()

                if pattern_result.data and len(pattern_result.data) > 0:
                    # Update existing pattern
                    pattern = pattern_result.data[0]
                    supabase.table('patterns_fournisseurs')\
                        .update({
                            'sample_count': pattern['sample_count'] + 1,
                            'last_updated': datetime.utcnow().isoformat()
                        })\
                        .eq('id', pattern['id'])\
                        .execute()

        return {
            "status": "success",
            "message": f"Learned from {len(request.corrections)} corrections"
        }

    except Exception as e:
        print(f"Learning error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
