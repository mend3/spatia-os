"""O ciclo cognitivo — uma pergunta entra, uma sequência de eventos sai.

Este módulo é o contrato do sistema. A UI não sabe o que é Qdrant nem Ollama: ela sabe
desenhar `state`, `tool`, `memory`, `web`, `token`. Trocar o retriever ou o modelo não muda
uma linha de shader.

Todo evento leva tempo medido (`ms`). A timeline da tela não é decorativa — é o profile
real da execução, e é assim que se vê que a recuperação custou 80ms e o modelo local 9s.
"""
import logging
import time
from typing import Iterator

from . import brain, config, llm, net, qdrant, websearch

logger = logging.getLogger("espatial.agent")

MEMORY_LIMIT = 6

# Gatilhos que levam a consulta para fora da máquina. A intenção é conservadora: a busca
# web é o único passo que expõe a pergunta a terceiros, então ela é opt-in por palavra
# explícita ou por toggle da UI, nunca por inferência frouxa.
WEB_TRIGGERS = (
    "web", "internet", "notícia", "noticia", "hoje", "atual", "última", "ultima",
    "recente", "mercado", "preço", "preco", "lançou", "lancou", "google", "pesquise",
)

TOOL_KINDS = {
    "qdrant.query": "database",
    "qdrant.chunks": "database",
    "qdrant.neighbors": "database",
    "web.search": "browser",
    "fs.read": "filesystem",
    "ollama.generate": "llm",
    "neo4j.cypher": "database",
}


def wants_web(question: str, forced: bool | None) -> bool:
    if forced is not None:
        return forced
    lowered = question.lower()
    return any(trigger in lowered for trigger in WEB_TRIGGERS)


def run(question: str, *, web: bool | None = None) -> Iterator[dict]:
    """Gera os eventos de uma execução completa. Nunca levanta: falha vira evento `error`."""
    started = time.monotonic()
    question = question.strip()
    if not question:
        yield {"t": "error", "service": "agent", "message": "pergunta vazia"}
        yield {"t": "done"}
        return

    use_web = wants_web(question, web)
    yield {"t": "query", "text": question, "web": use_web}
    yield {"t": "state", "state": "thinking", "label": "ORIENTANDO"}
    yield {
        "t": "plan",
        "steps": _plan(use_web),
    }

    memory_hits: list[dict] = []
    yield from _step_memory(question, memory_hits)

    web_hits: list[dict] = []
    if use_web:
        yield from _step_web(question, web_hits)

    yield from _step_answer(question, memory_hits, web_hits, started)
    yield {"t": "done"}


def _plan(use_web: bool) -> list[dict]:
    steps = [
        {"id": "memory", "label": "RECUPERAR MEMÓRIA VETORIAL", "target": "qdrant"},
    ]
    if use_web:
        steps.append({"id": "web", "label": "VARRER SATÉLITES DE BUSCA", "target": "web"})
    steps.append({"id": "answer", "label": "SINTETIZAR RESPOSTA", "target": config.get("BRAIN")})
    return steps


def _step_memory(question: str, collected: list[dict]) -> Iterator[dict]:
    """Gerador, não lista: cada evento sai no instante em que acontece.

    Isso não é estilo — acumular numa lista e devolver no fim fazia o estágio `retrieve`
    medir o tempo do loop de yield (0,2ms) em vez do tempo da recuperação (8ms). A própria
    métrica denunciou o erro, e a correção é emitir em tempo real.
    """
    yield {"t": "state", "state": "retrieving", "label": "RECUPERANDO MEMÓRIA"}
    yield _tool_call("qdrant.query", f"híbrido denso+bm25 · limite {MEMORY_LIMIT}")
    clock = time.monotonic()
    try:
        hits = qdrant.search(question, limit=MEMORY_LIMIT)
    except Exception as e:  # noqa: BLE001 — degradar, não abortar: o agente ainda responde
        yield _tool_result("qdrant.query", clock, ok=False, detail=str(e))
        yield {"t": "error", "service": "qdrant", "message": str(e)}
        return

    collected.extend(hits)
    yield _tool_result("qdrant.query", clock, detail=f"{len(hits)} chunks")
    yield {"t": "memory", "hits": hits}


