import logging
from functools import lru_cache

from aiogram import Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message, User
from sqlalchemy.exc import SQLAlchemyError

from app.ai.orchestrator import AIOrchestrator
from app.ai.service import AnswerUnavailable, build_grounded_answer
from app.clients.messages import ASSISTANT_ROLE, USER_ROLE, record_message
from app.clients.service import register_telegram_client
from app.database.models import Client

router = Router()
logger = logging.getLogger(__name__)

AI_UNAVAILABLE_TEXT = (
    "ИИ-часть пока в разработке. Я передал вопрос тренеру — "
    "он ответит, как только увидит сообщение."
)

@lru_cache
def get_orchestrator() -> AIOrchestrator:
    return AIOrchestrator()

def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.include_router(router)
    return dp

def telegram_display_name(user: User) -> str:
    if user.full_name:
        return user.full_name[:200]
    if user.username:
        return f"@{user.username}"[:200]
    return f"id{user.id}"[:200]

async def register(message: Message) -> Client | None:
    if message.from_user is None:
        return None
    try:
        return await register_telegram_client(
            message.from_user.id, telegram_display_name(message.from_user)
        )
    except (SQLAlchemyError, RuntimeError) as exc:  # a database problem must not break the bot
        logger.warning("Client registration failed: %s", exc)
        return None

async def store_message(client_id: int, role: str, text: str) -> None:
    try:
        await record_message(client_id, role, text)
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:  # history is not critical for a reply
        logger.warning("Saving message failed: %s", exc)

@router.message(CommandStart())
async def start(message: Message) -> None:
    await register(message)
    await message.answer(
        "Привет! Я AI-консультант тренера. Задавай вопрос — "
        "если потребуется решение тренера, я передам его ему."
    )

@router.message()
async def handle_message(message: Message) -> None:
    client = await register(message)
    if not message.text:
        return
    client_id = client.id if client is not None else None
    if client_id is not None:
        await store_message(client_id, USER_ROLE, message.text)
    orchestrator = get_orchestrator()
    if not orchestrator.is_configured:
        await message.answer(AI_UNAVAILABLE_TEXT)
        return
    try:
        answer_text = await build_grounded_answer(orchestrator, client_id, message.text)
    except AnswerUnavailable as exc:
        logger.warning("Grounded answer unavailable: %s", exc)
        await message.answer(AI_UNAVAILABLE_TEXT)
        return
    if client_id is not None:
        await store_message(client_id, ASSISTANT_ROLE, answer_text)
    await message.answer(answer_text)