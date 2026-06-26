from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class CaseNode:
    node_id: str
    citation: str
    short_name: str
    domain: str
    propositions: list[str]
    status: str  # "GOOD_LAW" | "OVERRULED" | "PARTIALLY_OVERRULED"


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

    def list_all(self) -> list[dict]:
        """
        Returns all verified cases as [{citation, short_name, proposition}].
        Used by Agent 5 (Nemotron alternative finder) to search for better citations.
        Default implementation returns empty list — override in concrete adapters.
        """
        return []
