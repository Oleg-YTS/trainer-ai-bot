import asyncio

from aiogram import Bot

from app.bot.router import build_dispatcher, setup_bot_menu
from app.config.settings import get_settings


async def run_polling() -> None:
    bot = Bot(get_settings().telegram_bot_token)
    dp = build_dispatcher()
    # a webhook must be removed, otherwise Telegram rejects getUpdates with 409 Conflict
    await bot.delete_webhook(drop_pending_updates=False)
    await setup_bot_menu(bot)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(run_polling())
