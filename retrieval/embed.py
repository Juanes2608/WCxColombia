"""
embed.py - turn passages/claims into vectors, behind a swappable interface.

Two providers, same interface, so we can compare them and so privacy is a
config flag, not a rewrite:

  * LocalEmbedder  - fastembed (ONNX, no torch). Runs fully offline after a
    one-time model download => the document never leaves the machine. This is
    the privilege-safe default for the local validation + handoff.
  * NeMoEmbedder   - NVIDIA NeMo Retriever (llama-3.2-nv-embedqa). Open-weight
    and on-prem deployable, so the same privacy story holds in production; for
    the demo it can hit the hosted NIM API. Stubbed until we wire a key.
"""

from __future__ import annotations

import os
from typing import Protocol


class Embedder(Protocol):
    dim: int
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class LocalEmbedder:
    """Offline embeddings via fastembed (default model: BGE-small, 384-dim)."""

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5") -> None:
        from fastembed import TextEmbedding

        self._model = TextEmbedding(model_name=model_name)
        self.dim = 384  # bge-small-en-v1.5
        self.name = f"local:{model_name}"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._model.embed(texts)]


class NeMoEmbedder:
    """
    NVIDIA NeMo Retriever embedding adapter (llama-3.2-nv-embedqa).

    Same interface as LocalEmbedder. Reads NVIDIA_API_KEY for the hosted NIM
    endpoint; in production this points at an on-prem NIM so privileged text
    never leaves the firm. Left as a thin stub until we choose to wire it.
    """

    def __init__(self, model: str = "nvidia/llama-3.2-nv-embedqa-1b-v2") -> None:
        self.api_key = os.environ.get("NVIDIA_API_KEY")
        self.model = model
        self.dim = 2048  # llama-3.2-nv-embedqa-1b-v2
        self.name = f"nemo:{model}"

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError(
            "NeMoEmbedder is a stubbed adapter. Set NVIDIA_API_KEY and wire the "
            "NeMo Retriever embedding NIM here to enable it."
        )


def get_embedder(provider: str | None = None) -> Embedder:
    """Factory. EMBED_PROVIDER=local|nemo (default: local)."""
    provider = (provider or os.environ.get("EMBED_PROVIDER", "local")).lower()
    if provider == "nemo":
        return NeMoEmbedder()
    return LocalEmbedder()


if __name__ == "__main__":
    emb = get_embedder("local")
    vecs = emb.embed(["duty of care three-part test", "exemplary damages"])
    print(f"{emb.name}  dim={emb.dim}  got {len(vecs)} vectors of len {len(vecs[0])}")
