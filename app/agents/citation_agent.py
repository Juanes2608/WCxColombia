"""
TraceIT CitationAgent — full agentic citation verifier.

All three providers run a FULL multi-turn tool-calling loop.
There are no one-shot fallbacks — every provider calls tools, inspects results,
and decides the verdict across multiple turns.

Provider chain (first available key wins):
  1. Claude Haiku 3.5  — Anthropic native tool calling  (~$0.004/citation)
  2. Groq LLaMA 70B    — OpenAI-compatible agentic loop  (free tier, fast)
  3. NVIDIA NIM 70B    — OpenAI-compatible agentic loop  (fallback)

If all three are unavailable, run_citation_agent returns None and
VerifyService falls back to the deterministic corpus-only path.

The agent's job is bounded:
  - Establish existence (corpus lookup → FABRICATED or continue)
  - Collect judgment passages from Neo4j (for the HoldingJudge)
  - Check treatment history (OVERRULED / DISTINGUISHED / GOOD_LAW)
  - Submit a preliminary verdict (FABRICATED / MISAPPLIED / VERIFIED / UNVERIFIABLE)

The HoldingJudge (holding_judge.py) performs the holding analysis AFTER
the agent loop, using the passages the agent collected.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field

import httpx

from app.agents.tools import TOOL_SCHEMAS, ToolExecutor

logger = logging.getLogger("traceit.agent")

# ── Provider URLs ─────────────────────────────────────────────────────────────
_NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"

_MAX_TURNS    = 6
_RETRY_WAIT   = 0.5   # seconds between provider switches

_SYSTEM_PROMPT = """You are TraceIT, a UK legal citation verifier. Call tools immediately — no prose between tool calls.

WORKFLOW (follow exactly):
1. lookup_corpus(citation)
   → found=false: submit_verdict(FABRICATED, layer2_verdict=NOT_CHECKED) and stop.
   → found=true: continue to step 2.

2. get_judgment_passages(node_id)
   → retrieves judgment chunks from Neo4j.
   → Even when empty, continue — the HoldingJudge reads them after you.

3. get_document_context(citation)
   → read how the author uses this citation in the skeleton argument.

4. check_treatment_history(node_id)
   → determine GOOD_LAW / OVERRULED / DISTINGUISHED.

5. Assess the verdict:
   - Case exists, used for the wrong legal proposition → MISAPPLIED
     Fill proposition_cited (what skeleton claims) and proposition_actual (what corpus says).
   - Case exists, correctly applied → VERIFIED
   - Case exists, cannot assess application → UNVERIFIABLE

6. If MISAPPLIED **or** if treatment history is OVERRULED:
   call find_supporting_authority(proposition) to suggest GOOD_LAW alternatives, then submit_verdict.
   For OVERRULED: use the actual proposition the case establishes as the search query.

7. submit_verdict with your final finding and a one-sentence reason.

