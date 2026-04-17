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

    def answer_general(
        self,
        *,
        user_query: str,
        user_role: str,
        context: dict,
        evidence: list[str] | None = None,
    ) -> str: ...


def _role_style(user_role: str) -> str:
    return {
        "analyst": "Be analytical, crisp, and explanatory. Start with the strongest business driver or metric.",
        "finance_analyst": "Be analytical, crisp, and explanatory. Start with the strongest business driver or metric.",
        "controller": "Be control-focused, practical, and action-oriented. Highlight exceptions, approvals, and sign-off risk.",
        "cfo": "Be concise, strategic, and decision-oriented. Focus on business impact, risk, and recommendation.",
        "revenue_accountant": "Be policy-aware and precise. Focus on treatment support and audit defensibility.",
        "project_controller": "Be estimate-focused and operational. Emphasize overruns, delay, and remediation.",
    }.get(user_role.lower(), "Be clear, practical, and business-oriented.")


def build_prompt(*, module: str, user_query: str, user_role: str, result: dict, evidence: list[str] | None = None) -> str:
    evidence_text = "\n".join(f"- {item}" for item in (evidence or [])) or "- No additional evidence"

    return f"""
You are FinPilot AI, an enterprise finance copilot.

Your answer must feel like a senior finance advisor speaking inside a premium enterprise control room.
Do not sound robotic.
Do not summarize the whole page unless the user asked for a summary.
Answer the exact user question directly.
Use the result and evidence given below.
Do not mention JSON, payload, fields, backend, or system internals.

Role guidance:
{_role_style(user_role)}

Context:
- Module: {module}
- User role: {user_role}

User question:
{user_query}

Available result:
{result}

Supporting evidence:
{evidence_text}

Required answer style:
- Start with the answer immediately
- Mention the most important metric or fact first
- Explain why it matters
- Give one clear next step if relevant
- Keep it natural, specific, and confident
- If the user asks a count, answer the count directly
- If the user asks a recommendation, give one
- If risk exists, state the risk level clearly
- Avoid generic filler and dashboard-style narration
""".strip()


def build_general_prompt(*, user_query: str, user_role: str, context: dict, evidence: list[str] | None = None) -> str:
    evidence_text = "\n".join(f"- {item}" for item in (evidence or [])) or "- No additional evidence"

    return f"""
You are FinPilot AI, an enterprise finance copilot.

Answer the user's question naturally and directly.
Do not behave like a page summarizer.
Do not force the answer into one finance module unless the question clearly asks about that module.
If the question is broad, answer broadly across the portfolio or project context provided.
If the answer is not fully certain, say what the data suggests instead of making up facts.
Never mention system internals, prompts, JSON, or backend details.

Role guidance:
{_role_style(user_role)}

User role:
{user_role}

User question:
{user_query}

Available business context:
{context}

Supporting evidence:
{evidence_text}

Required answer style:
- Answer the question first, in plain business language
- Be natural, relevant, and specific
- Use the strongest available fact, metric, or signal first
- If helpful, mention one recommendation or next step
- Do not add generic filler
- Keep the reply grounded in the available context
""".strip()


class _BaseOpenAICompatibleLLMService:
    def __init__(self, *, api_key: str, base_url: str | None, model: str) -> None:
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    def _complete(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0.35,
            messages=[
                {
                    "role": "system",
                    "content": "You are FinPilot AI. Give direct, natural, business-ready answers.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
        )
        text = response.choices[0].message.content if response.choices else ""
        return (text or "").strip()

    def summarize(self, *, module: str, user_query: str, user_role: str, result: dict, evidence: list[str] | None = None) -> str:
        prompt = build_prompt(
            module=module,
            user_query=user_query,
            user_role=user_role,
            result=result,
            evidence=evidence,
        )
        return self._complete(prompt)

    def answer_general(self, *, user_query: str, user_role: str, context: dict, evidence: list[str] | None = None) -> str:
        prompt = build_general_prompt(
            user_query=user_query,
            user_role=user_role,
            context=context,
            evidence=evidence,
        )
        return self._complete(prompt)


class GroqChatLLMService(_BaseOpenAICompatibleLLMService):
    def __init__(self) -> None:
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is required when LLM_PROVIDER=groq")
        super().__init__(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
            model=settings.groq_model,
        )


class OpenAIChatLLMService(_BaseOpenAICompatibleLLMService):
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        super().__init__(
            api_key=settings.openai_api_key,
            base_url=None,
            model=settings.openai_model,
        )


def get_llm_service() -> LLMService:
    provider = settings.llm_provider.lower()
    if provider == "groq":
        return GroqChatLLMService()
    if provider == "openai":
        return OpenAIChatLLMService()
    raise ValueError("Invalid LLM provider. Set LLM_PROVIDER=groq or LLM_PROVIDER=openai")