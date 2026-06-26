"""
ICorpusRepository backed by lawyer-data/cases.csv and lawyer-data/misapplied.csv.

Used when Neo4j is not configured (local dev / demo without cloud).
The CSV format is the canonical source of truth that the abogado fills in.
"""
from __future__ import annotations

import csv
import logging
import re
from pathlib import Path

from app.ports.corpus import CaseNode, ICorpusRepository

logger = logging.getLogger("citationguard.local_corpus")


def _find_lawyer_data() -> Path:
    """
    Locate lawyer-data/ directory.
    Checks LAWYER_DATA_PATH env var first, then walks up from this file.
    """
    import os
    env_path = os.environ.get("LAWYER_DATA_PATH", "").strip()
    if env_path:
        p = Path(env_path)
        if p.is_dir():
            return p

    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        candidate = parent / "lawyer-data"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError(
        "Cannot locate lawyer-data/ directory. "
        "Set LAWYER_DATA_PATH in .env or run from hack-the-law-ultimate/backend/."
    )


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _load_cases(path: Path) -> dict[str, CaseNode]:
    """Load verified cases from cases.csv. Skips FABRICATED / unverified rows."""
    nodes: dict[str, CaseNode] = {}
    try:
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("verified", "").lower() != "true":
                    continue  # FABRICATED or unverified — not in corpus
                short_name = row.get("short_name", "").strip()
                citation   = row.get("citation", "").strip()
                if not short_name or not citation:
                    continue
                node_id     = _slug(short_name)
                propositions = [
                    p.strip()
                    for p in [row.get("proposition_1", ""), row.get("proposition_2", "")]
                    if p.strip()
                ]
                nodes[node_id] = CaseNode(
                    node_id=node_id,
                    citation=citation,
                    short_name=short_name,
                    domain=row.get("domain", "general").strip(),
                    propositions=propositions,
                    status=row.get("status", "GOOD_LAW").strip(),
                )
        logger.info("LocalCorpusAdapter: loaded %d verified cases", len(nodes))
    except FileNotFoundError:
        logger.warning("cases.csv not found at %s — corpus is empty", path)
    return nodes


def _load_misapplied(path: Path) -> dict[str, str]:
    """Returns {node_id: incorrect_proposition_cited_in_skeleton}."""
    table: dict[str, str] = {}
    try:
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                short_name = row.get("short_name", "").strip()
                prop       = row.get("proposition_cited_in_skeleton", "").strip()
                if short_name and prop:
                    table[_slug(short_name)] = prop
    except FileNotFoundError:
        pass
    return table


class LocalCorpusAdapter(ICorpusRepository):
    """Reads corpus from CSV files in lawyer-data/. No network required."""

    def __init__(self, lawyer_data_dir: Path | None = None) -> None:
        data_dir = lawyer_data_dir or _find_lawyer_data()
        self._nodes     = _load_cases(data_dir / "cases.csv")
        self._misapplied = _load_misapplied(data_dir / "misapplied.csv")

    def lookup(self, citation_fragment: str) -> CaseNode | None:
        fragment_lower = citation_fragment.lower()
        best: CaseNode | None = None
        best_score = 0

        for node in self._nodes.values():
            score = 0
            if node.short_name.lower() in fragment_lower:
                score = len(node.short_name)          # longer match wins
            elif node.citation.lower() in fragment_lower:
                score = len(node.citation)
            if score > best_score:
                best_score = score
                best = node

        return best

    def get_misapplied_table(self) -> dict[str, str]:
        return dict(self._misapplied)

    def list_all(self) -> list[dict]:
        """All verified cases as {citation, short_name, proposition} for Agent 5."""
        result = []
        for node in self._nodes.values():
            result.append({
                "citation": node.citation,
                "short_name": node.short_name,
                "proposition": node.propositions[0] if node.propositions else "",
            })
        return result
