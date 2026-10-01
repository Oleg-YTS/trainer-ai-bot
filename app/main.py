import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from aiogram import Bot
from aiogram.types import Update
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.web import router as web_router
from app.bot.router import build_dispatcher, setup_bot_menu
from app.config.settings import get_settings
from app.database.models import Base
from app.database.session import get_engine

settings = get_settings()
bot: Bot | None = Bot(settings.telegram_bot_token) if settings.telegram_bot_token else None
dp = build_dispatcher()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize database tables if DATABASE_URL is configured
    if settings.database_url:
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database schema initialized successfully.")
        except Exception as exc:
            logger.warning("Database schema auto-creation failed: %s", exc)

    # Initialize Telegram Webhook if configured
    if bot and settings.webhook_url:
        try:
            await bot.set_webhook(
                url=settings.webhook_url,
                secret_token=settings.webhook_secret_token,
                allowed_updates=dp.resolve_used_update_types(),
                drop_pending_updates=False,
            )
            await setup_bot_menu(bot)
            logger.info("Telegram webhook and menu configured successfully.")
        except Exception as exc:
            logger.warning("Failed to configure Telegram webhook: %s", exc)
    yield
    if bot:
        await bot.session.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)

# Enable CORS for WebApp integration (Mini App / Standalone Web Shell)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(web_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(settings.webhook_path)
async def telegram_webhook(request: Request) -> dict[str, bool]:
    if not bot:
        raise HTTPException(status_code=503, detail="Bot is not initialized")
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


# SPA Frontend Static Files Mounting
webapp_dist = Path(__file__).resolve().parent.parent / "webapp" / "dist"
if not webapp_dist.exists():
    webapp_dist = Path(__file__).resolve().parent.parent / "dist"

if webapp_dist.exists():
    assets_dir = webapp_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        target_file = webapp_dist / full_path
        if full_path and target_file.is_file():
            return FileResponse(target_file)
        index_file = webapp_dist / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build not found")


if __name__ == "__main__":
    logging.basicConfig(level=settings.log_level)
    port = int(os.environ.get("PORT", str(settings.port)))
    uvicorn.run(app, host="0.0.0.0", port=port)
