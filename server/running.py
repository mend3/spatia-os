"""Registro das execuções VIVAS — o que está rodando agora, e como interromper.

O buraco que ele fecha: a UI só conhece o stream da própria aba. Duas abas abertas são dois
subprocessos `claude` queimando a mesma janela de uso, e nada na tela dizia isso. `Esc` aborta o
stream local; o subprocesso da outra aba continua até o fim, cobrando. Com webhooks haverá
execuções que nenhuma aba iniciou.

⚠️ **Não é um segundo caminho de instrumentação.** O registro é alimentado pelo `recorder`, que
já atravessa o começo, cada estágio e o `finally` de toda execução. Um contador paralelo
divergiria do diário na primeira exceção.

**Como o encerramento funciona, e por que é cooperativo.** `cancel()` marca a entrada; o
`recorder` vê a marca no próximo evento e para de consumir o generator. Fechar o generator dispara
o `finally` do `brain`, que já faz `terminate()` e, em 5s, `kill()` no subprocesso. Matar o PID
por fora funcionaria e deixaria o `finally` sem rodar — sem métrica fechada, sem linha no diário,
sem estágio encerrado. A execução sumiria em vez de terminar.

Aqui só mora o que está VIVO. O que terminou vai para o diário: vivo e morto na mesma lista é o
que transforma uma tela acionável numa tela de leitura.
"""
import itertools
import threading
import time
from typing import Optional

_lock = threading.Lock()
_entries: dict[str, "Entry"] = {}
# Id curto e legível, próprio da execução viva. Não é o do diário: aquele nasce no `append`, no
# fim, e a tela precisa de um nome para o botão ENCERRAR enquanto a coisa ainda está rodando.
_sequence = itertools.count(1)


class Entry:
    """Uma execução em voo."""

    def __init__(self, question: str, origin: str):
        self.id = f"x-{next(_sequence)}"
        self.question = question
        self.origin = origin
        self.started = time.time()
        self.monotonic = time.monotonic()
        self.stage: Optional[str] = None
        self.tools = 0
        self.turns = 0
        self.cost_usd = 0.0
        self.pid: Optional[int] = None
        # Lido pelo `recorder` a cada evento. Não é `threading.Event` porque não há ninguém
        # esperando nele: o consumidor já acorda a cada evento do stream.
        self.cancelled = False

    def payload(self) -> dict:
        return {
            "id": self.id,
            "question": self.question,
            "origin": self.origin,
            "started": self.started,
            "ms": round((time.monotonic() - self.monotonic) * 1000),
            "stage": self.stage,
            "tools": self.tools,
            "turns": self.turns,
            "cost_usd": round(self.cost_usd, 6),
            "pid": self.pid,
            "cancelled": self.cancelled,
        }


def register(question: str, origin: str) -> Entry:
    entry = Entry(question, origin)
    with _lock:
        _entries[entry.id] = entry
    return entry


def unregister(entry: Entry) -> None:
    with _lock:
        _entries.pop(entry.id, None)


def cancel(run_id: str) -> bool:
    """Marca a execução para parar. Devolve se ela existia — `False` é "já acabou", não erro."""
    with _lock:
        entry = _entries.get(run_id)
    if entry is None:
        return False
    entry.cancelled = True
    return True


def count() -> int:
    """Quantas execuções vivas. É o número que o teto de concorrência compara — e é ESTE, não um
    contador próprio: dois contadores da mesma coisa acabam discordando."""
    with _lock:
        return len(_entries)


def snapshot() -> list[dict]:
    with _lock:
        entries = list(_entries.values())
    return [entry.payload() for entry in sorted(entries, key=lambda item: item.monotonic)]
