"""Arquivos com alteração local — o que está diferente do que está commitado.

Serve o anel de Saturno em volta da estrela: "este conhecimento está em trabalho". É estado
real do disco, não enfeite — e é a informação que some quando se olha só o corpus indexado,
porque o índice não sabe se o arquivo mudou depois da última reindexação.

Distingue três situações, porque elas não significam a mesma coisa:

| Estado | `git status` | Significado |
|---|---|---|
| `modified` | ` M` / `M ` / `MM` | existe commitado e divergiu |
| `staged` | índice sujo (1ª coluna) | preparado para o próximo commit |
| `untracked` | `??` | nunca foi commitado — o índice pode tê-lo, o git não |

`untracked` merece distinção porque é o caso em que a *recência por git* não tem resposta e o
`recency.py` cai para mtime. Um anel que não diferencia isso esconderia essa diferença.

Custo: um `git status --porcelain` por raiz git, não um por arquivo. TTL curto (15s) de
propósito — ao contrário do histórico, isto muda a cada `Ctrl+S`, e o valor do anel é ser
imediato.
"""
import logging
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

from . import config

logger = logging.getLogger("espatial.dirty")

TIMEOUT_SECONDS = 30
# Curto: o anel só vale se acompanha o que você acabou de salvar.
CACHE_TTL = 15

_lock = threading.Lock()
_cache: tuple[float, dict[str, str]] = (0.0, {})


# Profundidade máxima da varredura de submódulos. Não há repo real com aninhamento maior, e um
# teto explícito impede que um `.gitmodules` circular trave o servidor.
MAX_SUBMODULE_DEPTH = 4


def _submodules(base: Path, depth: int = 0) -> list[Path]:
    """Os submódulos de `base`, RECURSIVAMENTE.

    ⚠️ Só o primeiro nível não basta, e isto foi medido: `core/oracle` tem `.gitmodules` próprio
    (`shared/mcp`), e há 7 arquivos indexados sob ele. Editar um deles não acendia anel nenhum —
    o `git status` do workspace nem enxerga (está dentro de oracle) e o de oracle reporta
    `shared/mcp` como gitlink, que não é caminho de arquivo. O resultado na tela era o pior
    possível: sem anel, e a nota afirmando "FORA DO ÍNDICE" sobre um arquivo indexado.
    """
    if depth >= MAX_SUBMODULE_DEPTH:
        return []
    found: list[Path] = []
    try:
        out = subprocess.run(
            ["git", "-C", str(base), "config", "--file", ".gitmodules", "--get-regexp", r"\.path$"],
            capture_output=True, text=True, timeout=15,
        ).stdout
    except (OSError, subprocess.SubprocessError) as e:
        logger.warning(f"não li .gitmodules em {base}: {e}")
        return []

    for line in out.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        child = base / parts[1]
        if not child.is_dir():
            continue
        found.append(child)
        found.extend(_submodules(child, depth + 1))
    return found


def root() -> Optional[Path]:
    """A raiz do workspace, ou `None` quando não há uma configurada.

    ⚠️ `None` e "árvore limpa" são respostas DIFERENTES, e confundi-las desligava a feature em
    silêncio: sem raiz de corpus escolhida, `/api/dirty` respondia
    `{}` para sempre — sem anel, sem nota, sem erro, e indistinguível de um repositório sem
    nenhuma alteração. Quem chama precisa poder dizer qual dos dois é.
    """
    configured = config.get("CORPUS_ROOT")
    if not configured:
        return None
    base = Path(configured).resolve()
    # ☠️ **A raiz do corpus pode CONTER repositórios em vez de ser um**, e exigir `.git` nela
    # desligava os anéis inteiros: a tela anunciava "SEM RAIZ GIT CONFIGURADA" com seis repos
    # embaixo. Quem decide é a DESCOBERTA, não a suposição — e ter repos dentro basta.
    return base if (base / ".git").exists() or repositorios(base) else None


def repositorios(base: Path) -> list[Path]:
    """Os repositórios git DESCOBERTOS sob `base` — a resposta a "o que aqui é repo?".

    ⚠️ Ela é MEDIDA a cada chamada, nunca uma lista gravada na configuração. Um repo clonado
    depois da escolha da pasta apareceria numa lista velha como ausente, e o sintoma seria anel
    faltando sem nada acusar — o mesmo formato de "declarar não implementa" que esta base paga.
    """
    if (base / ".git").exists():
        return []
    try:
        return sorted(f for f in base.iterdir() if f.is_dir() and (f / ".git").exists())
    except OSError:
        return []


