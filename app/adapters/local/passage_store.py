"""
LocalPassageStore — SQLite-backed passage retrieval for the preview endpoint.

Covers all cases in the Case Law Database zip (40 with extractable text).
Falls back gracefully when a case has no local text (returns []).

The case_id in SQLite is derived from the PDF filename slug, which differs
from Neo4j's nodeId.  _resolve_case_id() maps between them via word overlap.
"""
from __future__ import annotations

import re
import sqlite3
import struct
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

import numpy as np

DB_PATH = Path(__file__).resolve().parents[3] / "data" / "passage_store.db"

_SKIP_WORDS = {
    "v", "the", "and", "of", "in", "uk", "nondevolved",
    "case", "law", "england", "wales", "ltd", "plc", "co",
}


class LocalPassage(NamedTuple):
    case_id:   str
    para_no:   int
    text:      str
    score:     float   # cosine similarity to query (0 when not ranked)


@lru_cache(maxsize=1)
def _get_all_case_ids() -> set[str]:
    if not DB_PATH.exists():
        return set()
    con = sqlite3.connect(DB_PATH)
    ids = {row[0] for row in con.execute("SELECT DISTINCT case_id FROM passages")}
    con.close()
    return ids


def resolve_case_id(node_id: str) -> str | None:
    """
    Map a Neo4j nodeId (e.g. 'murphy-v-brentwood-dc') to the local SQLite
    case_id (e.g. 'murphy-v-brentwood-district-council-uk-nondevolved-case-law').

    First tries an exact match, then scores by word overlap.
    Requires ≥ 2 significant words to match to avoid false positives.
    """
    all_ids = _get_all_case_ids()
    if not all_ids:
        return None
    if node_id in all_ids:
        return node_id

    node_words = set(node_id.split("-")) - _SKIP_WORDS
    best_id, best_score = None, 0

    for cid in all_ids:
        cid_words = set(cid.split("-")) - _SKIP_WORDS
        score = len(node_words & cid_words)
        if score > best_score:
            best_score = score
            best_id = cid

    return best_id if best_score >= 2 else None


PDF_DIR = Path(__file__).resolve().parents[3] / "data" / "cases" / "Cambridge Hackathon - Case Law Database"


def get_pdf_path(node_id: str) -> Path | None:
    """Return the absolute path to the PDF for a given Neo4j node_id, or None.

    Strategy:
    1. If the case is in SQLite, use the stored filename (exact).
    2. Otherwise scan the PDF directory by word-overlap (same logic as resolve_case_id)
       so we can serve PDFs even before OCR has run.
    """
    # Try DB first (exact filename)
    local_id = resolve_case_id(node_id)
    if local_id and DB_PATH.exists():
        con = sqlite3.connect(DB_PATH)
        row = con.execute(
            "SELECT filename FROM passages WHERE case_id = ? LIMIT 1", (local_id,)
        ).fetchone()
        con.close()
        if row:
            pdf_path = PDF_DIR / row[0]
            if pdf_path.exists():
                return pdf_path

    # Fallback: scan PDF directory by word overlap
    if not PDF_DIR.exists():
        return None
    node_words = set(node_id.split("-")) - _SKIP_WORDS
    best_path, best_score = None, 0
    for pdf in PDF_DIR.iterdir():
        if pdf.suffix.lower() != ".pdf":
            continue
        file_words = set(re.sub(r"[^a-z0-9]+", "-", pdf.stem.lower()).split("-")) - _SKIP_WORDS
        score = len(node_words & file_words)
        if score > best_score:
            best_score = score
            best_path = pdf
    return best_path if best_score >= 2 else None


def get_passages(case_id: str) -> list[LocalPassage]:
    """Return all passages for a resolved case_id, ordered by para_no."""
    if not DB_PATH.exists():
        return []
    con = sqlite3.connect(DB_PATH)
    rows = con.execute(
        "SELECT para_no, text FROM passages WHERE case_id = ? ORDER BY para_no",
        (case_id,),
    ).fetchall()
    con.close()
    return [LocalPassage(case_id=case_id, para_no=r[0], text=r[1], score=0.0)
            for r in rows]


def get_relevant_passages(case_id: str, claim: str, k: int = 5) -> list[LocalPassage]:
    """
    Return the k passages most semantically relevant to claim.
    Uses BAAI/bge-small-en-v1.5 embeddings stored in SQLite.
    Falls back to first k passages when fastembed is unavailable.
    """
    if not DB_PATH.exists():
        return []

    from app.adapters.neo4j.embedder import embed
    query_vec = embed(claim)

    con = sqlite3.connect(DB_PATH)
    rows = con.execute(
        "SELECT para_no, text, embedding FROM passages WHERE case_id = ? ORDER BY para_no",
        (case_id,),
    ).fetchall()
    con.close()

    if not rows:
        return []

    if query_vec is None:
        # fastembed unavailable — return first k passages
        return [LocalPassage(case_id=case_id, para_no=r[0], text=r[1], score=0.0)
                for r in rows[:k]]

    q = np.array(query_vec, dtype=np.float32)
    q /= np.linalg.norm(q) + 1e-9

    scored: list[tuple[float, int, str]] = []
    for para_no, text, emb_bytes in rows:
        n = len(emb_bytes) // 4
        vec = np.frombuffer(emb_bytes, dtype=np.float32).copy()
        vec /= np.linalg.norm(vec) + 1e-9
        score = float(np.dot(q, vec[:len(q)]))
        scored.append((score, para_no, text))

    scored.sort(reverse=True)
    return [
        LocalPassage(case_id=case_id, para_no=para_no, text=text, score=score)
        for score, para_no, text in scored[:k]
    ]


def find_highlight(text: str, claim: str) -> tuple[int, int, str]:
    """
    Find the sentence within text that best matches claim.
    Returns (char_start, char_end, highlight_text) — offsets within text.

    Deterministic — no LLM needed.  Uses keyword overlap scoring.
    """
    claim_words = set(re.findall(r"[a-z]{4,}", claim.lower()))

    # Split on sentence boundaries
    sentence_spans: list[tuple[int, int]] = []
    for m in re.finditer(r"[^.!?\n]{10,}[.!?\n]?", text):
        sentence_spans.append((m.start(), m.end()))

    if not sentence_spans:
        end = min(300, len(text))
        return 0, end, text[:end]

    best_start, best_end, best_score = 0, min(300, len(text)), 0

    for start, end in sentence_spans:
        sent = text[start:end]
        sent_words = set(re.findall(r"[a-z]{4,}", sent.lower()))
        score = len(claim_words & sent_words)
        if score > best_score:
            best_score = score
            best_start, best_end = start, end

    # Expand to include neighbouring sentence if highlight is very short
    span = text[best_start:best_end].strip()
    if len(span) < 80 and best_end < len(text):
        # grab next sentence too
        for start, end in sentence_spans:
            if start >= best_end:
                best_end = end
                break

    return best_start, best_end, text[best_start:best_end].strip()
