"""
context_pipeline.py — Nemotron agentic pipeline for citation context verification.

Runs Steps 3-5 of the 5-step pipeline for each VERIFIED citation:

  Step 3 (Nemotron Nano):  Extract what proposition the document claims the citation supports
  Step 4 (Nemotron Super): Compare that claim vs the case's actual proposition
  Step 5 (Nemotron Super): If mismatch, find better citation from corpus

Only runs when OPENROUTER_API_KEY is configured. Gracefully returns None otherwise.
Never modifies verdicts directly — returns ContextAnalysis for the caller to act on.
"""
from __future__ import annotations

import logging
import re

from app.adapters.llm.nemotron_client import (
    compare_claim_vs_proposition,
    extract_document_claim,
    find_alternative_citation,
)
from app.domain.models import AlternativeSuggestion, ContextAnalysis

logger = logging.getLogger("citationguard.context_pipeline")

_CONTEXT_WINDOW = 700  # chars on each side of the citation in the document


def _extract_surrounding(doc_text: str, citation: str) -> str:
    """Return ~±700 characters around where the citation appears in the document."""
    pos = doc_text.find(citation)

    if pos == -1:
        # Try partial match: first meaningful fragment (skip leading brackets/punctuation)
        fragment = re.sub(r"^\W+", "", citation)[:35]
        m = re.search(re.escape(fragment), doc_text, re.IGNORECASE)
        pos = m.start() if m else 0

    start = max(0, pos - _CONTEXT_WINDOW)
    end   = min(len(doc_text), pos + len(citation) + _CONTEXT_WINDOW)
    return doc_text[start:end]


def run_context_pipeline(
    citation: str,
    doc_text: str,
    corpus_proposition: str,
    corpus_summaries: list[dict],
) -> ContextAnalysis:
    """
    Run Steps 3-5 for a single VERIFIED citation.

    Args:
        citation:           raw citation text as extracted from the document
        doc_text:           full document text (for context window extraction)
        corpus_proposition: what the case actually establishes (from corpus)
        corpus_summaries:   [{citation, short_name, proposition}] for alternative search

    Returns ContextAnalysis. If Nemotron calls fail, fields are None (graceful degradation).
    """

    # ── Step 3: Extract document claim ───────────────────────────────────────
    surrounding = _extract_surrounding(doc_text, citation)
    document_claim = extract_document_claim(citation, surrounding)

    if not document_claim:
        logger.info("Step 3 failed for '%s' — skipping Steps 4-5", citation[:50])
        return ContextAnalysis(document_claim=None, claim_matches=None)

    logger.info("Step 3 claim for '%s': %s", citation[:40], document_claim[:80])

    # ── Step 4: Compare claim vs actual proposition ───────────────────────────
    matches, reason = compare_claim_vs_proposition(
        citation=citation,
        document_claim=document_claim,
        actual_proposition=corpus_proposition,
    )

    logger.info("Step 4 result for '%s': match=%s — %s", citation[:40], matches, reason[:60])

    analysis = ContextAnalysis(
        document_claim=document_claim,
        claim_matches=matches,
        mismatch_reason=None if matches else reason,
        agent_model="nemotron-super-120b",
    )

    # ── Step 5: Find alternatives (only on mismatch) ─────────────────────────
    if not matches:
        logger.info("Step 5: searching alternatives for '%s'", citation[:40])
        alternatives_raw = find_alternative_citation(document_claim, corpus_summaries)
        analysis.alternatives = [
            AlternativeSuggestion(suggestion=a["suggestion"])
            for a in alternatives_raw
        ]
        if analysis.alternatives:
            logger.info("Step 5: found %d alternatives", len(analysis.alternatives))

    return analysis
