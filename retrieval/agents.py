"""
agents.py - the 3-agent citation-verification pipeline.

Three searches, each backed by a data-layer capability that already exists:

  Agent 1 (existence)  -> CitationGraph.find_case + negative_treatment   (graph.py)
  Agent 2 (context)    -> Retriever.retrieve_passages(case_id=<that case>) (retrieve.py)
                          + a GRAPH-backed proposition check against the
                            teammate's :Proposition / :MisappliedPattern layer
  Agent 3 (fallback)   -> Retriever.retrieve_passages(case_id=None)        (retrieve.py)

Agent 2's "does the cited paragraph actually support how the citation is used?"
has two deterministic signals now:
  1. cosine similarity over the case's own passages (ContextJudge), and
  2. the teammate's graph layer - if the document's proposition matches a known
     :MisappliedPattern (or matches NONE of the case's real :Propositions), that
     is a deterministic misapplication signal that overrides the cosine guess.
The LLMJudge seam is still there for full doctrinal judgement.

The whole pipeline is READ-ONLY against Neo4j.
"""

from __future__ import annotations

import math
import os
import re
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field

from rapidfuzz import fuzz

from eurlex_neo4j.graph import CitationGraph
from eurlex_neo4j.verify import Citation, Status
from retrieval.retrieve import Retriever

# Cosine thresholds for the deterministic Agent-2 passage judge (tunable).
SUPPORTS_HI = 0.58       # top passage >= this -> the source supports the use
WEAK_LO = 0.45           # top passage <  this -> the source does not support it

# Graph proposition-match thresholds (Agent 2, authoritative layer).
PROP_MATCH = 0.55        # claim ~ a real/incorrect proposition at/above this
PROP_MISS = 0.42         # claim below this against ALL real propositions -> off-topic

# Fuzzy name-match score (0-100) to count a citation as "in corpus".
MATCH_THRESHOLD = 80

# A modern neutral-citation court code => post-2001 case; classics use report
# cites (AC, WLR, All ER, QB, Ch...). Absent-from-corpus + neutral form is a
# (soft) fabrication signal, kept SEPARATE from the verdict to stay honest.
NEUTRAL_CITE = re.compile(r"\b(EWHC|EWCA|UKSC|UKPC|EWCOP|EWFC|UKUT)\b")


def _cos(a: list[float], b: list[float]) -> float:
    s = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return s / (na * nb) if na and nb else 0.0


def _fabrication_risk(cit: Citation) -> str:
    """Soft, deterministic risk flag for a not-found citation (not a verdict)."""
    text = f"{cit.citation or ''} {cit.raw_text or ''}"
    return "elevated" if NEUTRAL_CITE.search(text) else "low"


# ── Agent 2 judge: deterministic now, LLM-pluggable ────────────────────────
class ContextJudge(ABC):
    """Decides whether retrieved passages support the document's use of a cite."""

    @abstractmethod
    def judge(self, doc_context: str, passages: list[dict]) -> dict:
        """Return {supports: bool, confidence: float, best_passage: dict|None, why: str}."""
        ...


class SimilarityJudge(ContextJudge):
    """Deterministic proxy: trusts the cosine score the vector search returns."""

    name = "similarity"

    def judge(self, doc_context: str, passages: list[dict]) -> dict:
        if not passages:
            return {"supports": False, "confidence": 0.0, "best_passage": None,
                    "why": "No passages indexed for this case."}
        top = passages[0]
        score = float(top.get("score", 0.0))
        if score >= SUPPORTS_HI:
            supports, why = True, "A passage in the cited case closely matches the proposition."
        elif score < WEAK_LO:
            supports, why = False, "No passage in the cited case matches the proposition."
        else:
            supports, why = False, "Only a weak textual match - read the passage to confirm scope."
        return {"supports": supports, "confidence": round(score, 3),
                "best_passage": top, "why": why}


class LLMJudge(ContextJudge):
    """
    Real doctrinal judgement (does the holding support the proposition, in scope?).
    Stubbed until a provider/key is wired (Claude / Nemotron) - same pattern as
    NeMoEmbedder. Drop the model call here; the rest of the pipeline is unchanged.
    """

    name = "llm"

    def judge(self, doc_context: str, passages: list[dict]) -> dict:
        raise NotImplementedError(
            "LLMJudge is a stubbed seam. Wire a model call that reads the top "
            "passages and returns {supports, why}, then select it via "
            "JUDGE_PROVIDER=llm / get_judge('llm').")


def get_judge(provider: str | None = None) -> ContextJudge:
    """Factory. JUDGE_PROVIDER=local|llm (default: local)."""
    provider = (provider or os.environ.get("JUDGE_PROVIDER", "local")).lower()
    if provider in ("llm", "nemo", "claude"):
        return LLMJudge()
    return SimilarityJudge()


