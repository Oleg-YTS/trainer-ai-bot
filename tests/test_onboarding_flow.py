import os
from types import SimpleNamespace

import pytest
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import Message, User

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:TEST")

from app.bot import router as bot_router
from app.bot.keyboards import (
    EDIT_PROFILE_CALLBACK,
    GENDER_CALLBACK_PREFIX,
    TOPIC_CALLBACK_PREFIX,
)
from app.bot.router import (
    AI_UNAVAILABLE_TEXT,
    NAME_INVALID_TEXT,
    NAME_QUESTION,
    TOPICS_TEXT,
    Onboarding,
)
from app.clients.onboarding import TOPICS, build_profile, validate_name

USER_PAYLOAD = {"id": 1001, "is_bot": False, "first_name": "Test", "username": "tester"}
CLIENT_ID = 7
MESSAGE_PAYLOAD = {
    "message_id": 1,
    "date": 0,
    "chat": {"id": 1001, "type": "private"},
    "from": USER_PAYLOAD,
}


def make_message(text: str | None = None) -> Message:
    return Message.model_validate({**MESSAGE_PAYLOAD, "text": text})


def make_callback(data: str, message: Message | None = None) -> SimpleNamespace:
    callback = SimpleNamespace(
        data=data,
        message=message or make_message("запрос"),
        from_user=User.model_validate(USER_PAYLOAD),
        answered=0,
    )

    async def answer(*args, **kwargs) -> None:
        callback.answered += 1

    callback.answer = answer
    return callback


def make_state() -> FSMContext:
    storage = MemoryStorage()
    return FSMContext(storage=storage, key=StorageKey(bot_id=1, chat_id=1001, user_id=1001))


@pytest.fixture
def sent(monkeypatch) -> list[tuple[str, object]]:
    calls: list[tuple[str, object]] = []

    async def fake_answer(self: Message, text: str, **kwargs) -> Message:
        calls.append((text, kwargs.get("reply_markup")))
        return self

    monkeypatch.setattr(Message, "answer", fake_answer)
    return calls


def last_text(sent: list[tuple[str, object]]) -> str:
    return sent[-1][0]


def last_keyboard(sent: list[tuple[str, object]]):
    return sent[-1][1]


def patch_client(monkeypatch, profile: dict[str, str] | None = None) -> dict:
    captured: dict = {"saved": None}

    async def fake_register(telegram_user_id: int, name: str):
        captured["registered"] = (telegram_user_id, name)
        return SimpleNamespace(id=CLIENT_ID)

    async def fake_read_profile(client_id: int | None):
        captured["read"] = client_id
        return profile or {}

    async def fake_update_profile(client_id: int, new_profile: dict[str, str]):
        captured["saved"] = (client_id, new_profile)
        return new_profile

    monkeypatch.setattr(bot_router, "register_telegram_client", fake_register)
    monkeypatch.setattr(bot_router, "read_profile", fake_read_profile)
    monkeypatch.setattr(bot_router, "update_profile", fake_update_profile)
    return captured


def patch_messages(monkeypatch) -> list[tuple[int, str, str]]:
    recorded: list[tuple[int, str, str]] = []

    async def fake_record(client_id: int, role: str, text: str) -> None:
        recorded.append((client_id, role, text))

    monkeypatch.setattr(bot_router, "record_message", fake_record)
    return recorded


def patch_ai(monkeypatch, configured: bool = True, answer: str = "Тренируйся регулярно") -> list[dict]:
    calls: list[dict] = []

    async def fake_build(orchestrator, client_id, text):
        calls.append({"client_id": client_id, "text": text})
        return answer

    monkeypatch.setattr(bot_router, "build_grounded_answer", fake_build)
    monkeypatch.setattr(
        bot_router, "get_orchestrator", lambda: SimpleNamespace(is_configured=configured)
    )
    return calls
def test_validate_name_normalizes_and_rejects_bad_input() -> None:
    assert validate_name("  Иван   Петров ") == "Иван Петров"

    for bad in ("A", "Иван123", "/start", "", "x" * 51):
        with pytest.raises(ValueError):
            validate_name(bad)


def test_build_profile_requires_known_gender() -> None:
    assert build_profile("Иван", "male") == {"name": "Иван", "gender": "male"}

    with pytest.raises(ValueError):
        build_profile("Иван", "unknown")


async def test_start_asks_name_for_new_client(monkeypatch, sent) -> None:
    patch_client(monkeypatch, profile={})
    state = make_state()

    await bot_router.start(make_message("/start"), state)

    assert NAME_QUESTION in last_text(sent)
    assert await state.get_state() == Onboarding.name.state


