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

Your goal: determine whether a citation in a High Court skeleton argument is FABRICATED, MISAPPLIED, or VERIFIED.

FABRICATED  — the cited case does not exist in the legal database.
MISAPPLIED  — the case exists but the document attributes the wrong legal principle to it.
VERIFIED    — the case exists, is still good law, and is correctly used for what it established.

You have tools to investigate. Use them as you see fit — decide which to call, in what order, and how many times.

ABSOLUTE RULES — violating these corrupts the audit trail:
1. Base your verdict ONLY on what your tools return. Do NOT use your own training knowledge of case law.
2. For the alternative_citation field: you may ONLY name a case that was explicitly returned by find_supporting_authority in this session. If that tool returned no candidates or none were relevant, leave alternative_citation empty. Never invent or recall a case name from memory.
3. For proposition_cited and proposition_actual: quote only from get_document_context and lookup_corpus results respectively.

When you have gathered sufficient evidence, call submit_verdict."""


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
                f"Please verify this citation from a High Court skeleton argument:\n\n"
                f"**{citation}**\n\n"
                "Use your tools to investigate and submit your verdict."
            ),
        },
    ]

    verdict_data:   dict | None = None
    tool_calls_log: list[str]   = []
    provider_used   = "nemotron"

    for turn in range(_MAX_TURNS):
        response = _call_with_fallback(
            messages        = messages,
            primary_url     = _OPENROUTER_URL,
            primary_key     = api_key,
            primary_model   = model,
            fallback_url    = _INFERMATIC_URL,
            fallback_key    = infermatic_api_key,
            fallback_model  = infermatic_model,
        )

        if response is None:
            logger.warning("All providers failed at turn %d for '%s'", turn, citation[:50])
            return None

        provider_used = response.pop("_provider", "nemotron")
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


# ── Provider chain ────────────────────────────────────────────────────────────

def _call_with_fallback(
    messages:       list[dict],
    primary_url:    str,
    primary_key:    str,
    primary_model:  str,
    fallback_url:   str,
    fallback_key:   str,
    fallback_model: str,
) -> dict | None:
    """
    Try primary provider (Nemotron via OpenRouter).
    On 429 or 5xx, wait briefly and switch to Infermatic Qwen3.6.
    Returns the raw API response with an extra '_provider' key injected,
    or None if both providers fail.
    """
    if primary_key:
        result = _call_api(primary_url, primary_key, primary_model, messages)
        if result is not None:
            result["_provider"] = "nemotron"
            return result
        logger.info("Nemotron unavailable — switching to Infermatic fallback")
        time.sleep(_RETRY_WAIT)

    if fallback_key:
        result = _call_api(fallback_url, fallback_key, fallback_model, messages)
        if result is not None:
            result["_provider"] = "infermatic"
            return result

    return None


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
    upper = content.upper()
    verdict = "MISAPPLIED" if "MISAPPLIED" in upper else ("FABRICATED" if "FABRICATED" in upper else "VERIFIED")
    return {"verdict": verdict, "reason": content[:200], "layer2_verdict": "NOT_CHECKED"}
