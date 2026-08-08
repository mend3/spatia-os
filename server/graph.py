"""Topologia do conhecimento derivada do índice real — não é grafo sintético.

O Neo4j é a fonte natural das *relações*, mas ele pode estar desligado (e nesta máquina
está). Em vez de inventar nós, a topologia sai do que existe: a hierarquia real
`repo → diretório → arquivo` dos 397 arquivos indexados, com peso = número de chunks.

A posição orbital de cada nó NÃO vem daqui: o servidor manda estrutura e peso, o cliente
deriva órbita/inclinação/fase do hash do id. Layout é decisão visual, e mora no renderer.
"""
import json
import logging
import threading
import time
from datetime import date, datetime
from pathlib import Path

from . import config, metrics, qdrant, recency, services, graphdb

logger = logging.getLogger("espatial.graph")

CACHE_PATH = config.ROOT / ".cache" / "graph.json"
# Versão do FORMATO do nó. Ver o uso no fingerprint.
# 4: `source` chega podado do recipiente (`qdrant.strip_prefix`), então todo id de nó mudou
#    sem que a contagem de pontos mudasse — o cache em disco continuaria válido servindo ids
#    velhos, e a cena abriria com o leitor quebrado outra vez.
# 5: `regularity` (ritmo de commits) chega em cada nó de arquivo — é o fato de que o PULSAR
#    passou a depender. Campo novo em nó não muda o fingerprint do corpus, então sem este bump a
#    feature nasceria morta em qualquer clone que já tivesse `.cache/graph.json`.
# 7: `services` (as partes nomeadas de um compose) chega no nó de compose — 164 deles em 44
#    arquivos, medido em 2026-08-07. Mesmo motivo do bump 5: campo novo não muda o fingerprint
#    do corpus, e sem ele a nebulosa continuaria sem luas em qualquer clone com cache.
# 10: `usage` (P5 — quantas execuções de agente tocaram o corpo) chega no nó, do snapshot de
#    `scripts/uso.mjs`. Mesmo motivo dos bumps 5 e 7, e aqui ele morde mais: o snapshot muda
#    sozinho conforme o diário cresce, e sem o bump o primeiro clone com cache nunca veria a
#    dimensão aparecer — ela nasceria morta justamente na base que mais a acumulou.
SCHEMA_VERSION = 10

