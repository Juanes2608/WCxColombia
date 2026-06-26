"""
FastAPI dependency injection — production wiring.

Primary data store: Neo4j Aura (required in production via NEO4J_URI + NEO4J_PASSWORD).
Fallback: local CSV corpus (for local dev when NEO4J_URI is empty).

The VerifyService receives ports (interfaces), not concrete adapters.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from app.adapters.audit.sha256_log import Sha256AuditLog
from app.adapters.document.pdf_adapter import PyMuPdfAdapter
from app.adapters.legislation.uk_adapter import LegislationGovUkAdapter
from app.config import get_settings
from app.ports.corpus import ICorpusRepository
from app.ports.treatment import ITreatmentRepository
from app.services.verify_service import VerifyService

logger = logging.getLogger("citationguard.deps")


def _make_corpus_adapter() -> ICorpusRepository:
    settings = get_settings()
    if settings.neo4j_configured:
        from app.adapters.neo4j.corpus_adapter import Neo4jCorpusAdapter
        logger.info("Corpus: Neo4j Aura (%s)", settings.neo4j_uri)
        return Neo4jCorpusAdapter()
    # Local CSV — only for development (set NEO4J_URI in production)
    from app.adapters.local.corpus_adapter import LocalCorpusAdapter
    logger.warning("Corpus: local CSV — Neo4j not configured (dev mode)")
    return LocalCorpusAdapter()


def _make_treatment_adapter() -> ITreatmentRepository:
    settings = get_settings()
    if settings.neo4j_configured:
        from app.adapters.neo4j.treatment_adapter import Neo4jTreatmentAdapter
        logger.info("Treatment: Neo4j Aura")
        return Neo4jTreatmentAdapter()
    from app.adapters.local.treatment_adapter import LocalTreatmentAdapter
    logger.warning("Treatment: local CSV — Neo4j not configured (dev mode)")
    return LocalTreatmentAdapter()


@lru_cache(maxsize=1)
def get_corpus_repo() -> ICorpusRepository:
    """Expose corpus adapter for routes that need it directly (e.g. /api/suggest)."""
    return _make_corpus_adapter()


@lru_cache(maxsize=1)
def get_verify_service() -> VerifyService:
    """
    Creates VerifyService once per process and caches it.
    Automatically uses Neo4j when configured, local CSV otherwise.
    """
    return VerifyService(
        corpus=_make_corpus_adapter(),
        treatment=_make_treatment_adapter(),
        statutory=LegislationGovUkAdapter(),
        ingestor=PyMuPdfAdapter(),
        audit=Sha256AuditLog(),
    )
