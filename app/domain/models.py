from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class Layer1Verdict(str, Enum):
    FABRICATED    = "FABRICATED"
    MISAPPLIED    = "MISAPPLIED"
    VERIFIED      = "VERIFIED"
    UNVERIFIABLE  = "UNVERIFIABLE"   # case exists but holding could not be determined


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
    proposition_cited: str | None = None   # what the skeleton claims (from misapplied table)
    proposition_actual: str | None = None  # what the case actually establishes (from corpus)
    explanation: str                        # deterministic one-line source explanation


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


# ── Holding analysis (Agent 2 output) ────────────────────────────────────────

class BriefPointer(BaseModel):
    """Locates the claim inside the uploaded skeleton argument."""
    sentence: str                  # exact sentence in the brief making the legal claim
    paragraph_hint: str | None     # estimated section / paragraph label e.g. "§3.2"
    char_position: int | None      # character offset in the uploaded document


class JudgmentPointer(BaseModel):
    """
    Points to a specific chunk in the judgment — traceable by the lawyer.

    Note: para_no is a 0-based chunk index from the PDF-ingest ETL, not an
    official judgment paragraph number. There is no pre-labelled holding flag;
    is_holding is inferred by the HoldingJudge from the content of the chunk.
    """
    para_no: int                   # 0-based chunk index (e.g. 3 = chunk 3 of this case)
    excerpt: str                   # first ~100 characters of the chunk
    is_holding: bool               # True if HoldingJudge identified this as the ratio


class AmendmentSuggestion(BaseModel):
    """A case from the corpus that genuinely supports the proposition the lawyer needs."""
    citation: str                  # full citation from corpus
    short_name: str                # display name
    proposition: str               # what this case actually establishes
    rationale: str                 # one sentence on why it fits better


class HoldingAnalysis(BaseModel):
    """
    Rich output of Agent 2's holding-based verification.

    Produced by the HoldingJudge after the CitationAgent retrieves judgment
    passages from Neo4j.  All pointer fields reference text that genuinely
    exists in the document or judgment — nothing is invented.

    Modes:
      holding_found=True  + judgment_pointers non-empty  → full analysis
      holding_found=True  + judgment_pointers empty       → degraded (corpus proposition used)
      holding_found=False                                 → unverifiable, no inference made
    """
    case_summary: str | None = None        # 2-4 sentences: what the judge actually decided
    verdict_reasoning: str | None = None   # plain English: why usage matches / does not
    brief_pointer: BriefPointer | None = None
    judgment_pointers: list[JudgmentPointer] = []
    amendments: list[AmendmentSuggestion] = []
    confidence: float = 0.0
    holding_found: bool = False
    analysis_mode: str = "none"            # "full" | "degraded" | "none"
    agent_model: str = ""


# ── Corpus provenance ─────────────────────────────────────────────────────────

class CorpusSource(BaseModel):
    """The verified corpus record matched to this citation — shown as provenance in the UI."""
    node_id: str
    citation: str           # canonical full citation from corpus
    short_name: str         # display name
    court: str | None = None
    domain: str | None = None
    bailii_url: str | None = None
    status: str             # GOOD_LAW | OVERRULED | PARTIALLY_OVERRULED


# ── Per-citation result ───────────────────────────────────────────────────────

class CitationResult(BaseModel):
    raw_text: str
    corpus_source: CorpusSource | None = None
    layer1: Layer1Result
    layer2: Layer2Result
    statutory: StatutoryResult | None = None
    holding_analysis: HoldingAnalysis | None = None
    document_context: str | None = None      # ±400 chars around citation in uploaded doc
    document_char_pos: int | None = None     # character offset in the original document


# ── Verification report ───────────────────────────────────────────────────────

class VerifyResult(BaseModel):
    matter_id: str
    total_citations: int
    results: list[CitationResult]
    processing_ms: int
    audit_trail_hash: str


# ── Proof panel (single-citation deep-dive) ───────────────────────────────────

class TransparencyCard(BaseModel):
    method: str
    verdict_source: str
    corpus_size: int
    limitations: list[str]


class ProofPanel(BaseModel):
    """Full evidence pack for a single citation — split-screen UI."""
    matter_id: str
    citation_index: int
    raw_citation: str
    verdict: str
    confidence: float
    document_context: str | None = None
    brief_pointer: BriefPointer | None = None
    case_summary: str | None = None
    verdict_reasoning: str | None = None
    judgment_pointers: list[JudgmentPointer] = []
    amendments: list[AmendmentSuggestion] = []
    good_law_status: str
    overruled_by: list[TreatmentEdge] = []
    distinguished_by: list[TreatmentEdge] = []
    bailii_url: str | None = None
    static_explanation: str = ""
    transparency: TransparencyCard
