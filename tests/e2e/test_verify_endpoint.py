"""
E2E tests for POST /api/verify using the TestClient.
Neo4j is not configured → Layer 2 returns UNAVAILABLE (graceful degradation).
legislation.gov.uk is not called (no real HTTP in tests).
"""
import io
import os

import pytest


class TestVerifyEndpoint:

    def test_health_endpoint_returns_ok(self, http_client):
        r = http_client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "neo4j" in body

    def test_upload_txt_file_returns_200(self, http_client):
        text = "Donoghue v Stevenson [1932] AC 562 established the neighbour principle."
        r = http_client.post(
            "/api/verify",
            files={"file": ("skeleton.txt", io.BytesIO(text.encode()), "text/plain")},
        )
        assert r.status_code == 200
        body = r.json()
        assert "matter_id" in body
        assert "total_citations" in body
        assert "results" in body
        assert "audit_trail_hash" in body
        assert "financial" not in body

    def test_response_has_correct_structure(self, http_client):
        text = "Pemberton v Richards [2019] EWHC 1234 does not exist."
        r = http_client.post(
            "/api/verify",
            files={"file": ("test.txt", io.BytesIO(text.encode()), "text/plain")},
        )
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["results"], list)
        result = body["results"][0]
        assert "layer1" in result
        assert "layer2" in result
        assert result["layer1"]["verdict"] == "FABRICATED"

    def test_rejects_unsupported_file_type(self, http_client):
        r = http_client.post(
            "/api/verify",
            files={"file": ("presentation.pptx", io.BytesIO(b"content"), "application/vnd.ms-powerpoint")},
        )
        assert r.status_code == 400

    def test_openapi_docs_available(self, http_client):
        r = http_client.get("/docs")
        assert r.status_code == 200

    def test_mock_wc_pdf(self, http_client):
        """The full mock W&C skeleton produces exactly the expected verdicts."""
        fixture = os.path.join(os.path.dirname(__file__), "../fixtures/mock_skeleton_wc.pdf")
        if not os.path.exists(fixture):
            pytest.skip("Mock PDF not generated — run scripts/generate_mock_pdf.py first")

        with open(fixture, "rb") as f:
            r = http_client.post(
                "/api/verify",
                files={"file": ("skeleton.pdf", f, "application/pdf")},
            )

        assert r.status_code == 200
        body = r.json()

        fabricated = [x for x in body["results"] if x["layer1"]["verdict"] == "FABRICATED"]
        misapplied = [x for x in body["results"] if x["layer1"]["verdict"] == "MISAPPLIED"]
        verified   = [x for x in body["results"] if x["layer1"]["verdict"] == "VERIFIED"]

        assert len(fabricated) == 3, f"Expected 3 FABRICATED, got {len(fabricated)}"
        assert len(misapplied) == 2, f"Expected 2 MISAPPLIED, got {len(misapplied)}"
        assert len(verified) >= 5,   f"Expected ≥5 VERIFIED, got {len(verified)}"
