from app.domain.risk_calculator import compute_financial_summary
from app.domain.models import (
    CitationResult, Layer1Result, Layer2Result,
    Layer1Verdict, Layer2Verdict,
)


def _make_result(l1_verdict: str, l2_verdict: str = "NOT_CHECKED") -> CitationResult:
    return CitationResult(
        raw_text="test citation",
        layer1=Layer1Result(
            verdict=Layer1Verdict(l1_verdict),
            confidence=1.0,
            explanation="test",
        ),
        layer2=Layer2Result(
            verdict=Layer2Verdict(l2_verdict),
            source="test",
        ),
    )


def test_savings_calculation():
    # (240 - 4) / 60 × 300 = 1180.0
    results = [_make_result("FABRICATED")] * 2 + [_make_result("VERIFIED")] * 10
    summary = compute_financial_summary(results)
    assert summary.savings_gbp == 1180.0


def test_risk_ev_calculation():
    # 2 × 62000 = 124000
    results = [_make_result("FABRICATED")] * 2 + [_make_result("VERIFIED")] * 10
    summary = compute_financial_summary(results)
    assert summary.risk_ev_gbp == 124_000.0


def test_flag_rate_with_two_flagged_of_twelve():
    results = (
        [_make_result("FABRICATED")] * 1
        + [_make_result("MISAPPLIED")] * 1
        + [_make_result("VERIFIED")] * 10
    )
    summary = compute_financial_summary(results)
    assert abs(summary.flag_rate - 2 / 12) < 0.001


def test_empty_results_does_not_raise():
    summary = compute_financial_summary([])
    assert summary.flag_rate == 0.0
    assert summary.risk_ev_gbp == 0.0
    assert summary.savings_gbp == 1180.0   # savings exist regardless of document size


def test_overruled_count():
    results = [_make_result("VERIFIED", "OVERRULED")] * 3 + [_make_result("VERIFIED", "GOOD_LAW")] * 7
    summary = compute_financial_summary(results)
    assert summary.n_overruled == 3


def test_stanford_baseline_constant():
    summary = compute_financial_summary([])
    assert summary.baseline_hallucination_rate == 0.43
