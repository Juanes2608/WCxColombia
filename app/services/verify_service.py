"""
VerifyService — single orchestration point for the TraceIT citation pipeline.

Pipeline (one pass per document):
  1. Ingest          → extract text from PDF / TXT / DOCX
  2. Extract         → deterministic regex → list of citations (case-law + statutes)
  3a. Statutes       → legislation.gov.uk live check (no LLM)
  3b. Case-law       → CitationAgent in parallel (ThreadPoolExecutor, 3 workers)
                       Agent collects judgment passages via get_judgment_passages tool
  4. HoldingJudge    → per citation: reads passages + brief context → HoldingAnalysis
  5. Store + return  → VerifyResult held in memory by matter_id (last 100)

Invariants:
  - FABRICATED is ONLY produced when corpus_lookup returns None.
  - OVERRULED / DISTINGUISHED come exclusively from the treatment graph.
  - The LLM (HoldingJudge) only reads and summarises — never decides existence.
"""
from __future__ import annotations

import logging
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from app.adapters.llm.holding_judge import analyse_holding
from app.domain.citation_extractor import extract_citations
from app.domain.models import (
    CitationResult,
    CorpusSource,
    HoldingAnalysis,
    Layer1Result,
    Layer1Verdict,
    Layer2Result,
    Layer2Verdict,
    StatutoryResult,
    VerifyResult,
)
from app.domain.verdict_engine import compute_layer1
from app.ports.audit import IAuditLog
from app.ports.corpus import ICorpusRepository
from app.ports.document import IDocumentIngestor
from app.ports.statutory import IStatutoryVerifier
from app.ports.treatment import ITreatmentRepository

logger = logging.getLogger("traceit.service")

# ── In-memory result + document store ────────────────────────────────────────
_result_store: dict[str, VerifyResult] = {}
_doc_store:    dict[str, str]          = {}
_store_lock = threading.Lock()
_MAX_STORED = 100


def get_stored_result(matter_id: str) -> VerifyResult | None:
    with _store_lock:
        return _result_store.get(matter_id)


def get_stored_document(matter_id: str) -> str | None:
    with _store_lock:
        return _doc_store.get(matter_id)


def _store_result(matter_id: str, result: VerifyResult, doc_text: str = "") -> None:
    with _store_lock:
        _result_store[matter_id] = result
        _doc_store[matter_id] = doc_text
        if len(_result_store) > _MAX_STORED:
            oldest = next(iter(_result_store))
            del _result_store[oldest]
            _doc_store.pop(oldest, None)


_AGENT_WORKERS = 3   # parallel citations; stays within Groq 30 RPM limit

