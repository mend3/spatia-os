"""Capacidade = (verbo, escopo, limite), e o portão que a torna real.

Uma lista de nomes negados (`--disallowedTools Read`) não é autoridade. `Read` com `AGENT_CWD` no
projeto e `Read` com `AGENT_CWD` no workspace inteiro são a MESMA marca de seleção e duas
autoridades separadas por ordens de magnitude. `mcp__*` não aparece na lista de ferramentas e é o
que o sistema tem de mais poderoso. E nada tem limite quantitativo: permitida é permitida N vezes.

⚠️ **A parte honesta: o CLI só aceita NOMES, não escopos.** A capacidade se materializa por dois
caminhos, e confundi-los é vender sandbox que não existe:

- **O que o CLI aceita** — `--allowedTools`/`--disallowedTools`, `AGENT_CWD` como raiz, e
  `--mcp-config` + `--strict-mcp-config`. Isso é prevenção real, aplicada ANTES de o processo
  existir.
- **O que o CLI não aceita** — escopo e limite. Para isso existe este portão: um hook
  `PreToolUse` numa `--settings` efêmera consulta `/api/gate` antes de CADA chamada. O servidor
  decide por capacidade, responde permitir ou negar, e grava a decisão no diário.

⚠️ **Interceptar depois NÃO vale.** O `recorder` já vê `tool.args` em tempo real e poderia matar
o subprocesso ao ver uma violação — mas nesse ponto o `Read` já aconteceu. Interceptação a
posteriori é detecção; chamá-la de controle é a mentira que o painel de permissões existe para
não contar. Por isso o portão é `PreToolUse` e não o stream.
"""
import fnmatch
import json
import logging
import os
import shutil
import threading
from typing import Optional

from . import config, journal

logger = logging.getLogger("espatial.capabilities")

def _paths() -> list:
    """Onde procurar as capacidades, na ordem.

    O `.claude/` do `AGENT_CWD` vem PRIMEIRO: a política é sobre o que o agente pode fazer
    NAQUELE workspace, então ela viaja com o workspace. Trocar `AGENT_CWD` troca a política junto,
    do mesmo jeito que já troca o catálogo de skills — e uma política que ficasse aqui seguiria
    valendo para um workspace que ela nunca viu.
    """
    agente = config.agent_dir()
    return ([agente / "spatia" / "capabilities.json"] if agente else []) + [
        config.ROOT / "config" / "capabilities.json"
    ]


def active_path():
    """O arquivo em vigor, ou o primeiro candidato quando nenhum existe — "onde declaro isso" é
    pergunta de tela e a resposta não pode ser uma lista."""
    for caminho in _paths():
        if caminho.is_file():
            return caminho
    return _paths()[0]

_lock = threading.Lock()
# Contagem por EXECUÇÃO. A chave é o `run` que o hook manda de volta; sem ela um limite
# `calls_per_run` seria global e o segundo pedido do dia já esbarraria no teto do primeiro.
#
# ☠️ **Ela não pode ser o `session_id` do CLI, e a diferença só aparece com `--resume`.** O CLI
# devolve o MESMO `session_id` em toda retomada de um fio, então contar por ele transformaria
# `calls_per_run` em `calls_per_fio` — um teto de 3 leituras viraria 3 para a conversa inteira, e
# depois disso o portão negaria tudo. Pior no sentido oposto: `release()` recebe a chave da
# execução, então a contagem por sessão nunca era liberada e `_calls` crescia para sempre.
_calls: dict[str, dict[str, int]] = {}
_cache: Optional[list] = None


def load() -> list:
    """As capacidades declaradas. Sem arquivo, lista vazia — e lista vazia é PERMITIR TUDO,
    dito em voz alta por `describe()`: um portão que nega por omissão travaria o sistema no
    primeiro boot de quem nunca ouviu falar dele."""
    global _cache
    if _cache is not None:
        return _cache
    _cache = []
    caminho = active_path()
    if not caminho.is_file():
        return _cache
    try:
        raw = json.loads(caminho.read_text(encoding="utf-8"))
        _cache = raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError) as error:
        logger.error(f"capabilities.json ilegível: {error}")
    return _cache


def _matches(capability: dict, tool: str) -> bool:
    """`verb` aceita `|` para alternativas e `*` para família (`mcp__hub-board__*`)."""
    return any(fnmatch.fnmatch(tool, padrao.strip()) for padrao in capability.get("verb", "").split("|"))


def _in_scope(capability: dict, target: str) -> bool:
    """Escopo vazio = sem restrição de alvo. O alvo é caminho ou host, conforme o verbo."""
    escopos = capability.get("scope") or []
    if not escopos:
        return True
    if not target:
        # Alvo desconhecido com escopo declarado é NEGADO. Deixar passar tornaria o escopo
        # contornável por omissão — bastaria o hook não mandar o argumento.
        return False
    expandido = [os.path.expandvars(item) for item in escopos]
    return any(target == item or target.startswith(item.rstrip("/") + "/") or fnmatch.fnmatch(target, item)
               for item in expandido)


