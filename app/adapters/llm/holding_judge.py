"""
HoldingJudge — analyses whether a citation is correctly applied by reading the
actual judgment text (not just a retrieved paragraph).

Operating modes:

  full      — Neo4j Passage chunks present; judge reads the judgment, identifies
              the ratio decidendi from the content, produces chunk-level pointers.
  degraded  — No passages; judge uses the corpus Proposition as a proxy for the
              holding.  Lower confidence, no JudgmentPointers.
  none      — No passages and no corpus Proposition; returns holding_found=False.

IMPORTANT HONESTY CONSTRAINTS (from the live Neo4j graph):
  - Passage.para_no is a 0-based CHUNK INDEX from the PDF-ingest ETL, not an
    official judgment paragraph number like [47]. There is no isHolding flag on
    the node — the judge must infer which chunk contains the ratio from the text.
  - Text is OCR-derived and may be noisy on scanned cases. The judge should
    acknowledge when text quality prevents a confident conclusion.
  - Coverage: only ~55 of 97 cases have passages. The rest return an empty list.

INVARIANT: The judge NEVER determines FABRICATED / OVERRULED.
Those are decided deterministically by the corpus and treatment graph.
"""
from __future__ import annotations

import json
import logging
import re

from app.domain.models import (
    AmendmentSuggestion,
    BriefPointer,
    HoldingAnalysis,
    JudgmentPointer,
)
from app.ports.corpus import Passage, SuggestionResult

logger = logging.getLogger("traceit.holding_judge")

_MAX_TOKENS          = 700
_TIMEOUT             = 30.0
_GROQ_URL            = "https://api.groq.com/openai/v1/chat/completions"
_CHARS_PER_CHUNK     = 900    # approximate chunk size from ETL
_MAX_CHUNKS_TO_SEND  = 10     # cap at ~9,000 chars to stay within context


_SYSTEM_PROMPT = """\
You are a legal citation analyst for UK High Court skeleton arguments.

Your task: determine whether a citation is correctly applied in the skeleton.

CONTEXT ABOUT THE SOURCE TEXT:
- The passages below are CHUNKS from a PDF-extracted judgment (pypdf/OCR).
- Each chunk has a "chunk_no" — this is a 0-based index from the PDF processor,
  NOT an official judgment paragraph number like [47].
- There is no pre-labelled holding flag. You must identify the ratio decidendi
  from the content of the chunks yourself.
- OCR text may be noisy. If text quality prevents a confident conclusion, say so.

YOU MUST:
1. Read the chunks and identify which contain the HOLDING — what the judge finally
   decided (the ratio decidendi), not obiter dicta or reasoning later overturned.
2. Summarise the holding in 2–4 sentences. Base it on the chunks, not your training.
3. Find the exact sentence in the skeleton where the author attributes a proposition
   to this citation.
4. Compare the skeleton's claim against the holding you identified.
5. Point to the chunks that contain the holding (by chunk_no).

CRITICAL RULES:
- chunk_no references must come from the chunks provided — do not invent them.
- If you cannot identify the holding (e.g. poor OCR, no relevant chunks), set
  "holding_found": false and do not guess a verdict_reasoning.
- Do NOT quote isolated sentences that the judge later contradicts.
- Output ONLY valid JSON — no prose, no markdown fences.

JSON FORMAT:
{
  "case_summary": "2-4 sentences: what the judge actually decided",
  "verdict_reasoning": "why the skeleton's usage matches / does not match the holding",
  "brief_pointer": {
    "sentence": "exact sentence from the skeleton making the claim",
    "paragraph_hint": "estimated section label e.g. '§3' or 'paragraph 14' or null"
  },
  "judgment_pointers": [
    {"chunk_no": 3, "excerpt": "first 100 chars of the chunk", "is_holding": true}
  ],
  "confidence": 0.85,
  "holding_found": true
}
"""

