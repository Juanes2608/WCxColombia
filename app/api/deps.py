"""
FastAPI dependency injection.

Adapter selection:
  - NEO4J_URI configured → Neo4j is ALWAYS the primary data store.
    If Neo4j becomes unreachable at runtime (ServiceUnavailable), the
    FallbackCorpusAdapter / FallbackTreatmentAdapter transparently falls
    back to the local CSV corpus so the service never returns a hard error.
  - NEO4J_URI NOT configured → CSV-only (local dev / offline mode, warns loudly).

The VerifyService receives port interfaces, not concrete adapters.
"""
from __future__ import annotations

import logging

from neo4j import exceptions as neo4j_exc

from app.adapters.audit.sha256_log import Sha256AuditLog
from app.adapters.document.pdf_adapter import PyMuPdfAdapter
from app.adapters.legislation.uk_adapter import LegislationGovUkAdapter
from app.config import get_settings
from app.ports.corpus import CaseNode, ICorpusRepository, Passage, SuggestionResult
from app.ports.treatment import ITreatmentRepository, TreatmentHistory
from app.services.verify_service import VerifyService

logger = logging.getLogger("traceit.deps")

_NEO4J_DOWN_ERRORS = (
    neo4j_exc.ServiceUnavailable,
    neo4j_exc.AuthError,
    neo4j_exc.SessionExpired,
)


# ── Fallback wrappers ─────────────────────────────────────────────────────────

class FallbackCorpusAdapter(ICorpusRepository):
    """
    Tries Neo4j first; falls back to local CSV on ServiceUnavailable.
    find_passages always goes to Neo4j only (CSV has no judgment text — [] is correct).
    find_suggestions falls back to CSV keyword search when Neo4j is down.
    """

    def __init__(self, primary: ICorpusRepository, fallback: ICorpusRepository) -> None:
        self._primary  = primary
        self._fallback = fallback

    def lookup(self, citation_fragment: str) -> CaseNode | None:
        try:
            return self._primary.lookup(citation_fragment)
        except _NEO4J_DOWN_ERRORS:
            logger.warning("Neo4j down — corpus lookup falling back to CSV")
            return self._fallback.lookup(citation_fragment)

    def get_misapplied_table(self) -> dict[str, str]:
        try:
            return self._primary.get_misapplied_table()
        except _NEO4J_DOWN_ERRORS:
            logger.warning("Neo4j down — misapplied table falling back to CSV")
            return self._fallback.get_misapplied_table()

    def find_passages(self, node_id: str) -> list[Passage]:
        # CSV has no judgment text — no fallback needed, [] is honest
        try:
            return self._primary.find_passages(node_id)
        except _NEO4J_DOWN_ERRORS:
            logger.warning("Neo4j down — find_passages returns [] (no CSV fallback for passages)")
            return []

    def find_suggestions(
        self,
        proposition: str,
        brief_context: str,
        domain: str | None = None,
        limit: int = 6,
        exclude_node_id: str | None = None,
    ) -> list[SuggestionResult]:
        try:
            results = self._primary.find_suggestions(
                proposition, brief_context, domain, limit, exclude_node_id
            )
        except _NEO4J_DOWN_ERRORS:
            logger.warning("Neo4j down — find_suggestions falling back to CSV keyword search")
            return self._fallback.find_suggestions(
                proposition, brief_context, domain, limit, exclude_node_id
            )

        if results:
            return results

        logger.info("Neo4j find_suggestions returned empty — trying CSV for proposition '%s'", proposition[:60])
        return self._fallback.find_suggestions(
            proposition, brief_context, domain, limit, exclude_node_id
        )


class FallbackTreatmentAdapter(ITreatmentRepository):
    """
    Tries Neo4j first; falls back to local CSV treatment on ServiceUnavailable.
    """

    def __init__(self, primary: ITreatmentRepository, fallback: ITreatmentRepository) -> None:
        self._primary  = primary
        self._fallback = fallback

    def get_history(self, node_id: str) -> TreatmentHistory:
        try:
            return self._primary.get_history(node_id)
        except _NEO4J_DOWN_ERRORS:
            logger.warning("Neo4j down — treatment history falling back to CSV")
            return self._fallback.get_history(node_id)


# ── Adapter construction ──────────────────────────────────────────────────────

def _make_corpus_adapter() -> ICorpusRepository:
    settings = get_settings()
    if settings.neo4j_configured:
        from app.adapters.local.corpus_adapter import LocalCorpusAdapter
        from app.adapters.neo4j.corpus_adapter import Neo4jCorpusAdapter
        logger.info("Corpus adapter: Neo4j Aura (primary) + CSV (emergency fallback)")
        return FallbackCorpusAdapter(Neo4jCorpusAdapter(), LocalCorpusAdapter())

    from app.adapters.local.corpus_adapter import LocalCorpusAdapter
    logger.warning(
        "NEO4J_URI not configured — using CSV corpus only (offline/dev mode). "
        "Set NEO4J_URI and NEO4J_PASSWORD to use the production graph."
    )
    return LocalCorpusAdapter()


def _make_treatment_adapter() -> ITreatmentRepository:
    settings = get_settings()
    if settings.neo4j_configured:
        from app.adapters.local.treatment_adapter import LocalTreatmentAdapter
        from app.adapters.neo4j.treatment_adapter import Neo4jTreatmentAdapter
        logger.info("Treatment adapter: Neo4j Aura (primary) + CSV (emergency fallback)")
        return FallbackTreatmentAdapter(Neo4jTreatmentAdapter(), LocalTreatmentAdapter())

    from app.adapters.local.treatment_adapter import LocalTreatmentAdapter
    logger.warning("Treatment adapter: local CSV (offline/dev mode)")
    return LocalTreatmentAdapter()


# ── FastAPI dependencies (cached per process) ─────────────────────────────────

_corpus_repo:    ICorpusRepository | None  = None
_verify_service: VerifyService | None      = None


def get_corpus_repo() -> ICorpusRepository:
    global _corpus_repo
    if _corpus_repo is None:
        _corpus_repo = _make_corpus_adapter()
    return _corpus_repo


def get_verify_service() -> VerifyService:
    global _verify_service
    if _verify_service is None:
        _verify_service = VerifyService(
            corpus=get_corpus_repo(),
            treatment=_make_treatment_adapter(),
            statutory=LegislationGovUkAdapter(),
            ingestor=PyMuPdfAdapter(),
            audit=Sha256AuditLog(),
        )
    return _verify_service
