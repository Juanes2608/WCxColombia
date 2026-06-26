"""
VerifyService — single orchestration point for the citation check pipeline.

Layer 1 (deterministic):
  regex extraction → corpus lookup → FABRICATED / MISAPPLIED / VERIFIED

Layer 2 (Neo4j, graceful degradation):
  treatment history → OVERRULED / DISTINGUISHED / GOOD_LAW / UNAVAILABLE

Statutory verification (legislation.gov.uk, graceful degradation):
  section exists check → exists True/False/None

The service depends exclusively on port interfaces (ABCs).
It has no direct knowledge of Neo4j, httpx, or FastAPI.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from app.domain.citation_extractor import extract_citations
from app.domain.models import (
    AlternativeSuggestion,
    CitationResult,
    ContextAnalysis,
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
            # Return empty result with audit trail — don't fabricate citations
            return VerifyResult(
                matter_id=matter_id,
                total_citations=0,
                results=[],
                financial=compute_financial_summary([]),
                processing_ms=int((time.monotonic() - t0) * 1000),
                audit_trail_hash=self.audit.digest(),
            )

        # 2. Extract citations (deterministic regex)
        extracted = extract_citations(doc.text)
        self.audit.record("extract", matter_id, [c.raw_text for c in extracted])

        # 3. Load MISAPPLIED table once (lawyer-annotated Neo4j data)
        misapplied_table = self.corpus.get_misapplied_table()

        # 4. Verify each citation
        citation_results: list[CitationResult] = []
        for cit in extracted:

            statutory: StatutoryResult | None = None

            if cit.citation_type == "statute":
                # ── Statute citations ─────────────────────────────────────────
                # Verdict is determined by legislation.gov.uk, NOT by corpus lookup.
                # Corpus lookup is for case law only.
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
                    layer1 = Layer1Result(
                        verdict=Layer1Verdict.FABRICATED,
                        confidence=1.0,
                        explanation="Statute citation could not be parsed or verified.",
                    )
                layer2 = Layer2Result(verdict=Layer2Verdict.NOT_CHECKED, source="not_applicable")

            else:
                # ── Case-law citations ────────────────────────────────────────
                context_analysis: ContextAnalysis | None = None

                # ── Agentic path (Nemotron CitationAgent) ─────────────────────
                # When OPENROUTER_API_KEY is set, the agent autonomously decides
                # which tools to call and submits a structured verdict.
                # Tools are deterministic wrappers — the agent reasons, not invents.
                if _nemotron_enabled():
                    agent_verdict = _run_agent(
                        citation=cit.raw_text,
                        doc_text=doc.text,
                        corpus=self.corpus,
                        treatment=self.treatment,
                    )
                    if agent_verdict is not None:
                        layer1, layer2, context_analysis = _agent_verdict_to_layers(
                            agent_verdict, cit.raw_text
                        )
                        # LLM explanation for non-VERIFIED verdicts
                        if layer1.verdict != Layer1Verdict.VERIFIED:
                            llm_text = generate_explanation(
                                verdict=layer1.verdict.value,
                                citation=cit.raw_text,
                                proposition_cited=layer1.proposition_cited,
                                proposition_actual=layer1.proposition_actual,
                            )
                            if llm_text:
                                layer1.llm_explanation = llm_text
                        self.audit.record(
                            "citation_check", matter_id,
                            [f"{cit.raw_text}:{layer1.verdict} (agent:{agent_verdict.turns_used}t)"],
                        )
                        citation_results.append(CitationResult(
                            raw_text=cit.raw_text,
                            layer1=layer1,
                            layer2=layer2,
                            statutory=statutory,
                            context_analysis=context_analysis,
                        ))
                        continue  # skip deterministic fallback below

                # ── Deterministic fallback (no agent / agent failed) ──────────
                corpus_node = self.corpus.lookup(cit.raw_text)
                layer1 = compute_layer1(cit.raw_text, corpus_node, misapplied_table)

                if layer1.verdict != Layer1Verdict.VERIFIED:
                    llm_text = generate_explanation(
                        verdict=layer1.verdict.value,
                        citation=cit.raw_text,
                        proposition_cited=layer1.proposition_cited,
                        proposition_actual=layer1.proposition_actual,
                    )
                    if llm_text:
                        layer1.llm_explanation = llm_text

                if corpus_node and layer1.verdict != Layer1Verdict.FABRICATED:
                    hist = self.treatment.get_history(corpus_node.node_id)
                    layer2 = Layer2Result(
                        verdict=Layer2Verdict(hist.verdict),
                        overruled_by=hist.overruled_by,
                        distinguished_by=hist.distinguished_by,
                        source=hist.source,
                    )
                else:
                    layer2 = Layer2Result(
                        verdict=Layer2Verdict.NOT_CHECKED,
                        source="not_checked",
                    )

            self.audit.record(
                "citation_check",
                matter_id,
                [f"{cit.raw_text}:{layer1.verdict}"],
            )
            citation_results.append(CitationResult(
                raw_text=cit.raw_text,
                layer1=layer1,
                layer2=layer2,
                statutory=statutory,
                context_analysis=context_analysis,
            ))

        # 5. Financial summary (deterministic)
        financial = compute_financial_summary(citation_results)
        elapsed_ms = int((time.monotonic() - t0) * 1000)

        return VerifyResult(
            matter_id=matter_id,
            total_citations=len(citation_results),
            results=citation_results,
            financial=financial,
            processing_ms=elapsed_ms,
            audit_trail_hash=self.audit.digest(),
        )


def _nemotron_enabled() -> bool:
    from app.config import get_settings
    return bool(get_settings().openrouter_api_key)


def _run_agent(
    citation: str,
    doc_text: str,
    corpus: "ICorpusRepository",
    treatment: "ITreatmentRepository",
) -> "AgentVerdict | None":
    """Run CitationAgent and return its verdict, or None on failure."""
    try:
        from app.agents.citation_agent import run_citation_agent
        from app.agents.tools import ToolExecutor
        from app.config import get_settings
        executor = ToolExecutor(corpus=corpus, treatment=treatment, doc_text=doc_text)
        return run_citation_agent(
            citation=citation,
            doc_text=doc_text,
            executor=executor,
            api_key=get_settings().openrouter_api_key,
            model=get_settings().openrouter_super_model,
        )
    except Exception as exc:
        import logging
        logging.getLogger("citationguard").warning("Agent failed for '%s': %s", citation[:50], exc)
        return None


def _agent_verdict_to_layers(
    av: "AgentVerdict",
    raw_citation: str,
) -> "tuple[Layer1Result, Layer2Result, ContextAnalysis]":
    """Map AgentVerdict → (Layer1Result, Layer2Result, ContextAnalysis)."""
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
        agent_model=f"nemotron-super (tools:{','.join(av.tool_calls_log)})",
    )

    return layer1, layer2, context_analysis


def _statute_layer1(raw_text: str, lookup: "StatutoryLookup") -> Layer1Result:
    """Compute Layer 1 verdict for a statute citation from legislation.gov.uk result."""
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
    # exists is None — verification failed (timeout)
    return Layer1Result(
        verdict=Layer1Verdict.FABRICATED,
        confidence=0.5,
        explanation="Statute verification timed out — could not confirm existence.",
    )
