// CitationGuard — Backend Queries
// These are the Cypher queries executed by the Python adapters.
// Parameters are shown as $parameter — provided by neo4j-driver at runtime.
//
// DUAL-SCHEMA NOTE:
//   ~57 cases (PDF-ingest layer): Case.id, Case.name, Case.source → :Passage nodes
//   ~40 cases (propositions layer): Case.nodeId, Case.citation, Case.shortName → :Proposition edges
//   The two layers overlap but do not fully join on a single property.
//   Q1-Q4 target the propositions layer; Q7-Q8 target the PDF-ingest layer.


// ── Q1: Fuzzy corpus lookup ───────────────────────────────────────────────────
// Used by: Neo4jCorpusAdapter.lookup()
// Full-text index "caseSearchIndex" covers Case.citation + Case.shortName.

CALL db.index.fulltext.queryNodes("caseSearchIndex", $fragment)
YIELD node AS c, score
WHERE c.verified = true AND score > 3.0
RETURN c.nodeId   AS nodeId,
       c.citation  AS citation,
       c.shortName AS shortName,
       c.domain    AS domain,
       c.status    AS status,
       score
ORDER BY score DESC LIMIT 1;


// ── Q2: Propositions for a case ───────────────────────────────────────────────
// Used by: Neo4jCorpusAdapter._build_node()

MATCH (c:Case {nodeId: $nodeId})-[:ESTABLISHES]->(p:Proposition)
RETURN collect(p.text) AS propositions;


// ── Q3: MISAPPLIED table ─────────────────────────────────────────────────────
// Used by: Neo4jCorpusAdapter.get_misapplied_table()

MATCH (c:Case)-[m:MISAPPLIED_AS]->()
RETURN c.nodeId AS nodeId, m.incorrectProposition AS text;


// ── Q4: Treatment history ────────────────────────────────────────────────────
// Used by: Neo4jTreatmentAdapter.get_history()
// Note: only 3 treatment edges exist on Aura right now (very sparse).

MATCH (c:Case {nodeId: $nodeId})
OPTIONAL MATCH (c)<-[ov:OVERRULES]-(newer:Case)
OPTIONAL MATCH (c)<-[di:DISTINGUISHES]-(dist:Case)
RETURN c.status AS status,
       collect(DISTINCT {
           citing_case: newer.citation,
           year:        ov.year,
           court:       ov.court,
           context:     ov.context
       }) AS overruledBy,
       collect(DISTINCT {
           citing_case: dist.citation,
           year:        di.year,
           court:       di.court,
           context:     di.context
       }) AS distinguishedBy;


// ── Q5: Citation graph for frontend visualisation ─────────────────────────────
// Used by: api/routers/graph.py via CSV fallback (also works against Neo4j)

MATCH path = (c:Case {nodeId: $nodeId})-
  [:CITES|OVERRULES|DISTINGUISHES*1..3]->(related:Case)
RETURN path LIMIT 25;


// ── Q6: Health / stats ────────────────────────────────────────────────────────
// Used by: health.py ping()

MATCH (c:Case) RETURN count(c) AS total_cases;


// ── Q7: Judgment passages for a case (HoldingJudge input) ────────────────────
// Used by: Neo4jCorpusAdapter.find_passages()
// Tries Case.id (PDF-ingest layer) OR Case.nodeId (propositions layer).
// Returns chunks ordered by para_no (0-based chunk index, NOT official [47]).
//
// Live Passage shape:
//   id:       "<case_id>#p<N>"
//   case_id:  "<case_id>"          ← FK to Case.id
//   para_no:  <int>                ← 0-based chunk index
//   text:     "<~900 chars>"       ← OCR-extracted, may be noisy
//   embedding:[384 floats]         ← BAAI/bge-small-en-v1.5 (VECTOR index)

MATCH (c:Case)-[:HAS_PASSAGE]->(p:Passage)
WHERE c.id = $nodeId OR c.nodeId = $nodeId
RETURN p.id      AS passage_id,
       p.case_id AS case_id,
       p.para_no AS para_no,
       p.text    AS text
ORDER BY p.para_no;


// ── Q8: Suggestion search via passageText FULLTEXT ───────────────────────────
// Used by: Neo4jCorpusAdapter.find_suggestions()
// Searches Passage.text for cases supporting a given proposition + brief context.
// One SuggestionResult per unique Case; best-scoring passage text = proposition.
// coalesce() handles the dual-schema (some cases have citation, some have name).

CALL db.index.fulltext.queryNodes("passageText", $query)
YIELD node AS p, score
MATCH (c:Case)-[:HAS_PASSAGE]->(p)
WHERE ($domain IS NULL OR c.domain = $domain)
  AND (c.status IS NULL OR c.status <> 'OVERRULED')
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
LIMIT $limit;


// ── Q9 (optional): Semantic search within a case's passages ──────────────────
// Used when: vector_search(node_id, claim_vec, k) is called
// Requires embedding the claim with BAAI/bge-small-en-v1.5 (384-dim, cosine).
// Scoped to a single case — finds the chunks most semantically similar to the claim.
// Note: embed ONCE per claim and reuse; do not call the embedder per passage.

CALL db.index.vector.queryNodes('passage_embedding', $k, $vec)
YIELD node AS p, score
WHERE p.case_id = $caseId
RETURN p.para_no AS para_no,
       p.text    AS text,
       score
ORDER BY score DESC;
