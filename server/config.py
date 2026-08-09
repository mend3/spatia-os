"""Configuração do SpatIA: defaults que casam com a infra local + override por `.env`.

Este projeto é deliberadamente desacoplado do workspace onde nasceu: ele conhece a infra
apenas por *convenção de rede* (Qdrant e Ollama em localhost) e por *convenção de payload*
(coleção com vetor denso nomeado `fast-<modelo>` + vetor esparso `bm25`). Nada de importar
código de outro repo — se o nome da coleção mudar, muda uma linha aqui.
"""
import os
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent

# Nomes canônicos das variáveis, com o default de desenvolvimento ao lado.
DEFAULTS = {
    "ESPATIAL_HOST": "127.0.0.1",
    "ESPATIAL_PORT": "8787",
    "QDRANT_URL": "http://localhost:6333",
    # ⚠️ **VAZIO DE PROPÓSITO — corpus não tem default.** Ele valia `workspace_embedding`, que é a
    # coleção de UMA máquina, e isso contradiz o princípio declarado três linhas abaixo para o
    # Neo4j: sem valor, a sonda diz "nunca configurado" em vez de tentar e acertar outro alvo.
    #
    # Um default de corpus não falha: ele monta um céu inteiro, com convicção total, sobre um
    # índice que não é o do operador. Foi o modo de falha que mordeu duas vezes em 2026-08-08 —
    # uma pela variável exportada no perfil do shell, outra por este default.
    "QDRANT_COLLECTION": "",
    "EMBED_MODEL": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    "SPARSE_MODEL": "Qdrant/bm25",
    "OLLAMA_URL": "http://localhost:11434",
    "OLLAMA_MODEL": "gpt-oss:20b",
    "NEO4J_HTTP": "http://localhost:7474",
    # Vazios de propósito: sem eles a sonda reporta "nunca configurado" em vez de tentar e falhar.
    # O Neo4j é a única dependência OPCIONAL que faz parte da hierarquia quando ativa.
    "NEO4J_USER": "",
    "NEO4J_PASSWORD": "",
    # TTS global do oracle (shared/speech.compose.yml). Kokoro, API OpenAI-compatível.
    "TTS_URL": "http://localhost:8880",
    "TTS_MODEL": "kokoro",
    # `pf_` = português do Brasil, feminino. O motor tem 67 vozes; /api/health lista.
    "TTS_VOICE": "pf_dora",
    # Cérebro: `claude` roda o CLI como subprocesso (ferramentas reais, custa da assinatura);
    # `ollama` responde local e de graça, mas sem ferramenta nenhuma.
    "BRAIN": "claude",
    # Segmento-recipiente a podar do `source` do índice (ver `qdrant.strip_prefix`). Vazio =
    # nada a podar, que é o caso de um índice cujo primeiro segmento já é o sistema. Vale um
    # valor aqui quando o índice publica tudo dentro de um recipiente (ex.: `vault/`), porque
    # esse segmento desloca a convenção "primeiro segmento é a raiz" de que o resto depende.
    "CORPUS_PREFIX": "",
    # Onde o agente enxerga arquivos. O default é o próprio projeto — apontar para o
    # workspace de conhecimento é escolha explícita, porque o agente lê o que estiver lá.
    "AGENT_CWD": "",
    "AGENT_MODEL": "",
    "AGENT_MAX_TURNS": "10",
    # Teto de custo por dia e execuções simultâneas. `0` = sem teto, e é o default porque um
    # limite inventado aqui apareceria como recusa sem ninguém ter pedido. O gasto vem do
    # diário, em disco: um contador em memória zeraria no restart e o teto se apagaria sozinho.
    "AGENT_MAX_DAILY_USD": "0",
    "AGENT_MAX_CONCURRENT": "0",
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


# Chaves que o `.env` DECLAROU, mesmo que com valor vazio. Ver `get`.
_DECLARADAS: set[str] = set()


def _load_env_file(path: Path) -> None:
    """Carrega o `.env` SOBRESCREVENDO o ambiente.

    **A hierarquia é arquivo > ambiente, e ela é decisão.** O arquivo é o que está mais
    atualizado e o que continua respondendo quando o resto não está: ambiente fora do ar não
    impede o arquivo de existir. Ambiente é o mais fraco dos três porque é o único que ninguém
    consegue ler depois — some com a sessão do shell e não deixa registro.

    ⚠️ Era `setdefault`, e o efeito era o oposto do que a docstring deste módulo já prometia
    ("override por `.env`"): com `AGENT_CWD` exportado no perfil do shell, editar o `.env` e
    reiniciar o servidor NÃO mudava nada. O sintoma é o pior tipo — o `.env` diz uma coisa, a
    tela mostra outra, e nada acusa: medido em 2026-08-07, apontar o `.env` para o corpus de
    teste deixou o servidor no corpus real, com o `/api/dirty` respondendo a raiz antiga.

    Consequência a saber: `VAR=x ./serve.py` deixa de vencer o arquivo. Para um valor de uma
    execução só, tire a chave do `.env` — ausência é o que devolve a palavra ao ambiente.
    """
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        os.environ[key] = value.strip().strip("'\"")
        _DECLARADAS.add(key)


_load_env_file(ROOT / ".env")


def get(key: str) -> str:
    """Valor efetivo: ambiente (já sobrescrito pelo arquivo) e, na ausência, o default.

    ⚠️ **Declarado VAZIO no arquivo é ESCOLHA, não ausência.** `CORPUS_PREFIX=` significa "sem
    prefixo", e cair no default aqui apontaria o céu para caminhos que não existem no corpus
    escolhido — sem erro, com o sintoma de "nenhum arquivo casa" que já custou uma sessão.
    """
    value = os.environ.get(key)
    if value:
        return value
    if key in _DECLARADAS:
        return ""
    return DEFAULTS.get(key, "")


def get_int(key: str) -> int:
    return int(get(key))


def vector_name(model: str) -> str:
    """Mesma regra do FastEmbedProvider do mcp-server-qdrant: `fast-<último segmento>`.

    É o acoplamento silencioso do sistema: nome divergente devolve resultado vazio
    em vez de erro, então ele vive numa função só, ao lado de quem o consome.
    """
    return f"fast-{model.split('/')[-1].lower()}"


SPARSE_VECTOR_NAME = "bm25"


def agent_dir() -> Optional[Path]:
    """`AGENT_CWD/.claude`, quando existe.

    É onde as configurações do agente já moram: `catalog.py` descobre skills e agentes ali, e as
    `setting_sources` do CLI leem dali. Tudo que este servidor escreve PARA o agente vai para o
    mesmo lugar — escrever num diretório nosso criaria uma segunda casa de configuração do
    agente, e o operador teria de saber que existem duas.

    `None` quando o diretório não existe: nesse caso não há convenção a respeitar, e o chamador
    cai no `.cache/` do próprio servidor.
    """
    raiz = get("AGENT_CWD")
    if not raiz:
        return None
    caminho = Path(raiz) / ".claude"
    return caminho if caminho.is_dir() else None


def vault_path() -> Optional[Path]:
    """O vault do Obsidian, quando existe — a SEGUNDA raiz do corpus.

    `AGENT_CWD` é o workspace do agente e existe sempre; o vault é integração e pode não existir
    nesta máquina. Por isso ele é `Optional` e nunca obrigatório: o servidor tem de subir e ler
    arquivo num ambiente sem Obsidian nenhum.

    O default (`$HOME/vault`) é o mesmo caminho que o `CLAUDE.md` do workspace declara como
    `VAULT_PATH`. `None` quando o diretório não existe, para o chamador poder dizer "não há vault
    aqui" em vez de reportar um caminho que nunca teve chance.
    """
    declarado = get("VAULT_PATH")
    caminho = Path(declarado).expanduser() if declarado else Path.home() / "vault"
    return caminho if caminho.is_dir() else None


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
