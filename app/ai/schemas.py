from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["nutrition", "training", "recovery", "weight_loss", "muscle_gain", "other"]

class Classification(BaseModel):
    category: Category
    intent: str
    needs_trainer: bool = False
    reason: str | None = None

class GeneratedAnswer(BaseModel):
    answer: str
    needs_trainer: bool = False
    escalation_reason: str | None = None
    knowledge_ids: list[int] = Field(default_factory=list)
