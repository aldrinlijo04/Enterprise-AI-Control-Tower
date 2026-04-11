"""
Predictive Maintenance Service — FastAPI
Port: 8003
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import logging

from predictor import get_predictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("maintenance_service")

app = FastAPI(
    title="AION Predictive Maintenance Service",
    description="Random Forest based failure prediction for industrial equipment",
    version="1.0.0",
)

predictor = get_predictor()


# ─── Request Models ──────────────────────────────────────────
class SensorReading(BaseModel):
    equipment_id: Optional[str]   = None
    plant_id:     Optional[str]   = None
    temperature:  Optional[float] = None
    pressure:     Optional[float] = None
    vibration:    Optional[float] = None
    bearing_temp: Optional[float] = None
    oil_level_pct:Optional[float] = None
    rpm:          Optional[float] = None
    noise_db:     Optional[float] = None
    power_factor: Optional[float] = None
    # Also accept other fields passthrough
    model_config = {"extra": "allow"}


class BatchRequest(BaseModel):
    readings: List[SensorReading]


# ─── Endpoints ───────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "service": "maintenance_service",
        "status": "UP",
        "model_fitted": predictor._fitted,
    }


@app.post("/predict")
def predict(reading: SensorReading):
    """Predict failure probability for a single equipment reading."""
    result = predictor.predict(reading.model_dump())
    return result


@app.post("/predict/batch")
def predict_batch(req: BatchRequest):
    """Predict failure for multiple equipment readings."""
    results = [predictor.predict(r.model_dump()) for r in req.readings]
    critical = [r for r in results if r["status"] == "CRITICAL"]
    warnings  = [r for r in results if r["status"] == "WARNING"]
    return {
        "total":    len(results),
        "critical": len(critical),
        "warnings": len(warnings),
        "results":  results,
    }


@app.post("/predict/fleet")
def predict_fleet(payload: Dict[str, Any]):
    """
    Fleet-wide maintenance analysis.
    Expects: { plant_id, equipment_readings: [{equipment_id, ...sensor_data}] }
    Returns ranked list by failure risk.
    """
    plant_id  = payload.get("plant_id", "?")
    readings  = payload.get("equipment_readings", [])

    if not readings:
        raise HTTPException(400, "equipment_readings required")

    results = []
    for r in readings:
        r["plant_id"] = plant_id
        results.append(predictor.predict(r))

    # Sort by failure probability desc
    results.sort(key=lambda x: x["failure_probability"], reverse=True)

    return {
        "plant_id":             plant_id,
        "total_equipment":      len(results),
        "critical_count":       sum(1 for r in results if r["status"] == "CRITICAL"),
        "warning_count":        sum(1 for r in results if r["status"] == "WARNING"),
        "fleet_health_score":   round(
            (1 - sum(r["failure_probability"] for r in results) / max(len(results), 1)) * 100, 1
        ),
        "ranked_equipment":     results,
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True, log_level="info")
