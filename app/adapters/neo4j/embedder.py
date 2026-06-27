"""
Singleton text embedder using BAAI/bge-small-en-v1.5 (384-dim, cosine).

Matches the model used to build the passage_embedding vector index in Neo4j.
Import is graceful — returns None when fastembed is not installed so every
caller can fall back to non-vector paths without crashing.

First call downloads ~120 MB from HuggingFace (cached locally after that).
"""
from __future__ import annotations

import logging
import threading

logger = logging.getLogger("traceit.embedder")

_LOCK     = threading.Lock()
_EMBEDDER = None
_FAILED   = False   # avoid retrying a failed import on every request


def embed(text: str) -> list[float] | None:
    """
    Embed a text string with bge-small-en-v1.5.
    Returns a 384-dim float list, or None if fastembed is not available.
    Thread-safe.
    """
    global _EMBEDDER, _FAILED

    if _FAILED:
        return None

    with _LOCK:
        if _FAILED:
            return None
        if _EMBEDDER is None:
            try:
                from fastembed import TextEmbedding
                _EMBEDDER = TextEmbedding("BAAI/bge-small-en-v1.5")
                logger.info("Embedder ready: BAAI/bge-small-en-v1.5 (384-dim)")
            except Exception as exc:
                _FAILED = True
                logger.info("fastembed unavailable (%s) — vector search disabled", exc)
                return None

    try:
        vec = next(iter(_EMBEDDER.embed([text])))
        return vec.tolist() if hasattr(vec, "tolist") else list(vec)
    except Exception as exc:
        logger.warning("Embedding failed: %s", exc)
        return None
