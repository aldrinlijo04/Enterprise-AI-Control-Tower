from __future__ import annotations

from functools import lru_cache

from app.agents.orchestrator import FinPilotGraph
from app.core.config import settings
from app.data.repository import get_repository
from app.services.approval_service import ApprovalService
from app.services.audit_service import AuditService
from app.services.knowledge_service import KnowledgeService
from app.services.llm_service import get_llm_service


class FinPilotRuntime:
    def __init__(self) -> None:
        self.repo = get_repository()
        self.knowledge = KnowledgeService(self.repo)
        self.approval_service = ApprovalService(self.repo.get_thresholds())
        self.audit_service = AuditService(settings.audit_log_path)
        self.llm = get_llm_service()
        self.graph = FinPilotGraph(
            repo=self.repo,
            llm=self.llm,
            approval_service=self.approval_service,
            audit_service=self.audit_service,
        )

    def dashboard_summary(self) -> dict:
        return {
            "metadata": self.repo.metadata,
            "counts": self.repo.get_dashboard_counts(),
            "open_exception_summary": self.repo.get_open_exception_summary(),
            "latest_runtime_events": self.audit_service.read_recent(limit=10),
        }


@lru_cache(maxsize=1)
def get_runtime() -> FinPilotRuntime:
    return FinPilotRuntime()
