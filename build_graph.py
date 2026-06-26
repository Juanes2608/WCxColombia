"""
build_graph.py - end-to-end pipeline: Cellar (EU case law) -> Neo4j.

Runs the 4 steps end to end:
  1. fetch citation edges from Cellar
  2. fetch title/date metadata for every case those edges touch
  3. load nodes + edges into Neo4j
  4. print the most-cited cases (the 'landmarks')

This loads the EU side of the graph. The UK Case Database is loaded
separately by load_casedb.py; both write into the same (:Case) graph.

    python build_graph.py --limit 200        # rebuild (wipes first)
    python build_graph.py --limit 500 --keep # add to existing graph
"""

from __future__ import annotations

import argparse

from eurlex_neo4j.cellar import fetch_citations, fetch_metadata
from eurlex_neo4j.graph import CitationGraph

EURLEX_TXT = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex}"


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the EU citation graph in Neo4j.")
    ap.add_argument("--limit", type=int, default=200, help="max citation edges to pull")
    ap.add_argument("--keep", action="store_true", help="don't wipe the graph first")
    args = ap.parse_args()

    # 1. EDGES -------------------------------------------------------------
    print(f"1/4  Cellar: fetching up to {args.limit} citation edges ...")
    raw_edges = fetch_citations(limit=args.limit)
    celex_ids = {e["citingCelex"] for e in raw_edges} | {e["citedCelex"] for e in raw_edges}
    print(f"     -> {len(raw_edges)} citations between {len(celex_ids)} cases")

    # 2. NODE METADATA -----------------------------------------------------
    print(f"2/4  Cellar: fetching titles + dates for {len(celex_ids)} cases ...")
    meta = fetch_metadata(sorted(celex_ids))
    # one cellar row per (case, maybe-title); collapse to one dict per celex
    by_celex: dict[str, dict] = {}
    for row in meta:
        celex = row["celex"]
        slot = by_celex.setdefault(celex, {})
        if row.get("title") and "title" not in slot:
            slot["title"] = row["title"]
        if row.get("date") and "date" not in slot:
            slot["date"] = row["date"]
    with_title = sum(1 for v in by_celex.values() if v.get("title"))
    print(f"     -> metadata for {len(by_celex)} cases ({with_title} have English titles)")

    # transform Cellar rows -> our generic node shape (id = celex for EU)
    cases = [
        {
            "id": celex,
            "celex": celex,
            "name": info.get("title"),
            "year": (info.get("date") or "")[:4] or None,
            "jurisdiction": "EU",
            "court": "CJEU",
            "source": "cellar",
            "url": EURLEX_TXT.format(celex=celex),
        }
        for celex, info in by_celex.items()
    ]
    edges = [{"citingId": e["citingCelex"], "citedId": e["citedCelex"]} for e in raw_edges]

    # 3. LOAD --------------------------------------------------------------
    print("3/4  Neo4j: connecting ...")
    graph = CitationGraph()
    try:
        graph.ensure_constraints()
        if not args.keep:
            graph.wipe()
        graph.upsert_cases(cases)
        graph.upsert_edges(edges, rel="CITES")
        c = graph.counts()
        print(f"     -> loaded {c['cases']} :Case nodes, {c['edges']} :CITES relationships")

        # 4. LANDMARKS -----------------------------------------------------
        print("4/4  The most-cited cases in this slice (the 'landmarks'):")
        for row in graph.most_cited(limit=8):
            name = (row.get("name") or "<no English title>")[:60]
            print(f"     {row['citations']:>4}x  {row['id']}  {name}")
    finally:
        graph.close()


if __name__ == "__main__":
    main()
