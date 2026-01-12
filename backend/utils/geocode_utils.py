# backend/utils/geocode_utils.py
# Geocoding utility functions

import requests

def geocode_adresse(adresse, code_commune):
    url = "https://api-adresse.data.gouv.fr/search/"
    params = {"q": adresse, "citycode": code_commune, "limit": 1}
    resp = requests.get(url, params=params)
    if resp.status_code != 200:
        return None, None, "ERROR", 0
    data = resp.json()
    if data["features"]:
        coords = data["features"][0]["geometry"]["coordinates"]  # [lon, lat]
        score = data["features"][0]["properties"].get("score", 0)
        return coords[1], coords[0], "OK", score
    else:
        return None, None, "TO_VALIDATE", 0
