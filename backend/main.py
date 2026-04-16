"""

Plant AI — FastAPI Backend (Integrated with ElevenLabs Voice Agent)

"""

import os
import sys
import tempfile
import base64

from dotenv import load_dotenv
from groq import Groq

sys.path.insert(0, os.path.dirname(__file__))

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path

from models.ai_models import PlantAIEngine
from services.chat_service import ask

load_dotenv()

# ── env vars ────────────────────────────────────────────────

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "")

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

engine: PlantAIEngine = None


# ── lifespan ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    print("🚀 Training all AI models on OT/IT/Maintenance data...")
    engine = PlantAIEngine()
    print("✅ All 7 models ready.")
    yield


# ── app setup ───────────────────────────────────────────────

app = FastAPI(
    title="Plant AI API",
    description="Multi-model industrial AI — OT + IT + Maintenance + Voice",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files if the frontend directory exists
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


# ── request models ──────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []


class AudioRequest(BaseModel):
    audio_b64: str  # base64 encoded audio


# ── root ────────────────────────────────────────────────────

@app.get("/")
async def root():
    # Serve frontend index if available, otherwise return API status
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {
        "status": "Plant AI API running",
        "models": 7,
        "data_records": len(engine.ot_df),
        "voice_agent": bool(ELEVENLABS_AGENT_ID),
    }


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# ── plant data routes ────────────────────────────────────────

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


# ── chat route ───────────────────────────────────────────────

@app.post("/api/chat")
def chat(req: ChatRequest):
    snapshot = engine.latest_snapshot()
    report = engine.full_report()
    reply = ask(req.message, snapshot, report, req.history)
    return {"reply": reply}


# ── groq transcription route ─────────────────────────────────

@app.post("/api/transcribe")
def transcribe(req: AudioRequest):
    try:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise HTTPException(400, "GROQ_API_KEY not found in environment.")

        client = Groq(api_key=key)
        audio_bytes = base64.b64decode(req.audio_b64)

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


# ── elevenlabs voice agent routes ────────────────────────────

@app.get("/api/voice/config")
async def voice_config() -> dict:
    """Return ElevenLabs agent config for the frontend."""
    return {
        "agent_id": ELEVENLABS_AGENT_ID,
        "has_api_key": bool(ELEVENLABS_API_KEY),
    }


@app.get("/api/voice/signed-url")
async def voice_signed_url() -> dict:
    """
    Generate a signed URL for a secure ElevenLabs conversation session.
    Call this from the frontend before starting a voice conversation.
    """
    if not ELEVENLABS_API_KEY:
        raise HTTPException(400, "Missing ELEVENLABS_API_KEY in environment.")
    if not ELEVENLABS_AGENT_ID:
        raise HTTPException(400, "Missing ELEVENLABS_AGENT_ID in environment.")

    api_url = "https://api.elevenlabs.io/v1/convai/conversation/get_signed_url"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                api_url,
                params={"agent_id": ELEVENLABS_AGENT_ID},
                headers={"xi-api-key": ELEVENLABS_API_KEY},
            )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"ElevenLabs API error: {exc.response.text}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Network error: {exc}") from exc

    payload = response.json()
    signed_url = payload.get("signed_url")
    if not signed_url:
        raise HTTPException(502, "No signed_url returned by ElevenLabs.")

    return {"signed_url": signed_url}


@app.get("/api/voice/plant-context")
def voice_plant_context() -> dict:
    """
    Live plant context endpoint — register this as a webhook/tool inside
    your ElevenLabs agent dashboard so the voice agent can query real-time
    plant data mid-conversation.

    Example tool config in ElevenLabs:
        Name:        get_plant_status
        Method:      GET
        URL:         https://your-domain.com/api/voice/plant-context
    """
    snapshot = engine.latest_snapshot()
    report = engine.full_report()

    # Pull top anomalies for voice summary
    anomaly_result = engine.anomaly.predict(engine.ot_df)
    df = engine.ot_df.copy()
    df["anomaly_flag"] = anomaly_result["anomaly_flags"]
    df["anomaly_score"] = anomaly_result["anomaly_scores"]
    top_anomalies = (
        df[df["anomaly_flag"] == 1]
        [["equipment_id", "plant_id", "temperature", "pressure", "vibration", "anomaly_score"]]
        .head(5)
        .to_dict("records")
    )

    # Pull high-risk maintenance items
    maint_result = engine.maintenance.predict(engine.ot_df)
    maint_df = engine.ot_df.copy().tail(50)
    maint_df["rul_hours"] = maint_result["rul_hours"][:50]
    maint_df["risk_level"] = maint_result["risk_level"][:50]
    high_risk = (
        maint_df[maint_df["risk_level"] == "HIGH"]
        [["equipment_id", "plant_id", "rul_hours", "risk_level"]]
        .head(5)
        .to_dict("records")
    )

    return {
        "snapshot": snapshot,
        "report_summary": report,
        "top_anomalies": top_anomalies,
        "high_risk_equipment": high_risk,
    }