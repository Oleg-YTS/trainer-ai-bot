import json
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.clients.json_store import load_profile_from_json_file, save_profile_to_json_file
from app.config.settings import get_settings
from app.database.models import Client
from app.database.session import get_session_factory
from app.trainers.service import get_or_create_trainer


def build_default_profile(
    name: str,
    gender: str = "male",
    is_admin: bool = False,
    is_vip: bool = False,
    role: str | None = None
) -> dict[str, Any]:
    calculated_role = role or ("admin" if is_admin else ("vip" if is_vip else "subscriber"))
    return {
        "name": name,
        "gender": gender,
        "role": calculated_role,
        "is_admin": is_admin,
        "is_vip": is_admin or is_vip,
        "age": None,
        "height": None,
        "weight": None,
        "goal": "",
        "restrictions": "",
        "activity_level": "",
        "training_frequency": "",
        "diet_preferences": "",
    }


async def get_or_create_client(
    session: AsyncSession,
    trainer_id: int,
    telegram_user_id: int,
    name: str,
    gender: str = "male"
) -> Client:
    settings = get_settings()
    is_admin = settings.is_admin_telegram_id(telegram_user_id)
    is_vip = is_admin

    result = await session.execute(
        select(Client).where(Client.telegram_user_id == telegram_user_id)
    )
    client = result.scalar_one_or_none()

    if client is None:
        default_prof = build_default_profile(name=name, gender=gender, is_admin=is_admin, is_vip=is_vip)
        client = Client(
            trainer_id=trainer_id,
            telegram_user_id=telegram_user_id,
            name=name,
            profile_json=json.dumps(default_prof, ensure_ascii=False),
        )
        session.add(client)
        await session.commit()
        await session.refresh(client)
        save_profile_to_json_file(client.id, default_prof)
    elif name and client.name != name:
        client.name = name
        await session.commit()

    return client


async def register_telegram_client(telegram_user_id: int, name: str, gender: str = "male") -> Client:
    settings = get_settings()
    async with get_session_factory()() as session:
        trainer = await get_or_create_trainer(session, settings.trainer_id)
        return await get_or_create_client(session, trainer.id, telegram_user_id, name, gender)


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
        stmt = select(Client).where((Client.id == client_id) | (Client.telegram_user_id == client_id))
        res = await session.execute(stmt)
        client = res.scalar_one_or_none()
        
        if client is not None:
            prof = parse_profile(client.profile_json)
            if prof:
                save_profile_to_json_file(client.id, prof)
                return prof
        
        json_file_prof = load_profile_from_json_file(client_id)
        if json_file_prof:
            return json_file_prof
        return {}


async def update_profile(client_id: int, profile: dict[str, Any]) -> dict[str, Any]:
    async with get_session_factory()() as session:
        stmt = select(Client).where((Client.id == client_id) | (Client.telegram_user_id == client_id))
        res = await session.execute(stmt)
        client = res.scalar_one_or_none()
        
        settings = get_settings()

        if client is None:
            trainer = await get_or_create_trainer(session, settings.trainer_id)
            initial_name = profile.get("name") or f"Пользователь #{client_id}"
            is_admin = settings.is_admin_telegram_id(client_id) or bool(profile.get("is_admin", False))
            is_vip = is_admin or bool(profile.get("is_vip", False))

            base_prof = build_default_profile(
                name=initial_name,
                gender=profile.get("gender", "male"),
                is_admin=is_admin,
                is_vip=is_vip
            )
            base_prof.update({k: v for k, v in profile.items() if v is not None})

            client = Client(
                trainer_id=trainer.id,
                telegram_user_id=client_id,
                name=initial_name,
                profile_json=json.dumps(base_prof, ensure_ascii=False)
            )
            session.add(client)
            await session.commit()
            await session.refresh(client)
            updated_prof = base_prof
        else:
            existing = parse_profile(client.profile_json)
            if not existing:
                existing = build_default_profile(
                    name=client.name,
                    is_admin=settings.is_admin_telegram_id(client.telegram_user_id)
                )

            existing.update({k: v for k, v in profile.items() if v is not None})

            if profile.get("name"):
                client.name = profile["name"]

            client.profile_json = json.dumps(existing, ensure_ascii=False)
            await session.commit()
            updated_prof = existing

        save_profile_to_json_file(client.id, updated_prof)
        return updated_prof
