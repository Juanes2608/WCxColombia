"""
IStatutoryVerifier implementation backed by legislation.gov.uk REST API.
Free, no authentication, no rate-limit for reasonable usage.
Module-level cache avoids redundant HTTP calls — safe for concurrent requests.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

from app.config import get_settings
from app.ports.statutory import IStatutoryVerifier, StatutoryLookup


# Known chapter numbers for common UK Acts
_CHAPTER_MAP: dict[tuple[str, int], int] = {
    ("ERA",  1996): 18,   # Employment Rights Act
    ("SCA",  1981): 54,   # Senior Courts Act
    ("HRA",  1998): 42,   # Human Rights Act
    ("MCA",  1967):  7,   # Misrepresentation Act
    ("CA",   2006): 46,   # Companies Act
    ("DPA",  2018): 12,   # Data Protection Act (UK GDPR)
}

_ACT_ABBR_MAP: dict[str, str] = {
    "employment rights": "ERA",
    "senior courts":     "SCA",
    "human rights":      "HRA",
    "misrepresentation": "MCA",
    "companies":         "CA",
    "data protection":   "DPA",
}

_STATUTE_RE = re.compile(
    r"(Employment\sRights|Senior\sCourts|Human\sRights|Misrepresentation|"
    r"Companies|Data\sProtection)\s+Act\s+(\d{4})\s+s\.?\s*(\d+(?:\(\d+\))?)",
    re.IGNORECASE,
)

# Module-level cache: (act_abbr, year, section) → StatutoryLookup
_cache: dict[tuple[str, int, str], StatutoryLookup] = {}


class LegislationGovUkAdapter(IStatutoryVerifier):

    def verify(self, act_abbr: str, year: int, section: str) -> StatutoryLookup:
        key = (act_abbr.upper(), year, section)
        if key in _cache:
            return _cache[key]
        result = self._fetch(*key)
        _cache[key] = result
        return result

    def verify_from_text(self, raw_citation: str) -> StatutoryLookup | None:
        m = _STATUTE_RE.search(raw_citation)
        if m is None:
            return None
        act_name = m.group(1).lower()
        year     = int(m.group(2))
        section  = m.group(3)
        abbr     = _ACT_ABBR_MAP.get(act_name)
        if abbr is None:
            return None
        return self.verify(abbr, year, section)

    def _fetch(self, act_abbr: str, year: int, section: str) -> StatutoryLookup:
        chapter = _CHAPTER_MAP.get((act_abbr, year))
        base    = get_settings().legislation_base_url
        if chapter is None:
            return StatutoryLookup(
                act=act_abbr, year=year, section=section,
                exists=None, status_code=None, excerpt=None,
                url=f"{base}/ukpga/{year}/???/section/{section}",
            )

        url = f"{base}/ukpga/{year}/{chapter}/section/{section}"
        try:
            r = httpx.get(url, timeout=5.0, follow_redirects=True,
                          headers={"Accept": "text/html"})
            excerpt = _extract_snippet(r.text) if r.status_code == 200 else None
            return StatutoryLookup(
                act=act_abbr, year=year, section=section,
                exists=r.status_code == 200,
                status_code=r.status_code,
                excerpt=excerpt,
                url=url,
            )
        except httpx.TimeoutException:
            return StatutoryLookup(
                act=act_abbr, year=year, section=section,
                exists=None, status_code=None, excerpt=None, url=url,
            )


def _extract_snippet(html: str) -> str | None:
    m = re.search(r'<div[^>]+class="[^"]*LegSnippet[^"]*"[^>]*>(.*?)</div>', html, re.S)
    if not m:
        return None
    text = re.sub(r"<[^>]+>", " ", m.group(1))
    return re.sub(r"\s+", " ", text).strip()[:300] or None
