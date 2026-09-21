from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.clients import service as clients_service
from app.clients.service import get_or_create_client
from app.database.models import Base, Client, Trainer
from app.trainers.service import get_or_create_trainer

TRAINER_ID = 7


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db_session:
        yield db_session
    await engine.dispose()


async def test_new_telegram_user_creates_single_client(session) -> None:
    trainer = await get_or_create_trainer(session, TRAINER_ID)

    client = await get_or_create_client(session, trainer.id, 555, "Иван")

    stored = list((await session.execute(select(Client))).scalars().all())
    assert len(stored) == 1
    assert client.id == stored[0].id
    assert client.telegram_user_id == 555
    assert client.trainer_id == TRAINER_ID
    assert client.profile_json == "{}"


async def test_repeated_message_does_not_create_duplicate(session) -> None:
    trainer = await get_or_create_trainer(session, TRAINER_ID)
    first = await get_or_create_client(session, trainer.id, 556, "Иван")

    second = await get_or_create_client(session, trainer.id, 556, "Иван")

    stored = list((await session.execute(select(Client))).scalars().all())
    assert len(stored) == 1
    assert first.id == second.id


async def test_changed_name_is_updated(session) -> None:
    trainer = await get_or_create_trainer(session, TRAINER_ID)
    await get_or_create_client(session, trainer.id, 557, "Иван")

    updated = await get_or_create_client(session, trainer.id, 557, "Иван Петров")

    stored = list((await session.execute(select(Client))).scalars().all())
    assert len(stored) == 1
    assert updated.name == "Иван Петров"
    assert stored[0].name == "Иван Петров"


async def test_trainer_creation_is_idempotent(session) -> None:
    first = await get_or_create_trainer(session, TRAINER_ID)

    second = await get_or_create_trainer(session, TRAINER_ID)

    stored = list((await session.execute(select(Trainer))).scalars().all())
    assert len(stored) == 1
    assert first.id == second.id == TRAINER_ID
    assert first.name == "Trainer"
    assert first.telegram_user_id is None


async def test_register_telegram_client_creates_trainer_and_client(monkeypatch) -> None:
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(clients_service, "get_session_factory", lambda: factory)
    monkeypatch.setattr(
        clients_service, "get_settings", lambda: SimpleNamespace(trainer_id=TRAINER_ID)
    )

    first = await clients_service.register_telegram_client(901, "Клиент")
    second = await clients_service.register_telegram_client(901, "Клиент")

    async with factory() as check:
        clients = list((await check.execute(select(Client))).scalars().all())
        trainers = list((await check.execute(select(Trainer))).scalars().all())
    await engine.dispose()

    assert len(trainers) == 1
    assert len(clients) == 1
    assert first.id == second.id
    assert clients[0].trainer_id == TRAINER_ID
