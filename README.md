# Citation Checker — Database & Retrieval Layer

Backend for verifying the case-law citations inside a legal document. Given a
brief, memo or judgment, the system extracts each cited case and classifies it:

1. **Fabricated** — the case does not exist in any authoritative source.
2. **Misapplied** — the case exists, but the cited paragraph does not say what
   the citation claims (or is used outside its real scope).
3. **Verified** — the case exists and the cited proposition is supported.

This repository holds the **graph + retrieval layer**, built on **Neo4j**:

```
(:Case {id, name, citation, jurisdiction})        <- existence / good-law layer
   │ [:HAS_PASSAGE]
   ▼
(:Passage {id, case_id, para_no, text, embedding}) <- passage / retrieval layer
        + native Neo4j vector index over Passage.embedding
```

- The **existence layer** answers *"does this citation exist, and is it still
  good law?"* with a single graph lookup — a fabricated case is simply a node
  that isn't there.
- The **retrieval layer** answers the harder question: *"go to the source and
  check the cited paragraph actually says what the citation claims, with the
  intended scope."* It returns the **exact paragraph** as grounded evidence.

The case `id` (e.g. `[1975] UKHL 1`, or a slug like
`caparo-industries-plc-v-dickman`) is the contract that joins both layers.

---

## What's here

| file | role |
|---|---|
| `build_graph.py` | EU citation graph: EUR-Lex / Cellar SPARQL → Neo4j |
| `eurlex_neo4j/cellar.py` | SPARQL client for the Cellar endpoint |
| `eurlex_neo4j/graph.py` | Neo4j loader + read queries for `:Case` |
| `eurlex_neo4j/load_casedb.py` | loads the case-law PDFs as `:Case` nodes |
| `eurlex_neo4j/verify.py` | citation classification logic (existence + treatment) |
| `retrieval/ingest_text.py` | full text per case; OCR fallback for scans |
| `retrieval/chunk.py` | split judgments into passages |
| `retrieval/embed.py` | embeddings (local fastembed / NVIDIA NeMo adapter) |
| `retrieval/passage_store.py` | `:Passage` nodes + Neo4j vector index |
| `retrieval/retrieve.py` | `Retriever.retrieve_passages(case_id, claim, k)` |
| `retrieval/build_passages.py` | orchestrator: ingest → chunk → embed → store |
| `demo_queries.cypher` | live Cypher demo (full-text over passages) |
| `test_citations.py` | classify the citations of an input document by existence |
| `test_retrieval.py` | end-to-end PASS/FAIL on real doctrine lookups |
| `README_handoff.md` | how the retrieval layer is handed off and consumed |

---

## Setup

Python 3.9+ and a Neo4j instance (local Neo4j Desktop, or Aura in the cloud).

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on *nix)
pip install -r requirements.txt

copy .env.example .env            # then fill in your Neo4j credentials
```

OCR uses a local Tesseract install (Windows: `C:\Program Files\Tesseract-OCR`).

## Run

```bash
# 1. existence layer — load the case PDFs as :Case nodes
python -m eurlex_neo4j.load_casedb --dir data/caselaw

# 2. retrieval layer — full text (+ OCR) → passages → embeddings → vector index
python -m retrieval.build_passages --dir data/caselaw

# 3. (optional) EU citation graph from Cellar
python build_graph.py --limit 200

# 4. verify
python test_citations.py     # existence of the document's citations
python test_retrieval.py     # passage-level "go to source" lookups
```

See [`demo_queries.cypher`](demo_queries.cypher) for ready-to-run queries.

## Privacy

The default pipeline is **fully local**: OCR via Tesseract and embeddings via
`fastembed` (ONNX, offline) — no document ever leaves the machine. For scale,
`EMBED_PROVIDER=nemo` swaps in NVIDIA NeMo Retriever (open-weight, on-prem
deployable), keeping the same privacy guarantee.

> `data/`, `.env` and archives are intentionally gitignored — load the corpus
> locally and keep credentials out of version control.
