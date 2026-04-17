from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings


class ApprovalQueueService:
    def __init__(self) -> None:
        self.path: Path = settings.approval_queue_path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("[]", encoding="utf-8")

    def _load(self) -> list[dict[str, Any]]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return []

    def _save(self, items: list[dict[str, Any]]) -> None:
        self.path.write_text(json.dumps(items, indent=2), encoding="utf-8")

    def create_item(self, item: dict[str, Any]) -> dict[str, Any]:
        items = self._load()
        item_id = f"APR-{len(items) + 1:04d}"
        payload = {
            "approval_id": item_id,
            "created_at": datetime.now(UTC).isoformat(),
            "status": "pending",
            **item,
        }
        items.append(payload)
        self._save(items)
        return payload

    def list_items(self, status: str | None = None) -> list[dict[str, Any]]:
        items = self._load()
        if status:
            items = [x for x in items if x.get("status") == status]
        return list(reversed(items))

    def act_on_item(
        self,
        approval_id: str,
        action: str,
        actor: str,
        comment: str | None = None,
    ) -> dict[str, Any] | None:
        items = self._load()

        action_map = {
            "approve": "approved",
            "reject": "rejected",
            "escalate": "escalated",
        }

        if action not in action_map:
            return None

        for item in items:
            if item.get("approval_id") == approval_id:
                if item.get("status") != "pending":
                    return item

                item["status"] = action_map[action]
                item["acted_at"] = datetime.now(UTC).isoformat()
                item["acted_by"] = actor
                item["comment"] = comment

                item.setdefault("history", []).append(
                    {
                        "action": action,
                        "actor": actor,
                        "time": item["acted_at"],
                        "comment": comment,
                    }
                )

                self._save(items)

                print(f"[APPROVAL] {approval_id} -> {action.upper()} by {actor}")
                return item

        print(f"[ERROR] Approval {approval_id} not found")
        return None