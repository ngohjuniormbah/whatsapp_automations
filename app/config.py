"""Application settings.

All configuration and secrets come from the environment (a local `.env`
file in development). Nothing is hardcoded — see `.env.example` for the
full list. `settings` is imported everywhere; construct it once.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_env: str = "development"

    # --- Database ---
    # Async SQLAlchemy URL. Uses the asyncpg driver.
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/wa_agent"
    )
    db_echo: bool = False

    # --- LLM (OpenRouter, OpenAI-compatible) ---
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Swap the whole brain by changing one env var.
    openrouter_model: str = "qwen/qwen3-30b-a3b"

    # --- Twilio (WhatsApp) ---
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    # The merchant-facing WhatsApp sender, e.g. "whatsapp:+14155238886"
    # (the Twilio Sandbox number in development).
    twilio_whatsapp_from: str = ""
    # Public base URL of THIS app, used to validate Twilio's signature
    # against the exact webhook URL. Set to your ngrok URL in dev.
    public_base_url: str = "http://localhost:8000"


settings = Settings()
