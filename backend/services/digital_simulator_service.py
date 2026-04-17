"""
Digital simulator and threshold calibration service.

This module stress-tests OT signals under extreme scenarios and derives
warning/critical thresholds that can be used for live anomaly proximity checks.
"""

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
THRESHOLD_FILE = os.path.join(DATA_DIR, "sim_thresholds.json")

SIGNAL_COLUMNS = [
    "temperature",
    "pressure",
    "flow_rate",
    "vibration",
    "rpm",
    "bearing_temp",
    "oil_level_pct",
    "voltage",
    "current_a",
    "power_kw",
    "power_factor",
    "noise_db",
]

SIGNAL_UNITS = {
    "temperature": "degC",
    "pressure": "bar",
    "flow_rate": "LPM",
    "vibration": "g",
    "rpm": "rpm",
    "bearing_temp": "degC",
    "oil_level_pct": "%",
    "voltage": "V",
    "current_a": "A",
    "power_kw": "kW",
    "power_factor": "pf",
    "noise_db": "dB",
}

SEVERITY_LEVELS = {
    "mild": 0.35,
    "high": 0.7,
    "extreme": 1.0,
}

SCENARIO_CATALOG: Dict[str, Dict[str, Any]] = {
    "thermal-runaway": {
        "name": "Thermal Runaway",
        "description": "Heat and bearing temperature rise with power/current stress.",
    },
    "pressure-surge": {
        "name": "Pressure Surge",
        "description": "Pressure spike with reduced flow stability and noise increase.",
    },
    "vibration-resonance": {
        "name": "Vibration Resonance",
        "description": "Mechanical resonance with vibration/noise escalation.",
    },
    "lubrication-loss": {
        "name": "Lubrication Loss",
        "description": "Oil degradation leading to friction, heat, and failure risk.",
    },
    "electrical-instability": {
        "name": "Electrical Instability",
        "description": "Voltage/current imbalance with power-factor deterioration.",
    },
    "cascade-fault": {
        "name": "Cascade Fault",
        "description": "Combined multi-signal stress representing severe coupled fault.",
    },
}

STATUS_RANK = {
    "normal": 0,
    "near-threshold": 1,
    "warning": 2,
    "critical": 3,
}

AGENT_SIGNAL_MAP = {
    "operations-intelligence": ["temperature", "pressure", "vibration", "flow_rate", "noise_db"],
    "predictive-maintenance": ["bearing_temp", "oil_level_pct", "vibration", "rpm"],
    "energy-optimizer": ["power_kw", "current_a", "power_factor", "voltage"],
    "demand-planner": ["flow_rate", "power_kw", "temperature", "pressure"],
}