def _roots() -> list[Path]:
    """As árvores git sob a raiz: ela própria mais submódulos, ou os repos que ela contém."""
    base = root()
    if not base:
        return []
    if (base / ".git").exists():
        return [base, *_submodules(base)]
    achados = []
    for repo in repositorios(base):
        achados.extend([repo, *_submodules(repo)])
    return achados


def _status(git_root: Path, prefix: str) -> dict[str, str]:
    """path (relativo à raiz do workspace) → 'modified' | 'staged' | 'untracked'.

    ⚠️ **`-z`, e não porcelain de linhas.** Sem ele o git aplica `core.quotePath` (ligado por
    default) e devolve o caminho ESCAPADO: `coração.md` vira `cora\\303\\247\\303\\243o.md`, e
    caminho com espaço vem entre aspas. Medido: num repo PT-BR nenhum arquivo com acento casava
    com o nó do céu, e um `git mv "relatório final.md" "relatório.md"` produzia `"relatório.md`
    com a aspa colada. O sintoma era o pior possível — sem anel, e a nota da tela afirmando
    "FORA DO ÍNDICE" sobre um arquivo que está no índice.

    Com `-z` não há escape nem aspas: os registros vêm separados por NUL, em UTF-8 cru. O preço
    é que rename ocupa DOIS registros (novo, depois o antigo), então o laço consome o par.
    """
    try:
        out = subprocess.run(
            ["git", "-C", str(git_root), "status", "--porcelain", "-z", "--untracked-files=all"],
            capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        ).stdout
    except (OSError, subprocess.SubprocessError) as e:
        logger.warning(f"git status falhou em {git_root}: {e}")
        return {}

    records = [record for record in out.split("\0") if record]
    states: dict[str, str] = {}
    i = 0
    while i < len(records):
        record = records[i]
        i += 1
        if len(record) < 4:
            continue
        # Dois caracteres de estado, espaço, caminho. Primeira coluna é o índice, segunda é a
        # árvore de trabalho.
        index, worktree, path = record[0], record[1], record[3:]
        if index in ("R", "C") or worktree in ("R", "C"):
            # Rename/cópia: o registro traz o caminho NOVO e o seguinte traz o antigo. O anel se
            # importa com o arquivo que existe agora, então o antigo é consumido e descartado.
            i += 1
        if index == "?" or worktree == "?":
            state = "untracked"
        elif index not in (" ", "?"):
            state = "staged"
        else:
            state = "modified"
        states[f"{prefix}{path}" if prefix else path] = state
    return states


def table() -> dict[str, str]:
    """Mapa caminho→estado, em cache curto."""
    global _cache
    with _lock:
        age, cached = _cache
        if cached is not None and time.monotonic() - age < CACHE_TTL:
            if cached or age:
                return cached

        started = time.monotonic()
        raiz = root()
        states: dict[str, str] = {}
        for git_root in _roots():
            # ⚠️ A âncora do prefixo é a RAIZ do corpus, não o primeiro repo da lista: com repos
            # IRMÃOS, ancorar no primeiro faria os caminhos do segundo saírem relativos ao
            # primeiro — e `source` é sempre relativo à raiz.
            prefix = "" if git_root == raiz else f"{git_root.relative_to(raiz)}/"
            states.update(_status(git_root, prefix))

        if states:
            logger.info(
                f"alterações locais: {len(states)} arquivo(s) em "
                f"{(time.monotonic() - started) * 1000:.0f}ms"
            )
        _cache = (time.monotonic(), states)
        return states


def state_of(source: str) -> Optional[str]:
    """Estado local do arquivo, ou None se limpo (ou fora de git)."""
    if source.startswith("/"):
        # Caminho absoluto vem do `--include` do indexador (as memórias do agente), que está
        # fora de qualquer git. Não há "alteração local" a reportar.
        return None
    # ⚠️ O `source` INTEIRO é a chave. Ele cortava o primeiro segmento porque a raiz ERA o repo;
    # com a raiz contendo repos, o primeiro segmento é o NOME DO REPO — e é ele o prefixo com que
    # `table()` chaveia. Cortá-lo procurava `docs/x.md` numa tabela que guarda `redrex/docs/x.md`.
    return table().get(source)


def esquecer() -> None:
    """Descarta a tabela de alterações locais em memória. Ver `recency.esquecer`."""
    global _cache
    with _lock:
        _cache = (0.0, None)
