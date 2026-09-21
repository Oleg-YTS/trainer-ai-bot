import json

from app.ai.client import AIClient
from app.ai.schemas import Classification, GeneratedAnswer


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

    async def answer(self, question: str, classification: Classification,
                     client_context: str, knowledge_context: str) -> GeneratedAnswer:
        system = (
            "You are an AI assistant acting as a proxy for a fitness trainer. "
            "Use only supplied trainer knowledge and explicit client context. "
            "Never invent trainer decisions. Escalate when evidence is insufficient. "
            "Return JSON only."
        )
        user = (
            f"Category: {classification.category}\nIntent: {classification.intent}\n\n"
            f"Client context:\n{client_context}\n\n"
            f"Approved trainer knowledge:\n{knowledge_context}\n\n"
            f"Question:\n{question}"
        )
        raw = await self.ai.text(system, user)
        return GeneratedAnswer.model_validate(json.loads(raw))
