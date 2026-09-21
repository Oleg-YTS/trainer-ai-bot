from openai import AsyncOpenAI
from app.config.settings import get_settings

class AIClient:
    def __init__(self) -> None:
        s = get_settings()
        self.client = AsyncOpenAI(api_key=s.openai_api_key)
        self.model = s.openai_model

    async def text(self, system: str, user: str) -> str:
        response = await self.client.responses.create(
            model=self.model,
            instructions=system,
            input=user,
        )
        return response.output_text
