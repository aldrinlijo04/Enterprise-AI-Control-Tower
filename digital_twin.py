"""
Digital Twin Module – Enterprise AI Control Tower
Person 3: Plant A Digital Twin Simulation

UPGRADED: Bootstraps PLANT_BASELINE from real ot_data_2.json
and compressor health from maintenance_logs_2.json.

Run:  uvicorn digital_twin:app --reload --port 8002
Drop ot_data_2.json and maintenance_logs_2.json in the same folder as this file.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import random, time, json
from pathlib import Path

app = FastAPI(
    title="Digital Twin – Plant A",
    description="Virtual replica of Plant A — bootstrapped from real sensor data",
    version="2.0.0"
)

# ─────────────────────────────────────────────
# Bootstrap: Load real data and compute baseline
# ─────────────────────────────────────────────

def _load_json(filename: str) -> list:
    search_paths = [
        Path(filename),
        Path("/mnt/user-data/uploads") / filename,
        Path(__file__).parent / filename,
    ]
    for p in search_paths:
        if p.exists():
            print(f"[Digital Twin] Loaded {filename} from {p}")
            with open(p) as f:
                return json.load(f)
    print(f"[Digital Twin] WARNING: {filename} not found. Using defaults.")
    return []


def _build_baseline_from_ot(ot_data: list) -> dict:
    plant_a = [r for r in ot_data if r.get("plant_id") == "PLANT_A"]
    if not plant_a:
        return {
            "plant_id": "PLANT_A", "production_rate_pct": 80.0,
            "temperature_C": 72.0, "pressure_bar": 4.2, "flow_rate_Lpm": 340.0,
            "compressor_health_pct": 85.0, "energy_consumption_kW": 210.0,
            "failure_risk_pct": 12.0, "last_updated": time.time(),
            "data_source": "hardcoded_fallback"
        }

    def avg(key):
        vals = [r[key] for r in plant_a if key in r]
        return round(sum(vals) / len(vals), 2) if vals else 0.0

    avg_flow = avg("flow_rate")
    # OT pressure in psi → bar
    avg_pressure_bar = round(avg("pressure") * 0.0689, 3)

    baseline = {
        "plant_id": "PLANT_A",
        "production_rate_pct": round(min(100.0, (avg_flow / 40.0) * 100), 1),
        "temperature_C": avg("temperature"),
        "pressure_bar": avg_pressure_bar,
        "flow_rate_Lpm": avg_flow,
        "compressor_health_pct": 85.0,
        "energy_consumption_kW": avg("power_kw"),
        "failure_risk_pct": 12.0,
        "last_updated": time.time(),
        "data_source": f"ot_data_2.json ({len(plant_a)} PLANT_A records)",
        "_avg_vibration": avg("vibration"),
        "_avg_rpm": avg("rpm"),
        "_avg_bearing_temp": avg("bearing_temp"),
        "_avg_oil_level_pct": avg("oil_level_pct"),
    }
    print(f"[Digital Twin] Baseline from {len(plant_a)} PLANT_A records: "
          f"temp={baseline['temperature_C']}°C, pressure={baseline['pressure_bar']} bar, "
          f"flow={baseline['flow_rate_Lpm']} Lpm, power={baseline['energy_consumption_kW']} kW")
    return baseline


def _refine_from_maintenance(baseline: dict, maint_data: list) -> dict:
    comp_logs = [
        r for r in maint_data
        if r.get("plant_id") == "PLANT_A" and "COMP" in r.get("equipment_id", "")
    ]
    if not comp_logs:
        return baseline
    severity_weights = {"HIGH": -20, "MEDIUM": -8, "LOW": -2}
    delta = sum(severity_weights.get(r.get("severity_tag", "LOW"), 0) for r in comp_logs)
    delta += sum(-5 for r in comp_logs if r.get("follow_up_required"))
    baseline["compressor_health_pct"] = round(max(30.0, min(100.0, 85.0 + delta * 0.05)), 1)
    high_count = sum(1 for r in comp_logs if r.get("severity_tag") == "HIGH")
    baseline["failure_risk_pct"] = round(min(40.0, 12.0 + high_count * 1.5), 1)
    print(f"[Digital Twin] Refined from {len(comp_logs)} compressor logs: "
          f"health={baseline['compressor_health_pct']}%, risk={baseline['failure_risk_pct']}%")
    return baseline


_ot_data    = _load_json("ot_data_2.json")
_maint_data = _load_json("maintenance_logs_2.json")
PLANT_BASELINE = _build_baseline_from_ot(_ot_data)
PLANT_BASELINE = _refine_from_maintenance(PLANT_BASELINE, _maint_data)

SAFETY_LIMITS = {
    "max_production_rate_pct": 100.0, "min_production_rate_pct": 10.0,
    "max_temperature_C": 200.0,       "max_pressure_bar": 20.0,
    "critical_failure_risk_pct": 70.0, "max_production_increase_step_pct": 5.0,
}

# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────

class SimulationRequest(BaseModel):
    scenario: str = Field(..., description="increase_production | reduce_production | maintenance_shutdown | custom")
    production_change_pct: Optional[float] = Field(None, description="% change. Max +5%.")
    compressor_degradation_pct: Optional[float] = Field(None, description="Drop compressor health by this %")
    ambient_temp_delta_C: Optional[float] = Field(None, description="External temp change °C")
    notes: Optional[str] = None

class SensorSnapshot(BaseModel):
    temperature_C: float
    pressure_bar: float
    flow_rate_Lpm: float
    energy_consumption_kW: float

class SimulationResult(BaseModel):
    plant_id: str
    scenario: str
    timestamp: float
    production_rate_pct: float
    delta_production_pct: float
    simulated_sensors: SensorSnapshot
    failure_risk_pct: float
    compressor_health_pct: float
    risk_level: str
    constraint_violations: list[str]
    recommendation: str
    safe_to_execute: bool

class BaselineResponse(BaseModel):
    plant_id: str
    baseline: dict
    safety_limits: dict
    data_summary: dict

# ─────────────────────────────────────────────
# Core Simulation Engine
# ─────────────────────────────────────────────

def simulate_plant(request: SimulationRequest) -> SimulationResult:
    violations = []
    prod_change = request.production_change_pct or 0.0

    if prod_change > SAFETY_LIMITS["max_production_increase_step_pct"]:
        violations.append(f"Requested +{prod_change:.1f}% exceeds max +5%. Clamped.")
        prod_change = SAFETY_LIMITS["max_production_increase_step_pct"]

    new_production = max(
        SAFETY_LIMITS["min_production_rate_pct"],
        min(SAFETY_LIMITS["max_production_rate_pct"],
            PLANT_BASELINE["production_rate_pct"] + prod_change)
    )
    prod_ratio = new_production / max(PLANT_BASELINE["production_rate_pct"], 1.0)
    ambient_delta = request.ambient_temp_delta_C or 0.0

    # Physics: sensor cascade (calibrated to real data ranges from PLANT_A)
    new_temp     = PLANT_BASELINE["temperature_C"] * (1 + 0.006 * prod_change) + ambient_delta
    new_pressure = PLANT_BASELINE["pressure_bar"] + (0.05 * prod_change) + (0.02 * ambient_delta)
    new_flow     = PLANT_BASELINE["flow_rate_Lpm"] * prod_ratio
    inefficiency = (1 + 0.02 * (new_production - 90)) if new_production > 90 else 1.0
    new_energy   = PLANT_BASELINE["energy_consumption_kW"] * prod_ratio * inefficiency

    comp_degrade    = request.compressor_degradation_pct or 0.0
    new_comp_health = max(0.0, PLANT_BASELINE["compressor_health_pct"] - comp_degrade)
    if prod_change > 0:
        new_comp_health = max(0.0, new_comp_health - prod_change * 0.15)

    base_T = PLANT_BASELINE["temperature_C"]
    base_P = PLANT_BASELINE["pressure_bar"]
    temp_stress     = max(0, (new_temp - base_T) / max(1, SAFETY_LIMITS["max_temperature_C"] - base_T))
    pressure_stress = max(0, (new_pressure - base_P) / max(1, SAFETY_LIMITS["max_pressure_bar"] - base_P))
    comp_stress     = max(0, (100 - new_comp_health) / 100)
    load_stress     = max(0, (new_production - 70) / 30)

    raw_risk = (0.30 * temp_stress + 0.25 * pressure_stress +
                0.30 * comp_stress + 0.15 * load_stress) * 100

    new_failure_risk = min(100.0, max(0.0,
        PLANT_BASELINE["failure_risk_pct"] + raw_risk + random.uniform(-1.5, 1.5)
    ))

    if new_temp     > SAFETY_LIMITS["max_temperature_C"]:
        violations.append(f"Temp {new_temp:.1f}°C > limit {SAFETY_LIMITS['max_temperature_C']}°C")
    if new_pressure > SAFETY_LIMITS["max_pressure_bar"]:
        violations.append(f"Pressure {new_pressure:.2f} bar > limit {SAFETY_LIMITS['max_pressure_bar']} bar")
    if new_failure_risk >= SAFETY_LIMITS["critical_failure_risk_pct"]:
        violations.append(f"Failure risk {new_failure_risk:.1f}% is CRITICAL (≥70%)")
    if new_comp_health < 30:
        violations.append(f"Compressor health {new_comp_health:.1f}% — immediate maintenance required")

    if   new_failure_risk < 20: risk_level = "low"
    elif new_failure_risk < 40: risk_level = "moderate"
    elif new_failure_risk < 70: risk_level = "high"
    else:                        risk_level = "critical"

    if violations:
        rec = (f"DO NOT EXECUTE: CRITICAL risk {new_failure_risk:.1f}%." if risk_level == "critical"
               else f"{len(violations)} violation(s): {'; '.join(violations)}")
    elif risk_level == "low":
        rec = f"SAFE. Production → {new_production:.1f}%, Risk: {new_failure_risk:.1f}%. Proceed."
    elif risk_level == "moderate":
        rec = f"Executable with monitoring. Production → {new_production:.1f}%, Risk: {new_failure_risk:.1f}%."
    else:
        rec = f"HIGH risk ({new_failure_risk:.1f}%). Schedule maintenance before execution."

    return SimulationResult(
        plant_id=PLANT_BASELINE["plant_id"], scenario=request.scenario,
        timestamp=time.time(), production_rate_pct=round(new_production, 2),
        delta_production_pct=round(prod_change, 2),
        simulated_sensors=SensorSnapshot(
            temperature_C=round(new_temp, 2), pressure_bar=round(new_pressure, 3),
            flow_rate_Lpm=round(new_flow, 1), energy_consumption_kW=round(new_energy, 1),
        ),
        failure_risk_pct=round(new_failure_risk, 2),
        compressor_health_pct=round(new_comp_health, 2),
        risk_level=risk_level, constraint_violations=violations,
        recommendation=rec, safe_to_execute=len(violations) == 0
    )

# ─────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {"service": "Digital Twin – Plant A", "status": "operational",
            "baseline_source": PLANT_BASELINE.get("data_source")}


@app.get("/twin/baseline", response_model=BaselineResponse, tags=["Digital Twin"])
def get_baseline():
    plant_a_ot = [r for r in _ot_data if r.get("plant_id") == "PLANT_A"]
    plant_a_ml = [r for r in _maint_data if r.get("plant_id") == "PLANT_A"]
    return BaselineResponse(
        plant_id="PLANT_A", baseline=PLANT_BASELINE, safety_limits=SAFETY_LIMITS,
        data_summary={
            "ot_records_plant_a": len(plant_a_ot),
            "maintenance_records_plant_a": len(plant_a_ml),
            "high_severity_issues": sum(1 for r in plant_a_ml if r.get("severity_tag") == "HIGH"),
            "equipment_types": sorted(set(r["equipment_id"] for r in plant_a_ot)),
        }
    )


@app.post("/simulate", response_model=SimulationResult, tags=["Digital Twin"])
def run_simulation(request: SimulationRequest):
    """
    Core Digital Twin endpoint. Max production increase: +5% per step.

    Example body:
        {"scenario": "increase_production", "production_change_pct": 5}
    """
    try:
        return simulate_plant(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/twin/update_baseline", tags=["Digital Twin"])
def update_baseline(updates: dict):
    """Person 1 (Ingestion) calls this to push fresh live sensor data."""
    allowed = set(PLANT_BASELINE.keys())
    applied, rejected = {}, []
    for key, val in updates.items():
        if key in allowed and key not in ("plant_id", "data_source"):
            PLANT_BASELINE[key] = val
            applied[key] = val
        else:
            rejected.append(key)
    PLANT_BASELINE["last_updated"] = time.time()
    return {"status": "updated", "applied": applied, "rejected_fields": rejected}


@app.get("/twin/scenarios", tags=["Digital Twin"])
def list_scenarios():
    return {"scenarios": [
        {"name": "increase_production_5pct",
         "body": {"scenario": "increase_production", "production_change_pct": 5.0}},
        {"name": "reduce_production_10pct",
         "body": {"scenario": "reduce_production", "production_change_pct": -10.0}},
        {"name": "compressor_degraded",
         "body": {"scenario": "maintenance_shutdown", "compressor_degradation_pct": 30.0}},
        {"name": "summer_heat_wave",
         "body": {"scenario": "custom", "production_change_pct": 5.0, "ambient_temp_delta_C": 8.0}},
        {"name": "worst_case",
         "body": {"scenario": "custom", "production_change_pct": 5.0,
                  "compressor_degradation_pct": 25.0, "ambient_temp_delta_C": 6.0}},
    ]}


@app.get("/twin/anomalies", tags=["Digital Twin"])
def get_anomalies():
    """Scan real OT data for PLANT_A records that breach thresholds."""
    plant_a = [r for r in _ot_data if r.get("plant_id") == "PLANT_A"]
    anomalies = []
    for r in plant_a:
        reasons = []
        if r.get("temperature", 0) > 150:    reasons.append(f"High temp: {r['temperature']}°C")
        if r.get("pressure", 0) > 220:       reasons.append(f"High pressure: {r['pressure']} psi")
        if r.get("oil_level_pct", 100) < 40: reasons.append(f"Low oil: {r['oil_level_pct']}%")
        if r.get("vibration", 0) > 0.055:    reasons.append(f"High vibration: {r['vibration']}")
        if reasons:
            anomalies.append({"timestamp": r["timestamp"], "equipment_id": r["equipment_id"],
                               "anomaly_reasons": reasons})
    return {"plant_id": "PLANT_A", "anomaly_count": len(anomalies), "anomalies": anomalies}


@app.get("/twin/maintenance_summary", tags=["Digital Twin"])
def get_maintenance_summary():
    """Return PLANT_A maintenance log summary for the Decision Engine."""
    logs = [r for r in _maint_data if r.get("plant_id") == "PLANT_A"]
    summary = {}
    for log in logs:
        eq = log.get("equipment_id", "UNKNOWN")
        sev = log.get("severity_tag", "UNKNOWN")
        if eq not in summary:
            summary[eq] = {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "follow_up_pending": 0}
        summary[eq][sev] = summary[eq].get(sev, 0) + 1
        if log.get("follow_up_required"):
            summary[eq]["follow_up_pending"] += 1
    return {"plant_id": "PLANT_A", "total_logs": len(logs), "by_equipment": summary}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)