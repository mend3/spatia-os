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

from . import config, metrics, qdrant, recency

logger = logging.getLogger("espatial.graph")

CACHE_PATH = config.ROOT / ".cache" / "graph.json"

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
                "depth": len(segments),
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
    # Recência por git: é ela que vira o raio orbital no céu. `indexed_at` não serve (uma
    # reindexação dá a mesma data a todos os 397 arquivos) e mtime também não (reflete a hora
    # do clone). Ambos foram medidos — ver o docstring de `recency.py`.
    recency.annotate(nodes)
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
            "built_in_ms": round((time.monotonic() - started) * 1000),
        },
    }
    metrics.graph_build.observe(payload["stats"]["built_in_ms"] / 1000)
    logger.info(
        f"topologia: {payload['stats']['files']} arquivos, "
        f"{payload['stats']['chunks']} chunks, {len(hubs)} hubs"
    )
    return payload


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
    return max(repos, key=repos.get) if repos else ""


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
            "depth": 0,
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
            "depth": len(path.split("/")),
            "chunks": dir_weight[path],
        })

    edges: list[list[str]] = []
    for node in files:
        parent = f"dir:{node['dir']}" if node["dir"] in keep_dirs else f"repo:{node['repo']}"
        node["parent"] = parent
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
    fingerprint = f"{config.get('QDRANT_COLLECTION')}:{collection['points']}"

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
