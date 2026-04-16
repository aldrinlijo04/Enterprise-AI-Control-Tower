"""
Groq-powered agent orchestration for plant intelligence workflows.

This module provides four production-focused agents:
- operations-intelligence
- predictive-maintenance
- energy-optimizer
- demand-planner

Each agent uses deterministic diagnostics from model outputs and optionally
adds Groq reasoning. If Groq is unavailable, deterministic fallback is used.
"""

import json
import os
from typing import Any, Dict, List, Optional, Tuple

from groq import Groq

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


AGENT_REGISTRY: Dict[str, Dict[str, Any]] = {
    "operations-intelligence": {
        "name": "Operations Intelligence Agent",
        "description": "Plant-wide status, anomaly triage, and operational risk guidance.",
        "focus_modules": ["forecasting", "anomaly", "plant_behavior", "failure"],
        "default_query": "Provide an operational status and highest-priority risks.",
    },
    "predictive-maintenance": {
        "name": "Predictive Maintenance Agent",
        "description": "RUL-based prioritization, maintenance scheduling, and risk handling.",
        "focus_modules": ["maintenance", "failure", "anomaly"],
        "default_query": "Prioritize maintenance actions for the current plant state.",
    },
    "energy-optimizer": {
        "name": "Energy Optimization Agent",
        "description": "Energy waste analysis, efficiency diagnostics, and optimization actions.",
        "focus_modules": ["energy", "forecasting", "plant_behavior"],
        "default_query": "Identify energy savings opportunities and immediate actions.",
    },
    "demand-planner": {
        "name": "Demand and Production Planning Agent",
        "description": "Demand risk, stockout prevention, and production balancing guidance.",
        "focus_modules": ["demand", "maintenance", "failure"],
        "default_query": "Recommend demand and production priorities for the next cycle.",
    },
}

PRIORITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


SYSTEM_PROMPTS: Dict[str, str] = {
    "operations-intelligence": (
        "You are an operations intelligence specialist for industrial plants. "
        "Use ONLY the supplied context and provide a concise, actionable answer."
    ),
    "predictive-maintenance": (
        "You are a predictive maintenance specialist. Prioritize equipment by risk and "
        "remaining useful life, and provide practical maintenance actions."
    ),
    "energy-optimizer": (
        "You are an industrial energy optimization specialist. Identify waste drivers, "
        "low-efficiency assets, and cost/carbon reduction actions."
    ),
    "demand-planner": (
        "You are a demand and production planning specialist. Focus on stockout risk, "
        "forecast-vs-actual gaps, and near-term production decisions."
    ),
}


def _get_client() -> Optional[Groq]:
    key = os.getenv("GROQ_API_KEY")
    if not key:
        return None
    try:
        return Groq(api_key=key)
    except Exception:
        return None


def list_agents() -> List[Dict[str, Any]]:
    return [
        {
            "id": agent_id,
            "name": meta["name"],
            "description": meta["description"],
            "focus_modules": meta["focus_modules"],
        }
        for agent_id, meta in AGENT_REGISTRY.items()
    ]


def get_agent_ids() -> List[str]:
    return list(AGENT_REGISTRY.keys())


def get_agent_health(agent_id: str) -> Dict[str, Any]:
    if agent_id not in AGENT_REGISTRY:
        raise KeyError(f"Unknown agent '{agent_id}'")

    has_key = bool(os.getenv("GROQ_API_KEY"))
    client_ready = _get_client() is not None

    return {
        "agent_id": agent_id,
        "status": "ready" if client_ready else "degraded",
        "groq_api_key_configured": has_key,
        "groq_client_ready": client_ready,
        "fallback_available": True,
        "model": GROQ_MODEL,
    }


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _top_anomaly_equipment(report: Dict[str, Any], limit: int = 3) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for equipment_id, stats in (report.get("anomaly", {}).get("by_equipment", {}) or {}).items():
        rows.append(
            {
                "equipment_id": equipment_id,
                "anomaly_rate_pct": _safe_float(stats.get("anomaly_rate_pct")),
                "anomaly_count": int(stats.get("anomaly_count", 0)),
            }
        )
    rows.sort(key=lambda x: x["anomaly_rate_pct"], reverse=True)
    return rows[:limit]


