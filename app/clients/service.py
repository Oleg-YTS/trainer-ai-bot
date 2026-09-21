from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Client


async def get_or_create_client(session: AsyncSession, trainer_id: int,
                                telegram_user_id: int, name: str) -> Client:
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
        await session.commit()
        await session.refresh(client)
    return client
