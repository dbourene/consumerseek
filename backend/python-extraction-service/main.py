"""
Service d'extraction intelligente de factures d'électricité
OCR + LLM avec apprentissage continu
"""
import os
import requests
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

def call_llm_chat(system_prompt: str, user_prompt: str, model: str, temperature: float):
    """
    Appelle Ollama pour générer une réponse LLM.
    """
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "options": {
            "temperature": temperature,
            "num_predict": 1000
        },
        "stream": False
    }
    r = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=120)
    r.raise_for_status()
    return r.json()

# Initialize services
app = FastAPI(title="Facture Extraction Service", version="1.0.0")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

@app.get("/extract/test")
async def test_extract():
    """
    Endpoint minimal pour vérifier que le service tourne.
    """
    return {"status": "ok", "message": "Service opérationnel"}

@app.post("/extract/invoice")
async def extract_invoice_endpoint(payload: dict):
    """
    Endpoint pour tester l'extraction d'une facture via le LLM.
    """
    prompt = payload.get("ocr_text", "")
    if not prompt:
        raise HTTPException(status_code=400, detail="OCR text is required")

    prompt_config = {"model_name": "mistral:7b-instruct-q4_K_M", "prompt_template": "{ocr_text}"}
    result = extract_invoice_data(prompt, prompt_config, LLM_TEMPERATURE)
    return result

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

# === NOUVELLES CLASSES PYDANTIC (à ajouter après les imports) ===
class TarifFourniture(BaseModel):
    tarif_base_parkwh: Optional[float] = Field(None, description="Tarif unique de fourniture c€/kWh")
    tarif_hp_parkwh: Optional[float] = Field(None, description="Tarif Heures Pleines c€/kWh")
    tarif_hc_parkwh: Optional[float] = Field(None, description="Tarif Heures Creuses c€/kWh")
    tarif_hph_parkwh: Optional[float] = Field(None, description="Tarif Heures Pleines Hiver c€/kWh")
    tarif_hch_parkwh: Optional[float] = Field(None, description="Tarif Heures Creuses Hiver c€/kWh")
    tarif_hpb_parkwh: Optional[float] = Field(None, description="Tarif Heures Pleines Eté c€/kWh")
    tarif_hcb_parkwh: Optional[float] = Field(None, description="Tarif Heures Creuses Eté c€/kWh")
    tarif_pointe_parkwh: Optional[float] = Field(None, description="Tarif Pointe")

class TarifAcheminement(BaseModel):
    montant_acheminement_part_fixe: Optional[float] = Field(None, description="Montant acheminement part Fixe en €")
    montant_acheminement_part_variable: Optional[float] = Field(None, description="Montant acheminement part Variable €")
    
class Consommation(BaseModel):
    conso_totale: Optional[float] = Field(None, description="Consommation totale en kWh")
    conso_hp: Optional[float] = Field(None, description="Consommation Heures Pleines en kWh")
    conso_hc: Optional[float] = Field(None, description="Consommation Heures Creuses en kWh")
    conso_hph: Optional[float] = Field(None, description="Consommation Heures Pleines Hiver en kWh")
    conso_hch: Optional[float] = Field(None, description="Consommation Heures Creuses Hiver en kWh")
    conso_hpb: Optional[float] = Field(None, description="Consommation Heures Pleines Eté en kWh")
    conso_hcb: Optional[float] = Field(None, description="Consommation Heures Creuses Eté en kWh")
    conso_pointe: Optional[float] = Field(None, description="Consommation Pointe en kWh")

