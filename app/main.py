import json
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
from sqlalchemy import select, func

from app.api.web import router as web_router
from app.bot.router import build_dispatcher, setup_bot_menu
from app.clients.service import build_default_profile
from app.config.settings import get_settings
from app.database.models import Base, Client, Trainer, KnowledgeItem
from app.database.session import get_engine, get_session_factory

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
        
        # Ensure default Trainer #1, Admin profiles, and sample clients exist in PostgreSQL/SQLite
        session_factory = get_session_factory()
        async with session_factory() as session:
            trainer = await session.get(Trainer, 1)
            if not trainer:
                session.add(Trainer(id=1, telegram_user_id=435297513, name="Главный Тренер"))
                await session.commit()
            
            # Hardcoded Admin Telegram IDs
            admin_configs = [
                (747600306, "Администратор"),
                (435297513, "Главный Тренер")
            ]
            for admin_tg_id, default_name in admin_configs:
                stmt = select(Client).where(Client.telegram_user_id == admin_tg_id)
                res = await session.execute(stmt)
                admin_client = res.scalar_one_or_none()
                
                prof = build_default_profile(name=default_name, is_admin=True, is_vip=True)
                prof_str = json.dumps(prof, ensure_ascii=False)
                
                if not admin_client:
                    admin_client = Client(
                        trainer_id=1,
                        name=default_name,
                        telegram_user_id=admin_tg_id,
                        profile_json=prof_str
                    )
                    session.add(admin_client)

            # Admin profiles guaranteed in DB
            pass

            # Ensure default knowledge base articles exist if knowledge table is empty
            kb_count = await session.scalar(select(func.count(KnowledgeItem.id))) or 0
            if kb_count == 0:
                sample_kbs = [
                    KnowledgeItem(
                        trainer_id=1,
                        category="nutrition",
                        title="Норма белка для набора массы",
                        content="При наборе массы суточная норма белка составляет 1.8–2.2 г на 1 кг массы тела.",
                        status="approved"
                    ),
                    KnowledgeItem(
                        trainer_id=1,
                        category="training",
                        title="Прогрессия нагрузок и разминка",
                        content="Перед каждой силовой тренировкой обязательна суставная разминка 5-7 минут.",
                        status="approved"
                    )
                ]
                session.add_all(sample_kbs)

            await session.commit()
            
        logger.info("Database tables, Trainer #1, Admin profiles, and initial seed data initialized successfully.")
    except Exception as exc:
        logger.warning("Database setup notice during startup: %s", exc)

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

# Zero-Cache Middleware for Telegram WebApp and Mobile Browsers
@app.middleware("http")
async def no_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    # Ensure fresh content and live API responses across all devices
    path = request.url.path
    if path.startswith("/api/") or path == "/" or path.endswith(".html") or path == "/health":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["Surrogate-Control"] = "no-store"
    return response

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

NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0"
}

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
            if full_path.endswith(".html"):
                return FileResponse(file_path, headers=NO_CACHE_HEADERS)
            return FileResponse(file_path)
        index_file = dist_path / "index.html"
        if index_file.exists():
            return FileResponse(index_file, headers=NO_CACHE_HEADERS)
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
