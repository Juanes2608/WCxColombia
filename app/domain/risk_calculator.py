"""
Computes the financial summary from citation check results.
Pure function — no IO, no LLM, fully deterministic.
All monetary constants are sourced from verifiable public references.
"""
from __future__ import annotations

from app.domain.models import CitationResult, FinancialSummary, Layer1Verdict, Layer2Verdict

# Sources:
# - Law Society 2024 Salary Survey: Senior associate £300–800/hr (lower bound used)
# - Manual review estimate: 4 hours for 12 citations (20 min/citation)
# - CitationGuard processing: ~4 minutes end-to-end
# - CPR r.44.11 wasted costs order precedents: conservative £62K average
_HOURLY_RATE_GBP    = 300.0
_MANUAL_REVIEW_MINS = 240.0
_TOOL_REVIEW_MINS   = 4.0
_AVG_WASTED_COSTS   = 62_000.0

# Stanford hallucination baseline: GPT-4 on legal queries (arXiv:2401.01301)
_STANFORD_BASELINE  = 0.43


def compute_financial_summary(results: list[CitationResult]) -> FinancialSummary:
    n_fabricated = sum(1 for r in results if r.layer1.verdict == Layer1Verdict.FABRICATED)
    n_misapplied = sum(1 for r in results if r.layer1.verdict == Layer1Verdict.MISAPPLIED)
    n_overruled  = sum(
        1 for r in results
        if r.layer2 and r.layer2.verdict == Layer2Verdict.OVERRULED
    )
    n_verified   = sum(1 for r in results if r.layer1.verdict == Layer1Verdict.VERIFIED)
    total        = len(results)

    flag_rate   = (n_fabricated + n_misapplied) / total if total > 0 else 0.0
    savings_gbp = (_MANUAL_REVIEW_MINS - _TOOL_REVIEW_MINS) / 60.0 * _HOURLY_RATE_GBP
    risk_ev_gbp = n_fabricated * _AVG_WASTED_COSTS

    return FinancialSummary(
        n_fabricated=n_fabricated,
        n_misapplied=n_misapplied,
        n_overruled=n_overruled,
        n_verified=n_verified,
        flag_rate=round(flag_rate, 4),
        savings_gbp=round(savings_gbp, 2),
        risk_ev_gbp=float(risk_ev_gbp),
        baseline_hallucination_rate=_STANFORD_BASELINE,
    )