class InvoiceData(BaseModel):
    fournisseur: Optional[str] = Field(None, description="Nom du fournisseur")
    pdl: Optional[str] = Field(None, description="Numéro PDL à 14 chiffres")
    pdl_adresse: Optional[str] = Field(None, description="Adresse complète du PDL")
    type: Optional[str] = Field(None, description="Type de consommateur (particulier, professionnel)")
    annee: Optional[int] = Field(None, description="Année de la facture")
    periode_debut: Optional[str] = Field(None, description="Date de début de période (YYYY-MM-DD)")
    periode_fin: Optional[str] = Field(None, description="Date de fin de période (YYYY-MM-DD)")
    type_compteur: Optional[str] = Field(None, description="Type de compteur")
    puissance_souscrite_kva: Optional[float] = Field(None, description="Puissance souscrite en kVA")
    classe_temporelle_tarifaire: Optional[str] = Field(None, description="Temporalité : Base (TU); HP/HC (DT); 4 tarifs HPH/HCH/HPB/HCB (4T); 5 tarifs idem et pointe (5T), Autres")
    offpeak_hours: Optional[str] = Field(None, description="Indique les plages d'heures creuses pour la distribution lorsqu'il y en a. Par exemple : HC (1H00-7H00;14H00-16H00) ou  HC (22H00-6H00)")
    distribution_tariff: Optional[str] = Field(None, description="Type de distribution tarifaire : BTINFCUST (Tarif courte utilisation sans différenciation temporelle), BTINFCUDT : Tarif courte utilisation heures pleines heures creuses, BTINFMUST (Tarif moyenne utilisation sans différenciation temporelle), BTINFMUDT (Tarif moyenne utilisation heures pleines heures creuses), BTINFLUST (Tarif longue utilisation sans différenciation temporelle), BTINFLUDT (Tarif longue utilisation heures pleines heures creuses), BTINFCU4 (Tarif courte utilisation heures pleines heures creuses associées à deux saisons), BTINFMU4 (Tarif moyenne utilisation heures pleines heures creuses associées à deux saisons).")
    conso: Optional[Consommation] = Field(default_factory=Consommation)
    tarif_fourniture: Optional[TarifFourniture] = Field(default_factory=TarifFourniture)
    tarif_abonnement: Optional[float] = Field(None, description="Tarif d'abonnement hors acheminement en €/mois")
    montant_acheminement_ht: Optional[TarifAcheminement] = Field(default_factory=TarifAcheminement)
    tarif_cta_parkwh: Optional[float] = Field(None, description="Tarif CTA en c€/kWh")
    montant_cta: Optional[float] = Field(None, description="Montant CTA en €")
    tarif_cee: Optional[float] = Field(None, description="Tarif CEE en c€/kWh")
    conso_cee: Optional[float] = Field(None, description="Consommation liée aux CEE en kWh")
    tarif_obligation_de_capacite: Optional[float] = Field(None, description="Tarif Obligation de Capacité en c€/kWh")
    montant_onbligation_de_capacite: Optional[float] = Field(None, description="Montant Obligation de Capacité en €")
    tarif_garantie_origine: Optional[float] = Field(None, description="Tarif Garantie d'Origine en c€/kWh")
    prix_total_ht: Optional[float] = Field(None, description="Prix total HT")
    prix_total_ttc: Optional[float] = Field(None, description="Prix total TTC")
    montant_fourniture_ht: Optional[float] = Field(None, description="Montant fourniture HT")
    montant_acheminement_ht: Optional[float] = Field(None, description="Montant acheminement HT")
    montant_taxes_et_contributions: Optional[float] = Field(None, description="Montant taxes et contributions")
    montant_TVA: Optional[float] = Field(None, description="Montant TVA")
    accise: Optional[float] = Field(None, description="Montant accise en €")
    montant_accise: Optional[float] = Field(None, description="Montant accise en €")

    @validator('temporalite')
    def validate_temporalite(cls, v):
        if v not in [None, 'base', 'hp_hc', 'tempo', 'ejp']:
            raise ValueError("Temporalité invalide")
        return v

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
  "fournisseur": "nom du fournisseur (ex: EDF, Engie, TotalEnergies)",
  "pdl": "numéro PDL à 14 chiffres",
  "pdl_adresse": "adresse complète du PDL",
  "type": "type de consommateur (particulier, professionnel)",
  "annee": année en entier (ex: 2023),
  "periode_debut": "date de début de période (format YYYY-MM-DD)",
  "periode_fin": "date de fin de période (format YYYY-MM-DD)",
  "type_compteur": "type de compteur (ex: Linky, HTA SAPHIR, etc.)",
  "puissance_souscrite_kva": nombre,
  "classe_temporelle_tarifaire": "uniquement l'une de ces valeurs : Base (TU); HP/HC (DT); 4 tarifs HPH/HCH/HPB/HCB (4T); 5 tarifs idem et pointe (5T), Autres",
  "offpeak_hours": "Indique les plages d'heures creuses pour la distribution lorsqu'il y en a selon le format HC (1H00-7H00;14H00-16H00) ou  HC (22H00-6H00)",
  "distribution_tariff": "type de distribution tarifaire : BTINFCUST (Tarif courte utilisation sans différenciation temporelle), BTINFCUDT : Tarif courte utilisation heures pleines heures creuses, BTINFMUST (Tarif moyenne utilisation sans différenciation temporelle), BTINFMUDT (Tarif moyenne utilisation heures pleines heures creuses), BTINFLUST (Tarif longue utilisation sans différenciation temporelle), BTINFLUDT (Tarif longue utilisation heures pleines heures creuses), BTINFCU4 (Tarif courte utilisation heures pleines heures creuses associées à deux saisons), BTINFMU4 (Tarif moyenne utilisation heures pleines heures creuses associées à deux saisons).",

  "conso": {{
    "conso_totale": nombre,  // Consommation totale en kWh
    "conso_hp": nombre,      // Consommation Heures Pleines en kWh (optionnel)
    "conso_hc": nombre,      // Consommation Heures Creuses en kWh (optionnel)
    "conso_hph": nombre,      // Consommation Heures Pleines hiver en kWh (optionnel)
    "conso_hch": nombre,      // Consommation Heures Creuses hiver en kWh (optionnel)
    "conso_hpb": nombre,      // Consommation Heures Pleines été en kWh (optionnel)
    "conso_hcb": nombre,      // Consommation Heures Creuses été en kWh (optionnel)
    "conso_pointe": nombre   // Consommation Pointe en kWh (optionnel)
  }},

  "tarif_fourniture": {{
    "tarif_base_parkwh": nombre,  // Tarif unique en €/kWh (optionnel)
    "tarif_hp_parkwh": nombre,     // Tarif Heures Pleines en c€/kWh (optionnel)
    "tarif_hc_parkwh": nombre      // Tarif Heures Creuses en c€/kWh (optionnel)
    "tarif_hph_parkwh": nombre,     // Tarif Heures Pleines hiver en c€/kWh (optionnel)
    "tarif_hch_parkwh": nombre,     // Tarif Heures Creuses hiver en c€/kWh (optionnel)
    "tarif_hpb_parkwh": nombre,     // Tarif Heures Pleines été en c€/kWh (optionnel)
    "tarif_hcb_parkwh": nombre,     // Tarif Heures Creuses été en c€/kWh (optionnel)
    "tarif_pointe_parkwh": nombre   // Tarif Pointe en c€/kWh (optionnel)
  }},

  "tarif_abonnement": nombre,  // Tarif d'abonnement hors acheminement en €/mois

  "tarif_acheminement": {{
    "montant_acheminement_part_fixe": nombre,  // Montant acheminement part fixe en € (optionnel)
    "montant_acheminement_part_variable": nombre,      // Montant acheminement part variable en € (optionnel)
    "tarif_cta_parkwh": nombre       // Tarif CTA en c€/kWh (optionnel)
  }},

  "tarif_cee": nombre,                  // Tarif CEE en € (optionnel)
  "conso_cee": nombre,                  // Consommation liée aux CEE en kWh (optionnel)
  "tarif_obligation_de_capacite": nombre,  // Tarif Obligation de Capacité en c€/kWh (optionnel)
  "montant_obligation_de_capacite": nombre, // Montant Obligation de Capacité en € (optionnel)
  "tarif_garantie_origine": nombre,     // Tarif Garantie d'Origine en € (optionnel)
  "tarif_cta_parkwh": nombre,          // Tarif CTA en c€/kWh (optionnel)
  "montant_cta": nombre,               // Montant CTA en € (optionnel)

  "prix_total_ht": nombre,              // Prix total HT en €
  "prix_total_ttc": nombre,             // Prix total TTC en €
  "montant_fourniture_ht": nombre,      // Montant fourniture HT en €
  "montant_acheminement_ht": nombre,    // Montant acheminement HT en €
  "montant_taxes_et_contributions": nombre, // Montant taxes et contributions en €
  "montant_TVA": nombre,               // Montant TVA en €

  "accise": nombre                       // Montant accise en c€/kWh (optionnel)
  "montant_accise": nombre               // Montant accise en € (optionnel)
}}

