import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database.models import Base, Client, Trainer

TRAINER_ID = 1
CLIENT_TELEGRAM_ID = 1001


@pytest.fixture
async def session_factory():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def session(session_factory):
    async with session_factory() as db_session:
        yield db_session


@pytest.fixture
async def client_id(session):
    session.add(Trainer(id=TRAINER_ID, name="Trainer"))
    await session.flush()
    client = Client(
        trainer_id=TRAINER_ID,
        telegram_user_id=CLIENT_TELEGRAM_ID,
        name="Test Client",
        profile_json="{}",
    )
    session.add(client)
    await session.commit()
    return client.id
