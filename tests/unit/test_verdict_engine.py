import pytest
from app.domain.verdict_engine import compute_layer1
from app.domain.models import Layer1Verdict
from app.ports.corpus import CaseNode


def test_fabricated_when_corpus_returns_none():
    result = compute_layer1("Pemberton v Richards [2019] EWHC 1234", None, {})
    assert result.verdict == Layer1Verdict.FABRICATED
    assert result.confidence == 1.0
    assert result.node_id is None
    assert result.explanation != ""


def test_misapplied_when_node_in_misapplied_table(hedley_node):
    result = compute_layer1(
        "Hedley Byrne v Heller [1964]",
        hedley_node,
        {hedley_node.node_id: "General duty of care for tortious interference"},
    )
    assert result.verdict == Layer1Verdict.MISAPPLIED
    assert result.confidence == 1.0
    assert result.node_id == hedley_node.node_id
    assert "tortious interference" in (result.proposition_cited or "")
    assert result.proposition_actual == hedley_node.propositions[0]


def test_verified_when_found_and_not_in_misapplied_table(donoghue_node):
    result = compute_layer1("Donoghue v Stevenson [1932]", donoghue_node, {})
    assert result.verdict == Layer1Verdict.VERIFIED
    assert result.confidence == 1.0
    assert result.node_id == donoghue_node.node_id


def test_fabricated_has_confidence_1():
    result = compute_layer1("Invented Case [2099] UKSC 999", None, {})
    assert result.confidence == 1.0


def test_misapplied_when_node_has_no_propositions():
    node = CaseNode("n1", "X v Y [2000] AC 1", "X v Y", "tort", [], "GOOD_LAW")
    result = compute_layer1("X v Y", node, {"n1": "Wrong proposition"})
    assert result.verdict == Layer1Verdict.MISAPPLIED
    assert result.proposition_actual is None
