from sqlalchemy.ext.asyncio import AsyncEngine

from app.config.settings import get_settings
from app.database.session import get_engine, to_async_url

SYNC_URL = "postgresql://user:pass@localhost:5432/trainer"
ASYNC_URL = "postgresql+asyncpg://user:pass@localhost:5432/trainer"


def test_to_async_url_converts_sync_scheme() -> None:
    assert to_async_url(SYNC_URL) == ASYNC_URL


def test_to_async_url_keeps_async_scheme() -> None:
    assert to_async_url(ASYNC_URL) == ASYNC_URL


async def test_get_engine_resolves_asyncpg_driver(monkeypatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456:TEST")
    monkeypatch.setenv("DATABASE_URL", SYNC_URL)
    get_settings.cache_clear()
    get_engine.cache_clear()
    try:
        engine = get_engine()
        assert isinstance(engine, AsyncEngine)
        assert engine.dialect.name == "postgresql"
        assert engine.dialect.driver == "asyncpg"
    finally:
        get_engine.cache_clear()
        get_settings.cache_clear()
