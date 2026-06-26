"""
IAuditLog implementation using an in-memory append-only log with SHA-256 chain.
Each entry hashes the previous digest + new content → tamper-evident chain.
In production: persist to an event store or append-only DB table.
"""
from __future__ import annotations

import hashlib
import json
import time
from threading import Lock

from app.ports.audit import IAuditLog


class Sha256AuditLog(IAuditLog):
    """Thread-safe append-only audit log with SHA-256 hash chain."""

    def __init__(self) -> None:
        self._entries: list[dict] = []
        self._running_hash: str = ""
        self._lock = Lock()

    def record(self, action: str, ref: str, grounding: list[str]) -> None:
        entry = {
            "ts":        time.time(),
            "action":    action,
            "ref":       ref,
            "grounding": grounding,
        }
        with self._lock:
            entry["prev_hash"] = self._running_hash
            entry_hash = _sha256(self._running_hash + json.dumps(entry, sort_keys=True))
            entry["hash"] = entry_hash
            self._entries.append(entry)
            self._running_hash = entry_hash

    def digest(self) -> str:
        """Returns the current chain tip hash (SHA-256 hex, 64 chars)."""
        return self._running_hash or _sha256("empty")


def _sha256(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()
