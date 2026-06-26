"""
In-memory test doubles (fakes) implementing the port interfaces.
Import these directly in unit and integration tests — no IO, no network.
"""
from __future__ import annotations

from app.ports.audit import IAuditLog
from app.ports.corpus import CaseNode, ICorpusRepository
from app.ports.document import IDocumentIngestor, IngestedDocument
from app.ports.statutory import IStatutoryVerifier, StatutoryLookup
from app.ports.treatment import ITreatmentRepository, TreatmentHistory


class InMemoryCorpus(ICorpusRepository):
    def __init__(
        self,
        nodes: dict[str, CaseNode],
        misapplied: dict[str, str] | None = None,
    ) -> None:
        self._nodes = nodes
        self._misapplied: dict[str, str] = misapplied or {}

    def lookup(self, citation_fragment: str) -> CaseNode | None:
        fragment_lower = citation_fragment.lower()
        for node in self._nodes.values():
            if (node.short_name.lower() in fragment_lower
                    or node.citation.lower() in fragment_lower):
                return node
        return None

    def get_misapplied_table(self) -> dict[str, str]:
        return dict(self._misapplied)


class InMemoryTreatment(ITreatmentRepository):
    def __init__(self, histories: dict[str, TreatmentHistory] | None = None) -> None:
        self._histories: dict[str, TreatmentHistory] = histories or {}

    def get_history(self, node_id: str) -> TreatmentHistory:
        return self._histories.get(
            node_id, TreatmentHistory(verdict="GOOD_LAW", source="memory")
        )


class InMemoryStatutory(IStatutoryVerifier):
    def __init__(self, results: dict[tuple, bool] | None = None) -> None:
        self._results: dict[tuple, bool] = results or {}

    def verify(self, act: str, year: int, section: str) -> StatutoryLookup:
        exists = self._results.get((act, year, section))
        return StatutoryLookup(
            act=act, year=year, section=section,
            exists=exists,
            status_code=200 if exists else 404,
            excerpt=None, url="",
        )

    def verify_from_text(self, raw: str) -> StatutoryLookup | None:
        return None


class InMemoryIngestor(IDocumentIngestor):
    def __init__(self, text: str = "", confidence: float = 1.0) -> None:
        self._text = text
        self._confidence = confidence

    def extract(self, content: bytes, filename: str) -> IngestedDocument:
        source_type = "digital" if self._confidence >= 0.6 else "needs_human"
        return IngestedDocument(
            text=self._text,
            confidence=self._confidence,
            source_type=source_type,
        )


class InMemoryAudit(IAuditLog):
    def __init__(self) -> None:
        self._entries: list[dict] = []

    def record(self, action: str, ref: str, grounding: list[str]) -> None:
        self._entries.append({"action": action, "ref": ref, "grounding": grounding})

    def digest(self) -> str:
        return "a" * 64  # deterministic 64-char stub
