from __future__ import annotations

from typing import Any


class ApprovalService:
    def __init__(self, thresholds: list[dict[str, Any]]) -> None:
        self.threshold_map = {t["threshold_name"]: t["threshold_value"] for t in thresholds}

    def classify(
        self,
        amount_usd: float,
        confidence_score: float,
        risk_level: str,
        module: str,
        reference: str,
    ) -> dict[str, Any]:
        auto_amount = float(self.threshold_map.get("AUTO_JOURNAL_POST", 50000))
        controller_review = float(self.threshold_map.get("CONTROLLER_REVIEW", 250000))
        auto_conf = float(self.threshold_map.get("AUTO_APPROVE_CONFIDENCE", 0.95))
        review_conf = float(self.threshold_map.get("REVIEW_REQUIRED_CONFIDENCE", 0.75))

        if confidence_score >= auto_conf and amount_usd <= auto_amount and risk_level == "low":
            mode = "AUTO_APPROVE"
        elif confidence_score >= review_conf and amount_usd <= controller_review and risk_level in {"low", "medium"}:
            mode = "REVIEW_REQUIRED"
        else:
            mode = "ESCALATE"

        return {
            "module": module,
            "reference": reference,
            "recommended_mode": mode,
            "confidence_score": round(confidence_score, 2),
            "risk_level": risk_level,
            "amount_usd": round(amount_usd, 2),
            "reason": self._reason(mode, amount_usd, confidence_score, risk_level),
        }

    @staticmethod
    def _reason(mode: str, amount_usd: float, confidence_score: float, risk_level: str) -> str:
        if mode == "AUTO_APPROVE":
            return f"High confidence ({confidence_score:.2f}), low risk, and amount {amount_usd:,.2f} within auto-post threshold."
        if mode == "REVIEW_REQUIRED":
            return f"Moderate review needed because confidence is {confidence_score:.2f} or amount/risk requires controller check."
        return f"Escalated due to risk level '{risk_level}', low confidence ({confidence_score:.2f}), or high value amount {amount_usd:,.2f}."
