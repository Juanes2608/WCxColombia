"""
GET /api/proof/{matter_id}/{idx}  — Proof Panel for a single citation
GET /api/document/{matter_id}     — Full document text with citation index

The Proof Panel is the deep-dive view the lawyer opens from the triage.
It packages everything the HoldingJudge produced into a single response.
All fields have deterministic fallbacks so the panel is never empty, even
when the LLM is unavailable or passages have not been indexed yet.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException

from app.domain.models import (
    BriefPointer,
    HoldingAnalysis,
    ProofPanel,
    TransparencyCard,
)
from app.services.verify_service import get_stored_document, get_stored_result

router = APIRouter(prefix="/api", tags=["proof"])

# Neo4j graph: 97+ cases.  CSV fallback: 34 verified cases.
# Using the larger corpus size is more honest for the transparency card.
_NEO4J_CORPUS_SIZE = 97
_CSV_CORPUS_SIZE   = 34


def _corpus_size() -> int:
    from app.config import get_settings
    return _NEO4J_CORPUS_SIZE if get_settings().neo4j_configured else _CSV_CORPUS_SIZE


@router.get(
    "/proof/{matter_id}/{idx}",
    response_model=ProofPanel,
    summary="Proof Panel — full source evidence for a single citation",
)
def get_proof_panel(matter_id: str, idx: int) -> ProofPanel:
    result = get_stored_result(matter_id)
    if result is None:
        raise HTTPException(404, f"No report for matter_id '{matter_id}'.")
    if idx < 0 or idx >= len(result.results):
        raise HTTPException(404, f"Index {idx} out of range (0–{len(result.results) - 1}).")

    cit = result.results[idx]
    l1  = cit.layer1
    l2  = cit.layer2
    src = cit.corpus_source
    ha: HoldingAnalysis | None = cit.holding_analysis

    # ── Resolved fields (LLM output with deterministic fallbacks) ────────────

    # case_summary: LLM holding → corpus proposition → citation string
    case_summary = (
        (ha.case_summary if ha else None)
        or l1.proposition_actual
        or (src.citation if src else None)
    )

    # verdict_reasoning: LLM output → deterministic explanation
    verdict_reasoning = (
        (ha.verdict_reasoning if ha else None)
        or l1.explanation
    )

    # confidence: from holding analysis if ran, else layer1 confidence
    confidence = (ha.confidence if ha and ha.confidence > 0 else None) or l1.confidence

    # brief_pointer: LLM-extracted → deterministic sentence extraction
    brief_pointer = (ha.brief_pointer if ha else None) or _extract_brief_pointer(
        cit.raw_text, cit.document_context, cit.document_char_pos
    )

    transparency = TransparencyCard(
        method=(
            "Layer 1: deterministic corpus lookup (Neo4j). "
            "Layer 2: treatment history graph (Neo4j). "
            "Holding analysis: HoldingJudge reads judgment chunks and summarises "
            "the ratio decidendi — verdict confirmed against the holding, not an "
            "isolated paragraph."
        ),
        verdict_source=_verdict_source(cit),
        corpus_size=_corpus_size(),
        limitations=_build_limitations(l1.verdict.value, l2.verdict.value, src, ha),
    )

    return ProofPanel(
        matter_id=matter_id,
        citation_index=idx,
        raw_citation=cit.raw_text,
        verdict=l1.verdict.value,
        confidence=confidence,
        document_context=cit.document_context,
        brief_pointer=brief_pointer,
        case_summary=case_summary,
        verdict_reasoning=verdict_reasoning,
        judgment_pointers=ha.judgment_pointers if ha else [],
        amendments=ha.amendments if ha else [],
        good_law_status=l2.verdict.value,
        overruled_by=l2.overruled_by,
        distinguished_by=l2.distinguished_by,
        bailii_url=src.bailii_url if src else None,
        static_explanation=l1.explanation,
        transparency=transparency,
    )


@router.get("/document/{matter_id}", summary="Full document text with citation positions")
def get_document(matter_id: str) -> dict:
    result   = get_stored_result(matter_id)
    doc_text = get_stored_document(matter_id)
    if result is None or doc_text is None:
        raise HTTPException(404, f"No document for matter_id '{matter_id}'.")
    return {
        "matter_id":  matter_id,
        "text":       doc_text,
        "char_count": len(doc_text),
        "citations": [
            {
                "idx":      i,
                "raw_text": c.raw_text,
                "char_pos": c.document_char_pos,
                "verdict":  c.layer1.verdict.value,
            }
            for i, c in enumerate(result.results)
        ],
    }


# ── Deterministic fallbacks ───────────────────────────────────────────────────

def _extract_brief_pointer(
    raw_citation: str,
    document_context: str | None,
    char_pos: int | None,
) -> BriefPointer | None:
    """
    Extract the sentence containing the citation from the document context.
    Returns None only when document_context is not available.
    This is deterministic — no LLM required.
    """
    if not document_context:
        return None

    # Find where the citation sits within the context window
    pos = document_context.find(raw_citation)
    if pos == -1:
        # Whitespace-normalised fallback
        norm_ctx = re.sub(r"\s+", " ", document_context)
        norm_cit = re.sub(r"\s+", " ", raw_citation)
        pos = norm_ctx.find(norm_cit)
    if pos == -1:
        pos = 0

    # Walk backwards to sentence start
    start = pos
    for i in range(pos, -1, -1):
        if document_context[i] in ".!?\n" and i < pos - 2:
            start = i + 1
            break
    else:
        start = 0

    # Walk forwards to sentence end
    end = pos + len(raw_citation)
    for i in range(end, min(len(document_context), end + 300)):
        if document_context[i] in ".!?\n":
            end = i + 1
            break

    sentence = document_context[start:end].strip()
    if len(sentence) < 10:
        sentence = document_context[max(0, pos - 80): pos + len(raw_citation) + 80].strip()

    return BriefPointer(
        sentence=sentence[:400],
        paragraph_hint=None,   # cannot determine without LLM
        char_position=char_pos,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verdict_source(cit) -> str:
    ha = cit.holding_analysis
    if ha and ha.agent_model and ha.analysis_mode not in ("none", "full_failed", "degraded_failed"):
        return f"HoldingJudge ({ha.agent_model}, mode={ha.analysis_mode}) + deterministic corpus"
    return "Deterministic corpus lookup — holding analysis unavailable or incomplete"


def _build_limitations(
    verdict: str,
    l2_verdict: str,
    src,
    ha: HoldingAnalysis | None,
) -> list[str]:
    limits = []

    if verdict == "FABRICATED":
        limits.append("Case not found in corpus — may exist in sources not yet indexed.")

    if l2_verdict in ("UNAVAILABLE", "NOT_CHECKED"):
        limits.append("Treatment history not confirmed (graph has only 3 edges currently).")

    if ha is None:
        limits.append("Holding analysis not available — deterministic verdict only.")
    elif ha.analysis_mode == "degraded":
        limits.append(
            "Holding analysis used corpus proposition as proxy (no judgment chunks for this case). "
            "Confidence lower than full mode."
        )
    elif ha.analysis_mode in ("full_failed", "degraded_failed"):
        limits.append(
            "LLM unavailable during this request — holding analysis used corpus proposition only. "
            "Brief pointer extracted deterministically from document context."
        )
    elif ha.analysis_mode == "none":
        limits.append("Insufficient text to perform holding analysis.")

    if ha and not ha.holding_found:
        limits.append("Holding could not be determined from available text.")

    if src and not src.bailii_url:
        limits.append("No BAILII link available for this case.")

    limits.append(
        f"Corpus covers {_corpus_size()} curated UK cases; "
        "~55 of 97 Neo4j cases have full judgment text."
    )
    return limits
