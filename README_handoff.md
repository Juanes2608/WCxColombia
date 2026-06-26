# Retrieval layer — handoff

Passage-level search over the case-law corpus for the White & Case citation
checker. Given a cited case and the proposition it's used for, it returns the
**exact paragraph(s)** that support or contradict that use — the "go to the
source" capability the use case requires. Runs **100% locally** (OCR +
embeddings on-machine), so no document leaves the firm.

## What this layer owns

```
(:Case {id})-[:HAS_PASSAGE]->(:Passage {id, case_id, para_no, text, embedding})
                                   + native Neo4j vector index
```

- The existence / good-law half owns `(:Case)`, keyed by `id`.
- This half adds `(:Passage)` + a vector index, keyed by the **same `id`**.
- **The case `id` is the contract** between the two halves (citation like
  `[1975] UKHL 1`, or a slug like `caparo-industries-plc-v-dickman`).

## Run it locally (one-time)

Prereqs already on this machine: Python venv, Tesseract OCR, Neo4j Desktop 2.

```bash
# 1. start a local Neo4j (Neo4j Desktop 2 -> create instance -> set password)
#    put bolt URI + password into .env (copy from .env.example)

# 2. load the cases (existence layer) and the passages (this layer)
python -m eurlex_neo4j.load_casedb --dir data/caselaw
python -m retrieval.build_passages --dir data/caselaw   # OCRs the 16 scans

# 3. verify
python test_retrieval.py     # prints PASS/FAIL on real doctrine lookups
```

## Use it from code

```python
from retrieval.retrieve import Retriever

with Retriever() as r:
    hits = r.retrieve_passages("[1975] UKHL 1",
                               "balance of convenience for an interim injunction",
                               k=5)
    for h in hits:
        print(h["score"], h["text"])     # the exact paragraph, as evidence
```

`case_id=None` searches the whole corpus instead of one case.

## Config (.env)

```
NEO4J_URI=bolt://localhost:7687      # local Neo4j Desktop
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
NEO4J_DATABASE=neo4j
EMBED_PROVIDER=local                 # local (fastembed, offline) | nemo (NVIDIA)
```

## Privacy / production note

- **Local (default):** OCR via Tesseract + embeddings via fastembed — fully
  offline, privilege-safe.
- **Production / "wow":** swap `EMBED_PROVIDER=nemo` to use NVIDIA NeMo
  Retriever (`llama-3.2-nv-embedqa`). Nemotron/NeMo are open-weight and
  on-prem deployable, so the same "document never leaves the firm" guarantee
  holds at scale (`retrieval/embed.py` → `NeMoEmbedder`, currently stubbed).

## Files

| file | role |
|---|---|
| `retrieval/ingest_text.py` | full text per case; OCR fallback for scans |
| `retrieval/chunk.py` | split judgments into passages |
| `retrieval/embed.py` | embeddings (local fastembed / NeMo adapter) |
| `retrieval/passage_store.py` | `:Passage` nodes + Neo4j vector index |
| `retrieval/retrieve.py` | `Retriever.retrieve_passages(case_id, claim, k)` |
| `retrieval/build_passages.py` | orchestrator: ingest → chunk → embed → store |
| `test_retrieval.py` | end-to-end PASS/FAIL |
