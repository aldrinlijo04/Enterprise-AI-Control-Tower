"""
LLM Chat Service — Groq (llama-3.3-70b) with full plant AI context
"""

import os
from groq import Groq
from dotenv import load_dotenv
load_dotenv()

GROQ_MODEL = "llama-3.3-70b-versatile"


def get_client():
    key = os.getenv("GROQ_API_KEY")
    if not key:
        return None
    try:
        return Groq(api_key=key)
    except Exception:
        return None


SYSTEM_PROMPT = """You are ARIA — Advanced Real-time Industrial AI Assistant.
You are deployed at a smart manufacturing plant and have access to live data from:
- OT sensors (temperature, pressure, vibration, flow, RPM, power)
- IT business systems (orders, demand forecasts, inventory, supply chain)
- Maintenance logs (equipment history, fault codes, technician notes)

You run 7 AI models simultaneously:
1. Forecasting — predicts sensor trends 10 steps ahead
2. Demand Prediction — forecasts production requirements
3. Energy Consumption — monitors and optimises power usage
4. Anomaly Detection — flags abnormal sensor readings
5. Plant Behavior — classifies operational states (Normal/Surge/Fault/etc.)
6. Predictive Maintenance — estimates Remaining Useful Life (RUL)
7. Equipment Failure Prediction — scores failure probability per machine

Respond as a sharp, confident industrial AI assistant. Be concise, data-driven, and actionable.
When asked about status, lead with the most critical finding first.
Use engineering terminology. Avoid generic filler. Never say you lack data — use the context provided.
Format key metrics in plain text — no markdown headers, just clean sentences.
"""

def build_context_block(snapshot: dict, report: dict) -> str:
    f = report.get("forecasting", {})
    d = report.get("demand", {})
    e = report.get("energy", {})
    a = report.get("anomaly", {})
    pb = report.get("plant_behavior", {})
    m = report.get("maintenance", {})
    fl = report.get("failure", {})

    return f"""
=== LIVE PLANT SNAPSHOT ===
Timestamp: {snapshot.get('timestamp')} | Plant: {snapshot.get('plant_id')} | Equipment: {snapshot.get('equipment_id')}
Temperature: {snapshot.get('temperature')}°C | Pressure: {snapshot.get('pressure')} bar
Vibration: {snapshot.get('vibration')} g | Flow: {snapshot.get('flow_rate')} LPM | Power: {snapshot.get('power_kw')} kW
Last Log: "{snapshot.get('last_log')}" [Severity: {snapshot.get('log_severity')}]

=== MODEL OUTPUTS ===
FORECASTING: Temperature trend={f.get('trend',{}).get('temperature','?')} | Pressure trend={f.get('trend',{}).get('pressure','?')} | Vibration trend={f.get('trend',{}).get('vibration','?')}

DEMAND: Avg predicted demand={d.get('avg_predicted_demand')} units | MAE={d.get('mean_absolute_error_pct')}%

ENERGY: Total energy={e.get('total_energy_kwh')} kWh | Carbon={e.get('carbon_emission_kg')} kg | Cost=₹{e.get('energy_cost_INR')} | Avg waste={e.get('avg_waste_kw')} kW

ANOMALY: Total anomalies={a.get('total_anomalies')} | Rate={a.get('anomaly_rate_pct')}%

PLANT BEHAVIOR: Normal={pb.get('normal_pct')}% | Critical events={pb.get('critical_events')}
Behavior distribution={pb.get('behavior_distribution')}

MAINTENANCE: Avg RUL={m.get('avg_rul_hours')} hrs | Risk distribution={m.get('risk_distribution')}
Equipment needing attention={m.get('equipment_needing_attention')}

FAILURE PREDICTION: Fleet health={fl.get('fleet_health')} | Imminent failures={fl.get('imminent_failures')}
Avg failure probability={fl.get('avg_failure_probability')} | Critical equipment={fl.get('critical_equipment')}
High severity logs={fl.get('maintenance_logs_high_severity')}
""".strip()


def ask(user_prompt: str, snapshot: dict, report: dict, history: list = None) -> str:
    client = get_client()
    if not client:
        return "LLM service unavailable. Set GROQ_API_KEY environment variable."

    context = build_context_block(snapshot, report)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if history:
        for msg in history[-8:]:
            if msg.get("role") in ("user", "assistant"):
                messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({
        "role": "user",
        "content": f"{context}\n\nUser: {user_prompt}"
    })

    try:
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=0.45,
            max_tokens=600
        )
        return resp.choices[0].message.content
    except Exception as e:
        err = str(e).lower()
        if "rate limit" in err:
            return "Rate limit reached. Please wait a moment and retry."
        if "permission" in err or "403" in err:
            return "API permission error. Check your Groq account access."
        return f"LLM error: {str(e)}"