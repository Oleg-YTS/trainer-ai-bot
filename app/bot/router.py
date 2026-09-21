from functools import lru_cache

from aiogram import Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from app.ai.orchestrator import AIOrchestrator

router = Router()

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

@router.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(
        "Привет! Я AI-консультант тренера. Задавай вопрос — "
        "если потребуется решение тренера, я передам его ему."
    )

@router.message()
async def handle_message(message: Message) -> None:
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
