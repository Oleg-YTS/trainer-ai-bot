import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AI_TUNNEL_PROVIDER = "ai_tunnel"
SUPPORTED_AI_PROVIDERS = (AI_TUNNEL_PROVIDER,)
DEFAULT_AI_TUNNEL_BASE_URL = "https://api.aitunnel.ru/v1/"
DEFAULT_AI_TUNNEL_MODEL = "gpt-6-luna-pro"


class Settings(BaseSettings):
    app_env: str = "development"
    log_level: str = "INFO"
    telegram_bot_token: str
    port: int = 10000
    webhook_path: str = "/telegram/webhook"
    webhook_base_url: str | None = None
    webhook_secret_token: str | None = None
    ai_provider: str = AI_TUNNEL_PROVIDER
    aitunnel_api_key: str | None = None
    aitunnel_base_url: str = DEFAULT_AI_TUNNEL_BASE_URL
    aitunnel_model: str = DEFAULT_AI_TUNNEL_MODEL
    openai_api_key: str | None = None
    openai_model: str | None = None
    database_url: str | None = None
    trainer_id: int = 1
    telegram_admin_chat_id: str | None = None
    admin_telegram_ids: str | None = None
    trainer_telegram_id: int | None = None
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def is_admin_telegram_id(self, tg_id: int | None) -> bool:
        if not tg_id:
            return False
        admin_list: list[str] = []
        if self.telegram_admin_chat_id:
            admin_list.extend([x.strip() for x in str(self.telegram_admin_chat_id).split(",") if x.strip()])
        if self.admin_telegram_ids:
            admin_list.extend([x.strip() for x in str(self.admin_telegram_ids).split(",") if x.strip()])
        if self.trainer_telegram_id:
            admin_list.append(str(self.trainer_telegram_id))
        
        # If no explicit admin ID configured, allow fallback to trainer_id 1
        if not admin_list:
            return False
        return str(tg_id) in admin_list

    @field_validator("ai_provider")
    @classmethod
    def check_ai_provider(cls, value: str) -> str:
        provider = (value or "").strip()
        if provider not in SUPPORTED_AI_PROVIDERS:
            supported = ", ".join(SUPPORTED_AI_PROVIDERS)
            raise ValueError(f"unsupported AI provider [{provider}]; supported: {supported}")
        return provider

    @property
    def base_url(self) -> str | None:
        # Render provides RENDER_EXTERNAL_URL for web services
        return self.webhook_base_url or os.getenv("RENDER_EXTERNAL_URL")

    @property
    def webhook_url(self) -> str | None:
        base = self.base_url
        if not base:
            return None
        return base.rstrip("/") + self.webhook_path


@lru_cache
def get_settings() -> Settings:
    return Settings()

