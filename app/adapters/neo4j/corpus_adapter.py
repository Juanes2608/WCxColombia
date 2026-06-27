"""
ICorpusRepository implementation backed by Neo4j Aura.

DUAL-SCHEMA AWARENESS (important):
  The graph has two overlapping Case shapes:
    PDF-ingest layer   (~57 cases): Case.id, Case.name, Case.source → has :Passage nodes
    Propositions layer (~40 cases): Case.nodeId, Case.citation, Case.shortName → has :Proposition edges

  lookup() targets the propositions layer (caseSearchIndex covers citation + shortName).
  find_passages() must try BOTH Case.id and Case.nodeId because the node returned by
  lookup() may live in the propositions layer while its passages are keyed on Case.id.

  find_suggestions() searches Passage.text via the passageText FULLTEXT index, which
  is on the PDF-ingest layer — results expose Case.name/Case.id rather than
  Case.citation/Case.shortName.

INDEXES IN USE:
  caseSearchIndex   FULLTEXT on Case.citation + Case.shortName (propositions layer)
  caseName          FULLTEXT on Case.name (PDF-ingest layer)
  passageText       FULLTEXT on Passage.text ← used by find_suggestions
  passage_embedding VECTOR  on Passage.embedding (384-dim cosine) ← used by find_relevant_passages
"""
from __future__ import annotations

import logging
import re

from neo4j import exceptions as neo4j_exc

from app.adapters.neo4j.driver import get_driver
from app.ports.corpus import CaseNode, ICorpusRepository, Passage, SuggestionResult

logger = logging.getLogger("traceit.corpus")

# Stopwords for Python-side proposition scoring (4+ letter words that add no signal)
_PROP_STOPWORDS = {
    "that", "this", "with", "from", "have", "been", "were", "they", "their",
    "which", "when", "where", "case", "court", "held", "lord", "lord", "lords",
    "under", "must", "will", "would", "shall", "also", "such", "than", "more",
    "upon", "into", "over", "only", "both", "each", "some", "what", "there",
    "does", "does", "done", "made", "said", "make", "take", "give", "find",
}


