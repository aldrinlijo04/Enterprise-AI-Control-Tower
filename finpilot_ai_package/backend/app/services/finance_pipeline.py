from __future__ import annotations

from typing import Any


def simulate_pipeline(contract: dict[str, Any] | None, delivery: dict[str, Any] | None, evaluation: dict[str, Any]) -> dict[str, Any]:
    delivery = delivery or {}
    contract = contract or {}

    contract_ok = not bool(contract.get("risk_flag", False))
    delivery_ok = float(delivery.get("shortfall_volume_cuft", 0)) < 100_000
    revenue_allowed = float(evaluation.get("recognized_revenue_usd", 0)) > 0

    if contract_ok and delivery_ok and revenue_allowed:
        final_status = "APPROVED"
    elif revenue_allowed:
        final_status = "REVIEW_REQUIRED"
    else:
        final_status = "BLOCKED"

    return {
        "stages": [
            {"stage": "contract", "status": "ok" if contract_ok else "review"},
            {"stage": "delivery", "status": "ok" if delivery_ok else "review"},
            {"stage": "billing", "status": "ok" if revenue_allowed else "blocked"},
            {"stage": "revenue", "status": "ok" if revenue_allowed else "blocked"},
            {"stage": "audit", "status": "pending"},
        ],
        "final_status": final_status,
    }