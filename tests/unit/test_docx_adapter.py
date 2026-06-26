from io import BytesIO
from docx import Document
from app.adapters.document.docx_adapter import extract_text_from_docx


def _make_docx(paragraphs: list[str]) -> bytes:
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_extracts_text_from_docx():
    content = _make_docx(["Donoghue v Stevenson [1932] AC 562", "Lumley v Gye (1853) 2 El & Bl 216"])
    result = extract_text_from_docx(content)
    assert "Donoghue v Stevenson" in result
    assert "Lumley v Gye" in result


def test_empty_paragraphs_are_excluded():
    content = _make_docx(["Hello", "", "World"])
    result = extract_text_from_docx(content)
    assert "Hello" in result
    assert "World" in result
    assert result.count("\n") == 1  # only one separator between two non-empty paragraphs
