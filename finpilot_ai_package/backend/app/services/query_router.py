from __future__ import annotations

from typing import Literal


QueryIntent = Literal["dataset_lookup", "module_analysis", "portfolio_general"]


def classify_query(query: str) -> QueryIntent:
    q = query.lower().strip()

    lookup_patterns = [
        "how many",
        "list",
        "which projects",
        "which countries",
        "is prj",
        "do we have",
        "what projects",
        "show projects",
        "show countries",
        "only project",
        "only one project",
        "how much data",
        "how many contracts",
        "how many issues",
        "how many active projects",
        "what regions",
        "which region",
        "portfolio count",
    ]

    for pattern in lookup_patterns:
        if pattern in q:
            return "dataset_lookup"

    module_keywords = {
        "financial_close": ["close", "journal", "recon", "sign-off", "posting", "accrual"],
        "revenue_recognition": ["contract", "revenue", "shortfall", "take-or-pay", "billable", "recognition"],
        "poc_accounting": ["estimate", "poc", "cost to complete", "project risk", "overrun", "forecast variance"],
        "capital_allocation": ["irr", "npv", "capex", "investment", "approve this investment", "allocation"],
    }

    if any(keyword in q for keywords in module_keywords.values() for keyword in keywords):
        return "module_analysis"

    return "portfolio_general"