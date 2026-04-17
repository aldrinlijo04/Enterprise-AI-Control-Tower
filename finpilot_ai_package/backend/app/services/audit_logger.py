from __future__ import annotations

import json
from datetime import datetime, UTC
from pathlib import Path
from typing import Any

from app.core.config import settings


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def log_audit(entry: dict[str, Any]) -> dict[str, Any]:
    log_path = settings.audit_log_path
    _ensure_parent(log_path)

    payload = {
        "timestamp": datetime.now(UTC).isoformat(),
        **entry,
    }

    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload) + "\n")

    return payload


def read_audit_events(limit: int = 50) -> list[dict[str, Any]]:
    log_path = settings.audit_log_path
    if not log_path.exists():
        return []

    with log_path.open("r", encoding="utf-8") as f:
        lines = f.readlines()[-limit:]

    events: list[dict[str, Any]] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(events))