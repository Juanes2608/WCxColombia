"""
graph.py - the Neo4j side: load the citation graph, then query it.

This is the "ground truth" store for the White & Case citation checker:
a citation either exists as a (:Case) node or it doesn't, and the edges
between cases tell us whether an authority is still good law.

Multi-source by design. The canonical key is `id` (a string), NOT celex,
so the SAME graph holds:
  - EU case law from Cellar          -> id = CELEX  (e.g. "62008TJ0288")
  - UK/EW case law from the Case DB  -> id = neutral citation or a slug
  - later: US (CourtListener), UK legislation, ...
`celex` survives as a plain property for the EU rows.

Model (one node type, a few edge types):

    (:Case {id, name, citation, celex, year, court,
            jurisdiction, summary, source, url})
    (:Case)-[:CITES]->(:Case)         # A relied on B
    (:Case)-[:OVERRULES]->(:Case)     # A killed B as good law
    (:Case)-[:DISTINGUISHES]->(:Case) # A said B doesn't apply here
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from neo4j import GraphDatabase

# Relationship types we allow. Cypher can't parameterise a rel type, so we
# whitelist + inline it (prevents injection while staying generic).
ALLOWED_RELS = {"CITES", "OVERRULES", "DISTINGUISHES"}


class CitationGraph:
    """A thin wrapper around the Neo4j driver, scoped to our Case graph."""

    def __init__(self) -> None:
        load_dotenv()  # read NEO4J_* from the local .env
        uri = os.environ["NEO4J_URI"]
        user = os.environ["NEO4J_USERNAME"]
        password = os.environ["NEO4J_PASSWORD"]
        self._database = os.environ.get("NEO4J_DATABASE", "neo4j")
        # One driver per process; it manages a connection pool for us.
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self) -> None:
        self._driver.close()

    # -- a tiny helper so every call runs against the right database --------
    def _run(self, cypher: str, **params):
        with self._driver.session(database=self._database) as session:
            return session.run(cypher, **params).data()

    # ----------------------------------------------------------------------
    # SCHEMA: a uniqueness constraint doubles as an index.
    # MERGE on :Case(id) is only safe + fast once this exists.
    # ----------------------------------------------------------------------
    def ensure_constraints(self) -> None:
        self._run(
            "CREATE CONSTRAINT case_id IF NOT EXISTS "
            "FOR (c:Case) REQUIRE c.id IS UNIQUE"
        )

    def wipe(self) -> None:
        """Clear the graph so a rebuild starts clean (skip with --keep)."""
        self._run("MATCH (n) DETACH DELETE n")

    # ----------------------------------------------------------------------
    # WRITE: load nodes and edges in bulk.
    # UNWIND turns one parameter list into many rows, so the whole batch is
    # a single round-trip. MERGE = "match if it exists, else create" -> no
    # duplicates even if we run the load twice. coalesce() keeps existing
    # values when a new row omits a field.
    # ----------------------------------------------------------------------
    def upsert_cases(self, cases: list[dict]) -> None:
        """
        cases = [{"id": ..., "name": ..., "citation": ..., "celex": ...,
                  "year": ..., "court": ..., "jurisdiction": ...,
                  "summary": ..., "source": ..., "url": ...}, ...]
        Only `id` is required; everything else is optional.
        """
        self._run(
            """
            UNWIND $cases AS row
            MERGE (c:Case {id: row.id})
            SET   c.name         = coalesce(row.name, c.name),
                  c.citation     = coalesce(row.citation, c.citation),
                  c.celex        = coalesce(row.celex, c.celex),
                  c.year         = coalesce(row.year, c.year),
                  c.court        = coalesce(row.court, c.court),
                  c.jurisdiction = coalesce(row.jurisdiction, c.jurisdiction),
                  c.summary      = coalesce(row.summary, c.summary),
                  c.source       = coalesce(row.source, c.source),
                  c.url          = coalesce(row.url, c.url)
            """,
            cases=cases,
        )

    def upsert_edges(self, edges: list[dict], rel: str = "CITES") -> None:
        """
        edges = [{"citingId": ..., "citedId": ...}, ...]
        `rel` reuses this for CITES / OVERRULES / DISTINGUISHES.
        """
        if rel not in ALLOWED_RELS:
            raise ValueError(f"rel must be one of {ALLOWED_RELS}")
        self._run(
            f"""
            UNWIND $edges AS row
            MERGE (a:Case {{id: row.citingId}})
            MERGE (b:Case {{id: row.citedId}})
            MERGE (a)-[:{rel}]->(b)
            """,
            edges=edges,
        )

    # ----------------------------------------------------------------------
    # READ: the queries the citation checker actually calls.
    # ----------------------------------------------------------------------
    def find_case(self, text: str, limit: int = 5) -> list[dict]:
        """
        Existence check. Match on exact id/citation OR a fuzzy name contains.
        Empty result => the citation is not in our corpus (NOT_FOUND);
        verify.py decides fabricated-vs-uncovered, never this query alone.
        """
        return self._run(
            """
            MATCH (c:Case)
            WHERE c.id = $text
               OR c.citation = $text
               OR toLower(c.name) CONTAINS toLower($text)
            RETURN c.id AS id, c.name AS name, c.citation AS citation,
                   c.year AS year, c.court AS court,
                   c.jurisdiction AS jurisdiction, c.summary AS summary,
                   c.source AS source, c.url AS url
            LIMIT $limit
            """,
            text=text,
            limit=limit,
        )

    def negative_treatment(self, case_id: str) -> list[dict]:
        """
        Is this authority still good law? Return any case that OVERRULES it.
        A non-empty result is the "you cited overruled law" red flag.
        """
        return self._run(
            """
            MATCH (later:Case)-[:OVERRULES]->(c:Case {id: $case_id})
            RETURN later.id AS by_id, later.name AS by_name,
                   later.citation AS by_citation
            """,
            case_id=case_id,
        )

    def most_cited(self, limit: int = 10) -> list[dict]:
        """Landmarks = highest in-degree. Foundational authority."""
        return self._run(
            """
            MATCH (c:Case)<-[:CITES]-()
            RETURN c.id AS id, c.name AS name, count(*) AS citations
            ORDER BY citations DESC
            LIMIT $limit
            """,
            limit=limit,
        )

    def counts(self) -> dict:
        """Quick graph size for sanity checks / the demo header."""
        nodes = self._run("MATCH (c:Case) RETURN count(c) AS n")[0]["n"]
        rels = self._run("MATCH ()-[r]->() RETURN count(r) AS n")[0]["n"]
        return {"cases": nodes, "edges": rels}
