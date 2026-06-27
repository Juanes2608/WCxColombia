"""
Agent tool definitions and executor.

Tools are the deterministic layer — they query Neo4j, legislation.gov.uk,
and the document text. The CitationAgent (Nemotron) decides which tools to
call and in what order. Tool results are always factual; the model does
the reasoning on top.

Tools available:
  lookup_corpus            — does this case exist in the corpus?
  get_document_context     — what does the document say around this citation?
  check_treatment_history  — is the case still good law?
  find_supporting_authority — which cases support a given legal proposition?
  submit_verdict           — agent's final answer (ends the loop)
"""
from __future__ import annotations

import json
import re
import logging

logger = logging.getLogger("traceit.agent.tools")

_CONTEXT_WINDOW = 700  # chars each side of the citation


# ── Tool JSON schemas (sent to the model) ────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_corpus",
            "description": (
                "Search the verified UK case law database for a citation. "
                "Returns the case's actual legal propositions, court, year, and status if found. "
                "Returns found=false if no matching case exists in the database."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "citation": {
                        "type": "string",
                        "description": "The case citation to search for.",
                    }
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
                "Retrieve the text from the document surrounding a specific citation. "
                "Returns the paragraph(s) where the citation appears, showing how "
                "the author uses it in context."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "citation": {
                        "type": "string",
                        "description": "The citation to locate in the document.",
                    }
                },
                "required": ["citation"],
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
                "and which cases overruled or distinguished it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {
                        "type": "string",
                        "description": "The node_id of the case (returned by lookup_corpus).",
                    }
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
                "Only call this when verdict is MISAPPLIED and you want to suggest a better citation. "
                "Searches the case law database for cases that genuinely support a given proposition. "
                "Returns candidate cases with their actual propositions. "
                "Do NOT call this for FABRICATED or VERIFIED citations."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "proposition": {
                        "type": "string",
                        "description": "The legal proposition the document is trying to support.",
                    }
                },
                "required": ["proposition"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_verdict",
            "description": "Submit your final verdict. Call this only after completing your investigation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "verdict": {
                        "type": "string",
                        "enum": ["FABRICATED", "MISAPPLIED", "VERIFIED"],
                        "description": (
                            "FABRICATED: lookup_corpus returned found=false — case does not exist. "
                            "MISAPPLIED: case exists but the document attributes the wrong legal principle to it. "
                            "VERIFIED: case exists, is correctly applied, and check_treatment_history confirms good law."
                        ),
                    },
                    "reason": {
                        "type": "string",
                        "description": "One sentence explaining the verdict based on your tool findings.",
                    },
                    "layer2_verdict": {
                        "type": "string",
                        "enum": ["GOOD_LAW", "OVERRULED", "DISTINGUISHED", "NOT_CHECKED"],
                        "description": (
                            "Result from check_treatment_history. "
                            "Use NOT_CHECKED only when verdict=FABRICATED (case does not exist, no history to check). "
                            "For all real cases (VERIFIED or MISAPPLIED), call check_treatment_history first."
                        ),
                    },
                    "proposition_cited": {
                        "type": "string",
                        "description": "Required when verdict=MISAPPLIED: what the document claims this case establishes (from get_document_context).",
                    },
                    "proposition_actual": {
                        "type": "string",
                        "description": "Required when verdict=MISAPPLIED: what the case actually establishes (from lookup_corpus propositions).",
                    },
                    "alternative_citation": {
                        "type": "string",
                        "description": "A better citation for MISAPPLIED cases — only use names returned by find_supporting_authority.",
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

    def __init__(self, corpus, treatment, doc_text: str):
        self._corpus    = corpus
        self._treatment = treatment
        self._doc_text  = doc_text

    def execute(self, name: str, arguments: dict) -> dict:
        """Dispatch a tool call by name."""
        dispatch = {
            "lookup_corpus":           self._lookup_corpus,
            "get_document_context":    self._get_document_context,
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
            "found": True,
            "node_id":     node.node_id,
            "citation":    node.citation,
            "short_name":  node.short_name,
            "status":      node.status,
            "propositions": node.propositions,
        }

    def _get_document_context(self, citation: str) -> dict:
        text = self._doc_text
        pos = text.find(citation)

        if pos == -1:
            # Try collapsing whitespace — catches newlines injected by PDF extraction
            normalized_citation = re.sub(r"\s+", " ", citation).strip()
            normalized_text = re.sub(r"\s+", " ", text)
            norm_pos = normalized_text.find(normalized_citation)
            if norm_pos != -1:
                # Map normalized position back to original text approximately
                pos = norm_pos

        if pos == -1:
            # Try matching on the first party name (before " v ")
            first_party = citation.split(" v ")[0].strip()
            first_party = re.sub(r"^\W+", "", first_party)
            if len(first_party) >= 4:
                m = re.search(re.escape(first_party), text, re.IGNORECASE)
                pos = m.start() if m else -1

        if pos == -1:
            # Last resort: first 35 significant chars
            fragment = re.sub(r"^\W+", "", citation)[:35]
            m = re.search(re.escape(fragment), text, re.IGNORECASE)
            pos = m.start() if m else 0

        start = max(0, pos - _CONTEXT_WINDOW)
        end   = min(len(text), pos + len(citation) + _CONTEXT_WINDOW)
        return {"context": text[start:end]}

    def _check_treatment_history(self, node_id: str) -> dict:
        # Normalise: agent sometimes passes "Donoghue v Stevenson" instead of the slug
        slug = re.sub(r"[^a-z0-9]+", "-", node_id.lower()).strip("-")
        hist = self._treatment.get_history(slug)
        return {
            "verdict":          hist.verdict,
            "overruled_by":     hist.overruled_by,
            "distinguished_by": hist.distinguished_by,
            "source":           hist.source,
        }

    def _find_supporting_authority(self, proposition: str) -> dict:
        summaries = self._corpus.list_all()
        query_words = set(re.sub(r"[^a-z\s]", "", proposition.lower()).split()) - {
            "the", "a", "an", "is", "are", "was", "were", "of", "in", "to",
            "for", "and", "or", "that", "this", "it", "by", "on", "at", "be",
            "has", "have", "had", "with", "not", "from", "as", "its",
        }

        # Score each case by keyword overlap with the proposition
        scored = []
        for case in summaries:
            prop_text = case.get("proposition", "").lower()
            words_in_prop = set(re.sub(r"[^a-z\s]", "", prop_text).split())
            overlap = len(query_words & words_in_prop)
            if overlap > 0:
                scored.append((overlap, case))

        scored.sort(key=lambda x: x[0], reverse=True)
        candidates = [c for _, c in scored[:8]]

        # Fallback: return first 8 if no keyword overlap
        if not candidates:
            candidates = summaries[:8]

        return {
            "proposition_queried": proposition,
            "candidates": candidates,
        }

    def _submit_verdict(self, **kwargs) -> dict:
        # Signals the agent loop to stop — the data is captured upstream
        return {"acknowledged": True}
