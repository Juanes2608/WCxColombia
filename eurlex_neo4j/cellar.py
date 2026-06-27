"""
cellar.py - the SPARQL client + the queries we run against the EU's Cellar.

Everything in this file is "read-only": we ask the Publications Office of the
EU for data and hand plain Python dicts back to the rest of the pipeline.
Nothing here knows that Neo4j exists - that separation is on purpose.
"""

from __future__ import annotations

import requests

# The public SPARQL endpoint behind EUR-Lex. No API key, no auth.
CELLAR_ENDPOINT = "http://publications.europa.eu/webapi/rdf/sparql"

# The one prefix we reuse in every query: the CDM (Common Data Model) ontology.
CDM = "PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>"


def _run(query: str) -> list[dict]:
    """
    Send one SPARQL query and return its rows as a list of plain dicts.

    A SPARQL JSON result nests every cell as {"value": "...", "type": "..."}.
    We flatten it so the caller just sees {"column": "value"}.
    """
    resp = requests.get(
        CELLAR_ENDPOINT,
        params={"query": query, "format": "application/sparql-results+json"},
        headers={"Accept": "application/sparql-results+json"},
        timeout=90,
    )
    resp.raise_for_status()
    rows = resp.json()["results"]["bindings"]
    return [{k: cell["value"] for k, cell in row.items()} for row in rows]


# ---------------------------------------------------------------------------
# Query 1 - the EDGES of the graph: "case A cites case B"
# ---------------------------------------------------------------------------
def fetch_citations(limit: int = 200) -> list[dict]:
    """
    Return up to `limit` citation edges between two pieces of *case law*.

    cdm:work_cites_work is the raw "cites" relationship; the two STRSTARTS
    filters keep only documents whose CELEX id starts with "6" (= case law),
    so we don't drag in legislation or treaties.
    """
    query = f"""{CDM}
    SELECT ?citingCelex ?citedCelex WHERE {{
      ?citing  cdm:work_cites_work         ?cited .
      ?citing  cdm:resource_legal_id_celex ?citingCelex .
      ?cited   cdm:resource_legal_id_celex ?citedCelex .
      FILTER(STRSTARTS(STR(?citingCelex), "6"))
      FILTER(STRSTARTS(STR(?citedCelex),  "6"))
    }}
    LIMIT {int(limit)}
    """
    return _run(query)


# ---------------------------------------------------------------------------
# Query 2 - the NODES of the graph: title + date for a set of CELEX ids
# ---------------------------------------------------------------------------
def fetch_metadata(celex_ids: list[str], chunk_size: int = 50) -> list[dict]:
    """
    Return {celex, title, date} for each id in `celex_ids`.

    SPARQL endpoints choke on huge queries, so we split the id list into
    chunks and feed each chunk in via a VALUES block (an inline table of ids).
    Title lives on the *expression* (the language-specific view of a work),
    so we join work -> expression and keep only the English title.
    """
    results: list[dict] = []
    unique = sorted(set(celex_ids))

    for start in range(0, len(unique), chunk_size):
        chunk = unique[start:start + chunk_size]
        # CELEX ids are stored as xsd:string-typed literals in Cellar, so a
        # plain "id" won't match (SPARQL term equality is datatype-sensitive).
        # Emit typed literals so the join stays index-backed and fast.
        values = " ".join(f'"{c}"^^xsd:string' for c in chunk)
        query = f"""{CDM}
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        SELECT ?celex ?title ?date WHERE {{
          VALUES ?celex {{ {values} }}
          ?work cdm:resource_legal_id_celex ?celex .
          OPTIONAL {{ ?work cdm:work_date_document ?date . }}
          OPTIONAL {{
            ?exp cdm:expression_belongs_to_work ?work ;
                 cdm:expression_title ?title ;
                 cdm:expression_uses_language
                   <http://publications.europa.eu/resource/authority/language/ENG> .
          }}
        }}
        """
        results.extend(_run(query))

    return results


# ---------------------------------------------------------------------------
# Existence check for a SINGLE id (Agent 1, EU branch)
# ---------------------------------------------------------------------------
def case_exists(celex: str) -> bool:
    """
    True if one CELEX id resolves to a real document in Cellar.

    Agent 1 asks "does this citation exist?". For EU/CELEX-style citations we
    answer it against the live Publications Office record: a non-empty metadata
    row means the work is real. UK case law is checked in the Neo4j graph
    instead; this is only the EU fallback so the existence layer can reach
    beyond the loaded corpus.
    """
    return bool(fetch_metadata([celex]))


# Quick manual smoke test: `python -m eurlex_neo4j.cellar`
if __name__ == "__main__":
    edges = fetch_citations(limit=10)
    print(f"{len(edges)} edges, e.g. {edges[0]}")
    sample_ids = [e["citedCelex"] for e in edges]
    meta = fetch_metadata(sample_ids)
    for m in meta:
        print(m.get("celex"), "-", m.get("title", "<no EN title>")[:70])
