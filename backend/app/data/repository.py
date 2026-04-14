from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings


class FinPilotRepository:
    def __init__(self, data_path: Path) -> None:
        self.data_path = data_path
        self.data = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.data_path.exists():
            raise FileNotFoundError(f"Seed data file not found: {self.data_path}")
        with self.data_path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def reload(self) -> None:
        self.data = self._load()

    @property
    def metadata(self) -> dict[str, Any]:
        return self.data.get("metadata", {})

    def get_dashboard_counts(self) -> dict[str, int]:
        fabric = self.data["shared_finance_data_fabric"]
        kb = self.data["shared_knowledge_base"]
        audit = self.data["shared_audit_layer"]
        hil = self.data["shared_human_in_the_loop_layer"]
        return {
            "transactions": len(fabric["transactions"]),
            "deliveries": len(fabric["deliveries"]),
            "procurement_events": len(fabric["procurement_events"]),
            "email_notices": len(fabric["email_notices"]),
            "market_signals": len(fabric["market_signals"]),
            "project_tracker_events": len(fabric["project_tracker_events"]),
            "policies": len(kb["accounting_policies"]),
            "audit_events": len(audit["audit_events"]),
            "approval_queue": len(hil["approval_queue"]),
        }

    def get_open_exception_summary(self) -> dict[str, int]:
        queue = self.data["shared_human_in_the_loop_layer"]["approval_queue"]
        summary: dict[str, int] = {"pending": 0, "in_review": 0, "approved": 0, "rejected": 0}
        for item in queue:
            status = item["status"]
            summary[status] = summary.get(status, 0) + 1
        return summary

    def get_transactions(self, entity: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_finance_data_fabric"]["transactions"]
        if entity:
            return [t for t in items if t["entity"] == entity]
        return items

    def get_deliveries(self, contract_id: str | None = None, customer: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_finance_data_fabric"]["deliveries"]
        if contract_id:
            items = [d for d in items if d["contract_id"] == contract_id]
        if customer:
            items = [d for d in items if d["customer"].lower() == customer.lower()]
        return items

    def get_procurement_events(self, project_id: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_finance_data_fabric"]["procurement_events"]
        if project_id:
            return [p for p in items if p["project_id"] == project_id]
        return items

    def get_project_tracker_events(self, project_id: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_finance_data_fabric"]["project_tracker_events"]
        if project_id:
            return [e for e in items if e["project_id"] == project_id]
        return items

    def get_market_signals(self, linked_project: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_finance_data_fabric"]["market_signals"]
        if linked_project:
            return [m for m in items if m["linked_project"] == linked_project]
        return items

    def get_email_notices(self, reference: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_finance_data_fabric"]["email_notices"]
        if reference:
            return [e for e in items if e["related_reference"] == reference]
        return items

    def get_contract_templates(self) -> list[dict[str, Any]]:
        return self.data["shared_knowledge_base"]["contract_templates"]

    def get_project_assumptions(self, project_id: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_knowledge_base"]["project_assumptions"]
        if project_id:
            return [a for a in items if a["project_id"] == project_id]
        return items

    def get_thresholds(self) -> list[dict[str, Any]]:
        return self.data["shared_knowledge_base"]["approval_thresholds"]

    def get_historical_adjustments(self, reference: str | None = None) -> list[dict[str, Any]]:
        items = self.data["shared_knowledge_base"]["historical_adjustments"]
        if reference:
            return [a for a in items if a["reference"] == reference]
        return items

    def get_accounting_policies(self) -> list[dict[str, Any]]:
        return self.data["shared_knowledge_base"]["accounting_policies"]

    def get_audit_events(self) -> list[dict[str, Any]]:
        return self.data["shared_audit_layer"]["audit_events"]

    def get_approval_queue(self) -> list[dict[str, Any]]:
        return self.data["shared_human_in_the_loop_layer"]["approval_queue"]

    def knowledge_search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        q = query.lower().strip()
        corpus: list[dict[str, Any]] = []

        for section_name, items in (
            ("policies", self.get_accounting_policies()),
            ("contract_templates", self.get_contract_templates()),
            ("thresholds", self.get_thresholds()),
            ("project_assumptions", self.get_project_assumptions()),
            ("historical_adjustments", self.get_historical_adjustments()),
        ):
            for item in items:
                corpus.append({"section": section_name, "item": item})

        scored: list[tuple[int, dict[str, Any]]] = []
        for entry in corpus:
            text = json.dumps(entry["item"]).lower()
            score = text.count(q) if q else 0
            if score > 0:
                scored.append((score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [entry for _, entry in scored[:limit]]


@lru_cache(maxsize=1)
def get_repository() -> FinPilotRepository:
    return FinPilotRepository(settings.data_path)
