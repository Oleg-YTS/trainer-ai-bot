import json
import logging
from typing import Any, Optional
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
from app.knowledge.retrieval import search_knowledge
from app.knowledge.service import CATEGORIES, PUBLISHED_STATUS

logger = logging.getLogger(__name__)

def format_iso_utc(dt) -> str:
    if not dt:
        return ""
    iso = dt.isoformat()
    return iso + "Z" if not iso.endswith("Z") and "+" not in iso else iso

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
    age: int | None = None
    height: int | None = None
    weight: int | None = None
    goal: str | None = None
    restrictions: str | None = None
    is_admin: bool | None = None
    is_vip: bool | None = None
    profile: dict[str, Any] | None = None


class VIPToggleRequest(BaseModel):
    client_id: int
    is_vip: bool | None = None
    is_admin: bool | None = None
    role: str | None = None


class VIPUpgradeRequest(BaseModel):
    client_id: int | None = Field(default=1)


class CreateKnowledgeRequest(BaseModel):
    title: str
    content: str
    category: str
    status: str = "approved"


class UpdateKnowledgeRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    status: str | None = None


class CreateClientRequest(BaseModel):
    name: str
    telegram_user_id: int | None = None
    gender: str = "male"


class ResolveClientRequest(BaseModel):
    telegram_user_id: int | None = None
    name: str | None = None
    username: str | None = None


class LLMTestRequest(BaseModel):
    prompt: str | None = None
    question: str | None = None


async def get_db_session():
    async with get_session_factory()() as session:
        yield session


@router.get("/categories")
async def get_categories(session: AsyncSession = Depends(get_db_session)):
    """
    Returns knowledge base categories with published article counts from PostgreSQL.
    """
    try:
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
                "category_id": item.category,
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


