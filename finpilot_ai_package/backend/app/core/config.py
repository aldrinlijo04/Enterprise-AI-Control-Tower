from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    app_name: str = "FinPilot AI"
    app_env: str = "dev"
    app_host: str = "127.0.0.1"
    app_port: int = 8010
    finpilot_cors_origins: str = (
        "http://localhost:4200,http://127.0.0.1:4200,"
        "http://localhost:4300,http://127.0.0.1:4300"
    )

    finpilot_data_path: str = "../shared_finance_agents_database.json"
    runtime_audit_log_path: str = "./runtime_audit_log.jsonl"
    runtime_approval_queue_path: str = "./runtime_approval_queue.json"

    llm_provider: str = "groq"

    groq_api_key: str | None = None
    groq_model: str = "llama-3.1-8b-instant"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def data_path(self) -> Path:
        return Path(self.finpilot_data_path).resolve()

    @property
    def audit_log_path(self) -> Path:
        return Path(self.runtime_audit_log_path).resolve()

    @property
    def approval_queue_path(self) -> Path:
        return Path(self.runtime_approval_queue_path).resolve()

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.finpilot_cors_origins.split(",") if origin.strip()]


settings = Settings()