
from __future__ import annotations

from typing import Any

from app.data.repository import FinPilotRepository
from app.services.finance_pipeline import simulate_pipeline
from app.services.llm_service import LLMService
from app.services.workflow_engine import WorkflowEngine
from app.tools.finance_tools import (
    build_journal_entry,
    calculate_poc_estimate,
    contract_interpretation_engine,
    detect_variance,
    reconciliation_engine,
    scenario_calculator,
)


def router_node(state: dict[str, Any]) -> dict[str, Any]:
    requested = state.get("requested_module")
    if requested:
        return {"route": requested}

    q = state.get("query", "").lower()

    if any(x in q for x in ["close", "journal", "recon", "sign-off", "posting"]):
        return {"route": "financial_close"}
    if any(x in q for x in ["contract", "revenue", "shortfall", "take-or-pay", "billable"]):
        return {"route": "revenue_recognition"}
    if any(x in q for x in ["estimate", "poc", "cost to complete", "project risk", "overrun"]):
        return {"route": "poc_accounting"}
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
    workflow_engine: WorkflowEngine,
) -> dict[str, Any]:
    workflow = workflow_engine.execute(
        module=module,
        reference=reference,
        amount_usd=amount_usd,
        confidence=confidence_score,
        risk_level=risk_level,
        result=result,
    )

    result["agent_insight"] = {
        "focus": result.get("headline") or result.get("summary"),
        "confidence": confidence_score,
        "risk": risk_level,
        "what_agent_checked": evidence,
        "why_escalated": workflow["decision"],
        "next_best_action": workflow["next_action"],
    }

    narrative = llm.summarize(
        module=module,
        user_query=state.get("query", ""),
        user_role=state.get("user_role", "finance_analyst"),
        result={
            **result,
            "workflow_decision": workflow["decision"],
            "next_action": workflow["next_action"],
        },
        evidence=evidence,
    )

    return {
        "route": module,
        "result": result,
        "narrative": narrative,
        "workflow": workflow,
    }


def make_financial_close_node(repo: FinPilotRepository, llm: LLMService, workflow_engine: WorkflowEngine):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        entity = state.get("entity")
        project_ids = state.get("project_ids", [])
        txns = repo.get_transactions(entity=entity, project_ids=project_ids)
        metrics = reconciliation_engine(txns)
        sample_amount = min(50000.0, max(2500.0, metrics["total_amount"] * 0.002))

        result = {
            "module": "financial_close",
            "entity": entity or "ALL",
            "summary": "Close readiness analysis completed.",
            "headline": f"{metrics['manual_review_candidates']} items need attention before sign-off.",
            "close_metrics": metrics,
            "variance_pct": detect_variance(metrics["flagged_count"] + metrics["open_count"], max(1, metrics["transaction_count"])),
            "proposed_journal": build_journal_entry(entity or "GLOBAL_CLOSE", sample_amount, "Close adjustment"),
            "rule_used": "Threshold-based close governance and exception-driven review logic",
            "source_data_used": ["transactions", "issues", "approval_thresholds"],
            "before_after_change": {"before": "manual review backlog", "after": "workflow-driven routing"},
            "recommendation": "Resolve flagged and open items first, then auto-post matched items and route the remaining exceptions.",
        }

        evidence = [
            f"Transactions analyzed: {metrics['transaction_count']}",
            f"Flagged items: {metrics['flagged_count']}",
            f"Open items: {metrics['open_count']}",
            f"Auto-post candidates: {metrics['auto_post_candidates']}",
        ]

        confidence = 0.91 if metrics["flagged_count"] < 40 else 0.78
        risk = "high" if metrics["flagged_count"] > 60 else "medium" if metrics["flagged_count"] > 20 else "low"

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
            workflow_engine=workflow_engine,
        )

    return node


def make_revenue_node(repo: FinPilotRepository, llm: LLMService, workflow_engine: WorkflowEngine):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        contract_id = state.get("contract_id")
        customer = state.get("customer")
        project_ids = state.get("project_ids", [])
        contracts = repo.get_contracts(project_ids=project_ids)
        if not contract_id and contracts:
            contract_id = contracts[0].get("contract_id")
        contract_id = contract_id or "CON-0001"

        contract = repo.get_contract_by_id(contract_id)
        deliveries = repo.get_deliveries(contract_id=contract_id, customer=customer, project_ids=project_ids)
        notices = repo.get_email_notices(reference=contract_id)
        templates = repo.get_contract_templates()

        evaluation = contract_interpretation_engine(contract, deliveries, notices, templates)
        pipeline = simulate_pipeline(contract, deliveries[0] if deliveries else None, evaluation)

        result = {
            "module": "revenue_recognition",
            "contract_id": contract_id,
            "summary": "Revenue treatment review completed.",
            "headline": f"Recommended recognized revenue is {evaluation['recognized_revenue_usd']:,.0f} USD.",
            "evaluation": evaluation,
            "pipeline": pipeline,
            "rule_used": evaluation["rule_or_clause_used"],
            "source_data_used": ["contracts", "deliveries", "email_notices", "contract_templates"],
            "before_after_change": {"before": "contract ambiguity", "after": pipeline["final_status"]},
            "recommendation": evaluation["recommendation"],
        }

        evidence = [
            f"Deliveries checked: {len(deliveries)}",
            f"Timely notices found: {sum(1 for x in notices if x.get('is_timely'))}",
            f"Shortfall volume: {evaluation['shortfall_volume_cuft']}",
            f"Pipeline status: {pipeline['final_status']}",
        ]

        return _finalize(
            module="revenue_recognition",
            reference=contract_id,
            amount_usd=float(evaluation["recognized_revenue_usd"]),
            confidence_score=float(evaluation["confidence_score"]),
            risk_level=str(evaluation["risk_level"]),
            result=result,
            evidence=evidence,
            state=state,
            llm=llm,
            workflow_engine=workflow_engine,
        )

    return node


