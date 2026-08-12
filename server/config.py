"""Configuração do SpatIA: defaults que casam com a infra local + override por `.env`.

Este projeto é deliberadamente desacoplado do workspace onde nasceu: ele conhece a infra
apenas por *convenção de rede* (Qdrant e Ollama em localhost) e por *convenção de payload*
(coleção com vetor denso nomeado `fast-<modelo>` + vetor esparso `bm25`). Nada de importar
código de outro repo — se o nome da coleção mudar, muda uma linha aqui.
"""
import json
import os
from pathlib import Path, PurePosixPath
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
    # ⭑ **A RAIZ DO CORPUS — o diretório que o operador escolhe, e a única que existe.**
    #
    # Ela não presume Obsidian, vault nem qualquer convenção: é a pasta que o SpatIA indexa e
    # serve, e é a ÚNICA raiz: o agente opera nela, o inspetor serve a partir dela, o índice sai
    # dela. ⚠️ Um segundo diretório para "onde o agente opera" faz um arquivo resolver para o
    # homônimo de outra árvore, com a leitura passando.
    #
    # ☠️ Vazio de propósito, pela mesma razão de `QDRANT_COLLECTION`: um default não falha, ele
    # indexa a árvore de outra pessoa com convicção total.
    #
    # ⚠️ Com o índice construído A PARTIR daqui, o primeiro segmento do `source` já é o nome da
    # pasta de topo — que é a convenção que o resto do sistema assume. É por isso que
    # `CORPUS_PREFIX` fica VAZIO neste desenho: não há recipiente a podar.
    "CORPUS_ROOT": "",
    # O que o indexador PULA por ser ruído. Editável na tela — ver `CORPUS_EXCLUDES_PADRAO`.
    "CORPUS_EXCLUDES": "",
    # O que o indexador ACEITA, por extensão. Editável — ver `CORPUS_ADMITE_PADRAO`.
    "CORPUS_ADMITE": "",
    # Teto por ARQUIVO, em KB. Ver `CORPUS_MAX_KB_PADRAO`.
    "CORPUS_MAX_KB": "",
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
    "AGENT_MCP_CONFIG": "",
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


# ─────────────────────────────────────────────────── a camada de RUNTIME (a UI)

RUNTIME_STORE = ROOT / ".cache" / "ambiente.json"

# ☠️ **O QUE FICA NO `.env` É SÓ O QUE O SERVIDOR PRECISA ANTES DE A UI EXISTIR.**
#
# Esta é a régua, e ela não é gosto: `ESPATIAL_HOST` e `ESPATIAL_PORT` decidem o endereço em que a
# tela vai ser servida, então não há como pedi-los À tela. Todo o resto é decisão de operação e
# pertence ao app rodando — editar arquivo e reiniciar para trocar de corpus é o custo que este
# desenho existe para apagar.
#
# ⚠️ **Nomear o que se ACEITA, nunca excluir o que não se aceita** — REGRA DO CATÁLOGO. Uma camada
# que aceitasse "qualquer chave" deixaria a tela reescrever o endereço de escuta a partir do
# próprio servidor.
SO_NO_ENV = ("ESPATIAL_HOST", "ESPATIAL_PORT")

CONFIGURAVEIS = {
    # ⭑ A escolha do operador. Tudo abaixo dela é consequência.
    "CORPUS_ROOT": "o diretório que o SpatIA indexa e serve",
    "QDRANT_COLLECTION": "a coleção que este céu serve",
    "CORPUS_EXCLUDES": "o que o indexador pula, separado por vírgula (ruído — o piso de segredo não é editável)",
    "CORPUS_ADMITE": "as extensões que ENTRAM, separadas por vírgula",
    "CORPUS_MAX_KB": "teto por arquivo, em KB — `0` remove o teto",
    # Infra: têm default de loopback e quase nunca mudam, mas mudam sem reindexar.
    "QDRANT_URL": "onde o Qdrant responde",
    "NEO4J_HTTP": "onde o Neo4j responde",
    "NEO4J_USER": "usuário do Neo4j",
    "NEO4J_PASSWORD": "senha do Neo4j",
    "OLLAMA_URL": "onde o Ollama responde",
    "OLLAMA_MODEL": "o modelo do cérebro offline",
    "TTS_URL": "onde o motor de voz responde",
    "TTS_MODEL": "o motor de voz",
    "TTS_VOICE": "a voz",
    "SEARXNG_URL": "onde o SearXNG responde",
    "BRAIN": "`claude` (ferramentas reais) ou `ollama` (local, sem ferramenta)",
    # ⚠️ Trocar qualquer um destes INVALIDA o índice: os vetores gravados têm o nome e a dimensão
    # do modelo que os produziu. Quem os muda pela tela tem de reindexar, e a tela precisa dizer.
    "EMBED_MODEL": "o modelo denso — trocar exige REINDEXAR",
    "SPARSE_MODEL": "o modelo esparso — trocar exige REINDEXAR",
    # Chaves de busca. Ficam aqui porque `.cache/` e `.env` têm a mesma exposição em disco, e uma
    # chave que só se configura editando arquivo é uma chave que ninguém troca.
    "BRAVE_API_KEY": "chave do Brave",
    "SERPAPI_API_KEY": "chave do SerpAPI",
}

