"""
retrieval_helpers.py - standalone corpus-access helpers for the backend.

Drop-in target: backend/app/adapters/neo4j/retrieval_helpers.py

Two functions the Neo4jCorpusAdapter wraps. They hide the dual-schema: the
judgment passages are keyed on the PDF-ingest `Case.id` (== `Passage.case_id`),
while other layers (e.g. :Proposition) use a different `caseId` slug. Both
helpers resolve whatever id they are given to the passage-backed case before
querying, so the caller never reimplements slug matching.

Self-contained: needs only `neo4j`, `rapidfuzz`, `python-dotenv`. Reads
NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE from the env.

IMPORTANT: the query vector passed to `vector_search` MUST come from the same
embedder the passages were built with — local fastembed BAAI/bge-small-en-v1.5,
384-dim — or the vector index will not match.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from neo4j import GraphDatabase
from rapidfuzz import fuzz

_VECTOR_INDEX = "passage_embedding"
_MATCH_THRESHOLD = 80   # fuzzy name-match score (0-100) for slug -> case resolution

_DRIVER = None
_DB = None
_PCASES = None          # cached [(case_id, name)] for cases that have passages


def _driver():
    global _DRIVER, _DB
    if _DRIVER is None:
        load_dotenv()
        _DRIVER = GraphDatabase.driver(
            os.environ["NEO4J_URI"],
            auth=(os.environ["NEO4J_USERNAME"], os.environ["NEO4J_PASSWORD"]))
        _DB = os.environ.get("NEO4J_DATABASE", "neo4j")
    return _DRIVER


def _run(cypher: str, **params):
    with _driver().session(database=_DB) as session:
        return session.run(cypher, **params).data()


def _passage_cases():
    """Lazily cache (case_id, name) for every case that actually has passages."""
    global _PCASES
    if _PCASES is None:
        rows = _run(
            "MATCH (c:Case)-[:HAS_PASSAGE]->(:Passage) "
            "RETURN DISTINCT c.id AS id, "
            "coalesce(c.name, c.shortName, c.citation, c.id) AS name")
        _PCASES = [(r["id"], r["name"] or "") for r in rows]
    return _PCASES


def _resolve_passage_case_id(node_id: str) -> str | None:
    """Map any layer's id/slug to the passage-backed case_id (or None)."""
    if not node_id:
        return None
    # 1. already a passage case_id (the PDF-ingest id)? -> use as-is
    if _run("MATCH (:Passage {case_id:$id}) RETURN 1 AS x LIMIT 1", id=node_id):
        return node_id
    # 2. otherwise (e.g. a propositions-layer slug) resolve by de-slugged name
    q = node_id.replace("--", " ").replace("-", " ").lower()
    best, score = None, 0
    for cid, name in _passage_cases():
        s = fuzz.token_set_ratio(q, name.lower())
        if s > score:
            best, score = cid, s
    return best if score >= _MATCH_THRESHOLD else None


def get_passages(node_id: str) -> list[dict]:
    """
    Judgment chunks for a case. Handles the dual-schema internally: accepts
    either the propositions-layer nodeId or the PDF-ingest id.
    Returns [{para_no, text, case_id}] ordered by para_no (empty if no text).
    """
    cid = _resolve_passage_case_id(node_id)
    if not cid:
        return []
    return _run(
        "MATCH (p:Passage {case_id:$cid}) "
        "RETURN p.para_no AS para_no, p.text AS text, p.case_id AS case_id "
        "ORDER BY p.para_no", cid=cid)


def vector_search(case_id: str, query_vec: list[float], k: int = 8) -> list[dict]:
    """
    Semantic search of chunks within one case (resolves the dual-schema id,
    then hits the `passage_embedding` vector index).
    Returns [{para_no, text, score}] ordered by score DESC (empty if no text).
    """
    cid = _resolve_passage_case_id(case_id)
    if not cid:
        return []
    return _run(
        "CALL db.index.vector.queryNodes($idx, $fetch, $vec) YIELD node, score "
        "WHERE node.case_id = $cid "
        "RETURN node.para_no AS para_no, node.text AS text, score "
        "ORDER BY score DESC LIMIT $k",
        idx=_VECTOR_INDEX, fetch=max(k * 10, 50), vec=query_vec, cid=cid, k=k)


def close() -> None:
    """Close the cached driver."""
    global _DRIVER, _PCASES
    if _DRIVER is not None:
        _DRIVER.close()
        _DRIVER = None
    _PCASES = None
