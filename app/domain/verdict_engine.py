"""
Computes Layer 1 verdict from corpus lookup result.
Pure function — no IO, fully deterministic.

FABRICATED is NEVER produced by an LLM.
It is produced only by a None return from ICorpusRepository.lookup().
"""
from __future__ import annotations

from app.domain.models import Layer1Result, Layer1Verdict
from app.ports.corpus import CaseNode


def compute_layer1(
    raw_text: str,
    corpus_result: CaseNode | None,
    misapplied_table: dict[str, str],
) -> Layer1Result:
    """
    Args:
        raw_text: The raw citation string extracted from the document.
        corpus_result: The matching CaseNode from the corpus, or None if not found.
        misapplied_table: Maps node_id → incorrect proposition cited in this skeleton.
                          Populated from lawyer-annotated data in Neo4j.
    """
    if corpus_result is None:
        return Layer1Result(
            verdict=Layer1Verdict.FABRICATED,
            confidence=1.0,
            explanation="Citation not found in the England & Wales corpus.",
        )

    incorrect_prop = misapplied_table.get(corpus_result.node_id)
    if incorrect_prop:
        actual = corpus_result.propositions[0] if corpus_result.propositions else None
        return Layer1Result(
            verdict=Layer1Verdict.MISAPPLIED,
            confidence=1.0,
            node_id=corpus_result.node_id,
            proposition_cited=incorrect_prop,
            proposition_actual=actual,
            explanation=(
                f"Case exists but is cited for the wrong proposition. "
                f"It actually establishes: '{actual}'."
                if actual else
                "Case exists but the cited proposition does not match the case's holdings."
            ),
        )

    return Layer1Result(
        verdict=Layer1Verdict.VERIFIED,
        confidence=1.0,
        node_id=corpus_result.node_id,
        explanation="Citation verified against the England & Wales corpus.",
    )
