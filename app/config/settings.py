from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "development"
    log_level: str = "INFO"
    telegram_bot_token: str
    openai_api_key: str
    openai_model: str = "gpt-5.6"
    database_url: str
    trainer_id: int = 1
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()
