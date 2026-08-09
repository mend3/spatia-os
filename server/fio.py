"""O FIO da conversa: qual sessão do CLI a próxima pergunta continua.

Estado com UM dono (O2). Ele não mora nos três lugares onde caberia à primeira vista, e cada
recusa é um invariante:

- **não no `brain`** — ele é tradutor de `stream-json` para eventos e não guarda nada entre
  execuções; guardar aqui faria a continuidade depender de o processo anterior ter sido o mesmo;
- **não no `journal`** — ledger append-only encadeado por hash. Estado que muda de valor não pode
  morar num arquivo que só aceita acréscimo sem deixar de ser ledger;
- **não no `running`** — lá só vive o que está EM VOO, e o fio existe justamente entre execuções.

**Um fio por ORIGEM.** `console` é a conversa do operador; um canal automático não herda o
contexto do que o operador perguntou na tela. Herdar daria a um caminho o que outro autorizou, e
a origem é o único nome que separa os dois — por isso ela é obrigatória em quem pede o fio.

⚠️ **O fio guarda CONTEXTO, e contexto atravessa mudança de permissão.** Uma transcrição retomada
carrega o que as ferramentas já leram, e apertar as permissões não apaga de lá o que uma
ferramenta hoje proibida colheu ontem. Por isso `permissions.update()` esquece o fio: a pergunta
seguinte nasce sob as regras novas e sem a colheita das antigas. (O portão `PreToolUse` continua
decidindo cada chamada NOVA — isto é sobre o que já está na transcrição, não sobre o que ela pode
fazer.)

**Não sobrevive a restart, de propósito.** A transcrição continua no disco do CLI, mas o servidor
que reiniciou não presenciou a conversa; afirmar continuidade seria afirmar sobre o que ninguém
mediu. Restart devolve `new`, que é a verdade.
"""
import logging
import threading
import time
from typing import Optional

logger = logging.getLogger("espatial.fio")

_lock = threading.Lock()


class Fio:
    """Uma conversa em curso: a sessão do CLI e quantos turnos ela já tem."""

    def __init__(self, session: str):
        self.session = session
        self.turns = 0
        self.since = time.time()
        self.last = self.since


_fios: dict[str, Fio] = {}


def current(origin: str) -> Optional[str]:
    """A sessão a retomar nesta origem, ou `None` — e `None` é "esta pergunta não sabe da
    anterior", nunca "não perguntei ainda"."""
    with _lock:
        fio = _fios.get(origin)
        return fio.session if fio else None


def state(origin: str) -> dict:
    """O fato que o evento `thread` publica. Sempre responde, mesmo sem fio."""
    with _lock:
        fio = _fios.get(origin)
        if not fio:
            return {"session": None, "turns": 0, "since": None}
        return {"session": fio.session, "turns": fio.turns, "since": fio.since}


def remember(origin: str, session: str) -> None:
    """Grava a sessão que o CLI declarou no frame `init`.

    O CLI devolve o MESMO `session_id` ao retomar (só `--fork-session` o troca), então id igual é
    turno a mais no mesmo fio e id diferente abre fio novo. Contar aqui, do fato que o CLI
    declarou, evita um contador paralelo que divergiria na primeira execução abortada.
    """
    if not session:
        return
    with _lock:
        fio = _fios.get(origin)
        if fio is None or fio.session != session:
            fio = Fio(session)
            _fios[origin] = fio
        fio.turns += 1
        fio.last = time.time()


def forget(origin: Optional[str] = None, reason: str = "") -> int:
    """Corta o fio de uma origem, ou de todas. Devolve quantos foram cortados.

    O motivo vai para o log porque um fio que some sem explicação lê como perda de contexto —
    e "eu apertei as permissões" e "o CLI não achou a sessão" são fatos diferentes.
    """
    with _lock:
        cortados = len(_fios) if origin is None else (1 if origin in _fios else 0)
        if origin is None:
            _fios.clear()
        else:
            _fios.pop(origin, None)
    if cortados:
        logger.info(f"fio cortado ({origin or 'todas as origens'}): {reason or 'sem motivo dado'}")
    return cortados


def describe() -> dict:
    """O que a tela precisa para dizer se a próxima pergunta sabe da anterior."""
    with _lock:
        return {
            "threads": [
                {
                    "origin": origem,
                    "session": fio.session,
                    "turns": fio.turns,
                    "since": fio.since,
                    "last": fio.last,
                }
                for origem, fio in sorted(_fios.items())
            ]
        }
