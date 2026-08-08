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
# The far edge of the DORMANT window: commits older than the churn window but newer than this.
# A file worked hard in 30-180d and quiet since is an abandoned hot spot — the extinct comet of
# `docs/catalogo-celeste.md`, which calls it the best signal in the catalog. It costs one more
# `if` in the same `git log` pass, exactly like the current churn did.
DORMANT_WINDOW_DAYS = 180

_lock = threading.Lock()
_cache: tuple[float, tuple[dict, dict, dict, dict]] = (0.0, ({}, {}, {}, {}))


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


# Quantos INTERVALOS um arquivo precisa ter para que a regularidade dele signifique alguma coisa.
#
# 4 intervalos são 5 commits. Abaixo disso o coeficiente de variação é estimado de tão poucas
# amostras que ele diz mais sobre o acaso do que sobre o arquivo — e um pulsar aceso por ruído é
# pior que um pulsar a menos, porque a afirmação do objeto é justamente "isto é REGULAR".
MIN_INTERVALOS = 4


def _regularidade(ritmo: dict[str, list[int]]) -> dict[str, float]:
    """`1 - CV` dos intervalos entre commits, em (0, 1]. Ausente = não há ritmo a afirmar.

    ## Por que o COEFICIENTE DE VARIAÇÃO, e não a variância

    O que define um pulsar não é o período — é a REGULARIDADE dele. Um arquivo tocado a cada hora
    e outro a cada mês são os dois pulsares se os intervalos forem constantes; a variância crua
    diria que o segundo é ordens de grandeza mais irregular só por ter intervalos maiores. O
    coeficiente de variação (`desvio / média`) é adimensional e não depende da escala do período,
    que é exatamente a propriedade que a comparação entre arquivos precisa.

    E ele tem uma âncora que não é escolhida por gosto: para um processo de Poisson — eventos
    completamente aleatórios — o CV vale **1**. Então `1 - CV` é literalmente "quanto mais regular
    que o acaso este arquivo é":

        CV = 0   → perfeitamente periódico   → regularidade 1
        CV = 1   → aleatório (Poisson)       → regularidade 0
        CV > 1   → em rajadas (o humano típico) → negativo, e some da tabela

    ⚠️ A ausência é a resposta certa para "não é pulsar", e é por isso que o valor não-positivo
    não entra no dicionário em vez de entrar como 0: quem consulta pergunta "este arquivo pulsa?",
    e um 0.0 gravado afirmaria que a pergunta foi respondida com "quase". Ela não foi — commit em
    rajada não é um pulsar fraco, é outra coisa.
    """
    saida: dict[str, float] = {}
    for key, (n, soma, soma2) in ritmo.items():
        if n < MIN_INTERVALOS:
            continue
        media = soma / n
        if media <= 0:
            # Todos os commits no mesmo segundo: é um só evento partido, não um ritmo.
            continue
        variancia = max(soma2 / n - media * media, 0.0)
        valor = 1.0 - (variancia ** 0.5) / media
        if valor > 0:
            saida[key] = round(valor, 4)
    return saida


