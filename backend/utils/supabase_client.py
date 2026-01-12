# backend/utils/supabase_client.py
# Supabase client configuration and utility functions

import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is missing")

if not SUPABASE_KEY or not SUPABASE_KEY.strip():
    raise RuntimeError("SUPABASE_KEY is missing or empty")

# Sécurisation contre espaces / retours ligne
SUPABASE_KEY = SUPABASE_KEY.strip()

supabase: Client = create_client(
    supabase_url=SUPABASE_URL,
    supabase_key=SUPABASE_KEY
)

def update_consommateur_geocode(consommateur_id: int, lat: float, lon: float):
    return (
        supabase
        .table("consommateurs")
        .update({
            "latitude": lat,
            "longitude": lon,
            "geocode_status": "OK"
        })
        .eq("id", consommateur_id)
        .execute()
    )
