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


SYSTEM_PROMPT = """You are ARIA — Advanced Real-time Industrial AI Assistant embedded in a plant monitoring dashboard.

RESPONSE FORMATTING RULES — follow these strictly every single time:
- Never write long paragraphs. Maximum 2 sentences per point.
- Always use short labelled sections with this exact format:

🔴 CRITICAL / 🟠 WARNING / 🟢 STATUS  (pick the right one as a header)

Then structure your response like this:

**Finding:** One clear sentence about the main issue or status.
**Data:** The specific numbers that support it.
**Action:** What should be done, by when.

If multiple topics are covered, use multiple sections like:

⚡ ENERGY
**Finding:** ...
**Data:** ...
**Action:** ...

🔧 MAINTENANCE
**Finding:** ...
**Data:** ...
**Action:** ...

RULES:
- Bold (**text**) for labels only
- Use emojis as section markers: 🔴 🟠 🟢 ⚡ 🔧 📊 🌡️ ⚠️ ✅
- Numbers always include units (°C, bar, kW, hrs, %)
- Never say "I" or "As an AI" — you are ARIA, speak directly
- Never write more than 120 words total per response
- If everything is fine, say so in 2 lines max
- Lead with the most critical finding first
"""


def build_context_block(snapshot: dict, report: dict) -> str:
    f  = report.get("forecasting", {})
    d  = report.get("demand", {})
    e  = report.get("energy", {})
    a  = report.get("anomaly", {})
    pb = report.get("plant_behavior", {})
    m  = report.get("maintenance", {})
    fl = report.get("failure", {})

    return f"""
=== LIVE PLANT SNAPSHOT ===
Timestamp: {snapshot.get('timestamp')} | Plant: {snapshot.get('plant_id')} | Equipment: {snapshot.get('equipment_id')}
Temperature: {snapshot.get('temperature')}°C | Pressure: {snapshot.get('pressure')} bar
Vibration: {snapshot.get('vibration')} g | Flow: {snapshot.get('flow_rate')} LPM | Power: {snapshot.get('power_kw')} kW
Last Log: "{snapshot.get('last_log')}" [Severity: {snapshot.get('log_severity')}]

=== MODEL OUTPUTS ===
FORECASTING: Temperature trend={f.get('trend',{}).get('temperature','?')} | Pressure={f.get('trend',{}).get('pressure','?')} | Vibration={f.get('trend',{}).get('vibration','?')}
DEMAND: Avg predicted={d.get('avg_predicted_demand')} units | MAE={d.get('mean_absolute_error_pct')}%
ENERGY: {e.get('total_energy_kwh')} kWh | Carbon={e.get('carbon_emission_kg')} kg | Cost=₹{e.get('energy_cost_INR')} | Waste={e.get('avg_waste_kw')} kW
ANOMALY: {a.get('total_anomalies')} events | Rate={a.get('anomaly_rate_pct')}%
BEHAVIOR: Normal={pb.get('normal_pct')}% | Critical={pb.get('critical_events')}
MAINTENANCE: Avg RUL={m.get('avg_rul_hours')} hrs | Risk={m.get('risk_distribution')} | Urgent={m.get('equipment_needing_attention')}
FAILURE: Fleet={fl.get('fleet_health')} | Imminent={fl.get('imminent_failures')} | Avg prob={fl.get('avg_failure_probability')} | Critical={fl.get('critical_equipment')}
""".strip()


def ask(user_prompt: str, snapshot: dict, report: dict, history: list = None) -> str:
    client = get_client()
    if not client:
        return "LLM service unavailable. Set GROQ_API_KEY environment variable."

    context = build_context_block(snapshot, report)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if history:
        for msg in history[-6:]:
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
            temperature=0.3,
            max_tokens=400
        )
        return resp.choices[0].message.content
    except Exception as e:
        err = str(e).lower()
        if "rate limit" in err:
            return "⚠️ Rate limit reached. Please wait a moment and retry."
        if "permission" in err or "403" in err:
            return "⚠️ API permission error. Check your Groq account access."
        return f"⚠️ LLM error: {str(e)}"