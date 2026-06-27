"""
ICorpusRepository backed by lawyer-data/cases.csv and lawyer-data/misapplied.csv.

Used when Neo4j is not configured (local dev / demo without cloud).
"""
from __future__ import annotations

import csv
import logging
import re
from pathlib import Path

from app.ports.corpus import CaseNode, ICorpusRepository, Passage, SuggestionResult

logger = logging.getLogger("traceit.local_corpus")


def _find_lawyer_data() -> Path:
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
    nodes: dict[str, CaseNode] = {}
    try:
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("verified", "").lower() != "true":
                    continue
                short_name = row.get("short_name", "").strip()
                citation   = row.get("citation", "").strip()
                if not short_name or not citation:
                    continue
                node_id = _slug(short_name)
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
                    court=row.get("court", "").strip() or None,
                    bailii_url=row.get("bailii_url", "").strip() or None,
                )
        logger.info("LocalCorpusAdapter: loaded %d verified cases", len(nodes))
    except FileNotFoundError:
        logger.warning("cases.csv not found at %s — corpus is empty", path)
    return nodes


def _load_misapplied(path: Path) -> dict[str, str]:
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


# Common stopwords to exclude from keyword scoring
_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "of", "in", "to",
    "for", "and", "or", "that", "this", "it", "by", "on", "at", "be",
    "has", "have", "had", "with", "not", "from", "as", "its", "which",
    "where", "when", "whether", "shall", "may", "must", "will", "would",
}


def _keyword_score(text: str, query_words: set[str]) -> float:
    words = set(re.sub(r"[^a-z\s]", "", text.lower()).split()) - _STOPWORDS
    return float(len(query_words & words))


class LocalCorpusAdapter(ICorpusRepository):
    """Reads corpus from CSV files in lawyer-data/. No network required."""

    def __init__(self, lawyer_data_dir: Path | None = None) -> None:
        data_dir = lawyer_data_dir or _find_lawyer_data()
        self._nodes      = _load_cases(data_dir / "cases.csv")
        self._misapplied = _load_misapplied(data_dir / "misapplied.csv")

    def lookup(self, citation_fragment: str) -> CaseNode | None:
        fragment_lower = citation_fragment.lower()
        best: CaseNode | None = None
        best_score = 0

        for node in self._nodes.values():
            score = self._match_score(node, fragment_lower)
            if score > best_score:
                best_score = score
                best = node

        return best

    def get_misapplied_table(self) -> dict[str, str]:
        return dict(self._misapplied)

    def find_passages(self, node_id: str) -> list[Passage]:
        """CSV corpus has no judgment text — returns empty list (HoldingJudge degrades gracefully)."""
        return []

    def find_suggestions(
        self,
        proposition: str,
        brief_context: str,
        domain: str | None = None,
        limit: int = 6,
        exclude_node_id: str | None = None,
    ) -> list[SuggestionResult]:
        """
        Keyword scoring against proposition text.
        brief_context is not used in the CSV fallback (no vector index available).
        Domain filter applied when provided.
        """
        combined_query = f"{proposition} {brief_context}"
        query_words = set(re.sub(r"[^a-z\s]", "", combined_query.lower()).split()) - _STOPWORDS

        scored: list[tuple[float, CaseNode]] = []
        for node in self._nodes.values():
            if node.status == "OVERRULED":
                continue
            if domain and node.domain and node.domain != domain:
                continue
            prop_text = " ".join(node.propositions)
            score = _keyword_score(prop_text, query_words)
            if score > 0:
                scored.append((score, node))

        scored.sort(key=lambda x: x[0], reverse=True)

        return [
            SuggestionResult(
                node_id=node.node_id,
                citation=node.citation,
                short_name=node.short_name,
                proposition=node.propositions[0] if node.propositions else "",
                domain=node.domain,
                bailii_url=node.bailii_url,
                score=score,
            )
            for score, node in scored[:limit + 1]
            if node.node_id != exclude_node_id
        ][:limit]

    @staticmethod
    def _match_score(node: CaseNode, fragment_lower: str) -> int:
        short = node.short_name.lower()
        full  = node.citation.lower()

        if short in fragment_lower:
            return len(short) + 100
        if full in fragment_lower:
            return len(full) + 100

        if " v " in short:
            parts = short.split(" v ", 1)
            p1 = parts[0].strip()
            p2 = parts[1].strip()
            if len(p1) >= 4 and len(p2) >= 4:
                if p1 in fragment_lower and p2 in fragment_lower:
                    return len(p1) + len(p2) + 50

        year_match = re.search(r"\[?(\d{4})\]?", full)
        if year_match:
            year = year_match.group(1)
            first_word = short.split()[0].lower()
            if len(first_word) >= 4 and year in fragment_lower and first_word in fragment_lower:
                return len(first_word) + 20

        return 0
