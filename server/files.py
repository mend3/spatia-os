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

    ⭑ **`source` é relativo à RAIZ DO CORPUS, e é só isso.** O indexador o constrói a partir da
    pasta escolhida, então ler é juntar os dois. Não há segunda raiz, não há segmento a descartar
    e não há regra que dependa de qual repo o caminho nomeia.

    ⚠️ **Refutação medida — não reintroduza a resolução por DUAS raízes.** Escolher entre elas
    comparando o primeiro segmento com o BASENAME de uma acerta só para o repo homônimo; para
    qualquer outro, `datahouse/apps/api/x` vira `<outra-raiz>/apps/api/x` — caminho inexistente,
    resposta "não encontrado", e sintoma com cara de erro de digitação do usuário.

    `source` absoluto passa direto: são as memórias do agente, indexadas por caminho absoluto.
    """
    if not source:
        raise Forbidden("source vazio")
    if source.startswith("/"):
        return read(source)

    raiz = config.get("CORPUS_ROOT")
    if not raiz:
        raise FileNotFoundError(
            f"{source}: sem raiz de corpus escolhida — a leitura não adivinha de onde o índice veio"
        )
    return read(str(Path(raiz).expanduser() / source))
