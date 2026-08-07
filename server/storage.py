"""Armazenamento: o corpus é confiável, e o que este processo escreveu em disco.

Distinção com `#/files`, porque parecem a mesma tela e não são: lá se pergunta *o que o núcleo
sabe sobre X*; aqui, *dá para confiar no corpus*.

⚠️ **O acoplamento mais traiçoeiro do sistema mora aqui.** `config.vector_name()` deriva o nome do
vetor do modelo de embedding, e nome divergente devolve **resultado vazio em vez de erro** — a
busca some sem levantar exceção, sem log, sem sintoma além de "não achou nada". Comparar o
esperado com o presente é a única defesa contra um modo de falha que não avisa.

**O SpatIA NÃO INDEXA.** Ele lê uma coleção que outro pipeline escreveu, então não existe botão
REINDEXAR — existe o comando, exibido e copiável. Reconstruir a TOPOLOGIA, sim, é deste sistema.
"""
import logging
import time
from pathlib import Path

from . import config, qdrant

logger = logging.getLogger("espatial.storage")

# O que este processo escreveu, e por quê. A lista é explícita e não uma varredura de `.cache/`:
# um arquivo que aparecer ali sem entrada aqui é algo que ninguém declarou escrever, e a tela
# tem de poder dizer isso em vez de legitimá-lo por listagem.
WRITTEN = [
    (".cache/config.json", "permissões, modo e fontes de settings"),
    (".cache/speech.json", "voz: motor, timbre e mistura"),
    (".cache/graph.json", "topologia servida à cena, com fingerprint"),
    (".cache/journal", "o diário append-only das execuções"),
    (".cache/attachments", "anexos enviados pela página"),
]


def _entry(relative: str, note: str) -> dict:
    path = config.ROOT / relative
    if not path.exists():
        return {"path": relative, "note": note, "exists": False, "bytes": 0, "age_seconds": None}
    if path.is_dir():
        arquivos = [item for item in path.rglob("*") if item.is_file()]
        total = sum(item.stat().st_size for item in arquivos)
        recente = max((item.stat().st_mtime for item in arquivos), default=path.stat().st_mtime)
    else:
        total = path.stat().st_size
        recente = path.stat().st_mtime
    return {
        "path": relative,
        "note": note,
        "exists": True,
        "bytes": total,
        "age_seconds": round(time.time() - recente),
    }


def collection() -> dict:
    """Vetores ESPERADOS vs PRESENTES. É o widget que justifica a tela sozinho."""
    esperado_denso = config.vector_name(config.get("EMBED_MODEL"))
    esperado_esparso = config.SPARSE_VECTOR_NAME

    try:
        info = qdrant.info()
    except Exception as error:  # noqa: BLE001 — upstream fora do ar é resposta, não exceção aqui
        return {
            "online": False,
            "error": str(error),
            "name": config.get("QDRANT_COLLECTION"),
            "expected": {"dense": esperado_denso, "sparse": esperado_esparso},
        }

    presentes_densos = info.get("vectors") or []
    presentes_esparsos = info.get("sparse") or []
    return {
        "online": True,
        "name": config.get("QDRANT_COLLECTION"),
        "points": info.get("points", 0),
        "expected": {"dense": esperado_denso, "sparse": esperado_esparso},
        "present": {"dense": presentes_densos, "sparse": presentes_esparsos},
        # A divergência é o DADO desta tela, calculada aqui e não deixada para o olho: é
        # justamente ela que não produz erro em lugar nenhum.
        "mismatch": [
            nome
            for nome, presente in (
                (esperado_denso, esperado_denso in presentes_densos),
                (esperado_esparso, esperado_esparso in presentes_esparsos),
            )
            if not presente
        ],
        "model": config.get("EMBED_MODEL"),
    }


def caches() -> list[dict]:
    return [_entry(relative, note) for relative, note in WRITTEN]


def describe() -> dict:
    return {
        "collection": collection(),
        "caches": caches(),
        # O comando de reindexação é EXIBIDO, não executado: quem escreve a coleção é outro
        # pipeline, e um botão aqui prometeria uma autoridade que este servidor não tem.
        "reindex_hint": config.get("REINDEX_HINT")
        or "o pipeline que escreve a coleção é externo a este servidor",
    }
