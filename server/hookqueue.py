"""Fila de entregas EM DISCO.

A fila anterior era `deque(maxlen=200)` em memória, e a §2.8 é explícita sobre por que isso não
serve: **fila que evapora no restart transforma "recebido" em mentira.** O remetente leu 202, o
servidor reiniciou, e a entrega deixou de existir sem que ninguém dos dois lados soubesse.

Um arquivo JSONL, uma linha por entrega, com um marcador de leitura à parte. Não é um broker: não
há retry com recuo, ordenação por prioridade nem entrega exatamente-uma-vez. É durabilidade —
a entrega sobrevive ao processo que a recebeu, e é isso que o 202 promete.

⚠️ **O marcador é o número de linhas JÁ DRENADAS, não um offset de bytes.** Offset quebraria se
uma linha fosse reescrita; contagem de linhas num arquivo append-only não tem como mentir.
"""
import json
import logging
import threading
import time
from typing import Optional

from . import config

logger = logging.getLogger("espatial.hookqueue")

DIR = config.ROOT / ".cache" / "hooks"
QUEUE = DIR / "queue.jsonl"
CURSOR = DIR / "cursor"

# Teto de linhas retidas. Cruzado, a fila é COMPACTADA (o já drenado sai), não truncada pelo fim:
# jogar fora o que ainda não foi entregue seria perder exatamente o que a fila existe para
# guardar.
MAX_LINES = 5000

_lock = threading.Lock()


def _read_cursor() -> int:
    try:
        return int(CURSOR.read_text(encoding="utf-8").strip() or 0)
    except (OSError, ValueError):
        # Sem marcador legível a fila é lida do começo. Reentregar é recuperável; pular não é.
        return 0


def enqueue(source: str, events: list[dict], summary: str) -> Optional[int]:
    """Grava a entrega e devolve a posição dela. `None` quando o disco recusou."""
    try:
        DIR.mkdir(parents=True, exist_ok=True)
        line = json.dumps(
            {"at": time.time(), "source": source, "summary": summary, "events": events},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        with _lock:
            with QUEUE.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
            return _count_locked()
    except OSError as error:
        logger.error(f"não enfileirei a entrega de {source}: {error}")
        return None


def _count_locked() -> int:
    if not QUEUE.is_file():
        return 0
    with QUEUE.open("rb") as handle:
        return sum(1 for raw in handle if raw.strip())


def pending() -> list[dict]:
    """O que ainda não foi drenado, na ordem em que chegou."""
    with _lock:
        if not QUEUE.is_file():
            return []
        cursor = _read_cursor()
        out = []
        with QUEUE.open("r", encoding="utf-8") as handle:
            for number, raw in enumerate(handle):
                if not raw.strip() or number < cursor:
                    continue
                try:
                    out.append({**json.loads(raw), "position": number})
                except json.JSONDecodeError:
                    logger.warning("linha ilegível na fila de hooks")
        return out


def drain() -> list[dict]:
    """Devolve o pendente e AVANÇA o marcador.

    Avançar depois de ler, e não durante, é o que faz uma queda no meio reentregar em vez de
    perder — pelo mesmo motivo que o marcador conta linhas e não bytes.
    """
    items = pending()
    if not items:
        return []
    with _lock:
        try:
            DIR.mkdir(parents=True, exist_ok=True)
            CURSOR.write_text(str(items[-1]["position"] + 1), encoding="utf-8")
            if _count_locked() > MAX_LINES:
                _compact_locked()
        except OSError as error:
            # Marcador não gravado significa reentrega na próxima leitura. É o lado seguro do
            # erro, e é por isso que ele não derruba a drenagem.
            logger.error(f"não avancei o marcador da fila: {error}")
    return items


def _compact_locked() -> None:
    """Reescreve a fila só com o que ainda não foi drenado, e zera o marcador."""
    cursor = _read_cursor()
    restante = []
    with QUEUE.open("r", encoding="utf-8") as handle:
        for number, raw in enumerate(handle):
            if raw.strip() and number >= cursor:
                restante.append(raw)
    QUEUE.write_text("".join(restante), encoding="utf-8")
    CURSOR.write_text("0", encoding="utf-8")
    logger.info(f"fila compactada: {len(restante)} entregas retidas")


def status() -> dict:
    with _lock:
        total = _count_locked()
        cursor = _read_cursor()
    return {
        "path": str(QUEUE),
        "total": total,
        "drained": cursor,
        "pending": max(0, total - cursor),
        "max_lines": MAX_LINES,
    }
