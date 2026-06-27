"""
Domain-level exceptions.
All are raised by the domain/service layer and caught by FastAPI exception handlers.
"""
from __future__ import annotations


class TraceITError(Exception):
    """Base class for all TraceIT domain errors."""


class DocumentIngestionError(TraceITError):
    """Raised when a document cannot be ingested (corrupt, password-protected, etc.)."""


class NeedsHumanReview(TraceITError):
    """
    Raised when the confidence of an extracted result is too low to auto-verify.
    The service returns a partial result rather than a fabricated verdict.
    """
    def __init__(self, reason: str) -> None:
        super().__init__(f"Human review required: {reason}")
        self.reason = reason


class CorpusUnavailableError(TraceITError):
    """
    Raised when the corpus (Neo4j) is not reachable at all.
    Distinguished from ServiceUnavailable, which causes graceful degradation.
    Only raised when the pipeline cannot produce any result (not just Layer 2).
    """
