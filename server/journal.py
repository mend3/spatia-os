"""Diário das execuções: um registro por decisão, em disco, encadeado.

Ledger e não log (§2.4 de OS-SCREENS). O que o separa de um arquivo de log:

- **append-only**, um arquivo por dia, nunca reescrito no meio;
- **uma linha por EXECUÇÃO**, não por evento — `token` por letra não é decisão;
- **as flags do CLI no instante do disparo**: sem elas o diário diz "rodou Bash" sem dizer que
  Bash estava permitido naquele momento, o que é registro e não auditoria;
- **encadeamento por hash** — cada linha carrega o sha256 da anterior, então uma edição no meio
  aparece em `verify()` em vez de passar.

Mora ao lado do `recorder` porque ele já é o único ponto por onde todo evento passa: o que se vê,
o que se mede e o que fica registrado saem do mesmo stream, e não há divergência possível.

⚠️ **O modo de falha projetado é RECUSAR, não deixar de gravar.** Cruzado o teto de disco,
`accepting()` fica falso e `/api/ask` devolve 503 — um sistema que executa sem registrar é pior
que um que recusa.
"""
import hashlib
import json
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import config, permissions

logger = logging.getLogger("espatial.journal")

DIR = config.ROOT / ".cache" / "journal"

# Teto de disco declarado. É o número que `accepting()` compara, e ele existe para ser lido na
# tela: um limite que só o código conhece não é política, é surpresa.
MAX_BYTES = 256 * 1024 * 1024

# O elo em que a próxima linha se prende. `None` = ainda não procurado em disco.
_last_hash: Optional[str] = None
_lock = threading.Lock()


def _files() -> list[Path]:
    return sorted(DIR.glob("*.jsonl")) if DIR.is_dir() else []


def _path_for(when: float) -> Path:
    # Data LOCAL: o operador procura pelo dia que ele viveu, não pelo dia em UTC.
    return DIR / f"{datetime.fromtimestamp(when).strftime('%Y-%m-%d')}.jsonl"


def used_bytes() -> int:
    return sum(path.stat().st_size for path in _files())


def accepting() -> bool:
    """Se ainda cabe registrar. Falso aqui é execução recusada lá em cima."""
    return used_bytes() < MAX_BYTES


def status() -> dict:
    """O que a tela precisa dizer sobre o próprio diário."""
    used = used_bytes()
    return {
        "dir": str(DIR),
        "days": [path.stem for path in _files()],
        "used_bytes": used,
        "max_bytes": MAX_BYTES,
        "accepting": used < MAX_BYTES,
    }


def _head() -> str:
    """sha256 da última linha gravada, recuperado do disco na primeira vez.

    A cadeia atravessa a virada do dia: o elo é a última linha ESCRITA, não a última do arquivo
    de hoje — senão cada meia-noite abriria uma corrente nova e a anterior deixaria de ser
    verificável a partir dela.
    """
    global _last_hash
    if _last_hash is not None:
        return _last_hash
    _last_hash = ""
    for path in reversed(_files()):
        last = b""
        with path.open("rb") as handle:
            for raw in handle:
                if raw.strip():
                    last = raw
        if last:
            _last_hash = hashlib.sha256(last.rstrip(b"\n")).hexdigest()
            break
    return _last_hash


def _next_id(when: float) -> str:
    path = _path_for(when)
    used = 0
    if path.is_file():
        with path.open("rb") as handle:
            used = sum(1 for raw in handle if raw.strip())
    return f"r-{datetime.fromtimestamp(when).strftime('%Y-%m-%d')}-{used + 1:03d}"


def begin(question: str, origin: str, brain: str = "") -> dict:
    """Abre o registro no instante do disparo.

    As flags são fotografadas AQUI e não no fim: o operador pode mexer no painel de permissões
    enquanto a execução roda, e o diário estaria afirmando uma permissão que não é a que rodou.

    O `id` nasce vazio de propósito — ele é atribuído no `append`, sob o mesmo lock que lê a
    contagem do dia, senão duas execuções simultâneas ganhariam o mesmo número.

    ## `agent` — quem executou, e por que ele não é o `origin`

    O P5 de `docs/integracao-neo4j.md` precisa de identidade de agente, e a auditoria de 2026-08-08
    mostrou que o diário não a tinha: o `origin` é **canal** (`console`, `files`, `github`), não
    quem rodou. Materializar `(:Agent {id: "console"})` batizaria uma porta de entrada de entidade.

    O fato existia e estava sendo jogado fora — `recorder.run.model` recebe o modelo do frame
    `init` do brain e só alimentava métrica. Aqui ele vira registro.

    ⚠️ `model` nasce `None` e é preenchido quando o frame `init` chega. `None` é "o brain não
    declarou", nunca "modelo padrão" — a mesma regra de `null` ≠ `0` que governa a influência.
    Execuções anteriores a esta mudança não têm a chave, e isso também é honesto: elas rodaram
    num tempo em que ninguém mediu.
    """
    return {
        "id": None,
        "started": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "origin": origin,
        "agent": {"brain": brain or None, "model": None, "session": None},
        "question": question,
        "flags": permissions.cli_flags(),
        "tools": [],
        "sources": [],
        "answer": "",
        "cost_usd": 0.0,
        "tokens": {},
        "turns": 0,
        "outcome": "aborted",
    }


