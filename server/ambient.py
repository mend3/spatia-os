"""O barramento do sistema — o que chega à cena sem o operador perguntar.

`/api/ask` é o ciclo de UMA pergunta e fecha no `done`. Este stream vive enquanto a página
viver, e quem escreve nele são produtores que não esperam pergunta nenhuma: os webhooks (o
mundo externo) e o vigia deste módulo (o próprio sistema olhando para si).

## O vigia dispara por TRANSIÇÃO, nunca por relógio

Cada volta compara o fato de agora com o fato da volta anterior e só publica a diferença. Um
aviso que se repete a cada volta ensina o operador a não ler a tela, e ruído é pior que
silêncio: a partir daí ele também não lê o aviso que importava.

⚠️ **Fato que o sistema não sabe é `None`, e `None` nunca vira evento.** Neo4j nunca
configurado, índice sem carimbo de data e credencial sem `expires_at` são ausências
legítimas — anunciá-las seria afirmar sobre o que ninguém mediu.

## `severity` sai do que o operador PODE FAZER, não do tamanho do susto

| nível | o que ele diz | `action` |
|---|---|---|
| `info` | mudou, e não há o que fazer — a tela estava afirmando outra coisa | nunca |
| `warn` | há o que fazer e **pode esperar**: nada na tela está errado agora, uma capacidade degradou | sempre |
| `alert` | há o que fazer **agora**: uma capacidade de que o operador depende parou de responder | sempre |

⚠️ **`warn`/`alert` sem `action` é recusado na fonte.** Um aviso que não nomeia o que fazer é a
definição de ruído, e a guarda existe para que ele não chegue a nascer.

☠️ **Falha de serviço não é `notice`** — é o evento `error` (`service`, `message`), que já tem
leitor. Dois vocabulários para o mesmo fato é o que a REGRA DO CATÁLOGO proíbe.

## Um tópico tem no máximo UM aviso de pé

`_de_pe` guarda o `warn`/`alert` em vigor por tópico e um `info` no mesmo tópico o apaga — é
o que separa *aconteceu* de *está acontecendo*. Quem assina depois recebe os que estão de pé,
com o `at` original: sem isso, abrir a página três minutos depois do boot mostraria uma tela
limpa sobre um índice vencido.
"""
import logging
import threading
import time
from collections import deque
from typing import Callable, Iterable, Optional

from . import config, credentials, graph, graphdb, metrics, recency

logger = logging.getLogger("espatial.ambient")

SEVERITIES = ("info", "warn", "alert")
TOPICS = ("corpus", "topology", "index", "graphdb", "credential")

SCAN_SECONDS = 30

# Índice mais velho que a JANELA DE CHURN significa que todo arquivo que o céu chama de ativo
# mudou depois da última indexação — a busca responde sobre a versão anterior de exatamente os
# arquivos que estão em trabalho. O limiar é o mesmo de `recency`, e não um número escolhido
# aqui: dois limiares para a mesma janela divergiriam na primeira vez que um deles mudasse.
INDEX_STALE_DAYS = recency.CHURN_WINDOW_DAYS

# Antecedência com que uma credencial que expira vira aviso. Uma hora não dá tempo de
# reautorizar entre duas telas; uma semana avisa quem ainda não tem nada a fazer.
CREDENTIAL_WARN_SECONDS = 24 * 3600

_lock = threading.Lock()
_subscribers: list[deque] = []
_de_pe: dict[str, dict] = {}
_ultimo: dict[str, object] = {}

# Primeira volta: não existe "antes", e a distinção decide o que se publica.
_SEM_LEITURA = object()


# ---------------------------------------------------------------- barramento


def subscribe() -> deque:
    """Fila própria por assinante: um cliente lento não segura a entrega dos outros."""
    queue: deque = deque(maxlen=200)
    with _lock:
        _subscribers.append(queue)
        queue.extend(_de_pe.values())
    return queue


def unsubscribe(queue: deque) -> None:
    with _lock:
        if queue in _subscribers:
            _subscribers.remove(queue)


def publish(events: Iterable[dict]) -> None:
    with _lock:
        for queue in _subscribers:
            for event in events:
                queue.append(event)


