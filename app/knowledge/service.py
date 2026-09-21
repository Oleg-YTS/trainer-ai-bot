from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.models import KnowledgeItem

async def get_approved_knowledge(session: AsyncSession, trainer_id: int, category: str):
    result = await session.execute(
        select(KnowledgeItem)
        .where(
            KnowledgeItem.trainer_id == trainer_id,
            KnowledgeItem.category == category,
            KnowledgeItem.status == "approved",
        )
        .order_by(KnowledgeItem.id.desc())
        .limit(20)
    )
    return list(result.scalars())
