from __future__ import annotations

from typing import Any

from app.data.repository import FinPilotRepository


class KnowledgeService:
    def __init__(self, repo: FinPilotRepository) -> None:
        self.repo = repo

    def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        return self.repo.knowledge_search(query, limit=limit)

    def get_policy_summary(self, query: str) -> list[dict[str, Any]]:
        return self.search(query, limit=5)
