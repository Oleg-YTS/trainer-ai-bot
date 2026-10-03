import json
import re
from typing import Any

from app.ai.client import AIClient
from app.ai.prompt import build_system_prompt, build_user_prompt
from app.ai.schemas import Classification, GeneratedAnswer
from app.database.models import KnowledgeItem, Message


def parse_json_safely(raw: str) -> dict[str, Any]:
    if not raw or not raw.strip():
        return {}
    clean = raw.strip()
    # Remove markdown code fences if present (```json ... ``` or ``` ... ```)
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    clean = clean.strip()
    try:
        data = json.loads(clean)
        if isinstance(data, dict):
            return data
    except Exception:
        # Fallback: try finding outermost { ... }
        match = re.search(r"\{.*\}", clean, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
    return {}


class AIOrchestrator:
    def __init__(self) -> None:
        self.ai = AIClient()

    @property
    def is_configured(self) -> bool:
        return self.ai.is_configured

    async def classify(self, question: str) -> Classification:
        raw = await self.ai.text(
            "Classify the fitness client request. Return JSON only with keys: category, intent, needs_trainer, reason. "
            "Do not diagnose; health/symptom cases require trainer review.",
            "Allowed categories: nutrition, training, recovery, weight_loss, muscle_gain, other. "
            f"Question: {question}",
        )
        parsed = parse_json_safely(raw)
        return Classification.model_validate(parsed)

    async def answer(self, question: str, client_profile: dict[str, Any],
                     knowledge_items: list[KnowledgeItem], history: list[Message]) -> GeneratedAnswer:
        system = build_system_prompt(client_profile)
        user = build_user_prompt(question, client_profile, knowledge_items, history)
        raw = await self.ai.text(system, user)
        parsed = parse_json_safely(raw)
        if not parsed.get("answer") and raw.strip():
            # If model returned pure text instead of JSON schema
            parsed["answer"] = raw.strip()
        return GeneratedAnswer.model_validate(parsed)