# Cada tipo é uma cor no céu. A ordem importa: o primeiro padrão que casar ganha, então
# o específico (memória, decisão datada) vem antes do genérico (.md é "doc").
KIND_RULES = (
    ("memory", lambda s: "/memory/" in s or s.endswith("MEMORY.md")),
    ("decision", lambda s: "/docs/status/" in s),
    # Lock e dump gerado passam pelo filtro de extensão do indexador e chegam com centenas
    # de chunks — peso alto, conhecimento zero. Classificar separado deixa o cliente
    # apagá-los sem que eu precise removê-los do índice.
    ("lock", lambda s: s.rsplit("/", 1)[-1] in ("package-lock.json", "pnpm-lock.yaml", "uv.lock")
        or s.endswith((".lock", "-configmap.yaml"))),
    ("agent", lambda s: "/.claude/" in s or "/agents/" in s or "/skills/" in s),
    ("infra", lambda s: s.endswith((".tf", ".tfvars"))),
    ("compose", lambda s: "compose" in s.rsplit("/", 1)[-1] or s.endswith(("docker-compose.yml",))),
    ("schema", lambda s: s.endswith((".prisma", ".sql"))),
    ("script", lambda s: s.endswith((".sh",))),
    ("config", lambda s: s.endswith((".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".example"))),
    ("doc", lambda s: s.endswith((".md", ".mdc"))),
)

_lock = threading.Lock()
_cached: dict | None = None


def classify(source: str) -> str:
    for kind, matches in KIND_RULES:
        if matches(source):
            return kind
    return "other"


def repo_of(source: str) -> str:
    """Nome do "sistema" a que o arquivo pertence.

    Quase todo source é relativo e o primeiro segmento já é o repo. A exceção são os
    caminhos absolutos que o indexador adiciona por `--include` (as memórias do agente,
    fora de qualquer git): eles ganham um repo virtual, senão caem todos num hub sem nome.
    """
    if not source.startswith("/"):
        return source.split("/")[0]
    if "/memory" in source:
        return "agent-memory"
    return source.strip("/").split("/")[0]


def build() -> dict:
    """Varre a coleção e agrega por arquivo, diretório e repo."""
    started = time.monotonic()
    files: dict[str, dict] = {}

    for point in qdrant.scroll():
        source = point["source"]
        if not source:
            continue
        node = files.get(source)
        if node is None:
            segments = source.split("/")
            files[source] = {
                "id": source,
                "type": "file",
                "label": segments[-1],
                "source": source,
                "repo": repo_of(source),
                "dir": "/".join(segments[:-1]),
                "kind": classify(source),
                # Caminho para a ÁRVORE, distinto de `source` (que é a chave no Qdrant).
                # Fonte absoluta (`/Users/.../memory/x.md`, que o indexador adiciona por
                # --include) tem primeiro segmento vazio, e isso desenhava uma pasta SEM NOME
                # na raiz. Aqui ela ganha o repo virtual como raiz.
                "path": _tree_path(source),
                "chunks": 1,
                "indexed_at": point.get("indexed_at", ""),
                "sections": [],
            }
        else:
            node["chunks"] += 1
        section = point.get("section")
        if section and section not in files[source]["sections"] and len(files[source]["sections"]) < 12:
            files[source]["sections"].append(section)

    nodes = list(files.values())
    _warn_if_container_root(nodes)
    # Recência por git: é ela que vira o raio orbital no céu. `indexed_at` não serve (uma
    # reindexação dá a mesma data a todos os 397 arquivos) e mtime também não (reflete a hora
    # do clone). Ambos foram medidos — ver o docstring de `recency.py`.
    recency.annotate(nodes)
    # Serviços do compose: as partes nomeadas do arquivo, como `sections` é para o documento.
    # Lê disco, então vem depois da recência (que também lê) e antes da hierarquia, que só
    # agrega. Arquivo ilegível sai sem o campo — a nebulosa fica como era.
    services.annotate(nodes)
    # INFLUÊNCIA, do snapshot que `scripts/centralidade.mjs` materializa. Ler daqui e não do Neo4j
    # é a lei nº 2 de `docs/integracao-neo4j.md`: o grafo nunca está no caminho do quadro, e cair
    # entre duas materializações não muda nada na tela até a próxima.
    graphdb.annotate_influence(nodes)
    # USO (P5): quantas execuções de agente tocaram o corpo. Mesma lei — snapshot em disco, nunca
    # consulta no caminho do quadro. Vem depois da influência porque são dimensões distintas com
    # snapshots distintos: `centrality` é "quantos se parecem comigo", `usage` é "quantos me
    # abriram". Fundi-las num número só reconstruiria o score composto já refutado.
    uso = graphdb.annotate_usage(nodes)
    hubs, edges = _hierarchy(nodes)
    payload = {
        "nodes": hubs + nodes,
        "edges": edges,
        "stats": {
            "files": len(nodes),
            "chunks": sum(node["chunks"] for node in nodes),
            "hubs": len(hubs),
            "kinds": _histogram(node["kind"] for node in nodes),
            "repos": _histogram(node["repo"] for node in nodes),
            # Os metadados do uso viajam com a topologia para a tela poder dizer "a dimensão existe
            # e a evidência é rala" em vez de calar. Omitir o veredito faria um `usage` pequeno
            # parecer medida forte de pouco uso, quando é medida fraca de uso nenhum.
            "uso": uso,
            "built_in_ms": round((time.monotonic() - started) * 1000),
        },
    }
    metrics.graph_build.observe(payload["stats"]["built_in_ms"] / 1000)
    logger.info(
        f"topologia: {payload['stats']['files']} arquivos, "
        f"{payload['stats']['chunks']} chunks, {len(hubs)} hubs"
    )
    _warn_if_class_empty(nodes)
    return payload


# Piso de regularidade do PULSAR. ⚠️ A SSOT é `src/space/catalog.js`
# (`PULSAR_REGULARITY_FLOOR`); esta é uma CÓPIA, e ela existe só para o aviso abaixo poder
# existir — o servidor não classifica nada. Se os dois divergirem, o cliente está certo, e o
# único prejuízo é o aviso disparar na hora errada.
PULSAR_FLOOR = 0.5


def _warn_if_class_empty(nodes: list[dict]) -> None:
    """Avisa quando um limiar deixa de selecionar QUALQUER corpo do corpus.

    ## Por que isto existe

    Três constantes deste projeto degradaram em silêncio até 2026-08-07, todas pelo mesmo
    mecanismo: **foram calibradas contra um corpus e continuaram sendo aplicadas depois que ele
    mudou de tamanho ou de escopo.**

    - `DENSITY_K` (`orbital-zones.js`) — corpus 5,6× maior empurrou `a_corte` de 37,9 para 67,2,
      acima do raio orbital máximo (62). **297 luas viraram 0**, e nada acusou.
    - `SPAN` (`galaxy.js`) — derivado contra 71 hubs, aplicado em 228: a cobertura de tinta foi de
      49% para ~157%.
    - `PULSAR_REGULARITY_FLOOR` (`catalog.js`) — medido em ~6 400 caminhos do git e aplicado sobre
      os ~1 600 INDEXADOS. Medido: 287 caminhos do git têm ritmo, **27 cruzam o piso, e só 11 dos
      287 estão no índice — nenhum acima do piso.** O piso não está errado; 22 dos 27 pulsares
      reais são `.ts`/`.tsx`/`.py`, e o indexador não ingere código.

    O padrão é sempre o mesmo e é o pior modo de falha possível: a feição some, o shader continua
    lá, e a tela não mente nem acusa — ela simplesmente deixa de afirmar. É o oposto do que a
    filosofia deste projeto pede (*degradar com elegância > falhar silenciosamente*).

    ⚠️ Aviso de POPULAÇÃO ZERO, não de população baixa. Um corpus sem `docker-compose.yml` não tem
    nebulosa, e isso é honestidade, não defeito — a régua está em `docs/catalogo-celeste.md`. O que
    NÃO é honesto é um limiar que nenhum corpo alcança: aí a classe não descreve o corpus, ela só
    não encontra ninguém.
    """
    ritmados = [node.get("regularity") or 0.0 for node in nodes if (node.get("regularity") or 0) > 0]
    if not ritmados:
        return
    acima = sum(1 for value in ritmados if value >= PULSAR_FLOOR)
    if acima:
        return
    logger.warning(
        f"PULSAR sem população: {len(ritmados)} arquivos têm ritmo, nenhum cruza o piso "
        f"{PULSAR_FLOOR} (máximo {max(ritmados):.3f}). O shader existe e não desenha nada. "
        "Ou o piso foi medido em outra população, ou o corpus indexado não contém os arquivos "
        "ritmados — ver o docstring desta função."
    )


def _warn_if_container_root(nodes: list[dict]) -> None:
    """Avisa quando TODO arquivo compartilha o primeiro segmento e ninguém o podou.

    Esse é o formato de um índice publicado dentro de um recipiente. Ele não quebra o build —
    quebra `files.read_source`, a recência por git e os anéis de `dirty`, todos em silêncio,
    porque cada um assume que o primeiro segmento é o nome da raiz. Já aconteceu uma vez.
    """
    if config.get("CORPUS_PREFIX"):
        return
    roots = {node["source"].split("/")[0] for node in nodes if not node["source"].startswith("/")}
    if len(roots) == 1 and len(nodes) > 1:
        root = roots.pop()
        logger.warning(
            f"todos os {len(nodes)} arquivos começam com '{root}/': se ele for um recipiente "
            f"e não um sistema, defina CORPUS_PREFIX={root}/ — senão leitor, recência e "
            "anéis de alteração falham sem erro"
        )


def _tree_path(source: str) -> str:
    """Caminho de exibição na árvore. Relativo passa direto; absoluto ganha raiz virtual."""
    if not source.startswith("/"):
        return source
    name = source.rsplit("/", 1)[-1]
    return f"{repo_of(source)}/{name}"


def age_days() -> int | None:
    """Idade do índice em dias, do cache — sem tocar upstream.

    Existe para o cabeçalho da UI. É o número que decai em silêncio: a busca continua
    respondendo normalmente sobre um corpus velho, sem erro nenhum, e é o modo de falha que já
    aconteceu neste ecossistema. Se não está visível em toda tela, não está visível.
    """
    payload = _cached
    if not payload:
        return None
    newest = max((node.get("indexed_at") or "" for node in payload.get("nodes") or []), default="")
    try:
        indexed = datetime.strptime(newest, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    return max(0, (date.today() - indexed).days)


def files_root(payload: dict) -> str:
    """Diretório inicial do app de Arquivos.

    O corpus tem mais de uma raiz (o workspace e as memórias do agente), então não existe
    prefixo comum — e abrir na raiz vazia mostra duas pastas em vez do conteúdo. O padrão é a
    raiz com mais arquivos, que é o workspace; `FILES_ROOT` sobrescreve.

    Derivado do dado, não fixo no código: se o corpus mudar, o ponto de partida acompanha.
    """
    override = config.get("FILES_ROOT")
    if override:
        return override
    repos = (payload.get("stats") or {}).get("repos") or {}
    # `key=lambda`, e não `key=repos.get`: `dict.get` é sobrecarregado e pode devolver `None`, o
    # que não satisfaz o `SupportsRichComparison` que o `max` exige — o checador de tipos reclama
    # com razão. A indexação direta tem o tipo certo e é a mesma conta.
    return max(repos, key=lambda repo: repos[repo]) if repos else ""


def publish_gauges(payload: dict) -> None:
    """Espelha o estado do corpus nos gauges.

    Chamado quando a topologia é construída ou recarregada do cache — nunca durante o
    scrape. O gauge que mais importa aqui é a idade: busca sobre índice velho responde
    normalmente, sem erro nenhum, e é o modo de falha que já aconteceu neste ecossistema.
    """
    stats = payload.get("stats") or {}
    metrics.index_files.set(stats.get("files", 0))
    metrics.index_points.set((payload.get("collection") or {}).get("points", stats.get("chunks", 0)))
    for kind in metrics.CORPUS_KINDS:
        metrics.index_files_by_kind.set((stats.get("kinds") or {}).get(kind, 0), kind=kind)
    metrics.graph_nodes.set(len(payload.get("nodes") or []))
    metrics.graph_edges.set(len(payload.get("edges") or []))

    newest = max(
        (node.get("indexed_at") or "" for node in payload.get("nodes") or []), default=""
    )
    age = _age_seconds(newest)
    if age is not None:
        metrics.index_age.set(age)


def _age_seconds(stamp: str) -> float | None:
    try:
        indexed = datetime.strptime(stamp, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    return max(0.0, (date.today() - indexed).days * 86400.0)


def _hierarchy(files: list[dict]) -> tuple[list[dict], list[list[str]]]:
    """Cria os nós-hub (diretório e repo) e as arestas filho→pai.

    Hub é o "nó gravitacional" do briefing: ele não é um arquivo, é o que segura um
    conjunto de arquivos em órbita comum. Diretório sem irmãos vira aresta direta para o
    repo — filamento de um nó só polui o céu sem informar nada.
    """
    dir_weight: dict[str, int] = {}
    repo_weight: dict[str, int] = {}
    for node in files:
        dir_weight[node["dir"]] = dir_weight.get(node["dir"], 0) + node["chunks"]
        repo_weight[node["repo"]] = repo_weight.get(node["repo"], 0) + node["chunks"]

    dir_children: dict[str, int] = {}
    for node in files:
        dir_children[node["dir"]] = dir_children.get(node["dir"], 0) + 1
    keep_dirs = {path for path, count in dir_children.items() if count > 1 and path}

    hubs: list[dict] = []
    for repo, weight in sorted(repo_weight.items()):
        hubs.append({
            "id": f"repo:{repo}",
            "type": "repo",
            "label": repo,
            "kind": "repo",
            "repo": repo,
            "dir": "",
            "chunks": weight,
        })
    for path in sorted(keep_dirs):
        hubs.append({
            "id": f"dir:{path}",
            "type": "dir",
            "label": path.rsplit("/", 1)[-1],
            "kind": "dir",
            "repo": repo_of(path),
            "dir": path,
            "chunks": dir_weight[path],
        })

    edges: list[list[str]] = []
    for node in files:
        parent = f"dir:{node['dir']}" if node["dir"] in keep_dirs else f"repo:{node['repo']}"
        # ⚠️ O parentesco vai na ARESTA e não no nó. Ele era escrito nos dois lugares e ninguém lia
        # o campo — nem cliente nem servidor —, então eram 1.843 cópias de um fato que a aresta já
        # afirma. Duas fontes para a mesma verdade é o defeito que este projeto mais persegue; aqui
        # a redundância nem chegou a divergir porque o campo estava morto.
        edges.append([node["id"], parent])
    for path in sorted(keep_dirs):
        parent_path = path.rsplit("/", 1)[0] if "/" in path else ""
        parent = f"dir:{parent_path}" if parent_path in keep_dirs else f"repo:{repo_of(path)}"
        edges.append([f"dir:{path}", parent])

    return hubs, edges


def _histogram(values) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: -item[1]))


def load(force: bool = False) -> dict:
    """Memória → disco → reconstrução. A chave de validade é `points_count` da coleção:
    reindexou, muda a contagem, o cache cai sozinho."""
    global _cached
    collection = qdrant.info()
    # ⚠️ `SCHEMA_VERSION` no fingerprint: campo NOVO em nó (`churn`, `supernova`) não muda o
    # `points_count` do Qdrant, então o cache em disco continuaria válido e serviria nós sem o
    # campo — a feature nasceria morta num clone que já tivesse `.cache/graph.json`, e o sintoma
    # seria "não aparece nada" sem erro nenhum. Suba a versão ao acrescentar campo em nó.
    # `CORPUS_PREFIX` entra no fingerprint porque mudá-lo reescreve TODO id de nó sem mover o
    # `points_count` — o cache continuaria casando e serviria ids que o leitor não resolve.
    #
    # ⚠️ `AGENT_CWD` entra pelo MESMO motivo, e faltava. Ele decide qual repositório git alimenta
    # `recency`, `churn`, `dormant` e `regularity` — ou seja, o raio orbital, o anel, a supernova e
    # a classe PULSAR de todo nó. Trocar de árvore mantendo a coleção deixava o cache casando e
    # servindo esses quatro campos calculados do repo ERRADO, em silêncio. O sintoma observado em
    # 2026-08-07: os quatro pulsares do corpus de teste sumiram da cena (regularidade ausente)
    # enquanto `recency._tables()` calculava 1,0 para os mesmos caminhos, no mesmo instante.
    fingerprint = (
        f"{SCHEMA_VERSION}:{config.get('QDRANT_COLLECTION')}:{collection['points']}"
        f":{config.get('CORPUS_PREFIX')}:{config.get('AGENT_CWD')}"
    )

    with _lock:
        if not force and _cached and _cached.get("fingerprint") == fingerprint:
            return _cached
        if not force and CACHE_PATH.is_file():
            try:
                disk = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
                if disk.get("fingerprint") == fingerprint:
                    disk.setdefault("files_root", files_root(disk))
                    _cached = disk
                    publish_gauges(disk)
                    return disk
            except (OSError, json.JSONDecodeError):
                logger.warning("cache de topologia ilegível, reconstruindo")

        payload = build()
        payload["fingerprint"] = fingerprint
        payload["collection"] = collection
        payload["files_root"] = files_root(payload)
        _cached = payload
        publish_gauges(payload)
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            CACHE_PATH.write_text(json.dumps(payload), encoding="utf-8")
        except OSError as e:
            logger.warning(f"não gravei o cache: {e}")
        return payload


REFRESH_SECONDS = 60


def warm() -> None:
    """Sobe a topologia e mantém os gauges de corpus vivos num loop de background.

    O loop existe para que `/metrics` nunca precise falar com o Qdrant: o scrape lê valores
    já em memória. Reindexação muda o `points_count`, o fingerprint cai e a topologia é
    reconstruída aqui — não na requisição de alguém.
    """

    def run() -> None:
        while True:
            try:
                load()
            except Exception as e:  # noqa: BLE001 — sem Qdrant a UI ainda sobe (só sem estrelas)
                logger.warning(f"topologia indisponível: {e}")
            time.sleep(REFRESH_SECONDS)

    threading.Thread(target=run, name="graph-refresh", daemon=True).start()
