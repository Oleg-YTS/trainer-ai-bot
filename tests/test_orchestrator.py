from types import SimpleNamespace

import pytest

from app.ai.orchestrator import AIOrchestrator
from app.ai.prompt import build_system_prompt
from app.database.models import KnowledgeItem, Message


def make_orchestrator(monkeypatch, raw: str):
    monkeypatch.setattr(
        "app.ai.client.get_settings",
        lambda: SimpleNamespace(
            ai_provider="ai_tunnel",
            aitunnel_api_key="unit-test-key",
            aitunnel_base_url="https://api.aitunnel.ru/v1/",
            aitunnel_model="gpt-6-luna-pro",
        ),
    )
    orchestrator = AIOrchestrator()
    calls: list[tuple[str, str]] = []

    async def fake_text(system: str, user: str) -> str:
        calls.append((system, user))
        return raw

    orchestrator.ai.text = fake_text
    return orchestrator, calls


async def test_answer_sends_grounded_prompt(monkeypatch) -> None:
    orchestrator, calls = make_orchestrator(
        monkeypatch, '{"answer": "do three sets", "needs_trainer": false}'
    )
    item = KnowledgeItem(
        id=5, trainer_id=1, category="training", title="Squat guide",
        content="depth below parallel", status="published",
    )
    history = [Message(id=1, client_id=1, role="user", text="earlier question")]

    answer = await orchestrator.answer("how many sets?", {"age": 30}, [item], history)

    system, user = calls[0]
    assert system == build_system_prompt()
    assert "CLIENT PROFILE" in user
    assert "age: 30" in user
    assert "title: Squat guide" in user
    assert "user: earlier question" in user
    assert user.endswith("how many sets?")
    assert answer.answer == "do three sets"


def test_orchestrator_exposes_configuration_state(monkeypatch) -> None:
    orchestrator, _ = make_orchestrator(monkeypatch, "{}")
    assert orchestrator.is_configured is True


async def test_classify_passes_allowed_categories(monkeypatch) -> None:
    orchestrator, calls = make_orchestrator(
        monkeypatch, '{"category": "nutrition", "intent": "question"}'
    )

    classification = await orchestrator.classify("what should I eat?")

    assert classification.category == "nutrition"
    assert "Allowed categories" in calls[0][1]


async def test_answer_rejects_malformed_json(monkeypatch) -> None:
    orchestrator, _ = make_orchestrator(monkeypatch, "not json")

    with pytest.raises(ValueError):
        await orchestrator.answer("hello", {}, [], [])