RULES:
- Never skip lookup_corpus — it is the ONLY basis for FABRICATED.
- Never skip get_judgment_passages — the HoldingJudge depends on it.
- Never invent case names or paragraph references.
- UNVERIFIABLE only when the case exists but there is insufficient context to judge application."""


@dataclass
class AgentVerdict:
    verdict:           str                   # FABRICATED | MISAPPLIED | VERIFIED | UNVERIFIABLE
    reason:            str
    layer2_verdict:    str = "NOT_CHECKED"   # GOOD_LAW | OVERRULED | DISTINGUISHED
    proposition_cited: str | None = None     # what skeleton claims (MISAPPLIED)
    proposition_actual: str | None = None    # what corpus says (MISAPPLIED)
    passages:          list = field(default_factory=list)   # list[Passage] from Neo4j
    turns_used:        int = 0
    provider_used:     str = "unknown"
    tool_calls_log:    list[str] = field(default_factory=list)


def run_citation_agent(
    citation: str,
    doc_text: str,
    executor: ToolExecutor,
    anthropic_api_key: str = "",
    anthropic_model: str = "claude-haiku-4-5",
    groq_api_key: str = "",
    groq_model: str = "llama-3.3-70b-versatile",
    nvidia_api_key: str = "",
    nvidia_model: str = "meta/llama-3.3-70b-instruct",
    # legacy kwargs ignored
    **_ignored,
) -> AgentVerdict | None:
    if not anthropic_api_key and not groq_api_key and not nvidia_api_key:
        return None

    # Provider 1: Claude Haiku — native Anthropic tool calling
    if anthropic_api_key:
        result = _run_claude_loop(citation, executor, anthropic_api_key, anthropic_model)
        if result is not None:
            return result
        logger.info("CitationAgent: Claude unavailable — trying Groq")
        time.sleep(_RETRY_WAIT)

    # Provider 2: Groq — OpenAI-compatible agentic loop
    if groq_api_key:
        result = _run_agentic_loop(
            citation, executor, groq_api_key, groq_model,
            provider_name="groq", url=_GROQ_URL,
        )
        if result is not None:
            return result
        logger.info("CitationAgent: Groq unavailable — trying NVIDIA")
        time.sleep(_RETRY_WAIT)

    # Provider 3: NVIDIA NIM — OpenAI-compatible agentic loop
    if nvidia_api_key:
        return _run_agentic_loop(
            citation, executor, nvidia_api_key, nvidia_model,
            provider_name="nvidia", url=_NVIDIA_URL,
        )

    return None


# ── Provider 1: Claude Haiku (Anthropic native tool calling) ──────────────────

def _run_claude_loop(
    citation: str,
    executor: ToolExecutor,
    api_key: str,
    model: str,
) -> AgentVerdict | None:
    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic SDK not installed")
        return None

    claude_tools = [
        {
            "name":         t["function"]["name"],
            "description":  t["function"]["description"],
            "input_schema": t["function"]["parameters"],
        }
        for t in TOOL_SCHEMAS
    ]

    client = anthropic.Anthropic(api_key=api_key)
    messages: list[dict] = [{
        "role": "user",
        "content": (
            f"Verify this citation from a High Court skeleton argument:\n\n"
            f"**{citation}**\n\n"
            "Begin with Step 1: call lookup_corpus now."
        ),
    }]

    verdict_data:   dict | None = None
    tool_calls_log: list[str]   = []

    for turn in range(_MAX_TURNS):
        try:
            response = client.messages.create(
                model=model,
                system=_SYSTEM_PROMPT,
                messages=messages,
                tools=claude_tools,
                max_tokens=512,
            )
        except Exception as exc:
            logger.warning("Claude API error turn %d: %s", turn, exc)
            return None

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                fn_name = block.name
                fn_args = block.input or {}
                tool_calls_log.append(fn_name)
                logger.info("Claude turn %d → %s(%s)", turn, fn_name, list(fn_args.keys()))

                if fn_name == "submit_verdict":
                    verdict_data = fn_args

                result = executor.execute(fn_name, fn_args)
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result),
                })

            messages.append({"role": "user", "content": tool_results})
            if verdict_data is not None:
                break

        elif response.stop_reason == "end_turn":
            text = "".join(b.text for b in response.content if hasattr(b, "text"))
            verdict_data = _parse_text_fallback(text)
            break

    if verdict_data is None:
        logger.warning("Claude exhausted %d turns for '%s'", _MAX_TURNS, citation[:50])
        return None

    return AgentVerdict(
        verdict            = verdict_data.get("verdict", "FABRICATED"),
        reason             = verdict_data.get("reason", ""),
        layer2_verdict     = verdict_data.get("layer2_verdict", "NOT_CHECKED"),
        proposition_cited  = verdict_data.get("proposition_cited"),
        proposition_actual = verdict_data.get("proposition_actual"),
        passages           = executor.collected_passages,
        turns_used         = turn + 1,
        provider_used      = "claude",
        tool_calls_log     = tool_calls_log,
    )


# ── Providers 2+3: OpenAI-compatible agentic loop (Groq / NVIDIA) ────────────

def _run_agentic_loop(
    citation: str,
    executor: ToolExecutor,
    api_key: str,
    model: str,
    provider_name: str,
    url: str,
) -> AgentVerdict | None:
    """Full multi-turn tool-calling loop for OpenAI-compatible providers."""
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

    for turn in range(_MAX_TURNS):
        response = _call_api(url, api_key, model, messages)
        if response is None:
            return None

        choice  = response["choices"][0]
        message = choice["message"]
        finish  = choice.get("finish_reason", "")

        messages.append(message)

        if finish == "tool_calls" or message.get("tool_calls"):
            for tc in message.get("tool_calls", []):
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    fn_args = {}

                tool_calls_log.append(fn_name)
                logger.info(
                    "Agent [%s] turn %d → %s(%s)",
                    provider_name, turn, fn_name, list(fn_args.keys()),
                )

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

        elif finish == "stop":
            verdict_data = _parse_text_fallback(message.get("content", ""))
            break

    if verdict_data is None:
        logger.warning(
            "Agent [%s] exhausted %d turns for '%s'",
            provider_name, _MAX_TURNS, citation[:50],
        )
        return None

    return AgentVerdict(
        verdict            = verdict_data.get("verdict", "FABRICATED"),
        reason             = verdict_data.get("reason", ""),
        layer2_verdict     = verdict_data.get("layer2_verdict", "NOT_CHECKED"),
        proposition_cited  = verdict_data.get("proposition_cited"),
        proposition_actual = verdict_data.get("proposition_actual"),
        passages           = executor.collected_passages,
        turns_used         = turn + 1,
        provider_used      = provider_name,
        tool_calls_log     = tool_calls_log,
    )


# ── API helper ────────────────────────────────────────────────────────────────

def _call_api(url: str, api_key: str, model: str, messages: list[dict]) -> dict | None:
    timeout = 30.0 if "groq" in url else 45.0
    payload = {
        "model":       model,
        "messages":    messages,
        "tools":       TOOL_SCHEMAS,
        "tool_choice": "auto",
        "max_tokens":  512,
        "temperature": 0.0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }
    for attempt in range(2):
        try:
            r = httpx.post(url, headers=headers, json=payload, timeout=timeout)
            if r.status_code == 429:
                wait = min(int(r.headers.get("retry-after", 5)), 10)
                logger.info("429 from %s — waiting %ds", url.split("/")[2], wait)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "HTTP %d from %s: %s",
                exc.response.status_code, url, exc.response.text[:120],
            )
            return None
        except Exception as exc:
            logger.warning("API call failed (%s): %s", url, exc)
            return None
    return None


# ── Text fallback parser ──────────────────────────────────────────────────────

def _parse_text_fallback(content: str) -> dict:
    """Last-resort: extract verdict keyword from plain text."""
    upper = content.upper()
    if "MISAPPLIED" in upper:
        verdict = "MISAPPLIED"
    elif "FABRICATED" in upper:
        verdict = "FABRICATED"
    elif "UNVERIFIABLE" in upper:
        verdict = "UNVERIFIABLE"
    else:
        verdict = "VERIFIED"
    return {"verdict": verdict, "reason": content[:300], "layer2_verdict": "NOT_CHECKED"}
