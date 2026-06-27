"""
TraceIT CitationAgent — autonomous citation verifier powered by Nemotron Super.

The agent receives a citation and the full document text.
It decides autonomously which tools to call, in what order, and how many times.
It commits its verdict by calling the submit_verdict tool.

Provider chain (first available wins):
  1. Nemotron Super 120B via OpenRouter  (primary — reasoning + tool calling)
  2. Infermatic Qwen3.6-35B              (fallback — same OpenAI-compatible format)

Loop:
  1. Call LLM with tools attached
  2. If model calls a tool → execute it → feed result back → repeat
  3. If model calls submit_verdict → capture structured verdict → stop
  4. If model returns plain text (finish_reason=stop) → parse fallback
  5. Max 8 turns; 429/5xx retries once per turn before falling back to Infermatic
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

import httpx

from app.agents.tools import TOOL_SCHEMAS, ToolExecutor

logger = logging.getLogger("traceit.agent")

# ── Provider config ───────────────────────────────────────────────────────────
_OPENROUTER_URL  = "https://openrouter.ai/api/v1/chat/completions"
_INFERMATIC_URL  = "https://api.totalgpt.ai/v1/chat/completions"
_MAX_TURNS       = 8
_TIMEOUT         = 45.0
_RETRY_WAIT      = 3.0   # seconds to wait before switching providers on 429

_SYSTEM_PROMPT = """You are TraceIT, a legal citation verification expert for UK courts.

Your task: determine whether a citation in a High Court skeleton argument is FABRICATED, MISAPPLIED, or VERIFIED.

VERDICT DEFINITIONS:
- FABRICATED  — the case does not exist in the legal database (lookup_corpus returned found=false).
- MISAPPLIED  — the case exists but the document uses it to support the wrong legal proposition.
- VERIFIED    — the case exists, is correctly applied, and is still good law.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED WORKFLOW — follow these steps in order:

STEP 1 — lookup_corpus
  Always call this first with the exact citation text.
  This is the only way to determine if a case exists.

STEP 2 — If found=false:
  Call submit_verdict immediately with verdict=FABRICATED.
  Do not call any other tools. The case does not exist.

STEP 3 — If found=true: call get_document_context
  Retrieve the paragraph where this citation appears.
  Read carefully: what legal proposition is the author using this case to support?

STEP 4 — Compare document claim vs corpus proposition
  The lookup_corpus result includes the case's actual propositions.
  Compare: does the author's claim match what the case actually established?
  - If the claim matches (or is a reasonable application): proceed to Step 5.
  - If the claim significantly misrepresents the case's holding: verdict is MISAPPLIED.
    Fill proposition_cited (what the document claims) and proposition_actual (what the case established).

STEP 5 — call check_treatment_history
  Use the node_id returned by lookup_corpus.
  This sets the layer2_verdict: GOOD_LAW, OVERRULED, or DISTINGUISHED.
  If OVERRULED, note this in your reason — even a correctly applied case is dangerous if overruled.

STEP 6 — submit_verdict
  verdict: VERIFIED or MISAPPLIED (FABRICATED was already submitted in Step 2).
  layer2_verdict: from check_treatment_history result.
  reason: one sentence summarising your finding.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OPTIONAL — find_supporting_authority
  Only call this if the verdict is MISAPPLIED and you want to suggest a better citation.
  Fill alternative_citation ONLY with a case name that appeared in this tool's response.

ABSOLUTE RULES:
1. Your verdict must be based on tool results, not on your training knowledge.
   You may reason freely, but you must call lookup_corpus before deciding existence.
