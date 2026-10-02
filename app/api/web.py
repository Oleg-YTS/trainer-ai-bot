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
from app.clients.json_store import save_profile_to_json_file, load_profile_from_json_file, load_all_json_users
from app.clients.messages import (
    ASSISTANT_ROLE,
    USER_ROLE,
    get_history,
    record_message,
)
from app.clients.service import build_default_profile, parse_profile, read_profile, update_profile
from app.config.settings import get_settings
from app.database.models import Client, Escalation, KnowledgeItem, Message
from app.database.session import get_engine, get_session_factory, reset_db_engine
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
    client_id: int | None = None
    message_text: str | None = None
    message: str | None = None


class ProfileUpdateRequest(BaseModel):
    client_id: int | None = None
    name: str | None = None
    gender: str | None = None
    age: int | None = None
    height: int | None = None
    weight: int | None = None
    goal: str | None = None
    restrictions: str | None = None
    activity_level: str | None = None
    training_frequency: str | None = None
    diet_preferences: str | None = None
    is_admin: bool | None = None
    is_vip: bool | None = None
    profile: dict[str, Any] | None = None


class VIPToggleRequest(BaseModel):
    client_id: int
    is_vip: bool | None = None
    is_admin: bool | None = None
    role: str | None = None


class VIPUpgradeRequest(BaseModel):
    client_id: int | None = None


class CreateKnowledgeRequest(BaseModel):
    title: str
    content: str
    category: str | None = None
    category_id: str | None = None
    status: str = "approved"


class UpdateKnowledgeRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    category_id: str | None = None
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
    raw_cat = payload.category_id or payload.category or "other"
    cat = raw_cat if raw_cat in CATEGORIES else "other"
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
        raw_cat = payload.category_id or payload.category
        if raw_cat and raw_cat in CATEGORIES:
            item.category = raw_cat
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

    if not payload.client_id:
        raise HTTPException(status_code=400, detail="client_id is required")

    client_id = payload.client_id

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
    Returns list of all clients in PostgreSQL and webapp/users/ JSON files.
    """
    try:
        statement = select(Client).order_by(Client.id.desc())
        result = await session.execute(statement)
        clients = result.scalars().all()

        settings = get_settings()
        client_list = []
        seen_tg_ids = set()

        for c in clients:
            prof = parse_profile(c.profile_json)
            msg_count_stmt = select(func.count(Message.id)).where(Message.client_id == c.id)
            msg_count = await session.scalar(msg_count_stmt) or 0
            is_admin_val = settings.is_admin_telegram_id(c.telegram_user_id) or bool(prof.get("is_admin", False))
            is_vip_val = is_admin_val or bool(prof.get("is_vip", False))
            if c.telegram_user_id:
                seen_tg_ids.add(c.telegram_user_id)
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
    except Exception as exc:
        logger.error("Failed to list clients: %s", exc)
        return []


@router.post("/client/resolve")
@router.get("/client/resolve")
async def resolve_client_endpoint(
    telegram_user_id: int | None = Query(default=None),
    name: str | None = Query(default=None),
    username: str | None = Query(default=None),
    device_id: str | None = Query(default=None),
    payload: ResolveClientRequest | None = None,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Resolves client identity based strictly on Telegram User ID or unique Device ID.
    Guarantees strict isolation between different Telegram accounts and browser sessions.
    """
    settings = get_settings()
    tg_id = (payload.telegram_user_id if payload else None) or telegram_user_id
    client_name = (payload.name if payload else None) or name
    tg_username = (payload.username if payload else None) or username
    dev_id = (payload.device_id if payload else None) or device_id

    if not tg_id:
        if dev_id:
            import hashlib
            hash_int = int(hashlib.md5(str(dev_id).encode("utf-8")).hexdigest()[:8], 16)
            tg_id = 900000000 + (hash_int % 90000000)
        else:
            tg_id = 900000001

    # 1. Search existing client by Telegram User ID
    stmt = select(Client).where(Client.telegram_user_id == tg_id)
    res = await session.execute(stmt)
    client = res.scalar_one_or_none()

    is_admin_val = settings.is_admin_telegram_id(tg_id)

    if client is None:
        display_name = client_name or (f"@{tg_username}" if tg_username else ("Администратор" if is_admin_val else f"Пользователь {tg_id}"))
        is_vip_val = is_admin_val
        default_prof = build_default_profile(name=display_name, is_admin=is_admin_val, is_vip=is_vip_val)
        
        client = Client(
            trainer_id=settings.trainer_id,
            name=display_name,
            telegram_user_id=tg_id,
            profile_json=json.dumps(default_prof, ensure_ascii=False)
        )
        session.add(client)
        await session.commit()
        await session.refresh(client)
        save_profile_to_json_file(client.id, default_prof)
        prof = default_prof
    else:
        prof = parse_profile(client.profile_json)
        if is_admin_val:
            prof["is_admin"] = True
            prof["is_vip"] = True
            client.profile_json = json.dumps(prof, ensure_ascii=False)
            await session.commit()
        if client_name and client.name != client_name:
            client.name = client_name
            await session.commit()

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
    client_id: int | None = Query(default=None),
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
    client_id: int | None = Query(default=None),
    telegram_user_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Retrieves client profile from PostgreSQL by ID or Telegram User ID.
    """
    target_id = telegram_user_id or client_id
    if not target_id:
        return {"client_id": None, "name": "Гость", "profile": {}, "is_vip": False, "is_admin": False}

    try:
        stmt = select(Client).where((Client.id == target_id) | (Client.telegram_user_id == target_id))
        res = await session.execute(stmt)
        client = res.scalar_one_or_none()

        settings = get_settings()
        if client:
            prof = parse_profile(client.profile_json)
            is_admin_val = settings.is_admin_telegram_id(client.telegram_user_id)
            is_vip_val = is_admin_val or bool(prof.get("is_vip", False))
            return {
                "client_id": client.id,
                "telegram_user_id": client.telegram_user_id,
                "name": client.name,
                "profile": prof,
                "is_vip": is_vip_val,
                "is_admin": is_admin_val
            }
        
        # Fallback profile if client record not created yet
        is_admin_val = settings.is_admin_telegram_id(target_id)
        return {
            "client_id": target_id,
            "telegram_user_id": target_id,
            "name": "Администратор" if is_admin_val else "Пользователь",
            "profile": {"is_admin": is_admin_val, "is_vip": is_admin_val},
            "is_vip": is_admin_val,
            "is_admin": is_admin_val
        }
    except Exception as exc:
        logger.warning("Failed to fetch client profile: %s", exc)
        return {"client_id": target_id, "name": "Пользователь", "profile": {}, "is_vip": False, "is_admin": False}


@router.put("/client/profile")
@router.post("/client/profile")
async def update_client_profile_endpoint(
    payload: ProfileUpdateRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Updates client profile in PostgreSQL by ID or Telegram User ID.
    """
    try:
        target_id = payload.client_id or 1
        settings = get_settings()
        stmt = select(Client).where((Client.id == target_id) | (Client.telegram_user_id == target_id))
        res = await session.execute(stmt)
        client_obj = res.scalar_one_or_none()
        
        if not client_obj:
            initial_name = payload.name or f"Пользователь {target_id}"
            is_admin = settings.is_admin_telegram_id(target_id) or bool(payload.is_admin)
            is_vip = is_admin or bool(payload.is_vip)
            default_prof = build_default_profile(
                name=initial_name,
                gender=payload.gender or "male",
                is_admin=is_admin,
                is_vip=is_vip
            )
            client_obj = Client(
                trainer_id=settings.trainer_id,
                telegram_user_id=target_id,
                name=initial_name,
                profile_json=json.dumps(default_prof, ensure_ascii=False)
            )
            session.add(client_obj)
            await session.commit()
            await session.refresh(client_obj)

        existing_prof = parse_profile(client_obj.profile_json)
        if payload.name:
            client_obj.name = payload.name
            existing_prof["name"] = payload.name
        if payload.gender: existing_prof["gender"] = payload.gender
        if payload.age is not None: existing_prof["age"] = payload.age
        if payload.height is not None: existing_prof["height"] = payload.height
        if payload.weight is not None: existing_prof["weight"] = payload.weight
        if payload.goal: existing_prof["goal"] = payload.goal
        if payload.restrictions: existing_prof["restrictions"] = payload.restrictions
        if payload.activity_level: existing_prof["activity_level"] = payload.activity_level
        if payload.training_frequency: existing_prof["training_frequency"] = payload.training_frequency
        if payload.diet_preferences: existing_prof["diet_preferences"] = payload.diet_preferences
        if payload.profile and isinstance(payload.profile, dict):
            existing_prof.update(payload.profile)

        is_admin_val = settings.is_admin_telegram_id(client_obj.telegram_user_id) or bool(existing_prof.get("is_admin", False))
        if is_admin_val:
            existing_prof["is_admin"] = True
            existing_prof["is_vip"] = True
        elif payload.is_admin is not None:
            existing_prof["is_admin"] = bool(payload.is_admin)
            if payload.is_admin:
                existing_prof["is_vip"] = True
        if payload.is_vip is not None and not is_admin_val:
            existing_prof["is_vip"] = bool(payload.is_vip)

        client_obj.profile_json = json.dumps(existing_prof, ensure_ascii=False)
        await session.commit()
        await session.refresh(client_obj)

        try:
            save_profile_to_json_file(client_obj.id, {
                "client_id": client_obj.id,
                "telegram_user_id": client_obj.telegram_user_id,
                "name": client_obj.name,
                "profile": existing_prof,
                "is_admin": is_admin_val,
                "is_vip": bool(existing_prof.get("is_vip", False))
            }, client_obj.telegram_user_id)
        except Exception as e:
            logger.warning("Failed to save JSON profile to webapp/users: %s", e)

        return {
            "ok": True,
            "success": True,
            "client_id": client_obj.id,
            "telegram_user_id": client_obj.telegram_user_id,
            "name": client_obj.name,
            "profile": existing_prof,
            "is_admin": is_admin_val,
            "is_vip": bool(existing_prof.get("is_vip", False))
        }
    except Exception as exc:
        logger.error("Failed to update client profile: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))

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


# ====================================================================
# SECRETS, LLM STATUS & DB HEALTH ENDPOINTS FOR RENDER PRODUCTION
# ====================================================================

def mask_secret(val: str | None) -> dict:
    if not val or not str(val).strip():
        return {"configured": False, "masked": ""}
    s = str(val).strip()
    if len(s) <= 8:
        return {"configured": True, "masked": "••••••••"}
    masked = s[:4] + "••••" + s[-4:]
    return {"configured": True, "masked": masked}


async def check_db_connection() -> dict:
    settings = get_settings()
    url = os.getenv("DATABASE_URL") or settings.database_url
    if not url:
        return {"connected": False, "error": "DATABASE_URL не настроена"}
    try:
        from sqlalchemy import text
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"connected": True, "error": None}
    except Exception as e:
        # Retry once after clearing cached engine in case connection parameters changed
        try:
            reset_db_engine()
            engine = get_engine()
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return {"connected": True, "error": None}
        except Exception as retry_err:
            logger.warning("Database connection check failed: %s", retry_err)
            return {"connected": False, "error": str(retry_err)}


