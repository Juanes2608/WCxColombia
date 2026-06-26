"""
IDocumentIngestor implementation using PyMuPDF.
Ported from /backend/app/adapters/ocr/ingest_pdf.py with simplified interface.
Degrades honestly — never invents text if extraction fails.
"""
from __future__ import annotations

import io
import logging

from app.ports.document import IDocumentIngestor, IngestedDocument
from app.adapters.document.docx_adapter import extract_text_from_docx

logger = logging.getLogger("citationguard.document")

_MIN_CHARS = 100
_CONFIDENCE_THRESHOLD = 0.60

try:
    import fitz  # PyMuPDF
    _HAS_FITZ = True
except ImportError:
    _HAS_FITZ = False


class PyMuPdfAdapter(IDocumentIngestor):

    def extract(self, content: bytes, filename: str) -> IngestedDocument:
        if filename.lower().endswith(".txt"):
            return IngestedDocument(
                text=content.decode("utf-8", errors="replace"),
                confidence=1.0,
                source_type="digital",
            )

        if filename.lower().endswith(".docx"):
            try:
                text = extract_text_from_docx(content)
                if text.strip():
                    return IngestedDocument(text=text, confidence=1.0, source_type="digital")
            except Exception:
                logger.exception("DOCX extraction failed")
            return IngestedDocument(text="", confidence=0.0, source_type="needs_human")

        if not filename.lower().endswith(".pdf"):
            return IngestedDocument(
                text="", confidence=0.0, source_type="needs_human"
            )

        if not _HAS_FITZ:
            logger.warning("PyMuPDF not installed — cannot extract PDF text")
            return IngestedDocument(text="", confidence=0.0, source_type="needs_human")

        return self._extract_pdf(content)

    def _extract_pdf(self, content: bytes) -> IngestedDocument:
        try:
            doc = fitz.open(stream=io.BytesIO(content), filetype="pdf")
            pages_text: list[str] = []
            for page in doc:
                pages_text.append(page.get_text("text"))
            doc.close()

            full_text = "\n".join(pages_text).strip()
            if len(full_text) >= _MIN_CHARS:
                return IngestedDocument(
                    text=full_text,
                    confidence=1.0,
                    source_type="digital",
                )
            # PDF has no text layer — would need OCR, signal needs_human
            return IngestedDocument(text="", confidence=0.0, source_type="needs_human")

        except Exception:
            logger.exception("PDF extraction failed")
            return IngestedDocument(text="", confidence=0.0, source_type="needs_human")
