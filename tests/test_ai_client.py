from types import SimpleNamespace

import pytest
from openai import OpenAIError
from pydantic import ValidationError

from app.ai.client import AIClient, AIRequestError, normalize_base_url
from app.config.settings import AI_TUNNEL_PROVIDER, Settings

TEST_KEY = "unit-test-key"
BASE_URL = "https://api.aitunnel.ru/v1/"
MODEL = "gpt-6-luna-pro"


def make_settings(**overrides) -> Settings:
    values: dict = {"telegram_bot_token": "123456:TEST", "_env_file": None}
    values.update(overrides)
    return Settings(**values)


def make_create(response=None, error=None):
    async def create(**kwargs):
        create.calls.append(kwargs)
        if error is not None:
            raise error
        return response

    create.calls = []
    return create


def patch_openai(monkeypatch, settings, create) -> dict:
    monkeypatch.setattr("app.ai.client.get_settings", lambda: settings)
    captured: dict = {}

    def fake_openai(**kwargs):
        captured["init"] = kwargs
        completions = SimpleNamespace(create=create)
        return SimpleNamespace(chat=SimpleNamespace(completions=completions))

    monkeypatch.setattr("app.ai.client.AsyncOpenAI", fake_openai)
    return captured


def test_default_provider_is_ai_tunnel(monkeypatch) -> None:
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    settings = make_settings()
    assert settings.ai_provider == AI_TUNNEL_PROVIDER == "ai_tunnel"


def test_default_base_url(monkeypatch) -> None:
    monkeypatch.delenv("AITUNNEL_BASE_URL", raising=False)
    assert make_settings().aitunnel_base_url == BASE_URL


def test_default_model(monkeypatch) -> None:
    monkeypatch.delenv("AITUNNEL_MODEL", raising=False)
    assert make_settings().aitunnel_model == MODEL


def test_unknown_provider_is_rejected() -> None:
    with pytest.raises(ValidationError, match="unsupported AI provider"):
        make_settings(ai_provider="openai_direct")


def test_missing_api_key_does_not_break_settings() -> None:
    settings = make_settings()
    assert settings.aitunnel_api_key is None


def test_settings_are_loaded_without_api_key(monkeypatch) -> None:
    settings = make_settings()
    captured = patch_openai(monkeypatch, settings, make_create())

    client = AIClient()

    assert client.is_configured is False
    assert client.provider == AI_TUNNEL_PROVIDER
    assert client.model == MODEL
    assert client.base_url == BASE_URL
    assert captured == {}


async def test_request_without_api_key_raises_controlled_error(monkeypatch) -> None:
    settings = make_settings()
    captured = patch_openai(monkeypatch, settings, make_create())
    client = AIClient()

    with pytest.raises(AIRequestError) as excinfo:
        await client.text("SYSTEM", "USER")

    assert "API key is not configured" in str(excinfo.value)
    assert TEST_KEY not in str(excinfo.value)
    assert captured == {}


async def test_client_creates_openai_client_from_settings(monkeypatch) -> None:
    settings = make_settings(aitunnel_api_key=TEST_KEY)
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="hello"))])
    create = make_create(response=response)
    captured = patch_openai(monkeypatch, settings, create)

    answer = await AIClient().text("SYSTEM", "USER")

    assert captured["init"] == {"api_key": TEST_KEY, "base_url": BASE_URL}
    assert create.calls == [
        {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": "SYSTEM"},
                {"role": "user", "content": "USER"},
            ],
        }
    ]
    assert answer == "hello"


async def test_custom_base_url_is_normalized(monkeypatch) -> None:
    settings = make_settings(aitunnel_api_key=TEST_KEY, aitunnel_base_url="https://api.aitunnel.ru/v1")
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))])
    captured = patch_openai(monkeypatch, settings, make_create(response=response))

    await AIClient().text("SYSTEM", "USER")

    assert captured["init"]["base_url"] == BASE_URL
    assert normalize_base_url(None) == BASE_URL


async def test_provider_error_becomes_ai_request_error(monkeypatch) -> None:
    settings = make_settings(aitunnel_api_key=TEST_KEY)
    create = make_create(error=OpenAIError("provider is down"))
    patch_openai(monkeypatch, settings, create)

    with pytest.raises(AIRequestError, match="request failed"):
        await AIClient().text("SYSTEM", "USER")


async def test_empty_provider_content_returns_empty_text(monkeypatch) -> None:
    settings = make_settings(aitunnel_api_key=TEST_KEY)
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=None))])
    patch_openai(monkeypatch, settings, make_create(response=response))

    assert await AIClient().text("SYSTEM", "USER") == ""
async def test_empty_choices_returns_empty_text(monkeypatch) -> None:
    settings = make_settings(aitunnel_api_key=TEST_KEY)
    patch_openai(monkeypatch, settings, make_create(response=SimpleNamespace(choices=[])))
    assert await AIClient().text("SYSTEM", "USER") == ""

    patch_openai(monkeypatch, settings, make_create(response=SimpleNamespace(choices=None)))
    assert await AIClient().text("SYSTEM", "USER") == ""