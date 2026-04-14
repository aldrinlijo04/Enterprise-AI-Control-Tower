from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


ModuleName = Literal[
    "financial_close",
    "poc_accounting",
    "revenue_recognition",
    "capital_allocation",
]


class AgentRunRequest(BaseModel):
    query: str = Field(..., min_length=3)
    requested_module: ModuleName | None = None
    user_role: str = "finance_analyst"
    entity: str | None = None
    contract_id: str | None = None
    project_id: str | None = None
    customer: str | None = None
    scenario: dict[str, Any] = Field(default_factory=dict)
    use_llm_summary: bool = True


class AgentRunResponse(BaseModel):
    route: str
    module: ModuleName
    narrative: str
    result: dict[str, Any]
    approval: dict[str, Any]
    audit_event: dict[str, Any]


class DashboardSummaryResponse(BaseModel):
    metadata: dict[str, Any]
    counts: dict[str, int]
    open_exception_summary: dict[str, int]
    latest_runtime_events: list[dict[str, Any]]


class KnowledgeSearchResponse(BaseModel):
    query: str
    results: list[dict[str, Any]]


class HealthResponse(BaseModel):
    status: str
    app: str
    llm_provider: str
    data_loaded: bool