def _last_commits(
    git_root: Path, prefix: str, cutoff: int, dormant_cutoff: int
) -> tuple[dict[str, int], dict[str, int], dict[str, int], dict[str, float]]:
    """Uma passada, QUATRO resultados: última data, churn na janela, churn dormente e RITMO.

    Os três derivados saem de graça: o `git log --name-only` que data os arquivos já lista TODOS
    os caminhos de TODOS os commits. Contar os que caem dentro da janela, e acumular o intervalo
    até a aparição anterior, não custa uma segunda consulta ao git — custa um `if` por linha.

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
        return {}, {}, {}, {}

    stamps: dict[str, int] = {}
    churn: dict[str, int] = {}
    dormant: dict[str, int] = {}
    # Ritmo: por caminho, `[n, soma, soma_dos_quadrados]` dos INTERVALOS entre commits. Três
    # inteiros por arquivo, atualizados em O(1) — nada de guardar a lista de datas, que num repo
    # grande seria a mesma ordem de grandeza do log inteiro na memória.
    ritmo: dict[str, list[int]] = {}
    anterior: dict[str, int] = {}
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
            previo = anterior.get(key)
            if previo is not None:
                # O log desce no tempo, então o intervalo é `anterior - atual` e é positivo.
                acc = ritmo.setdefault(key, [0, 0, 0])
                gap = previo - current
                acc[0] += 1
                acc[1] += gap
                acc[2] += gap * gap
            anterior[key] = current
            if current >= cutoff:
                churn[key] = churn.get(key, 0) + 1
            elif current >= dormant_cutoff:
                # `elif`, não um segundo `if`: as janelas são DISJUNTAS de propósito. Um arquivo
                # que continua sendo mexido soma no churn recente e não pode somar também no
                # dormente — senão "trabalhado e abandonado" incluiria "trabalhado ontem".
                dormant[key] = dormant.get(key, 0) + 1
    return stamps, churn, dormant, _regularidade(ritmo)


def _tables() -> tuple[dict[str, int], dict[str, int], dict[str, int], dict[str, float]]:
    """`(datas, churn, dormente, regularidade)`, em cache — as QUATRO saem da MESMA passada."""
    global _cache
    with _lock:
        age, cached = _cache
        if cached[0] and time.monotonic() - age < CACHE_TTL:
            return cached

        root = _workspace_root()
        if not root or not (root / ".git").exists():
            _cache = (time.monotonic(), ({}, {}, {}, {}))
            return _cache[1]

        started = time.monotonic()
        now = int(time.time())
        cutoff = now - CHURN_WINDOW_DAYS * 86_400
        dormant_cutoff = now - DORMANT_WINDOW_DAYS * 86_400
        stamps: dict[str, int] = {}
        churn: dict[str, int] = {}
        dormant: dict[str, int] = {}
        # Chaves de raízes diferentes são disjuntas (cada uma leva o prefixo do próprio
        # submódulo), então `update` é a fusão correta — não há CV a combinar entre raízes.
        regular: dict[str, float] = {}
        for git_root in _git_roots(root):
            prefix = "" if git_root == root else f"{git_root.relative_to(root)}/"
            dated, touched, cooled, ritmado = _last_commits(git_root, prefix, cutoff, dormant_cutoff)
            stamps.update(dated)
            regular.update(ritmado)
            for key, count in touched.items():
                churn[key] = churn.get(key, 0) + count
            for key, count in cooled.items():
                dormant[key] = dormant.get(key, 0) + count

        logger.info(
            f"recência: {len(stamps)} caminhos datados, {len(churn)} tocados nos últimos "
            f"{CHURN_WINDOW_DAYS}d e {len(dormant)} só entre {CHURN_WINDOW_DAYS} e "
            f"{DORMANT_WINDOW_DAYS}d, {len(regular)} com ritmo regular, em "
            f"{(time.monotonic() - started) * 1000:.0f}ms"
        )
        _cache = (time.monotonic(), (stamps, churn, dormant, regular))
        return _cache[1]


def table() -> dict[str, int]:
    """Mapa caminho→epoch, em cache."""
    return _tables()[0]


def regularity_of(source: str) -> float:
    """Quanto o ritmo de commits deste arquivo é mais regular que o acaso, em (0, 1]. 0 = não é.

    É o fato que faltava para o PULSAR sair do RITMO em vez de sair de `kind` — ver
    `docs/catalogo-celeste.md`, "1. O pulsar tem de sair do RITMO".
    """
    if source.startswith("/"):
        return 0.0
    return _tables()[3].get(_git_key(source), 0.0)


def churn_of(source: str) -> int:
    """Quantas vezes este arquivo foi tocado na janela. 0 quando o git não o conhece."""
    _, churn, _, _ = _tables()
    return churn.get(_git_key(source), 0) if not source.startswith("/") else 0


def dormant_churn_of(source: str) -> int:
    """Toques na janela ANTIGA (entre `CHURN_WINDOW_DAYS` e `DORMANT_WINDOW_DAYS`).

    Alto aqui e baixo em `churn_of` é a assinatura do ponto quente abandonado.
    """
    _, _, dormant, _ = _tables()
    return dormant.get(_git_key(source), 0) if not source.startswith("/") else 0


def _git_key(source: str) -> str:
    """O caminho como o git o conhece: sem o primeiro segmento, que é o nome da raiz."""
    return source.split("/", 1)[1] if "/" in source else source


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
    _annotate_dwarf(nodes)


# Quantas vezes um arquivo precisa ser tocado na janela para virar supernova. Pedido do usuário,
# e o número é bom: abaixo disso é manutenção normal e o céu inteiro acenderia.
SUPERNOVA_FLOOR = 5

# ── Anã branca ──────────────────────────────────────────────────────────────────
#
# Massa mínima, em chunks. **Constante calibrada, e por isso ela EXPIRA** — 13 é o P75 de chunks
# do corpus de 2026-08-07 (P50 5 · P90 25 · máx 289), transcrito como número ABSOLUTO de
# propósito: percentil vivo reclassificaria este corpo quando OUTRO arquivo mudasse, e
# `docs/medicoes-2026-08-07.md` §3.1 refuta percentil com número (74,6% dos nós trocam de classe
# sem que nenhum deles mude). Quem reindexar um corpus muito maior refaz a conta: é o P75 de
# chunks, e nada além disso.
DWARF_MASS_FLOOR = 13

# Fatia mais VELHA do ranking de recência que ainda conta como "parou há muito". `recency` é
# posição no ranking (0 = o mais antigo), uniforme por construção — ver `node["recency"]` acima —,
# então 0,25 é literalmente o quarto mais antigo do céu, e continua sendo isso em qualquer corpus.
DWARF_RECENCY = 0.25


def _annotate_dwarf(nodes: list[dict]) -> None:
    """Escreve `dwarf` (0 ou 1): massa que sobrou depois que a atividade acabou.

    ## O que ela afirma, e o que ela NÃO afirma

    *Este arquivo é pesado e não se move há muito.* Só isso. Anã branca **não julga**: massa
    parada tanto pode ser a peça madura que ninguém precisa tocar quanto o débito que ninguém
    quer tocar, e o céu não tem como distinguir os dois. Quem conhece o arquivo distingue.

    ## Por que ela não é dormência

    `dormant > 0` a exclui de propósito. Dormente é o caminho do cometa-extinto, que é um
    VEREDITO (abandonado) e por isso exige duas janelas. A anã branca fica no meio: parou, mas
    não a ponto de o repositório ter desistido dela. Medido em 2026-08-07: as três populações —
    supernova 38, anã branca 53, cometa-extinto 5 — não se sobrepõem em nenhum par.

    ⚠️ **Essa não-sobreposição é invariante, não sorte.** Ela se apoia neste `dormant` e no
    `churn` zerado; afrouxar qualquer um dos dois faz duas feições reivindicarem o mesmo corpo em
    silêncio, que é o modo de falha desta base. Quem mexer aqui confere as três contagens.

    ## Degrau, não rampa

    `0` ou `1`, como a supernova é degrau acima do piso. "Meio anã branca" não é um estado: ou
    sobrou massa sem atividade, ou não sobrou.
    """
    for node in nodes:
        if node.get("type") != "file":
            continue
        node["dwarf"] = int(
            node.get("chunks", 0) >= DWARF_MASS_FLOOR
            and not node.get("churn")
            and not node.get("dormant", 0) > 0
            and node.get("recency", 0.5) <= DWARF_RECENCY
        )


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
        # RITMO — o fato que o pulsar precisava para sair de `kind`. Ele sai da mesma passada de
        # `git log` que o churn, então escrevê-lo aqui não custa varredura nenhuma. 0 = não pulsa.
        node["regularity"] = regularity_of(node.get("source", ""))
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
        # Churn da janela antiga, cru. Quem decide o que é "alto" é o cliente, com o mesmo
        # critério relativo ao pico que a supernova usa — normalizar aqui exigiria duas passadas.
        node["dormant"] = dormant_churn_of(node.get("source", ""))
