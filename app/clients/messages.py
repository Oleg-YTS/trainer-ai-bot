from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Message
from app.database.session import get_session_factory

USER_ROLE = "user"
ASSISTANT_ROLE = "assistant"
ALLOWED_ROLES = frozenset({USER_ROLE, ASSISTANT_ROLE})
MAX_MESSAGE_LENGTH = 4000
DEFAULT_HISTORY_LIMIT = 20


def normalize_text(text: str) -> str:
    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("message text is empty")
    return clean_text[:MAX_MESSAGE_LENGTH]


async def save_message(
    session: AsyncSession, client_id: int, role: str, text: str
) -> Message:
    if role not in ALLOWED_ROLES:
        raise ValueError(f"unsupported role: {role}")
    message = Message(client_id=client_id, role=role, text=normalize_text(text))
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message


async def get_history(
    session: AsyncSession, client_id: int, limit: int = DEFAULT_HISTORY_LIMIT
) -> list[Message]:
    if limit <= 0:
        return []
    statement = (
        select(Message)
        .where(Message.client_id == client_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
    )
    result = await session.execute(statement)
    return list(reversed(result.scalars().all()))


async def record_message(client_id: int, role: str, text: str) -> Message:
    async with get_session_factory()() as session:
        return await save_message(session, client_id, role, text)
