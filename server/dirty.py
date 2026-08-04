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


def _roots() -> list[Path]:
    """A raiz do workspace e seus submódulos.

    Mesmo motivo do `recency.py`: `git status` no pai reporta o submódulo como UMA entrada
    (`core/oracle`), nunca os arquivos dentro dele. Sem passar em cada submódulo, editar
    `core/oracle/Makefile` não acenderia anel nenhum.
    """
    root = config.get("AGENT_CWD")
    if not root:
        return []
    base = Path(root).resolve()
    if not (base / ".git").exists():
        return []

    roots = [base]
    try:
        out = subprocess.run(
            ["git", "-C", str(base), "config", "--file", ".gitmodules", "--get-regexp", r"\.path$"],
            capture_output=True, text=True, timeout=15,
        ).stdout
        for line in out.splitlines():
            parts = line.split()
            if len(parts) == 2 and (base / parts[1]).is_dir():
                roots.append(base / parts[1])
    except (OSError, subprocess.SubprocessError) as e:
        logger.warning(f"não li .gitmodules: {e}")
    return roots


def _status(git_root: Path, prefix: str) -> dict[str, str]:
    """path (relativo à raiz do workspace) → 'modified' | 'staged' | 'untracked'."""
    try:
        out = subprocess.run(
            ["git", "-C", str(git_root), "status", "--porcelain", "--untracked-files=all"],
            capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        ).stdout
    except (OSError, subprocess.SubprocessError) as e:
        logger.warning(f"git status falhou em {git_root}: {e}")
        return {}

    states: dict[str, str] = {}
    for line in out.splitlines():
        if len(line) < 4:
            continue
        # Formato porcelain v1: dois caracteres de estado, espaço, caminho. A primeira coluna é
        # o índice, a segunda a árvore de trabalho.
        index, worktree, path = line[0], line[1], line[3:].strip().strip('"')
        if " -> " in path:
            # Rename: o que importa para o anel é o destino, que é o arquivo que existe agora.
            path = path.split(" -> ", 1)[1]
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
        base = _roots()
        states: dict[str, str] = {}
        for git_root in base:
            prefix = "" if git_root == base[0] else f"{git_root.relative_to(base[0])}/"
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
    relative = source.split("/", 1)[1] if "/" in source else source
    return table().get(relative)


def annotate(nodes: list[dict]) -> None:
    """Escreve `dirty` em cada nó de arquivo: None quando limpo."""
    states = table()
    if not states:
        for node in nodes:
            if node.get("type") == "file":
                node["dirty"] = None
        return

    for node in nodes:
        if node.get("type") != "file":
            continue
        node["dirty"] = state_of(node.get("source", ""))
