"""Leitura de arquivo para o inspetor — com a barreira de raiz que a UI exige.

A página é servida em localhost, mas qualquer coisa rodando no browser pode chamar esta
rota. Por isso o caminho pedido é resolvido (símbolo, `..`, link) e comparado com as raízes
permitidas *depois* de resolvido: validar antes de resolver é exatamente o furo que
`../../` explora.
"""
from pathlib import Path

from . import config

MAX_CHARS = 24_000


class Forbidden(PermissionError):
    pass


def resolve(candidate: str) -> Path:
    if not candidate:
        raise Forbidden("caminho vazio")
    path = Path(candidate).expanduser()
    if not path.is_absolute():
        path = config.ROOT / path
    resolved = path.resolve()

    for root in config.file_roots():
        if resolved == root or root in resolved.parents:
            return resolved
    raise Forbidden(f"fora das raízes permitidas: {resolved}")


def read(candidate: str) -> dict:
    path = resolve(candidate)
    if not path.is_file():
        raise FileNotFoundError(candidate)
    text = path.read_text(encoding="utf-8", errors="replace")
    return {
        "path": str(path),
        "name": path.name,
        "bytes": path.stat().st_size,
        "truncated": len(text) > MAX_CHARS,
        "text": text[:MAX_CHARS],
    }
