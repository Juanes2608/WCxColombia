"""
Pytest configuration — all tests run offline (no Neo4j, no HTTP).
API keys and external URIs are blanked before the app module is imported
so Settings never tries to connect to anything.
"""
import os

import pytest
from fastapi.testclient import TestClient

# ── Blank external dependencies BEFORE importing the app ─────────────────────
os.environ.update({
    "NEO4J_URI":         "",
    "NEO4J_USER":        "neo4j",
    "NEO4J_PASSWORD":    "",
    "ANTHROPIC_API_KEY": "",
    "JUS_MUNDI_API_KEY": "",
    "CORS_ORIGINS":      "http://localhost:3000",
})

from app.main import app  # noqa: E402 — must be AFTER env setup
from app.ports.corpus import CaseNode


# ── Shared fixtures ───────────────────────────────────────────────────────────

@pytest.fixture
def donoghue_node() -> CaseNode:
    return CaseNode(
        node_id="donoghue-v-stevenson-1932",
        citation="Donoghue v Stevenson [1932] AC 562",
        short_name="Donoghue v Stevenson",
        domain="tort",
        propositions=["Manufacturer owes duty of care to ultimate consumer"],
        status="GOOD_LAW",
    )


@pytest.fixture
def hedley_node() -> CaseNode:
    return CaseNode(
        node_id="hedley-byrne-v-heller-1964",
        citation="Hedley Byrne & Co Ltd v Heller & Partners Ltd [1964] AC 465",
        short_name="Hedley Byrne v Heller",
        domain="tort",
        propositions=["Duty of care from voluntary assumption of responsibility — negligent misstatement"],
        status="GOOD_LAW",
    )


@pytest.fixture
def http_client():
    with TestClient(app) as client:
        yield client
