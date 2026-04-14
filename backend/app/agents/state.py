from __future__ import annotations

from typing import Any, TypedDict


class FinPilotState(TypedDict, total=False):
    query: str
    requested_module: str | None
    user_role: str
    entity: str | None
    contract_id: str | None
    project_id: str | None
    customer: str | None
    scenario: dict[str, Any]
    use_llm_summary: bool

    route: str
    result: dict[str, Any]
    approval: dict[str, Any]
    audit_event: dict[str, Any]
    narrative: str
