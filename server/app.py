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
import signal
import socket
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import agent, ambient, attach, bridge, brain, budget, capabilities, config, credentials, dirty, embed, files, graph, journal, llm, mcp_scopes, metrics, net, permissions, hookqueue, oauth, qdrant, recorder, running, speech, storage, units, webhooks, websearch, graphdb

logger = logging.getLogger("espatial.app")

VERSION = "0.1.0"
STATIC_ROOT = config.ROOT
ALLOWED_STATIC_DIRS = ("src", "vendor", "assets")
MAX_BODY_BYTES = 8192
# Quanto o encerramento espera pelas execuções em curso antes de desistir e registrar quantas
# ficaram. Teto e não espera infinita: um cliente pendurado não pode impedir o servidor de morrer.
DRAIN_SECONDS = 20

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
    "/api/mcp": "mcp",
    "/api/tts": "tts",
    "/api/system-events": "events",
    "/api/integrations": "integrations",
    "/api/speech": "speech",
    "/api/attach": "attach",
    "/api/dirty": "dirty",
    "/api/vizinhanca": "vizinhanca",
    "/metrics": "metrics",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "SpatIA"
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

        # `/hooks/<fonte>` vem de FORA por definição, então não passa pela barreira de mesma
        # origem — quem protege aqui é o HMAC do corpo, não o cabeçalho do browser.
        if parsed.path.startswith("/hooks/"):
            self._hook(parsed.path[len("/hooks/"):].strip("/"))
            return

        if parsed.path not in ("/api/client", "/api/config", "/api/tts", "/api/speech", "/api/attach", "/api/kill", "/api/oauth/start", "/api/oauth/forget", "/api/gate"):
            self._json({"error": "rota não encontrada"}, status=404)
            return
        # Ação com efeito (muda permissão) ou com custo (sintetiza áudio): mesma barreira
        # do /api/ask, para que outra página não use este servidor como serviço próprio.
        if parsed.path in ("/api/config", "/api/tts", "/api/speech", "/api/attach", "/api/kill", "/api/oauth/start", "/api/oauth/forget") and not self._same_site():
            metrics.crosssite_refused.inc()
            journal.denial("cross-site", parsed.path, f"Sec-Fetch-Site={self.headers.get('Sec-Fetch-Site')}")
            self._json({"error": "requisição cross-site recusada"}, status=403)
            return
        # Anexo é binário e grande: lê antes do caminho de JSON, com teto próprio.
        if parsed.path == "/api/attach":
            self._attach()
            return

        try:
            length = min(int(self.headers.get("Content-Length") or 0), MAX_BODY_BYTES)
            payload = json.loads(self.rfile.read(length) or b"{}")
            if parsed.path == "/api/gate":
                self._gate(payload)
                return
            if parsed.path == "/api/oauth/start":
                # Devolve SÓ a URL. O `code_verifier` e o `state` ficam no servidor, e a página
                # não tem como saber nem precisar deles.
                self._json(oauth.start(str(payload.get("provider") or "")))
                return
            if parsed.path == "/api/oauth/forget":
                self._json({"forgotten": credentials.forget(str(payload.get("provider") or ""))})
                return
            if parsed.path == "/api/kill":
                # `False` é "essa execução já acabou", não erro: entre o desenho da tela e o
                # clique cabe o fim natural dela, e 404 aqui leria como falha do botão.
                encerrada = running.cancel(str(payload.get("id") or ""))
                self._json({"cancelled": encerrada, "running": running.snapshot()})
                return
            if parsed.path == "/api/config":
                permissions.update(payload)
                self._json(permissions.describe())
                return
            if parsed.path == "/api/speech":
                speech.update(payload)
                self._json(speech.describe())
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

    def _hook(self, source: str) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        if length > webhooks.MAX_BODY_BYTES:
            metrics.http_requests.inc(route="hook", status="413")
            self._json({"error": "corpo grande demais"}, status=413)
            return

        body = self.rfile.read(length) if length else b""
        result = webhooks.deliver(source or "generic", body, self.headers)
        status = 202 if result["accepted"] else 401
        metrics.http_requests.inc(route="hook", status=str(status))
        self._json(result, status=status)

    def _system_events(self) -> None:
        """SSE de eventos que não vêm de uma pergunta: os webhooks e o vigia do `ambient`.

        Stream separado do `/api/ask` de propósito: aquele é o ciclo de UMA pergunta e fecha
        no `done`. Este vive enquanto a página viver, porque nem o mundo externo nem o próprio
        sistema esperam o operador perguntar nada.

        Quem assina recebe de saída os `notice` que estão DE PÉ (`ambient.subscribe`): abrir a
        página depois do boot não pode mostrar tela limpa sobre um índice vencido.
        """
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()

        queue = ambient.subscribe()
        try:
            while True:
                if queue:
                    self._sse(queue.popleft())
                    continue
                # Comentário SSE como heartbeat: mantém o proxy/browser de fechar a conexão
                # ociosa, e é ignorado pelo EventSource.
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                time.sleep(1.0)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            ambient.unsubscribe(queue)
            self.close_connection = True

    def _attach(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > attach.MAX_BYTES:
            metrics.http_requests.inc(route="attach", status="413")
            self._json({"error": f"tamanho inválido ({length} bytes)"}, status=413)
            return
        saved = attach.save(self.rfile.read(length), self.headers.get("X-Filename", ""))
        metrics.http_requests.inc(route="attach", status="200")
        self._json(saved)

    def _tts(self, payload: dict) -> None:
        """Sintetiza e devolve MP3 — a única rota que não responde JSON."""
        text = str(payload.get("text") or "").strip()
        if not text:
            self._json({"error": "texto vazio"}, status=400)
            return
        # Overrides valem só para esta chamada (a bancada de teste da UI usa isso); o resto
        # vem do estado configurado, então a leitura da resposta soa igual em toda a sessão.
        overrides = {k: v for k, v in payload.items() if k != "text" and v not in (None, "")}
        clock = time.monotonic()
        try:
            audio, mime = speech.synthesize(text, overrides)
        except net.UpstreamError as e:
            # O motivo vem do ERRO, não de um literal. Antes era "unreachable" fixo: chave inválida
            # e serviço fora produziam a mesma linha na métrica e a mesma frase na tela.
            metrics.upstream_errors.inc(service="tts", reason=e.reason)
            metrics.upstream_up.set(0, service="tts")
            self._json({"error": str(e), "service": "tts", "status": e.status, "reason": e.reason}, status=502)
            return

        metrics.upstream_up.set(1, service="tts")
        metrics.tts_duration.observe(time.monotonic() - clock)
        metrics.tts_chars.observe(len(text))
        metrics.tts_total.inc(outcome="success")

        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(audio)

    def _client_metrics(self, payload: dict) -> None:
        """Telemetria da cena. O servidor não tem como saber que a visualização engasgou —
        só o loop de render sabe, e 400 nós a 20fps é regressão de produto."""
        if payload.get("boot"):
            metrics.client_boot.inc(outcome=str(payload["boot"]))
        # ⚠️ `is not None`, NUNCA truthiness.
        #
        # Era `if payload.get("fps")`, e **`fps == 0` é falsy**: a aba travada — exatamente o
        # caso que o docstring desta função e o de `metrics.py` dizem querer pegar — reportava
        # zero e sumia do histograma. O universo medido ficava sem os piores casos, que é o
        # oposto de medir a cauda. Mesmo raciocínio em `long_frames`: zero quadro longo é uma
        # medição, não a ausência de uma.
        if payload.get("fps") is not None:
            metrics.client_fps.observe(float(payload["fps"]))
        if payload.get("long_frames") is not None:
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
            elif route == "/api/mcp":
                # Rota própria, e não um campo do `/api/config`: o painel de MCP pergunta
                # "quem está no ar e quem ficou de fora", que é outra pergunta que a de
                # permissões — e ele precisa reconsultar sozinho quando a fonte muda.
                self._json(mcp_scopes.snapshot(permissions.load()["setting_sources"]))
            elif route == "/api/speech":
                self._json(speech.describe())
            elif route == "/api/dirty":
                # Rota SEPARADA da topologia de propósito: o estado local muda a cada Ctrl+S,
                # e a topologia é cacheada por fingerprint e gravada em disco. Juntar os dois
                # forçaria ou anel velho, ou reconstruir 397 nós a cada 15 segundos.
                # `root` distingue "árvore limpa" de "sem raiz configurada". Sem ele, um
                # `AGENT_CWD` vazio devolvia `{}` e o cliente anunciava ÁRVORE LIMPA em verde —
                # afirmando sobre um disco que ninguém olhou.
                root = dirty.root()
                self._json({"files": dirty.table(), "root": str(root) if root else None})
            elif route == "/api/integrations":
                self._json({
                    "webhooks": webhooks.availability(),
                    "history": webhooks.history(),
                    "queue": hookqueue.status(),
                    "pending": hookqueue.pending(),
                    "providers": websearch.availability(),
                })
            elif route == "/api/oauth/callback":
                self._oauth_callback(query)
            elif route == "/api/capabilities":
                self._json(capabilities.describe())
            elif route == "/api/credentials":
                self._json({"store": credentials.describe(), "providers": oauth.providers(),
                            "bridge": bridge.available()})
            elif route.startswith("/api/bridge/"):
                self._bridge(route, parsed.query)
            elif route == "/api/storage":
                self._json(storage.describe())
            elif route == "/api/units":
                # Casa com o MESMO payload de health que a HUD acende; sondar de novo aqui daria
                # duas leituras do mesmo serviço em instantes diferentes.
                self._json(units.describe(self._health()))
            elif route == "/api/running":
                self._json({"running": running.snapshot(), "budget": budget.status()})
            elif route == "/api/journal":
                # Sem `day` a tela pergunta "o que existe": a lista de dias e o estado do teto
                # vêm sozinhos, e só o dia escolhido carrega as execuções. Devolver tudo faria a
                # primeira abertura arrastar o diário inteiro para desenhar uma tabela.
                day = _first(query, "day")
                payload = journal.status()
                payload["chain"] = journal.verify()
                payload["spend"] = journal.summary()
                if day:
                    payload["day"] = day
                    payload["runs"] = journal.read(day)
                self._json(payload)
            elif route == "/api/system-events":
                self._system_events()
            elif route == "/api/graph":
                self._json(graph.load(force=query.get("force", ["0"])[0] == "1"))
            elif route == "/api/vizinhanca":
                # A rede lateral de um corpo, do snapshot em disco. Rota própria porque ela é 3,4×
                # a topologia inteira e só a SELEÇÃO a lê — ver `graphdb.network`.
                self._json(graphdb.network(_first(query, "source") or None))
            elif route == "/api/search":
                self._json(self._search(query))
            elif route == "/api/node":
                self._json(self._node(query))
            elif route == "/api/file":
                # `source` é a chave do céu (`devshell-one/docs/x.md`); `path` é caminho de
                # disco. Duas perguntas diferentes na mesma rota, e o cliente do observatório
                # só faz a primeira — o `path` fica para quem chamar a API na mão.
                origin = _first(query, "source")
                self._json(files.read_source(origin) if origin else files.read(_first(query, "path")))
            elif route == "/api/ask":
                self._ask(query)
            else:
                self._static(route)
        except files.Forbidden as e:
            # Arquivo fora da raiz permitida é RECUSA, e recusa que não deixa linha é
            # indistinguível de recusa que nunca aconteceu — o argumento do `jr.denials`.
            journal.denial("arquivo", "files", str(e))
            self._json({"error": str(e)}, status=403)
        except FileNotFoundError as e:
            self._json({"error": f"não encontrado: {e}"}, status=404)
        except net.UpstreamError as e:
            # 502 continua sendo a verdade sobre ESTA API (o gateway não conseguiu cumprir), e o
            # status de quem falhou vai no corpo: sem ele, 401 de chave inválida e 503 de serviço
            # fora chegam idênticos ao operador. `reason` é o mesmo rótulo da métrica.
            #
            # ⚠️ E a falha passa a CONTAR aqui. Até 2026-08-07 só a rota de TTS incrementava, então
            # um qdrant fora respondia 502 em toda busca e `espatial_upstream_errors_total` ficava
            # em zero — o painel dizia que estava tudo bem enquanto a tela não achava nada.
            metrics.upstream_errors.inc(service=e.service, reason=e.reason)
            metrics.upstream_up.set(0, service=e.service)
            self._json(
                {"error": str(e), "service": e.service, "status": e.status, "reason": e.reason},
                status=502,
            )
        except BrokenPipeError:
            pass
        except Exception as e:  # noqa: BLE001 — o browser precisa de JSON, não de traceback
            logger.exception("falha no handler")
            self._json({"error": str(e)}, status=500)
        finally:
            metrics.http_requests.inc(route=label, status=str(getattr(self, "_status", 0)))
            # `/api/ask` fica fora do histograma de latência de propósito: é um stream de
            # dezenas de segundos e empurraria toda rota curta para o primeiro bucket.
            if label not in ("ask", "events"):
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
            # O teto viaja no health porque a pergunta "posso perguntar?" é de saúde, não de
            # diário: quem abre a tela precisa ver a folga ANTES de gastar, não depois.
            "budget": budget.status(),
            # A postura do servidor, dita pelo próprio servidor. Sem isto `#/security` teria de
            # AFIRMAR o bind e a ausência de autenticação a partir do código-fonte — e uma tela de
            # segurança que deduz a própria configuração é a que mente primeiro quando ela muda.
            "exposure": {
                "bind": f"{config.get('ESPATIAL_HOST')}:{config.get_int('ESPATIAL_PORT')}",
                "auth": "nenhuma",
                "same_site_guard": True,
                # ⚠️ O ÚNICO MOMENTO EM QUE A POSTURA DESTE SISTEMA MUDA DE CATEGORIA.
                # `127.0.0.1` não recebe webhook da internet: ou o remetente é local, ou existe
                # um túnel. E se existe túnel, o bind em loopback deixou de ser a proteção que
                # era — o servidor não tem autenticação e agora tem endereço público.
                "tunnel": self._tunnel_signs(),
                # A CONTAGEM de recusas não vem aqui: ela já é a métrica
                # `espatial_crosssite_refused_total`, e a tela lê o `/metrics` com o mesmo parser
                # do `#/metrics`. Publicar o número nos dois lugares criaria duas verdades sobre
                # o mesmo fato, com a chance de discordarem.
                "file_roots": [str(root) for root in config.file_roots()],
            },
        }
        try:
            health["qdrant"] = {"online": True, **qdrant.info()}
        except net.UpstreamError as e:
            health["qdrant"] = {"online": False, "error": e.detail}

        # Idade do índice: lida do cache da topologia, sem chamada upstream. O cabeçalho a
        # mostra em toda tela porque é a métrica que envelhece sem ninguém perceber.
        health["index_age_days"] = graph.age_days()

        models = llm.available()
        health["ollama"] = {"online": models is not None, "models": models or []}

        # O grafo de RELAÇÃO. Ele pode faltar sem impedir nada — e a tela precisa saber a
        # diferença entre "não configurado", "fora" e "no ar", porque as três pedem reações
        # diferentes do operador. Ver `docs/integracao-neo4j.md` §1.2.
        health["neo4j"] = graphdb.describe()

        # O health reflete o estado CONFIGURADO, não o default do .env: é o que a UI mostra,
        # e mostrar o default depois de o operador ter mudado a voz seria mentira.
        voice = speech.describe()
        health["tts"] = {
            "online": voice["online"],
            "voice": voice["wire_voice"],
            "voices": voice["voices"],
            # ⚠️ Os dois viajam SEPARADOS. Fundidos num booleano, a tela dizia sempre
            # "VERIFIQUE TTS_VOICE" — inclusive quando quem faltava era a voz de MISTURA,
            # mandando o operador conferir a variável errada.
            "voice_ok": voice["voice_ok"],
            "blend_ok": voice["blend_ok"],
            "lang": voice["effective_lang"],
            "speed": voice["state"]["speed"],
            "format": voice["state"]["response_format"],
        }
        metrics.upstream_up.set(1 if voice["online"] else 0, service="tts")

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

    def _gate(self, payload: dict) -> None:
        """O portão `PreToolUse`. Responde no vocabulário de hook do CLI, não no nosso.

        `permissionDecision: deny` é o que o CLI entende como "não faça"; devolver `{"allow":
        false}` seria um campo que ninguém do outro lado lê — a quinta linha da tabela da REGRA
        DO CATÁLOGO, escrita de novo.
        """
        decisao = capabilities.decide(
            str(payload.get("session_id") or ""),
            str(payload.get("tool") or ""),
            str(payload.get("target") or ""),
        )
        if decisao["allow"]:
            self._json({"continue": True})
            return
        self._json(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": decisao["reason"],
                }
            }
        )

    def _oauth_callback(self, query: dict) -> None:
        """Responde uma página mínima que se fecha. NADA útil volta ao JavaScript: o valor do
        fluxo já foi consumido no servidor, e devolvê-lo aqui recriaria o caminho que o PKCE
        existe para eliminar."""
        try:
            oauth.callback(_first(query, "code") or "", _first(query, "state") or "")
            corpo = "<p>autorizado — pode fechar esta aba</p>"
        except (ValueError, OSError) as error:
            corpo = f"<p>falhou: {error}</p>"
        body = f"<!doctype html><meta charset=utf-8><title>SpatIA</title>{corpo}<script>window.close()</script>".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bridge(self, route: str, query: str) -> None:
        """`/api/bridge/<provider>/<caminho>` — o `Authorization` entra do lado do servidor.

        O agente alcança esta URL com `WebFetch` e recebe só o corpo do terceiro. O token não
        entra no contexto dele em momento nenhum.
        """
        resto = route[len("/api/bridge/"):]
        provider, _, path = resto.partition("/")
        status, payload = bridge.call(provider, path, query=query)
        self._json(payload, status=status)

    def _tunnel_signs(self) -> dict:
        """Sinais de que a requisição atravessou um proxy/túnel em vez de vir do loopback."""
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        forwarded = self.headers.get("X-Forwarded-For") or self.headers.get("Forwarded") or ""
        local = host in ("localhost", "127.0.0.1", "::1", "")
        return {
            "host": host,
            "forwarded_for": forwarded,
            # Qualquer um dos dois basta: um proxy reverso pode preservar o Host e um túnel pode
            # não escrever `X-Forwarded-For`. Exigir os dois deixaria metade dos casos invisível.
            "suspected": bool(forwarded) or not local,
        }

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
            metrics.crosssite_refused.inc()
            journal.denial("cross-site", "/api/ask", f"Sec-Fetch-Site={self.headers.get('Sec-Fetch-Site')}")
            self._json({"error": "requisição cross-site recusada"}, status=403)
            return

        question = _first(query, "q")
        web_param = _first(query, "web")
        forced = None if web_param in (None, "") else web_param == "1"

        # Teto de disco do diário cruzado: RECUSA a execução em vez de executar sem registrar
        # (§2.4). É a única recusa do sistema que protege o próprio registro.
        if not journal.accepting():
            self._json(
                {"error": "diário cheio — não aceito execução que não posso registrar"},
                status=503,
            )
            return

        # Teto de custo e concorrência: a recusa vem ANTES do 200 e do stream, senão o operador
        # veria uma execução começar para morrer no primeiro evento.
        recusa = budget.refusal()
        if recusa:
            self._json({"error": recusa, "budget": budget.status()}, status=429)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()

        try:
            # `instrument` envolve o stream: repassa cada evento intacto e contabiliza de
            # lado, então métrica e tela derivam da mesma fonte — não há como divergirem.
            # A vaga de concorrência não é tomada aqui: quem conta é o registro de execuções
            # vivas, alimentado pelo `recorder` — e ele cobre exatamente o mesmo intervalo.
            for event in recorder.instrument(
                agent.run(question, web=forced),
                config.get("BRAIN"),
                question=question,
                origin="console",
            ):
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
    ambient.watch()

    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True

    # Segundo listener em ::1 quando o host é o loopback IPv4.
    #
    # `localhost` resolve para ::1 antes de 127.0.0.1 na maioria dos sistemas, e o Chrome segue
    # essa ordem. Escutando só IPv4, digitar `localhost` dava página de erro do browser enquanto
    # `curl` (que cai para IPv4) funcionava — um sintoma que aponta para todo lado menos para a
    # causa. Continua sendo só loopback: `::1`, não `::`.
    secondary = None
    if host in ("127.0.0.1", "localhost"):
        try:
            class V6(ThreadingHTTPServer):
                address_family = socket.AF_INET6

            secondary = V6(("::1", port), Handler)
            secondary.daemon_threads = True
            threading.Thread(target=secondary.serve_forever, name="http-v6", daemon=True).start()
        except OSError as e:
            logger.warning(f"sem listener IPv6 (use 127.0.0.1 no browser): {e}")

    logger.info(
        f"SpatIA em http://{host}:{port}"
        f"{' e http://[::1]:%d' % port if secondary else ''}"
        f"  ·  cérebro={config.get('BRAIN')}"
    )
    journal.lifecycle("boot", f"{VERSION} · {host}:{port} · cérebro={config.get('BRAIN')}")

    encerrando = threading.Event()

    def drenar_e_parar(nome_sinal: str) -> None:
        """Drena e REGISTRA. É o que responde depois "caiu ou eu fechei?".

        Parar de aceitar vem primeiro e esperar vem depois: matar uma execução em curso paga o
        custo sem entregar nada, e o diário guardaria `aborted` sem ninguém ter abortado. A
        espera tem teto porque um cliente pendurado não pode impedir o servidor de morrer — e
        quando o teto vence, o registro DIZ quantas ficaram, em vez de fingir saída limpa.

        ⚠️ RODA NUMA THREAD PRÓPRIA, e as duas linhas abaixo são o motivo. Ver `encerrar`.
        """
        budget.drain()
        limite = time.monotonic() + DRAIN_SECONDS
        while budget.running() and time.monotonic() < limite:
            time.sleep(0.2)
        pendentes = budget.running()
        journal.lifecycle(
            "shutdown",
            f"sinal {nome_sinal}"
            + (f" · {pendentes} execuções não drenaram em {DRAIN_SECONDS}s" if pendentes else " · drenado"),
        )
        httpd.shutdown()

    def encerrar(signum, _frame) -> None:
        """Só AGENDA o encerramento. O trabalho não pode acontecer aqui dentro.

        Um handler de sinal roda na thread PRINCIPAL, no meio do que ela estava fazendo — que
        neste processo é o `serve_forever()` logo abaixo. Isso trava de duas formas, e as duas
        já aconteceram nesta base (medidas em 2026-08-08, com pilha amostrada):

        1. `httpd.shutdown()` espera o laço do `serve_forever()` terminar. Chamado de dentro do
           handler, ele espera um laço que não pode avançar porque a thread dele está presa no
           próprio handler. A doc do Python é explícita: `shutdown()` tem de vir de OUTRA thread.
        2. `journal.lifecycle` pega o `_lock` do diário, que é `threading.Lock` — NÃO reentrante.
           Se a principal já o segurava quando o sinal chegou, o handler trava nela mesma.

        O sintoma não é "servidor morre devagar": é servidor que NÃO MORRE, com a porta ainda em
        LISTEN e ninguém aceitando — que lê como cena congelada — e SEM o registro `shutdown` no
        diário, ou seja, perdendo justamente a resposta que este caminho existe para dar.

        ⚠️ E o segundo sinal é descartado de propósito. `uv run` repassa o TERM que recebe, então
        o processo leva DOIS pelo mesmo `kill` — e o segundo, reentrando no meio do primeiro, é
        o que fazia o diário travar no próprio lock antes de escrever.
        """
        if encerrando.is_set():
            return
        encerrando.set()
        # `daemon=False`: o processo não pode sair antes de o diário terminar de escrever.
        threading.Thread(
            target=drenar_e_parar, args=(signal.Signals(signum).name,), name="shutdown"
        ).start()

    for sinal in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sinal, encerrar)

    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
        if secondary:
            secondary.server_close()
