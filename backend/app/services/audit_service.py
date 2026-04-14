from __future__ import annotations

import json
from datetime import datetime, UTC
from pathlib import Path
from typing import Any


class AuditService:
    def __init__(self, log_path: Path) -> None:
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def write_event(self, event: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "runtime_audit_id": f"RT-{int(datetime.now(UTC).timestamp() * 1000)}",
            "timestamp": datetime.now(UTC).isoformat(),
            **event,
        }
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
        return payload

    def read_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        if not self.log_path.exists():
            return []
        lines = self.log_path.read_text(encoding="utf-8").strip().splitlines()
        if not lines or lines == [""]:
            return []
        records = [json.loads(line) for line in lines[-limit:]]
        records.reverse()
        return records