def standing() -> list[dict]:
    with _lock:
        return list(_de_pe.values())


# ---------------------------------------------------------------- o evento


def notice(
    topic: str, severity: str, label: str, detail: str = "", action: str = ""
) -> dict:
    """Monta um `notice` do protocolo, ou levanta se ele não teria como ser lido."""
    if severity not in SEVERITIES:
        raise ValueError(f"severity {severity!r} fora de {SEVERITIES}")
    if severity == "info" and action:
        raise ValueError("`info` é o nível de quem não tem o que fazer — não carrega `action`")
    if severity != "info" and not action:
        raise ValueError(f"`{severity}` sem `action` é ruído: diga o que o operador faz")
    event = {
        "t": "notice",
        "topic": topic if topic in TOPICS else "other",
        "severity": severity,
        "label": label,
        "detail": detail,
        # O instante do FATO, não o da entrega: um aviso de pé replicado para quem assina
        # depois chegaria parecendo recém-nascido.
        "at": time.time(),
    }
    if action:
        event["action"] = action
    return event


def _registrar(event: dict) -> None:
    topic = event["topic"]
    metrics.notice_total.inc(topic=topic, severity=event["severity"])
    if event["severity"] == "info":
        _de_pe.pop(topic, None)
        metrics.notice_standing.set(0, topic=topic)
    else:
        _de_pe[topic] = event
        metrics.notice_standing.set(1, topic=topic)


# ---------------------------------------------------------------- os observadores
#
# Cada um devolve `(fato, construir)` ou `None`. `fato` é o que se compara entre voltas;
# `construir(anterior)` decide se aquela transição merece evento — e recebe `_SEM_LEITURA` na
# primeira volta, porque estado inicial ruim tem de ser dito e estado inicial bom não é notícia.


def _observar_corpus() -> Optional[tuple]:
    """Reindexação: o `points_count` da coleção muda e o fingerprint da topologia cai junto."""
    servida = graph.served()
    if not servida:
        return None
    stats = servida.get("stats") or {}
    fato = (servida.get("fingerprint"), stats.get("files"), stats.get("chunks"))

    def construir(anterior):
        if anterior is _SEM_LEITURA:
            return None
        return notice(
            "corpus",
            "info",
            "CORPUS REINDEXADO",
            f"{anterior[1]} → {fato[1]} arquivos · {anterior[2]} → {fato[2]} chunks",
        )

    return fato, construir


def _observar_topologia() -> Optional[tuple]:
    """Snapshot do grafo reanexado: a dimensão que o script materializou chegou ao céu.

    O `as_of` de cada snapshot é o fato — o fingerprint do corpus é cego a ele (o valor
    envelhece sem o corpus mudar, `graph._reanexar_snapshots`).
    """
    servida = graph.served()
    if not servida:
        return None
    stats = servida.get("stats") or {}
    dimensoes = {
        "influência": (stats.get("influencia") or {}).get("as_of"),
        "uso": (stats.get("uso") or {}).get("as_of"),
        "alcance": (stats.get("conexao") or {}).get("as_of"),
    }
    fato = tuple(sorted(dimensoes.items()))

    def construir(anterior):
        if anterior is _SEM_LEITURA:
            return None
        antes = dict(anterior)
        mudaram = [nome for nome, quando in dimensoes.items() if antes.get(nome) != quando]
        return notice(
            "topology",
            "info",
            "TOPOLOGIA REANEXADA",
            f"{' · '.join(mudaram)} — o céu servido passou a carregar a medida nova",
        )

    return fato, construir


def _observar_indice() -> Optional[tuple]:
    """Índice velho: a busca continua respondendo, sobre um corpus que não existe mais."""
    idade = graph.age_days()
    if idade is None:
        return None
    vencido = idade >= INDEX_STALE_DAYS
    colecao = config.get("QDRANT_COLLECTION") or "?"

    def construir(anterior):
        if not vencido:
            return (
                None
                if anterior is _SEM_LEITURA
                else notice("index", "info", "ÍNDICE RENOVADO", f"{idade} dia(s) de idade")
            )
        return notice(
            "index",
            "warn",
            "ÍNDICE VENCIDO",
            f"{idade} dias — acima da janela de churn ({INDEX_STALE_DAYS}d), então todo "
            "arquivo que o céu chama de ativo mudou depois da indexação",
            f"reindexe a coleção `{colecao}`; até lá a busca responde sobre a versão anterior",
        )

    return vencido, construir


