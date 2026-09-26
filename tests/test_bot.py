from types import SimpleNamespace

from app.bot import router as router_module


class FakeMessage:
    def __init__(self, text: str | None) -> None:
        self.text = text
        self.answers: list[str] = []

    async def answer(self, text: str) -> None:
        self.answers.append(text)


class FakeOrchestrator:
    is_configured = True

    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def classify(self, question: str):
        return SimpleNamespace(category="training", intent="question")

    async def answer(self, question, classification, client_context, knowledge_context):
        self.calls.append((question, client_context, knowledge_context))
        return SimpleNamespace(answer="answer text")


async def test_handle_message_stores_user_and_assistant_messages(monkeypatch) -> None:
    stored: list[tuple[int, str, str]] = []

    async def fake_register(message):
        return SimpleNamespace(id=42)

    async def fake_record_message(client_id, role, text):
        stored.append((client_id, role, text))

    orchestrator = FakeOrchestrator()
    monkeypatch.setattr(router_module, "register", fake_register)
    monkeypatch.setattr(router_module, "record_message", fake_record_message)
    monkeypatch.setattr(router_module, "get_orchestrator", lambda: orchestrator)
    message = FakeMessage("how many sets?")

    await router_module.handle_message(message)

    assert stored == [
        (42, "user", "how many sets?"),
        (42, "assistant", "answer text"),
    ]
    assert message.answers == ["answer text"]
    assert orchestrator.calls[0][1] == "No structured client profile is available yet."


async def test_handle_message_skips_history_for_non_text(monkeypatch) -> None:
    stored: list[tuple[int, str, str]] = []

    async def fake_register(message):
        return SimpleNamespace(id=42)

    async def fake_record_message(client_id, role, text):
        stored.append((client_id, role, text))

    monkeypatch.setattr(router_module, "register", fake_register)
    monkeypatch.setattr(router_module, "record_message", fake_record_message)
    monkeypatch.setattr(router_module, "get_orchestrator", FakeOrchestrator)

    await router_module.handle_message(FakeMessage(None))

    assert stored == []


async def test_handle_message_keeps_working_when_history_save_fails(monkeypatch) -> None:
    async def fake_register(message):
        return SimpleNamespace(id=42)

    async def failing_record_message(client_id, role, text):
        raise RuntimeError("database is down")

    orchestrator = FakeOrchestrator()
    monkeypatch.setattr(router_module, "register", fake_register)
    monkeypatch.setattr(router_module, "record_message", failing_record_message)
    monkeypatch.setattr(router_module, "get_orchestrator", lambda: orchestrator)
    message = FakeMessage("hello")

    await router_module.handle_message(message)

    assert message.answers == ["answer text"]
