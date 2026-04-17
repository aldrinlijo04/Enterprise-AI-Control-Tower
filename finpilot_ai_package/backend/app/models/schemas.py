
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


ModuleName = Literal["financial_close", "revenue_recognition", "poc_accounting", "capital_allocation"]


class AgentRunRequest(BaseModel):
    query: str
    requested_module: ModuleName | None = None
    user_role: str = "finance_analyst"
    entity: str | None = None
    contract_id: str | None = None
    project_id: str | None = None
    project_ids: list[str] = Field(default_factory=list)
    customer: str | None = None
    scenario: dict[str, Any] = Field(default_factory=dict)
    use_llm_summary: bool = True


class AgentRunResponse(BaseModel):
    route: str
    module: str
    narrative: str
    result: dict[str, Any]
    workflow: dict[str, Any]


class DashboardSummaryResponse(BaseModel):
    metadata: dict[str, Any]
    counts: dict[str, int]
    pending_approvals: int
    top_issue_actions: list[dict[str, Any]]
    recent_workflow_events: list[dict[str, Any]]
    realtime_activities: list[dict[str, Any]] = Field(default_factory=list)
    realtime_messages: list[dict[str, Any]] = Field(default_factory=list)


class ApprovalActionRequest(BaseModel):
    approval_id: str
    action: Literal["approve", "reject", "escalate"]
    actor: str
    comment: str | None = None
