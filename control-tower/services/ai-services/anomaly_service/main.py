"""
Anomaly Detection Service — FastAPI
Port: 8001
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
import uvicorn
import logging

from detector import get_detector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("anomaly_service")

app = FastAPI(
    title="AION Anomaly Detection Service",
    description="Isolation Forest + threshold-based anomaly detection for OT sensor data",
    version="1.0.0",
)

detector = get_detector()


# ─── Request / Response models ───────────────────────────────
class OTRecord(BaseModel):
    timestamp:    Optional[str]   = None
    plant_id:     Optional[str]   = None
    equipment_id: Optional[str]   = None
    temperature:  Optional[float] = None
    pressure:     Optional[float] = None
    flow_rate:    Optional[float] = None
    vibration:    Optional[float] = None
    rpm:          Optional[float] = None
    bearing_temp: Optional[float] = None
    oil_level_pct:Optional[float] = None
    voltage:      Optional[float] = None
    current_a:    Optional[float] = None
    power_kw:     Optional[float] = None
    power_factor: Optional[float] = None
    noise_db:     Optional[float] = None


class BatchRequest(BaseModel):
    records: List[OTRecord]


# ─── Endpoints ───────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "service": "anomaly_service",
        "status": "UP",
        "model_fitted": detector._fitted,
        "history_size": len(detector._history),
    }


@app.post("/detect")
def detect_anomaly(record: OTRecord):
    """Detect anomaly in a single OT sensor reading."""
    result = detector.detect(record.model_dump())
    return result


@app.post("/detect/batch")
def detect_batch(req: BatchRequest):
    """Detect anomalies in a batch of OT records."""
    results = detector.detect_batch([r.model_dump() for r in req.records])
    anomalies = [r for r in results if r["is_anomaly"]]
    return {
        "total":      len(results),
        "anomalies":  len(anomalies),
        "results":    results,
    }


@app.get("/model/stats")
def model_stats():
    return {
        "fitted":       detector._fitted,
        "history_size": len(detector._history),
        "contamination": detector.contamination,
        "n_estimators": detector.n_estimators,
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True, log_level="info")
