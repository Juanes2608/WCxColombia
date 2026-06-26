from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.adapters.neo4j.driver import close_driver
from app.adapters.legislation.uk_adapter import LegislationGovUkAdapter
from app.api.routers import health, verify, suggest, graph
from app.config import get_settings

logger = logging.getLogger("citationguard")

# Common statute sections seen in High Court skeleton arguments — pre-warmed at startup
_PREWARM_SECTIONS = [
    ("ERA", 1996, "98"),
    ("SCA", 1981, "37"),
    ("HRA", 1998, "6"),
]


def _prewarm_legislation_cache() -> None:
    """Warm the module-level cache. Runs in a background thread — never blocks startup."""
    uk = LegislationGovUkAdapter()
    for act, year, section in _PREWARM_SECTIONS:
        result = uk.verify(act, year, section)
        logger.info("pre-warm legislation/%s/%d/s.%s → exists=%s", act, year, section, result.exists)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # ── Startup ──────────────────────────────────────────────────────────────
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _prewarm_legislation_cache)
    logger.info("CitationGuard startup — legislation cache pre-warm dispatched")

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    close_driver()
    logger.info("CitationGuard shutdown — Neo4j driver closed")


def create_app() -> FastAPI:
    _configure_logging()
    settings = get_settings()

    app = FastAPI(
        title="CitationGuard API",
        description=(
            "Deterministic citation integrity checker for legal documents. "
            "Layer 1 (corpus lookup) + Layer 2 (Neo4j treatment history) + "
            "Statutory verification (legislation.gov.uk)."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.get_cors_origins(),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.exception_handler(ValueError)
    async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def generic_error_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error."})

    app.include_router(verify.router)
    app.include_router(health.router)
    app.include_router(suggest.router)
    app.include_router(graph.router)

    return app


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    # Suppress noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("neo4j").setLevel(logging.WARNING)


app = create_app()
