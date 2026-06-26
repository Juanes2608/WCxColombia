"""
passage_store.py - store passages + embeddings in Neo4j and query them.

Adds a passage layer to the SAME graph the existence/good-law half uses,
without touching its (:Case) nodes:

    (:Case {id})-[:HAS_PASSAGE]->(:Passage {id, case_id, para_no, text, embedding})

plus a native Neo4j vector index over Passage.embedding for semantic search.
Keyed on the case `id` (the contract with the teammate's graph).
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from neo4j import GraphDatabase

INDEX_NAME = "passage_embedding"


class PassageStore:
    def __init__(self) -> None:
        load_dotenv()
        uri = os.environ["NEO4J_URI"]
        user = os.environ["NEO4J_USERNAME"]
        password = os.environ["NEO4J_PASSWORD"]
        self._database = os.environ.get("NEO4J_DATABASE", "neo4j")
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self) -> None:
        self._driver.close()

    def _run(self, cypher: str, **params):
        with self._driver.session(database=self._database) as session:
            return session.run(cypher, **params).data()

    # -- schema ------------------------------------------------------------
    def ensure_schema(self, dim: int) -> None:
        self._run(
            "CREATE CONSTRAINT passage_id IF NOT EXISTS "
            "FOR (p:Passage) REQUIRE p.id IS UNIQUE"
        )
        # Native vector index (Neo4j 5.x). cosine similarity over `dim` floats.
        self._run(
            f"CREATE VECTOR INDEX {INDEX_NAME} IF NOT EXISTS "
            "FOR (p:Passage) ON (p.embedding) "
            "OPTIONS {indexConfig: {"
            " `vector.dimensions`: $dim,"
            " `vector.similarity_function`: 'cosine'}}",
            dim=dim,
        )

    def wipe_passages(self) -> None:
        self._run("MATCH (p:Passage) DETACH DELETE p")

    # -- write -------------------------------------------------------------
    def upsert_passages(
        self, case_id: str, passages: list[str], vectors: list[list[float]]
    ) -> int:
        rows = [
            {"pid": f"{case_id}#p{i}", "para_no": i, "text": t, "embedding": v}
            for i, (t, v) in enumerate(zip(passages, vectors))
        ]
        self._run(
            """
            MERGE (c:Case {id: $case_id})
            WITH c
            UNWIND $rows AS row
            MERGE (p:Passage {id: row.pid})
            SET   p.case_id  = $case_id,
                  p.para_no  = row.para_no,
                  p.text     = row.text,
                  p.embedding = row.embedding
            MERGE (c)-[:HAS_PASSAGE]->(p)
            """,
            case_id=case_id,
            rows=rows,
        )
        return len(rows)

    # -- read --------------------------------------------------------------
    def query(self, query_vec: list[float], k: int = 5, case_id: str | None = None):
        """
        Top-k passages by cosine similarity. If case_id is given, restrict to
        that case (over-fetch from the index, then filter, then slice).
        """
        fetch = k if case_id is None else max(k * 10, 50)
        rows = self._run(
            f"""
            CALL db.index.vector.queryNodes('{INDEX_NAME}', $fetch, $qvec)
            YIELD node, score
            WHERE $case_id IS NULL OR node.case_id = $case_id
            RETURN node.case_id AS case_id, node.para_no AS para_no,
                   node.text AS text, score
            ORDER BY score DESC
            LIMIT $k
            """,
            fetch=fetch,
            qvec=query_vec,
            case_id=case_id,
            k=k,
        )
        return rows

    def loaded_case_ids(self) -> set:
        """Case ids that already have >=1 passage (for resume)."""
        rows = self._run(
            "MATCH (p:Passage) RETURN DISTINCT p.case_id AS cid"
        )
        return {r["cid"] for r in rows}

    def counts(self) -> dict:
        n = self._run("MATCH (p:Passage) RETURN count(p) AS n")[0]["n"]
        cases = self._run(
            "MATCH (c:Case)-[:HAS_PASSAGE]->(:Passage) "
            "RETURN count(DISTINCT c) AS n"
        )[0]["n"]
        return {"passages": n, "cases_with_passages": cases}
