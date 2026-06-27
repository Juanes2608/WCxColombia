"""
ICorpusRepository implementation backed by Neo4j Aura.

Lookup strategy (two tiers):
  1. Full-text index search (Lucene) — fast, fuzzy, handles formatting variants.
  2. Fallback to CONTAINS/toLower — used when full-text index doesn't exist yet
     (e.g. first run before schema.cypher has been applied).

Gracefully degrades to None (→ FABRICATED) when Neo4j is unreachable.
"""
from __future__ import annotations

import logging

from neo4j import exceptions as neo4j_exc

from app.adapters.neo4j.driver import get_driver
from app.ports.corpus import CaseNode, ICorpusRepository

logger = logging.getLogger("traceit.corpus")


class Neo4jCorpusAdapter(ICorpusRepository):

    def lookup(self, citation_fragment: str) -> CaseNode | None:
        driver = get_driver()
        if driver is None:
            return None
        try:
            with driver.session() as session:
                node_id = self._fulltext_lookup(session, citation_fragment)
                if node_id is None:
                    node_id = self._fallback_lookup(session, citation_fragment)
                if node_id is None:
                    return None
                return self._build_node(session, node_id)
        except neo4j_exc.ServiceUnavailable:
            logger.warning("Neo4j unavailable — corpus lookup degraded to None")
            return None

    def get_misapplied_table(self) -> dict[str, str]:
        driver = get_driver()
        if driver is None:
            return {}
        try:
            with driver.session() as session:
                result = session.run(
                    "MATCH (c:Case)-[m:MISAPPLIED_AS]->() "
                    "RETURN c.nodeId AS nodeId, m.incorrectProposition AS text"
                )
                return {rec["nodeId"]: rec["text"] for rec in result if rec.get("text")}
        except neo4j_exc.ServiceUnavailable:
            return {}

    # ── Private helpers ───────────────────────────────────────────────────────

    def list_all(self) -> list[dict]:
        """All verified cases as [{citation, short_name, proposition}] for find_supporting_authority."""
        driver = get_driver()
        if driver is None:
            return []
        try:
            with driver.session() as session:
                result = session.run(
                    """
                    MATCH (c:Case)
                    WHERE c.verified = true
                    OPTIONAL MATCH (c)-[:ESTABLISHES]->(p:Proposition)
                    WITH c, collect(p.text) AS props
                    RETURN c.citation    AS citation,
                           c.shortName  AS short_name,
                           CASE WHEN size(props) > 0 THEN props[0] ELSE '' END AS proposition
                    """
                )
                return [
                    {
                        "citation":   rec["citation"],
                        "short_name": rec["short_name"],
                        "proposition": rec["proposition"],
                    }
                    for rec in result
                ]
        except neo4j_exc.ServiceUnavailable:
            logger.warning("Neo4j unavailable — list_all degraded to []")
            return []
        except Exception as exc:
            logger.warning("Neo4j list_all failed: %s", exc)
            return []

    def _fulltext_lookup(self, session, fragment: str) -> str | None:
        """Lucene full-text search — requires caseSearchIndex to exist.

        Score threshold of 3.0 empirically separates genuine matches (score >13)
        from accidental token overlaps with fabricated citations (score <2).
        """
        try:
            result = session.run(
                """
                CALL db.index.fulltext.queryNodes("caseSearchIndex", $fragment)
                YIELD node AS c, score
                WHERE c.verified = true AND score > 3.0
                RETURN c.nodeId AS nodeId, score
                ORDER BY score DESC LIMIT 1
                """,
                fragment=_sanitize_lucene(fragment),
            )
            rec = result.single()
            return rec["nodeId"] if rec else None
        except Exception:
            # Index doesn't exist or Lucene parse error — fall through to fallback
            return None

    def _fallback_lookup(self, session, fragment: str) -> str | None:
        """String-contains fallback — works without full-text index."""
        lower = fragment.lower()
        result = session.run(
            """
            MATCH (c:Case)
            WHERE c.verified = true
              AND (toLower(c.citation) CONTAINS $lower
                   OR toLower(c.shortName) CONTAINS $lower)
            RETURN c.nodeId AS nodeId LIMIT 1
            """,
            lower=lower,
        )
        rec = result.single()
        return rec["nodeId"] if rec else None

    def _build_node(self, session, node_id: str) -> CaseNode | None:
        """Fetch full node + propositions."""
        case_rec = session.run(
            "MATCH (c:Case {nodeId: $id}) "
            "RETURN c.citation AS citation, c.shortName AS shortName, "
            "       c.domain AS domain, c.status AS status, "
            "       c.court AS court, c.bailiiUrl AS bailiiUrl, "
            "       c.keyParagraph AS keyParagraph",
            id=node_id,
        ).single()
        if case_rec is None:
            return None

        props_rec = session.run(
            "MATCH (c:Case {nodeId: $id})-[:ESTABLISHES]->(p:Proposition) "
            "RETURN collect(p.text) AS propositions",
            id=node_id,
        ).single()

        return CaseNode(
            node_id=node_id,
            citation=case_rec["citation"],
            short_name=case_rec["shortName"],
            domain=case_rec["domain"],
            propositions=props_rec["propositions"] if props_rec else [],
            status=case_rec["status"],
            court=case_rec.get("court"),
            bailii_url=case_rec.get("bailiiUrl") or None,
            key_paragraph=case_rec.get("keyParagraph") or None,
        )


def _sanitize_lucene(fragment: str) -> str:
    """Escape Lucene special characters to prevent query parse errors."""
    special = set(r'\+-&&||!(){}[]^"~*?:/')
    return "".join(f"\\{c}" if c in special else c for c in fragment)
