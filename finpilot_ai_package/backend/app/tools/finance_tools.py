from __future__ import annotations

from typing import Any


def threshold_check(amount_usd: float) -> str:
    if amount_usd >= 1_000_000:
        return "CFO_APPROVAL"
    if amount_usd >= 250_000:
        return "CONTROLLER_APPROVAL"
    return "AUTO"


def detect_variance(actual: float, expected: float) -> float:
    if expected == 0:
        return 0.0
    return round(((actual - expected) / expected) * 100, 2)


def reconciliation_engine(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    matched_count = sum(1 for t in transactions if t.get("status") == "matched")
    posted_count = sum(1 for t in transactions if t.get("status") == "posted")
    open_count = sum(1 for t in transactions if t.get("status") == "open")
    flagged_count = sum(1 for t in transactions if t.get("status") == "flagged")
    total_amount = round(sum(float(t.get("amount_usd", 0)) for t in transactions), 2)
    return {
        "transaction_count": len(transactions),
        "matched_count": matched_count,
        "posted_count": posted_count,
        "open_count": open_count,
        "flagged_count": flagged_count,
        "auto_post_candidates": matched_count,
        "manual_review_candidates": flagged_count + open_count,
        "total_amount": total_amount,
    }


def build_journal_entry(reference: str, amount_usd: float, memo: str) -> dict[str, Any]:
    return {
        "reference": reference,
        "memo": memo,
        "debit": {"gl_account": "120100", "amount_usd": round(amount_usd, 2)},
        "credit": {"gl_account": "400100", "amount_usd": round(amount_usd, 2)},
    }


def calculate_poc_estimate(
    procurement_events: list[dict[str, Any]],
    market_signals: list[dict[str, Any]],
    tracker_events: list[dict[str, Any]],
    assumptions: list[dict[str, Any]],
) -> dict[str, Any]:
    procurement_impact = round(sum(float(x.get("estimated_cost_impact_usd", 0)) for x in procurement_events), 2)
    tracker_impact = round(sum(float(x.get("estimated_cost_impact_usd", 0)) for x in tracker_events), 2)
    market_impact = round(sum(max(0, float(x.get("change_vs_last_estimate_pct", 0))) * 50_000 for x in market_signals), 2)
    base = sum(float(x.get("base_value", 0)) for x in assumptions) * 10_000_000
    remaining = round(base + procurement_impact + tracker_impact + market_impact, 2)

    risk_score = 0
    if procurement_impact > 20_000_000:
        risk_score += 1
    if tracker_impact > 15_000_000:
        risk_score += 1
    if market_impact > 5_000_000:
        risk_score += 1

    risk_level = "high" if risk_score >= 2 else "medium" if risk_score == 1 else "low"
    confidence = 0.92 if risk_level == "low" else 0.82 if risk_level == "medium" else 0.72

    return {
        "remaining_estimate_usd": remaining,
        "procurement_impact_usd": procurement_impact,
        "tracker_impact_usd": tracker_impact,
        "market_impact_usd": market_impact,
        "risk_level": risk_level,
        "confidence_score": confidence,
    }


def contract_interpretation_engine(
    contract: dict[str, Any] | None,
    deliveries: list[dict[str, Any]],
    notices: list[dict[str, Any]],
    templates: list[dict[str, Any]],
) -> dict[str, Any]:
    delivery = deliveries[0] if deliveries else {}
    shortfall = float(delivery.get("shortfall_volume_cuft", 0))
    unit_price = float(delivery.get("unit_price_usd", 0))
    recognized = round(shortfall * unit_price, 2)

    timely_notice = any(n.get("is_timely") for n in notices)
    has_take_or_pay = bool(contract.get("contains_take_or_pay_clause")) if contract else False
    has_makeup = bool(contract.get("contains_makeup_clause")) if contract else False

    if has_take_or_pay and timely_notice:
        rule = "Take-or-pay clause with timely notice support"
        risk = "low"
        confidence = 0.93
        recommendation = "Recognize the supported shortfall amount and document the notice trail."
    elif has_take_or_pay and has_makeup:
        rule = "Take-or-pay with makeup clause; revenue requires evidence review"
        risk = "medium"
        confidence = 0.81
        recommendation = "Send for review before final recognition because makeup rights may defer treatment."
    else:
        rule = "Insufficient clause support for early recognition"
        risk = "high"
        confidence = 0.69
        recognized = 0.0
        recommendation = "Block revenue recognition until contract support and notice evidence are validated."

    return {
        "committed_volume_cuft": delivery.get("committed_volume_cuft", 0),
        "actual_volume_cuft": delivery.get("actual_volume_cuft", 0),
        "shortfall_volume_cuft": shortfall,
        "recognized_revenue_usd": recognized,
        "rule_or_clause_used": rule,
        "risk_level": risk,
        "confidence_score": confidence,
        "recommendation": recommendation,
    }


def scenario_calculator(
    project: dict[str, Any] | None,
    assumptions: list[dict[str, Any]],
    market_signals: list[dict[str, Any]],
    scenario: dict[str, Any],
) -> dict[str, Any]:
    assumption = assumptions[0] if assumptions else {}
    base_capex = float(project.get("capex_usd", 200_000_000)) if project else 200_000_000
    capex = float(scenario.get("capex", base_capex))
    carbon = float(scenario.get("carbon_price", assumption.get("carbon_price", 80)))
    tax_credit = bool(scenario.get("tax_credit_passes", assumption.get("tax_credit", False)))

    market_penalty = sum(max(0, float(x.get("change_vs_last_estimate_pct", 0))) for x in market_signals) * 200_000
    annual_cashflow = max(20_000_000, 180_000_000 - market_penalty + (15_000_000 if tax_credit else 0) + (carbon * 150_000))
    irr = round(max(4.0, min(24.0, (annual_cashflow / max(capex, 1)) * 100)), 2)
    npv = round((annual_cashflow * 7.2) - capex, 2)

    if irr >= 15 and npv > 0:
        recommendation = "Accelerate investment"
        risk = "low"
        confidence = 0.91
    elif irr >= 11 and npv > 0:
        recommendation = "Approve with monitoring"
        risk = "medium"
        confidence = 0.84
    elif irr >= 8:
        recommendation = "Delay decision"
        risk = "medium"
        confidence = 0.76
    else:
        recommendation = "Do not approve"
        risk = "high"
        confidence = 0.71

    return {
        "irr_pct": irr,
        "npv_usd": npv,
        "annual_cashflow_proxy_usd": round(annual_cashflow, 2),
        "recommendation": recommendation,
        "risk_level": risk,
        "confidence_score": confidence,
    }