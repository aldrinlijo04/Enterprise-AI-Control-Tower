from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.agents.nodes import (
    make_capital_node,
    make_financial_close_node,
    make_poc_node,
    make_revenue_node,
    router_node,
)
from app.data.repository import FinPilotRepository
from app.services.llm_service import LLMService
from app.services.workflow_engine import WorkflowEngine


class FinPilotGraph:
    def __init__(self, repo: FinPilotRepository, llm: LLMService, workflow_engine: WorkflowEngine) -> None:
        self.repo = repo
        self.llm = llm
        self.workflow_engine = workflow_engine
        self.graph = self._build()

    def _build(self):
        builder = StateGraph(dict)

        builder.add_node("router", router_node)
        builder.add_node("financial_close", make_financial_close_node(self.repo, self.llm, self.workflow_engine))
        builder.add_node("revenue_recognition", make_revenue_node(self.repo, self.llm, self.workflow_engine))
        builder.add_node("poc_accounting", make_poc_node(self.repo, self.llm, self.workflow_engine))
        builder.add_node("capital_allocation", make_capital_node(self.repo, self.llm, self.workflow_engine))

        builder.set_entry_point("router")

        def route_selector(state: dict):
            return state.get("route", "financial_close")

        builder.add_conditional_edges(
            "router",
            route_selector,
            {
                "financial_close": "financial_close",
                "revenue_recognition": "revenue_recognition",
                "poc_accounting": "poc_accounting",
                "capital_allocation": "capital_allocation",
            },
        )

        builder.add_edge("financial_close", END)
        builder.add_edge("revenue_recognition", END)
        builder.add_edge("poc_accounting", END)
        builder.add_edge("capital_allocation", END)

        return builder.compile()

    def invoke(self, payload: dict):
        return self.graph.invoke(payload)