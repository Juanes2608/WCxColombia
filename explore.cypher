// explore.cypher — paste these into Neo4j Aura -> Query, one at a time.
// They double as the live-demo script for the White & Case citation checker.

// ─────────────────────────────────────────────────────────────────────────
// 1. How big is the graph?  (sanity check after build_graph + load_casedb)
MATCH (c:Case)
RETURN c.source AS source, count(*) AS cases
ORDER BY cases DESC;

// ─────────────────────────────────────────────────────────────────────────
// 2. Draw the network — the picture that makes graphs click.
//    (EU slice from Cellar; UK Case DB nodes have no edges yet.)
MATCH p = (:Case)-[:CITES]->(:Case)
RETURN p
LIMIT 200;

// ─────────────────────────────────────────────────────────────────────────
// 3. Landmark cases — most-cited = foundational authority (rank by in-degree).
MATCH (c:Case)<-[:CITES]-()
RETURN c.id AS id, c.name AS name, count(*) AS times_cited
ORDER BY times_cited DESC
LIMIT 10;

// ─────────────────────────────────────────────────────────────────────────
// 4. EXISTENCE CHECK — the headline demo: "does this cited case exist?"
//    (a) a REAL case from the Case Database -> returns the node:
MATCH (c:Case)
WHERE toLower(c.name) CONTAINS toLower('Caparo')
RETURN c.id, c.name, c.citation, c.jurisdiction, c.source;

//    (b) a FABRICATED citation an AI might invent -> returns ZERO rows:
MATCH (c:Case)
WHERE toLower(c.name) CONTAINS toLower('Crestholm Dynamics v Veltros')
   OR c.citation = '[2021] EWHC 9999 (Comm)'
RETURN c.id, c.name, c.citation;

// ─────────────────────────────────────────────────────────────────────────
// 5. STILL GOOD LAW? — any later case that OVERRULES the one cited.
//    A non-empty result = "you relied on overruled authority" (🟠).
MATCH (later:Case)-[:OVERRULES]->(c:Case)
WHERE toLower(c.name) CONTAINS toLower('Anns v Merton')
RETURN c.name AS cited, later.name AS overruled_by, later.citation AS by_citation;

// ─────────────────────────────────────────────────────────────────────────
// 6. Shortest citation path between two judgments — the explainable trail.
MATCH (a:Case), (b:Case)
WHERE a.id = $fromId AND b.id = $toId
MATCH p = shortestPath((a)-[:CITES*..6]-(b))
RETURN p;
