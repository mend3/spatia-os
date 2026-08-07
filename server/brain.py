"""Cérebro do sistema: `claude -p` como subprocesso, traduzido para eventos da UI.

Por que subprocesso e não API: o CLI já *é* um agente com ferramentas — arquivos, busca
web, MCP. Isso muda o que a tela pode ser honesta em mostrar. Um wormhole que abre quando
o agente chama `mcp__...` corresponde a uma chamada real; a cor verde de filesystem
corresponde a um `Read` que aconteceu. Nada de animação decorativa fingindo atividade.

O stream `--output-format stream-json --include-partial-messages` entrega, além do texto:
o raciocínio (`thinking_delta`), cada `tool_use` com argumentos, cada `tool_result`, a
janela de rate limit e o custo final. Cada um desses tem um lugar na HUD.

`--setting-sources ""` é deliberado: sem isso o processo carrega as regras globais do
usuário e os hooks da sessão — 20k tokens de cache e efeitos colaterais que não têm nada
a ver com responder uma pergunta na tela.
"""
import json
import logging
import shutil
import subprocess
import time
from typing import Iterator, Optional

from . import config, permissions

logger = logging.getLogger("espatial.brain")

PERSONA = (
    "Você é o núcleo cognitivo do SpatIA — um observatório espacial de conhecimento. "
    "Responda em português do Brasil: direto, técnico, sem preâmbulo e sem repetir a pergunta. "
    "Você recebe trechos recuperados da memória vetorial do operador, numerados. Cite-os como "
    "[1], [2] quando usar. Se eles não bastarem, use suas ferramentas de leitura e busca. "
    "Se ainda assim não souber, diga em uma frase o que falta — nunca invente. Máximo 8 frases."
)

# Cada ferramenta é uma cor no espaço. O briefing fixou quatro (filesystem verde, github
# azul, database amarelo, browser laranja); as demais famílias ganharam faixa própria para
# não colidir. O cliente lê `kind`, nunca o nome da ferramenta.
TOOL_KINDS = {
    "Read": "filesystem", "Write": "filesystem", "Edit": "filesystem",
    "Glob": "filesystem", "Grep": "filesystem", "NotebookEdit": "filesystem",
    "Bash": "shell", "BashOutput": "shell", "KillShell": "shell",
    "WebSearch": "browser", "WebFetch": "browser",
    "Task": "agent", "Agent": "agent", "SendMessage": "agent",
    "TodoWrite": "planner", "TaskCreate": "planner", "TaskUpdate": "planner",
    "Skill": "planner", "ExitPlanMode": "planner", "EnterPlanMode": "planner",
}

DATABASE_HINTS = ("qdrant", "postgres", "mysql", "neo4j", "graphiti", "sql", "redis")
DETAIL_CHARS = 180
RESULT_CHARS = 220


def kind_of(tool: str) -> str:
    if tool.startswith("mcp__"):
        lowered = tool.lower()
        if any(hint in lowered for hint in DATABASE_HINTS):
            return "database"
        if "github" in lowered or "git" in lowered:
            return "github"
        if "chrome" in lowered or "browser" in lowered or "puppeteer" in lowered:
            return "browser"
        return "mcp"
    return TOOL_KINDS.get(tool, "other")


def available() -> Optional[str]:
    """Caminho do CLI, ou None — o HUD precisa distinguir "sem agente" de "agente falhou"."""
    return shutil.which("claude")


def _command(prompt: str) -> list[str]:
    argv = [
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--append-system-prompt", PERSONA,
        "--max-turns", config.get("AGENT_MAX_TURNS"),
    ]
    # Permissões, skills e agentes vêm do painel (estado persistido), não do `.env`. É o que
    # torna o toggle real: mudar na UI muda o comando da próxima execução.
    argv += permissions.cli_flags()

    allowed = config.get("AGENT_ALLOWED_TOOLS").split()
    if allowed:
        argv += ["--allowedTools", *allowed]
    if config.get("AGENT_MODEL"):
        argv += ["--model", config.get("AGENT_MODEL")]
    if config.get("AGENT_MCP_CONFIG"):
        argv += ["--mcp-config", config.get("AGENT_MCP_CONFIG"), "--strict-mcp-config"]
    return argv


