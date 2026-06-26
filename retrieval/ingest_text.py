"""
ingest_text.py - get the FULL text of each judgment, OCR-ing scans.

~16 of the 56 case PDFs are image-only scans (Caparo, Anns, Hedley Byrne,
East v Maurer...) and yield zero text from a normal parse. Those are exactly
the cases the scenario turns on, so OCR is a hard requirement, not a nicety.

Strategy per file: try the fast digital path (pypdf); if it yields almost
nothing, fall back to OCR (pymupdf renders each page -> Tesseract). Everything
runs locally => the document never leaves the machine (privilege-safe).
"""

from __future__ import annotations

import io
import pathlib

import fitz  # pymupdf
import pytesseract
from PIL import Image
from pypdf import PdfReader

from eurlex_neo4j.load_casedb import parse_filename, slug_id

# Tesseract isn't on PATH; point at the installed Windows binary.
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# If the digital parse yields fewer chars than this, treat the PDF as a scan.
OCR_TRIGGER_CHARS = 200


def _digital_text(pdf_path: pathlib.Path) -> str:
    try:
        reader = PdfReader(str(pdf_path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


def _ocr_text(pdf_path: pathlib.Path, dpi: int = 200) -> str:
    """Render every page to an image and OCR it. Slow but reliable."""
    out = []
    doc = fitz.open(str(pdf_path))
    try:
        for page in doc:
            pix = page.get_pixmap(dpi=dpi)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            out.append(pytesseract.image_to_string(img))
    finally:
        doc.close()
    return "\n".join(out)


def extract_text(pdf_path: pathlib.Path) -> tuple[str, str]:
    """Return (full_text, method) where method is 'digital' or 'ocr'."""
    text = _digital_text(pdf_path)
    if len(text.strip()) >= OCR_TRIGGER_CHARS:
        return text, "digital"
    return _ocr_text(pdf_path), "ocr"


def case_id_for(pdf_path: pathlib.Path) -> tuple[str, str]:
    """Derive the SAME (id, name) the existence loader uses (the contract)."""
    meta = parse_filename(pdf_path.stem)
    case_id = meta["citation"] or slug_id(meta["name"])
    return case_id, meta["name"]


def ingest_dir(directory: str):
    """Yield {id, name, file, text, method, n_chars} for each case file."""
    folder = pathlib.Path(directory)
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() == ".pdf")
    for p in files:
        case_id, name = case_id_for(p)
        text, method = extract_text(p)
        yield {
            "id": case_id,
            "name": name,
            "file": p.name,
            "text": text,
            "method": method,
            "n_chars": len(text.strip()),
        }


# Manual check: how many needed OCR, and did it work?
if __name__ == "__main__":
    import sys

    directory = sys.argv[1] if len(sys.argv) > 1 else "data/caselaw"
    digital = ocr = 0
    for rec in ingest_dir(directory):
        tag = "OCR " if rec["method"] == "ocr" else "    "
        if rec["method"] == "ocr":
            ocr += 1
        else:
            digital += 1
        print(f"{tag}{rec['n_chars']:>7} chars  {rec['name'][:46]}")
    print(f"\nDigital: {digital}   OCR: {ocr}")
