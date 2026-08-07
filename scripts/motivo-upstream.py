#!/usr/bin/env python3
"""Prova que o MOTIVO da falha de upstream sai do fato, não da frase.

Sobe um upstream de mentira que responde o que se pedir e confere, em cada família de falha, o
`status` e o `reason` que `net.UpstreamError` carrega. Sai 0 quando os quatro batem.

⚠️ Existe porque dois dos seis rótulos de `metrics.UPSTREAM_REASONS` (`http_client`,
`http_server`) não tinham NINGUÉM capaz de emiti-los: `app.py` respondia `unreachable` fixo e
`recorder._reason` adivinhava pela mensagem, que nunca contém o status.
"""
import http.server
import socket
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import net  # noqa: E402


class Falso(http.server.BaseHTTPRequestHandler):
    codigo = 200
    demora = 0.0

    def do_GET(self):  # noqa: N802
        if Falso.demora:
            time.sleep(Falso.demora)
        self.send_response(Falso.codigo)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"detalhe": "resposta do upstream de mentira"}')

    # O nome `format` é da assinatura da classe base — trocá-lo quebra a sobrescrita.
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        pass


def porta_morta() -> int:
    """Uma porta que ninguém escuta — para o caso 'inalcançável'."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> int:
    servidor = http.server.HTTPServer(("127.0.0.1", 0), Falso)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{servidor.server_port}"

    # ⚠️ O código vai no CASO, não numa atribuição antes do laço: mexer no atributo de classe ao
    # montar a lista faz as duas chamadas saírem com o último valor — e o teste passa dizendo que
    # 401 vira `http_server`. Foi o primeiro resultado desta bancada, e era defeito dela.
    casos = [
        ("chave inválida", 401, "http_client"),
        ("serviço fora", 503, "http_server"),
    ]

    falhas = []
    for nome, codigo, motivo_esperado in casos:
        Falso.codigo, Falso.demora = codigo, 0.0
        status_esperado = codigo
        try:
            net.get_json("qdrant", f"{base}/", timeout=30.0)
            falhas.append(f"{nome}: não levantou UpstreamError")
            continue
        except net.UpstreamError as e:
            ok = e.status == status_esperado and e.reason == motivo_esperado
            print(f"{'ok ' if ok else 'FALHOU'} {nome:16} status={e.status:<4} reason={e.reason}")
            if not ok:
                falhas.append(f"{nome}: status={e.status} reason={e.reason}")

    # Inalcançável: porta sem ninguém do outro lado.
    try:
        net.get_json("qdrant", f"http://127.0.0.1:{porta_morta()}/", timeout=2.0)
        falhas.append("inalcançável: não levantou")
    except net.UpstreamError as e:
        ok = e.status == 0 and e.reason == "unreachable"
        print(f"{'ok ' if ok else 'FALHOU'} {'inalcançável':16} status={e.status:<4} reason={e.reason}")
        if not ok:
            falhas.append(f"inalcançável: status={e.status} reason={e.reason}")

    # Timeout: o upstream existe e não responde a tempo. É o motivo que o status NÃO distingue.
    Falso.codigo, Falso.demora = 200, 1.5
    try:
        net.get_json("qdrant", f"{base}/", timeout=0.3)
        falhas.append("timeout: não levantou")
    except net.UpstreamError as e:
        ok = e.reason == "timeout"
        print(f"{'ok ' if ok else 'FALHOU'} {'timeout':16} status={e.status:<4} reason={e.reason}")
        if not ok:
            falhas.append(f"timeout: reason={e.reason}")

    servidor.shutdown()

    from server import metrics

    desconhecidos = [c for c in casos if c[2] not in metrics.UPSTREAM_REASONS]
    if desconhecidos:
        falhas.append(f"motivo fora de UPSTREAM_REASONS: {desconhecidos}")

    if falhas:
        print("\n".join(falhas), file=sys.stderr)
        return 1
    print("os quatro motivos saem do fato, e todos existem em UPSTREAM_REASONS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
