"""E2E tests for GET /api/suggest?q="""


def test_suggest_known_case_returns_match(http_client):
    r = http_client.get("/api/suggest", params={"q": "Donoghue v Stevenson"})
    assert r.status_code == 200
    body = r.json()
    assert body["match"] is not None
    assert "Donoghue" in body["match"]["citation"]


def test_suggest_fabricated_query_returns_null(http_client):
    r = http_client.get("/api/suggest", params={"q": "xyzabc123fabricated"})
    assert r.status_code == 200
    body = r.json()
    assert body["match"] is None
