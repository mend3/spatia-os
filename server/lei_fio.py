#!/usr/bin/env python3
"""Prova que a CONTINUIDADE sai da argv, não da frase — e que retomar não afrouxa o portão.

    python3 -m server.lei_fio

Mesma doutrina do `scripts/motivo-upstream.py`: sobe um CLI `claude` de mentira e confere o FATO
que o servidor produziu, nunca o que ele diz produzir. Sai 0 quando as cinco leis batem.

⚠️ **Ele mora aqui e não em `scripts/` por acidente de sessão** — o lugar dele é
`scripts/lei-fio.py`, ao lado dos outros oráculos.

☠️ **Ele NÃO toca no diário real.** `journal.DIR` é desviado para um diretório temporário antes de
qualquer execução, e a lei 5 confere a cadeia verdadeira ANTES e DEPOIS para provar que o desvio
funcionou. Um oráculo do fio que escrevesse no ledger encadeado seria um oráculo que corrompe o
que a base tem de mais caro para reconstruir.

As cinco leis:

1. **sem fio, sem `--resume`** — a primeira pergunta não inventa continuidade, e o evento diz `new`;
2. **com fio, `--resume` na argv E a `--settings` do portão junto** — a incógnita do roadmap. A
   retomada não substitui a settings efêmera: as duas convivem no mesmo comando;
3. **o portão conta por EXECUÇÃO** — dois turnos do mesmo fio carimbam chaves `run` DIFERENTES no
   hook, e `_calls` volta a zero entre eles. É o que impede `calls_per_run` de virar por-fio
   quando o `session_id` do CLI para de mudar;
4. **fio quebrado degrada anunciando** — sessão que o CLI não conhece vira `broken` + execução
   nova sem `--resume`, com resposta, em vez de `FALHA DO NÚCLEO`;
5. **o diário registra a continuidade** — toda execução deixa linha com `agent.continuity`, e a
   cadeia continua verificando.
"""
import json
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import brain, capabilities, fio, journal, recorder  # noqa: E402

ORIGEM = "prova"

# O CLI de mentira. Ele não simula o agente: só declara a sessão, registra a argv que recebeu e
# recusa a retomada de uma sessão que nunca existiu — que é exatamente o comportamento medido no
# CLI 2.1.226 (`No conversation found with session ID`, `error_during_execution`, saída 1).
FALSO = '''#!/usr/bin/env python3
import json, os, sys, uuid

argv = sys.argv[1:]
raiz = os.environ["LEI_FIO_DIR"]

def valor(flag):
    return argv[argv.index(flag) + 1] if flag in argv else None

retomar, settings = valor("--resume"), valor("--settings")
gancho = ""
if settings and os.path.isfile(settings):
    gancho = json.load(open(settings))["hooks"]["PreToolUse"][0]["hooks"][0]["command"]

conhecidas = os.path.join(raiz, "sessoes.txt")
vistas = open(conhecidas).read().split() if os.path.isfile(conhecidas) else []

with open(os.path.join(raiz, "argv.jsonl"), "a") as log:
    log.write(json.dumps({"argv": argv, "resume": retomar, "settings": settings,
                          "hook": gancho}) + "\\n")

if retomar and retomar not in vistas:
    print(json.dumps({"type": "result", "subtype": "error_during_execution", "is_error": True,
                      "num_turns": 0, "session_id": retomar}), flush=True)
    sys.exit(1)

sessao = retomar or str(uuid.uuid4())
open(conhecidas, "a").write(sessao + "\\n")
print(json.dumps({"type": "system", "subtype": "init", "session_id": sessao, "cwd": ".",
                  "model": "falso", "tools": [], "mcp_servers": []}), flush=True)
print(json.dumps({"type": "result", "subtype": "success", "result": "resposta falsa",
                  "duration_api_ms": 1, "num_turns": 1, "total_cost_usd": 0.0,
                  "usage": {"input_tokens": 1, "output_tokens": 1}, "session_id": sessao}), flush=True)
'''

