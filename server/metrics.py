"""Catálogo de métricas do espatial-os — o que se mede, com que dimensão, e por quê.

Critério de inclusão: a métrica tem que responder uma pergunta operacional que hoje só se
responde olhando a tela. Contador que ninguém consultaria não entra.

As quatro perguntas que este catálogo existe para responder:

1. **A resposta demorou — onde?** `ask_stage_duration_seconds` separa recuperar, buscar na
   web e sintetizar. Sem isso, "está lento" é indistinguível entre embedding na CPU e um
   modelo remoto pensando.
2. **O índice apodreceu?** `index_age_seconds` e `index_files_by_kind`. Esse é o modo de
   falha silenciosa documentado: a busca continua respondendo, só que sobre um corpus
   velho ou incompleto — e ninguém percebe porque não há erro nenhum.
3. **Quanto custou?** `agent_cost_usd_total`, `agent_tokens_total` e `agent_turns`. Um
   agente com ferramentas gasta em loop de tool call, não em texto.
4. **A tela aguenta?** `client_fps` e `client_long_frames_total`. É um app 3D: 400 nós a
   20fps é uma regressão de produto, e o servidor jamais saberia disso sozinho.

Cardinalidade: todo label tem lista fechada. `tool` é a exceção tolerada — o conjunto é
limitado pelas ferramentas instaladas (dezenas), e saber que `Read` domina as chamadas vale
a série. Nome de servidor MCP, id de tool_use, caminho de arquivo e texto de pergunta nunca
viram label.
"""
import resource
import time

from . import promex

registry = promex.Registry()

# ---------------------------------------------------------------- domínios de label

# Enum fechado das rotas. Precisa acompanhar `app.ROUTE_LABELS`: rota que falte aqui é contada
# como `other` pela guarda de cardinalidade — sem erro, e perdendo a distinção em silêncio.
ROUTES = (
    "ask", "search", "graph", "node", "file", "health", "metrics", "client", "config", "tts",
    "speech", "events", "integrations", "hook", "attach", "dirty", "static",
)
BRAINS = ("claude", "ollama")
OUTCOMES = ("success", "error", "aborted")
# Os quatro estágios somados aproximam a duração total. `reason` existe porque sem ele o
# tempo de raciocínio do agente ficava sem dono: a soma dos estágios dava 1,4s numa
# execução de 10,7s, e a lacuna não tinha nome.
STAGES = ("retrieve", "websearch", "reason", "synthesize")
# As famílias de cor do briefing. É o `kind` que a UI usa para pintar o wormhole.
TOOL_KINDS = (
    "filesystem", "shell", "browser", "database", "github", "mcp", "agent", "planner", "other",
)
SERVICES = ("qdrant", "ollama", "claude", "tts", "brave", "serpapi", "searxng", "duckduckgo", "neo4j")
UPSTREAM_REASONS = ("timeout", "unreachable", "http_client", "http_server", "parse", "other")
PROVIDERS = ("brave", "serpapi", "searxng", "duckduckgo")
CORPUS_KINDS = (
    "memory", "decision", "agent", "infra", "compose", "schema", "script", "config", "doc",
    "lock", "other",
)
TOKEN_KINDS = ("input", "output", "cache_read", "cache_creation")

# ---------------------------------------------------------------- buckets
# Três escalas distintas. Reaproveitar um bucket set entre elas é o erro que torna o
# histograma inútil: ou tudo cai no primeiro bucket, ou tudo cai no +Inf.
FAST = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5)
SLOW = (0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60, 120, 300)
TTFT = (0.25, 0.5, 1, 2, 3, 5, 8, 13, 21, 34)
SMALL_COUNT = (0, 1, 2, 3, 5, 8, 13, 21)
TURNS = (1, 2, 3, 5, 8, 13, 21)
FPS = (10, 20, 24, 30, 45, 50, 55, 60, 90, 120)

# ---------------------------------------------------------------- meta

build_info = registry.gauge(
    "espatial_build_info", "Sempre 1; as labels descrevem a instalação.",
    {"version": None, "brain": BRAINS, "model": None},
)
process_start = registry.gauge(
    "espatial_process_start_time_seconds", "Epoch em que o servidor subiu.",
)
process_rss = registry.gauge(
    "espatial_process_resident_memory_bytes", "Pico de memória residente do processo.",
)
process_cpu = registry.counter(
    "espatial_process_cpu_seconds_total", "CPU de usuário + sistema consumida pelo processo.",
)

