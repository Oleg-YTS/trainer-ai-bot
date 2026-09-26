from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import KnowledgeItem
from app.knowledge.service import PUBLISHED_STATUS, validate_category

DEFAULT_SEARCH_LIMIT = 5
MIN_TERM_LENGTH = 2
TITLE_MATCH_WEIGHT = 2
CONTENT_MATCH_WEIGHT = 1


def normalize_query(query: str) -> list[str]:
    words = (query or "").lower().split()
    return [word for word in words if len(word) >= MIN_TERM_LENGTH]


async def search_knowledge(
    session: AsyncSession,
    trainer_id: int,
    query: str,
    category: str | None = None,
    limit: int = DEFAULT_SEARCH_LIMIT,
) -> list[KnowledgeItem]:
    if limit <= 0:
        return []
    terms = normalize_query(query)
    if not terms:
        return []
    statement = select(KnowledgeItem).where(
        KnowledgeItem.trainer_id == trainer_id,
        KnowledgeItem.status == PUBLISHED_STATUS,
    )
    if category is not None:
        statement = statement.where(KnowledgeItem.category == validate_category(category))
    statement = statement.where(
        *[
            KnowledgeItem.title.ilike(f"%{term}%")
            | KnowledgeItem.content.ilike(f"%{term}%")
            for term in terms
        ]
    )
    score = sum(
        case((KnowledgeItem.title.ilike(f"%{term}%"), TITLE_MATCH_WEIGHT), else_=0)
        + case((KnowledgeItem.content.ilike(f"%{term}%"), CONTENT_MATCH_WEIGHT), else_=0)
        for term in terms
    )
    statement = statement.order_by(
        score.desc(), KnowledgeItem.created_at.desc(), KnowledgeItem.id.desc()
    ).limit(limit)
    result = await session.execute(statement)
    return list(result.scalars())