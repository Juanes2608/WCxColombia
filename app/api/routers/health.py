from __future__ import annotations

from fastapi import APIRouter

from app.adapters.neo4j.driver import ping as neo4j_ping

router = APIRouter(tags=["health"])


@router.get("/health", summary="Service health check")
def health() -> dict:
    """Returns service status and dependency connectivity."""
    neo4j_ok = neo4j_ping()
    return {
        "status": "ok",
        "neo4j": "connected" if neo4j_ok else "unavailable (Layer 2 degraded)",
        "legislation_gov_uk": "public API — no auth required",
    }
