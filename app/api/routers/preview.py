"""
GET /api/preview/{node_id}?claim=<text>&k=<int>

Returns the full judgment text passages most relevant to the claim,
with the exact highlighted span that matches — ready for the frontend
split-screen viewer.

Works for:
  - Any cited case (OVERRULED, MISAPPLIED, VERIFIED)
  - Any suggested alternative case (from amendments[])
  - Returns 404 for FABRICATED citations (case not in corpus)

Source priority:
  1. Local SQLite passage store (built from the Case Law Database PDFs)
  2. Neo4j passage_embedding index (55 cases with pre-indexed chunks)
  3. Corpus proposition only (cases with only a one-liner in Neo4j)
  4. 404 when none of the above have data

No LLM is used — relevance is the cosine similarity of the query embedding
against stored passage embeddings.  The highlight is found deterministically
by keyword overlap.  Both are shown as confidence/transparency signals.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["preview"])

_DEFAULT_K = 5


# ── Response models ───────────────────────────────────────────────────────────

class PassageHighlight(BaseModel):
    para_no:         int
    text:            str    # full passage (~900 chars)
    relevance_score: float  # cosine similarity 0–1 (RAG confidence)
    highlight_start: int    # char offset within text
    highlight_end:   int    # char offset within text
    highlight_text:  str    # the sentence that best matches the claim
    source:          str    # "local_store" | "neo4j" | "proposition"


class PreviewResponse(BaseModel):
    node_id:      str
    citation:     str
    short_name:   str
    status:       str
    bailii_url:   str | None = None
    preview_mode: str        # "full" | "proposition_only" | "not_found"
    claim:        str        # the query used for retrieval
    passages:     list[PassageHighlight]
    full_text:    str | None = None   # complete judgment text (when full=true)
    proposition:  str | None = None   # curated one-liner from Neo4j


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/preview/{node_id}/pdf",
    summary="Serve the original PDF for a case",
    response_class=FileResponse,
)
def get_pdf(node_id: str) -> FileResponse:
    """
    Returns the original PDF file for a case.
    The frontend can embed it in an <iframe> for native browser rendering.
    Returns 404 if the case has no PDF in the local store (FABRICATED or not ingested).
    """
    from app.adapters.local.passage_store import get_pdf_path
    from app.api.deps import get_corpus_repo

    corpus = get_corpus_repo()
    if corpus.lookup(node_id) is None:
        raise HTTPException(status_code=404, detail=f"Case '{node_id}' not in corpus.")

    pdf_path = get_pdf_path(node_id)
    if pdf_path is None:
        raise HTTPException(status_code=404, detail=f"No PDF available for '{node_id}'.")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
    )


@router.get(
    "/preview/{node_id}",
    response_model=PreviewResponse,
    summary="Judgment passage preview for a citation or suggestion",
)
def get_preview(
    node_id: str,
    claim: str = Query("", description="Legal claim or argument context — drives relevance ranking"),
    k: int     = Query(_DEFAULT_K, ge=1, le=10, description="Number of passages to return"),
    full: bool = Query(False, description="Return ALL passages in document order (full judgment text)"),
) -> PreviewResponse:
    """
    Returns the top-k most relevant judgment passages for a given case,
    with the exact highlighted span that matches the claim.

    Used by the frontend to show verifiable source text when:
      - A citation is OVERRULED or MISAPPLIED (show why)
      - A suggestion is clicked (preview before adopting)
    """
    from app.api.deps import get_corpus_repo

    corpus = get_corpus_repo()

    # 1. Corpus lookup — needed for metadata AND to reject FABRICATED
    corpus_node = corpus.lookup(node_id)
    if corpus_node is None:
        raise HTTPException(
            status_code=404,
            detail=f"Case '{node_id}' not found in corpus — if this is a FABRICATED citation there is nothing to preview.",
        )

    # Use the claim if provided, else fall back to the corpus proposition
    effective_claim = claim.strip() or (
        corpus_node.propositions[0] if corpus_node.propositions else corpus_node.short_name
    )

    passages: list[PassageHighlight] = []

    # 2. Try local SQLite store first (built from PDFs — full judgment text)
    from app.adapters.local.passage_store import (
        find_highlight,
        get_passages,
        get_relevant_passages,
        resolve_case_id,
    )

    local_id = resolve_case_id(node_id)
    full_text: str | None = None

    if local_id:
        if full:
            # Return ALL chunks in document order — complete judgment text
            all_local = get_passages(local_id)
            for lp in all_local:
                h_start, h_end, h_text = find_highlight(lp.text, effective_claim)
                passages.append(PassageHighlight(
                    para_no=lp.para_no,
                    text=lp.text,
                    relevance_score=0.0,
                    highlight_start=h_start,
                    highlight_end=h_end,
                    highlight_text=h_text,
                    source="local_store",
                ))
            # Reconstruct continuous text removing the 100-char overlap between chunks
            if all_local:
                full_text = all_local[0].text
                for lp in all_local[1:]:
                    # Each chunk overlaps with the previous by ~100 chars — skip the overlap
                    full_text += "\n" + lp.text[100:]
        else:
            local_passages = get_relevant_passages(local_id, effective_claim, k=k)
            for lp in local_passages:
                h_start, h_end, h_text = find_highlight(lp.text, effective_claim)
                passages.append(PassageHighlight(
                    para_no=lp.para_no,
                    text=lp.text,
                    relevance_score=round(lp.score, 4),
                    highlight_start=h_start,
                    highlight_end=h_end,
                    highlight_text=h_text,
                    source="local_store",
                ))

    # 3. If local store has nothing, try Neo4j passage_embedding
    if not passages:
        try:
            neo4j_passages = corpus.find_relevant_passages(
                node_id=node_id,
                claim_text=effective_claim,
                k=k,
            )
            for np_ in neo4j_passages:
                h_start, h_end, h_text = find_highlight(np_.text, effective_claim)
                passages.append(PassageHighlight(
                    para_no=np_.para_no,
                    text=np_.text,
                    relevance_score=0.0,   # Neo4j doesn't return cosine score here
                    highlight_start=h_start,
                    highlight_end=h_end,
                    highlight_text=h_text,
                    source="neo4j",
                ))
        except Exception:
            pass

    # 4. Determine preview_mode
    if passages:
        preview_mode = "full"
    elif corpus_node.propositions:
        preview_mode = "proposition_only"
    else:
        preview_mode = "not_found"

    proposition = corpus_node.propositions[0] if corpus_node.propositions else None

    return PreviewResponse(
        node_id=node_id,
        citation=corpus_node.citation,
        short_name=corpus_node.short_name,
        status=corpus_node.status,
        bailii_url=corpus_node.bailii_url,
        preview_mode=preview_mode,
        claim=effective_claim,
        passages=passages,
        full_text=full_text,
        proposition=proposition,
    )
