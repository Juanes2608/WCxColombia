"""
CitationAgent — agentic citation verifier powered by Nemotron Super.

The agent receives a citation and the full document text.
It autonomously decides which tools to call, in what order, and how many times.
It submits its verdict by calling the `submit_verdict` tool.

Loop:
  1. Call Nemotron Super with tools attached
  2. If model calls a tool → execute it → feed result back → repeat
  3. If model calls submit_verdict → capture verdict → stop
  4. If model returns plain text (finish_reason=stop) → parse fallback
  5. Max 8 turns to prevent runaway loops

Invariant: the verdict is always based on tool results (deterministic data).
Nemotron reasons over the data — it does not invent case facts.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

import httpx

from app.agents.tools import TOOL_SCHEMAS, ToolExecutor

logger = logging.getLogger("citationguard.agent")

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_MODEL          = "nvidia/nemotron-3-super-120b-a12b:free"
_MAX_TURNS      = 8
_TIMEOUT        = 45.0

_SYSTEM_PROMPT = """You are CitationGuard, an expert legal citation verification agent for UK courts.

Your task: verify a single legal citation from a skeleton argument and determine its status.

Workflow — always follow this order:
1. Call lookup_corpus to check if the case exists in the verified database.
2. If NOT found → submit_verdict with FABRICATED immediately.
3. If found → call get_document_context to see how the author is using the citation.
4. Call check_treatment_history to verify the case is still good law.
5. Compare what the document claims the case establishes vs its actual propositions.
   - If the propositions match → VERIFIED.
   - If they do not match → MISAPPLIED. Then call find_supporting_authority to suggest a better citation.
6. Call submit_verdict with your final answer.

Rules:
- Never guess whether a case exists — always call lookup_corpus first.
- Never invent propositions — use only what lookup_corpus returns.
- Be precise: MISAPPLIED means the case exists but is being used for the wrong legal principle.
- Always call submit_verdict to end your analysis."""


@dataclass
class AgentVerdict:
    verdict:             str                    # FABRICATED | MISAPPLIED | VERIFIED
    reason:              str
    layer2_verdict:      str = "NOT_CHECKED"    # GOOD_LAW | OVERRULED | DISTINGUISHED
    proposition_cited:   str | None = None
    proposition_actual:  str | None = None
    alternative_citation: str | None = None
    turns_used:          int = 0
    tool_calls_log:      list[str] = field(default_factory=list)


def run_citation_agent(
    citation: str,
    doc_text: str,
    executor: ToolExecutor,
    api_key: str,
    model: str = _MODEL,
) -> AgentVerdict | None:
    """
    Run the CitationAgent for a single citation.
    Returns AgentVerdict, or None if the API key is missing / all calls fail.
    """
    if not api_key:
        return None

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Please verify this citation from a High Court skeleton argument:\n\n"
                f"**{citation}**\n\n"
                "Use your tools to investigate and submit your verdict."
            ),
        },
    ]

    verdict_data: dict | None = None
    tool_calls_log: list[str] = []

    for turn in range(_MAX_TURNS):
        try:
            response = _call_api(messages, model, api_key)
        except Exception as exc:
            logger.warning("Agent API call failed (turn %d): %s", turn, exc)
            return None

        choice  = response["choices"][0]
        message = choice["message"]
        finish  = choice.get("finish_reason", "")

        # Append assistant message to history
        messages.append(message)

        # ── Agent called one or more tools ────────────────────────────────────
        if finish == "tool_calls" or message.get("tool_calls"):
            for tc in message.get("tool_calls", []):
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    fn_args = {}

                tool_calls_log.append(fn_name)
                logger.info("Agent turn %d → tool: %s(%s)", turn, fn_name, list(fn_args.keys()))

                # Capture verdict before executing (submit_verdict args = the verdict)
                if fn_name == "submit_verdict":
                    verdict_data = fn_args

                result = executor.execute(fn_name, fn_args)
                messages.append({
                    "role":         "tool",
                    "tool_call_id": tc["id"],
                    "content":      json.dumps(result),
                })

            # If verdict was submitted, stop the loop
            if verdict_data is not None:
                break

        # ── Agent returned plain text (fallback) ──────────────────────────────
        elif finish == "stop":
            content = message.get("content", "")
            logger.info("Agent stopped with text output (turn %d)", turn)
            # Try to extract a verdict from the text as last resort
            verdict_data = _parse_text_fallback(content)
            break

    if verdict_data is None:
        logger.warning("Agent exhausted %d turns without submitting verdict for '%s'", _MAX_TURNS, citation[:50])
        return None

    return AgentVerdict(
        verdict              = verdict_data.get("verdict", "FABRICATED"),
        reason               = verdict_data.get("reason", ""),
        layer2_verdict       = verdict_data.get("layer2_verdict", "NOT_CHECKED"),
        proposition_cited    = verdict_data.get("proposition_cited"),
        proposition_actual   = verdict_data.get("proposition_actual"),
        alternative_citation = verdict_data.get("alternative_citation"),
        turns_used           = turn + 1,
        tool_calls_log       = tool_calls_log,
    )


# ── Private helpers ───────────────────────────────────────────────────────────

def _call_api(messages: list[dict], model: str, api_key: str) -> dict:
    r = httpx.post(
        _OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
            "HTTP-Referer":  "https://citationguard.ai",
            "X-Title":       "CitationGuard",
        },
        json={
            "model":       model,
            "messages":    messages,
            "tools":       TOOL_SCHEMAS,
            "tool_choice": "auto",
            "max_tokens":  1024,
            "temperature": 0.0,
        },
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def _parse_text_fallback(content: str) -> dict:
    """Last-resort parser when the agent returns text instead of tool calls."""
    content_upper = content.upper()
    if "FABRICATED" in content_upper:
        verdict = "FABRICATED"
    elif "MISAPPLIED" in content_upper:
        verdict = "MISAPPLIED"
    else:
        verdict = "VERIFIED"
    return {
        "verdict":        verdict,
        "reason":         content[:200],
        "layer2_verdict": "NOT_CHECKED",
    }
