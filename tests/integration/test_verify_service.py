"""
Integration tests for VerifyService using in-memory test doubles.
No Neo4j, no HTTP — fast, deterministic, offline.
"""
import pytest
from app.services.verify_service import VerifyService
from app.domain.models import Layer1Verdict, Layer2Verdict
from app.ports.corpus import CaseNode
from app.ports.treatment import TreatmentHistory
from tests.fakes import (
    InMemoryCorpus, InMemoryTreatment, InMemoryStatutory,
    InMemoryIngestor, InMemoryAudit,
)


def make_service(
    corpus: InMemoryCorpus | None = None,
    treatment: InMemoryTreatment | None = None,
    text: str = "",
) -> VerifyService:
    return VerifyService(
        corpus=corpus or InMemoryCorpus({}),
        treatment=treatment or InMemoryTreatment(),
        statutory=InMemoryStatutory(),
        ingestor=InMemoryIngestor(text=text),
        audit=InMemoryAudit(),
    )


_DONOGHUE = CaseNode(
    "donoghue-1932", "Donoghue v Stevenson [1932] AC 562",
    "Donoghue v Stevenson", "tort",
    ["Manufacturer owes duty of care to ultimate consumer"], "GOOD_LAW",
)


class TestVerifyService:

    def test_fabricated_when_not_in_corpus(self):
        service = make_service(text="Pemberton v Richards [2019] EWHC 1234")
        result = service.run(b"", "test.txt")
        assert result.total_citations == 1
        assert result.results[0].layer1.verdict == Layer1Verdict.FABRICATED

    def test_fabricated_citation_skips_layer2(self):
        treatment = InMemoryTreatment()
        service = make_service(
            text="Pemberton v Richards [2019] EWHC 1234",
            treatment=treatment,
        )
        result = service.run(b"", "test.txt")
        assert result.results[0].layer2.verdict == Layer2Verdict.NOT_CHECKED

    def test_verified_citation_uses_layer2(self):
        corpus = InMemoryCorpus({"donoghue-1932": _DONOGHUE})
        treatment = InMemoryTreatment({"donoghue-1932": TreatmentHistory("GOOD_LAW", source="memory")})
        service = make_service(
            corpus=corpus,
            treatment=treatment,
            text="Donoghue v Stevenson [1932] AC 562",
        )
        result = service.run(b"", "test.txt")
        assert result.results[0].layer1.verdict == Layer1Verdict.VERIFIED
        assert result.results[0].layer2.verdict == Layer2Verdict.GOOD_LAW

    def test_misapplied_with_wrong_proposition(self):
        corpus = InMemoryCorpus(
            {"donoghue-1932": _DONOGHUE},
            misapplied={"donoghue-1932": "Wrong proposition about tortious interference"},
        )
        service = make_service(corpus=corpus, text="Donoghue v Stevenson [1932] AC 562")
        result = service.run(b"", "test.txt")
        assert result.results[0].layer1.verdict == Layer1Verdict.MISAPPLIED

    def test_needs_human_returns_empty_results(self):
        service = VerifyService(
            corpus=InMemoryCorpus({}),
            treatment=InMemoryTreatment(),
            statutory=InMemoryStatutory(),
            ingestor=InMemoryIngestor(text="", confidence=0.0),
            audit=InMemoryAudit(),
        )
        result = service.run(b"", "scanned.pdf")
        assert result.total_citations == 0
        assert result.results == []

    def test_financial_summary_computed(self):
        service = make_service(text="Pemberton v Richards [2019] EWHC 1234")
        result = service.run(b"", "test.txt")
        assert result.financial.savings_gbp == 1180.0
        assert result.financial.n_fabricated == 1
        assert result.financial.risk_ev_gbp == 62_000.0

    def test_audit_trail_hash_is_64_chars(self):
        service = make_service(text="Donoghue v Stevenson [1932] AC 562")
        result = service.run(b"", "test.txt")
        assert len(result.audit_trail_hash) == 64

    def test_matter_id_is_uuid(self):
        import uuid
        service = make_service()
        result = service.run(b"", "empty.txt")
        uuid.UUID(result.matter_id)   # raises if invalid