_DEGRADED_SYSTEM_PROMPT = """\
You are a legal citation analyst for UK High Court skeleton arguments.

No judgment text is available for this case. You are given only the legal
proposition the case is known to establish (from a curated corpus).

Your task:
1. Find the exact sentence in the skeleton making the claim attributed to this citation.
2. Compare that claim against the known proposition.
3. Explain concisely whether the usage is consistent with the proposition.

Output ONLY valid JSON. judgment_pointers MUST be [] — do not invent chunk references.

JSON FORMAT:
{
  "case_summary": "one sentence restating the proposition the case establishes",
  "verdict_reasoning": "why the usage is consistent or inconsistent with the proposition",
  "brief_pointer": {
    "sentence": "exact sentence from the skeleton making the claim",
    "paragraph_hint": null
  },
  "judgment_pointers": [],
  "confidence": 0.55,
  "holding_found": true
}
"""


def analyse_holding(
    citation: str,
    brief_context: str,
    passages: list[Passage],
    corpus_proposition: str,
    suggestions: list[SuggestionResult] | None = None,
    domain: str | None = None,
) -> HoldingAnalysis:
    """
    Produce a HoldingAnalysis for one citation.

    Args:
        citation:           raw citation text from the skeleton
        brief_context:      ±700 chars around the citation in the skeleton
        passages:           judgment chunks from Neo4j (empty if case not in PDF corpus)
        corpus_proposition: pre-written proposition from Neo4j/CSV (fallback text)
        suggestions:        pre-fetched SuggestionResult list for MISAPPLIED cases
        domain:             legal domain of the case
    """
    if not passages and not corpus_proposition.strip():
        return HoldingAnalysis(
            holding_found=False,
            analysis_mode="none",
            confidence=0.0,
        )

    if passages:
        return _full_analysis(citation, brief_context, passages, suggestions)
    return _degraded_analysis(citation, brief_context, corpus_proposition, suggestions)


# ── Full mode (Neo4j Passage chunks available) ────────────────────────────────

def _full_analysis(
    citation: str,
    brief_context: str,
    passages: list[Passage],
    suggestions: list[SuggestionResult] | None,
) -> HoldingAnalysis:
    chunks_text = _format_chunks(passages)
    prompt = (
        f"CITATION: {citation}\n\n"
        f"SKELETON CONTEXT (where the citation appears):\n{brief_context}\n\n"
        f"JUDGMENT CHUNKS:\n{chunks_text}\n\n"
        "Analyse and output the JSON:"
    )

    raw, model_name = _call_llm(prompt, _SYSTEM_PROMPT)
    if raw is None:
        return HoldingAnalysis(holding_found=False, analysis_mode="full_failed", confidence=0.0)

    return _parse_response(raw, "full", suggestions, model_name or "")


# ── Degraded mode (corpus proposition only) ──────────────────────────────────

def _degraded_analysis(
    citation: str,
    brief_context: str,
    corpus_proposition: str,
    suggestions: list[SuggestionResult] | None,
) -> HoldingAnalysis:
    prompt = (
        f"CITATION: {citation}\n\n"
        f"KNOWN PROPOSITION (from verified corpus):\n{corpus_proposition}\n\n"
        f"SKELETON CONTEXT (where the citation appears):\n{brief_context}\n\n"
        "Analyse and output the JSON:"
    )

    raw, model_name = _call_llm(prompt, _DEGRADED_SYSTEM_PROMPT)
    if raw is None:
        return HoldingAnalysis(
            case_summary=corpus_proposition,
            holding_found=True,
            analysis_mode="degraded_failed",
            confidence=0.3,
        )

    return _parse_response(raw, "degraded", suggestions, model_name or "")


# ── LLM call ─────────────────────────────────────────────────────────────────