class Neo4jCorpusAdapter(ICorpusRepository):

    # ── lookup ────────────────────────────────────────────────────────────────

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
                node = self._build_node(session, node_id)
                if node and not _parties_overlap(citation_fragment, node):
                    logger.info(
                        "Rejected false-positive match: query=%r → node=%r",
                        citation_fragment[:60], node.short_name,
                    )
                    return None
                return node
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

    # ── find_passages ─────────────────────────────────────────────────────────

    def find_passages(self, node_id: str) -> list[Passage]:
        """
        Return all judgment chunks for a case, ordered by para_no.

        Dual-schema: tries Case.id first (PDF-ingest layer), then Case.nodeId
        (propositions layer), then a name-based fuzzy match derived from the slug.
        Returns [] when the case has no passages (metadata-only nodes).
        """
        driver = get_driver()
        if driver is None:
            return []
        try:
            with driver.session() as session:
                passages = self._fetch_passages_by_id(session, node_id)
                if not passages:
                    # Derive a human-readable name from the slug for name-based match
                    name_hint = node_id.replace("-", " ")
                    passages = self._fetch_passages_by_name(session, name_hint)
                return passages
        except neo4j_exc.ServiceUnavailable:
            logger.warning("Neo4j unavailable — find_passages degraded to []")
            return []
        except Exception as exc:
            logger.warning("find_passages failed for '%s': %s", node_id, exc)
            return []

    def _fetch_passages_by_id(self, session, node_id: str) -> list[Passage]:
        """Try Case.id = node_id OR Case.nodeId = node_id."""
        result = session.run(
            """
            MATCH (c:Case)-[:HAS_PASSAGE]->(p:Passage)
            WHERE c.id = $node_id OR c.nodeId = $node_id
            RETURN p.id      AS passage_id,
                   p.case_id AS case_id,
                   p.para_no AS para_no,
                   p.text    AS text
            ORDER BY p.para_no
            """,
            node_id=node_id,
        )
        return [_row_to_passage(rec) for rec in result if rec.get("text")]

    def _fetch_passages_by_name(self, session, name_hint: str) -> list[Passage]:
        """Fuzzy name match — last resort when slug doesn't match either id field."""
        result = session.run(
            """
            MATCH (c:Case)-[:HAS_PASSAGE]->(p:Passage)
            WHERE toLower(c.name) CONTAINS $name
               OR toLower(c.shortName) CONTAINS $name
            RETURN p.id      AS passage_id,
                   p.case_id AS case_id,
                   p.para_no AS para_no,
                   p.text    AS text
            ORDER BY p.para_no
            LIMIT 50
            """,
            name=name_hint[:40].lower(),
        )
        return [_row_to_passage(rec) for rec in result if rec.get("text")]

    # ── find_suggestions ──────────────────────────────────────────────────────

    def find_suggestions(
        self,
        proposition: str,
        brief_context: str,
        domain: str | None = None,
        limit: int = 6,
        exclude_node_id: str | None = None,
    ) -> list[SuggestionResult]:
        """
        Find cases that genuinely support the proposition the lawyer needs.

        Three signals ranked by confidence:
          1. Vector search on passage_embedding (semantic — highest confidence)
             Embeds proposition+context and finds cases with similar judgment text.
             Understands synonymy: "duty in negligence" ≈ "liability for defective premises".
          2. Proposition node keyword match (concept-level)
             Scans Proposition.text directly — covers the ~40 cases in the
             propositions layer that may have no passages.
          3. passageText FULLTEXT (keyword fallback)
             Catches specific legal terms not captured by the first two.

        Domain filter is lenient: cases with no domain property always pass.
        exclude_node_id removes the MISAPPLIED/OVERRULED case from its own suggestions.
        """
        driver = get_driver()
        if driver is None:
            return []

        search_text = f"{proposition} {brief_context}".strip()

        try:
            with driver.session() as session:
                vector_results  = self._vector_suggestions(session, search_text, domain, limit)
                graph_results   = self._graph_suggestions(session, proposition, domain, limit)
                ft_query        = _build_fulltext_query(search_text)
                passage_results = (
                    self._search_passages(session, ft_query, domain, limit)
                    if ft_query else []
                )
                merged = _merge_suggestions(vector_results, graph_results + passage_results, limit + 1)
                # Remove the case being analysed so it never suggests itself
                if exclude_node_id:
                    merged = [s for s in merged if s.node_id != exclude_node_id]
                return merged[:limit]
        except neo4j_exc.ServiceUnavailable:
            logger.warning("Neo4j unavailable — find_suggestions degraded to []")
            return []
        except Exception as exc:
            logger.warning("find_suggestions failed: %s", exc)
            return []

    def _vector_suggestions(
        self, session, search_text: str, domain: str | None, limit: int
    ) -> list[SuggestionResult]:
        """
        Global semantic search on the passage_embedding VECTOR index.

        Embeds the proposition+brief_context and finds judgment chunks across
        the whole corpus whose embedding is closest.  Groups by case (one result
        per case, best-scoring passage wins).  Tries to join with Proposition
        nodes for a clean one-sentence display proposition; falls back to the
        passage excerpt when no Proposition node exists.

        Returns [] when fastembed is not installed (falls back to other signals).
        """
        from app.adapters.neo4j.embedder import embed
        vec = embed(search_text[:600])   # cap length so embedding stays stable
        if vec is None:
            return []

        try:
            # Over-query by 8× so we get enough unique cases after grouping.
            # Aggregate score: best_score weighted by how many passages match
            # (a case with 5 passages scoring 0.7 beats one with 1 scoring 0.75).
            result = session.run(
                """
                CALL db.index.vector.queryNodes('passage_embedding', $k, $vec)
                YIELD node AS p, score
                MATCH (c:Case)-[:HAS_PASSAGE]->(p)
                WHERE (c.status IS NULL OR c.status <> 'OVERRULED')
                  AND ($domain IS NULL OR c.domain IS NULL OR c.domain = $domain)
                WITH c,
                     max(score)           AS best_score,
                     count(p)             AS n_passages,
                     collect(p.text)[0]  AS best_excerpt,
                     p.case_id            AS case_id
                WITH c, best_score, n_passages, best_excerpt, case_id,
                     best_score * (1.0 + log(toFloat(n_passages))) AS weighted_score
                OPTIONAL MATCH (prop_node:Proposition)
                WHERE prop_node.caseId = coalesce(c.id, case_id)
                   OR prop_node.caseId = c.nodeId
                WITH c, weighted_score, n_passages,
                     best_excerpt, collect(prop_node.text)[0] AS clean_prop
                RETURN
                    coalesce(c.id, c.nodeId)               AS node_id,
                    coalesce(c.citation, c.name, c.nodeId) AS citation,
                    coalesce(c.shortName, c.name, c.id)    AS short_name,
                    coalesce(c.domain, '')                  AS domain,
                    c.bailiiUrl                             AS bailii_url,
                    coalesce(clean_prop, best_excerpt)      AS proposition,
                    weighted_score                          AS score,
                    n_passages
                ORDER BY weighted_score DESC
                LIMIT $limit
                """,
                k=limit * 10,
                vec=vec,
                domain=domain,
                limit=limit,
            )
            suggestions = [
                SuggestionResult(
                    node_id=rec["node_id"] or "",
                    citation=rec["citation"] or rec["node_id"] or "",
                    short_name=rec["short_name"] or rec["node_id"] or "",
                    proposition=(rec["proposition"] or "")[:200],
                    domain=rec["domain"] or "",
                    bailii_url=rec.get("bailii_url"),
                    score=float(rec["score"] or 0),
                )
                for rec in result if rec.get("node_id")
            ]
            logger.info(
                "Vector suggestions: %d candidates (top weighted_score=%.3f)",
                len(suggestions),
                suggestions[0].score if suggestions else 0,
            )
            return suggestions
        except Exception as exc:
            logger.warning("Vector suggestion search failed: %s", exc)
            return []

    def _graph_suggestions(
        self, session, proposition: str, domain: str | None, limit: int
    ) -> list[SuggestionResult]:
        """
        Find cases whose Proposition nodes match the query proposition.

        Queries Proposition nodes DIRECTLY rather than via caseSearchIndex
        (caseSearchIndex only indexes case citations/names, not legal proposition text).
        The corpus is small enough (~40 cases with Proposition edges) that a full
        scan with Python-side scoring is fast and correct.

        Domain filter excludes null-domain cases only when both sides are non-null.
        """
        query_words = set(re.findall(r"[a-zA-Z]{4,}", proposition.lower())) - _PROP_STOPWORDS
        if not query_words:
            return []

        try:
            result = session.run(
                """
                MATCH (c:Case)-[:ESTABLISHES]->(p:Proposition)
                WHERE (c.status IS NULL OR c.status <> 'OVERRULED')
                  AND ($domain IS NULL OR c.domain IS NULL OR c.domain = $domain)
                WITH c, collect(p.text) AS props
                WHERE size(props) > 0
                RETURN
                    coalesce(c.nodeId, c.id)               AS node_id,
                    coalesce(c.citation, c.name, c.nodeId) AS citation,
                    coalesce(c.shortName, c.name, c.id)    AS short_name,
                    coalesce(c.domain, '')                  AS domain,
                    c.bailiiUrl                             AS bailii_url,
                    props[0]                               AS prop_text
                """,
                domain=domain,
            )

            scored: list[tuple[float, dict]] = []
            for rec in result:
                if not rec.get("node_id"):
                    continue
                prop_lower = (rec["prop_text"] or "").lower()
                if not prop_lower:
                    continue
                score = sum(1.0 for w in query_words if w in prop_lower)
                if score > 0:
                    scored.append((score, dict(rec)))

            scored.sort(key=lambda x: x[0], reverse=True)
            return [
                SuggestionResult(
                    node_id=rec["node_id"] or "",
                    citation=rec["citation"] or rec["node_id"] or "",
                    short_name=rec["short_name"] or rec["node_id"] or "",
                    proposition=(rec["prop_text"] or "")[:200],
                    domain=rec["domain"] or "",
                    bailii_url=rec.get("bailii_url"),
                    score=score,
                )
                for score, rec in scored[:limit]
            ]
        except Exception as exc:
            logger.warning("Graph suggestion search failed: %s", exc)
            return []

    def _search_passages(
        self, session, query: str, domain: str | None, limit: int
    ) -> list[SuggestionResult]:
        """
        Full-text search on passageText index, one SuggestionResult per unique Case.
        The best-scoring passage text becomes the displayed proposition.
        """
        result = session.run(
            """
            CALL db.index.fulltext.queryNodes("passageText", $query)
            YIELD node AS p, score
            MATCH (c:Case)-[:HAS_PASSAGE]->(p)
            WHERE (c.status IS NULL OR c.status <> 'OVERRULED')
              AND ($domain IS NULL OR c.domain IS NULL OR c.domain = $domain)
            WITH c, p, score
            ORDER BY score DESC
            WITH c,
                 collect(p.text)[0]      AS best_text,
                 collect(p.para_no)[0]   AS best_para,
                 max(score)              AS max_score
            RETURN
                coalesce(c.id, c.nodeId)               AS node_id,
                coalesce(c.citation, c.name, c.nodeId) AS citation,
                coalesce(c.shortName, c.name, c.id)    AS short_name,
                coalesce(c.domain, '')                 AS domain,
                c.bailiiUrl                            AS bailii_url,
                best_text                              AS proposition,
                max_score                              AS score
            ORDER BY max_score DESC
            LIMIT $limit
            """,
            query=query,
            domain=domain,
            limit=limit,
        )

        suggestions = []
        for rec in result:
            if not rec.get("node_id"):
                continue
            suggestions.append(SuggestionResult(
                node_id=rec["node_id"],
                citation=rec["citation"] or rec["node_id"],
                short_name=rec["short_name"] or rec["node_id"],
                proposition=(rec["proposition"] or "")[:200],
                domain=rec["domain"] or "",
                bailii_url=rec.get("bailii_url"),
                score=float(rec["score"] or 0),
            ))
        return suggestions

    # ── find_relevant_passages (vector search within a case) ─────────────────

    def find_relevant_passages(
        self,
        node_id: str,
        claim_text: str,
        k: int = 5,
    ) -> list[Passage]:
        """
        Return the k passages most semantically relevant to claim_text.

        Uses the passage_embedding VECTOR index (384-dim cosine, BAAI/bge-small-en-v1.5).
        Scopes the search to a single case via Passage.case_id.

        Falls back to find_passages() (all chunks, ordered by para_no) when:
          - fastembed is not installed
          - vector index query returns no results (dual-schema case_id mismatch)
          - Neo4j is unavailable
        """
        from app.adapters.neo4j.embedder import embed
        vec = embed(claim_text)
        if vec is None:
            return self.find_passages(node_id)

        driver = get_driver()
        if driver is None:
            return []
        try:
            with driver.session() as session:
                # Over-query (k*6) to compensate for case_id filter reducing results
                result = session.run(
                    """
                    CALL db.index.vector.queryNodes('passage_embedding', $k, $vec)
                    YIELD node AS p, score
                    WHERE p.case_id = $case_id
                    RETURN p.id      AS passage_id,
                           p.case_id AS case_id,
                           p.para_no AS para_no,
                           p.text    AS text,
                           score
                    ORDER BY score DESC
                    """,
                    k=k * 6,
                    vec=vec,
                    case_id=node_id,
                )
                passages = [_row_to_passage(rec) for rec in result if rec.get("text")]
                if passages:
                    logger.info(
                        "Vector search: %d relevant chunks for '%s' (top score=%.3f)",
                        len(passages), node_id, passages[0].para_no,
                    )
                    return passages[:k]
                # case_id might not match — fall back to all chunks
                logger.info("Vector search returned 0 for '%s' — falling back to find_passages", node_id)
                return self.find_passages(node_id)
        except neo4j_exc.ServiceUnavailable:
            return self.find_passages(node_id)
        except Exception as exc:
            logger.warning("Vector search failed for '%s': %s", node_id, exc)
            return self.find_passages(node_id)

    # ── list_all (kept for any remaining callers; prefer find_suggestions) ────

    def list_all(self) -> list[dict]:
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
                    {"citation": rec["citation"], "short_name": rec["short_name"],
                     "proposition": rec["proposition"]}
                    for rec in result
                ]
        except neo4j_exc.ServiceUnavailable:
            return []
        except Exception as exc:
            logger.warning("list_all failed: %s", exc)
            return []

    # ── Private helpers ───────────────────────────────────────────────────────

    def _fulltext_lookup(self, session, fragment: str) -> str | None:
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
            return None

    def _fallback_lookup(self, session, fragment: str) -> str | None:
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
        case_rec = session.run(
            "MATCH (c:Case {nodeId: $id}) "
            "RETURN c.citation AS citation, c.shortName AS shortName, "
            "       c.domain AS domain, c.status AS status, "
            "       c.court AS court, c.bailiiUrl AS bailiiUrl",
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
            bailii_url=case_rec.get("bailiiUrl"),
        )


