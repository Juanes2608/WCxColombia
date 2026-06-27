"""
GET /api/proof/{matter_id}/{idx}

Returns the full Proof Panel package for a single citation in a prior verify result.
The frontend calls this when the user clicks a citation to open the split-screen view.

Response includes:
  - Side-by-side: document_claim (what the brief says) vs corpus_proposition + key_paragraph
  - Verdict + confidence score
  - Good-law status with overruled_by timeline
  - BAILII link for direct source access
  - LLM plain-English explanation
  - Transparency card (method, limitations)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.adapters.local.corpus_adapter import LocalCorpusAdapter
from app.domain.models import ProofPanel, TransparencyCard
from app.services.verify_service import get_stored_result

router = APIRouter(prefix="/api", tags=["proof"])

_CORPUS_SIZE_CACHE: int | None = None


def _corpus_size() -> int:
    global _CORPUS_SIZE_CACHE
    if _CORPUS_SIZE_CACHE is None:
        try:
            adapter = LocalCorpusAdapter()
            _CORPUS_SIZE_CACHE = len(adapter._nodes)
        except Exception:
            _CORPUS_SIZE_CACHE = 0
    return _CORPUS_SIZE_CACHE


@router.get(
    "/proof/{matter_id}/{idx}",
    response_model=ProofPanel,
    summary="Proof Panel — full source evidence for a single citation",
)
def get_proof_panel(matter_id: str, idx: int) -> ProofPanel:
    """
    Returns the complete Proof Panel for citation at position `idx` in a prior
    /api/verify result.

    **matter_id**: returned by POST /api/verify in the `matter_id` field.
    **idx**: zero-based index into the `results` array of that verify response.
    """
    result = get_stored_result(matter_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No report found for matter_id '{matter_id}'. Reports expire on server restart.",
        )

    if idx < 0 or idx >= len(result.results):
        raise HTTPException(
            status_code=404,
            detail=f"Citation index {idx} out of range (0–{len(result.results) - 1}).",
        )

    cit = result.results[idx]
    l1  = cit.layer1
    l2  = cit.layer2
    src = cit.corpus_source

    # ── Side-by-side content ──────────────────────────────────────────────────
    document_claim = l1.proposition_cited or _infer_document_claim(cit)
    corpus_proposition = l1.proposition_actual or (
        src.citation if src else None
    )
    key_paragraph = src.key_paragraph if src else None

    # ── Transparency card ─────────────────────────────────────────────────────
    verdict_source = _verdict_source(cit)
    limitations = _build_limitations(l1.verdict, l2.verdict, src)

    transparency = TransparencyCard(
        method=(
            "Layer 1: deterministic corpus lookup (regex extraction → CSV match). "
            "Layer 2: treatment history from curated CSV. "
            "No LLM involvement in verdict determination."
        ),
        verdict_source=verdict_source,
        corpus_size=_corpus_size(),
        limitations=limitations,
    )

    return ProofPanel(
        matter_id=matter_id,
        citation_index=idx,
        raw_citation=cit.raw_text,
        verdict=l1.verdict.value,
        confidence=l1.confidence,
        document_claim=document_claim,
        corpus_proposition=corpus_proposition,
        key_paragraph=key_paragraph,
        good_law_status=l2.verdict.value,
        overruled_by=l2.overruled_by,
        distinguished_by=l2.distinguished_by,
        bailii_url=src.bailii_url if src else None,
        llm_explanation=l1.llm_explanation,
        static_explanation=l1.explanation,
        transparency=transparency,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _infer_document_claim(cit) -> str | None:
    """
    If proposition_cited is not set (agent didn't fill it, or VERIFIED case),
    return a generic description of how the citation appears in the document.
    """
    verdict = cit.layer1.verdict.value
    if verdict == "FABRICATED":
        return None
    if verdict == "VERIFIED" and cit.corpus_source:
        return f"Cited as authority for: {cit.corpus_source.citation}"
    return None


def _verdict_source(cit) -> str:
    ctx = cit.context_analysis
    if ctx and ctx.agent_model and "nemotron" in ctx.agent_model.lower():
        return f"Agent ({ctx.agent_model}) with deterministic corpus tools"
    if ctx and ctx.agent_model and "infermatic" in ctx.agent_model.lower():
        return f"Agent (Infermatic fallback) with deterministic corpus tools"
    return "Deterministic corpus lookup (no agent)"


def _build_limitations(verdict: str, l2_verdict: str, src) -> list[str]:
    limits = []
    if verdict == "FABRICATED":
        limits.append("Case not found in corpus — may exist in unreachable databases.")
    if l2_verdict in ("UNAVAILABLE", "NOT_CHECKED"):
        limits.append("Treatment history unavailable — good-law status not confirmed.")
    if src and not src.key_paragraph:
        limits.append("Verbatim judgment text not available for this case — see BAILII link.")
    if src and not src.bailii_url:
        limits.append("No BAILII link available — manual retrieval required.")
    limits.append(
        f"Corpus covers {_corpus_size()} curated UK cases; "
        "unreported or recent decisions may not be included."
    )
    return limits
