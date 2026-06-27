"""
VerifyService — single orchestration point for the citation check pipeline.

Layer 1 (deterministic):
  regex extraction → corpus lookup → FABRICATED / MISAPPLIED / VERIFIED

Layer 2 (Neo4j, graceful degradation):
  treatment history → OVERRULED / DISTINGUISHED / GOOD_LAW / UNAVAILABLE

Statutory verification (legislation.gov.uk, graceful degradation):
  section exists check → exists True/False/None

Case-law citations are verified in parallel (ThreadPoolExecutor, max 4 workers)
to reduce wall-clock time from ~3 min → ~40 s for a 12-citation document.

The service depends exclusively on port interfaces (ABCs).
It has no direct knowledge of Neo4j, httpx, or FastAPI.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from app.domain.citation_extractor import extract_citations
from app.domain.models import (
    AlternativeSuggestion,
    CitationResult,
    ContextAnalysis,
    CorpusSource,
    Layer1Result,
    Layer1Verdict,
    Layer2Result,
    Layer2Verdict,
    StatutoryResult,
    VerifyResult,
)
from app.domain.risk_calculator import compute_financial_summary
from app.adapters.llm.claude_client import generate_explanation
from app.domain.verdict_engine import compute_layer1
from app.ports.audit import IAuditLog
from app.ports.corpus import ICorpusRepository
from app.ports.document import IDocumentIngestor
from app.ports.statutory import IStatutoryVerifier
from app.ports.treatment import ITreatmentRepository

logger = logging.getLogger("traceit.service")

# ── In-memory result store for GET /api/report/{matter_id} ───────────────────
_result_store: dict[str, VerifyResult] = {}
_store_lock = threading.Lock()
_MAX_STORED = 100  # keep last N results to avoid unbounded memory growth


def get_stored_result(matter_id: str) -> VerifyResult | None:
    with _store_lock:
        return _result_store.get(matter_id)


def _store_result(matter_id: str, result: VerifyResult) -> None:
    with _store_lock:
        _result_store[matter_id] = result
        if len(_result_store) > _MAX_STORED:
            oldest = next(iter(_result_store))
            del _result_store[oldest]


# ── Parallel worker limit ─────────────────────────────────────────────────────
# 4 concurrent agent calls: balances speed vs OpenRouter rate limits.
_AGENT_WORKERS = 4


@dataclass
class VerifyService:
    corpus:    ICorpusRepository
    treatment: ITreatmentRepository
    statutory: IStatutoryVerifier
    ingestor:  IDocumentIngestor
    audit:     IAuditLog

    def run(self, pdf_bytes: bytes, filename: str) -> VerifyResult:
        t0 = time.monotonic()
        matter_id = str(uuid.uuid4())

        # 1. Ingest document
        doc = self.ingestor.extract(pdf_bytes, filename)
        self.audit.record("ingest", matter_id, [
            f"source_type={doc.source_type}",
            f"confidence={doc.confidence:.2f}",
            f"chars={len(doc.text)}",
        ])

        if doc.source_type == "needs_human":
            result = VerifyResult(
                matter_id=matter_id,
                total_citations=0,
                results=[],
                financial=compute_financial_summary([]),
                processing_ms=int((time.monotonic() - t0) * 1000),
                audit_trail_hash=self.audit.digest(),
            )
            _store_result(matter_id, result)
            return result

        # 2. Extract citations (deterministic regex)
        extracted = extract_citations(doc.text)
        self.audit.record("extract", matter_id, [c.raw_text for c in extracted])

        # 3. Load MISAPPLIED table once (read-only — safe across threads)
        misapplied_table = self.corpus.get_misapplied_table()

        # 4. Classify: statutes inline, case-law in parallel
        ordered: dict[int, CitationResult] = {}
        audit_msgs: dict[int, str] = {}

        # ── 4a. Statute citations (fast, no LLM) ─────────────────────────────
        for idx, cit in enumerate(extracted):
            if cit.citation_type != "statute":
                continue
            lookup = self.statutory.verify_from_text(cit.raw_text)
            if lookup:
                statutory = StatutoryResult(
                    act=lookup.act,
                    year=lookup.year,
                    section=lookup.section,
                    exists=lookup.exists,
                    api_status=lookup.status_code,
                    excerpt=lookup.excerpt,
                    source_url=lookup.url,
                )
                layer1 = _statute_layer1(cit.raw_text, lookup)
            else:
                statutory = None
                layer1 = Layer1Result(
                    verdict=Layer1Verdict.FABRICATED,
                    confidence=1.0,
                    explanation="Statute citation could not be parsed or verified.",
                )
            layer2 = Layer2Result(verdict=Layer2Verdict.NOT_CHECKED, source="not_applicable")
            ordered[idx] = CitationResult(
                raw_text=cit.raw_text,
                layer1=layer1,
                layer2=layer2,
                statutory=statutory,
                context_analysis=None,
            )
            audit_msgs[idx] = f"{cit.raw_text}:{layer1.verdict}"

        # ── 4b. Case-law citations (parallel agents) ──────────────────────────
        case_indices = {
            idx: cit for idx, cit in enumerate(extracted)
            if cit.citation_type != "statute"
        }

        if case_indices and _nemotron_enabled():
            with ThreadPoolExecutor(max_workers=_AGENT_WORKERS) as pool:
                future_to_idx = {
                    pool.submit(
                        _run_agent,
                        cit.raw_text,
                        doc.text,
                        self.corpus,
                        self.treatment,
                    ): idx
                    for idx, cit in case_indices.items()
                }
                for future in as_completed(future_to_idx):
                    idx = future_to_idx[future]
                    cit = case_indices[idx]
                    agent_verdict = future.result()

                    if agent_verdict is not None:
                        layer1, layer2, context_analysis = _agent_verdict_to_layers(
                            agent_verdict, cit.raw_text
                        )
                        if layer1.verdict != Layer1Verdict.VERIFIED:
                            llm_text = generate_explanation(
                                verdict=layer1.verdict.value,
                                citation=cit.raw_text,
                                proposition_cited=layer1.proposition_cited,
                                proposition_actual=layer1.proposition_actual,
                            )
                            if llm_text:
                                layer1.llm_explanation = llm_text
                        # Attach corpus provenance (None for FABRICATED)
                        corpus_source = None
                        if layer1.verdict != Layer1Verdict.FABRICATED:
                            node = self.corpus.lookup(cit.raw_text)
                            corpus_source = _node_to_source(node)
                        ordered[idx] = CitationResult(
                            raw_text=cit.raw_text,
                            corpus_source=corpus_source,
                            layer1=layer1,
                            layer2=layer2,
                            statutory=None,
                            context_analysis=context_analysis,
                        )
                        audit_msgs[idx] = (
                            f"{cit.raw_text}:{layer1.verdict}"
                            f" (agent:{agent_verdict.turns_used}t)"
                        )
                    else:
                        # Agent failed → deterministic fallback for this citation
                        ordered[idx], audit_msgs[idx] = _deterministic_fallback(
                            cit.raw_text, self.corpus, self.treatment, misapplied_table
                        )

        # Deterministic fallback for any case-law not yet resolved
        # (happens when Nemotron is not configured)
        for idx, cit in case_indices.items():
            if idx not in ordered:
                ordered[idx], audit_msgs[idx] = _deterministic_fallback(
                    cit.raw_text, self.corpus, self.treatment, misapplied_table
                )

        # 5. Reconstruct ordered results + audit
        citation_results: list[CitationResult] = []
        for idx in range(len(extracted)):
            self.audit.record("citation_check", matter_id, [audit_msgs[idx]])
            citation_results.append(ordered[idx])

        # 6. Financial summary (deterministic)
        financial = compute_financial_summary(citation_results)
        elapsed_ms = int((time.monotonic() - t0) * 1000)

        result = VerifyResult(
            matter_id=matter_id,
            total_citations=len(citation_results),
            results=citation_results,
            financial=financial,
            processing_ms=elapsed_ms,
            audit_trail_hash=self.audit.digest(),
        )
        _store_result(matter_id, result)
        return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _nemotron_enabled() -> bool:
    from app.config import get_settings
    return bool(get_settings().openrouter_api_key)


def _run_agent(
    citation: str,
    doc_text: str,
    corpus: "ICorpusRepository",
    treatment: "ITreatmentRepository",
) -> "AgentVerdict | None":
    """Run CitationAgent with Nemotron primary + Infermatic fallback. Thread-safe."""
    try:
        from app.agents.citation_agent import run_citation_agent
        from app.agents.tools import ToolExecutor
        from app.config import get_settings
        s = get_settings()
        executor = ToolExecutor(corpus=corpus, treatment=treatment, doc_text=doc_text)
        return run_citation_agent(
            citation           = citation,
            doc_text           = doc_text,
            executor           = executor,
            api_key            = s.openrouter_api_key,
            model              = s.openrouter_super_model,
            infermatic_api_key = s.infermatic_api_key,
            infermatic_model   = s.infermatic_model,
        )
    except Exception as exc:
        logger.warning("Agent failed for '%s': %s", citation[:50], exc)
        return None


def _deterministic_fallback(
    raw_text: str,
    corpus: "ICorpusRepository",
    treatment: "ITreatmentRepository",
    misapplied_table: dict,
) -> "tuple[CitationResult, str]":
    """Corpus-only verdict — used when agent is unavailable or failed."""
    corpus_node = corpus.lookup(raw_text)
    layer1 = compute_layer1(raw_text, corpus_node, misapplied_table)

    if layer1.verdict != Layer1Verdict.VERIFIED:
        llm_text = generate_explanation(
            verdict=layer1.verdict.value,
            citation=raw_text,
            proposition_cited=layer1.proposition_cited,
            proposition_actual=layer1.proposition_actual,
        )
        if llm_text:
            layer1.llm_explanation = llm_text

    if corpus_node and layer1.verdict != Layer1Verdict.FABRICATED:
        hist = treatment.get_history(corpus_node.node_id)
        layer2 = Layer2Result(
            verdict=Layer2Verdict(hist.verdict),
            overruled_by=hist.overruled_by,
            distinguished_by=hist.distinguished_by,
            source=hist.source,
        )
    else:
        layer2 = Layer2Result(verdict=Layer2Verdict.NOT_CHECKED, source="not_checked")

    corpus_source = None
    if layer1.verdict != Layer1Verdict.FABRICATED:
        corpus_source = _node_to_source(corpus_node)

    result = CitationResult(
        raw_text=raw_text,
        corpus_source=corpus_source,
        layer1=layer1,
        layer2=layer2,
        statutory=None,
        context_analysis=None,
    )
    return result, f"{raw_text}:{layer1.verdict}"


def _agent_verdict_to_layers(
    av: "AgentVerdict",
    raw_citation: str,
) -> "tuple[Layer1Result, Layer2Result, ContextAnalysis]":
    layer1 = Layer1Result(
        verdict=Layer1Verdict(av.verdict),
        confidence=1.0 if av.verdict == "FABRICATED" else 0.9,
        proposition_cited=av.proposition_cited,
        proposition_actual=av.proposition_actual,
        explanation=av.reason,
    )

    try:
        l2v = Layer2Verdict(av.layer2_verdict)
    except ValueError:
        l2v = Layer2Verdict.NOT_CHECKED

    layer2 = Layer2Result(verdict=l2v, source="agent")

    context_analysis = ContextAnalysis(
        document_claim=av.proposition_cited,
        claim_matches=(av.verdict == "VERIFIED"),
        mismatch_reason=av.reason if av.verdict == "MISAPPLIED" else None,
        alternatives=(
            [AlternativeSuggestion(suggestion=av.alternative_citation)]
            if av.alternative_citation else []
        ),
        agent_model=f"{av.provider_used} (tools:{','.join(av.tool_calls_log)})",
    )

    return layer1, layer2, context_analysis


def _node_to_source(node) -> "CorpusSource | None":
    """Convert a CaseNode to the CorpusSource provenance block for the API response."""
    if node is None:
        return None
    return CorpusSource(
        node_id=node.node_id,
        citation=node.citation,
        short_name=node.short_name,
        court=node.court,
        domain=node.domain,
        bailii_url=node.bailii_url or None,
        status=node.status,
    )


def _statute_layer1(raw_text: str, lookup) -> Layer1Result:
    if lookup.exists is True:
        return Layer1Result(
            verdict=Layer1Verdict.VERIFIED,
            confidence=1.0,
            explanation=(
                f"{lookup.act} {lookup.year} s.{lookup.section} "
                f"verified via legislation.gov.uk (HTTP 200)."
            ),
        )
    if lookup.exists is False:
        return Layer1Result(
            verdict=Layer1Verdict.FABRICATED,
            confidence=1.0,
            explanation=(
                f"Section not found: legislation.gov.uk returned 404 for "
                f"{lookup.act} {lookup.year} s.{lookup.section}."
            ),
        )
    return Layer1Result(
        verdict=Layer1Verdict.FABRICATED,
        confidence=0.5,
        explanation="Statute verification timed out — could not confirm existence.",
    )
