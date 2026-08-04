"""Vetorização local (fastembed/ONNX na CPU) — denso + BM25 esparso.

O modelo pesa alguns segundos para carregar, então ele é carregado uma vez e aquecido numa
thread no boot: sem isso, a primeira pergunta da sessão paga o carregamento no meio da
animação, e a UI fica travada exatamente no momento em que deveria impressionar.

Sem chave e sem rede: nada da prosa consultada sai da máquina.
"""
import logging
import threading
from typing import Optional

from . import config

logger = logging.getLogger("espatial.embed")

_lock = threading.Lock()
_dense = None
_sparse = None


def _load() -> tuple:
    global _dense, _sparse
    with _lock:
        if _dense is None or _sparse is None:
            from fastembed import SparseTextEmbedding, TextEmbedding

            logger.info("carregando modelos de embedding (primeira vez baixa ~120MB)")
            _dense = TextEmbedding(config.get("EMBED_MODEL"))
            _sparse = SparseTextEmbedding(config.get("SPARSE_MODEL"))
            logger.info("modelos prontos")
    return _dense, _sparse


def warm() -> None:
    """Aquece os modelos em background; falha aqui não impede o servidor de subir."""

    def run() -> None:
        try:
            dense_query("aquecimento")
        except Exception as e:  # noqa: BLE001 — o servidor serve a UI mesmo sem busca
            logger.warning(f"aquecimento falhou, a busca vai carregar sob demanda: {e}")

    threading.Thread(target=run, name="embed-warm", daemon=True).start()


def dense_query(text: str) -> list[float]:
    dense, _ = _load()
    return next(iter(dense.embed([text]))).tolist()


def sparse_query(text: str) -> Optional[dict]:
    """`query_embed`, não `embed`: na consulta o BM25 lista termos, sem peso de documento."""
    _, sparse = _load()
    embedding = next(iter(sparse.query_embed([text])))
    return {"indices": embedding.indices.tolist(), "values": embedding.values.tolist()}


def is_ready() -> bool:
    return _dense is not None and _sparse is not None
