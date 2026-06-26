"""
build_passages.py - orchestrate the retrieval layer end to end.

    ingest_dir (pypdf + OCR)  ->  chunk  ->  embed  ->  store in Neo4j

Run after the existence loader (load_casedb) so the :Case nodes already exist;
this MERGEs onto them and adds the :Passage layer + vector index.

    python -m retrieval.build_passages --dir data/caselaw
    python -m retrieval.build_passages --dir data/caselaw --fresh   # wipe passages first
"""

from __future__ import annotations

import argparse

from retrieval.chunk import chunk_text
from retrieval.embed import get_embedder
from retrieval.ingest_text import ingest_dir
from retrieval.passage_store import PassageStore


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the passage/embedding layer.")
    ap.add_argument("--dir", default="data/caselaw", help="folder of case PDFs")
    ap.add_argument("--fresh", action="store_true", help="wipe existing passages first")
    ap.add_argument("--provider", default=None, help="embed provider: local|nemo")
    args = ap.parse_args()

    embedder = get_embedder(args.provider)
    store = PassageStore()
    try:
        store.ensure_schema(embedder.dim)
        if args.fresh:
            store.wipe_passages()

        # Resume: skip cases already loaded so a re-run continues after a crash.
        done = set() if args.fresh else store.loaded_case_ids()
        if done:
            print(f"Resuming: {len(done)} cases already have passages, skipping them.\n")

        total_passages = ocr_count = skipped = failed = 0
        for rec in ingest_dir(args.dir):
            if rec["id"] in done:
                skipped += 1
                continue
            passages = chunk_text(rec["text"])
            if not passages:
                print(f"  !  {rec['name'][:46]:46}  no text (skipped)")
                continue
            # Per-case resilience: a network blip on one case won't kill the run.
            try:
                vectors = embedder.embed(passages)
                n = _upsert_with_retry(store, rec["id"], passages, vectors)
            except Exception as e:
                failed += 1
                print(f"  X  {rec['name'][:42]:42}  FAILED ({type(e).__name__}) - re-run to retry")
                continue
            done.add(rec["id"])
            total_passages += n
            if rec["method"] == "ocr":
                ocr_count += 1
            tag = "OCR" if rec["method"] == "ocr" else "   "
            print(f"  {tag} {rec['name'][:42]:42}  {n:>3} passages  [{rec['id']}]")

        c = store.counts()
        print(f"\nDone. +{total_passages} passages this run "
              f"({ocr_count} OCR, {skipped} skipped, {failed} failed). "
              f"Graph holds {c['passages']} :Passage across {c['cases_with_passages']} cases.")
        if failed:
            print(f"{failed} case(s) failed (likely network) - just run this again to fill them in.")
        print(f"Embedder: {embedder.name} (dim {embedder.dim})")
    finally:
        store.close()


def _upsert_with_retry(store, case_id, passages, vectors, attempts: int = 4):
    """Retry the write a few times to survive transient Aura/network drops."""
    import time

    for i in range(attempts):
        try:
            return store.upsert_passages(case_id, passages, vectors)
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(2 * (i + 1))  # 2s, 4s, 6s back-off


if __name__ == "__main__":
    main()
