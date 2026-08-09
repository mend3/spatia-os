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

from . import journal, metrics, running

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

    def __init__(self, brain: str, record: Optional[dict] = None, live=None):
        self.brain = brain
        # A entrada no registro de execuções vivas. É o MESMO objeto que a tela de atividade lê,
        # alimentado aqui e em lugar nenhum mais.
        self.live = live
        # O registro do diário, preenchido ao longo do stream e fechado no `finally`. `None` só
        # em chamador que não abriu registro — o `Run` continua servindo para métrica.
        self.record = record
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
        elapsed = time.monotonic() - entry[2] if entry else None
        if elapsed is not None:
            metrics.tool_duration.observe(elapsed, kind=kind)
        if self.live is not None:
            self.live.tools += 1
        if self.record is not None:
            self.record["tools"].append(
                {
                    "tool": tool,
                    "kind": kind,
                    "detail": event.get("detail") or "",
                    "ok": bool(event.get("ok", True)),
                    "ms": round(elapsed * 1000) if elapsed is not None else None,
                }
            )


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
        if run.live is not None:
            run.live.stage = stage or event.get("state")
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

    elif kind == "sources":
        if run.record is not None:
            run.record["sources"] = event.get("sources") or []

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

    elif kind == "proc":
        # O PID do subprocesso, para a tela poder mostrar O QUE ela vai encerrar. Vem do `brain`
        # em vez de ser descoberto por `ps`: quem criou o processo é quem sabe qual é.
        if run.live is not None:
            run.live.pid = event.get("pid")

    elif kind == "brain":
        run.model = event.get("model") or run.model
        # ⚠️ Até 2026-08-08 o modelo parava AQUI: alimentava métrica e morria com o processo. O
        # diário registrava a pergunta, as ferramentas e o custo, e não registrava QUEM executou —
        # e foi por isso que o P5 não tinha como criar `Agent` sem fabricar identidade a partir do
        # canal. O fato existia; faltava alguém escrevê-lo.
        if run.record is not None and isinstance(run.record.get("agent"), dict):
            run.record["agent"]["model"] = run.model or None
            run.record["agent"]["session"] = event.get("session") or run.record["agent"]["session"]

    elif kind == "thread":
        # A continuidade vem ANTES do `brain`, e é o único evento que existe mesmo quando a
        # execução morre sem `init`. Gravá-la aqui é o que permite ao diário responder "esta
        # execução herdou contexto?" — a pergunta que as flags sozinhas não respondem.
        if run.record is not None and isinstance(run.record.get("agent"), dict):
            run.record["agent"]["continuity"] = event.get("continuity")

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
        # O motivo DECLARADO ganha do palpite: `agent._error_event` o anexa quando a exceção é
        # `UpstreamError`, e só aí `http_client`/`http_server` conseguem ser emitidos.
        metrics.upstream_errors.inc(
            service=service, reason=event.get("reason") or _reason(event.get("message", ""))
        )


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
    if run.live is not None:
        run.live.cost_usd = float(event.get("cost_usd") or 0.0)
        run.live.turns = int(event.get("turns") or 0)
    if run.record is not None:
        # O texto FINAL. `token` e `thought` são delta por letra e não são decisão — gravá-los
        # encheria o diário com o caminho até a frase em vez da frase (§1, `#/journal`).
        run.record["answer"] = event.get("text") or ""
        run.record["cost_usd"] = float(event.get("cost_usd") or 0.0)
        run.record["tokens"] = event.get("tokens") or {}
        run.record["turns"] = int(event.get("turns") or 0)
        if event.get("sources"):
            run.record["sources"] = event["sources"]
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
    """Palpite pela FRASE — só para o erro que não declara motivo (`brain`, `webhooks`, `agent`
    sem `UpstreamError` por trás). ⚠️ Ele nunca devolve `http_client`/`http_server`: adivinhação
    por texto não distingue chave inválida de serviço fora, que é a razão de `UpstreamError.reason`
    existir. Quem tiver o fato manda o fato."""
    lowered = message.lower()
    if "timeout" in lowered:
        return "timeout"
    if "inalcanç" in lowered or "unreachable" in lowered or "refused" in lowered:
        return "unreachable"
    if "json" in lowered or "decode" in lowered:
        return "parse"
    return "other"


def instrument(
    events: Iterator[dict],
    brain: str,
    *,
    question: str = "",
    origin: str = "console",
    journaled: bool = True,
) -> Iterator[dict]:
    """Envolve o stream do agente: repassa cada evento intacto, contabiliza e REGISTRA de lado.

    O `finally` é o que fecha a contabilidade quando o browser desconecta no meio — sem ele,
    `ask_active` vazaria para sempre e a taxa de abortos ficaria invisível. É também o que grava
    a execução abortada: uma execução que rodou e não deixou linha é a ausência que o diário
    existe para acabar, e desconectar não desfaz o que o agente já executou.

    `journaled=False` para uma reprise: reencenar não é decidir de novo, e recontar a linha faria
    o custo do dia crescer sem ninguém ter gasto nada.
    """
    live = running.register(question, origin)
    run = Run(brain, journal.begin(question, origin, brain) if journaled else None, live)
    metrics.ask_active.inc(brain=brain)
    try:
        for event in events:
            observe(run, event)
            yield event
            # Encerramento pedido pela tela de atividade. Parar de consumir FECHA o generator,
            # e o `finally` do `brain` mata o subprocesso — o mesmo caminho que fecha a métrica,
            # o estágio e a linha do diário. Matar o PID por fora faria a execução SUMIR em vez
            # de terminar.
            if live.cancelled:
                run.outcome = "cancelled"
                yield {"t": "state", "state": "error", "label": "ENCERRADA"}
                break
    finally:
        running.unregister(live)
        run.close_stage()
        metrics.ask_active.dec(brain=brain)
        metrics.ask_duration.observe(time.monotonic() - run.started, brain=brain)
        metrics.ask_total.inc(brain=brain, outcome=run.outcome)
        if run.record is not None:
            run.record["outcome"] = run.outcome
            journal.append(run.record)
