from __future__ import annotations

from abc import ABC, abstractmethod


class IAuditLog(ABC):

    @abstractmethod
    def record(self, action: str, ref: str, grounding: list[str]) -> None:
        """Append an immutable audit entry."""
        ...

    @abstractmethod
    def digest(self) -> str:
        """Return the SHA-256 hex digest of the entire log (tamper-evident)."""
        ...