# Uma capacidade qualquer COM teto: sem `calls_per_run` declarado a lei 3 não teria o que medir,
# e sem capacidade nenhuma a `--settings` sequer é escrita (`settings_file` devolve `None`).
CAPACIDADE = [{"id": "leitura", "verb": "Read|Glob", "scope": [], "limit": {"calls_per_run": 2}}]


def _rodar(prompt: str) -> list[dict]:
    """Uma execução completa, pelo mesmo caminho da rota: `instrument` envolvendo o `brain`."""
    return list(
        recorder.instrument(
            brain.stream(prompt, ORIGEM), "claude", question=prompt, origin=ORIGEM, journaled=True
        )
    )


def _thread(eventos: list[dict]) -> list[dict]:
    return [item for item in eventos if item.get("t") == "thread"]


def _chave(hook: str) -> str:
    """A chave `run` carimbada no comando do hook, ou `(sem carimbo)`.

    Ela é lida do COMANDO e não de uma variável do servidor: é o texto que o CLI vai executar que
    decide o que o portão conta, e é ele que tem de ser conferido.
    """
    if '{run: "' not in hook:
        return "(sem carimbo)"
    return hook.split('{run: "')[1].split('"')[0]


def _argv(raiz: Path, n: int) -> dict:
    """A n-ésima invocação do CLI falso, ou um registro VAZIO.

    ⚠️ Indexar direto estoura com `IndexError` justamente no caso que interessa — o defeito que
    faz uma execução deixar de acontecer. Um oráculo que morre de traceback não nomeia o que
    quebrou, e nomear é metade do trabalho dele.
    """
    linhas = (raiz / "argv.jsonl").read_text().splitlines()
    if n >= len(linhas):
        return {"argv": [], "resume": "(execução nº %d nunca aconteceu)" % (n + 1),
                "settings": None, "hook": ""}
    return json.loads(linhas[n])


