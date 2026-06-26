"""
test_connection.py - 10-second check that your Neo4j Aura .env works.

    python test_connection.py

A freshly-resumed Aura instance can take ~60s before it accepts
connections, so if this times out, wait a minute and retry.
"""

from eurlex_neo4j.graph import CitationGraph


def main() -> None:
    graph = CitationGraph()
    try:
        ok = graph._run("RETURN 1 AS ok")[0]["ok"]
        counts = graph.counts()
        print(f"[OK] Connected to Neo4j. RETURN 1 = {ok}")
        print(f"   Graph currently holds {counts['cases']} :Case nodes, "
              f"{counts['edges']} relationships.")
    finally:
        graph.close()


if __name__ == "__main__":
    main()
