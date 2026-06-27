"""E2E tests for GET /api/suggest"""
import io


def test_suggest_returns_results_for_real_proposition(http_client):
    r = http_client.get("/api/suggest", params={"q": "duty of care negligence"})
    assert r.status_code == 200
    body = r.json()
    assert "results" in body
    assert isinstance(body["results"], list)


def test_suggest_returns_empty_for_nonsense_query(http_client):
    r = http_client.get("/api/suggest", params={"q": "xyzabc123fabricated"})
    assert r.status_code == 200
    body = r.json()
    assert body["results"] == []


def test_suggest_result_has_correct_shape(http_client):
    r = http_client.get("/api/suggest", params={"q": "duty of care manufacturer consumer"})
    assert r.status_code == 200
    body = r.json()
    if body["results"]:
        result = body["results"][0]
        assert "citation" in result
        assert "short_name" in result
        assert "proposition" in result
        assert "score" in result


def test_suggest_domain_filter(http_client):
    r = http_client.get("/api/suggest", params={"q": "breach of contract", "domain": "contract"})
    assert r.status_code == 200
    body = r.json()
    assert body["domain"] == "contract"


def test_suggest_proof_panel_returns_200(http_client):
    """Upload a doc, then check that its proof panel is accessible."""
    text = "In Donoghue v Stevenson [1932] AC 562 the court established a duty of care."
    r = http_client.post(
        "/api/verify",
        files={"file": ("test.txt", io.BytesIO(text.encode()), "text/plain")},
    )
    assert r.status_code == 200
    matter_id = r.json()["matter_id"]

    r2 = http_client.get(f"/api/proof/{matter_id}/0")
    assert r2.status_code == 200
    panel = r2.json()
    assert panel["verdict"] in ("VERIFIED", "MISAPPLIED", "FABRICATED", "UNVERIFIABLE")
    assert panel["static_explanation"]
    assert panel["good_law_status"]
    assert "limitations" in panel["transparency"]
    # brief_pointer must be present — deterministic fallback ensures this
    assert panel["brief_pointer"] is not None
    assert panel["brief_pointer"]["sentence"]
    # verdict_reasoning must be present — falls back to static_explanation
    assert panel["verdict_reasoning"]


def test_suggest_document_endpoint_returns_200(http_client):
    """Upload a doc, then retrieve its full text via /api/document."""
    text = "Donoghue v Stevenson [1932] AC 562 established the neighbour principle."
    r = http_client.post(
        "/api/verify",
        files={"file": ("test.txt", io.BytesIO(text.encode()), "text/plain")},
    )
    matter_id = r.json()["matter_id"]

    r2 = http_client.get(f"/api/document/{matter_id}")
    assert r2.status_code == 200
    doc = r2.json()
    assert doc["char_count"] > 0
    assert isinstance(doc["citations"], list)
    assert doc["citations"][0]["verdict"] in ("VERIFIED", "MISAPPLIED", "FABRICATED", "UNVERIFIABLE")


def test_proof_panel_404_for_unknown_matter(http_client):
    r = http_client.get("/api/proof/nonexistent-matter-id/0")
    assert r.status_code == 404
