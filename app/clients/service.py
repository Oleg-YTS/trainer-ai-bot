import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import get_settings
from app.database.models import Client
from app.database.session import get_session_factory
from app.trainers.service import get_or_create_trainer


async def get_or_create_client(
    session: AsyncSession, trainer_id: int, telegram_user_id: int, name: str
) -> Client:
    result = await session.execute(
        select(Client).where(Client.telegram_user_id == telegram_user_id)
    )
    client = result.scalar_one_or_none()
    if client is None:
        client = Client(
            trainer_id=trainer_id,
            telegram_user_id=telegram_user_id,
            name=name,
            profile_json="{}",
        )
        session.add(client)
    elif name and client.name != name:
        client.name = name
    await session.commit()
    await session.refresh(client)
    return client


async def register_telegram_client(telegram_user_id: int, name: str) -> Client:
    settings = get_settings()
    async with get_session_factory()() as session:
        trainer = await get_or_create_trainer(session, settings.trainer_id)
        return await get_or_create_client(session, trainer.id, telegram_user_id, name)


def parse_profile(profile_json: str | None) -> dict[str, Any]:
    try:
        profile = json.loads(profile_json or "{}")
    except (TypeError, ValueError):
        return {}
    return profile if isinstance(profile, dict) else {}


async def read_profile(client_id: int | None) -> dict[str, Any]:
    if client_id is None:
        return {}
    async with get_session_factory()() as session:
        client = await session.get(Client, client_id)
        return parse_profile(client.profile_json if client is not None else None)


async def update_profile(client_id: int, profile: dict[str, Any]) -> dict[str, Any]:
    async with get_session_factory()() as session:
        client = await session.get(Client, client_id)
        if client is None:
            settings = get_settings()
            trainer = await get_or_create_trainer(session, settings.trainer_id)
            client = Client(
                trainer_id=trainer.id,
                telegram_user_id=client_id,
                name=profile.get("name") or f"Пользователь #{client_id}",
                profile_json="{}"
            )
            session.add(client)
            await session.commit()
            await session.refresh(client)

        existing = parse_profile(client.profile_json)
        existing.update({k: v for k, v in profile.items() if v is not None})
        client.profile_json = json.dumps(existing, ensure_ascii=False)
        await session.commit()
        return parse_profile(client.profile_json)