# ☠️ **DERIVADAS DA RAIZ, e é isso que apaga a classe de defeito mais cara desta base.**
#
# Um segundo diretório para "onde o agente opera" foi o que fez `espatial-os/CLAUDE.md` resolver
# para `devshell/CLAUDE.md` — o arquivo EXISTE, a leitura passa, e o conteúdo é de outra árvore.
# Com uma raiz só, a coincidência não tem onde acontecer.
#
# ⚠️ A derivação acontece na ESCRITA (`definir_corpus`), nunca na leitura. `get` continua burro:
# quem quiser saber quem decidiu uma chave lê `origem()`, e o valor derivado aparece no
# `ambiente.json` como qualquer outro — auditável, não mágico.
# ─────────────────────────────────────────── o que NÃO entra no índice
#
# ☠️ **São DUAS listas, e fundi-las numa só editável seria o defeito.** Elas têm naturezas opostas:
# uma é RUÍDO (custa tempo e polui o céu, e o operador é quem sabe o que é ruído no corpus dele); a
# outra é SEGREDO (indexar coloca o conteúdo no vetor, e o que está no vetor volta numa resposta).
#
# Uma lista única editável deixaria alguém apagar `.env` da lista limpando ruído, e a partir dali o
# agente responderia com a chave de API de dentro do próprio corpus — sem erro, sem aviso, com cara
# de resposta bem fundamentada. Por isso o piso de segredo não é editável.

CORPUS_EXCLUDES_PADRAO = (
    "node_modules",
    ".git",
    "_ignore",
    "__pycache__",
    ".venv",
    "venv",
    ".DS_Store",
    "dist",
    "build",
    "target",
    ".next",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "vendor",
    "*.lock",
    "*-lock.json",
    "*-lock.yaml",
    "*.min.js",
    "*.map",
    "*.pyc",
)

# ⚠️ **PISO — sempre aplicado, e a UI não alcança.** Um segredo indexado não é um arquivo a mais:
# é conteúdo dentro do vetor, recuperável por busca semântica e citável numa resposta.
NUNCA_INDEXADOS = (
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.keystore",
    "id_rsa*",
    "id_ed25519*",
    ".npmrc",
    ".netrc",
    ".ssh",
    ".gnupg",
    ".aws",
    "credentials",
    "credentials.*",
    "*.sqlite",
    "*.db",
    ".json",
    ".csv"
)


# ─────────────────────────────────────────── o que ENTRA no índice
#
# ⭑ **A REGRA DO CATÁLOGO aplicada ao indexador: nomear o que ENTRA, nunca listar o que não entra.**
# Exclusão sozinha não é política de admissão — medido em `/Users/victor/workspace`, podar só o
# ruído deixava passar **935 MB**, quase tudo dado gerado. Uma lista de "o que não quero" nunca
# termina: cada formato novo entra por default até alguém notar.

CORPUS_ADMITE_PROSA = (".md", ".mdc", ".txt", ".rst", ".org", ".adoc")

# ESTRUTURA — schema, configuração e infraestrutura. DECLARADO E DESLIGADO, como o código.
#
# ☠️ **Estes tipos são massa sem conhecimento.** A mediana de chunks deles é uma ORDEM DE GRANDEZA
# abaixo da prosa, e `chunks` é o eixo que decide CLASSE: admiti-los dobra a contagem de corpos sem
# trazer massa, metade do céu vira asteroide e o porte "gigante" desaparece — junto com o fenômeno
# de colapso que depende dele. As duas distribuições saem de `make censos`.
#
# ⚠️ O lugar deles é como ATRIBUTO do sistema a que pertencem, não como corpo próprio.
CORPUS_ADMITE_ESTRUTURA = (
    ".sql", ".yml", ".yaml", ".toml", ".json", ".ini", ".cfg", ".tf", ".tfvars", ".env.example",
)

