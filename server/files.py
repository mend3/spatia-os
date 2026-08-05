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


def read_source(source: str) -> dict:
    """Lê o arquivo por `source` — a chave que o céu usa, não um caminho de disco.

    ⚠️ A convenção é a MESMA de `dirty.state_of` e a inversa de `registerPath` no cliente: o
    primeiro segmento do `source` é o nome da raiz (`devshell-one/...`) e o resto é relativo ao
    `AGENT_CWD`. Ela mora aqui, no servidor, de propósito — o cliente já precisa dela uma vez
    para casar os anéis, e uma terceira cópia da regra seria a terceira chance de divergir.

    `source` absoluto passa direto: são as memórias do agente, indexadas por caminho absoluto.
    """
    if not source:
        raise Forbidden("source vazio")
    if source.startswith("/"):
        return read(source)
    _, _, relative = source.partition("/")
    if not relative:
        raise FileNotFoundError(source)
    root = config.get("AGENT_CWD")
    return read(str(Path(root) / relative) if root else relative)
