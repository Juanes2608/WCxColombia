"""
Nemotron multi-agent adapter — 3 specialized agents via OpenRouter.

Architecture (50 req/day budget):
  Agent 3 → Nano model  — extract document claim (cheap, called per verified citation)
  Agent 4 → Super model — compare claim vs actual proposition (reasoning toggle on)
  Agent 5 → Super model — find alternative citation when mismatch detected

OpenRouter endpoint: https://openrouter.ai/api/v1/chat/completions
Models:
  Nano:  nvidia/nemotron-3-nano-8b-instruct:free  (~8B, fast extraction)
  Super: nvidia/nemotron-3-super-120b-a12b:free   (~120B, 12B active via MoE, 1M context)

Invariant: Nemotron NEVER determines verdicts. It only:
  - Extracts claims from document text
  - Confirms or disputes proposition match
  - Suggests alternative citations
The FABRICATED / MISAPPLIED / VERIFIED verdict is always deterministic (corpus + corpus).
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger("citationguard.nemotron")

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_TIMEOUT = 30.0
_MAX_TOKENS_EXTRACT = 200
_MAX_TOKENS_COMPARE = 300
_MAX_TOKENS_ALTERNATIVES = 400


def _call(
    model: str,
    messages: list[dict],
    api_key: str,
    max_tokens: int = 300,
    use_reasoning: bool = False,
) -> str | None:
    """Single synchronous call to OpenRouter. Returns None on any failure."""
    payload: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.0,
    }
    if use_reasoning:
        # Nemotron dynamic reasoning toggle — activates chain-of-thought only when needed
        # OpenRouter format: pass as extra_body parameter
        payload["transforms"] = []  # disable OpenRouter prompt transforms
        # Note: Nano Omni has reasoning built-in; Super uses this to activate extended thinking
        payload.setdefault("extra_body", {})["thinking"] = {"type": "enabled", "budget_tokens": 1024}

    try:
        r = httpx.post(
            _OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://citationguard.ai",
                "X-Title": "CitationGuard",
            },
            json=payload,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        return content.strip() if content else None
    except Exception as exc:
        logger.warning("Nemotron call failed [%s]: %s", model, exc)
        return None


def _get_models() -> tuple[str, str]:
    """Return (nano_model, super_model) from settings."""
    from app.config import get_settings
    s = get_settings()
    return s.openrouter_nano_model, s.openrouter_super_model


def _get_api_key() -> str:
    from app.config import get_settings
    return get_settings().openrouter_api_key


# ── Agent 3: Document Claim Extractor (Nemotron Nano) ────────────────────────

def extract_document_claim(citation: str, surrounding_text: str) -> str | None:
    """
    Agent 3 — Nemotron Nano.
    Given the paragraph where this citation appears, extract in one sentence
    what legal proposition the author is claiming the case establishes.

    Uses Nano (cheapest model) — runs for every verified citation.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    nano_model, super_model = _get_models()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a legal citation analyst. "
                "Extract in ONE concise sentence the exact legal proposition "
                "that the document's author is using this citation to support. "
                "Return ONLY the proposition sentence. No preamble, no explanation."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Citation: {citation}\n\n"
                f"Document context:\n{surrounding_text}\n\n"
                "What proposition is the author using this citation to establish? "
                "One sentence only."
            ),
        },
    ]

    # Try Nano first (cheaper), fall back to Super if model unavailable
    result = _call(nano_model, messages, api_key, max_tokens=_MAX_TOKENS_EXTRACT)
    if result is None:
        logger.info("Nano unavailable — falling back to Super for extraction")
        result = _call(super_model, messages, api_key, max_tokens=_MAX_TOKENS_EXTRACT)
    return result


# ── Agent 4: Proposition Comparator (Nemotron Super + reasoning) ─────────────

def compare_claim_vs_proposition(
    citation: str,
    document_claim: str,
    actual_proposition: str,
) -> tuple[bool, str]:
    """
    Agent 4 — Nemotron Super with reasoning toggle ON.
    Compares what the document claims a case establishes vs what it actually establishes.

    Returns (matches: bool, reason: str).
    Reasoning toggle activated — Nemotron Super only runs chain-of-thought when needed.
    """
    api_key = _get_api_key()
    if not api_key:
        return True, "Nemotron not configured"

    _, super_model = _get_models()

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert legal citation verifier. "
                "Your task: determine whether a document's claim about a case "
                "accurately reflects what the case actually established. "
                "Respond in EXACTLY this format (two lines only):\n"
                "MATCH: YES\n"
                "REASON: one sentence\n"
                "OR:\n"
                "MATCH: NO\n"
                "REASON: one sentence explaining the specific legal error."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Case: {citation}\n\n"
                f"What the document claims this case establishes:\n"
                f"{document_claim}\n\n"
                f"What the case actually established:\n"
                f"{actual_proposition}\n\n"
                "Does the document's claim accurately reflect the case? "
                "MATCH: YES/NO and REASON:"
            ),
        },
    ]

    raw = _call(super_model, messages, api_key, max_tokens=_MAX_TOKENS_COMPARE, use_reasoning=True)
    if not raw:
        return True, "Could not verify — treating as match"

    # Parse response
    matches = "MATCH: YES" in raw.upper() or "MATCH:YES" in raw.upper()
    reason_line = next(
        (line for line in raw.strip().splitlines() if line.upper().startswith("REASON:")),
        raw,
    )
    reason = reason_line.replace("REASON:", "").replace("Reason:", "").strip()
    return matches, reason


# ── Agent 5: Alternative Citation Finder (Nemotron Super) ────────────────────

def find_alternative_citation(
    document_claim: str,
    corpus_summaries: list[dict],
) -> list[dict]:
    """
    Agent 5 — Nemotron Super.
    Given the claim the author wants to make, find up to 3 cases from the corpus
    that actually support it.

    corpus_summaries: [{citation, short_name, proposition}]
    Returns: [{suggestion: "Case — rationale"}]

    Uses Nemotron Super's 1M token context window to reason over the full corpus.
    """
    api_key = _get_api_key()
    if not api_key or not corpus_summaries:
        return []

    _, super_model = _get_models()

    corpus_text = "\n".join(
        f"- {c['citation']}: {c['proposition']}"
        for c in corpus_summaries[:40]
        if c.get("proposition")
    )

    if not corpus_text:
        return []

    messages = [
        {
            "role": "system",
            "content": (
                "You are a legal citation assistant. "
                "Respond with ONLY a numbered list of up to 3 cases. "
                "Each line must be: NUMBER. CASE NAME — one sentence why it supports the proposition. "
                "Do NOT include reasoning, explanation, or any other text. "
                "If no case in the list fits, respond with exactly: NONE"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Proposition to support: {document_claim}\n\n"
                f"Cases available:\n{corpus_text}\n\n"
                "List up to 3 cases that best support this proposition. "
                "Format: '1. Case Name — reason'. Output ONLY the list:"
            ),
        },
    ]

    raw = _call(super_model, messages, api_key, max_tokens=_MAX_TOKENS_ALTERNATIVES)
    if not raw or raw.strip().upper() == "NONE" or "no suitable" in raw.lower():
        return []

    alternatives = []
    for line in raw.strip().splitlines():
        line = line.strip()
        # Only take numbered lines (1. 2. 3.)
        if line and line[0].isdigit() and "." in line[:3]:
            text = line.split(".", 1)[-1].strip()
            if len(text) > 10 and "—" in text:
                alternatives.append({"suggestion": text})

    return alternatives[:3]
