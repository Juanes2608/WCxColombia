"""
Neo4j driver singleton with connection-pool management.
A single driver instance is shared across all requests (thread-safe by design).
"""
from __future__ import annotations

from neo4j import Driver, GraphDatabase
from neo4j import exceptions as neo4j_exc

from app.config import get_settings

_driver: Driver | None = None


def get_driver() -> Driver | None:
    global _driver
    settings = get_settings()
    if not settings.neo4j_configured:
        return None
    if _driver is None:
        _driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
            max_connection_pool_size=10,
            connection_timeout=5.0,
        )
    return _driver


def close_driver() -> None:
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None


def ping() -> bool:
    """Health check — returns True if Neo4j is reachable."""
    driver = get_driver()
    if driver is None:
        return False
    try:
        driver.verify_connectivity()
        return True
    except neo4j_exc.ServiceUnavailable:
        return False
