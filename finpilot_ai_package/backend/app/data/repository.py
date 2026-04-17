
from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from app.core.config import settings


class FinPilotRepository:
    def __init__(self, data_path) -> None:
        with open(data_path, "r", encoding="utf-8") as f:
            self.data = json.load(f)

        self.metadata = self.data.get("metadata", {})
        self.fabric = self.data.get("shared_finance_data_fabric", {})
        self.kb = self.data.get("shared_knowledge_base", {})
        self.issues = self.data.get("shared_issue_intelligence", {})
        self.analytics = self.data.get("shared_kpi_analytics", {})
        self.scenario_lab = self.data.get("shared_scenario_lab", {})

    def _project_ids_set(self, project_ids: list[str] | None = None) -> set[str] | None:
        if not project_ids:
            return None
        return {x for x in project_ids if x}

    def get_projects(self, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows = self.fabric.get("projects", [])
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_project_ids(self) -> list[str]:
        return [x.get("project_id", "") for x in self.get_projects()]

    def get_project_catalog(self) -> list[dict[str, Any]]:
        return [
            {
                "project_id": p.get("project_id"),
                "project_name": p.get("project_name"),
                "country": p.get("country"),
                "business_unit": p.get("business_unit"),
                "status": p.get("status"),
                "risk_level": p.get("risk_level"),
                "capex_usd": p.get("capex_usd", 0),
            }
            for p in self.get_projects()
        ]

    def get_country_list(self) -> list[str]:
        countries = {x.get("country", "") for x in self.get_projects() if x.get("country")}
        return sorted(countries)

    def get_project_by_id(self, project_id: str) -> dict[str, Any] | None:
        return next((x for x in self.get_projects() if x.get("project_id") == project_id), None)

    def get_transactions(
        self, entity: str | None = None, project_ids: list[str] | None = None
    ) -> list[dict[str, Any]]:
        rows = self.fabric.get("transactions", [])
        if entity:
            rows = [x for x in rows if entity.lower() in str(x.get("entity", "")).lower()]
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_contract_by_id(self, contract_id: str) -> dict[str, Any] | None:
        return next((x for x in self.fabric.get("contracts", []) if x.get("contract_id") == contract_id), None)

    def get_contracts(self, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows = self.fabric.get("contracts", [])
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_deliveries(
        self,
        contract_id: str | None = None,
        customer: str | None = None,
        project_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        rows = self.fabric.get("deliveries", [])
        if contract_id:
            rows = [x for x in rows if x.get("contract_id") == contract_id]
        if customer:
            rows = [x for x in rows if str(x.get("customer", "")).lower() == customer.lower()]
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_procurement_events(self, project_id: str | None = None, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows = self.fabric.get("procurement_events", [])
        if project_id:
            rows = [x for x in rows if x.get("project_id") == project_id]
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_project_tracker_events(self, project_id: str | None = None, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows = self.fabric.get("project_tracker_events", [])
        if project_id:
            rows = [x for x in rows if x.get("project_id") == project_id]
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_project_assumptions(self, project_id: str | None = None, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows = self.fabric.get("project_assumptions", [])
        if project_id:
            rows = [x for x in rows if x.get("project_id") == project_id]
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_market_signals(self, linked_project: str | None = None, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows = self.fabric.get("market_signals", [])
        if linked_project:
            rows = [x for x in rows if x.get("linked_project") == linked_project]
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("linked_project") in project_set]
        return rows

    def get_email_notices(self, reference: str | None = None) -> list[dict[str, Any]]:
        rows = self.fabric.get("email_notices", [])
        if reference:
            rows = [x for x in rows if x.get("reference") == reference]
        return rows

    def get_contract_templates(self) -> list[dict[str, Any]]:
        return self.fabric.get("contract_templates", [])

    def knowledge_search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.kb.get("knowledge_chunks", [])
        q = query.lower().strip()
        if not q:
            return rows[:limit]
        scored: list[tuple[int, dict[str, Any]]] = []
        for row in rows:
            hay = " ".join(str(v) for v in row.values()).lower()
            score = sum(1 for token in q.split() if token in hay)
            if score:
                scored.append((score, row))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in scored[:limit]]

    def get_issues(
        self,
        status: str | None = None,
        module: str | None = None,
        project_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        rows = self.issues.get("issues", [])
        if status:
            rows = [x for x in rows if x.get("status") == status]
        if module:
            rows = [x for x in rows if x.get("module") == module]
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows

    def get_issue_action_board(self, limit: int = 25, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows = self.issues.get("issue_action_board", [])
        project_set = self._project_ids_set(project_ids)
        if project_set:
            rows = [x for x in rows if x.get("project_id") in project_set]
        return rows[:limit]

    def get_kpi_time_series(self, module: str | None = None) -> list[dict[str, Any]]:
        rows = self.analytics.get("kpi_time_series", [])
        if module:
            rows = [x for x in rows if x.get("module") == module]
        return rows

    def get_scenario_simulations(self, project_id: str | None = None) -> list[dict[str, Any]]:
        rows = self.scenario_lab.get("scenario_simulations", [])
        if project_id:
            rows = [x for x in rows if x.get("project_id") == project_id]
        return rows

    def summary_counts(self, project_ids: list[str] | None = None) -> dict[str, int]:
        projects = self.get_projects(project_ids=project_ids)
        contracts = self.get_contracts(project_ids=project_ids)
        issues = self.get_issues(project_ids=project_ids)
        txns = self.get_transactions(project_ids=project_ids)
        return {
            "projects": len(projects),
            "contracts": len(contracts),
            "transactions": len(txns),
            "issues": len(issues),
            "pending_issues": len([x for x in issues if x.get("status") != "closed"]),
        }

    def get_realtime_activities(self, project_ids: list[str] | None = None, limit: int = 10) -> list[dict[str, Any]]:
        projects = {p["project_id"]: p for p in self.get_projects(project_ids=project_ids)}
        issues = self.get_issue_action_board(limit=limit, project_ids=project_ids)
        items: list[dict[str, Any]] = []
        for idx, issue in enumerate(issues[:limit], start=1):
            project = projects.get(issue.get("project_id"), {})
            items.append(
                {
                    "timestamp": f"T-{idx * 4}m",
                    "type": "activity",
                    "module": issue.get("module"),
                    "project_id": issue.get("project_id"),
                    "title": issue.get("recommended_action", "Workflow action generated"),
                    "detail": f"{project.get('project_name', issue.get('project_id', 'Portfolio item'))} · priority P{issue.get('action_priority', '-')}",
                    "severity": issue.get("severity", "medium"),
                }
            )
        return items

    def get_realtime_messages(self, project_ids: list[str] | None = None, limit: int = 10) -> list[dict[str, Any]]:
        projects = self.get_projects(project_ids=project_ids)[:limit]
        messages: list[dict[str, Any]] = []
        for idx, project in enumerate(projects, start=1):
            messages.append(
                {
                    "timestamp": f"T-{idx * 7}m",
                    "sender": project.get("project_controller", "Controller Desk"),
                    "project_id": project.get("project_id"),
                    "message": f"{project.get('project_name')} is {project.get('status')} with {project.get('risk_level')} risk and {project.get('delay_days', 0)} days delay.",
                    "channel": "Ops Stream",
                }
            )
        return messages

    def dataset_lookup_answer(self, query: str, project_ids: list[str] | None = None) -> dict[str, object]:
        q = query.lower().strip()
        projects = self.get_projects(project_ids=project_ids)
        contracts = self.get_contracts(project_ids=project_ids)
        issues = self.get_issues(project_ids=project_ids)
        countries = sorted({x.get("country", "") for x in projects if x.get("country")})
        project_ids_all = [p.get("project_id", "") for p in projects]

        if not projects:
            return {
                "answer": "No projects match the current selection.",
                "projects_count": 0,
                "contracts_count": 0,
                "issues_count": 0,
                "projects": [],
            }

        mentioned = re.findall(r"prj-\d{4}", q)
        if mentioned:
            pid = mentioned[0].upper()
            exists = any(x == pid for x in project_ids_all)
            if exists:
                project = self.get_project_by_id(pid) or {}
                return {
                    "answer": f"{pid} is available. It is {project.get('project_name')} in {project.get('country')} with {project.get('risk_level')} risk.",
                    "project_exists": True,
                    "project_id": pid,
                    "project": project,
                    "projects_count": len(projects),
                }
            return {
                "answer": f"{pid} is not present in the current project selection.",
                "project_exists": False,
                "project_id": pid,
                "projects_count": len(projects),
            }

        if "how many projects" in q or "total projects" in q:
            return {
                "answer": f"There are {len(projects)} projects in scope.",
                "projects_count": len(projects),
                "sample_projects": project_ids_all[:10],
            }

        if "how many contracts" in q:
            return {
                "answer": f"There are {len(contracts)} contracts linked to the current scope.",
                "contracts_count": len(contracts),
            }

        if "how many issues" in q or "how many exceptions" in q:
            return {
                "answer": f"There are {len(issues)} issues in the current scope.",
                "issues_count": len(issues),
            }

        if "which countries" in q or ("countries" in q and "project" in q):
            return {
                "answer": f"The current scope covers {len(countries)} countries: {', '.join(countries[:12])}.",
                "countries_count": len(countries),
                "countries": countries,
            }

        if "which projects" in q or "list projects" in q or "show projects" in q:
            preview = [f"{p.get('project_id')} - {p.get('project_name')}" for p in projects[:12]]
            return {
                "answer": f"The current scope includes {len(projects)} projects. Examples: {'; '.join(preview)}.",
                "projects_count": len(projects),
                "projects": projects[:12],
            }

        high_risk = [p for p in projects if str(p.get("risk_level", "")).lower() == "high"]
        active = [p for p in projects if str(p.get("status", "")).lower() == "active"]
        total_capex = sum(float(p.get("capex_usd", 0)) for p in projects)

        return {
            "answer": (
                f"Current scope has {len(projects)} projects, {len(contracts)} contracts, and {len(issues)} issues. "
                f"{len(high_risk)} projects are high risk, {len(active)} are active, and total capex is {total_capex:,.0f} USD."
            ),
            "projects_count": len(projects),
            "contracts_count": len(contracts),
            "issues_count": len(issues),
            "high_risk_projects": len(high_risk),
            "active_projects": len(active),
            "total_capex_usd": round(total_capex, 2),
        }


@lru_cache(maxsize=1)
def get_repository() -> FinPilotRepository:
    return FinPilotRepository(settings.data_path)
