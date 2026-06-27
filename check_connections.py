"""
check_connections.py - verify the live connections the 3-agent pipeline needs.

    python check_connections.py

Checks, in order:
  1. Neo4j   (the configured database) - existence + passage layers
  2. Embeddings (fastembed local) - the vector that drives Agents 2 & 3
  3. Cellar  (EU Publications Office SPARQL) - the EU existence source

Prints [OK]/[FAIL] per connection. Read-only.
"""

from __future__ import annotations

import os
import time

from dotenv import load_dotenv


def ok(label: str, detail: str = "") -> None:
    print(f"[OK]   {label}" + (f"  -  {detail}" if detail else ""))


def fail(label: str, err: Exception) -> None:
    print(f"[FAIL] {label}  -  {type(err).__name__}: {err}")


def main() -> None:
    load_dotenv()
    uri = os.environ.get("NEO4J_URI", "<unset>")
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    print(f"Neo4j target: {uri}  (database: {db})\n")

    # 1. Neo4j: existence graph + passage layer
    try:
        from eurlex_neo4j.graph import CitationGraph
        from retrieval.passage_store import PassageStore

        g = CitationGraph()
        try:
            c = g.counts()
        finally:
            g.close()
        s = PassageStore()
        try:
            p = s.counts()
        finally:
            s.close()
        ok("Neo4j", f"{c['cases']} :Case, {c['edges']} edges, "
                    f"{p['passages']} :Passage across {p['cases_with_passages']} cases")
    except Exception as e:
        fail("Neo4j", e)

    # 2. Embeddings (must match the vector index dimension)
    try:
        from retrieval.embed import get_embedder

        emb = get_embedder()
        v = emb.embed(["duty of care three-part test"])
        ok("Embeddings", f"{emb.name}  dim={len(v[0])}")
    except Exception as e:
        fail("Embeddings", e)

    # 3. Cellar (EU Publications Office)
    try:
        from eurlex_neo4j.cellar import case_exists, fetch_citations

        t = time.time()
        edges = fetch_citations(limit=1)
        dt = time.time() - t
        real = case_exists("62008TJ0288")    # a known real CJEU judgment
        fake = case_exists("69999XX9999")    # a malformed/non-existent id
        ok("Cellar", f"SPARQL responde en {dt:.1f}s ({len(edges)} arista); "
                     f"case_exists(real)={real}, case_exists(fake)={fake}")
    except Exception as e:
        fail("Cellar", e)


if __name__ == "__main__":
    main()
