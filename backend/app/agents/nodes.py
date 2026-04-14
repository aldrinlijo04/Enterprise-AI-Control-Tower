from __future__ import annotations

from typing import Any

from app.data.repository import FinPilotRepository
from app.services.approval_service import ApprovalService
from app.services.audit_service import AuditService
from app.services.llm_service import LLMService
from app.tools.finance_tools import (
    build_journal_entry,
    calculate_poc_estimate,
    contract_interpretation_engine,
    reconciliation_engine,
    scenario_calculator,
    variance_detector,
)


def router_node(state: dict[str, Any]) -> dict[str, Any]:
    requested = state.get("requested_module")
    if requested:
        return {"route": requested}

    q = state["query"].lower()

    if any(term in q for term in ["close", "month-end", "month end", "recon", "journal", "margin", "exception"]):
        return {"route": "financial_close"}

    if any(term in q for term in ["poc", "completion", "cost to complete", "estimate", "forecast", "project", "neom"]):
        return {"route": "poc_accounting"}

    if any(term in q for term in ["contract", "take-or-pay", "take or pay", "shortfall", "revenue", "clause", "billable"]):
        return {"route": "revenue_recognition"}

    return {"route": "capital_allocation"}


def _finalize(
    *,
    module: str,
    reference: str,
    amount_usd: float,
    confidence_score: float,
    risk_level: str,
    result: dict[str, Any],
    evidence: list[str],
    state: dict[str, Any],
    llm: LLMService,
    approval_service: ApprovalService,
    audit_service: AuditService,
) -> dict[str, Any]:
    approval = approval_service.classify(
        amount_usd=amount_usd,
        confidence_score=confidence_score,
        risk_level=risk_level,
        module=module,
        reference=reference,
    )

    narrative = llm.summarize(
        module=module,
        user_query=state.get("query", ""),
        user_role=state.get("user_role", "finance_analyst"),
        result=result,
        evidence=evidence,
    )

    audit_event = audit_service.write_event(
        {
            "module": module,
            "reference": reference,
            "confidence_score": confidence_score,
            "risk_level": risk_level,
            "approval_mode": approval["recommended_mode"],
            "result_snapshot": result,
        }
    )

    return {
        "result": result,
        "approval": approval,
        "audit_event": audit_event,
        "narrative": narrative,
    }


def make_financial_close_node(
    repo: FinPilotRepository,
    llm: LLMService,
    approval_service: ApprovalService,
    audit_service: AuditService,
):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        entity = state.get("entity")
        transactions = repo.get_transactions(entity=entity)
        metrics = reconciliation_engine(transactions)

        sample_amount = min(50000.0, max(2500.0, metrics["total_amount"] * 0.002))
        journal = build_journal_entry(
            debit_account="120100",
            credit_account="400100",
            amount_usd=sample_amount,
            memo="Auto-generated close adjustment",
            reference=entity or "GLOBAL_CLOSE",
        )
        variance = variance_detector(metrics["flagged_count"], max(1, metrics["posted_count"]))

        result = {
            "module": "financial_close",
            "entity": entity or "ALL",
            "summary": f"{entity or 'Global'} close has been assessed.",
            "headline": f"{metrics['manual_review_candidates']} items require review before clean sign-off.",
            "close_metrics": metrics,
            "variance": variance,
            "proposed_journal": journal,
            "recommendation": "Resolve flagged items first, then move matched items through posting and route unresolved issues for controller review.",
        }

        evidence = [
            f"Transaction count: {metrics['transaction_count']}",
            f"Auto-post candidates: {metrics['auto_post_candidates']}",
            f"Manual review candidates: {metrics['manual_review_candidates']}",
            f"Flagged items: {metrics['flagged_count']}",
            f"Open items: {metrics['open_count']}",
            f"Posted items: {metrics['posted_count']}",
        ]

        confidence = 0.93 if metrics["flagged_count"] < metrics["matched_count"] else 0.78
        risk = "medium" if metrics["flagged_count"] > 10 else "low"

        return _finalize(
            module="financial_close",
            reference=entity or "GLOBAL_CLOSE",
            amount_usd=sample_amount,
            confidence_score=confidence,
            risk_level=risk,
            result=result,
            evidence=evidence,
            state=state,
            llm=llm,
            approval_service=approval_service,
            audit_service=audit_service,
        )

    return node


