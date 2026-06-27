"""
Add Murphy v Brentwood and Dutton v Bognor to Neo4j Aura.
Run from hack-the-law-ultimate/backend/:
  python -m scripts.add_missing_cases
"""
import os
import sys

from dotenv import load_dotenv
load_dotenv()

import neo4j

NEO4J_URI  = os.environ["NEO4J_URI"]
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASS = os.environ["NEO4J_PASSWORD"]

CASES = [
    {
        "nodeId":    "murphy-v-brentwood-dc",
        "citation":  "Murphy v Brentwood District Council [1991] 1 AC 398",
        "shortName": "Murphy v Brentwood DC",
        "court":     "UKHL",
        "domain":    "tort",
        "status":    "GOOD_LAW",
        "verified":  True,
        "propositions": [
            "Local authority not liable in negligence for pure economic loss caused by defective foundations — Anns two-stage test overruled",
            "No duty of care in negligence for pure economic loss to property not owned by the claimant at the time of damage",
        ],
    },
    {
        "nodeId":    "dutton-v-bognor-regis-udc",
        "citation":  "Dutton v Bognor Regis Urban District Council [1972] 1 QB 373",
        "shortName": "Dutton v Bognor Regis UDC",
        "court":     "EWCA",
        "domain":    "tort",
        "status":    "OVERRULED",
        "verified":  True,
        "propositions": [
            "Local authority may be liable for negligent failure to inspect building foundations",
            "Extended Donoghue neighbour principle to public authorities — later superseded by Murphy v Brentwood",
        ],
    },
]

def main():
    driver = neo4j.GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
    with driver.session() as session:
        for c in CASES:
            session.run(
                """
                MERGE (c:Case {nodeId: $nodeId})
                SET c.citation  = $citation,
                    c.shortName = $shortName,
                    c.court     = $court,
                    c.domain    = $domain,
                    c.status    = $status,
                    c.verified  = $verified
                """,
                **{k: v for k, v in c.items() if k != "propositions"},
            )
            for i, prop_text in enumerate(c["propositions"]):
                prop_id = f"{c['nodeId']}-prop-{i}"
                session.run(
                    """
                    MATCH (c:Case {nodeId: $nodeId})
                    MERGE (p:Proposition {propId: $propId})
                    SET p.text = $text
                    MERGE (c)-[:ESTABLISHES]->(p)
                    """,
                    nodeId=c["nodeId"],
                    propId=prop_id,
                    text=prop_text,
                )
            print(f"✓ {c['shortName']} ({c['nodeId']})")
    driver.close()
    print("Done.")

if __name__ == "__main__":
    main()
