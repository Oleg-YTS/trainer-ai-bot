import json
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.service import AnswerUnavailable, build_grounded_answer
from app.bot.router import AI_UNAVAILABLE_TEXT, get_orchestrator
from app.clients.messages import (
    ASSISTANT_ROLE,
    USER_ROLE,
    get_history,
    record_message,
)
from app.clients.service import read_profile, update_profile
from app.config.settings import get_settings
from app.database.models import Client, Escalation, KnowledgeItem, Message
from app.database.session import get_session_factory
from app.knowledge.service import CATEGORIES, PUBLISHED_STATUS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["web-client"])

CATEGORY_METADATA: dict[str, dict[str, str]] = {
    "training": {
        "name": "Тренировочный процесс",
        "description": "Силовой тренинг, техника упражнений и прогрессия",
    },
    "nutrition": {
        "name": "Питание и диетология",
        "description": "Баланс БЖУ, калорийность рациона и нутриенты",
    },
    "recovery": {
        "name": "Восстановление и сон",
        "description": "Гигиена сна, регенерация и снятие мышечного напряжения",
    },
    "weight_loss": {
        "name": "Снижение жировой массы",
        "description": "Грамотный дефицит, сохранение мышц и контроль аппетита",
    },
    "muscle_gain": {
        "name": "Набор мышечной массы",
        "description": "Гипертрофия мышц, профицит и прогрессия весов",
    },
    "other": {
        "name": "Общие вопросы методики",
        "description": "Рекомендации тренера и методические указания",
    },
}


class ChatRequest(BaseModel):
    client_id: int | None = Field(default=1)
    message_text: str | None = None
    message: str | None = None


class ProfileUpdateRequest(BaseModel):
    client_id: int | None = Field(default=1)
    name: str | None = None
    gender: str | None = None
    profile: dict[str, Any] | None = None


async def get_db_session():
    async with get_session_factory()() as session:
        yield session


@router.get("/categories")
async def get_categories(session: AsyncSession = Depends(get_db_session)):
    """
    Returns knowledge base categories with published article counts from PostgreSQL.
    """
    try:
        # Group articles count by category
        count_stmt = (
            select(KnowledgeItem.category, func.count(KnowledgeItem.id))
            .where(KnowledgeItem.status.in_(["published", "approved"]))
            .group_by(KnowledgeItem.category)
        )
        count_result = await session.execute(count_stmt)
        counts = dict(count_result.all())
    except SQLAlchemyError as exc:
        logger.warning("Failed to count articles by category: %s", exc)
        counts = {}

    categories_list = []
    for cat_id in CATEGORIES:
        meta = CATEGORY_METADATA.get(cat_id, {"name": cat_id.capitalize(), "description": ""})
        categories_list.append({
            "id": cat_id,
            "name": meta["name"],
            "description": meta["description"],
            "parent_id": None,
            "article_count": counts.get(cat_id, 0),
        })

    # Sort categories to keep predictable order
    ordered_ids = ["training", "nutrition", "recovery", "weight_loss", "muscle_gain", "other"]
    categories_list.sort(key=lambda c: ordered_ids.index(c["id"]) if c["id"] in ordered_ids else 99)
    return categories_list


