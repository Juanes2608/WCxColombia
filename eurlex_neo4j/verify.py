"""
verify.py - turn the graph into the White & Case verdict for each citation.

Split of responsibility:
  * the GRAPH answers "does this case exist?" and "is it still good law?"
    (deterministic, auditable, no hallucination).
  * an LLM (later) answers "was it applied correctly in context?" and does
    the messy extraction of citations from a document.

The LLM is abstracted behind `CitationExtractor` so we can swap providers
(Claude / Nemotron / Perplexity / ...) and compare them on the same cases.
This phase ships the deterministic half + a stub extractor.

Coverage nuance (from the Clio data note): coverage is NEVER complete, so a
case we can't find is NOT automatically "fabricated". We separate:
  CONFIRMED_REAL  - found in the corpus
  NOT_FOUND       - absent from OUR corpus (could be a coverage gap)
and only escalate NOT_FOUND -> LIKELY_FABRICATED when the corpus is broad
AND there's a fabrication signal. The tool declares its own uncertainty
instead of over-claiming (the "aviation safety" framing).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from enum import Enum

from rapidfuzz import fuzz

from eurlex_neo4j.graph import CitationGraph

# Below this fuzzy name-match score (0-100) we don't trust a "match".
MATCH_THRESHOLD = 82


# ── data shapes ───────────────────────────────────────────────────────────
@dataclass
class Citation:
    """One citation pulled from a document (by the extractor)."""
    raw_text: str                      # exactly as it appears in the document
    name: str | None = None            # parsed case name, e.g. "Caparo v Dickman"
    citation: str | None = None        # neutral/report cite, e.g. "[1990] UKHL 2"
    context: str | None = None         # the sentence/claim it's cited to support
    fabrication_signal: bool = False   # extractor's hint that it looks invented


class Status(str, Enum):
    VERIFIED = "VERIFIED"            # ✅ exists + good law (+ correctly applied)
    MISAPPLIED = "MISAPPLIED"       # 🟠 exists but overruled / used out of context
    UNVERIFIABLE = "UNVERIFIABLE"   # ⚪ not in our corpus — declare uncertainty
    FABRICATED = "FABRICATED"       # 🔴 not found + broad corpus + fabrication signal


@dataclass
class VerifyResult:
    citation: str
    status: Status
    existence: str                  # CONFIRMED_REAL | NOT_FOUND
    treatment: str                  # GOOD_LAW | OVERRULED | UNKNOWN
    confidence: float               # 0.0 - 1.0
    matched_case: dict | None = None
    why: str = ""
    evidence: list = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        return d


# ── the swappable LLM seam ────────────────────────────────────────────────
class CitationExtractor(ABC):
    """Pulls citations out of a document. Real impl = LLM (later phase)."""

    @abstractmethod
    def extract(self, document_text: str) -> list[Citation]:
        ...


class StubExtractor(CitationExtractor):
    """No-LLM stand-in: returns a list of Citations you hand it directly."""

    def __init__(self, citations: list[Citation]):
        self._citations = citations

    def extract(self, document_text: str) -> list[Citation]:
        return self._citations


# ── the deterministic core (graph-backed) ─────────────────────────────────
def _best_match(graph: CitationGraph, cit: Citation) -> tuple[dict | None, float]:
    """Find the best graph node for a citation; return (node, score 0-100)."""
    # exact citation hit is the strongest signal
    if cit.citation:
        for row in graph.find_case(cit.citation):
            if row.get("citation") == cit.citation:
                return row, 100.0
    # otherwise fuzzy-match on name against candidates the graph returns
    query = cit.name or cit.raw_text
    candidates = graph.find_case(query, limit=10)
    best, best_score = None, 0.0
    for row in candidates:
        score = fuzz.token_set_ratio(query.lower(), (row.get("name") or "").lower())
        if score > best_score:
            best, best_score = row, score
    return (best, best_score) if best_score >= MATCH_THRESHOLD else (None, best_score)


def verify_citation(
    graph: CitationGraph,
    cit: Citation,
    corpus_is_broad: bool = False,
) -> VerifyResult:
    """Classify ONE citation using the graph (existence + treatment)."""
    match, score = _best_match(graph, cit)

    # --- not found: split coverage-gap vs fabrication (never conflate) ----
    if match is None:
        if corpus_is_broad and cit.fabrication_signal:
            return VerifyResult(
                citation=cit.raw_text, status=Status.FABRICATED,
                existence="NOT_FOUND", treatment="UNKNOWN",
                confidence=0.85,
                why="Not found in a broad authority set and shows fabrication "
                    "signals — likely invented.",
            )
        return VerifyResult(
            citation=cit.raw_text, status=Status.UNVERIFIABLE,
            existence="NOT_FOUND", treatment="UNKNOWN",
            confidence=0.3,
            why="Not found in the available sources. This may be a coverage "
                "gap rather than a fabrication — verify manually.",
        )

    # --- found: check whether it is still good law ------------------------
    overruled = graph.negative_treatment(match["id"])
    if overruled:
        by = overruled[0]
        return VerifyResult(
            citation=cit.raw_text, status=Status.MISAPPLIED,
            existence="CONFIRMED_REAL", treatment="OVERRULED",
            confidence=round(score / 100, 2), matched_case=match,
            why=f"Real case, but overruled by {by.get('by_name')} "
                f"{by.get('by_citation') or ''} — no longer good law.",
            evidence=overruled,
        )

    # found + good law. (Correct-application-in-context = LLM, later phase.)
    return VerifyResult(
        citation=cit.raw_text, status=Status.VERIFIED,
        existence="CONFIRMED_REAL", treatment="GOOD_LAW",
        confidence=round(score / 100, 2), matched_case=match,
        why=f"Found in corpus as '{match.get('name')}' "
            f"({match.get('source')}); no negative treatment recorded.",
    )


def verify_document(
    document_text: str,
    extractor: CitationExtractor,
    corpus_is_broad: bool = False,
) -> list[dict]:
    """Extract every citation from a document and classify each one."""
    graph = CitationGraph()
    try:
        results = [
            verify_citation(graph, cit, corpus_is_broad).to_dict()
            for cit in extractor.extract(document_text)
        ]
    finally:
        graph.close()
    return results


# ── manual demo (needs a loaded Neo4j) ────────────────────────────────────
if __name__ == "__main__":
    # Three citations like a skeleton argument would contain:
    demo = [
        Citation(raw_text="Caparo Industries plc v Dickman", name="Caparo Industries v Dickman"),
        Citation(raw_text="American Cyanamid Co v Ethicon Ltd [1975] UKHL 1",
                 name="American Cyanamid v Ethicon", citation="[1975] UKHL 1"),
        Citation(raw_text="Crestholm Dynamics plc v Veltros Industries Inc [2021] EWHC 9999 (Comm)",
                 name="Crestholm Dynamics v Veltros", citation="[2021] EWHC 9999 (Comm)",
                 fabrication_signal=True),
    ]
    for r in verify_document("", StubExtractor(demo), corpus_is_broad=True):
        print(f"[{r['status']:12}] {r['citation'][:55]:55} :: {r['why']}")
