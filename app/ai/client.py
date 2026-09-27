from openai import AsyncOpenAI, OpenAIError

from app.config.settings import get_settings


class AIRequestError(RuntimeError):
    """The AI provider request failed."""


class AIClient:
    def __init__(self) -> None:
        s = get_settings()
        self.model = s.openai_model
        self._api_key = s.openai_api_key
        self._client: AsyncOpenAI | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self.model)

    def _connect(self) -> AsyncOpenAI:
        if not self.is_configured:
            raise RuntimeError("OpenAI is not configured: set OPENAI_API_KEY and OPENAI_MODEL")
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self._api_key)
        return self._client

    async def text(self, system: str, user: str) -> str:
        try:
            response = await self._connect().responses.create(
                model=self.model,
                instructions=system,
                input=user,
            )
        except OpenAIError as exc:
            raise AIRequestError("AI provider request failed") from exc
        return response.output_text