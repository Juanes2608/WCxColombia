"""
Build the local passage store from the Case Law Database PDFs.

Reads every PDF in data/cases/Cambridge Hackathon - Case Law Database/,
chunks each into ~900-char segments with 100-char overlap,
embeds with BAAI/bge-small-en-v1.5 (same model as Neo4j),
and writes to data/passage_store.db (SQLite).

Run once:
    cd backend/
    .venv/bin/python scripts/build_passage_store.py

The resulting passage_store.db covers ALL PDFs in the zip, including
the 42 cases that Neo4j has without full judgment text.
"""
from __future__ import annotations

import re
import sqlite3
import struct
import sys
from pathlib import Path

ROOT   = Path(__file__).resolve().parents[1]   # backend/
PDF_DIR = ROOT / "data" / "cases" / "Cambridge Hackathon - Case Law Database"
DB_PATH = ROOT / "data" / "passage_store.db"

CHUNK_SIZE    = 900    # chars — matches Neo4j ETL
CHUNK_OVERLAP = 100
MAX_CHUNKS    = 600    # cap per file (huge PDFs like Broome v Cassell = 30 MB)


def _slug(name: str) -> str:
    name = re.sub(r"\.pdf$", "", name, flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _extract_text(pdf_path: Path) -> str:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(str(pdf_path))
        text = "\n".join(page.get_text() for page in doc)
        if len(text.strip()) > 200:
            return text
        # Scanned PDF — fall through to OCR
        print(f"  [OCR] {pdf_path.name} ...", end=" ", flush=True)
        return _ocr_pdf(pdf_path)
    except Exception as exc:
        print(f"  [WARN] could not read {pdf_path.name}: {exc}", file=sys.stderr)
        return ""


def _ocr_pdf(pdf_path: Path) -> str:
    """OCR via tesseract called directly — avoids pytesseract's TMPDIR issues."""
    import io
    import subprocess
    import fitz
    from PIL import Image

    tmp_dir = ROOT / "data" / ".ocr_tmp"
    tmp_dir.mkdir(exist_ok=True)

    parts = []
    try:
        doc = fitz.open(str(pdf_path))
        mat = fitz.Matrix(2.0, 2.0)  # 2× zoom ≈ 144 DPI
        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=mat)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            tmp_img = tmp_dir / f"page_{i}.png"
            img.save(str(tmp_img))
            try:
                result = subprocess.run(
                    ["tesseract", str(tmp_img), "stdout", "-l", "eng"],
                    capture_output=True, timeout=60,
                )
                parts.append(result.stdout.decode("utf-8", errors="replace"))
            finally:
                tmp_img.unlink(missing_ok=True)
    except Exception as exc:
        print(f"[OCR FAILED: {exc}]", file=sys.stderr)
    return "\n".join(parts)


def _chunk(text: str) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        # Extend to the next word boundary so we never cut mid-word
        if end < len(text):
            while end < len(text) and text[end] not in (" ", "\n", "\t"):
                end += 1
        chunk = text[start:end].strip()
        if len(chunk) > 50:
            chunks.append(chunk)
        if len(chunks) >= MAX_CHUNKS:
            break
        start = end - CHUNK_OVERLAP
    return chunks


def _embed_batch(texts: list[str]) -> list[list[float]]:
    from fastembed import TextEmbedding
    model = TextEmbedding("BAAI/bge-small-en-v1.5")
    return [v.tolist() for v in model.embed(texts)]


def _pack(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)


def build() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(DB_PATH)
    con.execute("""
        CREATE TABLE IF NOT EXISTS passages (
            id       INTEGER PRIMARY KEY,
            case_id  TEXT    NOT NULL,
            filename TEXT    NOT NULL,
            para_no  INTEGER NOT NULL,
            text     TEXT    NOT NULL,
            embedding BLOB   NOT NULL
        )
    """)
    con.execute("CREATE INDEX IF NOT EXISTS idx_case_id ON passages(case_id)")
    con.commit()

    already = {row[0] for row in con.execute("SELECT DISTINCT case_id FROM passages")}

    pdfs = sorted(f for f in PDF_DIR.iterdir()
                  if f.suffix.lower() == ".pdf")
    print(f"Found {len(pdfs)} PDFs — skipping {len(already)} already ingested")

    for pdf in pdfs:
        case_id = _slug(pdf.stem)
        if case_id in already:
            print(f"  skip  {case_id}")
            continue

        print(f"  ingest {case_id} ...", end=" ", flush=True)
        text = _extract_text(pdf)
        if not text.strip():
            print("empty — skipped")
            continue

        chunks = _chunk(text)
        print(f"{len(chunks)} chunks", end=" ", flush=True)

        vecs = _embed_batch(chunks)

        rows = [
            (case_id, pdf.name, i, chunk, _pack(vec))
            for i, (chunk, vec) in enumerate(zip(chunks, vecs))
        ]
        con.executemany(
            "INSERT INTO passages(case_id, filename, para_no, text, embedding) VALUES (?,?,?,?,?)",
            rows,
        )
        con.commit()
        already.add(case_id)
        print("✓")

    total = con.execute("SELECT count(*) FROM passages").fetchone()[0]
    cases = con.execute("SELECT count(DISTINCT case_id) FROM passages").fetchone()[0]
    print(f"\nDone — {total} passages across {cases} cases → {DB_PATH}")
    con.close()


if __name__ == "__main__":
    build()
