"""
ITreatmentRepository implementation backed by Neo4j Aura.
Returns UNAVAILABLE when Neo4j is unreachable — never blocks the pipeline.
"""
from __future__ import annotations

from neo4j import exceptions as neo4j_exc

from app.adapters.neo4j.driver import get_driver
from app.ports.treatment import ITreatmentRepository, TreatmentHistory


class Neo4jTreatmentAdapter(ITreatmentRepository):

    def get_history(self, node_id: str) -> TreatmentHistory:
        driver = get_driver()
        if driver is None:
            return TreatmentHistory(verdict="UNAVAILABLE", source="neo4j_not_configured")

        try:
            with driver.session() as session:
                result = session.run(
                    """
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
                           }) AS distinguishedBy
                    """,
                    nodeId=node_id,
                )
                rec = result.single()
                if rec is None:
                    return TreatmentHistory(verdict="UNAVAILABLE", source="not_in_graph")

                overruled_by = [e for e in rec["overruledBy"] if e.get("citing_case")]
                distinguished_by = [e for e in rec["distinguishedBy"] if e.get("citing_case")]

                if overruled_by or rec["status"] == "OVERRULED":
                    verdict = "OVERRULED"
                elif distinguished_by:
                    verdict = "DISTINGUISHED"
                else:
                    verdict = "GOOD_LAW"

                return TreatmentHistory(
                    verdict=verdict,
                    overruled_by=[dict(e) for e in overruled_by],
                    distinguished_by=[dict(e) for e in distinguished_by],
                    source="neo4j",
                )

        except neo4j_exc.ServiceUnavailable:
            return TreatmentHistory(verdict="UNAVAILABLE", source="neo4j_unavailable")
