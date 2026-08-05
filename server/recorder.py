"""Tradução evento → métrica.

Este arquivo é a razão de as métricas serem confiáveis: elas não são um segundo caminho de
instrumentação espalhado pelo código, são derivadas do **mesmo stream de eventos que
desenha a tela**. A propriedade que isso garante é útil na prática — se a HUD mostra uma
chamada de ferramenta, o contador dela subiu; se o contador não subiu, a HUD também não
mostrou. Não existe divergência possível entre o que se vê e o que se mede.

Consequência de projeto: instrumentar um comportamento novo é emitir um evento novo, e o
recorder é o único lugar que precisa saber contá-lo.

Um `Run` guarda o estado mínimo para derivar durações que os eventos não carregam: o início
de cada estágio (transições de `state`) e o início de cada ferramenta (par `call`/`result`
casado por id).
"""
import logging
import time
from typing import Iterator, Optional

from . import metrics

logger = logging.getLogger("espatial.recorder")

# `state` do agente → estágio medido. Estados que não abrem estágio (idle, error) ficam
# fora de propósito: eles fecham o anterior sem começar nada.
STATE_TO_STAGE = {
    "retrieving": "retrieve",
    "searching": "websearch",
    "thinking": "reason",
    "answering": "synthesize",
}


class Run:
    """Estado de uma execução, vivo apenas durante o stream dela."""

    def __init__(self, brain: str):
        self.brain = brain
        self.started = time.monotonic()
        self.stage: Optional[str] = None
        self.stage_started = 0.0
        self.tools: dict[str, tuple[str, str, float]] = {}
        self.first_token: Optional[float] = None
        self.web_started: Optional[float] = None
        self.outcome = "aborted"
        self.model = ""

    # ---------- estágios ----------

    def open_stage(self, stage: str) -> None:
        self.close_stage()
        self.stage = stage
        self.stage_started = time.monotonic()

    def close_stage(self) -> None:
        if self.stage is None:
            return
        metrics.ask_stage.observe(time.monotonic() - self.stage_started, stage=self.stage)
        self.stage = None

    # ---------- ferramentas ----------

    def tool_call(self, event: dict) -> None:
        tool_id = event.get("id") or ""
        if not tool_id:
            return
        self.tools[tool_id] = (event.get("tool", "?"), event.get("kind", "other"), time.monotonic())

    def tool_result(self, event: dict) -> None:
        tool_id = event.get("id") or ""
        entry = self.tools.pop(tool_id, None)
        tool = event.get("tool") or (entry[0] if entry else "?")
        kind = event.get("kind") or (entry[1] if entry else "other")
        outcome = "success" if event.get("ok", True) else "error"
        metrics.tool_calls.inc(tool=tool, kind=kind, outcome=outcome)
        if entry:
            metrics.tool_duration.observe(time.monotonic() - entry[2], kind=kind)


def observe(run: Run, event: dict) -> None:
    """Contabiliza um evento. Nunca levanta: métrica quebrada não pode derrubar a resposta."""
    try:
        _observe(run, event)
    except Exception:  # noqa: BLE001
        logger.exception(f"falha ao contabilizar evento {event.get('t')}")


