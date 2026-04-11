"""
Forecasting Service — FastAPI
Port: 8002
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import logging

from forecaster import get_forecaster

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("forecasting_service")

app = FastAPI(
    title="AION Forecasting Service",
    description="Time-series forecasting for OT metrics and IT business KPIs",
    version="1.0.0",
)

forecaster = get_forecaster()


# ─── Request Models ──────────────────────────────────────────
class ForecastRequest(BaseModel):
    values:     List[float] = Field(..., min_length=2, description="Historical time series values")
    horizon:    int         = Field(default=6, ge=1, le=48, description="Steps to forecast ahead")
    metric:     str         = Field(default="value", description="Metric name for labeling")
    timestamps: Optional[List[str]] = Field(default=None)


class MultiForecastRequest(BaseModel):
    series: Dict[str, List[float]] = Field(..., description="Map of metric_name -> historical values")
    horizon: int = Field(default=6, ge=1, le=48)


# ─── Endpoints ───────────────────────────────────────────────
@app.get("/health")
def health():
    return {"service": "forecasting_service", "status": "UP"}


@app.post("/forecast")
def forecast(req: ForecastRequest):
    """Forecast a single time series."""
    result = forecaster.forecast(
        values=req.values,
        horizon=req.horizon,
        metric=req.metric,
        timestamps=req.timestamps,
    )
    return result


@app.post("/forecast/multi")
def forecast_multi(req: MultiForecastRequest):
    """Forecast multiple metrics at once."""
    results = {}
    for metric, values in req.series.items():
        results[metric] = forecaster.forecast(
            values=values,
            horizon=req.horizon,
            metric=metric,
        )
    return {"forecasts": results, "horizon": req.horizon}


@app.post("/forecast/equipment")
def forecast_equipment(payload: Dict[str, Any]):
    """
    Forecast key OT metrics for an equipment.
    Expects: { equipment_id, plant_id, readings: [{temperature: X, vibration: Y, ...}, ...], horizon }
    """
    readings = payload.get("readings", [])
    horizon  = payload.get("horizon", 6)
    equip    = payload.get("equipment_id", "?")
    plant    = payload.get("plant_id", "?")

    if not readings:
        raise HTTPException(400, "readings array required")

    metrics = ["temperature", "vibration", "bearing_temp", "pressure", "oil_level_pct", "power_kw"]
    forecasts = {}

    for m in metrics:
        vals = [r.get(m) for r in readings if r.get(m) is not None]
        if len(vals) >= 2:
            forecasts[m] = forecaster.forecast(vals, horizon=horizon, metric=m)

    # Determine overall outlook
    critical_trends = [
        m for m, f in forecasts.items()
        if f.get("trend") == "INCREASING" and m in ("temperature", "vibration", "bearing_temp")
    ]

    return {
        "equipment_id":   equip,
        "plant_id":       plant,
        "horizon_steps":  horizon,
        "forecasts":      forecasts,
        "critical_trends": critical_trends,
        "outlook":        "DEGRADING" if critical_trends else "STABLE",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True, log_level="info")