# ☠️ **CÓDIGO-FONTE É FASE 2, e fica declarado FORA do padrão de propósito.**
#
# Ele não está ausente por esquecimento: está nomeado e desligado, para que ligar seja uma linha e
# não uma redescoberta da lista. ⚠️ E ligar não é só admitir mais tipo — código é 13 mil dos 14 mil
# arquivos desta raiz, então ele redefine a paisagem do céu inteiro, não a acrescenta.
CORPUS_ADMITE_CODIGO = (
    ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".rb", ".php",
    ".sh", ".html", ".css", ".scss", ".vue", ".svelte", ".c", ".h", ".cpp", ".hpp", ".cs",
    ".kt", ".swift", ".lua", ".r", ".ex", ".exs", ".gradle",
)

# Arquivos SEM extensão que são conhecimento — casados pelo nome inteiro.
CORPUS_ADMITE_NOMES = ("Makefile", "Dockerfile", "LICENSE", "README", "CHANGELOG", "Procfile")

# ⭑ Só PROSA entra por padrão. Conhecimento tem massa; o resto é propriedade de quem o carrega.
CORPUS_ADMITE_PADRAO = CORPUS_ADMITE_PROSA

# ☠️ **O TETO POR ARQUIVO, e ele existe porque TIPO admitido não é sinônimo de conhecimento.**
#
# Procedência: varredura de `/Users/victor/workspace` em 2026-08-11, após as exclusões. Admitindo
# por tipo sobram ~153 MB, e os maiores são todos GERADOS — `src/generated/prisma/index.d.ts` com
# 14,9 MB, specs de API com 6,5 MB. Um teto de 64 KB mantém **98,9% dos arquivos** e corta o volume
# pela metade: o que ele derruba é máquina escrevendo para máquina.
#
# ⚠️ Ele é por ARQUIVO, não por corpus: um teto global cortaria pelo meio da varredura e o índice
# dependeria da ordem em que o disco devolveu os nomes.
CORPUS_MAX_KB_PADRAO = 64


def admite() -> tuple[str, ...]:
    """As extensões que entram. Declarado vazio é ESCOLHA — nada entra por tipo."""
    if origem("CORPUS_ADMITE") == "default":
        return CORPUS_ADMITE_PADRAO
    return tuple(p.strip().lower() for p in get("CORPUS_ADMITE").split(",") if p.strip())


def teto_bytes() -> int:
    bruto = get("CORPUS_MAX_KB")
    try:
        return max(0, int(bruto)) * 1024 if bruto else CORPUS_MAX_KB_PADRAO * 1024
    except ValueError:
        return CORPUS_MAX_KB_PADRAO * 1024


def admitido(relativo: str, tamanho: int) -> bool:
    """Este arquivo entra no índice? Exclusão, admissão por tipo e teto — nesta ordem.

    ⚠️ A exclusão vem PRIMEIRO e o piso de segredo mora nela: um `.env` de 200 bytes com extensão
    admitida passaria por qualquer regra de tipo ou tamanho.
    """
    if not indexavel(relativo):
        return False
    nome = PurePosixPath(relativo).name
    sufixo = PurePosixPath(nome).suffix.lower()
    if sufixo not in admite() and nome not in CORPUS_ADMITE_NOMES:
        return False
    teto = teto_bytes()
    return teto == 0 or tamanho <= teto


def excludes() -> tuple[str, ...]:
    """O que o operador declarou como ruído — o padrão quando ele nunca disse nada.

    ⚠️ Declarado VAZIO é ESCOLHA (indexar tudo), a mesma regra de `get`. Por isso a ausência é
    testada pela ORIGEM, não pelo valor: cair no padrão porque a string está vazia ignoraria uma
    decisão explícita de não excluir nada.
    """
    if origem("CORPUS_EXCLUDES") == "default":
        return CORPUS_EXCLUDES_PADRAO
    bruto = get("CORPUS_EXCLUDES")
    return tuple(p.strip() for p in bruto.split(",") if p.strip())


