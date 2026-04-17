
from __future__ import annotations

from functools import lru_cache

from app.agents.orchestrator import FinPilotGraph
from app.data.repository import get_repository
from app.services.approval_queue_service import ApprovalQueueService
from app.services.audit_logger import read_audit_events
from app.services.llm_service import get_llm_service
from app.services.workflow_engine import WorkflowEngine


class FinPilotRuntime:
    def __init__(self) -> None:
        self.repo = get_repository()
        self.llm = get_llm_service()
        self.workflow_engine = WorkflowEngine()
        self.queue = ApprovalQueueService()
        self.graph = FinPilotGraph(self.repo, self.llm, self.workflow_engine)

    def dashboard_summary(self, project_ids: list[str] | None = None) -> dict:
        return {
            "metadata": self.repo.metadata,
            "counts": self.repo.summary_counts(project_ids=project_ids),
            "pending_approvals": len(self.queue.list_items(status="pending")),
            "top_issue_actions": self.repo.get_issue_action_board(limit=10, project_ids=project_ids),
            "recent_workflow_events": read_audit_events(limit=10),
            "realtime_activities": self.repo.get_realtime_activities(project_ids=project_ids, limit=8),
            "realtime_messages": self.repo.get_realtime_messages(project_ids=project_ids, limit=8),
        }


@lru_cache(maxsize=1)
def get_runtime() -> FinPilotRuntime:
    return FinPilotRuntime()
