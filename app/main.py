import logging
from contextlib import asynccontextmanager

import uvicorn
from aiogram import Bot
from aiogram.types import Update
from fastapi import FastAPI, HTTPException, Request

from app.bot.router import build_dispatcher, setup_bot_menu
from app.config.settings import get_settings

settings = get_settings()
bot = Bot(settings.telegram_bot_token)
dp = build_dispatcher()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.webhook_url:
        await bot.set_webhook(
            url=settings.webhook_url,
            secret_token=settings.webhook_secret_token,
            allowed_updates=dp.resolve_used_update_types(),
            drop_pending_updates=False,
        )
        await setup_bot_menu(bot)
    yield
    await bot.session.close()

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

@app.post(settings.webhook_path)
async def telegram_webhook(request: Request) -> dict[str, bool]:
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if settings.webhook_secret_token and secret != settings.webhook_secret_token:
        raise HTTPException(status_code=403, detail="forbidden")
    try:
        payload = await request.json()
        update = Update.model_validate(payload, context={"bot": bot})
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid update") from None
    try:
        await dp.feed_webhook_update(bot, update)
    except Exception:  # a failed handler must not break webhook delivery
        logger.exception("Failed to process update %s", update.update_id)
    return {"ok": True}

if __name__ == "__main__":
    logging.basicConfig(level=settings.log_level)
    uvicorn.run(app, host="0.0.0.0", port=settings.port)

