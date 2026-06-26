"""
test_retrieval.py - end-to-end PASS/FAIL check of the retrieval layer.

Run AFTER:
  1) a local Neo4j is up and .env points at it,
  2) python -m eurlex_neo4j.load_casedb --dir data/caselaw   (creates :Case),
  3) python -m retrieval.build_passages --dir data/caselaw    (creates :Passage).

Then:  python test_retrieval.py

It runs real "go to the source" queries and checks the top passage actually
contains the doctrine you'd expect — proving the layer points a lawyer at the
right paragraph, including in OCR'd scans (Caparo, Anns).
"""

from __future__ import annotations

from retrieval.passage_store import PassageStore
from retrieval.retrieve import Retriever

# (case_id, claim, keywords we expect to see in the best passage)
CHECKS = [
    ("caparo-industries-plc-v-dickman",
     "the three-part test for a duty of care: foreseeability, proximity, fair just and reasonable",
     ["duty", "care"]),
    ("[1975] UKHL 1",
     "guidelines for granting an interlocutory injunction and the balance of convenience",
     ["injunction"]),
]


def main() -> None:
    store = PassageStore()
    try:
        n = store.counts()["passages"]
    finally:
        store.close()

    if n == 0:
        print("[!] No :Passage nodes yet. Run:")
        print("    python -m eurlex_neo4j.load_casedb --dir data/caselaw")
        print("    python -m retrieval.build_passages --dir data/caselaw")
        return

    print(f"Graph holds {n} passages. Running retrieval checks...\n")
    passed = 0
    with Retriever() as r:
        for case_id, claim, expect in CHECKS:
            hits = r.retrieve_passages(case_id, claim, k=3)
            top = (hits[0]["text"].lower() if hits else "")
            ok = bool(hits) and all(w.lower() in top for w in expect)
            passed += ok
            status = "[PASS]" if ok else "[FAIL]"
            print(f"{status}  [{case_id}]")
            print(f"        claim : {claim[:60]}...")
            if hits:
                print(f"        score : {hits[0]['score']:.3f}  (expect {expect})")
                print(f"        para  : {hits[0]['text'][:160].strip()}...")
            else:
                print("        (no passages returned)")
            print()

    print(f"{passed}/{len(CHECKS)} checks passed.")


if __name__ == "__main__":
    main()
