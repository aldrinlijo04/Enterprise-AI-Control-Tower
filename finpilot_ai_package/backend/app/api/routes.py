from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AgentRunRequest,
    AgentRunResponse,
    ApprovalActionRequest,
    DashboardSummaryResponse,
)
from app.services.audit_logger import read_audit_events
from app.services.finpilot_runtime import get_runtime
from app.services.query_router import classify_query

router = APIRouter(prefix="/api", tags=["finpilot"])


def _build_general_context(payload: AgentRunRequest, runtime) -> tuple[dict, list[str]]:
    project_ids = payload.project_ids or ([payload.project_id] if payload.project_id else [])
    projects = runtime.repo.get_projects(project_ids=project_ids)
    contracts = runtime.repo.get_contracts(project_ids=project_ids)
    issues = runtime.repo.get_issues(project_ids=project_ids)
    approvals = runtime.queue.list_items(status=None)
    knowledge = runtime.repo.knowledge_search(payload.query, limit=6)

    selected_projects = projects[:5]
    selected_contracts = contracts[:5]
    selected_issues = issues[:5]

    counts = runtime.repo.summary_counts(project_ids=project_ids)

    context = {
        "scope": {
            "requested_module": payload.requested_module,
            "project_id": payload.project_id,
            "project_ids": project_ids,
            "contract_id": payload.contract_id,
            "customer": payload.customer,
            "user_role": payload.user_role,
        },
        "portfolio_counts": counts,
        "projects": selected_projects,
        "contracts": selected_contracts,
        "issues": selected_issues,
        "pending_approvals": approvals[:5],
        "knowledge_hits": knowledge,
        "scenario": payload.scenario,
    }

    evidence = [
        f"Projects in scope: {counts.get('projects', 0)}",
        f"Contracts in scope: {counts.get('contracts', 0)}",
        f"Issues in scope: {counts.get('issues', 0)}",
        f"Pending issues: {counts.get('pending_issues', 0)}",
    ]

    if selected_projects:
        first = selected_projects[0]
        evidence.append(
            f"Lead project example: {first.get('project_id')} {first.get('project_name')} in {first.get('country')} with {first.get('risk_level')} risk"
        )

    if selected_issues:
        first_issue = selected_issues[0]
        evidence.append(
            f"Example issue: {first_issue.get('issue_title', first_issue.get('recommended_action', 'Issue logged'))}"
        )

    return context, evidence


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def dashboard_summary():
    runtime = get_runtime()
    return DashboardSummaryResponse(**runtime.dashboard_summary())


@router.get("/projects")
def projects():
    runtime = get_runtime()
    rows = runtime.repo.get_projects()
    return {
        "items": [
            {
                "project_id": item.get("project_id"),
                "project_name": item.get("project_name"),
                "country": item.get("country"),
                "region": item.get("region"),
                "business_unit": item.get("business_unit"),
                "capex_usd": item.get("capex_usd"),
                "completion_pct": item.get("completion_pct"),
                "delay_days": item.get("delay_days"),
                "forecast_variance_pct": item.get("forecast_variance_pct"),
                "risk_level": item.get("risk_level"),
                "status": item.get("status"),
                "project_controller": item.get("project_controller"),
            }
            for item in rows
        ]
    }


@router.post("/agent/run", response_model=AgentRunResponse)
def run_agent(payload: AgentRunRequest):
    runtime = get_runtime()
    intent = classify_query(payload.query)

    if intent == "dataset_lookup":
        lookup = runtime.repo.dataset_lookup_answer(payload.query, project_ids=payload.project_ids)
        narrative = runtime.llm.answer_general(
            user_query=payload.query,
            user_role=payload.user_role,
            context={
                "lookup_result": lookup,
                "scope": {
                    "project_id": payload.project_id,
                    "project_ids": payload.project_ids,
                    "requested_module": payload.requested_module,
                },
            },
            evidence=[str(lookup.get("answer", "Lookup completed"))],
        ) if payload.use_llm_summary else str(lookup.get("answer", "Lookup completed"))

        return AgentRunResponse(
            route="dataset_lookup",
            module=(payload.requested_module or "capital_allocation"),
            narrative=narrative,
            result={"module": "dataset_lookup", **lookup},
            workflow={
                "decision": "INFO_ONLY",
                "threshold": "NONE",
                "next_action": "NONE",
                "approval_item": None,
                "timeline": [
                    {"step": "query_classified", "status": "done"},
                    {"step": "dataset_lookup_completed", "status": "done"},
                ],
                "audit_entry": {},
            },
        )

    if intent == "portfolio_general":
        context, evidence = _build_general_context(payload, runtime)
        narrative = runtime.llm.answer_general(
            user_query=payload.query,
            user_role=payload.user_role,
            context=context,
            evidence=evidence,
        )
        return AgentRunResponse(
            route="portfolio_general",
            module="portfolio_general",
            narrative=narrative,
            result={
                "module": "portfolio_general",
                "summary": "General portfolio response generated.",
                "context": context,
            },
            workflow={
                "decision": "INFO_ONLY",
                "threshold": "NONE",
                "next_action": "NONE",
                "approval_item": None,
                "timeline": [
                    {"step": "query_classified", "status": "done"},
                    {"step": "portfolio_context_built", "status": "done"},
                    {"step": "llm_response_generated", "status": "done"},
                ],
                "audit_entry": {},
            },
        )

    result = runtime.graph.invoke(payload.model_dump())
    return AgentRunResponse(
        route=result["route"],
        module=result["result"]["module"],
        narrative=result["narrative"],
        result=result["result"],
        workflow=result["workflow"],
    )


@router.get("/workflow/timeline")
def workflow_timeline(limit: int = 50):
    return {"events": read_audit_events(limit=limit)}


@router.get("/approvals")
def approvals(status: str | None = None):
    runtime = get_runtime()
    return {"items": runtime.queue.list_items(status=status)}


@router.post("/approvals/action")
def approval_action(payload: ApprovalActionRequest):
    runtime = get_runtime()
    item = runtime.queue.act_on_item(
        approval_id=payload.approval_id,
        action=payload.action,
        actor=payload.actor,
        comment=payload.comment,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")
    return {"item": item}


@router.get("/exceptions")
def exceptions(module: str | None = None, status: str | None = None, limit: int = 50):
    runtime = get_runtime()
    items = runtime.repo.get_issues(status=status, module=module)[:limit]
    return {"items": items}


@router.get("/issue-action-board")
def issue_action_board(limit: int = 25):
    runtime = get_runtime()
    return {"items": runtime.repo.get_issue_action_board(limit=limit)}