async def test_start_shows_topics_for_completed_profile(monkeypatch, sent) -> None:
    patch_client(monkeypatch, profile={"name": "Иван", "gender": "male"})
    state = make_state()

    await bot_router.start(make_message("/start"), state)

    assert "Иван" in last_text(sent)
    assert TOPICS_TEXT in last_text(sent)
    keyboard = last_keyboard(sent)
    assert len(keyboard.inline_keyboard) == len(TOPICS)
    assert keyboard.inline_keyboard[0][0].callback_data == f"{TOPIC_CALLBACK_PREFIX}training"
    assert await state.get_state() is None


async def test_save_name_validates_input(monkeypatch, sent) -> None:
    patch_client(monkeypatch)
    state = make_state()
    await state.set_state(Onboarding.name)

    await bot_router.save_name(make_message("Иван123"), state)

    assert last_text(sent) == NAME_INVALID_TEXT
    assert await state.get_data() == {}

    await bot_router.save_name(make_message("  Иван "), state)

    assert "Иван" in last_text(sent)
    assert (await state.get_data())["name"] == "Иван"
    gender_rows = last_keyboard(sent).inline_keyboard
    assert [row[0].callback_data for row in gender_rows] == [
        f"{GENDER_CALLBACK_PREFIX}male",
        f"{GENDER_CALLBACK_PREFIX}female",
    ]


async def test_gender_choice_saves_profile_and_shows_topics(monkeypatch, sent) -> None:
    captured = patch_client(monkeypatch)
    state = make_state()
    await state.update_data(name="Иван")
    callback = make_callback(f"{GENDER_CALLBACK_PREFIX}male")

    await bot_router.choose_gender(callback, state)

    assert captured["saved"] == (CLIENT_ID, {"name": "Иван", "gender": "male"})
    assert await state.get_state() is None
    assert callback.answered == 1
    assert "Мужской" in last_text(sent)
    assert len(last_keyboard(sent).inline_keyboard) == len(TOPICS)


async def test_gender_choice_without_name_restarts_wizard(monkeypatch, sent) -> None:
    captured = patch_client(monkeypatch)
    state = make_state()
    callback = make_callback(f"{GENDER_CALLBACK_PREFIX}male")

    await bot_router.choose_gender(callback, state)

    assert captured["saved"] is None
    assert await state.get_state() == Onboarding.name.state
    assert last_text(sent) == NAME_QUESTION


async def test_show_profile_for_completed_profile(monkeypatch, sent) -> None:
    patch_client(monkeypatch, profile={"name": "Иван", "gender": "female"})

    await bot_router.show_profile(make_message("/profile"), make_state())

    assert "Иван" in last_text(sent)
    assert "Женский" in last_text(sent)
    assert last_keyboard(sent).inline_keyboard[0][0].callback_data == EDIT_PROFILE_CALLBACK


async def test_show_profile_without_profile_asks_name(monkeypatch, sent) -> None:
    patch_client(monkeypatch, profile={})
    state = make_state()

    await bot_router.show_profile(make_message("/profile"), state)

    assert last_text(sent) == NAME_QUESTION
    assert await state.get_state() == Onboarding.name.state


async def test_edit_profile_button_restarts_wizard(monkeypatch, sent) -> None:
    patch_client(monkeypatch)
    state = make_state()
    callback = make_callback(EDIT_PROFILE_CALLBACK)

    await bot_router.edit_profile(callback, state)

    assert last_text(sent) == NAME_QUESTION
    assert await state.get_state() == Onboarding.name.state


async def test_topic_button_asks_grounded_question(monkeypatch, sent) -> None:
    patch_client(monkeypatch)
    recorded = patch_messages(monkeypatch)
    calls = patch_ai(monkeypatch, answer="Начни с трёх тренировок в неделю.")
    callback = make_callback(f"{TOPIC_CALLBACK_PREFIX}training")

    await bot_router.choose_topic(callback)

    assert callback.answered == 1
    assert calls[0]["client_id"] == CLIENT_ID
    assert recorded == [
        (CLIENT_ID, "user", calls[0]["text"]),
        (CLIENT_ID, "assistant", "Начни с трёх тренировок в неделю."),
    ]
    assert last_text(sent) == "Начни с трёх тренировок в неделю."


async def test_unknown_topic_button_is_ignored(monkeypatch, sent) -> None:
    recorded = patch_messages(monkeypatch)
    calls = patch_ai(monkeypatch)
    callback = make_callback(f"{TOPIC_CALLBACK_PREFIX}unknown")

    await bot_router.choose_topic(callback)

    assert callback.answered == 1
    assert calls == []
    assert recorded == []
    assert sent == []


async def test_plain_message_falls_back_when_ai_is_not_configured(monkeypatch, sent) -> None:
    patch_client(monkeypatch)
    recorded = patch_messages(monkeypatch)
    patch_ai(monkeypatch, configured=False)

    await bot_router.handle_message(make_message("привет"))

    assert last_text(sent) == AI_UNAVAILABLE_TEXT
    assert recorded == [(CLIENT_ID, "user", "привет")]