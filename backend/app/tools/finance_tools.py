from __future__ import annotations

from math import isfinite
from statistics import mean
from typing import Any


def build_journal_entry(
    debit_account: str,
    credit_account: str,
    amount_usd: float,
    memo: str,
    reference: str,
) -> dict[str, Any]:
    return {
        "debit": {"account": debit_account, "amount_usd": round(amount_usd, 2)},
        "credit": {"account": credit_account, "amount_usd": round(amount_usd, 2)},
        "memo": memo,
        "reference": reference,
    }


def reconciliation_engine(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    total = sum(float(t["amount"]) for t in transactions)
    open_items = [t for t in transactions if t["status"] == "open"]
    flagged = [t for t in transactions if t["status"] == "flagged"]
    matched = [t for t in transactions if t["status"] == "matched"]
    posted = [t for t in transactions if t["status"] == "posted"]

    return {
        "transaction_count": len(transactions),
        "total_amount": round(total, 2),
        "open_count": len(open_items),
        "flagged_count": len(flagged),
        "matched_count": len(matched),
        "posted_count": len(posted),
        "auto_post_candidates": len(matched) + len(posted),
        "manual_review_candidates": len(flagged) + max(0, len(open_items) // 3),
    }


def threshold_checker(value: float, threshold: float) -> bool:
    return value > threshold


def variance_detector(current: float, baseline: float) -> dict[str, Any]:
    if baseline == 0:
        return {"variance_pct": None, "is_material": True}
    pct = ((current - baseline) / baseline) * 100
    return {"variance_pct": round(pct, 2), "is_material": abs(pct) >= 5}


def calculate_poc_estimate(
    procurement_events: list[dict[str, Any]],
    market_signals: list[dict[str, Any]],
    tracker_events: list[dict[str, Any]],
    assumptions: list[dict[str, Any]],
) -> dict[str, Any]:
    procurement_impact = sum(float(e["estimated_cost_impact_usd"]) for e in procurement_events)
    tracker_impact = sum(float(e["estimated_cost_impact_usd"]) for e in tracker_events)
    adverse_signals = [s for s in market_signals if float(s["change_vs_last_estimate_pct"]) > 0]
    market_impact = sum(max(0.0, float(s["change_vs_last_estimate_pct"])) * 100000 for s in adverse_signals)
    base_assumption = sum(float(a["base_value"]) for a in assumptions[:5]) * 10000

    remaining_estimate = procurement_impact + tracker_impact + market_impact + base_assumption
    risk_level = "high" if remaining_estimate > 15000000 else "medium" if remaining_estimate > 5000000 else "low"
    confidence = 0.82 if assumptions else 0.65

    return {
        "remaining_estimate_usd": round(remaining_estimate, 2),
        "procurement_impact_usd": round(procurement_impact, 2),
        "tracker_impact_usd": round(tracker_impact, 2),
        "market_impact_usd": round(market_impact, 2),
        "risk_level": risk_level,
        "confidence_score": confidence,
    }


def contract_interpretation_engine(
    deliveries: list[dict[str, Any]],
    notices: list[dict[str, Any]],
    contract_templates: list[dict[str, Any]],
) -> dict[str, Any]:
    if not deliveries:
        return {
            "recognized_revenue_usd": 0.0,
            "shortfall_volume_cuft": 0,
            "rule_or_clause_used": "No matching delivery data",
            "confidence_score": 0.4,
            "risk_level": "high",
            "recommendation": "Manual review required due to missing delivery data.",
        }

    latest = deliveries[0]
    shortfall = float(latest["shortfall_volume_cuft"])
    commitment = float(latest["committed_volume_cuft"])
    actual = float(latest["actual_volume_cuft"])
    unit_price = float(latest["unit_price_usd"])
    min_bill = commitment * unit_price
    shortfall_bill = shortfall * unit_price
    notice_found = any(n["notice_type"] == "shortfall_notice" for n in notices)

    template = contract_templates[0] if contract_templates else {}
    make_up = bool(template.get("contains_makeup_clause", True))
    prepayment = float(latest.get("prepayment_available_usd", 0))

    if shortfall <= 0:
        rec = min_bill
        clause = "Take commitment satisfied"
        recommendation = "Recognize standard committed revenue."
        confidence = 0.98
        risk = "low"
    elif notice_found and make_up:
        rec = max(0.0, min_bill - min(shortfall_bill, prepayment))
        clause = "Section 5.3 makeup / notice logic"
        recommendation = "Recognize committed revenue net of supported makeup or prepayment adjustments."
        confidence = 0.87
        risk = "medium"
    else:
        rec = min_bill
        clause = "Section 4.2.1 shortfall billable without notice"
        recommendation = "Recognize full minimum billing due to unexcused shortfall."
        confidence = 0.96
        risk = "low"

    return {
        "recognized_revenue_usd": round(rec, 2),
        "shortfall_volume_cuft": shortfall,
        "actual_volume_cuft": actual,
        "committed_volume_cuft": commitment,
        "rule_or_clause_used": clause,
        "confidence_score": confidence,
        "risk_level": risk,
        "recommendation": recommendation,
    }


def npv(rate: float, cashflows: list[float]) -> float:
    total = 0.0
    for i, cf in enumerate(cashflows):
        total += cf / ((1 + rate) ** i)
    return total


def irr_estimate(cashflows: list[float]) -> float:
    low, high = -0.9, 1.5
    for _ in range(120):
        mid = (low + high) / 2
        value = npv(mid, cashflows)
        if value > 0:
            low = mid
        else:
            high = mid
    return round(((low + high) / 2) * 100, 2)


def scenario_calculator(project_id: str, assumptions: list[dict[str, Any]], market_signals: list[dict[str, Any]], scenario: dict[str, Any]) -> dict[str, Any]:
    scenario = scenario or {}
    carbon_override = float(scenario.get("carbon_price", 85))
    tax_credit_passes = bool(scenario.get("tax_credit_passes", True))
    capex = float(scenario.get("capex", 500_000_000))

    base_margin = 140_000_000 if "NEOM" in project_id else 90_000_000 if "Louisiana" in project_id else 25_000_000
    carbon_benefit = max(0, carbon_override - 85) * (1_800_000 if "NEOM" in project_id else -900_000)
    tax_impact = 30_000_000 if ("Louisiana" in project_id and tax_credit_passes) else -15_000_000 if "Louisiana" in project_id else 0
    signal_adjustment = sum(float(s["change_vs_last_estimate_pct"]) for s in market_signals[:5]) * 150000
    assumption_bias = sum(float(a["base_value"]) for a in assumptions[:3]) * 10000

    annual_cash = base_margin + carbon_benefit + tax_impact - signal_adjustment + assumption_bias
    cashflows = [-capex, annual_cash, annual_cash, annual_cash * 1.05, annual_cash * 1.08, annual_cash * 1.10]
    project_irr = irr_estimate(cashflows)
    project_npv = round(npv(0.12, cashflows), 2)

    if project_irr >= 15:
        recommendation = "Accelerate investment"
    elif project_irr >= 12:
        recommendation = "Approve with monitoring"
    elif project_irr >= 8:
        recommendation = "Delay decision"
    else:
        recommendation = "Do not approve"

    return {
        "project_id": project_id,
        "scenario_inputs": scenario,
        "annual_cashflow_proxy_usd": round(annual_cash, 2),
        "irr_pct": project_irr,
        "npv_usd": project_npv,
        "recommendation": recommendation,
        "risk_level": "high" if project_irr < 8 else "medium" if project_irr < 12 else "low",
        "confidence_score": 0.84,
    }


def management_summary_lines(values: dict[str, Any]) -> list[str]:
    lines = []
    for key, value in values.items():
        lines.append(f"{key}: {value}")
    return lines
