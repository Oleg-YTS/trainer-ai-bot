import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    log_level: str = "INFO"
    telegram_bot_token: str
    port: int = 10000
    webhook_path: str = "/telegram/webhook"
    webhook_base_url: str | None = None
    webhook_secret_token: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    database_url: str | None = None
    trainer_id: int = 1
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def base_url(self) -> str | None:
        # Render provides RENDER_EXTERNAL_URL for web services
        return self.webhook_base_url or os.getenv("RENDER_EXTERNAL_URL")

    @property
    def webhook_url(self) -> str | None:
        base = self.base_url
        return f"{base.rstrip('/')}{self.webhook_path}" if base else None

@lru_cache
def get_settings() -> Settings:
    return Settings()
