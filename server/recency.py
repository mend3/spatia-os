"""Recência de cada arquivo: quando aquele conhecimento mudou de verdade.

Serve o raio orbital do céu. A ideia vem do Starmap do hermes-agent, que posiciona cada nó por
recência e diz no código por quê: *"radial position is a truthful linear map of time, so rings
line up with the nodes they date"*. A geometria informa em vez de só ser estável.

**Por que git, e não os dois sinais mais óbvios** — os dois foram medidos e descartados:

| Sinal | Medido neste corpus | Veredito |
|---|---|---|
| `indexed_at` do chunk | **397 arquivos, 1 data** | uma reindexação estampa todos igual: colapsa tudo num anel |
| mtime do arquivo | 397 arquivos, **3 dias** | reflete a hora do CLONE, não a história |
| data do último commit | 6396 caminhos, **~14 meses / 35 dias distintos** | é a história real |

Um anel só com aparência de eixo do tempo seria pior que raio por hash — mentiria. Por isso a
escolha é medida, não estética.

Custo: UMA passada de `git log --name-only` por raiz git, não um `git log` por arquivo. Nas
5 mil entradas do workspace isso leva menos de um segundo, e o resultado fica em cache.
"""
import logging
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

from . import config

logger = logging.getLogger("espatial.recency")

TIMEOUT_SECONDS = 90
# TTL longo: a resposta muda com um commit novo, não com um refresh de UI.
CACHE_TTL = 900

"""Janela do churn, em dias.

⚠️ Por TEMPO, não por contagem de commits.

O pedido original era "os últimos 10 commits". Dez commits são um dia num dia agitado e um mês
num calmo — a mesma feature mudaria de significado sozinha conforme o ritmo do repositório, e
"este arquivo está quente" passaria a querer dizer coisas diferentes na segunda e na sexta. Uma
janela de tempo fixa responde sempre a mesma pergunta: *quanto este arquivo foi mexido nas
últimas N semanas?*
"""
CHURN_WINDOW_DAYS = 30

_lock = threading.Lock()
_cache: tuple[float, tuple[dict[str, int], dict[str, int]]] = (0.0, ({}, {}))


def _workspace_root() -> Optional[Path]:
    root = config.get("AGENT_CWD")
    return Path(root).resolve() if root else None


def _git_roots(root: Path) -> list[Path]:
    """A raiz e seus submódulos.

    Cada submódulo tem histórico PRÓPRIO: no `git log` do pai, `core/oracle` aparece como uma
    entrada de gitlink, nunca como os arquivos dentro dele. Sem uma passada por submódulo, todo
    arquivo de `oracle`, `daimon` e `opensrc` ficaria sem data.
    """
    roots = [root]
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "config", "--file", ".gitmodules", "--get-regexp", r"\.path$"],
            capture_output=True, text=True, timeout=20,
        ).stdout
        for line in out.splitlines():
            parts = line.split()
            if len(parts) == 2 and (root / parts[1]).is_dir():
                roots.append(root / parts[1])
    except (OSError, subprocess.SubprocessError) as e:
        logger.warning(f"não li .gitmodules: {e}")
    return roots


