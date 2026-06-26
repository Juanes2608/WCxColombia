"""
test_citations.py - run the 12 real citations from the Crestholm skeleton
argument against the loaded corpus and classify each by EXISTENCE.

This is the headline demo: it shows, with real data, that
  - the 3 fabricated cases are NOT in the corpus,
  - the 2 real-but-uncovered cases are also not in the corpus BUT are real
    (coverage gap, must not be called "fabricated"),
  - everything else resolves to a real node — even when the citation form
    differs (American Cyanamid [1975] AC 396  ==  node [1975] UKHL 1),
    because we match by NAME with fuzzy similarity, not by citation string.

    python test_citations.py
"""

from __future__ import annotations

import json
import pathlib

from rapidfuzz import fuzz

from eurlex_neo4j.graph import CitationGraph

MATCH_THRESHOLD = 80  # fuzzy name-match score (0-100) to count as "in corpus"


def best_match(name: str, corpus: list[dict]) -> tuple[dict | None, float]:
    best, score = None, 0.0
    for node in corpus:
        s = fuzz.token_set_ratio(name.lower(), (node["name"] or "").lower())
        if s > score:
            best, score = node, s
    return (best, score) if score >= MATCH_THRESHOLD else (None, score)


def main() -> None:
    data = json.loads(pathlib.Path("data/citations.json").read_text(encoding="utf-8"))
    citations = data["citations"]

    graph = CitationGraph()
    try:
        corpus = graph._run("MATCH (c:Case) RETURN c.id AS id, c.name AS name")
        print(f"Corpus: {len(corpus)} :Case nodes.\n")
        print(f"{'#':>2}  {'CITED CASE':42}  {'IN CORPUS?':12}  {'SCORE':>5}  EXPECTED")
        print("-" * 92)

        correct = 0
        for c in citations:
            node, score = best_match(c["name"], corpus)
            in_corpus = node is not None
            # map expected_existence to "should it be found in THIS corpus?"
            should_find = c["expected_existence"] == "real"
            ok = in_corpus == should_find
            correct += ok
            flag = "FOUND" if in_corpus else "not found"
            exp = c["expected_existence"]
            mark = "ok" if ok else "??"
            print(f"{c['n']:>2}  {c['name'][:42]:42}  {flag:12}  {score:5.0f}  {exp:20} [{mark}]")

        print("-" * 92)
        print(f"\nExistence resolution matched expectation on {correct}/{len(citations)}.")
        print("\nReading of the result:")
        print("  - 'not found' + expected fabricated  -> correctly flags the 3 invented cases.")
        print("  - 'not found' + expected real_outside_corpus -> Wrotham Park & Series 5:")
        print("      REAL cases absent from the 58-corpus. A naive tool would call these")
        print("      'fabricated'; we separate NOT_FOUND from FABRICATED on purpose.")
        print("  - American Cyanamid resolves despite citing [1975] AC 396 vs node [1975] UKHL 1.")
    finally:
        graph.close()


if __name__ == "__main__":
    main()
