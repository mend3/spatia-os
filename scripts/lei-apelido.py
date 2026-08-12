#!/usr/bin/env python3
"""Proves the ALIAS swap reclaims the previous collection — and that it is found by the right ruler.

    python3 scripts/lei-apelido.py

Same doctrine as `server/lei_fio.py` and `scripts/motivo-upstream.py`: stand up a fake upstream and
check the FACT the code produced, never what it claims to produce. Exits 0 when the five laws hold.

☠️ **The fake Qdrant reproduces the MEASURED trap, and that is what gives this law its power.**
Queried with an ALIAS name, `/collections/<name>/aliases` returns an EMPTY list — measured against
the Qdrant v1.19 on this machine. Whoever looks up the previous collection there gets `None`
ALWAYS, and the swap starts leaking a full copy of the corpus to disk on every reindex, with no
error anywhere. The right ruler is the GLOBAL registry (`/aliases`).

⚠️ **A double that answered "correctly" would prove nothing** — it would let the old ruler pass
green. §0 checks the premise itself: the double must reproduce the emptiness.

☠️ **It never talks to the operator's Qdrant.** `QDRANT_URL` is redirected to the fake server via
`config.definir`, and the runtime store goes to a temp dir — §0 checks the real `ambiente.json` is
intact at the end, the way `lei-config` does.

The five laws:

1. **the swap NAMES the previous one** — the alias pointed at the old collection, and
   `trocar_apelido` returns it;
2. **the previous one is RECLAIMED** — reindexing N times leaves ONE physical collection, never N;
3. **the alias points at the NEW one after the swap** — reclaiming cannot precede the swap, or
   there is a window where the alias resolves to a deleted collection;
4. **swapping to the SAME collection does not delete it** — `previous == target` is the reindex
   that did not change destination, and reclaiming there would destroy the LIVE collection;
5. **a missing alias invents no previous** — the first indexing has nothing to reclaim.
"""
import json
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import config, indexador, net  # noqa: E402

GREEN, RED, DIM, END = "\x1b[32m", "\x1b[31m", "\x1b[2m", "\x1b[0m"
failures = 0


def check(section: str, ok: bool, phrase: str) -> None:
    global failures
    if ok:
        print(f"  {GREEN}✓{END} {DIM}{section}{END} {phrase}")
    else:
        failures += 1
        print(f"{RED}✗ {section} {phrase}{END}")


# ───────────────────────────────────────────────────────────── the fake Qdrant


class FakeState:
    """What the double serves: existing collections, and alias → collection."""

    def __init__(self) -> None:
        self.collections: set[str] = set()
        self.aliases: dict[str, str] = {}


STATE = FakeState()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:  # quiet: the oracle owns the report
        pass

    def _reply(self, body: dict, status: int = 200) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _alias_rows(self, of_collection: str | None = None) -> list[dict]:
        return [
            {"alias_name": a, "collection_name": c}
            for a, c in STATE.aliases.items()
            if of_collection is None or c == of_collection
        ]

    def do_GET(self) -> None:
        if self.path == "/aliases":
            self._reply({"result": {"aliases": self._alias_rows()}})
            return
        if self.path.startswith("/collections/") and self.path.endswith("/aliases"):
            # ☠️ THE TRAP, reproduced as measured: for an ALIAS name this is EMPTY.
            name = self.path[len("/collections/") : -len("/aliases")]
            rows = [] if name in STATE.aliases else self._alias_rows(name)
            self._reply({"result": {"aliases": rows}})
            return
        self._reply({"status": {"error": "not found"}}, 404)

    def do_POST(self) -> None:
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if self.path == "/collections/aliases":
            for action in body.get("actions") or []:
                if "create_alias" in action:
                    spec = action["create_alias"]
                    STATE.aliases[spec["alias_name"]] = spec["collection_name"]
                elif "delete_alias" in action:
                    STATE.aliases.pop(action["delete_alias"]["alias_name"], None)
            self._reply({"result": True, "status": "ok"})
            return
        self._reply({"status": {"error": "not found"}}, 404)

    def do_DELETE(self) -> None:
        if self.path.startswith("/collections/"):
            STATE.collections.discard(self.path[len("/collections/") :])
            self._reply({"result": True, "status": "ok"})
            return
        self._reply({"status": {"error": "not found"}}, 404)


def _swap_and_reclaim(alias: str, target: str) -> str | None:
    """The call site under test: swap, then reclaim — in that order, and never the live one."""
    previous = indexador.trocar_apelido(alias, target)
    if previous and previous != target:
        indexador.apagar_colecao(previous)
    return previous


def main() -> int:
    real_store = config.RUNTIME_STORE
    before = real_store.read_text(encoding="utf-8") if real_store.is_file() else None

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        with tempfile.TemporaryDirectory() as tmp:
            config.RUNTIME_STORE = Path(tmp) / "ambiente.json"
            config._runtime = None
            config.definir({"QDRANT_URL": base})

            # §0 — the premise: the double reproduces the emptiness, or the law guards nothing.
            STATE.collections = {"c__1", "c__2"}
            STATE.aliases = {"c": "c__1"}

            by_collection = net.get_json("qdrant", f"{base}/collections/c/aliases")
            check(
                "§0",
                (by_collection.get("result") or {}).get("aliases") == [],
                "consultado por APELIDO, `/collections/<nome>/aliases` devolve VAZIO — a armadilha medida",
            )
            registry = (net.get_json("qdrant", f"{base}/aliases").get("result") or {}).get("aliases")
            check("§0", len(registry or []) == 1, "o registro GLOBAL `/aliases` conhece o apelido — é ele a régua")

            # §1 · §3 — the swap names the previous one, and points at the new one.
            previous = indexador.trocar_apelido("c", "c__2")
            check("§1", previous == "c__1", "a troca NOMEIA a coleção anterior")
            check("§3", STATE.aliases.get("c") == "c__2", "e o apelido passa a resolver para a NOVA")

            # §2 — the previous one is reclaimed, and exactly one survives.
            if previous and previous != "c__2":
                indexador.apagar_colecao(previous)
            check("§2", STATE.collections == {"c__2"}, "a anterior é RECOLHIDA — sobra uma física, nunca N")

            for n in (3, 4, 5):
                STATE.collections.add(f"c__{n}")
                _swap_and_reclaim("c", f"c__{n}")
            check("§2", STATE.collections == {"c__5"}, "e quatro trocas seguidas continuam deixando UMA")

            # §4 — swapping to the same collection must not reclaim the LIVE one.
            same = _swap_and_reclaim("c", "c__5")
            check("§4", same == "c__5", "trocar para a MESMA devolve ela própria…")
            check("§4", STATE.collections == {"c__5"}, "…e a guarda `anterior != para` impede apagar a VIVA")

            # §5 — the first indexing invents no previous.
            STATE.aliases.pop("c", None)
            STATE.collections = {"n__1"}
            check("§5", _swap_and_reclaim("n", "n__1") is None, "apelido inexistente não inventa anterior")
            check("§5", STATE.collections == {"n__1"}, "e nada é recolhido na primeira indexação")
    finally:
        server.shutdown()
        config.RUNTIME_STORE = real_store
        config._runtime = None

    after = real_store.read_text(encoding="utf-8") if real_store.is_file() else None
    check("§0", before == after, "o `ambiente.json` do operador ficou INTACTO")

    print(
        f"\n{GREEN}✓ a lei vale{END}  {DIM}a troca recolhe a anterior, e a régua é o registro GLOBAL{END}"
        if not failures
        else f"\n{RED}✗ {failures} falha(s){END}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
