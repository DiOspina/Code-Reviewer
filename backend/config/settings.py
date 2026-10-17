from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List, Optional
import os


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://agent_reviewer:secure_password_change_me@localhost:5432/agent_reviewer",
        validation_alias="DATABASE_URL"
    )

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")

    # AI Providers
    OPENAI_API_KEY: Optional[str] = Field(default=None, validation_alias="OPENAI_API_KEY")
    ANTHROPIC_API_KEY: Optional[str] = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL")

    # GitHub App
    GITHUB_APP_ID: Optional[int] = Field(default=None, validation_alias="GITHUB_APP_ID")
    GITHUB_APP_PRIVATE_KEY: Optional[str] = Field(default=None, validation_alias="GITHUB_APP_PRIVATE_KEY")
    GITHUB_WEBHOOK_SECRET: Optional[str] = Field(default=None, validation_alias="GITHUB_WEBHOOK_SECRET")

    # n8n
    N8N_WEBHOOK_URL: str = Field(default="http://localhost:5678/webhook/github", validation_alias="N8N_WEBHOOK_URL")

    # Notifications
    SLACK_WEBHOOK_URL: Optional[str] = Field(default=None, validation_alias="SLACK_WEBHOOK_URL")
    DISCORD_WEBHOOK_URL: Optional[str] = Field(default=None, validation_alias="DISCORD_WEBHOOK_URL")
    TELEGRAM_BOT_TOKEN: Optional[str] = Field(default=None, validation_alias="TELEGRAM_BOT_TOKEN")
    TELEGRAM_CHAT_ID: Optional[str] = Field(default=None, validation_alias="TELEGRAM_CHAT_ID")

    # Application
    LOG_LEVEL: str = Field(default="INFO", validation_alias="LOG_LEVEL")
    ENVIRONMENT: str = Field(default="development", validation_alias="ENVIRONMENT")
    SECRET_KEY: str = Field(default="your_secret_key_change_in_production", validation_alias="SECRET_KEY")
    API_V1_STR: str = Field(default="/api/v1", validation_alias="API_V1_STR")
    PROJECT_NAME: str = Field(default="Agent Reviewer", validation_alias="PROJECT_NAME")

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        validation_alias="BACKEND_CORS_ORIGINS"
    )

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = Field(default=100, validation_alias="RATE_LIMIT_REQUESTS")
    RATE_LIMIT_WINDOW: int = Field(default=60, validation_alias="RATE_LIMIT_WINDOW")

    # Analysis Settings
    MAX_FILE_SIZE_MB: int = Field(default=10, validation_alias="MAX_FILE_SIZE_MB")
    MAX_REPO_SIZE_MB: int = Field(default=500, validation_alias="MAX_REPO_SIZE_MB")
    ANALYSIS_TIMEOUT_SECONDS: int = Field(default=300, validation_alias="ANALYSIS_TIMEOUT_SECONDS")
    MAX_CONCURRENT_ANALYSES: int = Field(default=5, validation_alias="MAX_CONCURRENT_ANALYSES")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()