"""
chunk.py - split a judgment's full text into retrievable passages.

A passage should be small enough to point a lawyer at precisely (a paragraph,
not a whole page) but large enough to carry meaning. We split on blank-line
paragraph boundaries, then pack paragraphs up to a target size, with a little
overlap so a proposition straddling two paragraphs is still findable.
"""

from __future__ import annotations

import re

TARGET_CHARS = 900      # aim per passage
OVERLAP_CHARS = 150     # carry-over between consecutive passages
MIN_CHARS = 120         # drop tiny fragments (headers, page numbers)


def _paragraphs(text: str) -> list[str]:
    # normalise whitespace, split on blank lines (or single newlines if none)
    text = text.replace("\r\n", "\n")
    parts = re.split(r"\n\s*\n", text)
    if len(parts) <= 1:
        parts = text.split("\n")
    cleaned = []
    for p in parts:
        p = re.sub(r"[ \t]+", " ", p).strip()
        if p:
            cleaned.append(p)
    return cleaned


def _split_oversized(para: str) -> list[str]:
    """A single paragraph longer than the target gets split on sentences."""
    if len(para) <= TARGET_CHARS:
        return [para]
    sentences = re.split(r"(?<=[.;])\s+", para)
    out, buf = [], ""
    for s in sentences:
        if buf and len(buf) + len(s) + 1 > TARGET_CHARS:
            out.append(buf.strip())
            buf = s
        else:
            buf = (buf + " " + s).strip() if buf else s
    if buf.strip():
        out.append(buf.strip())
    return out


def chunk_text(text: str) -> list[str]:
    """Return a list of passage strings, none much larger than TARGET_CHARS."""
    units: list[str] = []
    for para in _paragraphs(text):
        units.extend(_split_oversized(para))

    passages: list[str] = []
    buf = ""
    for unit in units:
        if buf and len(buf) + len(unit) + 1 > TARGET_CHARS:
            passages.append(buf.strip())
            # start next buffer with a tail of the last one (overlap)
            buf = (buf[-OVERLAP_CHARS:] + " " + unit).strip()
        else:
            buf = (buf + " " + unit).strip() if buf else unit
    if buf.strip():
        passages.append(buf.strip())
    return [p for p in passages if len(p) >= MIN_CHARS]


if __name__ == "__main__":
    sample = ("Para one. " * 40) + "\n\n" + ("Para two is different. " * 40)
    out = chunk_text(sample)
    print(f"{len(out)} passages, sizes: {[len(p) for p in out]}")
