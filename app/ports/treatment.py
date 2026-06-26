from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class TreatmentHistory:
    verdict: str   # "GOOD_LAW" | "OVERRULED" | "DISTINGUISHED" | "UNAVAILABLE"
    overruled_by: list[dict] = field(default_factory=list)
    distinguished_by: list[dict] = field(default_factory=list)
    source: str = "unknown"


class ITreatmentRepository(ABC):

    @abstractmethod
    def get_history(self, node_id: str) -> TreatmentHistory:
        """Returns treatment history for a verified case node."""
        ...
