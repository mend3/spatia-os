"""Configuração do espatial-os: defaults que casam com a infra local + override por `.env`.

Este projeto é deliberadamente desacoplado do workspace onde nasceu: ele conhece a infra
apenas por *convenção de rede* (Qdrant e Ollama em localhost) e por *convenção de payload*
(coleção com vetor denso nomeado `fast-<modelo>` + vetor esparso `bm25`). Nada de importar
código de outro repo — se o nome da coleção mudar, muda uma linha aqui.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Nomes canônicos das variáveis, com o default de desenvolvimento ao lado.
DEFAULTS = {
    "ESPATIAL_HOST": "127.0.0.1",
    "ESPATIAL_PORT": "8787",
    "QDRANT_URL": "http://localhost:6333",
    "QDRANT_COLLECTION": "workspace_embedding",
    "EMBED_MODEL": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    "SPARSE_MODEL": "Qdrant/bm25",
    "OLLAMA_URL": "http://localhost:11434",
    "OLLAMA_MODEL": "gpt-oss:20b",
    "NEO4J_HTTP": "http://localhost:7474",
    # TTS global do oracle (shared/speech.compose.yml). Kokoro, API OpenAI-compatível.
    "TTS_URL": "http://localhost:8880",
    "TTS_MODEL": "kokoro",
    # `pf_` = português do Brasil, feminino. O motor tem 67 vozes; /api/health lista.
    "TTS_VOICE": "pf_dora",
    # Cérebro: `claude` roda o CLI como subprocesso (ferramentas reais, custa da assinatura);
    # `ollama` responde local e de graça, mas sem ferramenta nenhuma.
    "BRAIN": "claude",
    # Onde o agente enxerga arquivos. O default é o próprio projeto — apontar para o
    # workspace de conhecimento é escolha explícita, porque o agente lê o que estiver lá.
    "AGENT_CWD": "",
    "AGENT_MODEL": "",
    "AGENT_MAX_TURNS": "10",
    # Só leitura por default: a UI é um observatório, não um editor.
    "AGENT_ALLOWED_TOOLS": "Read Glob Grep WebSearch WebFetch",
    "AGENT_PERMISSION_MODE": "dontAsk",
    # Vazio = ignora settings do usuário/projeto (sem hooks, sem 20k tokens de regras).
    "AGENT_SETTING_SOURCES": "",
    "AGENT_MCP_CONFIG": "",
    # Raízes que o leitor de arquivos aceita servir. Vazio = só o próprio projeto.
    "FILE_ROOTS": "",
    # Diretório inicial do app de Arquivos. Vazio = a raiz com mais arquivos do corpus.
    "FILES_ROOT": "",
    # O SearXNG é global no oracle e NÃO usa chave, então tem default: o loopback dele.
    # Presença de variável não é prova de disponibilidade aqui — a checagem sonda de verdade.
    "SEARXNG_URL": "http://localhost:8888",
    "BRAVE_API_KEY": "",
    "SERPAPI_API_KEY": "",
}


def _load_env_file(path: Path) -> None:
    """Popula o ambiente com o `.env` sem sobrescrever quem já veio de fora."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_env_file(ROOT / ".env")


def get(key: str) -> str:
    return os.environ.get(key) or DEFAULTS.get(key, "")


def get_int(key: str) -> int:
    return int(get(key))


def vector_name(model: str) -> str:
    """Mesma regra do FastEmbedProvider do mcp-server-qdrant: `fast-<último segmento>`.

    É o acoplamento silencioso do sistema: nome divergente devolve resultado vazio
    em vez de erro, então ele vive numa função só, ao lado de quem o consome.
    """
    return f"fast-{model.split('/')[-1].lower()}"


SPARSE_VECTOR_NAME = "bm25"


def file_roots() -> list[Path]:
    """Diretórios cujo conteúdo o leitor de arquivos pode devolver ao browser.

    O default é só o projeto: qualquer coisa além disso é escolha explícita do dono da
    máquina, porque a UI expõe o conteúdo lido para quem abrir a página.
    """
    roots = [ROOT]
    # A raiz do AGENTE também, e a razão é que ela é o corpus.
    #
    # Sem ela o leitor de arquivo não alcançava NENHUM arquivo indexado — a rota tinha zero
    # chamadores justamente por isso. E não é ampliação de superfície: `/api/node` já devolve o
    # conteúdo desses mesmos arquivos, só que na versão de quando foram indexados. Negar o
    # disco e servir o índice não protege nada; só faz a tela mostrar texto velho sem avisar.
    agent_cwd = get("AGENT_CWD")
    if agent_cwd:
        roots.append(Path(agent_cwd).expanduser().resolve())
    for entry in get("FILE_ROOTS").split(":"):
        entry = entry.strip()
        if entry:
            roots.append(Path(entry).expanduser().resolve())
    return roots