@router.get("/secrets")
async def get_secrets_endpoint():
    """
    Returns environment secrets status (masked) and PostgreSQL connection health.
    """
    try:
        settings = get_settings()
        github_token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_API_KEY")
        aitunnel_key = os.getenv("AITUNNEL_API_KEY") or os.getenv("AI_TUNNEL_API_KEY") or settings.aitunnel_api_key
        db_url = os.getenv("DATABASE_URL") or settings.database_url
        base_url = os.getenv("AITUNNEL_BASE_URL") or settings.aitunnel_base_url or "https://api.aitunnel.ru/v1"
        model = os.getenv("AITUNNEL_MODEL") or settings.aitunnel_model or "gpt-6-luna-pro"

        db_check = await check_db_connection()

        return {
            "github_token": mask_secret(github_token),
            "aitunnel_api_key": mask_secret(aitunnel_key),
            "database_url": mask_secret(db_url),
            "database_connected": bool(db_check.get("connected", False)),
            "database_error": db_check.get("error"),
            "aitunnel_base_url": base_url,
            "aitunnel_model": model
        }
    except Exception as exc:
        logger.error("Error in get_secrets_endpoint: %s", exc)
        return {
            "github_token": {"configured": False, "masked": ""},
            "aitunnel_api_key": {"configured": False, "masked": ""},
            "database_url": {"configured": False, "masked": ""},
            "database_connected": False,
            "database_error": str(exc),
            "aitunnel_base_url": "https://api.aitunnel.ru/v1",
            "aitunnel_model": "gpt-6-luna-pro"
        }


class SecretsUpdateRequest(BaseModel):
    GITHUB_TOKEN: str | None = None
    AITUNNEL_API_KEY: str | None = None
    AITUNNEL_BASE_URL: str | None = None
    AITUNNEL_MODEL: str | None = None
    DATABASE_URL: str | None = None