def main() -> int:
    falhas: list[str] = []

    # A cadeia VERDADEIRA, fotografada antes. ⚠️ Ela NÃO precisa estar íntegra: a bifurcação de
    # 2026-08-07 é fato conhecido e documentado em `journal._head`. O que o oráculo exige é que
    # ela saia IDÊNTICA — "não piorei" é a afirmação que ele pode fazer; "está limpa" não é dele.
    real = journal.DIR
    antes = (journal.verify(), journal.used_bytes(), journal.status()["days"])

    raiz = Path(tempfile.mkdtemp(prefix="lei-fio-"))
    os.environ["LEI_FIO_DIR"] = str(raiz)
    binario = raiz / "bin"
    binario.mkdir()
    (binario / "claude").write_text(FALSO, encoding="utf-8")
    (binario / "claude").chmod(0o755)
    os.environ["PATH"] = f"{binario}{os.pathsep}{os.environ['PATH']}"

    journal.DIR = raiz / "journal"
    capabilities._cache = CAPACIDADE  # noqa: SLF001 — o oráculo declara a capacidade sem tocar no disco
    fio.forget(None, "início do oráculo")

    try:
        # ---------- lei 1: sem fio, sem `--resume` ----------
        eventos = _rodar("primeira")
        primeiro = _thread(eventos)
        ok = (
            _argv(raiz, 0)["resume"] is None
            and len(primeiro) == 1
            and primeiro[0]["continuity"] == "new"
            and primeiro[0]["turn"] == 1
            and fio.current(ORIGEM) is not None
        )
        print(f"{'ok ' if ok else 'FALHOU'} 1 sem fio    resume={_argv(raiz, 0)['resume']} "
              f"continuity={primeiro[0]['continuity'] if primeiro else '(nenhum)'}")
        if not ok:
            falhas.append("lei 1: a primeira pergunta não saiu limpa")
        sessao = fio.current(ORIGEM)

        # ---------- lei 2: com fio, `--resume` E `--settings` no MESMO comando ----------
        eventos = _rodar("segunda")
        segundo = _thread(eventos)
        segunda = _argv(raiz, 1)
        ok = (
            segunda["resume"] == sessao
            and segunda["settings"] is not None
            and "/api/gate" in segunda["hook"]
            and bool(segundo)
            and segundo[0]["continuity"] == "resumed"
            and segundo[0]["turn"] == 2
        )
        print(f"{'ok ' if ok else 'FALHOU'} 2 retomada   resume={segunda['resume'] == sessao} "
              f"settings={segunda['settings'] is not None} portão={'/api/gate' in segunda['hook']} "
              f"turn={segundo[0]['turn'] if segundo else '?'}")
        if not ok:
            falhas.append("lei 2: a retomada não conviveu com a settings efêmera")

        # ---------- lei 3: o portão conta por EXECUÇÃO, não por sessão ----------
        chaves = [_chave(_argv(raiz, n)["hook"]) for n in (0, 1)]
        ok = chaves[0] != chaves[1] and not capabilities._calls  # noqa: SLF001
        print(f"{'ok ' if ok else 'FALHOU'} 3 portão     run={chaves[0]} → {chaves[1]} "
              f"(distintos={chaves[0] != chaves[1]}) · contagens vivas={len(capabilities._calls)}")  # noqa: SLF001
        if not ok:
            falhas.append(
                f"lei 3: chaves {chaves} — `calls_per_run` valeria para o fio inteiro, e "
                f"{len(capabilities._calls)} contagens ficaram penduradas"  # noqa: SLF001
            )

        # ---------- lei 4: fio quebrado degrada anunciando ----------
        fantasma = str(uuid.uuid4())
        fio.remember(ORIGEM, fantasma)
        eventos = _rodar("terceira")
        terceira, quarta = _argv(raiz, 2), _argv(raiz, 3)
        marcas = [item["continuity"] for item in _thread(eventos)]
        respondeu = any(item.get("t") == "answer" for item in eventos)
        errou = any(item.get("t") == "error" for item in eventos)
        ok = (
            marcas == ["resumed", "broken"]
            and terceira["resume"] == fantasma
            and quarta["resume"] is None
            and respondeu
            and not errou
        )
        print(f"{'ok ' if ok else 'FALHOU'} 4 quebrado   marcas={marcas} "
              f"retentativa_sem_resume={quarta['resume'] is None} respondeu={respondeu} erro={errou}")
        if not ok:
            falhas.append(f"lei 4: fio quebrado saiu como {marcas}, respondeu={respondeu}, erro={errou}")

        # ---------- lei 5: o diário registra a continuidade, e a cadeia segue íntegra ----------
        dias = journal.status()["days"]
        linhas = [linha for dia in dias for linha in journal.read(dia)]
        execucoes = [linha for linha in linhas if linha.get("kind") is None]
        marcas = [(linha.get("agent") or {}).get("continuity") for linha in execucoes]
        quebra = journal.verify()
        ok = len(execucoes) == 3 and marcas == ["new", "resumed", "broken"] and quebra is None
        print(f"{'ok ' if ok else 'FALHOU'} 5 diário     execuções={len(execucoes)} "
              f"continuity={marcas} cadeia={'íntegra' if quebra is None else quebra}")
        if not ok:
            falhas.append(f"lei 5: {len(execucoes)} execuções, continuity={marcas}, cadeia={quebra}")
    finally:
        journal.DIR = real
        fio.forget(None, "fim do oráculo")
        shutil.rmtree(raiz, ignore_errors=True)

    # A cadeia real, DEPOIS. É o que prova que o desvio de `journal.DIR` funcionou — sem esta
    # conferência o oráculo poderia ter escrito no ledger e ninguém saberia.
    depois = (journal.verify(), journal.used_bytes(), journal.status()["days"])
    intacto = journal.DIR == real and depois == antes
    print(f"{'ok ' if intacto else 'FALHOU'} 0 ledger     {antes[1]} bytes · {len(antes[2])} dias · "
          f"cadeia {'inalterada' if depois[0] == antes[0] else 'MUDOU'}")
    if not intacto:
        falhas.append(f"o oráculo mexeu no diário real: {antes} → {depois}")

    if falhas:
        print("\n".join(falhas), file=sys.stderr)
        return 1
    print("as cinco leis batem: a retomada convive com o portão, e o portão continua por execução")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
