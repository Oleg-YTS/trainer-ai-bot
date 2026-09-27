import json
from typing import Any

from app.ai.client import AIClient
from app.ai.prompt import build_system_prompt, build_user_prompt
from app.ai.schemas import Classification, GeneratedAnswer
from app.database.models import KnowledgeItem, Message


class AIOrchestrator:
    def __init__(self) -> None:
        self.ai = AIClient()

    @property
    def is_configured(self) -> bool:
        return self.ai.is_configured

    async def classify(self, question: str) -> Classification:
        raw = await self.ai.text(
            "Classify the fitness client request. Return JSON only. "
            "Do not diagnose; health/symptom cases require trainer review.",
            "Allowed categories: nutrition, training, recovery, weight_loss, muscle_gain, other. "
            f"Question: {question}",
        )
        return Classification.model_validate(json.loads(raw))

    async def answer(self, question: str, client_profile: dict[str, Any],
                     knowledge_items: list[KnowledgeItem], history: list[Message]) -> GeneratedAnswer:
        system = build_system_prompt()
        user = build_user_prompt(question, client_profile, knowledge_items, history)
        raw = await self.ai.text(system, user)
        return GeneratedAnswer.model_validate(json.loads(raw))
