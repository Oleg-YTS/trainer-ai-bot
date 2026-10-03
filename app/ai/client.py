import os
from openai import AsyncOpenAI, OpenAIError

from app.config.settings import (
    DEFAULT_AI_TUNNEL_BASE_URL,
    DEFAULT_AI_TUNNEL_MODEL,
    get_settings,
)


class AIRequestError(RuntimeError):
    """The AI provider request failed."""


def normalize_base_url(base_url: str | None) -> str:
    return (base_url or DEFAULT_AI_TUNNEL_BASE_URL).rstrip("/") + "/"


class AIClient:
    """Minimal OpenAI-compatible client used for the AI Tunnel provider."""

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None

    @property
    def api_key(self) -> str | None:
        settings = get_settings()
        return os.getenv("AITUNNEL_API_KEY") or os.getenv("AI_TUNNEL_API_KEY") or settings.aitunnel_api_key

    @property
    def model(self) -> str:
        settings = get_settings()
        return os.getenv("AITUNNEL_MODEL") or settings.aitunnel_model or DEFAULT_AI_TUNNEL_MODEL

    @property
    def base_url(self) -> str:
        settings = get_settings()
        return normalize_base_url(os.getenv("AITUNNEL_BASE_URL") or settings.aitunnel_base_url)

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and str(self.api_key).strip())

    def _connect(self) -> AsyncOpenAI:
        key = self.api_key
        if not key or not str(key).strip():
            raise AIRequestError("AITUNNEL_API_KEY не настроен в Environment сервиса")
        return AsyncOpenAI(api_key=str(key).strip(), base_url=self.base_url)

    async def text(self, system: str, user: str) -> str:
        client = self._connect()
        try:
            response = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
        except OpenAIError as exc:
            raise AIRequestError(f"AI provider request failed: {exc}") from exc
        choices = response.choices or []
        if not choices:
            return ""
        return choices[0].message.content or ""
