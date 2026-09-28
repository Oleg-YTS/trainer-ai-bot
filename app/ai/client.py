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
        settings = get_settings()
        self.provider = settings.ai_provider
        self.model = settings.aitunnel_model or DEFAULT_AI_TUNNEL_MODEL
        self.base_url = normalize_base_url(settings.aitunnel_base_url)
        self._api_key = settings.aitunnel_api_key
        self._client: AsyncOpenAI | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self.model)

    def _connect(self) -> AsyncOpenAI:
        # the key is only required for a real request, not for building the settings
        if not self._api_key:
            raise AIRequestError("AI provider API key is not configured")
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self._api_key, base_url=self.base_url)
        return self._client

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
            raise AIRequestError("AI provider request failed") from exc
        choices = response.choices or []
        if not choices:
            return ""
        return choices[0].message.content or ""