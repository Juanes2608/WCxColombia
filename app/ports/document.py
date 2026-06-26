from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class IngestedDocument:
    text: str
    confidence: float   # 0.0–1.0; < 0.6 → needs_human
    source_type: str    # "digital" | "ocr" | "needs_human"


class IDocumentIngestor(ABC):

    @abstractmethod
    def extract(self, content: bytes, filename: str) -> IngestedDocument:
        """Extract text from a document. Never invents text — degrades honestly."""
        ...