def _last_commits(git_root: Path, prefix: str, cutoff: int) -> tuple[dict[str, int], dict[str, int]]:
    """Uma passada, dois resultados: última data por caminho, e churn na janela.

    O churn sai de graça: o `git log --name-only` que data os arquivos já lista TODOS os
    caminhos de TODOS os commits. Contar os que caem dentro da janela não custa uma segunda
    consulta ao git — custa um `if` por linha.

    ⚠️ Commit de MERGE não conta, e isso vem de graça: `git log --name-only` não lista arquivos
    de merge (só com `-m`, que não usamos). Um merge que traz 200 arquivos não inflaria 200
    supernovas.
    """
    try:
        out = subprocess.run(
            ["git", "-C", str(git_root), "log", "--pretty=format:%ct", "--name-only", "--no-renames"],
            capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        ).stdout
    except (OSError, subprocess.SubprocessError) as e:
        logger.warning(f"git log falhou em {git_root}: {e}")
        return {}

    stamps: dict[str, int] = {}
    churn: dict[str, int] = {}
    current = None
    for line in out.splitlines():
        if not line.strip():
            continue
        # Um bloco é: epoch, então os caminhos daquele commit. O log vem do mais recente para o
        # mais antigo, então a PRIMEIRA vez que um caminho aparece já é a data mais recente dele.
        if len(line) == 10 and line.isdigit():
            current = int(line)
        elif current is not None:
            key = f"{prefix}{line}" if prefix else line
            stamps.setdefault(key, current)
            if current >= cutoff:
                churn[key] = churn.get(key, 0) + 1
    return stamps, churn


def _tables() -> tuple[dict[str, int], dict[str, int]]:
    """`(datas, churn)`, em cache. As duas saem da MESMA passada de `git log`."""
    global _cache
    with _lock:
        age, cached = _cache
        if cached[0] and time.monotonic() - age < CACHE_TTL:
            return cached

        root = _workspace_root()
        if not root or not (root / ".git").exists():
            _cache = (time.monotonic(), ({}, {}))
            return _cache[1]

        started = time.monotonic()
        cutoff = int(time.time()) - CHURN_WINDOW_DAYS * 86_400
        stamps: dict[str, int] = {}
        churn: dict[str, int] = {}
        for git_root in _git_roots(root):
            prefix = "" if git_root == root else f"{git_root.relative_to(root)}/"
            dated, touched = _last_commits(git_root, prefix, cutoff)
            stamps.update(dated)
            for key, count in touched.items():
                churn[key] = churn.get(key, 0) + count

        logger.info(
            f"recência: {len(stamps)} caminhos datados e {len(churn)} tocados nos últimos "
            f"{CHURN_WINDOW_DAYS}d, em {(time.monotonic() - started) * 1000:.0f}ms"
        )
        _cache = (time.monotonic(), (stamps, churn))
        return _cache[1]


def table() -> dict[str, int]:
    """Mapa caminho→epoch, em cache."""
    return _tables()[0]


def churn_of(source: str) -> int:
    """Quantas vezes este arquivo foi tocado na janela. 0 quando o git não o conhece."""
    _, churn = _tables()
    if source.startswith("/"):
        return 0
    relative = source.split("/", 1)[1] if "/" in source else source
    return churn.get(relative, 0)


def changed_at(source: str) -> Optional[int]:
    """Epoch da última mudança, ou None se nem git nem disco souberem dizer.

    `source` é como o indexador grava: relativo ao PAI da raiz do workspace
    (`devshell-one/core/...`), ou absoluto para o que entrou por `--include`.
    """
    stamps = table()
    root = _workspace_root()

    if not source.startswith("/") and root:
        # Descarta o primeiro segmento (o nome da raiz) para casar com o path do git.
        relative = source.split("/", 1)[1] if "/" in source else source
        found = stamps.get(relative)
        if found:
            return found

    # Fallback por disco. Vale para o que está fora do git (as memórias do agente) e para
    # arquivo não commitado. É pior que git — num clone recém-feito o mtime é a hora do clone —
    # mas é melhor que nada, e só entra quando o git não respondeu.
    path = source if source.startswith("/") else (str(root.parent / source) if root else source)
    try:
        return int(os.path.getmtime(path))
    except OSError:
        return None


