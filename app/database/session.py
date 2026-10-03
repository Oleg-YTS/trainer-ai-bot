import os
import re
from functools import lru_cache
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from app.config.settings import get_settings


def to_async_url(url: str) -> str:
    if not url:
        return "sqlite+aiosqlite:///app.db"
    
    url = str(url).strip().strip('"').strip("'")
    
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    elif url.startswith("sqlite://") and not url.startswith("sqlite+aiosqlite://"):
        url = "sqlite+aiosqlite://" + url[len("sqlite://"):]
    
    # Clean up SSL mode for asyncpg driver
    if "sslmode=" in url:
        url = re.sub(r'sslmode=[^&]+', 'ssl=require', url)
        
    return url


def get_engine() -> AsyncEngine:
    settings = get_settings()
    url = os.getenv("DATABASE_URL") or settings.database_url
    if not url:
        url = "sqlite+aiosqlite:///app.db"
    
    async_url = to_async_url(url)
    if "sqlite" in async_url:
        return create_async_engine(async_url, pool_pre_ping=True)
    
    return create_async_engine(async_url, pool_pre_ping=True, pool_recycle=300)


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False, class_=AsyncSession)


def reset_db_engine():
    get_engine.cache_clear()
    get_session_factory.cache_clear()
