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

