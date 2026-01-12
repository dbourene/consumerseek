# backend/main.py
# Main application entry point

from fastapi import FastAPI
from routes import geocode

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "healthy"}

app.include_router(geocode.router)
