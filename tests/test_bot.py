from types import SimpleNamespace

from app.ai.service import AnswerUnavailable
from app.bot import router as router_module


class FakeMessage:
    def __init__(self, text: str | None) -> None:
        self.text = text
        self.answers: list[str] = []

    async def answer(self, text: str) -> None:
        self.answers.append(text)


class FakeOrchestrator:
    def __init__(self, configured: bool = True) -> None:
        self.is_configured = configured


def patch_router(
    monkeypatch, answer_text="grounded answer", error=None, client=True, configured=True
):
    stored: list[tuple[int, str, str]] = []
    pipeline: list[tuple] = []
    orchestrator = FakeOrchestrator(configured)

    async def fake_register(message):
        return SimpleNamespace(id=42) if client else None

    async def fake_record_message(client_id, role, text):
        stored.append((client_id, role, text))

    async def fake_build_grounded_answer(orch, client_id, question):
        pipeline.append((orch, client_id, question))
        if error is not None:
            raise error
        return answer_text

    monkeypatch.setattr(router_module, "register", fake_register)
    monkeypatch.setattr(router_module, "record_message", fake_record_message)
    monkeypatch.setattr(router_module, "build_grounded_answer", fake_build_grounded_answer)
    monkeypatch.setattr(router_module, "get_orchestrator", lambda: orchestrator)
    return stored, pipeline


async def test_handle_message_stores_user_and_assistant_messages(monkeypatch) -> None:
    stored, pipeline = patch_router(monkeypatch)
    message = FakeMessage("how many sets?")

    await router_module.handle_message(message)

    assert stored == [
        (42, "user", "how many sets?"),
        (42, "assistant", "grounded answer"),
    ]
    assert pipeline[0][1:] == (42, "how many sets?")
    assert message.answers == ["grounded answer"]


async def test_handle_message_sends_fallback_and_keeps_user_message_on_ai_failure(
    monkeypatch,
) -> None:
    stored, _ = patch_router(monkeypatch, error=AnswerUnavailable("AI answer is unavailable"))
    message = FakeMessage("hello")

    await router_module.handle_message(message)

    assert stored == [(42, "user", "hello")]
    assert message.answers == [router_module.AI_UNAVAILABLE_TEXT]


async def test_handle_message_skips_history_for_non_text(monkeypatch) -> None:
    stored, pipeline = patch_router(monkeypatch)

    await router_module.handle_message(FakeMessage(None))

    assert stored == []
    assert pipeline == []


async def test_handle_message_reports_unavailable_when_ai_is_not_configured(monkeypatch) -> None:
    stored, pipeline = patch_router(monkeypatch, configured=False)
    message = FakeMessage("hello")

    await router_module.handle_message(message)

    assert pipeline == []
    assert stored == [(42, "user", "hello")]
    assert message.answers == [router_module.AI_UNAVAILABLE_TEXT]


async def test_handle_message_answers_without_registered_client(monkeypatch) -> None:
    stored, pipeline = patch_router(monkeypatch, client=False)
    message = FakeMessage("hello")

    await router_module.handle_message(message)

    assert stored == []
    assert pipeline[0][1] is None
    assert message.answers == ["grounded answer"]