def _call_llm(user_prompt: str, system_prompt: str) -> tuple[str, str] | tuple[None, None]:
    """Returns (response_text, model_name) or (None, None) when all providers fail."""
    from app.config import get_settings
    s = get_settings()

    if s.anthropic_api_key:
        result = _call_anthropic(s.anthropic_api_key, system_prompt, user_prompt)
        if result:
            return result, "claude-haiku-4-5-20251001"
        logger.info("HoldingJudge: Claude unavailable — trying Groq")

    if s.groq_api_key:
        result = _call_groq(s.groq_api_key, s.groq_model, system_prompt, user_prompt)
        if result:
            return result, s.groq_model or "llama-3.1-8b-instant"

    return None, None


def _call_anthropic(api_key: str, system: str, user: str) -> str | None:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("HoldingJudge Claude error: %s", exc)
        return None


def _call_groq(api_key: str, model: str, system: str, user: str) -> str | None:
    try:
        import httpx
        r = httpx.post(
            _GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model or "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                "max_tokens": _MAX_TOKENS,
                "temperature": 0.0,
            },
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("HoldingJudge Groq error: %s", exc)
        return None


# ── Response parsing ──────────────────────────────────────────────────────────

def _parse_response(
    raw: str,
    mode: str,
    suggestions: list[SuggestionResult] | None,
    model_name: str = "",
) -> HoldingAnalysis:
    data = _extract_json(raw)
    if data is None:
        logger.warning("HoldingJudge: could not parse JSON from LLM response")
        return HoldingAnalysis(holding_found=False, analysis_mode=f"{mode}_parse_error")

    bp_data = data.get("brief_pointer") or {}
    brief_pointer = BriefPointer(
        sentence=bp_data.get("sentence", ""),
        paragraph_hint=bp_data.get("paragraph_hint"),
        char_position=None,   # filled in by VerifyService after char_pos is computed
    ) if bp_data.get("sentence") else None

    judgment_pointers = [
        JudgmentPointer(
            para_no=int(jp.get("chunk_no", 0)),
            excerpt=jp.get("excerpt", "")[:120],
            is_holding=bool(jp.get("is_holding", False)),
        )
        for jp in (data.get("judgment_pointers") or [])
        if jp.get("excerpt")
    ]

    amendments = _build_amendments(suggestions) if suggestions else []

    return HoldingAnalysis(
        case_summary=data.get("case_summary") or None,
        verdict_reasoning=data.get("verdict_reasoning") or None,
        brief_pointer=brief_pointer,
        judgment_pointers=judgment_pointers,
        amendments=amendments,
        confidence=float(data.get("confidence", 0.5)),
        holding_found=bool(data.get("holding_found", True)),
        analysis_mode=mode,
        agent_model=model_name,
    )


def _build_amendments(suggestions: list[SuggestionResult]) -> list[AmendmentSuggestion]:
    return [
        AmendmentSuggestion(
            citation=s.citation,
            short_name=s.short_name,
            proposition=s.proposition,
            rationale=f"Establishes: {s.proposition[:120]}" if s.proposition else "",
        )
        for s in suggestions[:3]
    ]


def _format_chunks(passages: list[Passage]) -> str:
    """Format passage chunks for the LLM prompt, capped at _MAX_CHUNKS_TO_SEND."""
    ordered = sorted(passages, key=lambda p: p.para_no)
    selected = ordered[:_MAX_CHUNKS_TO_SEND]
    lines = []
    for p in selected:
        lines.append(f"[chunk_no {p.para_no}]\n{p.text}")
    if len(ordered) > _MAX_CHUNKS_TO_SEND:
        lines.append(f"... ({len(ordered) - _MAX_CHUNKS_TO_SEND} further chunks not shown)")
    return "\n\n".join(lines)


def _extract_json(text: str) -> dict | None:
    # Strip reasoning tags and markdown code fences before searching for JSON
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```", "", text).strip()

    positions = [m.start() for m in re.finditer(r"\{", text)]
    for start in reversed(positions):
        depth = 0
        for j in range(start, len(text)):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start: j + 1]
                    try:
                        parsed = json.loads(candidate)
                        if "holding_found" in parsed or "case_summary" in parsed:
                            return parsed
                    except (json.JSONDecodeError, ValueError):
                        pass
                    break
    return None
