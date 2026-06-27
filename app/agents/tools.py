"""
Agent tool definitions and executor for TraceIT CitationAgent.

Tools are the deterministic layer — they query Neo4j, Cellar (via the corpus port),
and the document text.  The CitationAgent decides which tools to call and in what
order.  Tool results are always factual; the model does the reasoning on top.

Tools:
  lookup_corpus             — does this case exist in the corpus?
  get_document_context      — what does the skeleton say around this citation?
  get_judgment_passages     — retrieve judgment paragraphs from Neo4j (holds the ratio)
  check_treatment_history   — is the case still good law?
  find_supporting_authority — which cases support a given proposition? (MISAPPLIED only)
  submit_verdict            — agent's final answer (ends the loop)
"""
from __future__ import annotations

import re
import logging

from app.ports.corpus import Passage

logger = logging.getLogger("traceit.agent.tools")

_CONTEXT_WINDOW = 700   # chars each side of the citation in the skeleton


# ── Tool JSON schemas (sent to the model) ────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_corpus",
            "description": (
                "Search the verified UK case law database for a citation. "
                "Returns the case's court, domain, status, and legal propositions if found. "
                "Returns found=false if no matching case exists — that is the only basis "
                "for a FABRICATED verdict."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "citation": {"type": "string", "description": "The case citation to search for."}
                },
                "required": ["citation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_document_context",
            "description": (
                "Retrieve the text from the skeleton surrounding a specific citation. "
                "Returns the paragraph(s) where the citation appears, showing how "
                "the author uses it and what proposition they attribute to the case."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "citation": {"type": "string", "description": "The citation to locate in the skeleton."}
                },
                "required": ["citation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_judgment_passages",
            "description": (
                "Retrieve judgment chunks for a case from Neo4j. "
                "Each chunk has a 0-based 'chunk_no' index (not an official [47]-style number) "
                "and ~900 chars of OCR-extracted text. There is no pre-labelled holding flag — "
                "the HoldingJudge analyses the chunks separately after your loop. "
                "Call this after lookup_corpus succeeds so the HoldingJudge can read what "
                "the judge actually decided. "
                "Returns an empty list when no passages are stored yet (graceful degradation)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string", "description": "The node_id returned by lookup_corpus."}
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_treatment_history",
            "description": (
                "Check how a case has been treated in subsequent decisions. "
                "Returns whether the case is GOOD_LAW, OVERRULED, or DISTINGUISHED, "
                "and which cases overruled or distinguished it. "
                "This is a deterministic graph query — never inferred by the model."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string", "description": "The node_id returned by lookup_corpus."}
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_supporting_authority",
            "description": (
                "Only call this when the verdict is MISAPPLIED and you want to suggest "
                "a better citation for the proposition the author actually needs. "
                "Searches the corpus by proposition text and brief context using Neo4j full-text. "
                "Returns candidate cases that are GOOD_LAW and genuinely support the proposition. "
                "Do NOT call this for FABRICATED or VERIFIED citations."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "proposition": {
                        "type": "string",
                        "description": "The legal proposition the author needs to support.",
                    },
                    "domain": {
                        "type": "string",
                        "description": "Legal domain hint e.g. 'tort', 'contract' (optional).",
                    },
                },
                "required": ["proposition"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_verdict",
            "description": "Submit your final verdict for this citation. Call this when your investigation is complete.",
            "parameters": {
                "type": "object",
                "properties": {
                    "verdict": {
                        "type": "string",
                        "enum": ["FABRICATED", "MISAPPLIED", "VERIFIED", "UNVERIFIABLE"],
                        "description": (
                            "FABRICATED: case not found in corpus. "
                            "MISAPPLIED: case exists but cited for the wrong proposition. "
                            "VERIFIED: case exists, is good law, and is correctly applied. "
                            "UNVERIFIABLE: case exists but insufficient judgment text to assess application."
                        ),
                    },
                    "reason": {
                        "type": "string",
                        "description": "One sentence explaining the verdict based on your findings.",
                    },
                    "layer2_verdict": {
                        "type": "string",
                        "enum": ["GOOD_LAW", "OVERRULED", "DISTINGUISHED", "NOT_CHECKED"],
                        "description": "Treatment history of the case.",
                    },
                    "proposition_cited": {
                        "type": "string",
                        "description": "What the skeleton claims this case establishes (for MISAPPLIED).",
                    },
                    "proposition_actual": {
                        "type": "string",
                        "description": "What the case actually establishes (for MISAPPLIED).",
                    },
                },
                "required": ["verdict", "reason", "layer2_verdict"],
            },
        },
    },
]


# ── Tool executor ─────────────────────────────────────────────────────────────

class ToolExecutor:
    """
    Executes tool calls made by the CitationAgent.
    Wraps the corpus, treatment, and document adapters.
    All methods return JSON-serialisable dicts.
    """

    def __init__(self, corpus, treatment, doc_text: str) -> None:
        self._corpus    = corpus
        self._treatment = treatment
        self._doc_text  = doc_text
        # Passages collected during the agent loop — returned to VerifyService
        self.collected_passages: list[Passage] = []

    def execute(self, name: str, arguments: dict) -> dict:
        dispatch = {
            "lookup_corpus":           self._lookup_corpus,
            "get_document_context":    self._get_document_context,
            "get_judgment_passages":   self._get_judgment_passages,
            "check_treatment_history": self._check_treatment_history,
            "find_supporting_authority": self._find_supporting_authority,
            "submit_verdict":          self._submit_verdict,
        }
        fn = dispatch.get(name)
        if fn is None:
            return {"error": f"Unknown tool: {name}"}
        try:
            return fn(**arguments)
        except Exception as exc:
            logger.warning("Tool %s failed: %s", name, exc)
            return {"error": str(exc)}

    # ── Individual tool implementations ──────────────────────────────────────

    def _lookup_corpus(self, citation: str) -> dict:
        node = self._corpus.lookup(citation)
        if node is None:
            return {"found": False, "citation": citation}
        return {
            "found":       True,
            "node_id":     node.node_id,
            "citation":    node.citation,
            "short_name":  node.short_name,
            "domain":      node.domain,
            "status":      node.status,
            "propositions": node.propositions,
        }

    def _get_document_context(self, citation: str) -> dict:
        text = self._doc_text
        found_quality = "none"
        pos = text.find(citation)

        if pos != -1:
            found_quality = "exact"
        else:
            normalized_citation = re.sub(r"\s+", " ", citation).strip()
            normalized_text     = re.sub(r"\s+", " ", text)
            norm_pos = normalized_text.find(normalized_citation)
            if norm_pos != -1:
                pos = norm_pos
                found_quality = "whitespace_normalised"

        if pos == -1:
            first_party = citation.split(" v ")[0].strip()
            first_party = re.sub(r"^\W+", "", first_party)
            if len(first_party) >= 4:
                m = re.search(re.escape(first_party), text, re.IGNORECASE)
                if m:
                    pos = m.start()
                    found_quality = "partial_name"

        if pos == -1:
            fragment = re.sub(r"^\W+", "", citation)[:35]
            m = re.search(re.escape(fragment), text, re.IGNORECASE)
            if m:
                pos = m.start()
                found_quality = "fragment"
            else:
                pos = 0

        start = max(0, pos - _CONTEXT_WINDOW)
        end   = min(len(text), pos + len(citation) + _CONTEXT_WINDOW)
        return {
            "context":        text[start:end],
            "citation_found": found_quality != "none",
            "match_quality":  found_quality,
        }

    def _get_judgment_passages(self, node_id: str) -> dict:
        """
        Retrieves judgment passages from Neo4j via the corpus port.
        Stores them on self.collected_passages so VerifyService can pass them
        to the HoldingJudge after the agent loop completes.
        """
        passages = self._corpus.find_passages(node_id)
        self.collected_passages = passages   # captured for HoldingJudge

        if not passages:
            return {
                "node_id":  node_id,
                "passages": [],
                "source":   "none",
                "note":     "No judgment passages stored yet — HoldingJudge will use corpus proposition.",
            }

        return {
            "node_id":  node_id,
            "source":   passages[0].source if passages else "neo4j",
            "count":    len(passages),
            "note":     "Chunk indices are 0-based ETL offsets, not official [47]-style paragraph numbers.",
            "passages": [
                {
                    "chunk_no": p.para_no,
                    "text":     p.text[:300],   # truncate for agent context window
                }
                for p in sorted(passages, key=lambda x: x.para_no)
            ],
        }

    def _check_treatment_history(self, node_id: str) -> dict:
        hist = self._treatment.get_history(node_id)
        return {
            "verdict":          hist.verdict,
            "overruled_by":     hist.overruled_by,
            "distinguished_by": hist.distinguished_by,
            "source":           hist.source,
        }

    def _find_supporting_authority(self, proposition: str, domain: str | None = None) -> dict:
        """
        Queries the corpus (Neo4j full-text or CSV keyword fallback) for cases
        that genuinely support the given proposition.  Uses the brief document
        text as additional context so suggestions apply to the actual argument.
        """
        brief_context = self._doc_text[:2000]   # first 2 k chars as broad context
        suggestions = self._corpus.find_suggestions(
            proposition=proposition,
            brief_context=brief_context,
            domain=domain,
            limit=6,
        )
        return {
            "proposition_queried": proposition,
            "candidates": [
                {
                    "citation":    s.citation,
                    "short_name":  s.short_name,
                    "proposition": s.proposition,
                    "domain":      s.domain,
                    "score":       round(s.score, 2),
                }
                for s in suggestions
            ],
        }

    def _submit_verdict(self, **kwargs) -> dict:
        return {"acknowledged": True}
