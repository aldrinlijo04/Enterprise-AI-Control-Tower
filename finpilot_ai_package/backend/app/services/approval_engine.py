from __future__ import annotations


def evaluate_decision(confidence: float, amount_usd: float, risk_level: str) -> str:
    if confidence >= 0.92 and amount_usd < 50_000 and risk_level == "low":
        return "AUTO_APPROVE"
    if confidence >= 0.75 and risk_level in {"low", "medium"}:
        return "REVIEW_REQUIRED"
    return "ESCALATE"