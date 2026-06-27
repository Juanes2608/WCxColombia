"""
LLM adapter — multi-provider explanation generator.

Provider priority (first key found wins):
  1. INFERMATIC_API_KEY  → Infermatic AI (OpenAI-compatible, qwen3 or similar)
  2. ANTHROPIC_API_KEY   → Claude Haiku (native SDK)
  3. Neither set         → returns None gracefully (static fallback)

The LLM is NEVER called to determine verdicts.
It only generates a human-readable explanation for an already-decided verdict.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger("traceit.llm")


def _settings():
    from app.config import get_settings
    return get_settings()


def generate_explanation(
    verdict: str,
    citation: str,
    proposition_cited: str | None,
    proposition_actual: str | None,
) -> str | None:
    """
    Call an LLM to generate a plain-English explanation of the verdict.
    Returns None if no API key is configured or if the call fails.

    Args:
        verdict: "FABRICATED" | "MISAPPLIED" | "VERIFIED"
        citation: raw citation text
        proposition_cited: what the skeleton claims the case stands for
        proposition_actual: what the case actually establishes
    """
    prompt = _build_prompt(verdict, citation, proposition_cited, proposition_actual)

    cfg = _settings()
    if cfg.infermatic_api_key:
        return _call_infermatic(cfg.infermatic_api_key, cfg.infermatic_base_url,
                                cfg.infermatic_model, prompt, citation)

    if cfg.anthropic_api_key:
        return _call_anthropic(cfg.anthropic_api_key, prompt, citation)

    return None


# ── Provider implementations ──────────────────────────────────────────────────

def _call_infermatic(api_key: str, base_url: str, model: str, prompt: str, citation: str) -> str | None:
    """Call Infermatic AI via OpenAI-compatible chat completions endpoint."""
    base_url = base_url.rstrip("/")

    try:
        import httpx
        response = httpx.post(
            f"{base_url}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 800,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a legal assistant. "
                            "Output ONLY the requested sentence. No preamble, no reasoning, no lists."
                        ),
                    },
                    # /no_think disables Qwen3 chain-of-thought mode
                    {"role": "user", "content": prompt + " /no_think"},
                ],
            },
            timeout=20.0,
        )
        response.raise_for_status()
        data = response.json()
        raw = data["choices"][0]["message"]["content"].strip()
        text = _strip_thinking(raw)
        return text if text else None

    except Exception as e:
        logger.warning("Infermatic LLM failed for '%s': %s", citation, e)
        return None


_OPENERS = ("This citation", "This case", "Verified:")
_MIN_ANSWER_LEN = 20  # chars — filters bare openers; real sentences are longer


def _strip_thinking(text: str) -> str:
    """Extract the final answer sentence from Qwen3 chain-of-thought output."""
    import re

    # Remove <think>...</think> blocks (Qwen3 native thinking tags)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Fast path: text starts cleanly with a proper opener
    for opener in _OPENERS:
        if text.startswith(opener) and len(text) >= _MIN_ANSWER_LEN:
            end = text.find(".", len(opener))
            return (text[: end + 1] if end != -1 else text[:300]).strip()

    # Scan lines for one that STARTS with an opener and has real content
    # Collect all candidates, return the last one (= final answer, not draft)
    candidates = []
    for line in text.splitlines():
        stripped = line.strip()
        # Strip markdown bullets and numbered list prefixes: "* ", "- ", "1. ", "*   *Draft 2:* " etc.
        stripped = re.sub(r"^[\*\-\d\.]+\s*", "", stripped).strip()
        stripped = re.sub(r"^\*[^*]+\*\s*", "", stripped).strip()  # *italic label*
        # Remove leading keyword labels
        for prefix in ("Draft: ", "Draft 1: ", "Draft 2: ", "Output: ", "Answer: ",
                       "Final: ", "Response: ", "Result: ", "Sentence: "):
            if stripped.lower().startswith(prefix.lower()):
                stripped = stripped[len(prefix):]
        for opener in _OPENERS:
            if stripped.startswith(opener) and len(stripped) >= _MIN_ANSWER_LEN:
                # Extract up to end of sentence
                end = stripped.find(".", len(opener))
                sentence = (stripped[: end + 1] if end != -1 else stripped[:300]).strip()
                if len(sentence) >= _MIN_ANSWER_LEN:
                    candidates.append(sentence)

    if candidates:
        return candidates[-1]

    # Give up — caller uses static fallback
    return ""


def _call_anthropic(api_key: str, prompt: str, citation: str) -> str | None:
    """Call Anthropic Claude Haiku via native SDK."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text.strip()
        return text if text else None

    except Exception as e:
        logger.warning("Anthropic LLM failed for '%s': %s", citation, e)
        return None


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    verdict: str,
    citation: str,
    proposition_cited: str | None,
    proposition_actual: str | None,
) -> str:
    if verdict == "FABRICATED":
        return (
            f"A lawyer cited '{citation}' in a High Court skeleton argument. "
            "This case does not exist in the England and Wales corpus. "
            "Write one sentence (max 40 words) explaining to the filing partner "
            "why this is a problem and what the likely cause is. "
            "Be direct. Do not use the word 'hallucination'. "
            "Start with 'This citation'."
        )

    if verdict == "MISAPPLIED":
        return (
            f"A lawyer cited '{citation}' in a High Court skeleton argument "
            f"claiming it stands for: '{proposition_cited}'. "
            f"The case actually establishes: '{proposition_actual}'. "
            "Write one sentence (max 50 words) explaining to the filing partner "
            "why this is a misapplication and what the risk is. "
            "Be precise about the legal error. Start with 'This case'."
        )

    # VERIFIED
    return (
        f"'{citation}' has been verified in the England and Wales corpus. "
        "Write half a sentence confirming it is cited correctly. "
        "Start with 'Verified:' and use ≤20 words."
    )
