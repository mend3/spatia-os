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

    **O primeiro segmento do `source` é o nome de um REPO do corpus, e só um deles é o
    `AGENT_CWD`.** É essa distinção que decide a raiz:

    - `<nome do AGENT_CWD>/resto` → o resto é relativo ao `AGENT_CWD`. É o caminho nativo, e
      vale a pena preferi-lo: lê o arquivo real em vez de atravessar um symlink do vault.
    - qualquer outro repo → o `source` INTEIRO é relativo ao vault, que é de onde o índice foi
      construído (`CORPUS_PREFIX=vault/` é justamente o prefixo removido na indexação).

    ⚠️ **Descartar o primeiro segmento sempre era o defeito**, e ele se escondia numa
    coincidência: o único repo que alguém abria era o que tem o mesmo nome do diretório do
    `AGENT_CWD`, e para esse a conta errada dá o resultado certo. Para `datahouse/apps/api/…` o
    servidor procurava `AGENT_CWD/apps/api/…` e respondia "não encontrado" com um caminho que
    parece erro de digitação do usuário — o pior formato possível para um defeito de rota.

    ⚠️ A convenção de `dirty.state_of` e de `registerPath` no cliente continua sendo descartar o
    primeiro segmento, e continua CERTA lá: o alvo delas é a tabela do `git status`, que é
    relativa a uma raiz git só. Aqui o alvo é disco, e disco tem duas raízes.

    `source` absoluto passa direto: são as memórias do agente, indexadas por caminho absoluto.
    """
    if not source:
        raise Forbidden("source vazio")
    if source.startswith("/"):
        return read(source)

    first, _, relative = source.partition("/")
    if not relative:
        raise FileNotFoundError(source)

    agent_cwd = config.get("AGENT_CWD")
    if agent_cwd and first == Path(agent_cwd).expanduser().name:
        return read(str(Path(agent_cwd) / relative))

    vault = config.vault_path()
    if vault:
        return read(str(vault / source))

    # Sem vault não há segunda raiz, e inventar uma seria repetir o defeito acima. O erro nomeia
    # o que faltou em vez de exibir um caminho montado com a raiz errada.
    raise FileNotFoundError(
        f"{source}: fora do AGENT_CWD ({agent_cwd or 'não declarado'}) e sem vault nesta máquina"
    )