# ── result shape ───────────────────────────────────────────────────────────
@dataclass
class AgentResult:
    citation: str
    status: str                       # VERIFIED | MISAPPLIED | UNVERIFIABLE | FABRICATED
    existence: str                    # CONFIRMED_REAL | NOT_FOUND
    treatment: str                    # GOOD_LAW | OVERRULED | UNKNOWN
    context_score: float | None = None
    context_reason: str = ""          # why Agent 2 decided (cosine or graph layer)
    matched_case: dict | None = None
    supporting_passage: dict | None = None
    suggested_case: dict | None = None     # Agent 3 result
    fabrication_risk: str | None = None    # low | elevated (only when NOT_FOUND)
    confidence: float = 0.0
    why: str = ""
    agent_trace: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ── corpus matcher (robust to name formatting across loaders) ──────────────
def _match_case(corpus: list[dict], passage_ids: set, cit: Citation):
    """
    Best :Case for a citation. Fuzzy over the WHOLE corpus (not a CONTAINS
    pre-filter) so it survives differently-formatted names, and prefers a node
    that actually has passages so Agent 2 can read its text.
    """
    if cit.citation:
        exact = [c for c in corpus if c.get("citation") == cit.citation]
        if exact:
            exact.sort(key=lambda c: c["id"] in passage_ids, reverse=True)
            return exact[0], 100.0
    query = (cit.name or cit.raw_text or "").lower()
    best, best_rank = None, -1.0
    for c in corpus:
        s = fuzz.token_set_ratio(query, (c.get("name") or "").lower())
        rank = s + (2 if c["id"] in passage_ids else 0)
        if rank > best_rank:
            best, best_rank = c, rank
    if best is None:
        return None, 0.0
    score = fuzz.token_set_ratio(query, (best.get("name") or "").lower())
    return (best, score) if score >= MATCH_THRESHOLD else (None, score)


# ── teammate's proposition / misapplication layer ──────────────────────────
def load_misapply_layer(graph: CitationGraph, embedder) -> dict:
    """
    Pull the teammate's :Proposition (ESTABLISHES) and :MisappliedPattern
    (MISAPPLIED_AS) nodes once, with precomputed embeddings, grouped by case name.

    Returns { case_name: {"real": [(text, vec)], "wrong": [(text, vec, explanation)]} }
    keyed by a de-slugged caseId (the teammate's :Case nodes carry the id on the
    Proposition/MisappliedPattern node, not always a `name` property).
    """
    rows = graph._run(
        "MATCH (x) WHERE x:Proposition OR x:MisappliedPattern "
        "RETURN x.caseId AS caseId, labels(x) AS lbl, "
        "       coalesce(x.text, x.incorrectProposition) AS text, x.explanation AS expl")
    rows = [r for r in rows if r.get("caseId") and r.get("text")]
    if not rows:
        return {}
    vecs = embedder.embed([r["text"] for r in rows])
    layer: dict = {}
    for r, v in zip(rows, vecs):
        name = r["caseId"].replace("--", " ").replace("-", " ")  # de-slug for fuzzy match
        entry = layer.setdefault(name, {"real": [], "wrong": []})
        if "MisappliedPattern" in (r["lbl"] or []):
            entry["wrong"].append((r["text"], v, r.get("expl") or ""))
        else:
            entry["real"].append((r["text"], v))
    return layer


def _misapply_for(layer: dict, name: str):
    """Best fuzzy-matched proposition entry for a case name (or None)."""
    if not layer or not name:
        return None
    best, score = None, 0
    for k, v in layer.items():
        s = fuzz.token_set_ratio(name.lower(), k.lower())
        if s > score:
            best, score = v, s
    return best if score >= MATCH_THRESHOLD else None


# ── the three agents ───────────────────────────────────────────────────────
def agent1_existence(graph: CitationGraph, corpus: list[dict], passage_ids: set,
                     cit: Citation):
    """Existence + good-law. Returns (match|None, treatment, overruled_by)."""
    match, _score = _match_case(corpus, passage_ids, cit)
    if match is None:
        return None, "UNKNOWN", []
    overruled = graph.negative_treatment(match["id"])
    return match, ("OVERRULED" if overruled else "GOOD_LAW"), overruled


def agent2_context(retriever: Retriever, judge: ContextJudge, case_id: str,
                   doc_context: str, prop_entry: dict | None, k: int = 5) -> dict:
    """
    Does the cited case's OWN text support how it's used in the document?

    Signal 1 (always): cosine over the case's passages (ContextJudge).
    Signal 2 (when the teammate modelled this case): compare the document's
    proposition to the case's real propositions vs known misapplication patterns.
    Signal 2 is authoritative when present.
    """
    claim = doc_context or ""
    hits = retriever.retrieve_passages(case_id, claim, k=k) if claim else []
    base = judge.judge(claim, hits)
    out = {"supports": base["supports"], "confidence": base["confidence"],
           "best_passage": base["best_passage"], "reason": base["why"],
           "source": "passages"}

    if claim and prop_entry:
        qv = retriever.embedder.embed([claim])[0]
        wrong = prop_entry.get("wrong", [])
        real = prop_entry.get("real", [])
        wbest = max((_cos(qv, v) for (_t, v, _e) in wrong), default=0.0)
        rbest = max((_cos(qv, v) for (_t, v) in real), default=0.0)
        if wrong and wbest >= PROP_MATCH and wbest >= rbest:
            expl = max(wrong, key=lambda w: _cos(qv, w[1]))[2]
            out.update(supports=False, source="graph",
                       reason=f"Matches a known misapplication pattern: {expl}".strip())
        elif real and rbest >= PROP_MATCH:
            out.update(supports=True, source="graph",
                       reason="Proposition matches what the case actually establishes.")
        elif real and rbest < PROP_MISS:
            out.update(supports=False, source="graph",
                       reason="Proposition does not match anything this case establishes - possible misapplication.")
    return out


