from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from app.ai.orchestrator import AIOrchestrator
from app.config.settings import get_settings

router = Router()
orchestrator = AIOrchestrator()

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
    classification = await orchestrator.classify(message.text)
    answer = await orchestrator.answer(
        message.text,
        classification,
        "No structured client profile is available yet.",
        "No approved trainer knowledge was retrieved in this starter scaffold.",
    )
    await message.answer(answer.answer)

async def run_bot() -> None:
    bot = Bot(get_settings().telegram_bot_token)
    dp = Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)
