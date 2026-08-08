"""Application configuration — all via environment variables.

Supports both local dev and cloud deployment (AWS/Supabase).
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database — Supabase provides postgres, or use AWS RDS
    # Supabase: postgresql+psycopg2://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
    # AWS RDS:  postgresql+psycopg2://[USER]:[PASS]@[RDS-ENDPOINT]:5432/scanner_dashboard
    database_url: str = "postgresql+psycopg2://scanner:scanner@localhost:5432/scanner_dashboard"

    # Redis — AWS ElastiCache or Upstash (serverless Redis)
    # Upstash:  redis://default:[PASSWORD]@[UPSTASH-ENDPOINT]:6379
    # ElastiCache: redis://[ELASTICACHE-ENDPOINT]:6379
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-this-to-a-random-64-char-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days

    # Scanner-v3 path (relative to backend/ or absolute)
    # Local dev: ../../scanner-v3
    # Docker:    /scanner-v3
    # AWS/Cloud: /opt/scanner-v3 (EC2) or mount path
    scanner_v3_path: str = "../../scanner-v3"

    # PEAD scanner path (earnings-momentum-scanner)
    # Local dev: ../../earnings-momentum-scanner
    # Docker:    /earnings-momentum-scanner
    pead_scanner_path: str = "../../earnings-momentum-scanner"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Telegram (optional)
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
