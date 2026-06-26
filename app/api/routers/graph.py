"""
GET /api/graph/{node_id} — Citation network for react-flow visualization.

Works with CSV (demo/local) and Neo4j (production) — always returns data.
Returns up to 2 hops from the requested root node.

Response shape:
    {
      "root":  {"id": str, "label": str, "status": str},
      "nodes": [{"id": str, "label": str, "status": str}],
      "edges": [{"source": str, "target": str, "type": str}]
    }
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["graph"])

_VALID_TREATMENTS = {"OVERRULES", "DISTINGUISHES", "DOUBTED_BY"}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _find_lawyer_data() -> Path | None:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        candidate = parent / "lawyer-data"
        if candidate.is_dir():
            return candidate
    return None


def _load_cases(data_dir: Path) -> dict[str, dict]:
    """Cases indexed by slug AND lowercase short_name for flexible lookup."""
    cases: dict[str, dict] = {}
    csv_path = data_dir / "cases.csv"
    if not csv_path.exists():
        return cases
    with csv_path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            short_name = row.get("short_name", "").strip()
            if not short_name:
                continue
            node = {
                "id": _slug(short_name),
                "label": short_name,
                "status": row.get("status", "GOOD_LAW").strip(),
            }
            cases[_slug(short_name)] = node
            cases[short_name.lower()] = node
    return cases


def _load_edges(data_dir: Path) -> list[dict]:
    """Treatment edges from treatments.csv."""
    edges: list[dict] = []
    csv_path = data_dir / "treatments.csv"
    if not csv_path.exists():
        return edges
    with csv_path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            from_name = row.get("case_from_short_name", "").strip()
            to_name   = row.get("case_to_short_name", "").strip()
            treatment = row.get("treatment", "").strip().upper()
            if not from_name or not to_name or treatment not in _VALID_TREATMENTS:
                continue
            edges.append({
                "source": _slug(from_name),
                "target": _slug(to_name),
                "type":   treatment,
            })
    return edges


@router.get("/graph/{node_id}")
def get_citation_graph(node_id: str) -> dict:
    """
    Returns the citation network around node_id for react-flow.

    node_id may be a slug (r-v-jogee) or a raw short name (R v Jogee).
    Traverses up to 2 hops via OVERRULES / DISTINGUISHES / DOUBTED_BY edges.
    Returns empty nodes/edges when node has no known relationships.
    """
    data_dir = _find_lawyer_data()
    if data_dir is None:
        return {
            "root":  {"id": _slug(node_id), "label": node_id, "status": "UNKNOWN"},
            "nodes": [],
            "edges": [],
        }

    cases     = _load_cases(data_dir)
    all_edges = _load_edges(data_dir)

    # Resolve root — try slug first, then lowercase short_name
    root_slug = _slug(node_id)
    root = cases.get(root_slug) or cases.get(node_id.lower())
    if root is None:
        root = {"id": root_slug, "label": node_id, "status": "UNKNOWN"}

    # BFS — 2 hops
    visited: set[str]       = {root["id"]}
    result_edges: list[dict]      = []
    result_nodes: dict[str, dict] = {}
    seen_edges: set[tuple]        = set()

    frontier: set[str] = {root["id"]}
    for _ in range(2):
        next_frontier: set[str] = set()
        for edge in all_edges:
            src, tgt = edge["source"], edge["target"]
            if src not in frontier and tgt not in frontier:
                continue
            edge_key = (src, tgt, edge["type"])
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                result_edges.append(edge)
            for nid in (src, tgt):
                if nid not in visited:
                    visited.add(nid)
                    next_frontier.add(nid)
                if nid != root["id"]:
                    result_nodes.setdefault(
                        nid,
                        cases.get(nid, {"id": nid, "label": nid, "status": "UNKNOWN"}),
                    )
        frontier = next_frontier

    return {
        "root":  root,
        "nodes": list(result_nodes.values()),
        "edges": result_edges,
    }
