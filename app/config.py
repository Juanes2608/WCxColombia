from __future__ import annotations

import json
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Neo4j Aura (primary data store — always used when configured)
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # App
    cors_origins: str = "http://localhost:3000"
    port: int = 8000

    # legislation.gov.uk (statutory verification)
    legislation_base_url: str = "https://www.legislation.gov.uk"

    # ── Agent LLM providers ───────────────────────────────────────────────────
    # All three run full agentic tool-calling loops (multi-turn).
    # Provider chain: Claude → Groq → NVIDIA (first available wins per citation).

    # Provider 1: Anthropic Claude Haiku (native tool calling, ~$0.004/citation)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5"

    # Provider 2: Groq LLaMA (OpenAI-compatible, fast, free tier)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Provider 3: NVIDIA NIM (OpenAI-compatible, LLaMA 70B)
    nvidia_api_key: str = ""
    nvidia_model: str = "meta/llama-3.3-70b-instruct"

    def get_cors_origins(self) -> list[str]:
        v = self.cors_origins.strip()
        if v.startswith("["):
            return json.loads(v)
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    @property
    def neo4j_configured(self) -> bool:
        return bool(self.neo4j_uri and self.neo4j_password)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