2. Never invent a case name for alternative_citation. Only use what find_supporting_authority returned.
3. proposition_cited must come from get_document_context. proposition_actual must come from lookup_corpus.
4. FABRICATED and MISAPPLIED are two different problems. FABRICATED = does not exist. MISAPPLIED = exists but wrongly used."""


@dataclass
class AgentVerdict:
    verdict:              str                    # FABRICATED | MISAPPLIED | VERIFIED
    reason:               str
    layer2_verdict:       str = "NOT_CHECKED"    # GOOD_LAW | OVERRULED | DISTINGUISHED
    proposition_cited:    str | None = None
    proposition_actual:   str | None = None
    alternative_citation: str | None = None
    turns_used:           int = 0
    provider_used:        str = "nemotron"       # which LLM actually answered
    tool_calls_log:       list[str] = field(default_factory=list)


def run_citation_agent(
    citation: str,
    doc_text: str,
    executor: ToolExecutor,
    api_key: str,
    model: str,
    infermatic_api_key: str = "",
    infermatic_model: str = "Qwen-Qwen3.6-35B-A3B",
) -> AgentVerdict | None:
    """
    Run the CitationAgent for a single citation.
    Returns AgentVerdict, or None if all providers fail / are unconfigured.
    """
    if not api_key and not infermatic_api_key:
        return None

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Verify this citation from a High Court skeleton argument:\n\n"
                f"**{citation}**\n\n"
                "Begin with Step 1: call lookup_corpus now."
            ),
        },
    ]

    verdict_data:   dict | None = None
    tool_calls_log: list[str]   = []

    # Provider stickiness: once primary fails we stay with the fallback for
    # all remaining turns — avoids a 3-second sleep penalty on every turn.
    if api_key:
        active_url, active_key, active_model, provider_used = (
            _OPENROUTER_URL, api_key, model, "nemotron"
        )
    else:
        active_url, active_key, active_model, provider_used = (
            _INFERMATIC_URL, infermatic_api_key, infermatic_model, "infermatic"
        )

    for turn in range(_MAX_TURNS):
        response = _call_api(active_url, active_key, active_model, messages)

        if response is None and provider_used == "nemotron" and infermatic_api_key:
            logger.info("Nemotron failed at turn %d — switching to Infermatic for remaining turns", turn)
            time.sleep(_RETRY_WAIT)
            active_url, active_key, active_model, provider_used = (
                _INFERMATIC_URL, infermatic_api_key, infermatic_model, "infermatic"
            )
            response = _call_api(active_url, active_key, active_model, messages)

        if response is None:
            logger.warning("All providers failed at turn %d for '%s'", turn, citation[:50])
            return None
        choice  = response["choices"][0]
        message = choice["message"]
        finish  = choice.get("finish_reason", "")

        messages.append(message)

        # ── Agent called tools ────────────────────────────────────────────────
        if finish == "tool_calls" or message.get("tool_calls"):
            for tc in message.get("tool_calls", []):
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    fn_args = {}

                tool_calls_log.append(fn_name)
                logger.info("Agent [%s] turn %d → %s(%s)", provider_used, turn, fn_name, list(fn_args.keys()))

                if fn_name == "submit_verdict":
                    verdict_data = fn_args

                result = executor.execute(fn_name, fn_args)
                messages.append({
                    "role":         "tool",
                    "tool_call_id": tc["id"],
                    "content":      json.dumps(result),
                })

            if verdict_data is not None:
                break

        # ── Agent returned plain text ─────────────────────────────────────────
        elif finish == "stop":
            logger.info("Agent stopped with text output at turn %d", turn)
            verdict_data = _parse_text_fallback(message.get("content", ""))
            break

    if verdict_data is None:
        logger.warning("Agent exhausted %d turns for '%s'", _MAX_TURNS, citation[:50])
        return None

    return AgentVerdict(
        verdict              = verdict_data.get("verdict", "FABRICATED"),
        reason               = verdict_data.get("reason", ""),
        layer2_verdict       = verdict_data.get("layer2_verdict", "NOT_CHECKED"),
        proposition_cited    = verdict_data.get("proposition_cited"),
        proposition_actual   = verdict_data.get("proposition_actual"),
        alternative_citation = verdict_data.get("alternative_citation"),
        turns_used           = turn + 1,
        provider_used        = provider_used,
        tool_calls_log       = tool_calls_log,
    )


# ── Provider ──────────────────────────────────────────────────────────────────

def _call_api(url: str, api_key: str, model: str, messages: list[dict]) -> dict | None:
    """Single API call. Returns parsed JSON or None on any error."""
    if not api_key:
        return None
    # Infermatic (TotalGPT) does not support tool_choice="auto" — omit it for that provider.
    is_infermatic = "totalgpt" in url
    payload: dict = {
        "model":       model,
        "messages":    messages,
        "tools":       TOOL_SCHEMAS,
        "max_tokens":  1024,
        "temperature": 0.0,
    }
    if not is_infermatic:
        payload["tool_choice"] = "auto"
    try:
        r = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://traceit.ai",
                "X-Title":       "TraceIT",
            },
            json=payload,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("HTTP %d from %s: %s", exc.response.status_code, url, exc.response.text[:120])
        return None
    except Exception as exc:
        logger.warning("API call failed (%s): %s", url, exc)
        return None


def _parse_text_fallback(content: str) -> dict:
    """Last-resort: extract verdict from plain text if agent didn't use tools."""
    import re
    upper = content.upper()
    verdict = "MISAPPLIED" if "MISAPPLIED" in upper else ("FABRICATED" if "FABRICATED" in upper else "VERIFIED")
    # Extract first sentence for a clean reason (not a raw 200-char dump)
    sentences = re.split(r"(?<=[.!?])\s+", content.strip())
    reason = sentences[0][:300] if sentences else content[:200]
    return {"verdict": verdict, "reason": reason, "layer2_verdict": "NOT_CHECKED"}
