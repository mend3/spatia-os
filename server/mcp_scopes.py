"""Inventário de servidores MCP por escopo — só NOMES, nunca credenciais.

Existe porque o painel de MCP mentia por omissão. Ele listava o que o agente reporta no evento
`brain` e não tinha como dizer que `hub-board` faltava porque a *fonte de settings* dele estava
desligada. Num painel de capacidade, omissão silenciosa é o defeito — não a ausência do servidor.

⚠️ `~/.claude.json` guarda o `env` de cada servidor, e é ali que moram tokens. Este módulo lê
o dicionário `mcpServers` e devolve **a chave e o campo `type`**, nada mais. Nenhum valor de
`env`, `args` ou `command` sai daqui: nem para a tela, nem para o `.cache`, nem para um arquivo
de `--mcp-config`.

**Os três escopos e onde cada um mora** (medido nesta instalação, não deduzido da doc):

| Escopo | Arquivo | O que traz |
|---|---|---|
| `project` | `<AGENT_CWD>/.mcp.json` | versionado; precisa de aprovação em `enabledMcpjsonServers` |
| `local` | `~/.claude.json` → `projects[<AGENT_CWD>].mcpServers` | só desta máquina, para este repo |
| `user` | `~/.claude.json` → `mcpServers` (topo) | global do usuário |

O escopo que faltava era o **`local`**, não o `user`: `claude mcp add` sem `--scope` grava no
`projects[<cwd>]` do `~/.claude.json`, e `--setting-sources project` não o alcança. Confundir os
dois custa caro — ver a tabela de custo em `permissions.SETTING_SOURCES`.

**O inventário é incompleto por construção, e diz isso.** Com `--setting-sources project` o
agente reportou 5 servidores; 4 deles (`claude.ai Slack`, `higgsfield`, `Google Drive`, `Notion`)
não estão em arquivo nenhum que este módulo leia — são conectores da conta. Então a tela separa
"declarado em arquivo" (o que se pode auditar aqui) do "reportado pelo agente" (a verdade da
sessão), em vez de fingir que a primeira lista explica a segunda.
"""
import json
import logging
from pathlib import Path

from . import config

logger = logging.getLogger("espatial.mcp")

USER_CONFIG = Path.home() / ".claude.json"

SCOPE_LABELS = {
    "project": ("PROJETO", ".mcp.json do repo · versionado"),
    "local": ("LOCAL", "~/.claude.json · só desta máquina"),
    "user": ("USUÁRIO", "~/.claude.json · global"),
}


def _agent_root() -> Path:
    return Path(config.get("CORPUS_ROOT") or config.ROOT)


def _read_json(path: Path) -> dict:
    """Lê JSON e devolve `{}` em qualquer falha — mas registra o motivo.

    Arquivo ausente é normal (nem toda instalação tem `.mcp.json`); arquivo ilegível não é, e
    silêncio aqui produziria exatamente a omissão que este módulo existe para acabar.
    """
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        logger.warning(f"{path} ilegível ({e}) — o inventário de MCP sai incompleto")
        return {}


def _names(servers: object) -> list[dict]:
    """Só a chave e o `type`. É o filtro que impede um token de vazar para a tela."""
    if not isinstance(servers, dict):
        return []
    return [
        {"name": name, "transport": str((spec or {}).get("type") or "stdio")}
        for name, spec in sorted(servers.items())
        if isinstance(spec, dict) or spec is None
    ]


def declared() -> dict[str, list[dict]]:
    """Escopo → servidores declarados em arquivo, com o nome e o transporte."""
    root = _agent_root()

    project = _names(_read_json(root / ".mcp.json").get("mcpServers"))
    # Servidor de `.mcp.json` só sobe depois de aprovado — sem isso ele está declarado e
    # inerte, que é um terceiro estado, não "ligado".
    approved = set(_read_json(root / ".claude" / "settings.json").get("enabledMcpjsonServers") or [])
    for entry in project:
        entry["approved"] = entry["name"] in approved

    user_config = _read_json(USER_CONFIG)
    projects = user_config.get("projects")
    project_entry = (projects or {}).get(str(root)) if isinstance(projects, dict) else None
    local = _names((project_entry or {}).get("mcpServers"))
    user = _names(user_config.get("mcpServers"))

    return {"project": project, "local": local, "user": user}


def snapshot(active_sources: list[str]) -> dict:
    """O que a tela desenha: por escopo, quem está dentro e quem está de fora, e por quê."""
    table = declared()
    active = set(active_sources)

    scopes = []
    excluded = []
    for scope, servers in table.items():
        label, where = SCOPE_LABELS[scope]
        loaded = scope in active
        scopes.append({
            "id": scope,
            "label": label,
            "where": where,
            "loaded": loaded,
            "servers": servers,
        })
        for entry in servers:
            if not loaded:
                excluded.append({
                    "name": entry["name"],
                    "scope": scope,
                    "reason": f"a fonte de settings `{scope}` está desligada",
                })
            elif entry.get("approved") is False:
                excluded.append({
                    "name": entry["name"],
                    "scope": scope,
                    "reason": "declarado no .mcp.json mas fora de `enabledMcpjsonServers`",
                })

    return {
        "root": str(_agent_root()),
        "scopes": scopes,
        "excluded": excluded,
        # A tela precisa saber que esta lista não é o total, senão volta a omitir em silêncio.
        "partial": True,
    }