def list_simulation_scenarios() -> List[Dict[str, str]]:
    return [
        {
            "id": sid,
            "name": meta["name"],
            "description": meta["description"],
            "severity_levels": list(SEVERITY_LEVELS.keys()),
        }
        for sid, meta in SCENARIO_CATALOG.items()
    ]


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _read_threshold_file() -> Optional[Dict[str, Any]]:
    if not os.path.exists(THRESHOLD_FILE):
        return None
    try:
        with open(THRESHOLD_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            return None
        if not isinstance(payload.get("signals"), dict):
            return None
        return payload
    except Exception:
        return None


def _write_threshold_file(payload: Dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(THRESHOLD_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _clamp_signal_ranges(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "temperature" in out:
        out["temperature"] = out["temperature"].clip(20, 260)
    if "pressure" in out:
        out["pressure"] = out["pressure"].clip(50, 320)
    if "flow_rate" in out:
        out["flow_rate"] = out["flow_rate"].clip(5, 80)
    if "vibration" in out:
        out["vibration"] = out["vibration"].clip(0.001, 0.2)
    if "rpm" in out:
        out["rpm"] = out["rpm"].clip(400, 4000)
    if "bearing_temp" in out:
        out["bearing_temp"] = out["bearing_temp"].clip(30, 280)
    if "oil_level_pct" in out:
        out["oil_level_pct"] = out["oil_level_pct"].clip(0, 100)
    if "voltage" in out:
        out["voltage"] = out["voltage"].clip(160, 300)
    if "current_a" in out:
        out["current_a"] = out["current_a"].clip(10, 450)
    if "power_kw" in out:
        out["power_kw"] = out["power_kw"].clip(20, 900)
    if "power_factor" in out:
        out["power_factor"] = out["power_factor"].clip(0.45, 1.0)
    if "noise_db" in out:
        out["noise_db"] = out["noise_db"].clip(30, 120)
    return out


def _inject_noise(df: pd.DataFrame, rng: np.random.Generator, level: float) -> pd.DataFrame:
    out = df.copy()
    for col in SIGNAL_COLUMNS:
        if col not in out:
            continue
        std = _safe_float(out[col].std(), 0.0)
        if std <= 0:
            continue
        out[col] = out[col] + rng.normal(0.0, std * 0.03 * level, size=len(out))
    return out


def _apply_stress(df: pd.DataFrame, scenario_id: str, severity_level: float, rng: np.random.Generator) -> pd.DataFrame:
    out = df.copy()
    s = severity_level

    if scenario_id == "thermal-runaway":
        out["temperature"] *= 1 + (0.24 * s)
        out["bearing_temp"] *= 1 + (0.28 * s)
        out["power_kw"] *= 1 + (0.18 * s)
        out["current_a"] *= 1 + (0.14 * s)
        out["oil_level_pct"] *= 1 - (0.22 * s)

    elif scenario_id == "pressure-surge":
        out["pressure"] *= 1 + (0.34 * s)
        out["flow_rate"] *= 1 - (0.16 * s)
        out["vibration"] *= 1 + (0.12 * s)
        out["noise_db"] *= 1 + (0.08 * s)
        out["power_kw"] *= 1 + (0.10 * s)

    elif scenario_id == "vibration-resonance":
        out["vibration"] *= 1 + (0.55 * s)
        out["noise_db"] *= 1 + (0.20 * s)
        out["bearing_temp"] *= 1 + (0.14 * s)
        out["rpm"] *= 1 + (0.10 * s)
        out["pressure"] *= 1 + (0.06 * s)

    elif scenario_id == "lubrication-loss":
        out["oil_level_pct"] *= 1 - (0.45 * s)
        out["bearing_temp"] *= 1 + (0.22 * s)
        out["temperature"] *= 1 + (0.14 * s)
        out["vibration"] *= 1 + (0.16 * s)
        out["power_kw"] *= 1 + (0.09 * s)

    elif scenario_id == "electrical-instability":
        out["voltage"] *= 1 + rng.normal(0.0, 0.10 * s, size=len(out))
        out["current_a"] *= 1 + (0.22 * s)
        out["power_kw"] *= 1 + (0.17 * s)
        out["power_factor"] *= 1 - (0.18 * s)
        out["noise_db"] *= 1 + (0.08 * s)

    elif scenario_id == "cascade-fault":
        out["temperature"] *= 1 + (0.25 * s)
        out["pressure"] *= 1 + (0.24 * s)
        out["flow_rate"] *= 1 - (0.20 * s)
        out["vibration"] *= 1 + (0.40 * s)
        out["bearing_temp"] *= 1 + (0.30 * s)
        out["oil_level_pct"] *= 1 - (0.35 * s)
        out["current_a"] *= 1 + (0.24 * s)
        out["power_kw"] *= 1 + (0.28 * s)
        out["power_factor"] *= 1 - (0.15 * s)
        out["noise_db"] *= 1 + (0.18 * s)

    else:
        raise ValueError(f"Unknown scenario '{scenario_id}'")

    out = _inject_noise(out, rng, s)
    out = _clamp_signal_ranges(out)
    return out


def _derive_signal_thresholds(
    baseline_df: pd.DataFrame,
    simulated_df: pd.DataFrame,
    stress_mask: pd.Series,
) -> Dict[str, Dict[str, Any]]:
    signal_thresholds: Dict[str, Dict[str, Any]] = {}

    stressed = simulated_df.loc[stress_mask]
    if stressed.empty:
        stressed = simulated_df

    for signal in SIGNAL_COLUMNS:
        if signal not in baseline_df or signal not in stressed:
            continue

        base_vals = pd.to_numeric(baseline_df[signal], errors="coerce").dropna()
        stress_vals = pd.to_numeric(stressed[signal], errors="coerce").dropna()
        if base_vals.empty or stress_vals.empty:
            continue

        b05 = _safe_float(base_vals.quantile(0.05))
        b50 = _safe_float(base_vals.quantile(0.50))
        b95 = _safe_float(base_vals.quantile(0.95))

        s20 = _safe_float(stress_vals.quantile(0.20))
        s50 = _safe_float(stress_vals.quantile(0.50))
        s80 = _safe_float(stress_vals.quantile(0.80))

        direction = "high" if s50 >= b50 else "low"

        if direction == "high":
            warning = (b95 + s20) / 2.0
            critical = max((b95 + s50) / 2.0, warning * 1.03)
            near = warning * 0.95
            if near > warning:
                near = warning
        else:
            warning = (b05 + s80) / 2.0
            critical = min((b05 + s50) / 2.0, warning * 0.97)
            near = warning * 1.05
            if near < warning:
                near = warning

        signal_thresholds[signal] = {
            "direction": direction,
            "near_threshold": round(_safe_float(near), 4),
            "warning_threshold": round(_safe_float(warning), 4),
            "critical_threshold": round(_safe_float(critical), 4),
            "baseline_median": round(b50, 4),
            "stress_median": round(s50, 4),
            "unit": SIGNAL_UNITS.get(signal, ""),
        }

    return signal_thresholds


def build_agent_threshold_views(signal_thresholds: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    views: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for agent_id, signals in AGENT_SIGNAL_MAP.items():
        views[agent_id] = {
            signal: signal_thresholds[signal]
            for signal in signals
            if signal in signal_thresholds
        }
    return views


def map_flagged_signals_to_agents(flagged_signals: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    by_agent: Dict[str, List[Dict[str, Any]]] = {agent_id: [] for agent_id in AGENT_SIGNAL_MAP}
    for item in flagged_signals:
        signal = str(item.get("signal", ""))
        for agent_id, signals in AGENT_SIGNAL_MAP.items():
            if signal in signals:
                by_agent[agent_id].append(item)
    return by_agent


def calibrate_digital_thresholds(
    engine: Any,
    rows: int = 320,
    scenario_ids: Optional[List[str]] = None,
    seed: int = 42,
) -> Dict[str, Any]:
    if rows < 60:
        raise ValueError("rows must be at least 60 for stable simulation.")

    selected = scenario_ids or list(SCENARIO_CATALOG.keys())
    invalid = [sid for sid in selected if sid not in SCENARIO_CATALOG]
    if invalid:
        raise ValueError(f"Unknown scenario(s): {invalid}")

    baseline = engine.ot_df.copy().tail(rows).reset_index(drop=True)
    rng = np.random.default_rng(seed)

    simulated_runs: List[pd.DataFrame] = []

    for scenario_id in selected:
        for severity_name, severity_level in SEVERITY_LEVELS.items():
            stressed = _apply_stress(baseline, scenario_id, severity_level, rng)
            anomaly_out = engine.anomaly.predict(stressed)
            maintenance_out = engine.maintenance.predict(stressed)
            failure_out = engine.failure.predict(stressed)

            run_df = stressed.copy()
            run_df["scenario_id"] = scenario_id
            run_df["severity"] = severity_name
            run_df["anomaly_flag"] = anomaly_out["anomaly_flags"]
            run_df["anomaly_score"] = anomaly_out["anomaly_scores"]
            run_df["risk_level"] = maintenance_out["risk_level"]
            run_df["failure_label"] = failure_out["failure_labels"]
            run_df["failure_prob"] = failure_out["failure_prob"]
            run_df["is_stress_positive"] = (
                (run_df["anomaly_flag"] == 1)
                | (run_df["risk_level"].isin(["HIGH", "CRITICAL"]))
                | (run_df["failure_label"].isin(["IMMINENT", "HIGH_RISK"]))
                | (run_df["failure_prob"] >= 0.60)
            )
            simulated_runs.append(run_df)

    simulated = pd.concat(simulated_runs, ignore_index=True)
    stress_mask = simulated["is_stress_positive"] == True

    signal_thresholds = _derive_signal_thresholds(baseline, simulated, stress_mask)
    agent_thresholds = build_agent_threshold_views(signal_thresholds)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rows_used": int(rows),
        "seed": int(seed),
        "scenario_ids": selected,
        "signals": signal_thresholds,
        "agent_thresholds": agent_thresholds,
        "summary": {
            "baseline_rows": int(len(baseline)),
            "simulated_rows": int(len(simulated)),
            "stress_positive_rows": int(stress_mask.sum()),
            "anomaly_hit_rate_pct": round(float((simulated["anomaly_flag"] == 1).mean() * 100), 2),
            "high_or_critical_maintenance_pct": round(
                float(simulated["risk_level"].isin(["HIGH", "CRITICAL"]).mean() * 100),
                2,
            ),
            "failure_risk_pct": round(
                float(simulated["failure_label"].isin(["IMMINENT", "HIGH_RISK"]).mean() * 100),
                2,
            ),
        },
    }

    _write_threshold_file(payload)
    return payload


def resolve_thresholds(
    engine: Any,
    cached_thresholds: Optional[Dict[str, Any]] = None,
    auto_calibrate: bool = True,
) -> Optional[Dict[str, Any]]:
    if isinstance(cached_thresholds, dict) and isinstance(cached_thresholds.get("signals"), dict):
        return cached_thresholds

    stored = _read_threshold_file()
    if stored is not None:
        return stored

    if not auto_calibrate:
        return None

    return calibrate_digital_thresholds(engine=engine)


def evaluate_row_against_thresholds(values: Dict[str, Any], threshold_payload: Dict[str, Any]) -> Dict[str, Any]:
    signals = threshold_payload.get("signals", {}) if isinstance(threshold_payload, dict) else {}

    flagged_signals: List[Dict[str, Any]] = []
    highest_status = "normal"
    highest_score = STATUS_RANK[highest_status]

    for signal, cfg in signals.items():
        if signal not in values:
            continue

        value = _safe_float(values.get(signal), np.nan)
        if np.isnan(value):
            continue

        direction = str(cfg.get("direction", "high"))
        near_t = _safe_float(cfg.get("near_threshold"))
        warn_t = _safe_float(cfg.get("warning_threshold"))
        crit_t = _safe_float(cfg.get("critical_threshold"))

        status = "normal"
        trigger_t = None

        if direction == "high":
            if value >= crit_t:
                status = "critical"
                trigger_t = crit_t
            elif value >= warn_t:
                status = "warning"
                trigger_t = warn_t
            elif value >= near_t:
                status = "near-threshold"
                trigger_t = near_t
            proximity_pct = round((value / warn_t) * 100, 2) if warn_t else 0.0
        else:
            if value <= crit_t:
                status = "critical"
                trigger_t = crit_t
            elif value <= warn_t:
                status = "warning"
                trigger_t = warn_t
            elif value <= near_t:
                status = "near-threshold"
                trigger_t = near_t
            proximity_pct = round((warn_t / max(value, 1e-9)) * 100, 2) if warn_t else 0.0

        rank = STATUS_RANK.get(status, 0)
        if rank > highest_score:
            highest_score = rank
            highest_status = status

        if status != "normal":
            flagged_signals.append(
                {
                    "signal": signal,
                    "value": round(value, 4),
                    "unit": cfg.get("unit", ""),
                    "direction": direction,
                    "status": status,
                    "trigger_threshold": round(_safe_float(trigger_t), 4) if trigger_t is not None else None,
                    "warning_threshold": round(warn_t, 4),
                    "critical_threshold": round(crit_t, 4),
                    "proximity_to_warning_pct": proximity_pct,
                }
            )

    return {
        "overall_status": highest_status,
        "flagged_signals": flagged_signals,
        "flagged_count": len(flagged_signals),
    }