def decide(run: str, tool: str, target: str = "") -> dict:
    """Permitir ou negar, com o motivo. Toda NEGAÇÃO vira linha no diário.

    `run` é a chave da EXECUÇÃO — a que `settings_file` carimbou no hook —, nunca a sessão do CLI.
    """
    capacidades = load()
    if not capacidades:
        return {"allow": True, "reason": "nenhuma capacidade declarada"}

    aplicaveis = [item for item in capacidades if _matches(item, tool)]
    if not aplicaveis:
        # Com capacidades declaradas, o que não está nomeado NÃO passa. É a REGRA DO CATÁLOGO
        # desta base: nomear o que se aceita, nunca excluir o que não se aceita.
        motivo = f"{tool} não está em nenhuma capacidade declarada"
        journal.denial("gate", run or "?", motivo)
        return {"allow": False, "reason": motivo}

    for capability in aplicaveis:
        if not _in_scope(capability, target):
            continue
        limite = (capability.get("limit") or {}).get("calls_per_run")
        if limite:
            with _lock:
                usados = _calls.setdefault(run, {})
                if usados.get(capability["id"], 0) >= int(limite):
                    motivo = f"{capability['id']}: teto de {limite} chamadas nesta execução"
                    journal.denial("gate", run or "?", motivo)
                    return {"allow": False, "reason": motivo}
                usados[capability["id"]] = usados.get(capability["id"], 0) + 1
        return {"allow": True, "reason": capability["id"]}

    motivo = f"{tool} fora do escopo declarado: {target or '(alvo não informado)'}"
    journal.denial("gate", run or "?", motivo)
    return {"allow": False, "reason": motivo}


def release(run: str) -> None:
    """Solta a contagem de uma execução que terminou — senão `calls_per_run` viraria por-processo."""
    with _lock:
        _calls.pop(run, None)


def enforceable() -> bool:
    """O hook depende de `jq` e `curl` no PATH do CLI.

    ⚠️ Sem eles o comando falha, o `|| echo '{}'` deixa passar, e o portão fica INERTE EM
    SILÊNCIO — capacidades declaradas na tela e nenhuma decisão acontecendo. É a quinta linha
    da tabela da REGRA DO CATÁLOGO outra vez, e num controle de segurança ela custa mais caro:
    por isso a ausência é reportada em vez de descoberta.
    """
    return bool(shutil.which("jq")) and bool(shutil.which("curl"))


def describe() -> dict:
    capacidades = load()
    return {
        "path": str(active_path()),
        "searched": [str(item) for item in _paths()],
        "declared": bool(capacidades),
        "enforceable": enforceable(),
        "missing_tools": [nome for nome in ("jq", "curl") if not shutil.which(nome)],
        # A frase importa: sem capacidades o portão PERMITE, e a tela tem de dizer isso em vez
        # de exibir uma lista vazia que pareceria "nada é permitido".
        "effect": (
            "todas as chamadas passam"
            if not capacidades
            else "só o que está declarado passa"
            if enforceable()
            else "DECLARADO E NÃO APLICADO — falta jq/curl no PATH"
        ),
        "capabilities": capacidades,
        # Execuções com contagem viva. Fica em `sessions` porque é o nome que a tela já lê; o que
        # ele conta é execução, e ele volta a zero quando elas terminam.
        "sessions": len(_calls),
    }


def settings_file(run: str) -> Optional[str]:
    """Escreve uma `--settings` efêmera com o hook `PreToolUse` apontando para `/api/gate`.

    Devolve `None` quando não há capacidade declarada: instalar um hook que sempre permite só
    acrescentaria uma requisição por chamada de ferramenta, e latência sem decisão é custo puro.

    ⚠️ O comando é `curl` porque o hook roda no ambiente do CLI e não pode depender de nada
    deste projeto estar no PATH dele. Falha de rede aqui NÃO bloqueia: um portão que trava o
    agente quando o próprio servidor engasga transformaria uma indisponibilidade em paralisia —
    e a decisão de negar tem de ser uma decisão, não um efeito colateral de timeout.

    ⭑ **O `run` é CARIMBADO no comando, não lido do payload do hook.** O CLI só sabe dizer qual é
    a sessão, e a sessão é a mesma em toda a retomada de um fio; quem sabe onde uma execução
    começa e termina é este servidor, que escreve esta settings uma vez por execução. Carimbar o
    fato aqui é o que mantém `calls_per_run` sendo por execução depois do `--resume`.

    Ele entra num literal de `jq` entre aspas simples e é sempre dígitos (`brain._executar`), então
    não há como escapar da string.
    """
    if not load():
        return None

    porta = config.get_int("ESPATIAL_PORT")
    chave = "".join(char for char in run if char.isdigit()) or "0"
    comando = (
        f"jq -c '{{run: \"{chave}\", session_id: .session_id, tool: .tool_name, target: "
        "(.tool_input.file_path // .tool_input.path // .tool_input.url // \"\")}' "
        f"| curl -sS -m 5 -X POST -H 'Content-Type: application/json' -H 'Sec-Fetch-Site: same-origin' "
        f"--data-binary @- http://127.0.0.1:{porta}/api/gate || echo '{{}}'"
    )
    payload = {
        "hooks": {
            "PreToolUse": [
                {"matcher": "*", "hooks": [{"type": "command", "command": comando, "timeout": 10}]}
            ]
        }
    }
    # A settings efêmera vai para o `.claude/` do agente quando ele existe: é o diretório de
    # configuração DELE, e é lá que quem for depurar vai procurar. `.cache/` daqui é o fallback
    # de quem não tem `AGENT_CWD` configurado.
    agente = config.agent_dir()
    base = (agente / "spatia") if agente else (config.ROOT / ".cache")
    destino = base / f"gate-{chave}.json"
    try:
        destino.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(destino, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
        return str(destino)
    except OSError as error:
        logger.error(f"não escrevi a settings do portão: {error}")
        return None


def drop_settings(path: Optional[str]) -> None:
    """Apaga a settings efêmera. Sem isso `.cache/` acumularia um arquivo por execução."""
    if not path:
        return
    try:
        os.unlink(path)
    except OSError:
        pass
