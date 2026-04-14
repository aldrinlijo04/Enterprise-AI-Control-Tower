from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from app.agents.nodes import (
    make_capital_node,
    make_financial_close_node,
    make_poc_node,
    make_revenue_node,
    router_node,
)
from app.agents.state import FinPilotState
from app.data.repository import FinPilotRepository
from app.services.approval_service import ApprovalService
from app.services.audit_service import AuditService
from app.services.llm_service import LLMService


class FinPilotGraph:
    def __init__(
        self,
        repo: FinPilotRepository,
        llm: LLMService,
        approval_service: ApprovalService,
        audit_service: AuditService,
    ) -> None:
        graph = StateGraph(FinPilotState)
        graph.add_node("router", router_node)
        graph.add_node("financial_close", make_financial_close_node(repo, llm, approval_service, audit_service))
        graph.add_node("poc_accounting", make_poc_node(repo, llm, approval_service, audit_service))
        graph.add_node("revenue_recognition", make_revenue_node(repo, llm, approval_service, audit_service))
        graph.add_node("capital_allocation", make_capital_node(repo, llm, approval_service, audit_service))

        graph.add_edge(START, "router")
        graph.add_conditional_edges(
            "router",
            lambda state: state["route"],
            {
                "financial_close": "financial_close",
                "poc_accounting": "poc_accounting",
                "revenue_recognition": "revenue_recognition",
                "capital_allocation": "capital_allocation",
            },
        )
        graph.add_edge("financial_close", END)
        graph.add_edge("poc_accounting", END)
        graph.add_edge("revenue_recognition", END)
        graph.add_edge("capital_allocation", END)
        self.graph = graph.compile()

    def invoke(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.graph.invoke(payload)
