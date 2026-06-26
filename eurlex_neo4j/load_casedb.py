"""
load_casedb.py - load the White & Case "Case Law Database" into Neo4j.

The database is a folder of ~58 real UK/EW judgment PDFs. There is no table:
the filename is the most reliable metadata, in two shapes:

  * citation style : "Lumley v Gye (1853) 2 E&B 216.pdf"
                     "American Cyanamid Co (No 1) v Ethicon Ltd [1975] UKHL 1 (...).pdf"
  * slug style     : "caparo-industries-plc-v-dickman-uk-nondevolved-case-law.pdf"

We parse name + citation + jurisdiction from the filename, and pull a short
holding/summary from page 1 of the PDF when it has extractable text (some are
scanned and yield nothing - that's fine, the node still exists).

These rows are NODES only (existence-verification corpus). Citation EDGES come
from Cellar / later layers.

    python -m eurlex_neo4j.load_casedb --dir "<path to Case Law Database folder>"
    python -m eurlex_neo4j.load_casedb --dir "<...>" --no-pdf   # skip PDF text
"""

from __future__ import annotations

import argparse
import pathlib
import re

from eurlex_neo4j.graph import CitationGraph

# Jurisdiction suffix tags seen in the slug filenames -> readable label.
JURISDICTION_SUFFIXES = {
    "uk-nondevolved-case-law": "UK",
    "england--wales-case-law": "England & Wales",
    "canadian-caselaw": "Canada",
    "france--others-eng": "England & Wales",
}

# Court codes inside neutral citations -> jurisdiction.
COURT_JURISDICTION = {
    "UKHL": "UK", "UKSC": "UK", "UKPC": "UK",
    "EWHC": "England & Wales", "EWCA": "England & Wales",
}

# A neutral citation like "[1975] UKHL 1" or an old report cite "(1853) 2 E&B 216".
CITATION_RE = re.compile(
    r"(\[\d{4}\]\s+[A-Z][A-Za-z]+(?:\s+[A-Za-z]+)?\s+\d+"   # [1975] UKHL 1 / [1996] EWHC Ch 1
    r"|\(\d{4}\)\s+\d+\s+[A-Za-z&.\' ]+?\s*\d+)"             # (1853) 2 E&B 216
)
YEAR_RE = re.compile(r"[\[(](\d{4})[\])]")
TRAILING_DEDUP_RE = re.compile(r"\s*\(\d+\)$")  # strip " (1)" duplicate markers


def parse_filename(stem: str) -> dict:
    """Turn a file stem into {name, citation, year, jurisdiction}."""
    stem = TRAILING_DEDUP_RE.sub("", stem).strip()

    citation = None
    m = CITATION_RE.search(stem)
    if m:
        citation = re.sub(r"\s+", " ", m.group(1)).strip()

    year = None
    ym = YEAR_RE.search(stem)
    if ym:
        year = ym.group(1)

    jurisdiction = None

    if "-" in stem and " " not in stem.split("-")[0]:
        # slug style: strip the jurisdiction suffix (often TRUNCATED because
        # the filename was capped at ~60 chars, e.g. "...-uk-nond"), de-slug.
        slug = stem
        for suffix, label in JURISDICTION_SUFFIXES.items():
            # try the full suffix, then shorter and shorter prefixes of it,
            # so a truncated tag like "uk-non" / "england-" still strips.
            for length in range(len(suffix), 3, -1):
                frag = suffix[:length]
                if slug.endswith("-" + frag):
                    slug = slug[: -(len(frag) + 1)]
                    jurisdiction = label
                    break
            if jurisdiction:
                break
        name = slug.rstrip("-")
        name = name.replace("--", " & ").replace("-", " ")
        name = re.sub(r"\s+", " ", name).strip()
        name = title_case_caselaw(name)
    else:
        # citation style: the name is everything before the citation/date
        name = stem
        if m:
            name = stem[: m.start()].strip()
        name = re.sub(r"\s*\(\d{2}\s+\w+\s+\d{4}\)\s*$", "", name).strip()  # drop "(05 February 1975)"

    if not jurisdiction and citation:
        for code, label in COURT_JURISDICTION.items():
            if code in citation:
                jurisdiction = label
                break

    return {"name": name, "citation": citation, "year": year, "jurisdiction": jurisdiction}


def title_case_caselaw(name: str) -> str:
    """Title-case a de-slugged name but keep ' v ', ltd/plc tidy."""
    words = name.split()
    out = []
    for w in words:
        lw = w.lower()
        if lw == "v":
            out.append("v")
        elif lw in {"ltd", "plc", "llc", "bv", "sa", "cjsc", "hms", "hm"}:
            out.append(w.upper() if lw in {"plc", "llc", "bv", "sa", "hms", "hm"} else "Ltd")
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def slug_id(name: str) -> str:
    """A stable id from a name when there is no citation."""
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:80]


def first_page_summary(pdf_path: pathlib.Path, max_chars: int = 600) -> str | None:
    """Best-effort holding snippet from page 1; None if not extractable."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(pdf_path))
        text = (reader.pages[0].extract_text() or "").strip()
        text = re.sub(r"\s+", " ", text)
        return text[:max_chars] or None
    except Exception:
        return None


def load(directory: str, read_pdf: bool = True) -> None:
    folder = pathlib.Path(directory)
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".pdf", ".zip"})
    if not files:
        raise SystemExit(f"No .pdf/.zip files found in {folder}")

    cases = []
    for p in files:
        meta = parse_filename(p.stem)
        case_id = meta["citation"] or slug_id(meta["name"])
        summary = first_page_summary(p) if (read_pdf and p.suffix.lower() == ".pdf") else None
        cases.append({
            "id": case_id,
            "name": meta["name"],
            "citation": meta["citation"],
            "year": meta["year"],
            "jurisdiction": meta["jurisdiction"],
            "court": None,
            "summary": summary,
            "source": "casedb",
            "url": None,
        })

    graph = CitationGraph()
    try:
        graph.ensure_constraints()
        graph.upsert_cases(cases)
        c = graph.counts()
        print(f"Loaded {len(cases)} cases from the Case Database.")
        print(f"Graph now holds {c['cases']} :Case nodes, {c['edges']} edges total.")
        print("\nSample of what was parsed:")
        for case in cases[:8]:
            cite = case["citation"] or "(no citation)"
            print(f"  - {case['name'][:48]:48}  {cite}")
    finally:
        graph.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Load the W&C Case Law Database into Neo4j.")
    ap.add_argument("--dir", required=True, help="path to the 'Case Law Database' folder")
    ap.add_argument("--no-pdf", action="store_true", help="skip PDF text extraction (faster)")
    args = ap.parse_args()
    load(args.dir, read_pdf=not args.no_pdf)


if __name__ == "__main__":
    main()
