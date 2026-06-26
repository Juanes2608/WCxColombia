"""
retrieve.py - the public API of this layer: given a case and a claim,
return the exact passages that support or contradict it.

    r = Retriever()
    hits = r.retrieve_passages("[1975] UKHL 1", "the test for an interim injunction")
    for h in hits:
        print(h["score"], h["text"])

This is the "go to the source" capability the judges asked for: the LLM/lawyer
reads the returned paragraph and decides if the citation is correctly applied.
"""

from __future__ import annotations

from retrieval.embed import get_embedder
from retrieval.passage_store import PassageStore


class Retriever:
    """Holds the embedder + store open so repeated queries are cheap."""

    def __init__(self, provider: str | None = None) -> None:
        self.embedder = get_embedder(provider)
        self.store = PassageStore()

    def close(self) -> None:
        self.store.close()

    def retrieve_passages(
        self, case_id: str | None, claim: str, k: int = 5
    ) -> list[dict]:
        """
        Top-k passages most relevant to `claim`.
        case_id given -> search within that one case (verify a citation's use).
        case_id None  -> search the whole corpus (e.g. find supporting authority).
        """
        query_vec = self.embedder.embed([claim])[0]
        return self.store.query(query_vec, k=k, case_id=case_id)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