def lifecycle(kind: str, detail: str = "") -> Optional[str]:
    """Registra um evento de VIDA do servidor na mesma cadeia das execuções.

    É o que responde "caiu ou eu fechei?". A resposta não está no que a linha diz, está na
    existência dela: um encerramento limpo deixa `shutdown`, uma queda não deixa nada, e o `boot`
    seguinte fica órfão. Em arquivo separado a comparação exigiria cruzar dois relógios.

    Carrega os mesmos campos de uma execução para que quem lê o dia não precise de dois formatos
    — o que a distingue é `kind`, e quem só quer execuções filtra por ele.
    """
    return append(
        {
            "id": None,
            "kind": kind,
            "started": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "origin": "server",
            # Vida do servidor não tem agente. `None` e não `{}`: ninguém executou.
            "agent": None,
            "question": detail,
            "flags": [],
            "tools": [],
            "sources": [],
            "answer": "",
            "cost_usd": 0.0,
            "tokens": {},
            "turns": 0,
            "outcome": kind,
        }
    )


def denial(what: str, source: str, reason: str) -> Optional[str]:
    """Registra uma RECUSA na mesma cadeia.

    Um endpoint que recusa em silêncio é indistinguível de um endpoint que ninguém está usando —
    e um toggle desligado que nunca aparece sendo respeitado é um toggle em que se acredita, não
    um que se verifica. É o mesmo argumento nos dois casos.
    """
    return append(
        {
            "id": None,
            "kind": "denial",
            "started": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "origin": source,
            # Recusa não executou nada, logo não teve agente.
            "agent": None,
            "question": f"{what}: {reason}",
            "flags": [],
            "tools": [],
            "sources": [],
            "answer": "",
            "cost_usd": 0.0,
            "tokens": {},
            "turns": 0,
            "outcome": "denied",
        }
    )


def append(record: dict) -> Optional[str]:
    """Fecha o registro em disco e devolve o id.

    Nunca levanta: o diário não pode derrubar uma resposta que já foi entregue ao operador. O que
    ele faz quando não consegue gravar é recusar a PRÓXIMA execução, por `accepting()`.
    """
    try:
        DIR.mkdir(parents=True, exist_ok=True)
        with _lock:
            global _last_hash
            when = time.time()
            entry = {**record, "id": _next_id(when), "prev": _head()}
            line = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
            with _path_for(when).open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
            _last_hash = hashlib.sha256(line.encode("utf-8")).hexdigest()
            return entry["id"]
    except OSError as error:
        logger.error(f"não gravei o diário: {error}")
        return None


def read(day: str) -> list[dict]:
    """Os registros de um dia, na ordem em que foram gravados."""
    path = DIR / f"{day}.jsonl"
    if not path.is_file():
        return []
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            if not raw.strip():
                continue
            try:
                records.append(json.loads(raw))
            except json.JSONDecodeError:
                # Linha truncada por queda no meio de um write. Ela não vira registro, mas some
                # do total: quem lê o dia tem de saber que o arquivo tem um buraco.
                logger.warning(f"linha ilegível em {path.name}")
    return records


def summary() -> list[dict]:
    """Custo e contagem por dia.

    O agregado sai do disco e não de um contador em memória — é o único número de gasto que
    sobrevive a um restart, e é por isso que ele mora aqui e não no `metrics`.
    """
    return [
        {
            "day": path.stem,
            "runs": len(runs),
            "cost_usd": round(sum(float(entry.get("cost_usd") or 0) for entry in runs), 6),
            "errors": sum(1 for entry in runs if entry.get("outcome") != "success"),
        }
        for path in _files()
        for runs in [read(path.stem)]
    ]


def verify() -> Optional[dict]:
    """Percorre a cadeia inteira e devolve a primeira linha cujo elo não bate, ou `None`.

    É o que torna "não sem que apareça" uma afirmação testável em vez de uma promessa.
    """
    expected = ""
    for path in _files():
        with path.open("rb") as handle:
            for number, raw in enumerate(handle, start=1):
                if not raw.strip():
                    continue
                line = raw.rstrip(b"\n")
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    return {"file": path.name, "line": number, "problem": "ilegível"}
                if entry.get("prev", "") != expected:
                    return {
                        "file": path.name,
                        "line": number,
                        "id": entry.get("id"),
                        "problem": "elo não bate",
                    }
                expected = hashlib.sha256(line).hexdigest()
    return None
