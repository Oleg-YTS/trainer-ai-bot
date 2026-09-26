from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import KnowledgeItem

CATEGORIES = frozenset(
    {"training", "nutrition", "recovery", "weight_loss", "muscle_gain", "other"}
)
STATUSES = frozenset({"draft", "published", "archived"})
PUBLISHED_STATUS = "published"
ARCHIVED_STATUS = "archived"
MAX_TITLE_LENGTH = 300
DEFAULT_LIST_LIMIT = 50


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


def validate_category(category: str) -> str:
    if category not in CATEGORIES:
        raise ValueError(f"unsupported category: {category}")
    return category


def validate_status(status: str) -> str:
    if status not in STATUSES:
        raise ValueError(f"unsupported status: {status}")
    return status


def validate_title(title: str) -> str:
    clean_title = (title or "").strip()
    if not clean_title:
        raise ValueError("title is empty")
    return clean_title[:MAX_TITLE_LENGTH]


def validate_content(content: str) -> str:
    clean_content = (content or "").strip()
    if not clean_content:
        raise ValueError("content is empty")
    return clean_content


async def create_knowledge_item(
    session: AsyncSession,
    trainer_id: int,
    category: str,
    title: str,
    content: str,
    status: str = "draft",
) -> KnowledgeItem:
    item = KnowledgeItem(
        trainer_id=trainer_id,
        category=validate_category(category),
        title=validate_title(title),
        content=validate_content(content),
        status=validate_status(status),
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


async def get_knowledge_item(
    session: AsyncSession, trainer_id: int, item_id: int
) -> KnowledgeItem | None:
    result = await session.execute(
        select(KnowledgeItem).where(
            KnowledgeItem.id == item_id,
            KnowledgeItem.trainer_id == trainer_id,
        )
    )
    return result.scalar_one_or_none()


async def list_knowledge_items(
    session: AsyncSession,
    trainer_id: int,
    category: str | None = None,
    status: str | None = None,
    limit: int = DEFAULT_LIST_LIMIT,
) -> list[KnowledgeItem]:
    if limit <= 0:
        return []
    statement = select(KnowledgeItem).where(KnowledgeItem.trainer_id == trainer_id)
    if category is not None:
        statement = statement.where(KnowledgeItem.category == validate_category(category))
    if status is not None:
        statement = statement.where(KnowledgeItem.status == validate_status(status))
    statement = statement.order_by(
        KnowledgeItem.created_at.desc(), KnowledgeItem.id.desc()
    ).limit(limit)
    result = await session.execute(statement)
    return list(result.scalars())


async def update_knowledge_item(
    session: AsyncSession,
    trainer_id: int,
    item_id: int,
    *,
    category: str | None = None,
    title: str | None = None,
    content: str | None = None,
    status: str | None = None,
) -> KnowledgeItem | None:
    item = await get_knowledge_item(session, trainer_id, item_id)
    if item is None:
        return None
    if category is not None:
        item.category = validate_category(category)
    if title is not None:
        item.title = validate_title(title)
    if content is not None:
        item.content = validate_content(content)
    if status is not None:
        item.status = validate_status(status)
    await session.commit()
    await session.refresh(item)
    return item


async def archive_knowledge_item(
    session: AsyncSession, trainer_id: int, item_id: int
) -> KnowledgeItem | None:
    return await update_knowledge_item(session, trainer_id, item_id, status=ARCHIVED_STATUS)