def make_poc_node(repo: FinPilotRepository, llm: LLMService, workflow_engine: WorkflowEngine):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        project_ids = state.get("project_ids", [])
        project_id = state.get("project_id")
        if not project_id and project_ids:
            project_id = project_ids[0]
        project_id = project_id or "PRJ-0001"

        procurement = repo.get_procurement_events(project_id=project_id, project_ids=project_ids)
        market = repo.get_market_signals(linked_project=project_id, project_ids=project_ids)
        tracker = repo.get_project_tracker_events(project_id=project_id, project_ids=project_ids)
        assumptions = repo.get_project_assumptions(project_id=project_id, project_ids=project_ids)

        estimate = calculate_poc_estimate(procurement, market, tracker, assumptions)

        result = {
            "module": "poc_accounting",
            "project_id": project_id,
            "summary": "Project estimate refresh completed.",
            "headline": f"Remaining estimate is {estimate['remaining_estimate_usd']:,.0f} USD with {estimate['risk_level']} risk.",
            "estimate": estimate,
            "rule_used": "Deterministic aggregation of procurement, tracker, and market cost impacts",
            "source_data_used": ["procurement_events", "project_tracker_events", "market_signals", "project_assumptions"],
            "before_after_change": {"before": "prior project estimate", "after": estimate["remaining_estimate_usd"]},
            "recommendation": "Validate top cost drivers and send revised estimate for approval if material.",
        }

        evidence = [
            f"Procurement events: {len(procurement)}",
            f"Tracker events: {len(tracker)}",
            f"Market signals: {len(market)}",
            f"Procurement impact: {estimate['procurement_impact_usd']:,.0f} USD",
        ]

        return _finalize(
            module="poc_accounting",
            reference=project_id,
            amount_usd=float(estimate["remaining_estimate_usd"]),
            confidence_score=float(estimate["confidence_score"]),
            risk_level=str(estimate["risk_level"]),
            result=result,
            evidence=evidence,
            state=state,
            llm=llm,
            workflow_engine=workflow_engine,
        )

    return node


def make_capital_node(repo: FinPilotRepository, llm: LLMService, workflow_engine: WorkflowEngine):
    def node(state: dict[str, Any]) -> dict[str, Any]:
        project_ids = state.get("project_ids", [])
        project_id = state.get("project_id")
        if not project_id and project_ids:
            project_id = project_ids[0]
        project_id = project_id or "PRJ-0001"

        project = repo.get_project_by_id(project_id)
        assumptions = repo.get_project_assumptions(project_id=project_id, project_ids=project_ids)
        market = repo.get_market_signals(linked_project=project_id, project_ids=project_ids)
        scenario = state.get("scenario", {})

        calc = scenario_calculator(project, assumptions, market, scenario)

        result = {
            "module": "capital_allocation",
            "project_id": project_id,
            "summary": "Capital decision scenario completed.",
            "headline": f"Scenario shows IRR of {calc['irr_pct']}% and a recommendation to {calc['recommendation'].lower()}.",
            "scenario_result": calc,
            "rule_used": "Scenario-based IRR and NPV decision thresholds",
            "source_data_used": ["projects", "project_assumptions", "market_signals", "scenario_simulations"],
            "before_after_change": {"before": "baseline investment view", "after": calc["recommendation"]},
            "recommendation": calc["recommendation"],
        }

        evidence = [
            f"IRR: {calc['irr_pct']}%",
            f"NPV: {calc['npv_usd']:,.0f} USD",
            f"Annual cashflow proxy: {calc['annual_cashflow_proxy_usd']:,.0f} USD",
        ]

        return _finalize(
            module="capital_allocation",
            reference=project_id,
            amount_usd=abs(float(calc["npv_usd"])),
            confidence_score=float(calc["confidence_score"]),
            risk_level=str(calc["risk_level"]),
            result=result,
            evidence=evidence,
            state=state,
            llm=llm,
            workflow_engine=workflow_engine,
        )

    return node
