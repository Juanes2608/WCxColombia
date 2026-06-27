"""
GET /api/suggest?q=<proposition>&domain=<domain>&limit=<n>

Returns cases from the corpus that genuinely support a given proposition.
Used by the frontend to help lawyers find correct replacements for
FABRICATED or MISAPPLIED citations.

The query is searched against judgment text (passageText FULLTEXT index on
Neo4j) and proposition text.  Falls back to keyword scoring on the CSV corpus
when Neo4j is not available.
"""
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_corpus_repo
from app.ports.corpus import ICorpusRepository

router = APIRouter()


@router.get("/api/suggest")
async def suggest_cases(
    q: str = Query(..., min_length=3, description="Legal proposition to find supporting authority for"),
    domain: str | None = Query(None, description="Optional domain filter e.g. 'tort', 'contract'"),
    limit: int = Query(6, ge=1, le=20),
    corpus: ICorpusRepository = Depends(get_corpus_repo),
):
    """
    Search the corpus for cases that genuinely support a legal proposition.

    Returns up to `limit` candidates ranked by relevance, each with the
    case name, citation, the proposition it establishes, and its BAILII URL
    when available.

    Intended use:
      - Lawyer sees FABRICATED → searches for a real case that makes the same point
      - Lawyer sees MISAPPLIED → finds the correct authority for the argument
    """
    suggestions = corpus.find_suggestions(
        proposition=q,
        brief_context="",   # no extra skeleton context at this endpoint
        domain=domain,
        limit=limit,
    )

    if not suggestions:
        return {"query": q, "domain": domain, "results": []}

    return {
        "query":   q,
        "domain":  domain,
        "results": [
            {
                "node_id":    s.node_id,
                "citation":   s.citation,
                "short_name": s.short_name,
                "proposition": s.proposition,
                "domain":     s.domain,
                "bailii_url": s.bailii_url,
                "score":      round(s.score, 3),
            }
            for s in suggestions
        ],
    }
