"""
GET /api/graph/{node_id} — Citation network for react-flow visualization.

Neo4j primary (has full OVERRULES / DISTINGUISHES / CITES / DOUBTED_BY graph).
Falls back to CSV when Neo4j is not configured or unreachable.
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

_VALID_TREATMENTS = {"OVERRULES", "DISTINGUISHES", "DOUBTED_BY", "CITES"}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


# ── Neo4j path (primary) ──────────────────────────────────────────────────────

def _neo4j_graph(node_id: str) -> dict | None:
    """
    Query Neo4j for the citation network around node_id.
    Returns None when Neo4j is not configured or unreachable.
    """
    from app.adapters.neo4j.driver import get_driver
    from neo4j import exceptions as neo4j_exc

    driver = get_driver()
    if driver is None:
        return None

    try:
        with driver.session() as session:
            # Resolve root — try nodeId directly, then slug-based fallback
            root_rec = session.run(
                """
                MATCH (c:Case)
                WHERE c.nodeId = $nid OR c.id = $nid
                RETURN c.nodeId AS node_id,
                       coalesce(c.shortName, c.name, c.nodeId) AS label,
                       coalesce(c.status, 'GOOD_LAW')           AS status
                LIMIT 1
                """,
                nid=node_id,
            ).single()

            if root_rec is None:
                return None

            root = {
                "id":     root_rec["node_id"],
                "label":  root_rec["label"],
                "status": root_rec["status"],
            }

            # 2-hop traversal via treatment + citation edges
            result = session.run(
                """
                MATCH (root:Case)
                WHERE root.nodeId = $nid OR root.id = $nid
                CALL {
                    WITH root
                    MATCH (root)-[r:OVERRULES|DISTINGUISHES|DOUBTED_BY|CITES]->(b:Case)
                    RETURN root AS src, type(r) AS rel_type, b AS tgt
                    UNION
                    WITH root
                    MATCH (a:Case)-[r:OVERRULES|DISTINGUISHES|DOUBTED_BY|CITES]->(root)
                    RETURN a AS src, type(r) AS rel_type, root AS tgt
                }
                RETURN
                    coalesce(src.nodeId, src.id)                AS src_id,
                    coalesce(src.shortName, src.name, src.nodeId) AS src_label,
                    coalesce(src.status, 'GOOD_LAW')            AS src_status,
                    rel_type,
                    coalesce(tgt.nodeId, tgt.id)                AS tgt_id,
                    coalesce(tgt.shortName, tgt.name, tgt.nodeId) AS tgt_label,
                    coalesce(tgt.status, 'GOOD_LAW')            AS tgt_status
                LIMIT 40
                """,
                nid=node_id,
            )

            nodes: dict[str, dict] = {}
            edges: list[dict] = []
            seen_edges: set[tuple] = set()

            for rec in result:
                src_id = rec["src_id"]
                tgt_id = rec["tgt_id"]

                for nid_, label_, status_ in (
                    (src_id, rec["src_label"], rec["src_status"]),
                    (tgt_id, rec["tgt_label"], rec["tgt_status"]),
                ):
                    if nid_ and nid_ != root["id"]:
                        nodes.setdefault(nid_, {"id": nid_, "label": label_, "status": status_})

                edge_key = (src_id, tgt_id, rec["rel_type"])
                if edge_key not in seen_edges and src_id and tgt_id:
                    seen_edges.add(edge_key)
                    edges.append({"source": src_id, "target": tgt_id, "type": rec["rel_type"]})

            return {
                "root":  root,
                "nodes": list(nodes.values()),
                "edges": edges,
            }

    except neo4j_exc.ServiceUnavailable:
        return None
    except Exception:
        return None


# ── CSV fallback ──────────────────────────────────────────────────────────────

def _find_lawyer_data() -> Path | None:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        candidate = parent / "lawyer-data"
        if candidate.is_dir():
            return candidate
    return None


def _csv_graph(node_id: str) -> dict:
    data_dir = _find_lawyer_data()
    root_slug = _slug(node_id)
    empty = {"root": {"id": root_slug, "label": node_id, "status": "UNKNOWN"}, "nodes": [], "edges": []}

    if data_dir is None:
        return empty

    # Load CSV cases
    cases: dict[str, dict] = {}
    csv_path = data_dir / "cases.csv"
    if csv_path.exists():
        with csv_path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                sn = row.get("short_name", "").strip()
                if not sn:
                    continue
                node = {"id": _slug(sn), "label": sn, "status": row.get("status", "GOOD_LAW").strip()}
                cases[_slug(sn)] = node
                cases[sn.lower()] = node

    root = cases.get(root_slug) or cases.get(node_id.lower()) or empty["root"]

    # Load CSV edges
    all_edges: list[dict] = []
    csv_path = data_dir / "treatments.csv"
    if csv_path.exists():
        with csv_path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                fn = row.get("case_from_short_name", "").strip()
                tn = row.get("case_to_short_name", "").strip()
                tr = row.get("treatment", "").strip().upper()
                if fn and tn and tr in _VALID_TREATMENTS:
                    all_edges.append({"source": _slug(fn), "target": _slug(tn), "type": tr})

    # BFS — 2 hops
    visited: set[str] = {root["id"]}
    result_edges: list[dict] = []
    result_nodes: dict[str, dict] = {}
    seen_edges: set[tuple] = set()
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
            for nid_ in (src, tgt):
                if nid_ not in visited:
                    visited.add(nid_)
                    next_frontier.add(nid_)
                if nid_ != root["id"]:
                    result_nodes.setdefault(
                        nid_,
                        cases.get(nid_, {"id": nid_, "label": nid_, "status": "UNKNOWN"}),
                    )
        frontier = next_frontier

    return {"root": root, "nodes": list(result_nodes.values()), "edges": result_edges}


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/graph/{node_id}")
def get_citation_graph(node_id: str) -> dict:
    """
    Returns the citation network around node_id for react-flow.
    Neo4j primary — returns OVERRULES / DISTINGUISHES / CITES / DOUBTED_BY
    edges from the full graph. Falls back to CSV when Neo4j unreachable.
    """
    return _neo4j_graph(node_id) or _csv_graph(node_id)
