from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class Layer1Verdict(str, Enum):
    FABRICATED = "FABRICATED"
    MISAPPLIED = "MISAPPLIED"
    VERIFIED   = "VERIFIED"


class Layer2Verdict(str, Enum):
    OVERRULED     = "OVERRULED"
    DISTINGUISHED = "DISTINGUISHED"
    GOOD_LAW      = "GOOD_LAW"
    UNAVAILABLE   = "UNAVAILABLE"   # Neo4j unreachable — demo never crashes
    NOT_CHECKED   = "NOT_CHECKED"   # FABRICATED citations skip Layer 2


class TreatmentEdge(BaseModel):
    citing_case: str
    year: int
    court: str
    context: str


class Layer1Result(BaseModel):
    verdict: Layer1Verdict
    confidence: float = Field(ge=0.0, le=1.0)
    node_id: str | None = None
    proposition_cited: str | None = None
    proposition_actual: str | None = None
    explanation: str
    llm_explanation: str | None = None


class Layer2Result(BaseModel):
    verdict: Layer2Verdict
    overruled_by: list[TreatmentEdge] = []
    distinguished_by: list[TreatmentEdge] = []
    source: str


class StatutoryResult(BaseModel):
    act: str
    year: int
    section: str
    exists: bool | None   # None = verification failed (timeout)
    api_status: int | None
    excerpt: str | None = None
    source_url: str


class AlternativeSuggestion(BaseModel):
    suggestion: str  # "Case Name — rationale from Nemotron"


class ContextAnalysis(BaseModel):
    """
    Nemotron multi-agent pipeline output (Steps 3-5).

    Step 3 (Nano):  document_claim — what the author claims the citation establishes
    Step 4 (Super): claim_matches  — whether that claim matches the actual proposition
    Step 5 (Super): alternatives   — better citations when claim_matches is False
    """
    document_claim: str | None = None
    claim_matches: bool | None = None   # None = not analyzed (Nemotron not configured)
    mismatch_reason: str | None = None
    alternatives: list[AlternativeSuggestion] = []
    agent_model: str = "nemotron-super-120b"


class CorpusSource(BaseModel):
    """The verified corpus record matched to this citation — shown as provenance in the UI."""
    node_id: str
    citation: str
    short_name: str
    court: str | None = None
    domain: str | None = None
    bailii_url: str | None = None
    status: str             # GOOD_LAW | OVERRULED | PARTIALLY_OVERRULED
    key_paragraph: str | None = None  # verbatim excerpt from the judgment


class TransparencyCard(BaseModel):
    """Model card for the Proof Panel — explains how the verdict was reached."""
    method: str             # human-readable description of the verification method
    verdict_source: str     # "Deterministic corpus lookup" | "Agent (Nemotron Super + tools)"
    corpus_size: int
    limitations: list[str]


class ProofPanel(BaseModel):
    """
    Full proof package for a single citation — used by the split-screen Proof Panel UI.

    Returned by GET /api/proof/{matter_id}/{idx}.
    The frontend displays this when the user clicks a citation in the results list.
    """
    matter_id: str
    citation_index: int
    raw_citation: str

    verdict: str            # FABRICATED | MISAPPLIED | VERIFIED
    confidence: float

    # Side-by-side comparison
    document_claim: str | None      # what the brief says this case establishes
    corpus_proposition: str | None  # what the case actually establishes (one-line summary)
    key_paragraph: str | None       # verbatim excerpt from the judgment

    # Good-law status
    good_law_status: str            # GOOD_LAW | OVERRULED | DISTINGUISHED | UNAVAILABLE | NOT_CHECKED
    overruled_by: list[TreatmentEdge] = []
    distinguished_by: list[TreatmentEdge] = []

    # Links and plain-English explanation
    bailii_url: str | None = None
    llm_explanation: str | None = None
    static_explanation: str = ""

    transparency: TransparencyCard


class CitationResult(BaseModel):
    raw_text: str
    corpus_source: CorpusSource | None = None   # None only for FABRICATED citations
    layer1: Layer1Result
    layer2: Layer2Result
    statutory: StatutoryResult | None = None
    context_analysis: ContextAnalysis | None = None


class FinancialSummary(BaseModel):
    n_fabricated: int
    n_misapplied: int
    n_overruled: int
    n_verified: int
    flag_rate: float
    savings_gbp: float
    risk_ev_gbp: float
    baseline_hallucination_rate: float = 0.43  # Stanford GPT-4 on legal queries


class VerifyResult(BaseModel):
    matter_id: str
    total_citations: int
    results: list[CitationResult]
    financial: FinancialSummary
    processing_ms: int
    audit_trail_hash: str