def _observar_graphdb() -> Optional[tuple]:
    """Neo4j fora: nada na tela quebra (ele nunca está no caminho do quadro), a
    rematerialização é que passa a gravar snapshot vazio."""
    estado = graphdb.describe()
    if not estado.get("configured"):
        return None
    online = bool(estado.get("online"))

    def construir(anterior):
        if online:
            return (
                None
                if anterior is _SEM_LEITURA
                else notice(
                    "graphdb",
                    "info",
                    "NEO4J DE VOLTA",
                    f"{estado.get('corpos')} corpos · {estado.get('vinculos')} vínculos",
                )
            )
        return notice(
            "graphdb",
            "warn",
            "NEO4J FORA",
            f"{estado.get('motivo') or 'sem resposta'} — a rede lateral continua servida do "
            "snapshot em disco, e é ele que a cena desenha",
            "não rode `scripts/vizinhanca.mjs` nem a cadeia que depende dele até o banco "
            "voltar: o snapshot sairia vazio por cima do que já está certo",
        )

    return online, construir


def _observar_credencial() -> Optional[tuple]:
    """Credencial vencendo: `/api/bridge/<provider>` responde 401 sem que nada mais mude."""
    agora = time.time()
    situacao: list[tuple[str, str]] = []
    for provedor in credentials.describe()["providers"]:
        expira = provedor.get("expires_at")
        if not expira:
            continue
        if expira <= agora:
            situacao.append((provedor["provider"], "expirada"))
        elif expira - agora <= CREDENTIAL_WARN_SECONDS:
            situacao.append((provedor["provider"], "expirando"))
    fato = tuple(sorted(situacao))

    def construir(anterior):
        if not fato:
            return (
                None
                if anterior is _SEM_LEITURA
                else notice("credential", "info", "CREDENCIAL RENOVADA", "nenhuma vencida")
            )
        expiradas = [nome for nome, estado in fato if estado == "expirada"]
        nomes = " · ".join(f"{nome} {estado}" for nome, estado in fato)
        return notice(
            "credential",
            "alert" if expiradas else "warn",
            "CREDENCIAL EXPIRADA" if expiradas else "CREDENCIAL EXPIRANDO",
            nomes,
            "reautorize em `#/security` — a ponte responde 401 e o agente vê o erro do "
            "terceiro, não a causa",
        )

    return fato, construir


OBSERVADORES: tuple[tuple[str, Callable[[], Optional[tuple]]], ...] = (
    ("corpus", _observar_corpus),
    ("topology", _observar_topologia),
    ("index", _observar_indice),
    ("graphdb", _observar_graphdb),
    ("credential", _observar_credencial),
)


# ---------------------------------------------------------------- a volta


def scan() -> list[dict]:
    """Uma volta do vigia: publica as transições e devolve o que publicou."""
    saida: list[dict] = []
    for topic, observar in OBSERVADORES:
        try:
            leitura = observar()
        except Exception:  # noqa: BLE001 — observador quebrado não pode calar os outros
            logger.exception(f"observador {topic} falhou")
            continue
        if leitura is None:
            continue
        fato, construir = leitura
        anterior = _ultimo.get(topic, _SEM_LEITURA)
        _ultimo[topic] = fato
        if anterior == fato:
            continue
        try:
            event = construir(anterior)
        except ValueError:
            logger.exception(f"observador {topic} montou um notice ilegível")
            continue
        if event is None:
            continue
        with _lock:
            _registrar(event)
        saida.append(event)
    publish(saida)
    return saida


def watch() -> None:
    def run() -> None:
        while True:
            try:
                scan()
            except Exception:  # noqa: BLE001 — o vigia não pode morrer com o servidor de pé
                logger.exception("volta do vigia falhou")
            time.sleep(SCAN_SECONDS)

    threading.Thread(target=run, name="ambient-watch", daemon=True).start()
