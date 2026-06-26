from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class StatutoryLookup:
    act: str
    year: int
    section: str
    exists: bool | None   # None = verification failed (timeout or unknown act)
    status_code: int | None
    excerpt: str | None
    url: str


class IStatutoryVerifier(ABC):

    @abstractmethod
    def verify(self, act_abbr: str, year: int, section: str) -> StatutoryLookup:
        """Verify a statutory section exists in the official legislation database."""
        ...

    @abstractmethod
    def verify_from_text(self, raw_citation: str) -> StatutoryLookup | None:
        """Parse a raw statute citation string and verify it. Returns None if unparseable."""
        ...
