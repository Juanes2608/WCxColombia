"""
Extracts legal citations from free text using jurisdiction-aware regex patterns.
Pure function — no IO, no state, fully testable offline.

Design principle: party names in legal citations always start with a capital letter.
Lower-case words like "is", "the", "held", "in" are never part of a party name.
Known abbreviations (plc, Ltd, Co, &) are treated as valid party-name tokens.

This prevents the regex from "bleeding" across sentence boundaries.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


# ── Party name sub-patterns ───────────────────────────────────────────────────
# Legal abbreviations that appear inside party names but start lowercase
_ABBREV     = r'(?:plc|Ltd\.?|Co\.?|Inc\.?|LLP|Corp\.?|Bros\.?|[Ss]ons|&)'
# One "word" in a party name: capital-led word (optionally hyphenated, e.g. Wing-Siu) OR known abbreviation
_PARTY_WORD = rf'(?:[A-Z][A-Za-z]*(?:-[A-Z][A-Za-z]*)*\.?|{_ABBREV})'
# Full party name: 1–8 such words, space-separated
_PARTY      = rf'{_PARTY_WORD}(?:\s+{_PARTY_WORD}){{0,7}}'

# ── Neutral citation reporters ────────────────────────────────────────────────
_REPORTER   = r'(?:UKSC|UKHL|UKPC|EWCA\s(?:Civ|Crim)|EWHC|AC|QB|WLR|All\sER|Ch|Fam|P|Cr\sApp\sR|KB)'

# ── Full patterns ─────────────────────────────────────────────────────────────
# Modern format:  Smith v Jones [2016] UKSC 8
#                 Caparo Industries plc v Dickman [1990] 2 AC 605
# Note: \s+ before [ and after ] to handle PDF line-wrapping (e.g. "Allan\n   [2007]")
_CASE_MODERN = rf'({_PARTY})\sv\s({_PARTY})\s+\[(\d{{4}})\]\s+(?:\d+\s)?({_REPORTER})\s*(\d*)'

# Old/historical:  Hadley v Baxendale (1854) 9 Ex 341
_CASE_OLD    = rf'({_PARTY})\sv\s({_PARTY})\s+\((\d{{4}})\)\s\d+\s[A-Za-z&\s]+\d+'

# Statute format:  Employment Rights Act 1996 s.98(4)
_STATUTE_RE  = (
    r'(?:Employment\sRights|Senior\sCourts|Human\sRights|Misrepresentation'
    r'|Companies|Data\sProtection|Civil\sProcedure)\s+Act\s+\d{4}\s+s\.?\s*\d+(?:\(\d+\))?'
)

_COMPILED_CASE_MODERN  = re.compile(_CASE_MODERN)
_COMPILED_CASE_OLD     = re.compile(_CASE_OLD)
_COMPILED_STATUTE      = re.compile(_STATUTE_RE)


@dataclass
class ExtractedCitation:
    raw_text: str
    start: int
    end: int
    citation_type: str  # "case_law" | "statute"


def extract_citations(text: str) -> list[ExtractedCitation]:
    """
    Returns deduplicated citations in document order.
    Deduplication key is the normalized citation text, not the surrounding context.
    """
    results: list[ExtractedCitation] = []
    seen: set[str] = set()

    # Modern case law
    for m in _COMPILED_CASE_MODERN.finditer(text):
        key = _normalize(m.group())
        if key not in seen:
            seen.add(key)
            results.append(ExtractedCitation(
                raw_text=m.group().strip(),
                start=m.start(),
                end=m.end(),
                citation_type="case_law",
            ))

    # Historical case law (bracketed year)
    for m in _COMPILED_CASE_OLD.finditer(text):
        key = _normalize(m.group())
        if key not in seen:
            seen.add(key)
            results.append(ExtractedCitation(
                raw_text=m.group().strip(),
                start=m.start(),
                end=m.end(),
                citation_type="case_law",
            ))

    # Statute citations
    for m in _COMPILED_STATUTE.finditer(text):
        key = _normalize(m.group())
        if key not in seen:
            seen.add(key)
            results.append(ExtractedCitation(
                raw_text=m.group().strip(),
                start=m.start(),
                end=m.end(),
                citation_type="statute",
            ))

    return sorted(results, key=lambda c: c.start)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()