def indexavel(relativo: str) -> bool:
    """Este caminho, relativo à raiz, entra no índice?

    A regra vale para QUALQUER segmento: `a/node_modules/b/c.js` é excluído pelo segmento do meio,
    não só quando `node_modules` é o primeiro. Sem isso a exclusão só pegaria a raiz e o resto da
    árvore entraria inteiro.
    """
    from fnmatch import fnmatch

    padroes = tuple(NUNCA_INDEXADOS) + tuple(excludes())
    for parte in PurePosixPath(relativo).parts:
        for padrao in padroes:
            if fnmatch(parte, padrao):
                return False
    return True


# ☠️ **UMA raiz, e só uma** — a refutação está no comentário de `CORPUS_ROOT`, acima.
# `CORPUS_PREFIX` fica porque NÃO é raiz: é a poda que um índice construído por FORA exige, e vale
# vazio quando o índice é nosso.
DERIVADAS_DA_RAIZ = ()
# `CORPUS_PREFIX` também é derivado, mas para VAZIO e não para o caminho: indexando a partir da
# raiz não existe recipiente a podar. Ele entra na permissão sem entrar no laço acima.
DERIVADAS = DERIVADAS_DA_RAIZ + ("CORPUS_PREFIX",)

_runtime: Optional[dict] = None


def _runtime_valores() -> dict:
    """Lido uma vez e mantido em memória — `get` é chamado a cada requisição."""
    global _runtime
    if _runtime is None:
        try:
            bruto = json.loads(RUNTIME_STORE.read_text(encoding="utf-8"))
            # ☠️ **AS DERIVADAS ENTRAM AQUI, e esquecê-las é um defeito que só aparece entre
            # PROCESSOS.** `definir` grava e atualiza o cache em memória, então quem escreveu
            # continua lendo certo; um processo NOVO relê o arquivo e descarta o que este filtro
            # não conhece. Medido: o `ambiente.json` com `AGENT_CWD` e `CORPUS_PREFIX` gravados, e
            # o servidor recém-subido respondendo com os valores do `.env` — arquivo certo, leitor
            # cego, e `origem()` dizendo `env` com toda a convicção.
            aceitas = set(CONFIGURAVEIS) | set(DERIVADAS)
            _runtime = {k: str(v) for k, v in bruto.items() if k in aceitas}
        except (OSError, ValueError):
            _runtime = {}
    return _runtime


def definir(patch: dict) -> dict:
    """Grava a decisão da UI. Chave fora de `CONFIGURAVEIS` é RECUSADA, nunca ignorada.

    ⚠️ Recusar em silêncio faria a tela mostrar um campo salvo que não vale — o mesmo formato de
    "o cabeçalho afirma e a carga está vazia" que esta base paga caro.
    """
    global _runtime
    intrusas = [k for k in patch if k not in CONFIGURAVEIS and k not in DERIVADAS]
    if intrusas:
        raise ValueError(f"chaves não configuráveis pela UI: {', '.join(sorted(intrusas))}")
    valores = dict(_runtime_valores())
    for chave, valor in patch.items():
        if valor is None:
            valores.pop(chave, None)  # remover devolve a palavra ao `.env`
        else:
            valores[chave] = str(valor)
    RUNTIME_STORE.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_STORE.write_text(json.dumps(valores, indent=1, ensure_ascii=False), encoding="utf-8")
    _runtime = valores
    return valores


def definir_corpus(raiz: str) -> dict:
    """Escolhe a RAIZ e escreve as derivadas junto, num ato só.

    ⭑ **A derivação é escrita, não calculada na leitura**, e é o que a torna auditável: quem abrir
    `.cache/ambiente.json` vê cada derivada com o valor que a raiz lhe deu, e não precisa conhecer
    uma regra escondida no leitor para entender por quê. Quais são elas está em `DERIVADAS`.

    ⚠️ **A coleção acompanha a raiz.** Corpus diferente é céu diferente, e reaproveitar o nome faria
    o snapshot velho passar no carimbo — o servidor recusa o que não é do céu servido, e essa recusa
    é a última defesa contra "o cabeçalho afirma e a carga está vazia".
    """
    caminho = Path(raiz).expanduser().resolve()
    if not caminho.is_dir():
        raise ValueError(f"não é um diretório: {caminho}")
    patch = {"CORPUS_ROOT": str(caminho)}
    for chave in DERIVADAS_DA_RAIZ:
        patch[chave] = str(caminho)
    patch["QDRANT_COLLECTION"] = colecao_de(caminho)
    # Índice construído a partir da raiz: o primeiro segmento do `source` já é o nome de topo.
    patch["CORPUS_PREFIX"] = ""
    return definir(patch)