def agent3_fallback(retriever: Retriever, doc_context: str, k: int = 5):
    """Citation not found -> the real case whose text best fits the context."""
    claim = doc_context or ""
    if not claim:
        return None
    hits = retriever.retrieve_passages(None, claim, k=k)
    if not hits:
        return None
    top = hits[0]
    return {"case_id": top["case_id"], "score": round(float(top["score"]), 3),
            "passage": top["text"]}


# ── orchestrator ───────────────────────────────────────────────────────────
def verify_citation_agents(graph: CitationGraph, retriever: Retriever,
                           judge: ContextJudge, cit: Citation,
                           corpus: list[dict], passage_ids: set,
                           misapply_layer: dict | None = None,
                           corpus_is_broad: bool = False) -> AgentResult:
    trace = ["agent1:existence"]
    match, treatment, overruled = agent1_existence(graph, corpus, passage_ids, cit)

    # --- not found -> Agent 3 fallback ------------------------------------
    if match is None:
        trace.append("agent3:fallback")
        sug = agent3_fallback(retriever, cit.context)
        risk = _fabrication_risk(cit)
        if corpus_is_broad and cit.fabrication_signal:
            status = Status.FABRICATED.value
            why = "Not found in a broad authority set, with fabrication signals - likely invented."
            conf = 0.85
        else:
            status = Status.UNVERIFIABLE.value
            why = ("Not found in the available corpus - may be a coverage gap (NOT_FOUND != fabricated). "
                   f"Fabrication risk: {risk}.")
            conf = 0.3
        if sug:
            why += f" Closest real authority on this point: {sug['case_id']}."
        return AgentResult(citation=cit.raw_text, status=status, existence="NOT_FOUND",
                           treatment="UNKNOWN", suggested_case=sug, fabrication_risk=risk,
                           confidence=conf, why=why, agent_trace=trace)

    # --- found -> Agent 2 context -----------------------------------------
    trace.append("agent2:context")
    prop_entry = _misapply_for(misapply_layer or {}, match.get("name", ""))
    j = agent2_context(retriever, judge, match["id"], cit.context, prop_entry)
    passage, score, reason = j["best_passage"], j["confidence"], j["reason"]

    if treatment == "OVERRULED":
        by = overruled[0]
        return AgentResult(citation=cit.raw_text, status=Status.MISAPPLIED.value,
                           existence="CONFIRMED_REAL", treatment="OVERRULED",
                           context_score=score, context_reason=reason, matched_case=match,
                           supporting_passage=passage, confidence=0.9, agent_trace=trace,
                           why=f"Real case, but overruled by {by.get('by_name')} "
                               f"{by.get('by_citation') or ''} - no longer good law.")

    if j["supports"]:
        return AgentResult(citation=cit.raw_text, status=Status.VERIFIED.value,
                           existence="CONFIRMED_REAL", treatment="GOOD_LAW",
                           context_score=score, context_reason=reason, matched_case=match,
                           supporting_passage=passage, confidence=score or 0.6, agent_trace=trace,
                           why=f"Found as '{match.get('name')}'; {reason}")

    return AgentResult(citation=cit.raw_text, status=Status.MISAPPLIED.value,
                       existence="CONFIRMED_REAL", treatment="GOOD_LAW",
                       context_score=score, context_reason=reason, matched_case=match,
                       supporting_passage=passage, confidence=0.5, agent_trace=trace,
                       why=f"Found as '{match.get('name')}', but possible misapplication: {reason}")


def run_document(citations: list[Citation], judge: ContextJudge | None = None,
                 corpus_is_broad: bool = False) -> list[dict]:
    """
    Open graph + retriever once, verify each citation, return list of dicts.
    Targets whatever NEO4J_* / EMBED_PROVIDER the environment points at
    (the .env in the repo points at Aura).
    """
    graph = CitationGraph()
    retriever = Retriever()
    judge = judge or get_judge()
    try:
        corpus = graph._run(
            "MATCH (c:Case) RETURN c.id AS id, c.name AS name, c.citation AS citation")
        passage_ids = retriever.store.loaded_case_ids()
        misapply_layer = load_misapply_layer(graph, retriever.embedder)
        return [verify_citation_agents(graph, retriever, judge, c, corpus, passage_ids,
                                       misapply_layer, corpus_is_broad).to_dict()
                for c in citations]
    finally:
        graph.close()
        retriever.close()
