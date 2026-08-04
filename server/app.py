"""Servidor HTTP: estáticos + API JSON + o stream SSE que dirige a cena.

Só biblioteca padrão. A única rota interessante é `/api/ask`: ela mantém a conexão aberta e
empurra cada evento do ciclo cognitivo assim que ele acontece — a animação na tela é o
tempo real da execução, não um replay.

Sem CORS por design: a página é servida por este mesmo processo, e todo upstream (Qdrant,
Ollama, provedores de busca) é acessado por aqui. O browser fala com uma origem só.
"""
import json
import logging
import mimetypes
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import agent, brain, config, embed, files, graph, llm, metrics, net, permissions, qdrant, recorder, speech, websearch

logger = logging.getLogger("espatial.app")

VERSION = "0.1.0"
STATIC_ROOT = config.ROOT
ALLOWED_STATIC_DIRS = ("src", "vendor", "assets")
MAX_BODY_BYTES = 8192

# Rota → label de métrica. O mapa existe para o label ser um enum fechado: usar o path
# cru como dimensão é o jeito clássico de explodir a cardinalidade de um /metrics.
ROUTE_LABELS = {
    "/api/ask": "ask",
    "/api/search": "search",
    "/api/graph": "graph",
    "/api/node": "node",
    "/api/file": "file",
    "/api/health": "health",
    "/api/client": "client",
    "/api/config": "config",
    "/api/tts": "tts",
    "/metrics": "metrics",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "espatial-os"
    protocol_version = "HTTP/1.1"

    def send_response(self, code, message=None):  # noqa: N802 — assinatura da stdlib
        # Interceptado só para o label `status` da métrica: é o único ponto por onde toda
        # resposta passa, inclusive as de erro tratadas no `except`.
        self._status = code
        super().send_response(code, message)

    def log_message(self, fmt: str, *args) -> None:
        # O default escreve em stderr sem nível, e a UI faz muitas chamadas curtas — isso
        # viraria ruído. Erro real já é logado por quem o trata.
        logger.debug(fmt, *args)

    # ---------- roteamento ----------

    def do_POST(self) -> None:  # noqa: N802 — assinatura da stdlib
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path not in ("/api/client", "/api/config", "/api/tts"):
            self._json({"error": "rota não encontrada"}, status=404)
            return
        # Ação com efeito (muda permissão) ou com custo (sintetiza áudio): mesma barreira
        # do /api/ask, para que outra página não use este servidor como serviço próprio.
        if parsed.path in ("/api/config", "/api/tts") and not self._same_site():
            self._json({"error": "requisição cross-site recusada"}, status=403)
            return
        try:
            length = min(int(self.headers.get("Content-Length") or 0), MAX_BODY_BYTES)
            payload = json.loads(self.rfile.read(length) or b"{}")
            if parsed.path == "/api/config":
                permissions.update(payload)
                self._json(permissions.describe())
                return
            if parsed.path == "/api/tts":
                self._tts(payload)
                return
            self._client_metrics(payload)
            self._json({"ok": True})
        except (json.JSONDecodeError, ValueError) as e:
            self._json({"error": f"corpo inválido: {e}"}, status=400)
        finally:
            label = ROUTE_LABELS.get(parsed.path, "client")
            metrics.http_requests.inc(route=label, status=str(getattr(self, "_status", 0)))

    def _tts(self, payload: dict) -> None:
        """Sintetiza e devolve MP3 — a única rota que não responde JSON."""
        text = str(payload.get("text") or "").strip()
        if not text:
            self._json({"error": "texto vazio"}, status=400)
            return
        clock = time.monotonic()
        try:
            audio = speech.synthesize(text, str(payload.get("voice") or ""))
        except net.UpstreamError as e:
            metrics.upstream_errors.inc(service="tts", reason="unreachable")
            metrics.upstream_up.set(0, service="tts")
            self._json({"error": str(e), "service": "tts"}, status=502)
            return

        metrics.upstream_up.set(1, service="tts")
        metrics.tts_duration.observe(time.monotonic() - clock)
        metrics.tts_chars.observe(len(text))
        metrics.tts_total.inc(outcome="success")

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(audio)

    def _client_metrics(self, payload: dict) -> None:
        """Telemetria da cena. O servidor não tem como saber que a visualização engasgou —
        só o loop de render sabe, e 400 nós a 20fps é regressão de produto."""
        if payload.get("boot"):
            metrics.client_boot.inc(outcome=str(payload["boot"]))
        if payload.get("fps"):
            metrics.client_fps.observe(float(payload["fps"]))
        if payload.get("long_frames"):
            metrics.client_long_frames.inc(float(payload["long_frames"]))
        if payload.get("nodes") is not None:
            metrics.client_nodes.set(float(payload["nodes"]))
        if payload.get("audio") is not None:
            metrics.client_audio.set(1 if payload["audio"] else 0)

    def do_GET(self) -> None:  # noqa: N802 — assinatura da stdlib
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        clock = time.monotonic()
        label = ROUTE_LABELS.get(route, "static")

        try:
            if route == "/metrics":
                self._metrics()
            elif route == "/api/health":
                self._json(self._health())
            elif route == "/api/config":
                self._json(permissions.describe())
            elif route == "/api/graph":
                self._json(graph.load(force=query.get("force", ["0"])[0] == "1"))
            elif route == "/api/search":
                self._json(self._search(query))
            elif route == "/api/node":
                self._json(self._node(query))
            elif route == "/api/file":
                self._json(files.read(_first(query, "path")))
            elif route == "/api/ask":
                self._ask(query)
            else:
                self._static(route)
        except files.Forbidden as e:
            self._json({"error": str(e)}, status=403)
        except FileNotFoundError as e:
            self._json({"error": f"não encontrado: {e}"}, status=404)
        except net.UpstreamError as e:
            self._json({"error": str(e), "service": e.service}, status=502)
        except BrokenPipeError:
            pass
        except Exception as e:  # noqa: BLE001 — o browser precisa de JSON, não de traceback
            logger.exception("falha no handler")
            self._json({"error": str(e)}, status=500)
        finally:
            metrics.http_requests.inc(route=label, status=str(getattr(self, "_status", 0)))
            # `/api/ask` fica fora do histograma de latência de propósito: é um stream de
            # dezenas de segundos e empurraria toda rota curta para o primeiro bucket.
            if label != "ask":
                metrics.http_duration.observe(time.monotonic() - clock, route=label)

    # ---------- rotas ----------

    def _metrics(self) -> None:
        body = metrics.render().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _health(self) -> dict:
        """O que a HUD acende no canto: cada serviço com seu estado real."""
        health: dict = {
            "brain": config.get("BRAIN"),
            "embed_ready": embed.is_ready(),
            "providers": websearch.availability(),
            "claude_cli": bool(brain.available()),
            "agent_cwd": config.get("AGENT_CWD") or str(config.ROOT),
        }
        try:
            health["qdrant"] = {"online": True, **qdrant.info()}
        except net.UpstreamError as e:
            health["qdrant"] = {"online": False, "error": e.detail}

        models = llm.available()
        health["ollama"] = {"online": models is not None, "models": models or []}

        voices = speech.available()
        health["tts"] = {
            "online": voices is not None,
            "voice": config.get("TTS_VOICE"),
            "voices": voices or [],
            # A voz configurada existir no motor é diferente do motor estar no ar, e a UI
            # precisa distinguir: voz inexistente falha em toda síntese, com 200 no health.
            "voice_ok": bool(voices) and config.get("TTS_VOICE") in voices,
        }
        metrics.upstream_up.set(1 if voices is not None else 0, service="tts")

        # A UI consulta esta rota periodicamente, e é isso que mantém os gauges de upstream
        # frescos: são observações de tráfego real, não sondas sintéticas.
        metrics.upstream_up.set(1 if health["qdrant"]["online"] else 0, service="qdrant")
        metrics.upstream_up.set(1 if models is not None else 0, service="ollama")
        metrics.upstream_up.set(1 if health["claude_cli"] else 0, service="claude")
        return health

    def _search(self, query: dict) -> dict:
        text = _first(query, "q")
        if not text:
            return {"hits": [], "error": "parâmetro `q` ausente"}
        limit = int(_first(query, "n") or 8)
        dense_only = _first(query, "dense") == "1"
        return {"query": text, "hits": qdrant.search(text, limit=limit, dense_only=dense_only)}

    def _node(self, query: dict) -> dict:
        source = _first(query, "source")
        if not source:
            return {"error": "parâmetro `source` ausente"}
        return {"source": source, "chunks": qdrant.chunks_of(source)}

    def _same_site(self) -> bool:
        """Rejeita requisição vinda de outro site.

        `/api/ask` executa um agente com as ferramentas que o operador liberou — o que pode
        incluir Bash. Sem esta barreira, qualquer página aberta no browser dispara
        `GET /api/ask?q=...` por `fetch`/`<img>`/`<form>`: o CORS bloqueia a *leitura* da
        resposta, mas a requisição executa, e para rodar um comando isso é suficiente. É CSRF
        virando execução remota no próprio localhost.

        `Sec-Fetch-Site` é preenchido pelo browser e não é falsificável por JS da página.
        Cliente sem o cabeçalho (curl, o próprio `serve.py` em teste) passa: a ameaça aqui é
        a página web, não o terminal de quem já está na máquina.
        """
        site = self.headers.get("Sec-Fetch-Site")
        return site is None or site in ("same-origin", "same-site", "none")

    def _ask(self, query: dict) -> None:
        if not self._same_site():
            logger.warning(
                f"pedido cross-site recusado (Sec-Fetch-Site={self.headers.get('Sec-Fetch-Site')})"
            )
            self._json({"error": "requisição cross-site recusada"}, status=403)
            return

        question = _first(query, "q")
        web_param = _first(query, "web")
        forced = None if web_param in (None, "") else web_param == "1"

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()

        try:
            # `instrument` envolve o stream: repassa cada evento intacto e contabiliza de
            # lado, então métrica e tela derivam da mesma fonte — não há como divergirem.
            for event in recorder.instrument(agent.run(question, web=forced), config.get("BRAIN")):
                self._sse(event)
        except (BrokenPipeError, ConnectionResetError):
            logger.info("cliente desconectou; execução abortada")
        finally:
            self.close_connection = True

    def _static(self, route: str) -> None:
        relative = "index.html" if route in ("/", "") else route.lstrip("/")
        target = (STATIC_ROOT / relative).resolve()

        allowed_roots = [STATIC_ROOT / name for name in ALLOWED_STATIC_DIRS]
        is_root_file = target.parent == STATIC_ROOT
        is_allowed_dir = any(root in target.parents or root == target.parent for root in allowed_roots)
        if not (is_root_file or is_allowed_dir) or not target.is_file():
            self._json({"error": f"não encontrado: {relative}"}, status=404)
            return

        body = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in (".js", ".mjs"):
            mime = "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text") else mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    # ---------- primitivas ----------

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _sse(self, event: dict) -> None:
        self.wfile.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8"))
        self.wfile.flush()


def _first(query: dict, key: str) -> str:
    values = query.get(key) or []
    return values[0] if values else ""


def serve() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s · %(message)s", datefmt="%H:%M:%S"
    )
    host, port = config.get("ESPATIAL_HOST"), config.get_int("ESPATIAL_PORT")

    metrics.bootstrap(VERSION, config.get("BRAIN"), config.get("AGENT_MODEL"))
    embed.warm()
    graph.warm()

    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    logger.info(f"espatial-os em http://{host}:{port}  ·  cérebro={config.get('BRAIN')}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("encerrando")
    finally:
        httpd.server_close()
