# backend/routes/geocode.py
# Geocoding route for consommateurs

from fastapi import APIRouter
from pydantic import BaseModel
from utils.geocode_utils import geocode_adresse
from utils.supabase_client import update_consommateur_geocode

router = APIRouter()

class GeocodeRequest(BaseModel):
    id: int
    adresse: str
    code_commune: str

@router.post("/geocode_consommateurs")
def geocode_consommateurs(payload: list[GeocodeRequest]):
    results = []
    for item in payload:
        lat, lon, status, score = geocode_adresse(item.adresse, item.code_commune)
        if status == "OK":
            update_consommateur_geocode(item.id, lat, lon, status, score)
        results.append({
            "id": item.id,
            "status": status,
            "latitude": lat,
            "longitude": lon,
            "score": score
        })
    return {"results": results}
