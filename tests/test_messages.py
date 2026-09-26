import pytest

from app.clients.messages import (
    ASSISTANT_ROLE,
    MAX_MESSAGE_LENGTH,
    USER_ROLE,
    get_history,
    normalize_text,
    record_message,
    save_message,
)
from app.database.models import Message


def test_normalize_text_strips_whitespace() -> None:
    assert normalize_text("  hello  ") == "hello"


def test_normalize_text_rejects_empty_value() -> None:
    with pytest.raises(ValueError, match="is empty"):
        normalize_text("   ")


def test_normalize_text_truncates_long_value() -> None:
    assert len(normalize_text("a" * (MAX_MESSAGE_LENGTH + 50))) == MAX_MESSAGE_LENGTH


async def test_save_message_stores_user_message(session, client_id) -> None:
    message = await save_message(session, client_id, USER_ROLE, "  how many sets?  ")
    assert message.id is not None
    assert message.role == USER_ROLE
    assert message.text == "how many sets?"
    assert message.created_at is not None


async def test_save_message_rejects_unknown_role(session, client_id) -> None:
    with pytest.raises(ValueError, match="unsupported role"):
        await save_message(session, client_id, "system", "hello")


async def test_save_message_rejects_empty_text(session, client_id) -> None:
    with pytest.raises(ValueError, match="is empty"):
        await save_message(session, client_id, USER_ROLE, "  ")


async def test_get_history_returns_messages_chronologically(session, client_id) -> None:
    await save_message(session, client_id, USER_ROLE, "first")
    await save_message(session, client_id, ASSISTANT_ROLE, "second")
    await save_message(session, client_id, USER_ROLE, "third")
    history = await get_history(session, client_id)
    assert [item.text for item in history] == ["first", "second", "third"]
    assert [item.role for item in history] == [USER_ROLE, ASSISTANT_ROLE, USER_ROLE]


async def test_get_history_respects_limit_and_keeps_latest(session, client_id) -> None:
    for index in range(5):
        await save_message(session, client_id, USER_ROLE, f"message {index}")
    history = await get_history(session, client_id, limit=2)
    assert [item.text for item in history] == ["message 3", "message 4"]


async def test_get_history_returns_empty_list_for_zero_limit(session, client_id) -> None:
    await save_message(session, client_id, USER_ROLE, "hello")
    assert await get_history(session, client_id, limit=0) == []


async def test_get_history_is_scoped_to_client(session, client_id) -> None:
    await save_message(session, client_id, USER_ROLE, "mine")
    session.add(Message(client_id=client_id + 1, role=USER_ROLE, text="alien"))
    await session.commit()
    history = await get_history(session, client_id)
    assert [item.text for item in history] == ["mine"]


async def test_record_message_opens_own_session(session_factory, client_id, monkeypatch) -> None:
    monkeypatch.setattr("app.clients.messages.get_session_factory", lambda: session_factory)
    message = await record_message(client_id, USER_ROLE, "via wrapper")
    assert message.role == USER_ROLE
    async with session_factory() as check_session:
        history = await get_history(check_session, client_id)
    assert [item.text for item in history] == ["via wrapper"]
