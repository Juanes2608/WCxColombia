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

    # Neo4j Aura
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # legislation.gov.uk
    legislation_base_url: str = "https://www.legislation.gov.uk"

    # App
    # Stored as a comma-separated string (or JSON list) — parsed by get_cors_origins()
    cors_origins: str = "http://localhost:3000"
    port: int = 8000

    # Optional: LLM (not used by core pipeline)
    anthropic_api_key: str = ""
    jus_mundi_api_key: str = ""

    # Infermatic AI (OpenAI-compatible, priority over Anthropic)
    infermatic_api_key: str = ""
    infermatic_base_url: str = "https://api.totalgpt.ai"
    infermatic_model: str = "Qwen-Qwen3.6-35B-A3B"

    # OpenRouter — Nemotron multi-agent pipeline (Steps 3-5: context extraction, comparison, alternatives)
    openrouter_api_key: str = ""
    # Nano Omni 30B — multimodal (text+image+audio), reasoning built-in; use for Agent 3 (extract)
    openrouter_nano_model: str = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
    # Super 120B MoE (12B active) — 1M context; use for Agent 4 (compare) and Agent 5 (alternatives)
    openrouter_super_model: str = "nvidia/nemotron-3-super-120b-a12b:free"
    # Ultra 550B MoE (55B active) — reserve for complex cases / demo queries
    openrouter_ultra_model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"

    def get_cors_origins(self) -> list[str]:
        """Parse cors_origins as JSON list or comma-separated string."""
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
