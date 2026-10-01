import logging
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
bot = Bot(settings.telegram_bot_token)
dp = build_dispatcher()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("PostgreSQL database tables initialized successfully.")
    except Exception as exc:
        logger.warning("Failed to auto-create PostgreSQL tables on startup: %s", exc)

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

# Enable CORS for WebApp integration (Mini App / Standalone Web Shell)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(web_router)

# Serve compiled React frontend (webapp/dist) in production if present
dist_path = Path("webapp/dist")
if not dist_path.exists():
    dist_path = Path("dist")

if dist_path.exists():
    logger.info("Mounting webapp static files from %s", dist_path.resolve())
    assets_dir = dist_path / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("telegram/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = dist_path / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        index_file = dist_path / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="index.html not found")

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

