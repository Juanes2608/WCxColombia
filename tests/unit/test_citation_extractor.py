from app.domain.citation_extractor import extract_citations


def test_extracts_standard_case_law_citation():
    text = "See Donoghue v Stevenson [1932] AC 562 for the neighbour principle."
    citations = extract_citations(text)
    assert len(citations) == 1
    assert "Donoghue v Stevenson" in citations[0].raw_text
    assert citations[0].citation_type == "case_law"


def test_extracts_uksc_citation():
    text = "R v Jogee [2016] UKSC 8 changed the law on joint enterprise."
    citations = extract_citations(text)
    assert any("Jogee" in c.raw_text for c in citations)


def test_deduplicates_repeated_citation():
    text = (
        "Donoghue v Stevenson [1932] AC 562 is the cornerstone. "
        "The house held in Donoghue v Stevenson [1932] AC 562 that..."
    )
    citations = extract_citations(text)
    donoghue = [c for c in citations if "Donoghue" in c.raw_text]
    assert len(donoghue) == 1


def test_extracts_statute_citation():
    text = "Section 98(4) of the Employment Rights Act 1996 s.98(4) governs fairness."
    citations = extract_citations(text)
    statutes = [c for c in citations if c.citation_type == "statute"]
    assert len(statutes) >= 1


def test_returns_citations_in_document_order():
    text = (
        "First see Caparo Industries plc v Dickman [1990] 2 AC 605. "
        "Then Donoghue v Stevenson [1932] AC 562."
    )
    citations = extract_citations(text)
    assert citations[0].start < citations[1].start


def test_no_false_positives_on_lowercase():
    text = "see donoghue v stevenson 1932 ac 562"
    citations = extract_citations(text)
    assert len(citations) == 0


def test_extracts_hyphenated_party_name():
    # Chan Wing-Siu has a hyphen — the extractor must capture the full name
    text = "See Chan Wing-Siu v R [1985] AC 168 on joint enterprise."
    citations = extract_citations(text)
    assert len(citations) == 1
    assert "Chan Wing-Siu" in citations[0].raw_text