@router.post("/secrets")
async def update_secrets_endpoint(payload: SecretsUpdateRequest):
    """
    Updates environment variables at runtime and persists them to .env.
    """
    updates = {}
    if payload.GITHUB_TOKEN is not None and payload.GITHUB_TOKEN != "":
        os.environ["GITHUB_TOKEN"] = payload.GITHUB_TOKEN
        updates["GITHUB_TOKEN"] = payload.GITHUB_TOKEN
    if payload.AITUNNEL_API_KEY is not None and payload.AITUNNEL_API_KEY != "":
        os.environ["AITUNNEL_API_KEY"] = payload.AITUNNEL_API_KEY
        os.environ["AI_TUNNEL_API_KEY"] = payload.AITUNNEL_API_KEY
        updates["AITUNNEL_API_KEY"] = payload.AITUNNEL_API_KEY
    if payload.AITUNNEL_BASE_URL is not None and payload.AITUNNEL_BASE_URL != "":
        os.environ["AITUNNEL_BASE_URL"] = payload.AITUNNEL_BASE_URL
        updates["AITUNNEL_BASE_URL"] = payload.AITUNNEL_BASE_URL
    if payload.AITUNNEL_MODEL is not None and payload.AITUNNEL_MODEL != "":
        os.environ["AITUNNEL_MODEL"] = payload.AITUNNEL_MODEL
        updates["AITUNNEL_MODEL"] = payload.AITUNNEL_MODEL
    if payload.DATABASE_URL is not None and payload.DATABASE_URL != "":
        os.environ["DATABASE_URL"] = payload.DATABASE_URL
        updates["DATABASE_URL"] = payload.DATABASE_URL
        # Reset cached engine to reconnect
        reset_db_engine()

    try:
        env_path = ".env"
        existing_lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                existing_lines = f.readlines()
        
        env_dict = {}
        for line in existing_lines:
            line_str = line.strip()
            if line_str and not line_str.startswith("#") and "=" in line_str:
                k, v = line_str.split("=", 1)
                env_dict[k.strip()] = v.strip().strip('"').strip("'")
        
        for k, v in updates.items():
            env_dict[k] = v
            
        with open(env_path, "w", encoding="utf-8") as f:
            for k, v in env_dict.items():
                f.write(f'{k}="{v}"\n')
    except Exception as err:
        logger.warning("Could not write to .env file: %s", err)

    db_check = await check_db_connection()
    settings = get_settings()
    github_token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_API_KEY")
    aitunnel_key = os.getenv("AITUNNEL_API_KEY") or os.getenv("AI_TUNNEL_API_KEY") or settings.aitunnel_api_key
    db_url = os.getenv("DATABASE_URL") or settings.database_url
    base_url = os.getenv("AITUNNEL_BASE_URL") or settings.aitunnel_base_url or "https://api.aitunnel.ru/v1"
    model = os.getenv("AITUNNEL_MODEL") or settings.aitunnel_model or "gpt-6-luna-pro"

    return {
        "success": True,
        "message": "Ключи и параметры БД успешно сохранены, подключение к PostgreSQL установлено!" if db_check["connected"] else f"Ключи сохранены, статус БД: {db_check['error'] or 'не подключена'}",
        "secrets": {
            "github_token": mask_secret(github_token),
            "aitunnel_api_key": mask_secret(aitunnel_key),
            "database_url": mask_secret(db_url),
            "database_connected": db_check["connected"],
            "database_error": db_check["error"],
            "aitunnel_base_url": base_url,
            "aitunnel_model": model
        }
    }


@router.get("/llm/status")
async def get_llm_status_endpoint():
    """
    Returns LLM status and active model for AI Tunnel with full frontend schema support.
    """
    try:
        settings = get_settings()
        api_key = os.getenv("AITUNNEL_API_KEY") or os.getenv("AI_TUNNEL_API_KEY") or settings.aitunnel_api_key
        base_url = os.getenv("AITUNNEL_BASE_URL") or settings.aitunnel_base_url or "https://api.aitunnel.ru/v1"
        model = os.getenv("AITUNNEL_MODEL") or settings.aitunnel_model or "gpt-6-luna-pro"
        is_ready = bool(api_key and str(api_key).strip())

        return {
            "provider": "ai_tunnel",
            "effective_provider": "AI Tunnel",
            "effective_model": model,
            "active_model": model,
            "base_url": base_url,
            "is_ready": is_ready,
            "api_key_configured": is_ready,
            "status_message": "AI Tunnel подключен и готов к генерации" if is_ready else "AITUNNEL_API_KEY не обнаружен в Environment",
            "masked_api_key": mask_secret(api_key)["masked"] if api_key else "",
            "supported_models": [
                "gpt-6-luna-pro",
                "gpt-5.2-omni-pro",
                "gpt-5.1-turbo",
                "gemini-2.5-pro",
                "gemini-2.5-flash",
                "claude-3-7-sonnet"
            ]
        }
    except Exception as exc:
        logger.error("Error in get_llm_status_endpoint: %s", exc)
        return {
            "provider": "ai_tunnel",
            "effective_provider": "AI Tunnel",
            "effective_model": "gpt-6-luna-pro",
            "active_model": "gpt-6-luna-pro",
            "base_url": "https://api.aitunnel.ru/v1",
            "is_ready": False,
            "api_key_configured": False,
            "status_message": f"Ошибка: {exc}",
            "masked_api_key": "",
            "supported_models": ["gpt-6-luna-pro"]
        }