_BRIEF_CONTEXT_WINDOW = 700   # chars each side of citation for HoldingJudge


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

        # 1. Ingest
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
                processing_ms=int((time.monotonic() - t0) * 1000),
                audit_trail_hash=self.audit.digest(),
            )
            _store_result(matter_id, result)
            return result

        # 2. Extract citations
        extracted = extract_citations(doc.text)
        self.audit.record("extract", matter_id, [c.raw_text for c in extracted])

        # 3. Load MISAPPLIED table once (read-only — safe across threads)
        misapplied_table = self.corpus.get_misapplied_table()

        ordered:    dict[int, CitationResult] = {}
        audit_msgs: dict[int, str]            = {}

        # ── 3a. Statute citations ─────────────────────────────────────────────
        for idx, cit in enumerate(extracted):
            if cit.citation_type != "statute":
                continue
            lookup = self.statutory.verify_from_text(cit.raw_text)
            if lookup:
                statutory = StatutoryResult(
                    act=lookup.act, year=lookup.year, section=lookup.section,
                    exists=lookup.exists, api_status=lookup.status_code,
                    excerpt=lookup.excerpt, source_url=lookup.url,
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
                holding_analysis=None,
            )
            audit_msgs[idx] = f"{cit.raw_text}:{layer1.verdict}"

        # ── 3b. Case-law citations (parallel agents) ──────────────────────────
        case_indices = {
            idx: cit for idx, cit in enumerate(extracted)
            if cit.citation_type != "statute"
        }

        if case_indices and _agents_enabled():
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
                        layer1, layer2 = _agent_verdict_to_layers(agent_verdict, cit.raw_text)

                        # Attach corpus provenance and complement Layer 2 when agent
                        # returned NOT_CHECKED (one-shot providers skip treatment tool).
                        corpus_source = None
                        corpus_node   = None
                        if layer1.verdict != Layer1Verdict.FABRICATED:
                            corpus_node   = self.corpus.lookup(cit.raw_text)
                            corpus_source = _node_to_source(corpus_node)
                            if layer2.verdict == Layer2Verdict.NOT_CHECKED and corpus_node:
                                try:
                                    hist = self.treatment.get_history(corpus_node.node_id)
                                    layer2 = Layer2Result(
                                        verdict=Layer2Verdict(hist.verdict),
                                        overruled_by=hist.overruled_by,
                                        distinguished_by=hist.distinguished_by,
                                        source=hist.source,
                                    )
                                except (ValueError, AttributeError):
                                    pass

                        # 4. HoldingJudge (runs after agent; uses passages agent collected)
                        holding_analysis = _run_holding_judge(
                            citation=cit.raw_text,
                            doc_text=doc.text,
                            agent_verdict=agent_verdict,
                            corpus_node=corpus_node,
                            corpus=self.corpus,
                        )

                        ordered[idx] = CitationResult(
                            raw_text=cit.raw_text,
                            corpus_source=corpus_source,
                            layer1=layer1,
                            layer2=layer2,
                            statutory=None,
                            holding_analysis=holding_analysis,
                        )
                        audit_msgs[idx] = (
                            f"{cit.raw_text}:{layer1.verdict}"
                            f" (agent:{agent_verdict.turns_used}t"
                            f" mode:{holding_analysis.analysis_mode if holding_analysis else 'none'})"
                        )
                    else:
                        ordered[idx], audit_msgs[idx] = _deterministic_fallback(
                            cit.raw_text, doc.text, self.corpus, self.treatment, misapplied_table
                        )

        # Deterministic fallback for citations not yet resolved
        for idx, cit in case_indices.items():
            if idx not in ordered:
                ordered[idx], audit_msgs[idx] = _deterministic_fallback(
                    cit.raw_text, doc.text, self.corpus, self.treatment, misapplied_table
                )

        # 5. Reconstruct ordered results + document context
        citation_results: list[CitationResult] = []
        for idx in range(len(extracted)):
            self.audit.record("citation_check", matter_id, [audit_msgs[idx]])
            cit_result = ordered[idx]

            # Attach document_context and char_pos
            citation_text = cit_result.raw_text
            pos = doc.text.find(citation_text)
            if pos == -1:
                norm_c = re.sub(r"\s+", " ", citation_text)
                norm_d = re.sub(r"\s+", " ", doc.text)
                pos = norm_d.find(norm_c)
            if pos != -1:
                start = max(0, pos - 400)
                end   = min(len(doc.text), pos + len(citation_text) + 400)
                cit_result.document_context  = doc.text[start:end]
                cit_result.document_char_pos = pos
                # Back-fill char_position in HoldingAnalysis brief_pointer
                if (cit_result.holding_analysis
                        and cit_result.holding_analysis.brief_pointer):
                    cit_result.holding_analysis.brief_pointer.char_position = pos

            citation_results.append(cit_result)

        result = VerifyResult(
            matter_id=matter_id,
            total_citations=len(citation_results),
            results=citation_results,
            processing_ms=int((time.monotonic() - t0) * 1000),
            audit_trail_hash=self.audit.digest(),
        )
        _store_result(matter_id, result, doc.text)
        return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _agents_enabled() -> bool:
    from app.config import get_settings
    s = get_settings()
    return bool(s.anthropic_api_key or s.groq_api_key or s.nvidia_api_key)


def _run_agent(
    citation: str,
    doc_text: str,
    corpus: "ICorpusRepository",
    treatment: "ITreatmentRepository",
) -> "AgentVerdict | None":
    try:
        from app.agents.citation_agent import run_citation_agent
        from app.agents.tools import ToolExecutor
        from app.config import get_settings
        s = get_settings()
        executor = ToolExecutor(corpus=corpus, treatment=treatment, doc_text=doc_text)
        return run_citation_agent(
            citation          = citation,
            doc_text          = doc_text,
            executor          = executor,
            anthropic_api_key = s.anthropic_api_key,
            anthropic_model   = s.anthropic_model,
            groq_api_key      = s.groq_api_key,
            groq_model        = s.groq_model,
            nvidia_api_key    = s.nvidia_api_key,
            nvidia_model      = s.nvidia_model,
        )
    except Exception as exc:
        logger.warning("Agent failed for '%s': %s", citation[:50], exc)
        return None


