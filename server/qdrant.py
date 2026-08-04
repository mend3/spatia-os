"""Acesso ao Qdrant pela API REST — busca híbrida, varredura e leitura de ponto.

A busca é denso + BM25 fundidos por RRF. A razão de não usar só o denso está medida: no
índice deste workspace o denso sozinho acerta 3/21 do gabarito contra 13/21 do híbrido —
o esparso é quem pega identificador literal (`HUB_WORKER_TOKEN`), que o denso não vetoriza
de forma distinguível.
"""
import time
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from . import config, embed, metrics, net

SCROLL_PAGE = 1000


@contextmanager
def _timed(op: str):
    """Mede a operação e registra o estado do upstream a partir de tráfego real.

    O `except` marca o serviço como fora antes de repropagar: quem chama já trata a falha,
    mas o gauge tem que refletir a última interação de verdade — não uma sonda.
    """
    clock = time.monotonic()
    try:
        yield
    except net.UpstreamError:
        metrics.upstream_up.set(0, service="qdrant")
        raise
    else:
        metrics.upstream_up.set(1, service="qdrant")
    finally:
        metrics.qdrant_duration.observe(time.monotonic() - clock, op=op)


def _url(path: str) -> str:
    return f"{config.get('QDRANT_URL').rstrip('/')}{path}"


def _collection() -> str:
    return config.get("QDRANT_COLLECTION")


def info() -> dict:
    with _timed("info"):
        result = net.get_json("qdrant", _url(f"/collections/{_collection()}"), timeout=5)["result"]
    params = result.get("config", {}).get("params", {})
    return {
        "points": result.get("points_count", 0),
        "vectors": list((params.get("vectors") or {}).keys()),
        "sparse": list((params.get("sparse_vectors") or {}).keys()),
    }


def search(query: str, limit: int = 8, *, dense_only: bool = False) -> list[dict]:
    """Devolve hits normalizados: `{id, score, source, path, section, text}`."""
    vector_name = config.vector_name(config.get("EMBED_MODEL"))

    clock = time.monotonic()
    dense = embed.dense_query(query)
    sparse = None if dense_only else embed.sparse_query(query)
    metrics.embed_duration.observe(time.monotonic() - clock)

    if dense_only:
        payload: dict[str, Any] = {"query": dense, "using": vector_name, "limit": limit}
    else:
        payload = {
            "prefetch": [
                {"query": dense, "using": vector_name, "limit": limit * 5},
                {"query": sparse, "using": config.SPARSE_VECTOR_NAME, "limit": limit * 5},
            ],
            "query": {"fusion": "rrf"},
            "limit": limit,
        }
    payload["with_payload"] = True

    with _timed("query"):
        response = net.post_json("qdrant", _url(f"/collections/{_collection()}/points/query"), payload)
    return [_normalize(point) for point in response["result"]["points"]]


def scroll(*, with_text: bool = False) -> Iterator[dict]:
    """Varre a coleção inteira, página a página. Usado para montar a topologia do grafo."""
    offset: Optional[Any] = None
    while True:
        payload: dict[str, Any] = {"limit": SCROLL_PAGE, "with_payload": True, "with_vector": False}
        if offset is not None:
            payload["offset"] = offset
        with _timed("scroll"):
            result = net.post_json(
                "qdrant", _url(f"/collections/{_collection()}/points/scroll"), payload
            )["result"]
        for point in result["points"]:
            yield _normalize(point, with_text=with_text)
        offset = result.get("next_page_offset")
        if offset is None:
            return


def chunks_of(source: str, limit: int = 40) -> list[dict]:
    """Todos os chunks indexados de um arquivo, para o inspetor de nó."""
    payload = {
        "limit": limit,
        "with_payload": True,
        "with_vector": False,
        "filter": {"must": [{"key": "metadata.source", "match": {"value": source}}]},
    }
    with _timed("chunks"):
        result = net.post_json(
            "qdrant", _url(f"/collections/{_collection()}/points/scroll"), payload
        )["result"]
    hits = [_normalize(point, with_text=True) for point in result["points"]]
    return sorted(hits, key=lambda h: int(h.get("chunk") or 0))


def neighbors(point_id: str, limit: int = 8) -> list[dict]:
    """Vizinhos semânticos de um ponto — as arestas que o grafo estrutural não tem.

    A topologia base é a hierarquia real de diretórios; isto acrescenta a ligação
    *por significado*, que é o que faz dois arquivos de repos diferentes se aproximarem.
    """
    payload = {
        "query": {"recommend": {"positive": [point_id]}},
        "using": config.vector_name(config.get("EMBED_MODEL")),
        "limit": limit,
        "with_payload": True,
    }
    with _timed("neighbors"):
        response = net.post_json("qdrant", _url(f"/collections/{_collection()}/points/query"), payload)
    return [_normalize(point) for point in response["result"]["points"]]


def _normalize(point: dict, *, with_text: bool = False) -> dict:
    payload = point.get("payload") or {}
    meta = payload.get("metadata") or {}
    document = payload.get("document", "")
    # O indexador prefixa cada chunk com `caminho § heading`; o corpo é o que vem depois.
    body = document.split("\n\n", 1)[-1].strip()
    hit = {
        "id": point.get("id"),
        "score": point.get("score"),
        "source": meta.get("source", ""),
        "path": meta.get("path", ""),
        "file": meta.get("file_name", ""),
        "section": meta.get("section", ""),
        "chunk": meta.get("chunk_index"),
        "indexed_at": meta.get("indexed_at", ""),
    }
    hit["text"] = body if with_text else body[:600]
    return hit