# ---------------------------------------------------------------- superfície HTTP

http_requests = registry.counter(
    "espatial_http_requests_total", "Requisições HTTP servidas.",
    {"route": ROUTES, "status": None},
)
http_duration = registry.histogram(
    "espatial_http_request_duration_seconds",
    "Latência das rotas curtas. `/api/ask` fica fora de propósito: é stream longo e "
    "poluiria os buckets — a duração dele é `espatial_ask_duration_seconds`.",
    FAST, {"route": ROUTES},
)

# ---------------------------------------------------------------- ciclo cognitivo

ask_total = registry.counter(
    "espatial_ask_total", "Execuções do ciclo cognitivo.", {"brain": BRAINS, "outcome": OUTCOMES},
)
ask_active = registry.gauge(
    "espatial_ask_active", "Execuções em voo agora.", {"brain": BRAINS},
)
ask_duration = registry.histogram(
    "espatial_ask_duration_seconds", "Tempo de ponta a ponta de uma execução.", SLOW, {"brain": BRAINS},
)
ask_ttft = registry.histogram(
    "espatial_ask_ttft_seconds",
    "Tempo até o primeiro token visível — a latência que o operador realmente sente.",
    TTFT, {"brain": BRAINS},
)
ask_stage = registry.histogram(
    "espatial_ask_stage_duration_seconds", "Duração por estágio do ciclo.", SLOW, {"stage": STAGES},
)
ask_web = registry.counter(
    "espatial_ask_web_total", "Execuções que saíram para a internet (a pergunta deixou a máquina).",
)

# ---------------------------------------------------------------- recuperação

retrieval_hits = registry.histogram(
    "espatial_retrieval_hits",
    "Chunks devolvidos por execução. O bucket le=0 é o sintoma que mais importa: "
    "recuperação vazia responde 200 e parece sucesso.",
    SMALL_COUNT,
)
retrieval_top_score = registry.histogram(
    "espatial_retrieval_top_score",
    "Score do primeiro hit. Score de fusão RRF não é comparável entre consultas em valor "
    "absoluto — serve como sinal de deriva da distribuição, não como qualidade por si.",
    (0.01, 0.02, 0.03, 0.05, 0.08, 0.13, 0.2, 0.35, 0.6, 1.0),
)
embed_duration = registry.histogram(
    "espatial_embed_duration_seconds", "Vetorização da pergunta (ONNX na CPU).", FAST,
)
qdrant_duration = registry.histogram(
    "espatial_qdrant_duration_seconds", "Chamadas ao Qdrant por operação.",
    FAST, {"op": ("query", "scroll", "chunks", "neighbors", "info")},
)

# ---------------------------------------------------------------- ferramentas do agente

tool_calls = registry.counter(
    "espatial_tool_calls_total", "Chamadas de ferramenta feitas pelo agente.",
    {"tool": None, "kind": TOOL_KINDS, "outcome": OUTCOMES},
)
tool_duration = registry.histogram(
    "espatial_tool_duration_seconds", "Duração de uma chamada de ferramenta (call → result).",
    SLOW, {"kind": TOOL_KINDS},
)

# ---------------------------------------------------------------- custo

agent_cost = registry.counter(
    "espatial_agent_cost_usd_total", "Custo acumulado reportado pelo CLI do agente.", {"model": None},
)
agent_tokens = registry.counter(
    "espatial_agent_tokens_total", "Tokens por natureza.", {"model": None, "kind": TOKEN_KINDS},
)
agent_thinking_tokens = registry.counter(
    "espatial_agent_thinking_tokens_total",
    "Tokens de raciocínio estimados — custo que não aparece no texto da resposta.",
)
agent_turns = registry.histogram(
    "espatial_agent_turns", "Turnos por execução. Cauda alta = loop de ferramenta.", TURNS,
)
rate_limit_allowed = registry.gauge(
    "espatial_rate_limit_allowed", "1 quando a janela de uso aceita requisições.", {"window": None},
)
rate_limit_resets = registry.gauge(
    "espatial_rate_limit_resets_at_seconds", "Epoch em que a janela de uso reseta.", {"window": None},
)

# ---------------------------------------------------------------- webhooks

WEBHOOK_SOURCES = ("github", "prometheus", "ci", "generic", "other")

webhook_total = registry.counter(
    "espatial_webhook_total", "Entregas de webhook recebidas.",
    {"source": WEBHOOK_SOURCES, "outcome": OUTCOMES},
)
webhook_events = registry.histogram(
    "espatial_webhook_events",
    "Eventos publicados por entrega. Zero significa corpo que nenhum tradutor entendeu — "
    "a entrega chegou e nada apareceu na tela.",
    SMALL_COUNT,
)

