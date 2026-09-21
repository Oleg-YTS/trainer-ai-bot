import logging
from functools import lru_cache

from aiogram import Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message, User
from sqlalchemy.exc import SQLAlchemyError

from app.ai.orchestrator import AIOrchestrator
from app.clients.service import register_telegram_client

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
    return f"id{user.id}"

async def register(message: Message) -> None:
    if message.from_user is None:
        return
    try:
        await register_telegram_client(
            message.from_user.id, telegram_display_name(message.from_user)
        )
    except (SQLAlchemyError, RuntimeError) as exc:  # a database problem must not break the bot
        logger.warning("Client registration failed: %s", exc)

@router.message(CommandStart())
async def start(message: Message) -> None:
    await register(message)
    await message.answer(
        "Привет! Я AI-консультант тренера. Задавай вопрос — "
        "если потребуется решение тренера, я передам его ему."
    )

@router.message()
async def handle_message(message: Message) -> None:
    await register(message)
    if not message.text:
        return
    orchestrator = get_orchestrator()
    if not orchestrator.is_configured:
        await message.answer(AI_UNAVAILABLE_TEXT)
        return
    classification = await orchestrator.classify(message.text)
    answer = await orchestrator.answer(
        message.text,
        classification,
        "No structured client profile is available yet.",
        "No approved trainer knowledge was retrieved in this starter scaffold.",
    )
    await message.answer(answer.answer)
