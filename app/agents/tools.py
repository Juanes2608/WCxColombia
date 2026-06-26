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

logger = logging.getLogger("citationguard.agent.tools")

_CONTEXT_WINDOW = 700  # chars each side of the citation


# ── Tool JSON schemas (sent to the model) ────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_corpus",
            "description": (
                "Look up a legal case citation in the verified corpus. "
                "Returns case details (propositions, status) if found. "
                "Returns found=false if the case does not exist — this means FABRICATED."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "citation": {
                        "type": "string",
                        "description": "The case citation exactly as it appears in the document.",
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
                "Extract the paragraph from the document where this citation appears. "
                "Use this to understand what legal proposition the author is using "
                "the citation to support."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "citation": {
                        "type": "string",
                        "description": "The citation to find in the document.",
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
                "Check whether a verified case is still good law. "
                "Returns OVERRULED, DISTINGUISHED, or GOOD_LAW. "
                "Call this after lookup_corpus confirms the case exists."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {
                        "type": "string",
                        "description": "The node_id returned by lookup_corpus.",
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
                "Search the corpus for cases that actually support a given legal proposition. "
                "Use this when a citation is MISAPPLIED to suggest a correct alternative."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "proposition": {
                        "type": "string",
                        "description": "The legal proposition the author wants to establish.",
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
            "description": (
                "Submit your final verified verdict. Call this when you have completed "
                "your investigation and are ready to give the result. This ends the analysis."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "verdict": {
                        "type": "string",
                        "enum": ["FABRICATED", "MISAPPLIED", "VERIFIED"],
                        "description": (
                            "FABRICATED: case does not exist in the corpus. "
                            "MISAPPLIED: case exists but is being used for the wrong proposition. "
                            "VERIFIED: case exists, is good law, and is correctly applied."
                        ),
                    },
                    "reason": {
                        "type": "string",
                        "description": "One sentence explaining the verdict.",
                    },
                    "layer2_verdict": {
                        "type": "string",
                        "enum": ["GOOD_LAW", "OVERRULED", "DISTINGUISHED", "NOT_CHECKED"],
                        "description": "Treatment history verdict. NOT_CHECKED if citation is FABRICATED.",
                    },
                    "proposition_cited": {
                        "type": "string",
                        "description": "What the document claims this case establishes. Required for MISAPPLIED.",
                    },
                    "proposition_actual": {
                        "type": "string",
                        "description": "What the case actually establishes. Required for MISAPPLIED.",
                    },
                    "alternative_citation": {
                        "type": "string",
                        "description": "A better citation for the proposition, if one was found.",
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
            fragment = re.sub(r"^\W+", "", citation)[:35]
            m = re.search(re.escape(fragment), text, re.IGNORECASE)
            pos = m.start() if m else 0
        start = max(0, pos - _CONTEXT_WINDOW)
        end   = min(len(text), pos + len(citation) + _CONTEXT_WINDOW)
        return {"context": text[start:end]}

    def _check_treatment_history(self, node_id: str) -> dict:
        hist = self._treatment.get_history(node_id)
        return {
            "verdict":          hist.verdict,
            "overruled_by":     hist.overruled_by,
            "distinguished_by": hist.distinguished_by,
            "source":           hist.source,
        }

    def _find_supporting_authority(self, proposition: str) -> dict:
        summaries = self._corpus.list_all()
        return {
            "proposition_queried": proposition,
            "candidates": summaries[:20],  # agent reasons over these
        }

    def _submit_verdict(self, **kwargs) -> dict:
        # Signals the agent loop to stop — the data is captured upstream
        return {"acknowledged": True}