def stream(prompt: str) -> Iterator[dict]:
    """Roda o agente e traduz o stream-json para eventos do SpatIA.

    O processo é encerrado no `finally`: se o browser fechar a conexão SSE, o generator é
    fechado e um `claude` órfão continuaria queimando a janela de uso do usuário.
    """
    if not available():
        yield {"t": "error", "service": "claude", "message": "CLI `claude` não encontrado no PATH"}
        return

    argv = _command(prompt)
    logger.info(f"agente: {' '.join(argv[:6])} … ({len(prompt)} chars de prompt)")
    started = time.monotonic()

    process = subprocess.Popen(
        argv,
        cwd=config.get("AGENT_CWD") or str(config.ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    tool_names: dict[str, str] = {}
    try:
        for raw in process.stdout:
            line = raw.strip()
            if not line:
                continue
            try:
                frame = json.loads(line)
            except json.JSONDecodeError:
                continue
            yield from _translate(frame, tool_names, started)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        stderr = (process.stderr.read() or "").strip() if process.stderr else ""
        if process.returncode not in (0, None) and stderr:
            logger.warning(f"agente saiu {process.returncode}: {stderr[:400]}")


def _translate(frame: dict, tool_names: dict[str, str], started: float) -> Iterator[dict]:
    kind = frame.get("type")

    if kind == "system":
        yield from _system(frame)
    elif kind == "stream_event":
        yield from _stream_event(frame.get("event") or {}, tool_names)
    elif kind == "assistant":
        yield from _assistant(frame, tool_names)
    elif kind == "user":
        yield from _tool_results(frame, tool_names)
    elif kind == "rate_limit_event":
        info = frame.get("rate_limit_info") or {}
        yield {
            "t": "limit",
            "status": info.get("status"),
            "window": info.get("rateLimitType"),
            "resets_at": info.get("resetsAt"),
        }
    elif kind == "result":
        yield from _result(frame, started)


def _system(frame: dict) -> Iterator[dict]:
    subtype = frame.get("subtype")
    if subtype == "init":
        yield {
            "t": "brain",
            "phase": "init",
            "session": frame.get("session_id"),
            "cwd": frame.get("cwd"),
            "model": frame.get("model"),
            "tools": len(frame.get("tools") or []),
            "mcp": [server.get("name") for server in (frame.get("mcp_servers") or [])],
        }
    elif subtype == "thinking_tokens":
        yield {"t": "cogload", "tokens": frame.get("estimated_tokens", 0)}


def _stream_event(event: dict, tool_names: dict[str, str]) -> Iterator[dict]:
    kind = event.get("type")

    if kind == "content_block_start":
        block = event.get("content_block") or {}
        if block.get("type") == "thinking":
            yield {"t": "state", "state": "thinking", "label": "RACIOCINANDO"}
        elif block.get("type") == "text":
            yield {"t": "state", "state": "answering", "label": "SINTETIZANDO"}
        elif block.get("type") == "tool_use":
            name = block.get("name", "?")
            tool_names[block.get("id", "")] = name
            yield {
                "t": "tool",
                "phase": "call",
                "id": block.get("id"),
                "tool": name,
                "kind": kind_of(name),
            }
        return

    if kind == "content_block_delta":
        delta = event.get("delta") or {}
        if delta.get("type") == "text_delta":
            yield {"t": "token", "text": delta.get("text", "")}
        elif delta.get("type") == "thinking_delta":
            yield {"t": "thought", "text": delta.get("thinking", "")}


def _assistant(frame: dict, tool_names: dict[str, str]) -> Iterator[dict]:
    """A mensagem completa traz os argumentos da ferramenta já montados (o stream só tem
    fragmentos de JSON). É daqui que sai o texto que a HUD mostra ao lado do wormhole."""
    for block in (frame.get("message") or {}).get("content") or []:
        if block.get("type") != "tool_use":
            continue
        name = block.get("name", "?")
        tool_names[block.get("id", "")] = name
        yield {
            "t": "tool",
            "phase": "args",
            "id": block.get("id"),
            "tool": name,
            "kind": kind_of(name),
            "detail": _describe(block.get("input") or {}),
        }


def _tool_results(frame: dict, tool_names: dict[str, str]) -> Iterator[dict]:
    for block in (frame.get("message") or {}).get("content") or []:
        if block.get("type") != "tool_result":
            continue
        tool_id = block.get("tool_use_id", "")
        content = block.get("content")
        if isinstance(content, list):
            content = " ".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        yield {
            "t": "tool",
            "phase": "result",
            "id": tool_id,
            "tool": tool_names.get(tool_id, "?"),
            "kind": kind_of(tool_names.get(tool_id, "")),
            "ok": not block.get("is_error"),
            "detail": str(content or "").strip().replace("\n", " ")[:RESULT_CHARS],
        }


def _result(frame: dict, started: float) -> Iterator[dict]:
    usage = frame.get("usage") or {}
    if frame.get("is_error"):
        yield {
            "t": "error",
            "service": "claude",
            "message": str(frame.get("result") or frame.get("subtype") or "falha do agente"),
        }
        yield {"t": "state", "state": "error", "label": "FALHA DO NÚCLEO"}
        return
    yield {
        "t": "answer",
        "text": (frame.get("result") or "").strip(),
        "ms": round((time.monotonic() - started) * 1000),
        "api_ms": frame.get("duration_api_ms"),
        "turns": frame.get("num_turns"),
        "cost_usd": frame.get("total_cost_usd"),
        "tokens": {
            "in": usage.get("input_tokens", 0),
            "out": usage.get("output_tokens", 0),
            "cache_read": usage.get("cache_read_input_tokens", 0),
        },
    }
    yield {"t": "state", "state": "idle", "label": "OCIOSO"}


def _describe(payload: dict) -> str:
    """Resumo de uma linha dos argumentos — o que cabe numa HUD monoespaçada."""
    for key in ("pattern", "file_path", "path", "query", "command", "url", "prompt", "description"):
        if payload.get(key):
            return f"{key}={str(payload[key])[:DETAIL_CHARS]}"
    return json.dumps(payload, ensure_ascii=False)[:DETAIL_CHARS]