# ---------------------------------------------------------------- voz

tts_total = registry.counter(
    "espatial_tts_total", "Sínteses de voz pedidas.", {"outcome": OUTCOMES},
)
tts_duration = registry.histogram(
    "espatial_tts_duration_seconds", "Latência da síntese. É ela que decide se a fala "
    "acompanha o texto ou chega depois dele.", SLOW,
)
tts_chars = registry.histogram(
    "espatial_tts_chars", "Caracteres por síntese — o cliente quebra por frase, e este "
    "histograma mostra se a quebra está funcionando.",
    (20, 40, 80, 120, 200, 320, 500, 800, 1200),
)

# ---------------------------------------------------------------- busca web

websearch_total = registry.counter(
    "espatial_websearch_total", "Consultas por provedor.", {"provider": PROVIDERS, "outcome": OUTCOMES},
)
websearch_duration = registry.histogram(
    "espatial_websearch_duration_seconds", "Latência por provedor.", SLOW, {"provider": PROVIDERS},
)
websearch_results = registry.histogram(
    "espatial_websearch_results",
    "Resultados devolvidos. Zero resultado sem erro é falha silenciosa de provedor.",
    SMALL_COUNT, {"provider": PROVIDERS},
)

# ---------------------------------------------------------------- corpus e grafo
# Gauges alimentados por um refresher em background, nunca durante o scrape.

index_points = registry.gauge("espatial_index_points", "Chunks na coleção vetorial.")
index_files = registry.gauge("espatial_index_files", "Arquivos distintos indexados.")
index_files_by_kind = registry.gauge(
    "espatial_index_files_by_kind", "Composição do corpus por tipo de conhecimento.",
    {"kind": CORPUS_KINDS},
)
index_age = registry.gauge(
    "espatial_index_age_seconds",
    "Idade do índice pela data de indexação mais recente. Cresce em silêncio quando a "
    "reindexação para de rodar.",
)
graph_nodes = registry.gauge("espatial_graph_nodes", "Nós na topologia servida à cena.")
graph_edges = registry.gauge("espatial_graph_edges", "Arestas na topologia servida à cena.")
graph_build = registry.histogram(
    "espatial_graph_build_duration_seconds", "Construção da topologia a partir da coleção.", FAST,
)

# ---------------------------------------------------------------- upstream

upstream_up = registry.gauge(
    "espatial_upstream_up",
    "1 quando a última interação real com o serviço funcionou. É observação de tráfego "
    "real, não sonda sintética: fica velha se ninguém usar o serviço.",
    {"service": SERVICES},
)
upstream_errors = registry.counter(
    "espatial_upstream_errors_total", "Falhas de upstream por motivo.",
    {"service": SERVICES, "reason": UPSTREAM_REASONS},
)

# ---------------------------------------------------------------- cliente (browser)

client_fps = registry.histogram(
    "espatial_client_fps", "Quadros por segundo reportados pela cena (janela de 10s).", FPS,
)
client_long_frames = registry.counter(
    "espatial_client_long_frames_total", "Quadros acima de 50ms — engasgo visível.",
)
client_boot = registry.counter(
    "espatial_client_boot_total", "Inicializações da interface.",
    {"outcome": ("success", "no_webgl", "error")},
)
client_nodes = registry.gauge("espatial_client_nodes", "Nós desenhados na cena agora.")
client_audio = registry.gauge("espatial_client_audio_enabled", "1 quando o motor de áudio está ativo.")


def bootstrap(version: str, brain: str, model: str) -> None:
    build_info.set(1, version=version, brain=brain, model=model or "default")
    process_start.set(time.time())


_last_cpu = 0.0


def refresh_process() -> None:
    """Recursos do processo via `resource` — o único lugar onde ler no scrape é aceitável,
    porque não há upstream envolvido."""
    global _last_cpu
    usage = resource.getrusage(resource.RUSAGE_SELF)
    # macOS reporta ru_maxrss em bytes; Linux em kilobytes.
    import sys

    scale = 1 if sys.platform == "darwin" else 1024
    process_rss.set(usage.ru_maxrss * scale)
    total = usage.ru_utime + usage.ru_stime
    if total > _last_cpu:
        process_cpu.inc(total - _last_cpu)
        _last_cpu = total


def render() -> str:
    refresh_process()
    return registry.render()