# ── Module-level helpers ──────────────────────────────────────────────────────

def _row_to_passage(rec) -> Passage:
    return Passage(
        passage_id=rec.get("passage_id") or "",
        case_id=rec.get("case_id") or "",
        para_no=int(rec.get("para_no") or 0),
        text=rec.get("text") or "",
    )


def _merge_suggestions(
    primary: list[SuggestionResult],
    secondary: list[SuggestionResult],
    limit: int,
) -> list[SuggestionResult]:
    """
    Merge vector results (primary) with keyword/proposition results (secondary).

    Cross-signal boost: cases confirmed by BOTH vector AND keyword get a 1.5×
    score multiplier.  This pushes cases like Kuwait Airways (high vector score
    but no proposition match) below Murphy/Caparo (confirmed by both signals).
    """
    def _key(s: SuggestionResult) -> str:
        return s.node_id or s.short_name.lower()

    primary_keys   = {_key(s): s for s in primary   if _key(s)}
    secondary_keys = {_key(s): s for s in secondary if _key(s)}

    merged: dict[str, SuggestionResult] = {}

    for k, s in primary_keys.items():
        if k in secondary_keys:
            # Confirmed by both signals → 1.5× boost + use clean proposition text
            sec = secondary_keys[k]
            prop = sec.proposition if sec.proposition else s.proposition
            merged[k] = SuggestionResult(
                node_id=s.node_id, citation=s.citation, short_name=s.short_name,
                proposition=prop, domain=s.domain or sec.domain,
                bailii_url=s.bailii_url or sec.bailii_url,
                score=s.score * 1.5,
            )
        else:
            # Vector only — penalise: likely a passage coincidence, not a holding match
            merged[k] = SuggestionResult(
                node_id=s.node_id, citation=s.citation, short_name=s.short_name,
                proposition=s.proposition, domain=s.domain,
                bailii_url=s.bailii_url,
                score=s.score * 0.6,
            )

    for k, s in secondary_keys.items():
        if k not in merged:
            merged[k] = s

    return sorted(merged.values(), key=lambda x: x.score, reverse=True)[:limit]