def _observe(run: Run, event: dict) -> None:
    kind = event.get("t")

    if kind == "query":
        if event.get("web"):
            metrics.ask_web.inc()

    elif kind == "state":
        stage = STATE_TO_STAGE.get(event.get("state"))
        if stage:
            run.open_stage(stage)
        else:
            run.close_stage()
        if event.get("state") == "error":
            run.outcome = "error"

    elif kind == "memory":
        hits = event.get("hits") or []
        metrics.retrieval_hits.observe(len(hits))
        if hits and hits[0].get("score") is not None:
            metrics.retrieval_top_score.observe(float(hits[0]["score"]))

    elif kind == "web":
        _observe_web(run, event)

    elif kind == "tool":
        if event.get("phase") == "call":
            run.tool_call(event)
        elif event.get("phase") == "result":
            run.tool_result(event)

    elif kind == "token":
        if run.first_token is None:
            run.first_token = time.monotonic()
            metrics.ask_ttft.observe(run.first_token - run.started, brain=run.brain)

    elif kind == "cogload":
        # O evento traz o total estimado, não o delta; o backend do CLI já manda o
        # acumulado por mensagem, então o incremento é a diferença desde o último.
        total = float(event.get("tokens") or 0)
        previous = getattr(run, "_thinking", 0.0)
        if total > previous:
            metrics.agent_thinking_tokens.inc(total - previous)
            run._thinking = total  # noqa: SLF001 — estado privado do próprio Run

    elif kind == "brain":
        run.model = event.get("model") or run.model

    elif kind == "limit":
        window = event.get("window") or "unknown"
        metrics.rate_limit_allowed.set(1 if event.get("status") == "allowed" else 0, window=window)
        if event.get("resets_at"):
            metrics.rate_limit_resets.set(float(event["resets_at"]), window=window)

    elif kind == "answer":
        _observe_answer(run, event)

    elif kind == "error":
        run.outcome = "error"
        service = event.get("service") or "other"
        metrics.upstream_up.set(0, service=service)
        metrics.upstream_errors.inc(service=service, reason=_reason(event.get("message", "")))


def _observe_web(run: Run, event: dict) -> None:
    provider = event.get("provider") or "other"
    phase = event.get("phase")
    if phase == "start":
        run.web_started = time.monotonic()
        return
    if run.web_started is not None:
        metrics.websearch_duration.observe(time.monotonic() - run.web_started, provider=provider)
        run.web_started = None
    if phase == "result":
        results = event.get("results") or []
        metrics.websearch_total.inc(provider=provider, outcome="success")
        metrics.websearch_results.observe(len(results), provider=provider)
        metrics.upstream_up.set(1, service=provider)
    elif phase == "error":
        metrics.websearch_total.inc(provider=provider, outcome="error")
        metrics.upstream_up.set(0, service=provider)


def _observe_answer(run: Run, event: dict) -> None:
    run.outcome = "success"
    model = event.get("model") or run.model or "default"
    if event.get("cost_usd"):
        metrics.agent_cost.inc(float(event["cost_usd"]), model=model)
    tokens = event.get("tokens") or {}
    # ⚠️ `cache_creation` faltava aqui, e era a ÚNICA métrica de token que nunca subia — a
    # mesma sobre a qual a tabela de custo de `permissions.py` argumenta. Declarada em
    # `metrics.TOKEN_KINDS` e nunca amostrada: o painel mostrava zero e o zero parecia um fato.
    for name, key in (
        ("input", "in"),
        ("output", "out"),
        ("cache_read", "cache_read"),
        ("cache_creation", "cache_creation"),
    ):
        if tokens.get(key):
            metrics.agent_tokens.inc(float(tokens[key]), model=model, kind=name)
    if event.get("turns"):
        metrics.agent_turns.observe(float(event["turns"]))


def _reason(message: str) -> str:
    lowered = message.lower()
    if "timeout" in lowered:
        return "timeout"
    if "inalcanç" in lowered or "unreachable" in lowered or "refused" in lowered:
        return "unreachable"
    if "json" in lowered or "decode" in lowered:
        return "parse"
    return "other"


def instrument(events: Iterator[dict], brain: str) -> Iterator[dict]:
    """Envolve o stream do agente: repassa cada evento intacto e contabiliza de lado.

    O `finally` é o que fecha a contabilidade quando o browser desconecta no meio — sem
    ele, `ask_active` vazaria para sempre e a taxa de abortos ficaria invisível.
    """
    run = Run(brain)
    metrics.ask_active.inc(brain=brain)
    try:
        for event in events:
            observe(run, event)
            yield event
    finally:
        run.close_stage()
        metrics.ask_active.dec(brain=brain)
        metrics.ask_duration.observe(time.monotonic() - run.started, brain=brain)
        metrics.ask_total.inc(brain=brain, outcome=run.outcome)