Règles supplémentaires :
- Si "temporalite" est "base", alors seuls les champs "unique" dans "conso" et "tarif_fourniture" sont attendus.
- Si "temporalite" est "hp_hc", alors les champs "hp" et "hc" sont attendus dans "conso" et "tarif_fourniture".
- Utiliser null pour les valeurs manquantes ou non applicables.
- Retourner UNIQUEMENT du JSON valide, sans texte supplémentaire.''',
        'model_name': 'mistral:7b-instruct-q4_K_M'
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
    for pattern in patterns[:3]:
        if pattern.get('regex_specifiques'):
            context += f"- {pattern.get('field_name', 'field')}: utiliser regex '{pattern.get('regex_specifiques')}'\n"
        if pattern.get('exemple_champs'):
            champ_exemple = pattern.get('exemple_champs')
            if isinstance(champ_exemple, dict):
                context += f"Exemple de structure pour {pattern.get('field_name')}: {json.dumps(champ_exemple)}\n"
            else:
                context += f"Exemple pour {pattern.get('field_name')}: {champ_exemple}\n"

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

    return extract_invoice_data(prompt, prompt_config, LLM_TEMPERATURE)

    # Call Ollama
def extract_invoice_data(prompt: str, prompt_config: dict, LLM_TEMPERATURE: float):
    try:
        response = call_llm_chat(
            system_prompt="Tu es un expert en extraction de données de factures. Réponds UNIQUEMENT avec du JSON valide.",
            user_prompt=prompt,
            model=prompt_config.get('model_name', 'mistral:7b-instruct-q4_K_M'),
            temperature=LLM_TEMPERATURE
        )

        content = response['message']['content']

        # Extraire le JSON de la réponse
        start_idx = content.find('{')
        end_idx = content.rfind('}') + 1

        if start_idx != -1 and end_idx != 0:
            json_str = content[start_idx:end_idx]
            invoice_Data = InvoiceData(**json.loads(json_str))
            return invoice_Data.dict(exclude_none=True)
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
    
    # Gérer les champs imbriqués
    if isinstance(value, dict):
        confidences = []
        for sub_key, sub_value in value.items():
            if sub_value is not None:
                sub_value_str = str(sub_value).lower()
                for box in ocr_boxes:
                    if sub_value_str in box['text'].lower():
                        confidences.append(box['confidence'])
                        break
        return sum(confidences) / len(confidences) if confidences else 0.7

    # Gérer les champs simples
    value_str = str(value).lower()
    for box in ocr_boxes:
        if value_str in box['text'].lower():
            return box['confidence']

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

    numeric_fields = [
        'tarif_base_parkwh', 'tarif_hp_parkwh', 'tarif_hc_parkwh', 'tarif_hph_parkwh', 'tarif_hch_parkwh', 'tarif_hpb_parkwh', 'tarif_hcb_parkwh', 'tarif_pointe_parkwh',
        'tarif_cta_parkwh', 'montant_cta', 'tarif_cee', 'conso_cee',
        'tarif_obligation_de_capacite', 'montant_obligation_de_capacite', 'tarif_garantie_origine',
        'conso_totale', 'conso_hp', 'conso_hc', 'conso_hph', 'conso_hch', 'conso_hpb', 'conso_hcb', 'conso_pointe',
        'puissance_souscrite_kva', 'tarif_abonnement', 'prix_total_ht', 'prix_total_ttc',
        'montant_fourniture_ht', 'montant_acheminement_ht', 'montant_taxes_et_contributions',
        'montant_TVA', 'accise', 'montant_accise', 
    ]

    for field in numeric_fields:
        if field in update_data and update_data[field] is not None:
            update_data[field] = str(update_data[field])  # Conversion en string pour Supabase

    # Convertir les champs imbriqués en JSON pour Supabase
    if 'conso' in update_data:
        update_data['conso'] = json.dumps(update_data['conso'])
    if 'tarif_fourniture' in update_data:
        update_data['tarif_fourniture'] = json.dumps(update_data['tarif_fourniture'])
    if 'tarif_acheminement' in update_data:
        update_data['tarif_acheminement'] = json.dumps(update_data['tarif_acheminement'])    

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
        # Téléchargement du fichier
        file_bytes = await download_file(request.file_url)

        # Déterminer si c'est un PDF ou une image
        is_pdf = request.file_url.lower().endswith('.pdf')
        full_text = ""
        all_ocr_boxes = []
        all_ocr_words = []
        page_confidences = []

        # Conversion et traitement
        if is_pdf:
            images = pdf_to_images(file_bytes, dpi=300)
            if not images:
                raise HTTPException(status_code=400, detail="Aucune page trouvée dans le PDF")

            for page_num, image in enumerate(images):
                image_array = image_to_numpy(image)
                ocr_data = extract_text_with_ocr(image_array)

                if not ocr_data['text']:
                    logger.warning(f"Aucun texte extrait de la page {page_num + 1}")
                    continue

                full_text += f"\n--- PAGE {page_num + 1} ---\n{ocr_data['text']}\n"
                all_ocr_boxes.extend(ocr_data['boxes'])
                all_ocr_words.extend(ocr_data['words'])
                page_confidences.append(ocr_data['confidence'])

            if not full_text.strip():
                raise HTTPException(status_code=400, detail="Aucun texte extrait du document")

            avg_ocr_confidence = sum(page_confidences) / len(page_confidences) if page_confidences else 0.0
            ocr_metadata = {
                'text': full_text,
                'confidence': avg_ocr_confidence,
                'boxes': all_ocr_boxes,
                'words': all_ocr_words
            }
        else:
            image = Image.open(BytesIO(file_bytes))
            image_array = image_to_numpy(image)
            ocr_metadata = extract_text_with_ocr(image_array)

            if not ocr_metadata['text']:
                raise HTTPException(status_code=400, detail="Aucun texte extrait du document")

        # Extraction avec le LLM
        extracted_data = await parse_with_llm(ocr_metadata['text'], request.supplier_hint)

        # Calcul des confiances
        field_confidences = {}
        for field, value in extracted_data.items():
            if isinstance(value, dict):
                for sub_field, sub_value in value.items():
                    field_confidences[f"{field}.{sub_field}"] = calculate_field_confidence(sub_field, sub_value, ocr_metadata['boxes'])
            else:
                field_confidences[field] = calculate_field_confidence(field, value, ocr_metadata['boxes'])

        # Calcul de la confiance globale
        valid_confidences = [c for c in field_confidences.values() if c > 0]
        global_confidence = sum(valid_confidences) / len(valid_confidences) if valid_confidences else 0.0
        blended_confidence = (ocr_metadata['confidence'] * 0.4 + global_confidence * 0.6)

        # Récupération de la version du prompt
        prompt_config = await get_active_prompt()

        # Sauvegarde en base de données
        extraction_id = await save_extraction_to_db(
            request.facture_id,
            ocr_metadata,
            extracted_data,
            prompt_config['version']
        )

        # Mise à jour de la facture en arrière-plan
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
                'total_words': len(ocr_metadata['words']),
                'avg_confidence': round(ocr_metadata['confidence'], 2),
                'total_pages': len(page_confidences) if is_pdf else 1
            }
        )

    except Exception as e:
        logger.error(f"Erreur d'extraction: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'extraction: {str(e)}")


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