def _build_fulltext_query(text: str) -> str:
    """
    Build a Lucene query string from free text.
    Strips Lucene special chars and joins significant words with OR.
    """
    _STOP = {
        "the", "a", "an", "is", "are", "was", "were", "of", "in", "to",
        "for", "and", "or", "that", "this", "it", "by", "on", "at", "be",
        "has", "have", "had", "with", "not", "from", "as", "its", "which",
    }
    words = re.findall(r"[a-zA-Z]{4,}", text)
    significant = [w for w in words if w.lower() not in _STOP][:20]
    return " ".join(significant) if significant else ""


def _sanitize_lucene(fragment: str) -> str:
    special = set(r'\+-&&||!(){}[]^"~*?:/')
    return "".join(f"\\{c}" if c in special else c for c in fragment)


def _parties_overlap(query: str, node: CaseNode) -> bool:
    _STOPWORDS = {
        "district", "council", "borough", "urban", "industries", "limited",
        "company", "services", "holdings", "international", "national",
        "royal", "london", "england",
    }
    query_lower = re.sub(r"[\[\]()\d]+", " ", query.lower())
    node_lower  = (node.citation + " " + node.short_name).lower()
    for token in re.findall(r"[a-z]{5,}", query_lower):
        if token in _STOPWORDS:
            continue
        if token in node_lower:
            return True
    return False
