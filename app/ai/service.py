import logging
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.orchestrator import AIOrchestrator
from app.ai.validation import validate_answer
from app.clients.messages import get_history
from app.clients.profile import get_profile
from app.config.settings import get_settings
from app.database.models import Client, KnowledgeItem, Message
from app.database.session import get_session_factory
from app.knowledge.retrieval import search_knowledge
from app.knowledge.service import CATEGORIES

HISTORY_LIMIT = 10
KNOWLEDGE_LIMIT = 5
AI_FAILURES = (AttributeError, KeyError, RuntimeError, TypeError, ValueError)
logger = logging.getLogger(__name__)


class AnswerUnavailable(RuntimeError):
    """No safe grounded answer could be produced."""


async def load_client_context(
    session: AsyncSession, client_id: int | None
) -> tuple[int, dict[str, Any], list[Message]]:
    if client_id is None:
        return get_settings().trainer_id, {}, []
    client = await session.get(Client, client_id)
    if client is None:
        return get_settings().trainer_id, {}, []
    try:
        profile = await get_profile(session, client_id)
    except (TypeError, ValueError) as exc:
        logger.warning("Client profile is unusable: %s", type(exc).__name__)
        profile = {}
    history = await get_history(session, client_id, limit=HISTORY_LIMIT)
    return client.trainer_id, profile, history


async def resolve_category(orchestrator: AIOrchestrator, question: str) -> str | None:
    try:
        classification = await orchestrator.classify(question)
    except AI_FAILURES as exc:  # a failed classification must not block the answer
        logger.warning("Classification failed: %s", type(exc).__name__)
        return None
    category = getattr(classification, "category", None)
    return category if category in CATEGORIES else None


async def load_knowledge(
    session: AsyncSession, orchestrator: AIOrchestrator, trainer_id: int, question: str
) -> list[KnowledgeItem]:
    try:
        category = await resolve_category(orchestrator, question)
        return await search_knowledge(
            session, trainer_id, question, category=category, limit=KNOWLEDGE_LIMIT
        )
    except (SQLAlchemyError, RuntimeError) as exc:  # no knowledge is better than invented knowledge
        logger.warning("Knowledge retrieval failed: %s", type(exc).__name__)
        return []


async def collect_context(
    orchestrator: AIOrchestrator, client_id: int | None, question: str
) -> tuple[dict[str, Any], list[Message], list[KnowledgeItem]]:
    try:
        async with get_session_factory()() as session:
            trainer_id, profile, history = await load_client_context(session, client_id)
            knowledge = await load_knowledge(session, orchestrator, trainer_id, question)
            return profile, history, knowledge
    except (SQLAlchemyError, RuntimeError) as exc:
        logger.warning("Client context is unavailable: %s", type(exc).__name__)
        return {}, [], []


async def build_grounded_answer(
    orchestrator: AIOrchestrator, client_id: int | None, question: str
) -> str:
    profile, history, knowledge = await collect_context(orchestrator, client_id, question)
    try:
        generated = await orchestrator.answer(question, profile, knowledge, history)
    except AI_FAILURES as exc:  # provider errors and malformed JSON are expected here
        logger.warning("AI answer failed: %s", type(exc).__name__)
        raise AnswerUnavailable("AI answer is unavailable") from None
    try:
        return validate_answer(generated.answer)
    except (AttributeError, TypeError, ValueError) as exc:
        logger.warning("AI answer rejected: %s", type(exc).__name__)
        raise AnswerUnavailable("AI answer was rejected") from None