def colecao_de(raiz: Path) -> str:
    """Nome de coleção derivado da raiz — estável, legível e único por caminho.

    ⚠️ O nome carrega o basename E um resumo do caminho inteiro: duas pastas `notas` em lugares
    diferentes são corpora diferentes, e colidir o nome faria uma servir a outra.
    """
    import hashlib

    marca = hashlib.sha256(str(raiz).encode()).hexdigest()[:8]
    limpo = "".join(c if c.isalnum() else "_" for c in raiz.name).strip("_").lower() or "corpus"
    return f"spatia_{limpo}_{marca}"


def origem(key: str) -> str:
    """QUEM decidiu esta chave: `ui`, `env` ou `default`.

    ☠️ **Sem isto a camada nova É a armadilha que ela deveria fechar.** Esta base já pagou por
    duas fontes discordando sobre `AGENT_CWD` sem nada acusar; acrescentar uma TERCEIRA sem
    tornar a ordem legível repetiria o defeito com mais um andar. A tela mostra a origem ao lado
    do valor, e é isso que torna a precedência auditável em vez de folclórica.
    """
    if key in _runtime_valores():
        return "ui"
    if os.environ.get(key) or key in _DECLARADAS:
        return "env"
    return "default"


def get(key: str) -> str:
    """Valor efetivo. A ordem é **UI > `.env` > default**, e ela é declarada, não implícita.

    ⚠️ **Declarado VAZIO é ESCOLHA, não ausência — em qualquer das camadas.** `CORPUS_PREFIX=`
    significa "sem prefixo", e cair no default aqui apontaria o céu para caminhos que não existem
    no corpus escolhido — sem erro, com o sintoma de "nenhum arquivo casa" que já custou uma
    sessão. Vale igual para a UI: campo esvaziado na tela é decisão de esvaziar.

    ⭑ Tirar a chave do runtime (`definir({chave: None})`) é o que devolve a palavra ao `.env`.
    """
    valores = _runtime_valores()
    if key in valores:
        return valores[key]
    value = os.environ.get(key)
    if value:
        return value
    if key in _DECLARADAS:
        return ""
    return DEFAULTS.get(key, "")


def get_int(key: str) -> int:
    """Valor inteiro, com o DEFAULT quando a chave está declarada vazia ou ilegível.

    ☠️ **`int("")` levanta `ValueError` cru, e este arquivo ENSINA a declarar vazio.** "Vazio é
    escolha" é a regra para texto — para número não existe escolha vazia, e uma linha
    `AGENT_MAX_TURNS=` derrubava o servidor no boot com uma mensagem que não nomeia a chave.
    Degradar para o default é o comportamento certo; morrer sem dizer qual linha do `.env` causou
    é o que a Filosofia de Engenharia chama de falhar em silêncio, com barulho.
    """
    bruto = get(key)
    try:
        return int(bruto)
    except (TypeError, ValueError):
        padrao = DEFAULTS.get(key, "0")
        try:
            return int(padrao)
        except (TypeError, ValueError):
            return 0


def vector_name(model: str) -> str:
    """Mesma regra do FastEmbedProvider do mcp-server-qdrant: `fast-<último segmento>`.

    É o acoplamento silencioso do sistema: nome divergente devolve resultado vazio
    em vez de erro, então ele vive numa função só, ao lado de quem o consome.
    """
    return f"fast-{model.split('/')[-1].lower()}"


SPARSE_VECTOR_NAME = "bm25"


def agent_dir() -> Optional[Path]:
    """`CORPUS_ROOT/.claude`, quando existe.

    É onde as configurações do agente já moram: `catalog.py` descobre skills e agentes ali, e as
    `setting_sources` do CLI leem dali. Tudo que este servidor escreve PARA o agente vai para o
    mesmo lugar — escrever num diretório nosso criaria uma segunda casa de configuração do
    agente, e o operador teria de saber que existem duas.

    `None` quando o diretório não existe: nesse caso não há convenção a respeitar, e o chamador
    cai no `.cache/` do próprio servidor.
    """
    raiz = get("CORPUS_ROOT")
    if not raiz:
        return None
    caminho = Path(raiz) / ".claude"
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
    corpus = get("CORPUS_ROOT")
    if corpus:
        roots.append(Path(corpus).expanduser().resolve())
    return roots