def _run_holding_judge(
    citation: str,
    doc_text: str,
    agent_verdict: "AgentVerdict",
    corpus_node,
    corpus: "ICorpusRepository",
) -> HoldingAnalysis | None:
    """
    Run the HoldingJudge after the agent loop.
    Only runs for VERIFIED and MISAPPLIED — FABRICATED has nothing to analyse.
    """
    if agent_verdict.verdict == "FABRICATED":
        return None

    # Brief context: ±700 chars around the citation in the skeleton
    pos = doc_text.find(citation)
    if pos == -1:
        norm_c = re.sub(r"\s+", " ", citation)
        norm_d = re.sub(r"\s+", " ", doc_text)
        pos = norm_d.find(norm_c)
    if pos != -1:
        start = max(0, pos - _BRIEF_CONTEXT_WINDOW)
        end   = min(len(doc_text), pos + len(citation) + _BRIEF_CONTEXT_WINDOW)
        brief_context = doc_text[start:end]
    else:
        brief_context = doc_text[:1400]   # fallback: first 1400 chars

    corpus_proposition = ""
    domain = None
    suggestions = None

    if corpus_node:
        corpus_proposition = corpus_node.propositions[0] if corpus_node.propositions else ""
        domain = corpus_node.domain

    # For MISAPPLIED or OVERRULED: fetch suggestions so the judge can include them.
    # MISAPPLIED → wrong proposition; OVERRULED → case is bad law, lawyer needs a replacement.
    needs_suggestions = (
        agent_verdict.verdict == "MISAPPLIED"
        or agent_verdict.layer2_verdict == "OVERRULED"
    )
    if needs_suggestions:
        try:
            suggestions = corpus.find_suggestions(
                proposition=agent_verdict.proposition_cited or corpus_proposition,
                brief_context=brief_context,
                domain=domain,
                limit=6,
                exclude_node_id=corpus_node.node_id if corpus_node else None,
            )
        except Exception as exc:
            logger.warning("find_suggestions failed for '%s': %s", citation[:50], exc)

    # Prefer vector-filtered passages (most relevant to this specific claim).
    # Falls back to agent_verdict.passages (all chunks) when vector search
    # is unavailable or returns nothing — no change to existing behaviour.
    if agent_verdict.passages:
        try:
            relevant = corpus.find_relevant_passages(
                node_id=corpus_node.node_id if corpus_node else "",
                claim_text=brief_context,
                k=5,
            )
            passages_to_use = relevant if relevant else agent_verdict.passages
        except Exception:
            passages_to_use = agent_verdict.passages
    else:
        passages_to_use = agent_verdict.passages

    try:
        return analyse_holding(
            citation=citation,
            brief_context=brief_context,
            passages=passages_to_use,
            corpus_proposition=corpus_proposition,
            suggestions=suggestions,
            domain=domain,
        )
    except Exception as exc:
        logger.warning("HoldingJudge failed for '%s': %s", citation[:50], exc)
        return None


def _deterministic_fallback(
    raw_text: str,
    doc_text: str,
    corpus: "ICorpusRepository",
    treatment: "ITreatmentRepository",
    misapplied_table: dict,
) -> "tuple[CitationResult, str]":
    """Corpus-only verdict — used when all agent providers are unavailable."""
    corpus_node = corpus.lookup(raw_text)
    layer1 = compute_layer1(raw_text, corpus_node, misapplied_table)

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

    # Degraded HoldingJudge (no passages, no agent) — uses corpus proposition only
    holding_analysis = None
    if layer1.verdict != Layer1Verdict.FABRICATED and corpus_node:
        pos = doc_text.find(raw_text)
        if pos != -1:
            start = max(0, pos - _BRIEF_CONTEXT_WINDOW)
            end   = min(len(doc_text), pos + len(raw_text) + _BRIEF_CONTEXT_WINDOW)
            brief_context = doc_text[start:end]
        else:
            brief_context = doc_text[:1400]

        # Suggestions for MISAPPLIED and OVERRULED in the deterministic path too
        suggestions = None
        is_overruled = (
            layer2.verdict == Layer2Verdict.OVERRULED
        )
        if layer1.verdict == Layer1Verdict.MISAPPLIED or is_overruled:
            try:
                corpus_proposition = corpus_node.propositions[0] if corpus_node.propositions else ""
                suggestions = corpus.find_suggestions(
                    proposition=layer1.proposition_cited or corpus_proposition,
                    brief_context=brief_context,
                    domain=corpus_node.domain,
                    limit=6,
                    exclude_node_id=corpus_node.node_id,
                )
            except Exception as exc:
                logger.warning("find_suggestions (deterministic path) failed: %s", exc)

        try:
            holding_analysis = analyse_holding(
                citation=raw_text,
                brief_context=brief_context,
                passages=[],
                corpus_proposition=corpus_node.propositions[0] if corpus_node.propositions else "",
                suggestions=suggestions,
                domain=corpus_node.domain,
            )
        except Exception as exc:
            logger.warning("HoldingJudge (deterministic path) failed: %s", exc)

    result = CitationResult(
        raw_text=raw_text,
        corpus_source=_node_to_source(corpus_node) if layer1.verdict != Layer1Verdict.FABRICATED else None,
        layer1=layer1,
        layer2=layer2,
        statutory=None,
        holding_analysis=holding_analysis,
    )
    return result, f"{raw_text}:{layer1.verdict}"


def _agent_verdict_to_layers(
    av: "AgentVerdict",
    raw_citation: str,
) -> "tuple[Layer1Result, Layer2Result]":
    try:
        l1v = Layer1Verdict(av.verdict)
    except ValueError:
        l1v = Layer1Verdict.UNVERIFIABLE

    layer1 = Layer1Result(
        verdict=l1v,
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
    return layer1, layer2


def _node_to_source(node) -> "CorpusSource | None":
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
