"""
test_agents.py - run the 12 skeleton citations through the 3-agent pipeline.

    python test_agents.py

Targets whatever the environment points at (the repo .env points at Aura).
For each citation it prints the pipeline verdict (Agent 1 existence -> Agent 2
context or Agent 3 fallback), the Agent-2 context score, the evidence passage,
and - for not-found citations - the real case Agent 3 suggests.

Honesty note: fabrication_signal is left OFF here (no LLM extractor wired), so a
case that isn't in the corpus is reported UNVERIFIABLE, never FABRICATED - the
deliberate NOT_FOUND != fabricated behaviour. The `expected_*` columns are our
own analysis, shown only for comparison; they do NOT feed the verdict.
"""

from __future__ import annotations

import json
import logging
import pathlib

from eurlex_neo4j.verify import Citation
from retrieval.agents import run_document

# Aura's :Case nodes (the teammate's schema) lack some optional props we SELECT;
# that only triggers harmless "property does not exist" notifications. Mute them.
logging.getLogger("neo4j").setLevel(logging.ERROR)


def main() -> None:
    data = json.loads(pathlib.Path("data/citations.json").read_text(encoding="utf-8"))
    raw = data["citations"]

    cits = [
        Citation(
            raw_text=f"{c['name']} {c['citation']}",
            name=c["name"],
            citation=c["citation"],
            context=c.get("proposition", ""),
            fabrication_signal=False,            # no LLM extractor -> stay honest
        )
        for c in raw
    ]

    print(f"Running {len(cits)} citations through the 3 agents...\n")
    results = run_document(cits, corpus_is_broad=True)

    print(f"{'#':>2}  {'STATUS':12} {'EXISTENCE':12} {'ctx':>5}  {'AGENTS':22}  CITATION")
    print("-" * 104)
    for i, (c, r) in enumerate(zip(raw, results), 1):
        sc = f"{r['context_score']:.2f}" if r.get("context_score") is not None else "   -"
        agents = ">".join(a.split(":")[0][-1] for a in r["agent_trace"])  # e.g. 1>2 or 1>3
        agents = {"1": "A1", "1>2": "A1>A2", "1>3": "A1>A3"}.get(agents, agents)
        print(f"{i:>2}  {r['status']:12} {r['existence']:12} {sc:>5}  {agents:22}  {c['name'][:42]}")
        if r.get("context_reason"):
            print(f"        > A2: {r['context_reason'][:96]}")
        if r.get("supporting_passage"):
            print(f"        > evidencia: {r['supporting_passage']['text'][:96].strip()}...")
        if r.get("suggested_case"):
            sug = r["suggested_case"]
            print(f"        > A3 sugiere: {sug['case_id']}  (score {sug['score']})")
        if r.get("fabrication_risk"):
            print(f"        > riesgo de fabricacion: {r['fabrication_risk']}")
        exp = f"{c.get('expected_existence','?')}/{c.get('expected_verdict','?')}"
        print(f"        > (esperado: {exp})")
    print("-" * 104)

    n_ver = sum(1 for r in results if r["status"] == "VERIFIED")
    n_mis = sum(1 for r in results if r["status"] == "MISAPPLIED")
    n_unv = sum(1 for r in results if r["status"] == "UNVERIFIABLE")
    n_fab = sum(1 for r in results if r["status"] == "FABRICATED")
    print(f"Resumen: {n_ver} verified  {n_mis} misapplied  {n_unv} unverifiable  {n_fab} fabricated")
    print("Agentes: A1=existencia · A2=contexto (coseno) · A3=fallback corpus-wide")


if __name__ == "__main__":
    main()