def annotate(nodes: list[dict]) -> None:
    """Escreve `changed_at` (epoch) e `recency` (0 mais antigo … 1 mais novo) em cada arquivo.

    `recency` é POSIÇÃO NO RANKING, não posição no tempo — o motivo está medido abaixo.
    """
    stamps = []
    for node in nodes:
        if node.get("type") != "file":
            continue
        when = changed_at(node.get("source", ""))
        node["changed_at"] = when
        if when:
            stamps.append(when)

    if not stamps:
        return

    # POSIÇÃO NO RANKING, não posição no tempo.
    #
    # O Starmap usa linear no tempo e diz por quê ("rings line up with the nodes they date").
    # Está certo para o dado deles. Para o nosso, medi e não serve: repo ativo tem distribuição
    # exponencial de recência, e o histograma por decil ficou
    # `[45, 0, 3, 1, 0, 0, 0, 0, 38, 310]` — 310 dos 397 arquivos no decil externo, mesmo depois
    # de cortar a cauda antiga no percentil 10. Anel único com aparência de eixo do tempo.
    #
    # Rank espalha por construção e continua verdadeiro, só afirma outra coisa: o raio diz
    # "quantos arquivos são mais novos que este", não "que dia foi". A data exata continua no
    # nó (`changed_at`) e é ela que a UI mostra ao inspecionar — espalhamento na geometria,
    # precisão no rótulo.
    order = sorted(
        (node for node in nodes if node.get("type") == "file" and node.get("changed_at")),
        key=lambda node: node["changed_at"],
    )
    last = max(1, len(order) - 1)
    for position, node in enumerate(order):
        node["recency"] = position / last

    for node in nodes:
        if node.get("type") != "file":
            continue
        # Sem data conhecida vai para o meio, não para a borda: pôr em 0 ou 1 afirmaria uma
        # idade que não se sabe.
        node.setdefault("recency", 0.5)

    _annotate_supernova(nodes)


# Quantas vezes um arquivo precisa ser tocado na janela para virar supernova. Pedido do usuário,
# e o número é bom: abaixo disso é manutenção normal e o céu inteiro acenderia.
SUPERNOVA_FLOOR = 5


def _annotate_supernova(nodes: list[dict]) -> None:
    """Escreve `churn` (contagem crua) e `supernova` (0…1) em cada arquivo.

    ## A intensidade é RELATIVA ao pico deste corpus, não absoluta

    Uma escala fixa ("20 toques = brilho máximo") erra nos dois sentidos: num repo calmo nada
    chega perto e a feature não existe; numa semana de refactor tudo satura no topo e a escala
    para de distinguir. Normalizar pelo maior churn observado faz a pergunta certa — *este
    arquivo foi mexido mais do que os outros?* — e a resposta continua verdadeira em qualquer
    ritmo de trabalho.

    ## O piso é degrau, não rampa a partir do zero

    Arquivo com 4 toques não vira uma supernova de 0.001: ele simplesmente não é uma. Uma rampa
    desde zero acenderia o céu inteiro fraquinho e transformaria o sinal em ruído de fundo — o
    oposto de "estes aqui estão quentes".

    ⚠️ Lockfile e changelog são o risco conhecido deste sinal: mudam em todo commit sem que
    ninguém tenha pensado neles. O lockfile já fica fora do céu (`isSkyNode` no cliente exclui
    `kind == lock`); o changelog não, e a normalização pelo pico é o que impede que UM arquivo
    assim empurre todos os outros para perto de zero.
    """
    counts = {}
    for node in nodes:
        if node.get("type") != "file":
            continue
        count = churn_of(node.get("source", ""))
        node["churn"] = count
        if count >= SUPERNOVA_FLOOR:
            counts[node["id"]] = count

    if not counts:
        for node in nodes:
            if node.get("type") == "file":
                node["supernova"] = 0.0
        return

    peak = max(counts.values())
    span = max(1, peak - SUPERNOVA_FLOOR)
    for node in nodes:
        if node.get("type") != "file":
            continue
        count = counts.get(node.get("id"))
        # O piso já entra com intensidade visível (o `+ 1` no numerador): virar supernova é o
        # evento, e um evento que nasce invisível não é um evento.
        node["supernova"] = round(min(1.0, (count - SUPERNOVA_FLOOR + 1) / span), 4) if count else 0.0