@router.post("/knowledge")
async def create_knowledge_item_endpoint(payload: CreateKnowledgeRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Creates a new knowledge article in PostgreSQL.
    """
    cat = payload.category if payload.category in CATEGORIES else "other"
    try:
        item = KnowledgeItem(
            trainer_id=get_settings().trainer_id,
            category=cat,
            title=payload.title,
            content=payload.content,
            status=payload.status if payload.status in ["approved", "published", "draft"] else "approved"
        )
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return {
            "ok": True,
            "item": {
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
        }
    except SQLAlchemyError as exc:
        logger.error("Failed to create knowledge item: %s", exc)
        raise HTTPException(status_code=400, detail="Could not create knowledge article")


@router.put("/knowledge/{item_id}")
async def update_knowledge_item_endpoint(item_id: int, payload: UpdateKnowledgeRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Updates an existing knowledge article in PostgreSQL.
    """
    try:
        item = await session.get(KnowledgeItem, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Article not found")

        if payload.title is not None:
            item.title = payload.title
        if payload.content is not None:
            item.content = payload.content
        if payload.category is not None and payload.category in CATEGORIES:
            item.category = payload.category
        if payload.status is not None and payload.status in ["approved", "published", "draft", "archived"]:
            item.status = payload.status

        await session.commit()
        await session.refresh(item)
        return {
            "ok": True,
            "item": {
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
        }
    except SQLAlchemyError as exc:
        logger.error("Failed to update knowledge item %s: %s", item_id, exc)
        raise HTTPException(status_code=400, detail="Could not update knowledge article")


@router.delete("/knowledge/{item_id}")
async def delete_knowledge_item_endpoint(item_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Archives or deletes a knowledge article in PostgreSQL.
    """
    try:
        item = await session.get(KnowledgeItem, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Article not found")

        await session.delete(item)
        await session.commit()
        return {"ok": True, "deleted_id": item_id}
    except SQLAlchemyError as exc:
        logger.error("Failed to delete knowledge item %s: %s", item_id, exc)
        raise HTTPException(status_code=400, detail="Could not delete knowledge article")


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

    try:
        user_msg = await record_message(client_id, USER_ROLE, text)
    except (SQLAlchemyError, RuntimeError) as exc:
        logger.warning("Saving user message failed: %s", exc)
        user_msg = None

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
            "created_at": format_iso_utc(asst_msg.created_at) if asst_msg else "",
        },
        "user_message": {
            "id": user_msg.id if user_msg else 0,
            "client_id": client_id,
            "role": "user",
            "text": text,
            "created_at": format_iso_utc(user_msg.created_at) if user_msg else "",
        },
    }


@router.get("/clients")
async def get_clients_list(session: AsyncSession = Depends(get_db_session)):
    """
    Returns list of all clients in PostgreSQL with is_vip and is_admin.
    """
    try:
        statement = select(Client).order_by(Client.id.desc())
        result = await session.execute(statement)
        clients = result.scalars().all()

        settings = get_settings()
        client_list = []
        for c in clients:
            try:
                prof = await read_profile(c.id) if c else {}
            except Exception:
                prof = {}
            msg_count_stmt = select(func.count(Message.id)).where(Message.client_id == c.id)
            msg_count = await session.scalar(msg_count_stmt) or 0

            is_admin_val = settings.is_admin_telegram_id(c.telegram_user_id) or bool(prof.get("is_admin", False))
            is_vip_val = is_admin_val or bool(prof.get("is_vip", False))

            client_list.append({
                "id": c.id,
                "trainer_id": c.trainer_id,
                "name": c.name,
                "telegram_user_id": c.telegram_user_id,
                "telegram_username": prof.get("telegram_username") or prof.get("username"),
                "created_at": c.created_at.isoformat() if c.created_at else "",
                "messages_count": msg_count,
                "profile": prof,
                "is_vip": is_vip_val,
                "is_admin": is_admin_val,
            })
        return client_list
    except SQLAlchemyError as exc:
        logger.error("Failed to list clients: %s", exc)
        return []


@router.post("/client/resolve")
@router.get("/client/resolve")
async def resolve_client_endpoint(
    telegram_user_id: int | None = Query(default=None),
    name: str | None = Query(default=None),
    username: str | None = Query(default=None),
    payload: ResolveClientRequest | None = None,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Resolves client identity based on Telegram user ID.
    If client exists in PostgreSQL, returns their profile and exact role.
    If client is new, registers them safely with subscriber role.
    """
    settings = get_settings()
    tg_id = (payload.telegram_user_id if payload else None) or telegram_user_id
    client_name = (payload.name if payload else None) or name
    tg_username = (payload.username if payload else None) or username

    if not tg_id:
        return {
            "ok": True,
            "id": 1,
            "client_id": 1,
            "telegram_user_id": None,
            "name": client_name or "Гость",
            "is_admin": False,
            "is_vip": False,
            "profile": {}
        }

    stmt = select(Client).where(Client.telegram_user_id == tg_id)
    res = await session.execute(stmt)
    client = res.scalar_one_or_none()

    if client is None:
        display_name = client_name or (f"@{tg_username}" if tg_username else f"User {tg_id}")
        client = Client(
            trainer_id=settings.trainer_id,
            name=display_name,
            telegram_user_id=tg_id,
            profile_json=json.dumps({"name": display_name}, ensure_ascii=False)
        )
        session.add(client)
        await session.commit()
        await session.refresh(client)
        prof = {"name": display_name}
    else:
        try:
            prof = await read_profile(client.id)
        except Exception:
            prof = {}
        if client_name and client.name != client_name:
            client.name = client_name
            await session.commit()

    is_admin_val = settings.is_admin_telegram_id(tg_id)
    is_vip_val = is_admin_val or bool(prof.get("is_vip", False))

    return {
        "ok": True,
        "id": client.id,
        "client_id": client.id,
        "telegram_user_id": client.telegram_user_id,
        "name": client.name,
        "is_admin": is_admin_val,
        "is_vip": is_vip_val,
        "profile": prof
    }


@router.post("/clients")
async def create_client_endpoint(payload: CreateClientRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Creates/registers a new client in PostgreSQL.
    """
    try:
        client = Client(
            trainer_id=get_settings().trainer_id,
            name=payload.name,
            telegram_user_id=payload.telegram_user_id,
            profile_json=json.dumps({"name": payload.name, "gender": payload.gender}, ensure_ascii=False)
        )
        session.add(client)
        await session.commit()
        await session.refresh(client)
        return {
            "ok": True,
            "client": {
                "id": client.id,
                "name": client.name,
                "telegram_user_id": client.telegram_user_id,
                "created_at": client.created_at.isoformat() if client.created_at else "",
            }
        }
    except SQLAlchemyError as exc:
        logger.error("Failed to create client: %s", exc)
        raise HTTPException(status_code=400, detail="Could not create client")


@router.get("/clients/{client_id}")
async def get_client_by_id(client_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Returns client profile and recent messages.
    """
    try:
        client = await session.get(Client, client_id)
        messages = await get_history(session, client_id, limit=30)
        profile = await read_profile(client_id) if client else {}
        
        settings = get_settings()
        is_admin_val = (settings.is_admin_telegram_id(client.telegram_user_id) if client else False) or bool(profile.get("is_admin", False))
        is_vip_val = is_admin_val or bool(profile.get("is_vip", False))
        
        return {
            "id": client_id,
            "telegram_user_id": client.telegram_user_id if client else None,
            "telegram_username": profile.get("telegram_username") or profile.get("username"),
            "name": client.name if client else "Клиент",
            "is_vip": is_vip_val,
            "is_admin": is_admin_val,
            "profile": profile,
            "messages": [
                {
                    "id": m.id,
                    "client_id": m.client_id,
                    "role": m.role,
                    "text": m.text,
                    "created_at": format_iso_utc(m.created_at),
                }
                for m in messages
            ],
        }
    except Exception as exc:
        logger.warning("Failed to fetch client %s: %s", client_id, exc)
        return {"id": client_id, "name": "Клиент", "profile": {}, "messages": [], "is_vip": False, "is_admin": False}


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
                "created_at": format_iso_utc(m.created_at),
            }
            for m in messages
        ]
    except SQLAlchemyError as exc:
        logger.error("Failed to load message history: %s", exc)
        return []


class ClearMessagesPayload(BaseModel):
    client_id: Optional[int] = 1


@router.post("/client/{client_id}/messages/clear")
@router.post("/client/messages/clear")
async def clear_client_messages_endpoint(
    client_id: Optional[int] = None,
    payload: Optional[ClearMessagesPayload] = None,
    session: AsyncSession = Depends(get_db_session),
):
    """
    Clears message history for a specific client in PostgreSQL.
    """
    target_id = client_id or (payload.client_id if payload else None) or 1
    try:
        from sqlalchemy import delete
        await session.execute(delete(Message).where(Message.client_id == target_id))
        await session.commit()
        return {"ok": True, "message": "История сообщений успешно очищена"}
    except Exception as exc:
        logger.error("Failed to clear messages for client %s: %s", target_id, exc)
        return {"ok": False, "error": str(exc)}


class VipRequestPayload(BaseModel):
    client_id: int
    note: Optional[str] = None
    profile: Optional[dict] = None


@router.post("/client/vip/request")
async def request_vip_endpoint(
    payload: VipRequestPayload,
    session: AsyncSession = Depends(get_db_session),
):
    """
    Creates an escalation ticket for trainer requesting VIP personal coaching.
    """
    try:
        client = await session.get(Client, payload.client_id)
        client_name = client.name if client else f"Клиент #{payload.client_id}"

        if payload.profile and client:
            try:
                await update_profile(payload.client_id, payload.profile)
            except Exception:
                pass

        note_str = payload.note or f"Заявка на персональное ведение (VIP) от {client_name}"
        esc = Escalation(
            client_id=payload.client_id,
            client_name=client_name,
            reason="Заявка на VIP (Ведение)",
            question=note_str,
            status="open"
        )
        session.add(esc)
        await session.commit()
        return {"ok": True, "message": "Заявка на персональное ведение успешно отправлена тренеру"}
    except Exception as exc:
        logger.error("Failed to submit VIP request for client %s: %s", payload.client_id, exc)
        return {"ok": False, "error": str(exc)}


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
        
        settings = get_settings()
        is_admin_val = settings.is_admin_telegram_id(client.telegram_user_id) if client else False
        is_vip_val = is_admin_val or bool(profile.get("is_vip", False))
        
        return {
            "client_id": client_id,
            "name": client.name if client else profile.get("name", "Клиент"),
            "profile": profile,
            "is_vip": is_vip_val,
            "is_admin": is_admin_val
        }
    except Exception as exc:
        logger.warning("Failed to fetch client profile: %s", exc)
        return {"client_id": client_id, "name": "Клиент", "profile": {}, "is_vip": False, "is_admin": False}


@router.put("/client/profile")
@router.post("/client/profile")
async def update_client_profile_endpoint(payload: ProfileUpdateRequest):
    """
    Updates client profile in PostgreSQL. Supports root-level fields and nested profile payloads.
    """
    client_id = payload.client_id or 1
    try:
        existing_profile = await read_profile(client_id)
    except Exception:
        existing_profile = {}

    new_data = dict(existing_profile)
    
    if payload.profile:
        new_data.update(payload.profile)

    # Directly map root keys if supplied
    if payload.name is not None:
        new_data["name"] = payload.name
    if payload.gender is not None:
        new_data["gender"] = payload.gender
    if payload.age is not None:
        new_data["age"] = payload.age
    if payload.height is not None:
        new_data["height"] = payload.height
    if payload.weight is not None:
        new_data["weight"] = payload.weight
    if payload.goal is not None:
        new_data["goal"] = payload.goal
    if payload.restrictions is not None:
        new_data["restrictions"] = payload.restrictions
    if payload.is_admin is not None:
        new_data["is_admin"] = payload.is_admin
        if payload.is_admin:
            new_data["is_vip"] = True
    if payload.is_vip is not None:
        new_data["is_vip"] = payload.is_vip

    try:
        updated = await update_profile(client_id, new_data)
        
        settings = get_settings()
        client_obj = await session.get(Client, client_id) if "session" in locals() else None
        is_admin_val = (settings.is_admin_telegram_id(client_obj.telegram_user_id) if client_obj else False) or bool(updated.get("is_admin", False))
        is_vip_val = is_admin_val or bool(updated.get("is_vip", False))
        
        return {
            "success": True,
            "ok": True,
            "client_id": client_id,
            "profile": updated,
            "client": {
                "id": client_id,
                "is_vip": is_vip_val,
                "is_admin": is_admin_val,
                "profile": updated
            }
        }
    except Exception as exc:
        logger.error("Failed to update profile: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/llm/status")
async def get_llm_status_endpoint():
    """
    Returns LLM status and active configuration.
    """
    settings = get_settings()
    orchestrator = get_orchestrator()
    is_ready = bool(settings.aitunnel_api_key and settings.aitunnel_model)

    return {
        "configured": orchestrator.is_configured,
        "is_ready": is_ready,
        "provider": "ai_tunnel",
        "effective_provider": "AI Tunnel",
        "effective_model": settings.aitunnel_model,
        "model": settings.aitunnel_model,
        "has_key": bool(settings.aitunnel_api_key),
        "status_message": f"AI Tunnel активен (Модель: {settings.aitunnel_model})" if is_ready else "AITUNNEL_API_KEY не обнаружен"
    }


class LLMConfigPayload(BaseModel):
    provider: Optional[str] = "ai_tunnel"
    aitunnelApiKey: Optional[str] = None
    aitunnelModel: Optional[str] = None
    aitunnel_api_key: Optional[str] = None
    aitunnel_model: Optional[str] = None


@router.post("/llm/config")
async def update_llm_config_endpoint(payload: LLMConfigPayload):
    """
    Updates runtime AI Tunnel configuration and model.
    """
    settings = get_settings()
    key = payload.aitunnelApiKey or payload.aitunnel_api_key
    model = payload.aitunnelModel or payload.aitunnel_model
    if key:
        settings.aitunnel_api_key = key.strip()
    if model:
        settings.aitunnel_model = model.strip()

    try:
        orch = get_orchestrator()
        if hasattr(orch, "client"):
            if key:
                orch.client._api_key = key.strip()
                orch.client._client = None
            if model:
                orch.client.model = model.strip()
    except Exception:
        pass

    is_ready = bool(settings.aitunnel_api_key and settings.aitunnel_model)
    return {
        "success": True,
        "status": {
            "is_ready": is_ready,
            "effective_provider": "AI Tunnel",
            "effective_model": settings.aitunnel_model,
            "has_key": bool(settings.aitunnel_api_key),
            "status_message": f"AI Tunnel активен (Модель: {settings.aitunnel_model})" if is_ready else "AITUNNEL_API_KEY не обнаружен",
        },
    }


@router.post("/llm/test")
async def test_llm_generation_endpoint(payload: LLMTestRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Diagnostic endpoint to test LLM classification, retrieval, and grounding logic.
    """
    q = (payload.prompt or payload.question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Prompt is required")

    orchestrator = get_orchestrator()
    if not orchestrator.is_configured:
        return {
            "success": False,
            "error": "ИИ провайдер не настроен. Проверьте AITUNNEL_API_KEY в переменных окружения.",
        }

    try:
        classification = await orchestrator.classify(q)
        cat = getattr(classification, "category", "other")

        knowledge = await search_knowledge(
            session, get_settings().trainer_id, q, category=cat if cat in CATEGORIES else None, limit=5
        )

        answer_text = await build_grounded_answer(orchestrator, client_id=1, question=q)

        return {
            "success": True,
            "question": q,
            "classified_category": cat,
            "matched_kb_count": len(knowledge),
            "matched_articles": [
                {"id": k.id, "title": k.title, "category": k.category}
                for k in knowledge
            ],
            "generated_answer": answer_text,
        }
    except Exception as exc:
        logger.error("LLM test failed: %s", exc)
        return {"success": False, "error": str(exc)}


@router.get("/escalations")
async def get_escalations_endpoint(session: AsyncSession = Depends(get_db_session)):
    """
    Returns open escalations needing trainer attention.
    """
    try:
        statement = select(Escalation).order_by(Escalation.id.desc())
        result = await session.execute(statement)
        escalations = result.scalars().all()
        return [
            {
                "id": e.id,
                "client_id": e.client_id,
                "reason": e.reason,
                "question": e.question,
                "status": e.status,
                "created_at": e.created_at.isoformat() if e.created_at else "",
            }
            for e in escalations
        ]
    except SQLAlchemyError as exc:
        logger.error("Failed to list escalations: %s", exc)
        return []


@router.post("/escalations/{escalation_id}/resolve")
async def resolve_escalation_endpoint(escalation_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Marks an escalation as resolved in PostgreSQL.
    """
    try:
        esc = await session.get(Escalation, escalation_id)
        if not esc:
            raise HTTPException(status_code=404, detail="Escalation not found")
        esc.status = "resolved"
        await session.commit()
        return {"ok": True, "id": escalation_id}
    except SQLAlchemyError as exc:
        logger.error("Failed to resolve escalation %s: %s", escalation_id, exc)
        raise HTTPException(status_code=400, detail="Could not resolve escalation")


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


@router.get("/content-gaps")
async def get_content_gaps_endpoint():
    """
    Returns content gaps. Returns an empty list in PostgreSQL production
    mode to prevent 404 and React rendering crashes.
    """
    return []


@router.post("/content-gaps/{gap_id}/approve")
async def approve_content_gap_endpoint(gap_id: int):
    """
    Dummy approval of content gaps.
    """
    return {"ok": True}


@router.post("/client/vip/toggle")
@router.post("/client/status/update")
async def toggle_client_vip_endpoint(payload: VIPToggleRequest):
    """
    Updates VIP and/or Admin status for a specific client in PostgreSQL.
    """
    client_id = payload.client_id
    try:
        existing_profile = await read_profile(client_id)
    except Exception:
        existing_profile = {}
        
    new_data = dict(existing_profile)
    
    if payload.role:
        if payload.role == "admin":
            new_data["is_admin"] = True
            new_data["is_vip"] = True
        elif payload.role == "vip":
            new_data["is_admin"] = False
            new_data["is_vip"] = True
        else:
            new_data["is_admin"] = False
            new_data["is_vip"] = False
    else:
        if payload.is_admin is not None:
            new_data["is_admin"] = payload.is_admin
            if payload.is_admin:
                new_data["is_vip"] = True
        if payload.is_vip is not None:
            new_data["is_vip"] = payload.is_vip
    
    try:
        updated = await update_profile(client_id, new_data)
        return {
            "ok": True,
            "success": True,
            "client_id": client_id,
            "is_vip": bool(updated.get("is_vip", False)),
            "is_admin": bool(updated.get("is_admin", False)),
            "profile": updated
        }
    except Exception as exc:
        logger.error("Failed to update status for client %s: %s", client_id, exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/client/vip/upgrade")
async def upgrade_client_vip_endpoint(payload: VIPUpgradeRequest):
    """
    Endpoint to request or self-upgrade VIP status.
    """
    client_id = payload.client_id or 1
    try:
        existing_profile = await read_profile(client_id)
    except Exception:
        existing_profile = {}
        
    new_data = dict(existing_profile)
    new_data["is_vip"] = True
    
    try:
        updated = await update_profile(client_id, new_data)
        return {"success": True, "is_vip": True, "message": "VIP-статус успешно активирован!"}
    except Exception as exc:
        logger.error("Failed to upgrade VIP status for client %s: %s", client_id, exc)
        raise HTTPException(status_code=400, detail=str(exc))