@router.get("/knowledge")
async def get_knowledge(
    category: str | None = Query(default=None),
    status: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Returns approved/published knowledge base items.
    """
    try:
        statement = select(KnowledgeItem)
        if status:
            statement = statement.where(KnowledgeItem.status == status)
        else:
            # Default to public articles for clients
            statement = statement.where(KnowledgeItem.status.in_(["published", "approved"]))

        if category:
            statement = statement.where(KnowledgeItem.category == category)

        statement = statement.order_by(KnowledgeItem.id.desc()).limit(100)
        result = await session.execute(statement)
        items = result.scalars().all()

        return [
            {
                "id": item.id,
                "trainer_id": item.trainer_id,
                "category": item.category,
                "category_id": item.category,  # Frontend compatibility alias
                "title": item.title,
                "content": item.content,
                "status": item.status,
                "author_is_trainer": True,
                "created_at": item.created_at.isoformat() if item.created_at else "",
            }
            for item in items
        ]
    except SQLAlchemyError as exc:
        logger.error("Failed to load knowledge items: %s", exc)
        return []


@router.get("/knowledge/{item_id}")
async def get_knowledge_item(item_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Returns a single knowledge item by ID.
    """
    try:
        item = await session.get(KnowledgeItem, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Article not found")
        return {
            "id": item.id,
            "trainer_id": item.trainer_id,
            "category": item.category,
            "category_id": item.category,
            "title": item.title,
            "content": item.content,
            "status": item.status,
            "author_is_trainer": True,
            "created_at": item.created_at.isoformat() if item.created_at else "",
        }
    except SQLAlchemyError as exc:
        logger.error("Failed to fetch knowledge item %s: %s", item_id, exc)
        raise HTTPException(status_code=500, detail="Database error")


@router.post("/chat")
async def chat_endpoint(payload: ChatRequest):
    """
    Processes chat message from web app using grounded AI orchestration.
    Records conversation into PostgreSQL messages table.
    """
    text = (payload.message_text or payload.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text is required")

    client_id = payload.client_id or 1

    # 1. Record incoming user message
    try:
        user_msg = await record_message(client_id, USER_ROLE, text)
    except (SQLAlchemyError, RuntimeError) as exc:
        logger.warning("Saving user message failed: %s", exc)
        user_msg = None

    # 2. Generate grounded AI response
    orchestrator = get_orchestrator()
    if not orchestrator.is_configured:
        answer_text = AI_UNAVAILABLE_TEXT
    else:
        try:
            answer_text = await build_grounded_answer(orchestrator, client_id, text)
        except AnswerUnavailable as exc:
            logger.warning("Grounded answer unavailable: %s", exc)
            answer_text = AI_UNAVAILABLE_TEXT
        except Exception as exc:
            logger.error("Unexpected error in build_grounded_answer: %s", exc)
            answer_text = AI_UNAVAILABLE_TEXT

    # 3. Record assistant answer
    try:
        asst_msg = await record_message(client_id, ASSISTANT_ROLE, answer_text)
    except (SQLAlchemyError, RuntimeError) as exc:
        logger.warning("Saving assistant message failed: %s", exc)
        asst_msg = None

    return {
        "text": answer_text,
        "assistant_message": {
            "id": asst_msg.id if asst_msg else 0,
            "client_id": client_id,
            "role": "assistant",
            "text": answer_text,
            "created_at": asst_msg.created_at.isoformat() if asst_msg and asst_msg.created_at else "",
        },
        "user_message": {
            "id": user_msg.id if user_msg else 0,
            "client_id": client_id,
            "role": "user",
            "text": text,
            "created_at": user_msg.created_at.isoformat() if user_msg and user_msg.created_at else "",
        },
    }


@router.get("/client/messages")
async def get_client_messages(
    client_id: int = Query(default=1),
    limit: int = Query(default=20),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Returns message history for a client from PostgreSQL.
    """
    try:
        messages = await get_history(session, client_id, limit=limit)
        return [
            {
                "id": m.id,
                "client_id": m.client_id,
                "role": m.role,
                "text": m.text,
                "created_at": m.created_at.isoformat() if m.created_at else "",
            }
            for m in messages
        ]
    except SQLAlchemyError as exc:
        logger.error("Failed to load message history: %s", exc)
        return []


@router.get("/client/profile")
async def get_client_profile_endpoint(
    client_id: int = Query(default=1),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Retrieves client profile from PostgreSQL.
    """
    try:
        profile = await read_profile(client_id)
        client = await session.get(Client, client_id)
        return {
            "client_id": client_id,
            "name": client.name if client else profile.get("name", "Клиент"),
            "profile": profile,
        }
    except Exception as exc:
        logger.warning("Failed to fetch client profile: %s", exc)
        return {"client_id": client_id, "name": "Клиент", "profile": {}}


@router.put("/client/profile")
@router.post("/client/profile")
async def update_client_profile_endpoint(payload: ProfileUpdateRequest):
    """
    Updates client profile in PostgreSQL.
    """
    client_id = payload.client_id or 1
    new_data: dict[str, Any] = {}
    if payload.profile:
        new_data.update(payload.profile)
    if payload.name:
        new_data["name"] = payload.name
    if payload.gender:
        new_data["gender"] = payload.gender

    try:
        updated = await update_profile(client_id, new_data)
        return {"ok": True, "client_id": client_id, "profile": updated}
    except Exception as exc:
        logger.error("Failed to update profile: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/clients/{client_id}")
async def get_client_by_id(client_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Returns client profile and recent messages.
    """
    try:
        client = await session.get(Client, client_id)
        messages = await get_history(session, client_id, limit=30)
        profile = await read_profile(client_id) if client else {}
        return {
            "id": client_id,
            "name": client.name if client else "Клиент",
            "profile": profile,
            "messages": [
                {
                    "id": m.id,
                    "client_id": m.client_id,
                    "role": m.role,
                    "text": m.text,
                    "created_at": m.created_at.isoformat() if m.created_at else "",
                }
                for m in messages
            ],
        }
    except Exception as exc:
        logger.warning("Failed to fetch client %s: %s", client_id, exc)
        return {"id": client_id, "name": "Клиент", "profile": {}, "messages": []}


@router.get("/stats")
async def get_stats(session: AsyncSession = Depends(get_db_session)):
    """
    Returns basic dashboard metrics for trainer.
    """
    try:
        kb_count = await session.scalar(
            select(func.count(KnowledgeItem.id)).where(KnowledgeItem.status.in_(["published", "approved"]))
        ) or 0
        clients_count = await session.scalar(select(func.count(Client.id))) or 0
        messages_count = await session.scalar(select(func.count(Message.id))) or 0
        open_escalations = await session.scalar(
            select(func.count(Escalation.id)).where(Escalation.status == "open")
        ) or 0

        return {
            "knowledge_count": kb_count,
            "clients_count": clients_count,
            "messages_count": messages_count,
            "open_escalations": open_escalations,
        }
    except Exception as exc:
        logger.warning("Stats retrieval error: %s", exc)
        return {
            "knowledge_count": 0,
            "clients_count": 0,
            "messages_count": 0,
            "open_escalations": 0,
        }
