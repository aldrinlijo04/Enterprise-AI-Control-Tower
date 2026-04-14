from __future__ import annotations

from typing import Protocol

from openai import OpenAI

from app.core.config import settings


class LLMService(Protocol):
    def summarize(
        self,
        *,
        module: str,
        user_query: str,
        user_role: str,
        result: dict,
        evidence: list[str] | None = None,
    ) -> str: ...


def build_prompt(
    *,
    module: str,
    user_query: str,
    user_role: str,
    result: dict,
    evidence: list[str] | None = None,
) -> str:
    evidence_text = "\n".join(f"- {item}" for item in (evidence or [])) or "- No extra evidence provided"

    return f"""
You are FinPilot AI, a polished enterprise finance copilot speaking in a live event demo.

Your task:
Answer the user's question naturally using the data provided.
Do not sound robotic.
Do not mention JSON, payloads, field names, or internal system structure.
Do not simply restate all data.
Answer like a smart finance assistant speaking to a business user.

Context:
- Module: {module}
- User role: {user_role}

User question:
{user_query}

Computed result:
{result}

Supporting evidence:
{evidence_text}

Instructions:
- Answer the exact question the user asked
- Use only the provided result and evidence
- Be concise but useful
- If the user asks "why", explain drivers
- If the user asks "what next", focus on next actions
- If the user asks for a decision, give a recommendation
- If the user asks for risks, focus on risks and exceptions
- If the user asks for a summary, give an executive summary
- If something is uncertain, say so clearly
- End with a practical next step when appropriate
""".strip()


class MockLLMService:
    def summarize(
        self,
        *,
        module: str,
        user_query: str,
        user_role: str,
        result: dict,
        evidence: list[str] | None = None,
    ) -> str:
        # fallback if no real LLM is configured
        headline = result.get("headline") or result.get("summary") or "Analysis completed."
        recommendation = result.get("recommendation") or "Review the latest output and confirm the next step."
        question = user_query.strip()

        return (
            f"You asked: {question}. "
            f"{headline} "
            f"{recommendation}"
        ).strip()


class OpenAIResponsesLLMService:
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model

    def summarize(
        self,
        *,
        module: str,
        user_query: str,
        user_role: str,
        result: dict,
        evidence: list[str] | None = None,
    ) -> str:
        prompt = build_prompt(
            module=module,
            user_query=user_query,
            user_role=user_role,
            result=result,
            evidence=evidence,
        )
        response = self.client.responses.create(
            model=self.model,
            input=prompt,
        )
        return response.output_text.strip()


class GroqResponsesLLMService:
    def __init__(self) -> None:
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is required when LLM_PROVIDER=groq")
        self.client = OpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
        )
        self.model = settings.groq_model

    def summarize(
        self,
        *,
        module: str,
        user_query: str,
        user_role: str,
        result: dict,
        evidence: list[str] | None = None,
    ) -> str:
        prompt = build_prompt(
            module=module,
            user_query=user_query,
            user_role=user_role,
            result=result,
            evidence=evidence,
        )
        response = self.client.responses.create(
            model=self.model,
            input=prompt,
        )
        return response.output_text.strip()


def get_llm_service() -> LLMService:
    provider = settings.llm_provider.lower()

    if provider == "openai" and settings.openai_api_key:
        return OpenAIResponsesLLMService()

    if provider == "groq" and settings.groq_api_key:
        return GroqResponsesLLMService()

    return MockLLMService()