"""
FastAPI dependency injection.

Adapter selection strategy (no hardcoded values):
  - If NEO4J_URI + NEO4J_PASSWORD are set → use Neo4j Aura adapters (production)
  - Otherwise → use local CSV adapters (local dev / demo without cloud)

The VerifyService receives ports (interfaces), not concrete adapters.
Swapping Neo4j for local adapters requires zero changes to the service or domain.
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

logger = logging.getLogger("traceit.deps")


def _make_corpus_adapter() -> ICorpusRepository:
    settings = get_settings()
    if settings.neo4j_configured:
        from app.adapters.neo4j.corpus_adapter import Neo4jCorpusAdapter
        logger.info("Corpus adapter: Neo4j Aura (%s)", settings.neo4j_uri)
        return Neo4jCorpusAdapter()
    from app.adapters.local.corpus_adapter import LocalCorpusAdapter
    logger.info("Corpus adapter: local CSV (Neo4j not configured)")
    return LocalCorpusAdapter()


def _make_treatment_adapter() -> ITreatmentRepository:
    settings = get_settings()
    if settings.neo4j_configured:
        from app.adapters.neo4j.treatment_adapter import Neo4jTreatmentAdapter
        logger.info("Treatment adapter: Neo4j Aura")
        return Neo4jTreatmentAdapter()
    from app.adapters.local.treatment_adapter import LocalTreatmentAdapter
    logger.info("Treatment adapter: local CSV")
    return LocalTreatmentAdapter()


@lru_cache(maxsize=1)
def get_corpus_repo() -> ICorpusRepository:
    """Expose corpus adapter for routes that need it directly (e.g. /api/suggest)."""
    return _make_corpus_adapter()


@lru_cache(maxsize=1)
def get_verify_service() -> VerifyService:
    """
    Creates VerifyService once per process and caches it.
    Reuses get_corpus_repo() so corpus CSV is loaded only once across all routes.
    """
    return VerifyService(
        corpus=get_corpus_repo(),
        treatment=_make_treatment_adapter(),
        statutory=LegislationGovUkAdapter(),
        ingestor=PyMuPdfAdapter(),
        audit=Sha256AuditLog(),
    )
