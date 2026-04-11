"""
Plant AI — FastAPI Backend
"""

import os
import sys
import tempfile
import base64

from dotenv import load_dotenv
from groq import Groq

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import Optional, List

from models.ai_models import PlantAIEngine
from services.chat_service import ask

load_dotenv()

engine: PlantAIEngine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    print("🚀 Training all AI models on OT/IT/Maintenance data...")
    engine = PlantAIEngine()
    print("✅ All 7 models ready.")
    yield


app = FastAPI(
    title="Plant AI API",
    description="Multi-model industrial AI — OT + IT + Maintenance",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── request models ──────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []


class AudioRequest(BaseModel):
    audio_b64: str  # base64 encoded audio


# ── routes ──────────────────────────────────────────────────

@app.get("/api/snapshot")
def get_snapshot():
    return engine.latest_snapshot()


@app.get("/api/report")
def get_report():
    return engine.full_report()


@app.get("/api/report/{module}")
def get_module_report(module: str):
    report = engine.full_report()
    if module not in report:
        raise HTTPException(404, f"Module '{module}' not found. Valid: {list(report.keys())}")
    return {module: report[module]}


@app.get("/api/data/ot")
def get_ot_sample():
    df = engine.ot_df.tail(20)
    return df.to_dict("records")


@app.get("/api/data/anomalies")
def get_anomalies():
    result = engine.anomaly.predict(engine.ot_df)
    df = engine.ot_df.copy()
    df["anomaly_flag"] = result["anomaly_flags"]
    df["anomaly_score"] = result["anomaly_scores"]
    anomalies = df[df["anomaly_flag"] == 1][
        ["timestamp", "plant_id", "equipment_id",
         "temperature", "pressure", "vibration", "anomaly_score"]
    ].head(20)
    anomalies["timestamp"] = anomalies["timestamp"].astype(str)
    return anomalies.to_dict("records")


@app.get("/api/data/maintenance")
def get_maintenance():
    result = engine.maintenance.predict(engine.ot_df)
    df = engine.ot_df.copy().tail(20)
    df["rul_hours"] = result["rul_hours"][:20]
    df["risk_level"] = result["risk_level"][:20]
    df["timestamp"] = df["timestamp"].astype(str)
    return df[["timestamp", "equipment_id", "plant_id", "rul_hours", "risk_level"]].to_dict("records")


@app.get("/api/data/failure")
def get_failure():
    result = engine.failure.predict(engine.ot_df)
    df = engine.ot_df.copy().tail(20)
    df["failure_label"] = result["failure_labels"][:20]
    df["failure_prob"] = result["failure_prob"][:20]
    df["failure_horizon"] = result["failure_horizon"][:20]
    df["timestamp"] = df["timestamp"].astype(str)
    return df[["timestamp", "equipment_id", "plant_id",
               "failure_label", "failure_prob", "failure_horizon"]].to_dict("records")


@app.post("/api/chat")
def chat(req: ChatRequest):
    snapshot = engine.latest_snapshot()
    report = engine.full_report()
    reply = ask(req.message, snapshot, report, req.history)
    return {"reply": reply}


@app.post("/api/transcribe")
def transcribe(req: AudioRequest):
    try:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise HTTPException(400, "GROQ_API_KEY not found in environment.")

        client = Groq(api_key=key)
        audio_bytes = base64.b64decode(req.audio_b64)

        # If your frontend sends WAV, keep .wav.
        # If it sends WebM, change this suffix to .webm.
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-large-v3-turbo",
                    language="en",
                    temperature=0.0,
                    response_format="verbose_json"
                )

            return {"text": transcription.text}

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Transcription failed: {str(e)}")


@app.get("/")
def root():
    return {"status": "Plant AI API running", "models": 7, "data_records": len(engine.ot_df)}