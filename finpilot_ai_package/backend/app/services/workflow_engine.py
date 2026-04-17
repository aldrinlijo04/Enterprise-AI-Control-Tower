from __future__ import annotations

from typing import Any

from app.services.approval_engine import evaluate_decision
from app.services.approval_queue_service import ApprovalQueueService
from app.services.audit_logger import log_audit
from app.tools.finance_tools import threshold_check


class WorkflowEngine:
    def __init__(self) -> None:
        self.queue = ApprovalQueueService()

    def execute(self, *, module: str, reference: str, amount_usd: float, confidence: float, risk_level: str, result: dict[str, Any]) -> dict[str, Any]:
        decision = evaluate_decision(confidence, amount_usd, risk_level)
        threshold = threshold_check(amount_usd)

        if decision == "AUTO_APPROVE":
            next_action = "POST_JOURNAL" if module != "revenue_recognition" else "POST_REVENUE"
            approval_item = None
        elif decision == "REVIEW_REQUIRED":
            next_action = "SEND_TO_CONTROLLER"
            approval_item = self.queue.create_item({
                "module": module,
                "reference": reference,
                "recommended_owner": "Controller",
                "recommended_action": next_action,
                "amount_usd": amount_usd,
                "confidence_score": confidence,
                "risk_level": risk_level,
            })
        else:
            next_action = "ESCALATE_TO_CFO"
            approval_item = self.queue.create_item({
                "module": module,
                "reference": reference,
                "recommended_owner": "CFO",
                "recommended_action": next_action,
                "amount_usd": amount_usd,
                "confidence_score": confidence,
                "risk_level": risk_level,
            })

        timeline = [
            {"step": "analysis_completed", "status": "done"},
            {"step": "rule_check_completed", "status": "done"},
            {"step": decision.lower(), "status": "done"},
            {"step": next_action.lower(), "status": "pending" if approval_item else "done"},
        ]

        audit = log_audit({
            "module": module,
            "reference": reference,
            "source_data_used": result.get("source_data_used", []),
            "rule_used": result.get("rule_used"),
            "confidence_score": confidence,
            "before_after_change": result.get("before_after_change"),
            "decision": decision,
            "next_action": next_action,
            "threshold": threshold,
            "approval_id": approval_item.get("approval_id") if approval_item else None,
        })

        return {
            "decision": decision,
            "threshold": threshold,
            "next_action": next_action,
            "approval_item": approval_item,
            "timeline": timeline,
            "audit_entry": audit,
        }