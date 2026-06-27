from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class CaseNode:
    node_id: str
    citation: str
    short_name: str
    domain: str
    propositions: list[str]
    status: str            # "GOOD_LAW" | "OVERRULED" | "PARTIALLY_OVERRULED"
    court: str | None = None
    bailii_url: str | None = None


@dataclass
class Passage:
    """
    A judgment chunk stored in Neo4j as a :Passage node.

    Honest constraints from the live graph:
      - para_no  is a 0-based CHUNK INDEX from the PDF-ingest ETL, not an
                 official paragraph number like [47]. There is no isHolding flag.
      - text     is ~900 chars, OCR-derived — may be noisy on scanned cases.
      - case_id  is the Case.id from the PDF-ingest layer (may differ from the
                 Case.nodeId slug used in the propositions layer).
    """
    passage_id: str        # "<case_id>#p<N>"  e.g. "anglia-television-ltd-v-reed#p3"
    case_id: str           # FK to Case.id (PDF-ingest layer)
    para_no: int           # 0-based chunk index — used for ordering and UI reference
    text: str              # ~900 chars, OCR-extracted with overlap
    source: str = "neo4j"


@dataclass
class SuggestionResult:
    """A case from the corpus that may better support a given proposition."""
    node_id: str
    citation: str
    short_name: str
    proposition: str       # what this case actually establishes
    domain: str
    bailii_url: str | None = None
    score: float = 0.0     # relevance score (higher = better)


class ICorpusRepository(ABC):

    @abstractmethod
    def lookup(self, citation_fragment: str) -> CaseNode | None:
        """Search the corpus for a citation. Returns None if not found (→ FABRICATED)."""
        ...

    @abstractmethod
    def get_misapplied_table(self) -> dict[str, str]:
        """
        Returns {node_id: incorrect_proposition_cited_in_skeleton}.
        Populated from lawyer-annotated MISAPPLIED_AS edges in Neo4j.
        """
        ...

    @abstractmethod
    def find_passages(self, node_id: str) -> list[Passage]:
        """
        Return all judgment passages for a case, ordered by paragraph sequence.
        Returns an empty list when no passages are stored (e.g. CSV fallback).
        The HoldingJudge degrades gracefully on an empty list.
        """
        ...

    def find_relevant_passages(
        self,
        node_id: str,
        claim_text: str,
        k: int = 5,
    ) -> list[Passage]:
        """
        Return the k passages most semantically relevant to claim_text.

        Default implementation ignores claim_text and returns all passages
        ordered by para_no — identical to find_passages().  Override in
        Neo4jCorpusAdapter to use the passage_embedding vector index
        (requires fastembed BAAI/bge-small-en-v1.5 installed locally).

        Falls back to find_passages() automatically when vector search
        is unavailable, so callers never need to handle the difference.
        """
        return self.find_passages(node_id)

    @abstractmethod
    def find_suggestions(
        self,
        proposition: str,
        brief_context: str,
        domain: str | None = None,
        limit: int = 6,
        exclude_node_id: str | None = None,
    ) -> list[SuggestionResult]:
        """
        Find cases from the corpus that genuinely support a given proposition.

        Args:
            proposition:      the legal proposition the author needs to support
            brief_context:    surrounding text from the skeleton (what the lawyer is arguing)
            domain:           filter by legal domain if known (e.g. "tort", "contract")
            limit:            maximum results to return
            exclude_node_id:  node_id of the citation being analysed — excluded from results
                              so the MISAPPLIED case never suggests itself as a replacement.
        """
        ...
