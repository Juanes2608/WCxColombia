from fastapi import APIRouter, Depends, Query
from app.api.deps import get_corpus_repo
from app.ports.corpus import ICorpusRepository

router = APIRouter()


@router.get("/api/suggest")
async def suggest_case(
    q: str = Query(..., min_length=3),
    corpus: ICorpusRepository = Depends(get_corpus_repo),
):
    result = corpus.lookup(q)
    if result is None:
        return {"match": None}
    return {"match": {
        "citation": result.citation,
        "short_name": result.short_name,
        "proposition": result.propositions[0] if result.propositions else None,
        "status": result.status,
    }}
