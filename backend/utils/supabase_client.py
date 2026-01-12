# backend/utils/supabase_client.py
# Supabase client configuration and utility functions

from supabase import create_client, Client
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")  # clé service role

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def update_consommateur_geocode(id, lat, lon, status, score):
    supabase.table("consommateurs").update({
        "latitude": lat,
        "longitude": lon,
        "geom_point": f"POINT({lon} {lat})",
        "geocode_status": status,
        "geocode_score": score
    }).eq("id", id).execute()