def make_poc_node(
    repo: FinPilotRepository,
    llm: LLMService,
    approval_service: ApprovalService,
    audit_service: AuditService,
):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        project_id = state.get("project_id") or "NEOM Phase 2"

        procurement = repo.get_procurement_events(project_id=project_id)
        market = repo.get_market_signals(linked_project=project_id)
        tracker = repo.get_project_tracker_events(project_id=project_id)
        assumptions = repo.get_project_assumptions(project_id=project_id)

        estimate = calculate_poc_estimate(procurement, market, tracker, assumptions)

        journal = build_journal_entry(
            debit_account="500100",
            credit_account="400200",
            amount_usd=min(estimate["remaining_estimate_usd"] * 0.08, 2_500_000),
            memo="POC re-estimation adjustment",
            reference=project_id,
        )

        result = {
            "module": "poc_accounting",
            "project_id": project_id,
            "summary": f"{project_id} estimate has been refreshed.",
            "headline": f"Remaining estimate is {estimate['remaining_estimate_usd']:,.0f} USD with {estimate['risk_level']} risk.",
            "estimate": estimate,
            "recommendation": "Validate the revised estimate with project controls and approve the POC adjustment if the change is material.",
        }

        evidence = [
            f"Procurement events considered: {len(procurement)}",
            f"Market signals considered: {len(market)}",
            f"Project tracker events considered: {len(tracker)}",
            f"Assumptions considered: {len(assumptions)}",
            f"Procurement impact: {estimate['procurement_impact_usd']:,.0f} USD",
            f"Market impact: {estimate['market_impact_usd']:,.0f} USD",
            f"Tracker impact: {estimate['tracker_impact_usd']:,.0f} USD",
        ]

        return _finalize(
            module="poc_accounting",
            reference=project_id,
            amount_usd=journal["debit"]["amount_usd"],
            confidence_score=estimate["confidence_score"],
            risk_level=estimate["risk_level"],
            result=result,
            evidence=evidence,
            state=state,
            llm=llm,
            approval_service=approval_service,
            audit_service=audit_service,
        )

    return node


def make_revenue_node(
    repo: FinPilotRepository,
    llm: LLMService,
    approval_service: ApprovalService,
    audit_service: AuditService,
):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        contract_id = state.get("contract_id") or "TOP-SAMSUNG-001"
        customer = state.get("customer")

        deliveries = repo.get_deliveries(contract_id=contract_id, customer=customer)
        notices = repo.get_email_notices(reference=contract_id)
        templates = repo.get_contract_templates()

        evaluation = contract_interpretation_engine(deliveries, notices, templates)

        journal = build_journal_entry(
            debit_account="120100",
            credit_account="400100",
            amount_usd=evaluation["recognized_revenue_usd"],
            memo="Take-or-pay revenue recognition entry",
            reference=contract_id,
        )

        result = {
            "module": "revenue_recognition",
            "contract_id": contract_id,
            "summary": f"Contract treatment has been reviewed for {contract_id}.",
            "headline": f"Recommended recognized revenue is {evaluation['recognized_revenue_usd']:,.0f} USD.",
            "evaluation": evaluation,
            "recommendation": evaluation["recommendation"],
        }

        evidence = [
            f"Matching deliveries found: {len(deliveries)}",
            f"Related notices found: {len(notices)}",
            f"Contract templates considered: {len(templates)}",
            f"Shortfall volume: {evaluation['shortfall_volume_cuft']:,.0f}",
            f"Rule applied: {evaluation['rule_or_clause_used']}",
            f"Risk level: {evaluation['risk_level']}",
        ]

        return _finalize(
            module="revenue_recognition",
            reference=contract_id,
            amount_usd=evaluation["recognized_revenue_usd"],
            confidence_score=evaluation["confidence_score"],
            risk_level=evaluation["risk_level"],
            result=result,
            evidence=evidence,
            state=state,
            llm=llm,
            approval_service=approval_service,
            audit_service=audit_service,
        )

    return node


def make_capital_node(
    repo: FinPilotRepository,
    llm: LLMService,
    approval_service: ApprovalService,
    audit_service: AuditService,
):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        project_id = state.get("project_id") or "NEOM Phase 2"
        assumptions = repo.get_project_assumptions(project_id=project_id)
        market = repo.get_market_signals(linked_project=project_id)
        scenario = state.get("scenario", {})

        calc = scenario_calculator(project_id, assumptions, market, scenario)

        result = {
            "module": "capital_allocation",
            "project_id": project_id,
            "summary": f"Strategic scenario analysis has been completed for {project_id}.",
            "headline": f"Current scenario shows IRR of {calc['irr_pct']}% and recommendation to {calc['recommendation'].lower()}.",
            "scenario_result": calc,
            "recommendation": calc["recommendation"],
        }

        evidence = [
            f"Project assumptions considered: {len(assumptions)}",
            f"Market signals considered: {len(market)}",
            f"Scenario inputs: {scenario}",
            f"IRR: {calc['irr_pct']}%",
            f"NPV: {calc['npv_usd']:,.0f} USD",
            f"Annual cashflow proxy: {calc['annual_cashflow_proxy_usd']:,.0f} USD",
        ]

        return _finalize(
            module="capital_allocation",
            reference=project_id,
            amount_usd=abs(calc["npv_usd"]),
            confidence_score=calc["confidence_score"],
            risk_level=calc["risk_level"],
            result=result,
            evidence=evidence,
            state=state,
            llm=llm,
            approval_service=approval_service,
            audit_service=audit_service,
        )

    return node