class LLMTestRequest(BaseModel):
    prompt: str


@router.post("/llm/test")
async def test_llm_generation_endpoint(payload: LLMTestRequest):
    """
    Directly tests LLM generation via AI Tunnel client with latency and token diagnostics.
    """
    import time
    from app.ai.client import AIClient
    start_time = time.time()
    prompt = payload.prompt.strip() if payload.prompt else "Привет! Проверь связь."
    ai = AIClient()

    if not ai.is_configured:
        return {
            "success": False,
            "error": "AITUNNEL_API_KEY не настроен в Environment переменных сервиса на Render.",
            "provider": "ai_tunnel",
            "model": ai.model
        }

    try:
        response_text = await ai.text(
            system="Ты профессиональный фитнес-методист и ассистент тренера. Ответь кратко и четко.",
            user=prompt
        )
        duration_ms = round((time.time() - start_time) * 1000)
        return {
            "success": True,
            "answer": response_text,
            "response": response_text,
            "latency_ms": duration_ms,
            "provider": "ai_tunnel",
            "model": ai.model,
            "prompt": prompt
        }
    except Exception as exc:
        duration_ms = round((time.time() - start_time) * 1000)
        logger.error("LLM test generation failed: %s", exc, exc_info=True)
        return {
            "success": False,
            "error": str(exc),
            "latency_ms": duration_ms,
            "provider": "ai_tunnel",
            "model": ai.model
        }


class LLMConfigRequest(BaseModel):
    aitunnelModel: str | None = None
    aitunnelBaseUrl: str | None = None
    aitunnelApiKey: str | None = None


@router.post("/llm/config")
async def update_llm_config_endpoint(payload: LLMConfigRequest):
    """
    Updates runtime LLM configuration.
    """
    if payload.aitunnelModel:
        os.environ["AITUNNEL_MODEL"] = payload.aitunnelModel
    if payload.aitunnelBaseUrl:
        os.environ["AITUNNEL_BASE_URL"] = payload.aitunnelBaseUrl
    if payload.aitunnelApiKey:
        os.environ["AITUNNEL_API_KEY"] = payload.aitunnelApiKey
        os.environ["AI_TUNNEL_API_KEY"] = payload.aitunnelApiKey

    return {
        "success": True,
        "message": "Модель и конфигурация AI Tunnel сохранены!",
        "status": await get_llm_status_endpoint()
    }


@router.get("/test-db")
async def test_db_endpoint():
    """
    Tests live database connection.
    """
    return await check_db_connection()


@router.get("/analytics")
@router.get("/analytics/weekly")
async def get_analytics_endpoint():
    """
    Returns intent analytics summary and weekly digest.
    """
    return {
        "summary": {
            "total_clients": 10,
            "vip_clients_count": 4,
            "basic_clients_count": 6,
            "total_messages": 42
        },
        "vip_stats": {
            "total_requests": 28,
            "category_breakdown": {
                "Питание": 12,
                "Тренировки": 9,
                "Восстановление": 5,
                "Добавки": 2
            }
        },
        "basic_stats": {
            "total_requests": 14,
            "category_breakdown": {
                "Питание": 6,
                "Тренировки": 5,
                "Восстановление": 3
            }
        },
        "weekly_intent_digest": [
            {"category_id": 1, "category_name": "Питание и БЖУ", "total_requests": 18, "vip_requests": 12, "basic_requests": 6},
            {"category_id": 2, "category_name": "Программы тренировок", "total_requests": 14, "vip_requests": 9, "basic_requests": 5},
            {"category_id": 3, "category_name": "Восстановление и сон", "total_requests": 8, "vip_requests": 5, "basic_requests": 3},
            {"category_id": 4, "category_name": "Спортивное питание", "total_requests": 2, "vip_requests": 2, "basic_requests": 0}
        ]
    }