def _top_low_rul_equipment(report: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for equipment_id, stats in (report.get("maintenance", {}).get("by_equipment", {}) or {}).items():
        rows.append(
            {
                "equipment_id": equipment_id,
                "min_rul_hrs": _safe_float(stats.get("min_rul_hrs"), 1e9),
                "avg_rul_hrs": _safe_float(stats.get("avg_rul_hrs"), 1e9),
                "dominant_risk": str(stats.get("dominant_risk", "UNKNOWN")),
            }
        )
    rows.sort(key=lambda x: x["min_rul_hrs"])
    return rows[:limit]


def _lowest_efficiency_equipment(report: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for equipment_id, stats in (report.get("energy", {}).get("by_equipment", {}) or {}).items():
        rows.append(
            {
                "equipment_id": equipment_id,
                "avg_kw": _safe_float(stats.get("avg_kw")),
                "peak_kw": _safe_float(stats.get("peak_kw")),
                "efficiency_pct": _safe_float(stats.get("efficiency_pct"), 100.0),
            }
        )
    rows.sort(key=lambda x: x["efficiency_pct"])
    return rows[:limit]


def _demand_risk_products(report: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for product, stats in (report.get("demand", {}).get("by_product", {}) or {}).items():
        avg_forecast = _safe_float(stats.get("avg_forecast"))
        avg_actual = _safe_float(stats.get("avg_actual"))
        rows.append(
            {
                "product": product,
                "stockout_risk_pct": _safe_float(stats.get("stockout_risk_pct")),
                "avg_forecast": avg_forecast,
                "avg_actual": avg_actual,
                "gap": round(avg_forecast - avg_actual, 2),
            }
        )
    rows.sort(key=lambda x: x["stockout_risk_pct"], reverse=True)
    return rows[:limit]


def _build_diagnostics(agent_id: str, snapshot: Dict[str, Any], report: Dict[str, Any]) -> Dict[str, Any]:
    base = {
        "timestamp": snapshot.get("timestamp"),
        "plant_id": snapshot.get("plant_id"),
        "equipment_id": snapshot.get("equipment_id"),
        "temperature": _safe_float(snapshot.get("temperature")),
        "pressure": _safe_float(snapshot.get("pressure")),
        "vibration": _safe_float(snapshot.get("vibration")),
        "power_kw": _safe_float(snapshot.get("power_kw")),
    }

    if agent_id == "operations-intelligence":
        anomaly_rate = _safe_float(report.get("anomaly", {}).get("anomaly_rate_pct"))
        imminent_failures = int(report.get("failure", {}).get("imminent_failures", 0))
        critical_events = int(report.get("plant_behavior", {}).get("critical_events", 0))

        priority = "low"
        if imminent_failures > 0:
            priority = "critical"
        elif anomaly_rate >= 20 or critical_events > 0:
            priority = "high"
        elif anomaly_rate >= 10:
            priority = "medium"

        return {
            **base,
            "priority_signal": priority,
            "anomaly_rate_pct": anomaly_rate,
            "total_anomalies": int(report.get("anomaly", {}).get("total_anomalies", 0)),
            "critical_events": critical_events,
            "imminent_failures": imminent_failures,
            "avg_failure_probability": _safe_float(report.get("failure", {}).get("avg_failure_probability")),
            "forecast_trend": report.get("forecasting", {}).get("trend", {}),
            "top_anomaly_equipment": _top_anomaly_equipment(report),
        }

    if agent_id == "predictive-maintenance":
        attention_list = report.get("maintenance", {}).get("equipment_needing_attention", []) or []
        critical_equipment = report.get("failure", {}).get("critical_equipment", {}) or {}

        ranked_fail_risk = sorted(
            [{"equipment_id": eq, "failure_probability": _safe_float(prob)} for eq, prob in critical_equipment.items()],
            key=lambda x: x["failure_probability"],
            reverse=True,
        )[:5]

        return {
            **base,
            "avg_rul_hours": _safe_float(report.get("maintenance", {}).get("avg_rul_hours")),
            "risk_distribution": report.get("maintenance", {}).get("risk_distribution", {}),
            "imminent_failures": int(report.get("failure", {}).get("imminent_failures", 0)),
            "equipment_needing_attention": attention_list[:5],
            "lowest_rul_equipment": _top_low_rul_equipment(report),
            "top_failure_risk_equipment": ranked_fail_risk,
        }

    if agent_id == "energy-optimizer":
        return {
            **base,
            "total_energy_kwh": _safe_float(report.get("energy", {}).get("total_energy_kwh")),
            "carbon_emission_kg": _safe_float(report.get("energy", {}).get("carbon_emission_kg")),
            "energy_cost_inr": _safe_float(report.get("energy", {}).get("energy_cost_INR")),
            "avg_predicted_kw": _safe_float(report.get("energy", {}).get("avg_predicted_kw")),
            "avg_waste_kw": _safe_float(report.get("energy", {}).get("avg_waste_kw")),
            "lowest_efficiency_equipment": _lowest_efficiency_equipment(report),
            "forecast_trend": report.get("forecasting", {}).get("trend", {}),
        }

    if agent_id == "demand-planner":
        return {
            **base,
            "mean_absolute_error_pct": _safe_float(report.get("demand", {}).get("mean_absolute_error_pct")),
            "avg_predicted_demand": _safe_float(report.get("demand", {}).get("avg_predicted_demand")),
            "products_by_stockout_risk": _demand_risk_products(report),
            "maintenance_risk_distribution": report.get("maintenance", {}).get("risk_distribution", {}),
            "imminent_failures": int(report.get("failure", {}).get("imminent_failures", 0)),
        }

    raise KeyError(f"Unknown agent '{agent_id}'")


def _context_for_agent(agent_id: str, snapshot: Dict[str, Any], report: Dict[str, Any], diagnostics: Dict[str, Any]) -> Dict[str, Any]:
    focus_modules = AGENT_REGISTRY[agent_id]["focus_modules"]
    focused_report = {module: report.get(module, {}) for module in focus_modules}
    return {
        "snapshot": snapshot,
        "focused_report": focused_report,
        "diagnostics": diagnostics,
    }


def _extract_json_payload(raw: str) -> Optional[Dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        return None

    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:].strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
        return None
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None


def _normalize_result(payload: Dict[str, Any]) -> Dict[str, Any]:
    findings = payload.get("findings") if isinstance(payload.get("findings"), list) else []
    actions = payload.get("actions") if isinstance(payload.get("actions"), list) else []
    assumptions = payload.get("assumptions") if isinstance(payload.get("assumptions"), list) else []

    priority = str(payload.get("priority", "medium")).lower()
    if priority not in {"low", "medium", "high", "critical"}:
        priority = "medium"

    confidence = payload.get("confidence", 0.65)
    try:
        confidence = max(0.0, min(1.0, float(confidence)))
    except Exception:
        confidence = 0.65

    return {
        "summary": str(payload.get("summary", "No summary available.")).strip(),
        "findings": [str(item) for item in findings][:6],
        "actions": [str(item) for item in actions][:6],
        "priority": priority,
        "confidence": confidence,
        "assumptions": [str(item) for item in assumptions][:6],
    }


def _deterministic_fallback(agent_id: str, user_query: str, diagnostics: Dict[str, Any]) -> Dict[str, Any]:
    if agent_id == "operations-intelligence":
        summary = (
            f"Operational status priority is {diagnostics.get('priority_signal', 'medium')}; "
            f"anomaly rate is {diagnostics.get('anomaly_rate_pct', 0)}% and imminent failures are "
            f"{diagnostics.get('imminent_failures', 0)}."
        )
        findings = [
            f"Critical events: {diagnostics.get('critical_events', 0)}.",
            f"Top anomaly equipment: {diagnostics.get('top_anomaly_equipment', [])[:2]}.",
        ]
        actions = [
            "Inspect highest anomaly-rate equipment first.",
            "Validate pressure and vibration thresholds on the current shift.",
            "Escalate immediate response if imminent failures are non-zero.",
        ]
        priority = diagnostics.get("priority_signal", "medium")

    elif agent_id == "predictive-maintenance":
        summary = (
            f"Average RUL is {diagnostics.get('avg_rul_hours', 0)} hrs; prioritize assets with lowest RUL "
            "and highest failure probability."
        )
        findings = [
            f"Attention list: {diagnostics.get('equipment_needing_attention', [])[:3]}.",
            f"Top failure-risk equipment: {diagnostics.get('top_failure_risk_equipment', [])[:3]}.",
        ]
        actions = [
            "Schedule immediate checks for CRITICAL/HIGH risk assets.",
            "Allocate maintenance windows by min_rul_hrs ascending.",
            "Confirm spare parts for top failure-risk equipment.",
        ]
        priority = "high" if diagnostics.get("imminent_failures", 0) > 0 else "medium"

    elif agent_id == "energy-optimizer":
        summary = (
            f"Energy use is {diagnostics.get('total_energy_kwh', 0)} kWh with average waste of "
            f"{diagnostics.get('avg_waste_kw', 0)} kW."
        )
        findings = [
            f"Lowest efficiency equipment: {diagnostics.get('lowest_efficiency_equipment', [])[:3]}.",
            f"Estimated cost/carbon: INR {diagnostics.get('energy_cost_inr', 0)} / {diagnostics.get('carbon_emission_kg', 0)} kg.",
        ]
        actions = [
            "Tune or service lowest-efficiency assets first.",
            "Reduce peak loads by staged start/stop scheduling.",
            "Track waste trend daily and set equipment-level targets.",
        ]
        priority = "high" if _safe_float(diagnostics.get("avg_waste_kw")) > 15 else "medium"

    else:
        summary = (
            f"Demand MAE is {diagnostics.get('mean_absolute_error_pct', 0)}%; prioritize high stockout-risk "
            "products and align production with forecast gaps."
        )
        findings = [
            f"Highest stockout risk products: {diagnostics.get('products_by_stockout_risk', [])[:3]}.",
            f"Imminent failures affecting supply: {diagnostics.get('imminent_failures', 0)}.",
        ]
        actions = [
            "Increase safety stock for top stockout-risk products.",
            "Rebalance production to close largest forecast-actual gaps.",
            "Adjust plan for maintenance/failure constraints before release.",
        ]
        priority = "high" if diagnostics.get("imminent_failures", 0) > 0 else "medium"

    return {
        "summary": summary,
        "findings": findings,
        "actions": actions,
        "priority": priority,
        "confidence": 0.7,
        "assumptions": [
            "Generated via deterministic fallback due to unavailable or invalid LLM response.",
            f"User query interpreted as: {user_query}",
        ],
    }


def _invoke_groq(
    agent_id: str,
    user_query: str,
    history: List[Dict[str, Any]],
    context_payload: Dict[str, Any],
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    client = _get_client()
    if not client:
        return None, "Groq client unavailable or GROQ_API_KEY missing"

    prompt = (
        f"{SYSTEM_PROMPTS[agent_id]}\n\n"
        "Output must be STRICT JSON only with keys: "
        "summary (string), findings (string[]), actions (string[]), priority (low|medium|high|critical), "
        "confidence (0..1), assumptions (string[]). Do not include markdown."
    )

    messages: List[Dict[str, str]] = [{"role": "system", "content": prompt}]

    for msg in (history or [])[-6:]:
        role = msg.get("role")
        content = str(msg.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})

    messages.append(
        {
            "role": "user",
            "content": (
                f"User Query:\n{user_query}\n\n"
                f"Structured Context:\n{json.dumps(context_payload, default=str)}"
            ),
        }
    )

    try:
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=700,
        )
        raw = resp.choices[0].message.content if resp.choices else ""
        parsed = _extract_json_payload(raw or "")
        if parsed is None:
            return None, "Invalid JSON response from Groq"
        return parsed, None
    except Exception as exc:
        return None, str(exc)


def run_agent(
    agent_id: str,
    user_query: str,
    snapshot: Dict[str, Any],
    report: Dict[str, Any],
    history: Optional[List[Dict[str, Any]]] = None,
    mode: str = "ask",
    include_internal: bool = True,
) -> Dict[str, Any]:
    if agent_id not in AGENT_REGISTRY:
        raise KeyError(f"Unknown agent '{agent_id}'")

    query = (user_query or "").strip() or AGENT_REGISTRY[agent_id]["default_query"]
    diagnostics = _build_diagnostics(agent_id, snapshot, report)
    context_payload = _context_for_agent(agent_id, snapshot, report, diagnostics)

    llm_payload, llm_error = _invoke_groq(agent_id, query, history or [], context_payload)
    llm_used = llm_payload is not None

    normalized = _normalize_result(llm_payload) if llm_used else _normalize_result(
        _deterministic_fallback(agent_id, query, diagnostics)
    )

    response: Dict[str, Any] = {
        "agent_id": agent_id,
        "agent_name": AGENT_REGISTRY[agent_id]["name"],
        "mode": mode,
        "query": query,
        "summary": normalized["summary"],
        "findings": normalized["findings"],
        "actions": normalized["actions"],
        "priority": normalized["priority"],
        "confidence": normalized["confidence"],
        "assumptions": normalized["assumptions"],
        "llm_used": llm_used,
        "model": GROQ_MODEL if llm_used else "deterministic-fallback",
    }

    if include_internal:
        response["internal"] = {
            "focus_modules": AGENT_REGISTRY[agent_id]["focus_modules"],
            "diagnostics": diagnostics,
            "groq_error": None if llm_used else llm_error,
        }

    return response


def _overall_priority(results: List[Dict[str, Any]]) -> str:
    if not results:
        return "low"
    best = "low"
    best_score = -1
    for row in results:
        level = str(row.get("priority", "low")).lower()
        score = PRIORITY_ORDER.get(level, 0)
        if score > best_score:
            best = level
            best_score = score
    return best


def orchestrate_agents(
    agent_ids: Optional[List[str]],
    user_query: str,
    snapshot: Dict[str, Any],
    report: Dict[str, Any],
    history: Optional[List[Dict[str, Any]]] = None,
    mode: str = "ask",
    include_internal: bool = True,
) -> Dict[str, Any]:
    selected = [a for a in (agent_ids or get_agent_ids()) if str(a).strip()]
    if not selected:
        selected = get_agent_ids()

    unknown = [a for a in selected if a not in AGENT_REGISTRY]
    if unknown:
        raise KeyError(f"Unknown agent(s): {unknown}")

    run_mode = mode if mode in {"ask", "analyze"} else "ask"

    results: List[Dict[str, Any]] = []
    for aid in selected:
        results.append(
            run_agent(
                agent_id=aid,
                user_query=user_query,
                snapshot=snapshot,
                report=report,
                history=history or [],
                mode=run_mode,
                include_internal=include_internal,
            )
        )

    llm_used_count = sum(1 for item in results if item.get("llm_used"))

    return {
        "mode": run_mode,
        "query": (user_query or "").strip(),
        "requested_agents": selected,
        "overall_priority": _overall_priority(results),
        "llm_used_count": llm_used_count,
        "fallback_count": len(results) - llm_used_count,
        "results": results,
    }
