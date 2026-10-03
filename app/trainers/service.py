from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Trainer

DEFAULT_TRAINER_NAME = "Trainer"


async def get_or_create_trainer(session: AsyncSession, trainer_id: int) -> Trainer:
    trainer = await session.get(Trainer, trainer_id)
    if trainer is not None:
        return trainer
    # telegram_user_id stays NULL: the trainer's Telegram id is not known here
    session.add(Trainer(id=trainer_id, name=DEFAULT_TRAINER_NAME))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()  # a concurrent update created the same trainer
    trainer = await session.get(Trainer, trainer_id)
    if trainer is None:
        raise RuntimeError(f"trainer {trainer_id} is not available")
    return trainer
