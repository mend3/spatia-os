"""Permissões, skills e agentes ativos — o estado que a UI edita e o `brain` obedece.

Regra que este módulo existe para respeitar: **todo toggle tem que virar flag real**. Um
interruptor que não muda o comando executado é pior que nenhum interruptor, porque o operador
passa a acreditar num controle que não controla nada.

O que é aplicável e como:

| Toggle | Vira |
|---|---|
| ferramenta desligada | `--disallowedTools Nome` |
| modo de permissão | `--permission-mode <modo>` |
| carregar config do repo | `--setting-sources project` |
| skill desligada | `--disallowedTools "Skill(nome)"` |
| agente desligado | `--disallowedTools "Task(nome)"` |
| todas as skills desligadas | `--disable-slash-commands` |

⚠️ Uma consequência que não dá para separar: skills e agentes do repo só existem para a
sessão se as *settings do projeto* forem carregadas — e isso traz os **hooks do projeto**
junto. Não há flag para carregar skills sem hooks. O painel diz isso em vez de fingir que são
duas coisas independentes.
"""
import json
import logging
import threading
from pathlib import Path

from . import catalog, config

logger = logging.getLogger("espatial.permissions")

STORE = config.ROOT / ".cache" / "config.json"

# As ferramentas que valem um interruptor. Não é a lista completa do CLI de propósito: um
# painel com 80 toggles não é configuração, é inventário.
TOOLS = [
    ("Read", "ler arquivo", "filesystem"),
    ("Glob", "listar por padrão", "filesystem"),
    ("Grep", "buscar conteúdo", "filesystem"),
    ("Write", "criar arquivo", "filesystem"),
    ("Edit", "editar arquivo", "filesystem"),
    ("Bash", "executar comando", "shell"),
    ("WebSearch", "buscar na web", "browser"),
    ("WebFetch", "ler página", "browser"),
    ("Task", "delegar a subagente", "agent"),
    ("Skill", "invocar skill", "planner"),
    ("TodoWrite", "lista de tarefas", "planner"),
]

MODES = ["bypassPermissions", "acceptEdits", "dontAsk", "default", "plan"]

# Modo de recuperação: para onde o estado cai quando a config no disco está ilegível.
# `plan` é o menor privilégio que o CLI oferece — o agente raciocina e não executa nada.
RECOVERY_MODE = "plan"

_lock = threading.Lock()
_state: dict | None = None


def _defaults() -> dict:
    return {
        "mode": config.get("AGENT_PERMISSION_MODE") or "bypassPermissions",
        "load_repo_config": True,
        # Ausente = ligado. Só o que o operador desligou é registrado, então skill nova no
        # repo já nasce ativa em vez de aparecer desligada por não estar no arquivo.
        "tools_off": [],
        "skills_off": [],
        "agents_off": [],
        # Marca que este estado veio de recuperação, não de escolha. A UI mostra o aviso; o
        # primeiro `update` do operador o apaga, porque aí houve escolha.
        "recovered": False,
    }


def load() -> dict:
    """Estado atual, do cache em memória, do disco, ou do default.

    ⚠️ O caminho de recuperação **não** pode usar o default.

    Primeira execução e config corrompida não são a mesma situação. Sem config, o default do
    `.env` é a intenção declarada do operador. Com config ilegível, o default é o modo mais
    permissivo que a instalação tem (`bypassPermissions`, nesta) — então perder o arquivo
    *concedia mais autoridade* do que o estado perdido tinha, com um `logger.warning` que
    ninguém lê. Falha de leitura tem que degradar para o menor privilégio, e dizer na tela
    que degradou.
    """
    global _state
    with _lock:
        if _state is not None:
            return _state

        state = _defaults()
        if STORE.is_file():
            try:
                stored = json.loads(STORE.read_text(encoding="utf-8"))
                state.update({k: v for k, v in stored.items() if k in state})
            except (OSError, json.JSONDecodeError) as e:
                logger.error(
                    f"config ilegível ({e}) — caindo para o MENOR privilégio ({RECOVERY_MODE}), "
                    "não para o default. Reabra o painel de permissões e reconfigure."
                )
                state = _defaults()
                state["mode"] = RECOVERY_MODE
                state["recovered"] = True
        _state = state
        return state


def update(patch: dict) -> dict:
    global _state
    current = load()
    allowed = set(_defaults())
    merged = {**current, **{k: v for k, v in patch.items() if k in allowed}}

    if merged["mode"] not in MODES:
        merged["mode"] = current["mode"]
    for key in ("tools_off", "skills_off", "agents_off"):
        merged[key] = sorted({str(v) for v in (merged.get(key) or [])})
    merged["load_repo_config"] = bool(merged["load_repo_config"])
    # Qualquer alteração deliberada encerra o estado de recuperação.
    merged["recovered"] = False

    with _lock:
        _state = merged
        try:
            STORE.parent.mkdir(parents=True, exist_ok=True)
            STORE.write_text(json.dumps(merged, indent=1), encoding="utf-8")
        except OSError as e:
            logger.warning(f"não gravei a config: {e}")
    logger.info(
        f"permissões: modo={merged['mode']} · {len(merged['tools_off'])} ferramentas, "
        f"{len(merged['skills_off'])} skills, {len(merged['agents_off'])} agentes desligados"
    )
    return merged


def cli_flags() -> list[str]:
    """Traduz o estado para argumentos do CLI. É aqui que o toggle vira efeito."""
    state = load()
    argv = ["--permission-mode", state["mode"]]

    sources = "project" if state["load_repo_config"] else ""
    argv += ["--setting-sources", sources]

    deny: list[str] = list(state["tools_off"])

    known_skills = {item["id"] for item in catalog.skills()}
    off_skills = [name for name in state["skills_off"] if name in known_skills]
    if known_skills and len(off_skills) == len(known_skills):
        # Todas desligadas: uma flag definitiva é mais barata e menos frágil que N padrões.
        argv.append("--disable-slash-commands")
    else:
        deny += [f"Skill({name})" for name in off_skills]

    known_agents = {item["id"] for item in catalog.agents()}
    deny += [f"Task({name})" for name in state["agents_off"] if name in known_agents]

    if deny:
        argv += ["--disallowedTools", *deny]
    return argv


def describe() -> dict:
    """O que a UI desenha: o catálogo, o estado e o comando que sai disso."""
    state = load()
    return {
        "state": state,
        "modes": MODES,
        "tools": [{"id": name, "label": label, "kind": kind} for name, label, kind in TOOLS],
        "catalog": catalog.snapshot(),
        "flags": cli_flags(),
    }
