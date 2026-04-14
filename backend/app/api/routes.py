from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import (
    AgentRunRequest,
    AgentRunResponse,
    DashboardSummaryResponse,
    HealthResponse,
)
from app.services.finpilot_runtime import get_runtime

router = APIRouter(prefix="/api", tags=["finpilot"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    runtime = get_runtime()
    return HealthResponse(
        status="ok",
        app="FinPilot AI",
        llm_provider=runtime.llm.__class__.__name__,
        data_loaded=runtime.repo.metadata.get("total_records", 0) > 0,
    )


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def dashboard_summary() -> DashboardSummaryResponse:
    runtime = get_runtime()
    data = runtime.dashboard_summary()
    return DashboardSummaryResponse(**data)


@router.post("/agent/run", response_model=AgentRunResponse)
def run_agent(payload: AgentRunRequest) -> AgentRunResponse:
    runtime = get_runtime()
    result = runtime.graph.invoke(payload.model_dump())

    return AgentRunResponse(
        route=result["route"],
        module=result["result"]["module"],
        narrative=result["narrative"],
        result=result["result"],
        approval=result["approval"],
        audit_event=result["audit_event"],
    )