def _step_web(question: str, collected: list[dict]) -> Iterator[dict]:
    yield {"t": "state", "state": "searching", "label": "VARRENDO A REDE"}
    for provider in websearch.online_providers():
        yield _tool_call("web.search", f"{provider} · {question[:48]}")
        yield {"t": "web", "phase": "start", "provider": provider}
        clock = time.monotonic()
        try:
            results = websearch.search(provider, question)
        except Exception as e:  # noqa: BLE001 — um provedor caído não derruba a execução
            yield _tool_result("web.search", clock, ok=False, detail=f"{provider}: {e}")
            yield {"t": "web", "phase": "error", "provider": provider, "message": str(e)}
            continue
        collected.extend(results)
        yield _tool_result("web.search", clock, detail=f"{provider}: {len(results)} resultados")
        yield {"t": "web", "phase": "result", "provider": provider, "results": results}


def sources_of(memory_hits: list[dict], web_hits: list[dict]) -> list[dict]:
    """A numeração que vai no prompt é a mesma que a HUD mostra — `[2]` na resposta tem que
    apontar para a mesma linha na lista de fontes, senão a citação é decorativa."""
    sources = [
        {"n": i, "kind": "memory", "label": hit["source"], "section": hit.get("section", "")}
        for i, hit in enumerate(memory_hits, 1)
    ]
    offset = len(memory_hits)
    sources += [
        {"n": offset + i, "kind": "web", "label": hit["title"], "url": hit["url"]}
        for i, hit in enumerate(web_hits, 1)
    ]
    return sources


def _step_answer(question: str, memory_hits: list[dict], web_hits: list[dict], started: float) -> Iterator[dict]:
    sources = sources_of(memory_hits, web_hits)
    yield {"t": "sources", "sources": sources}
    yield {"t": "state", "state": "thinking", "label": "ACORDANDO O NÚCLEO"}

    if config.get("BRAIN") == "claude":
        yield from _brain_claude(question, memory_hits, web_hits, sources)
    else:
        yield from _brain_ollama(question, memory_hits, web_hits, started)


def _brain_claude(question: str, memory_hits: list[dict], web_hits: list[dict], sources: list[dict]) -> Iterator[dict]:
    """O agente de verdade: recebe o contexto recuperado e ainda pode usar as ferramentas
    dele. Os eventos de estado/tool/token/resposta vêm do próprio stream do CLI."""
    prompt = llm.build_prompt(question, memory_hits, web_hits)
    produced_answer = False
    for event in brain.stream(prompt):
        if event.get("t") == "answer":
            produced_answer = True
            event = {**event, "sources": sources}
        yield event
    if not produced_answer:
        yield {"t": "error", "service": "claude", "message": "agente terminou sem resposta"}
        yield {"t": "state", "state": "error", "label": "SEM RESPOSTA"}


def _brain_ollama(question: str, memory_hits: list[dict], web_hits: list[dict], started: float) -> Iterator[dict]:
    yield {"t": "state", "state": "answering", "label": "SINTETIZANDO"}
    yield _tool_call("ollama.generate", config.get("OLLAMA_MODEL"))
    clock = time.monotonic()
    pieces: list[str] = []
    try:
        for chunk in llm.stream(question, memory_hits, web_hits):
            pieces.append(chunk)
            yield {"t": "token", "text": chunk}
    except Exception as e:  # noqa: BLE001
        yield _tool_result("ollama.generate", clock, ok=False, detail=str(e))
        yield {"t": "error", "service": "ollama", "message": str(e)}
        yield {"t": "state", "state": "error", "label": "FALHA DE SÍNTESE"}
        return

    answer = "".join(pieces).strip()
    yield _tool_result("ollama.generate", clock, detail=f"{len(answer)} caracteres")
    yield {
        "t": "answer",
        "text": answer,
        "ms": round((time.monotonic() - started) * 1000),
        "sources": sources_of(memory_hits, web_hits),
    }
    yield {"t": "state", "state": "idle", "label": "OCIOSO"}


def _tool_call(tool: str, detail: str) -> dict:
    return {"t": "tool", "phase": "call", "tool": tool, "kind": TOOL_KINDS.get(tool, "other"), "detail": detail}


def _tool_result(tool: str, clock: float, *, ok: bool = True, detail: str = "") -> dict:
    return {
        "t": "tool",
        "phase": "result",
        "tool": tool,
        "kind": TOOL_KINDS.get(tool, "other"),
        "ok": ok,
        "detail": detail,
        "ms": round((time.monotonic() - clock) * 1000),
    }
