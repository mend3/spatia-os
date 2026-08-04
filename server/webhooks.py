"""Webhooks de entrada: o mundo externo virando eventos da cena.

Um push do GitHub cai como meteoro, um build vermelho vira glitch, um alerta do Prometheus
acende o núcleo. Isso funciona porque o protocolo de eventos já existe — um webhook não é um
sistema paralelo, é **mais um produtor no mesmo barramento** que o ciclo cognitivo usa.

Consequência de projeto: nenhum widget, shader ou métrica precisa saber que webhook existe.
Quem desenha `tool` desenha o `tool` de um webhook do mesmo jeito.

Segurança — três camadas, e vale ser explícito sobre o que cada uma cobre:

1. **Segredo por fonte** (`WEBHOOK_SECRET_<FONTE>`): HMAC-SHA256 do corpo cru, comparado em
   tempo constante. Sem segredo configurado a fonte aceita sem verificar, e isso aparece na UI
   como *não verificada* — um webhook aberto que se anuncia é melhor que um que finge.
2. **Corpo limitado.** `Content-Length` acima do teto é recusado antes de ler.
3. **Sem `Sec-Fetch-Site`.** Ao contrário de `/api/ask`, aqui a chamada VEM de fora por
   definição, então a barreira de mesma origem não se aplica — quem protege é o HMAC.

O que este módulo NÃO faz: fila, retry, entrega garantida. Um webhook perdido é um meteoro que
não apareceu; inventar durabilidade para efeito visual seria complexidade sem dono.
"""
import hashlib
import hmac
import json
import logging
import os
import threading
import time
from collections import deque
from typing import Iterator, Optional

from . import config, metrics

logger = logging.getLogger("espatial.webhooks")

MAX_BODY_BYTES = 512 * 1024
HISTORY = 60

# Fontes conhecidas. `kind` é a família de cor que a cena usa (a mesma de `tool.kind`), então
# um evento do GitHub chega azul e um de banco chega amarelo sem tradução extra na UI.
SOURCES = {
    "github": {"label": "GITHUB", "kind": "github"},
    "prometheus": {"label": "PROMETHEUS", "kind": "database"},
    "ci": {"label": "CI", "kind": "shell"},
    "generic": {"label": "GENÉRICO", "kind": "other"},
}

_lock = threading.Lock()
_history: deque = deque(maxlen=HISTORY)
# Assinantes do stream SSE de eventos do sistema. Cada um é uma fila própria: um cliente lento
# não pode segurar a entrega para os outros nem para quem fez o POST.
_subscribers: list[deque] = []


def secret_for(source: str) -> str:
    return os.environ.get(f"WEBHOOK_SECRET_{source.upper()}", "")


def availability() -> list[dict]:
    """O que a tela de integrações desenha, incluindo quem está sem verificação."""
    return [
        {
            "id": source,
            "label": meta["label"],
            "kind": meta["kind"],
            "verified": bool(secret_for(source)),
            "url": f"/hooks/{source}",
            "needs": f"WEBHOOK_SECRET_{source.upper()}",
        }
        for source, meta in SOURCES.items()
    ]


def verify(source: str, body: bytes, headers) -> tuple[bool, str]:
    """(aceito, motivo). Sem segredo configurado, aceita e o diz."""
    secret = secret_for(source)
    if not secret:
        return True, "sem verificação"

    # GitHub manda `sha256=<hex>`; os demais, o hex puro. Aceitar os dois evita um campo de
    # configuração que só existiria para acomodar um prefixo.
    provided = (
        headers.get("X-Hub-Signature-256")
        or headers.get("X-Signature-256")
        or headers.get("X-Signature")
        or ""
    ).strip()
    if provided.startswith("sha256="):
        provided = provided[7:]
    if not provided:
        return False, "assinatura ausente"

    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    # `compare_digest`: comparação de string comum vaza o prefixo correto pelo tempo.
    if not hmac.compare_digest(expected, provided):
        return False, "assinatura inválida"
    return True, "verificada"


def deliver(source: str, body: bytes, headers) -> dict:
    """Verifica, traduz e publica. Devolve o resumo que a resposta HTTP leva."""
    meta = SOURCES.get(source) or SOURCES["generic"]
    accepted, reason = verify(source, body, headers)

    if not accepted:
        metrics.webhook_total.inc(source=_bounded(source), outcome="error")
        logger.warning(f"webhook {source} recusado: {reason}")
        return {"accepted": False, "reason": reason}

    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        # Corpo não-JSON não é erro do remetente necessariamente (form-encoded, texto). O
        # evento ainda vale: alguém chamou. O que se perde é só o detalhe.
        payload = {"raw": body.decode("utf-8", "replace")[:400]}

    events = list(translate(source, meta, payload, headers))
    record = {
        "at": time.time(),
        "source": source,
        "label": meta["label"],
        "kind": meta["kind"],
        "verified": reason == "verificada",
        "summary": events[0].get("detail", "") if events else "",
        "events": len(events),
    }

    with _lock:
        _history.appendleft(record)
        for queue in _subscribers:
            for event in events:
                queue.append(event)

    metrics.webhook_total.inc(source=_bounded(source), outcome="success")
    metrics.webhook_events.observe(len(events))
    logger.info(f"webhook {source}: {len(events)} evento(s) · {record['summary'][:60]}")
    return {"accepted": True, "reason": reason, "events": len(events)}


def translate(source: str, meta: dict, payload: dict, headers) -> Iterator[dict]:
    """Traduz o corpo para eventos do protocolo — o único lugar que conhece formato de terceiro.

    Cada fonte vira um par `tool` call/result porque é isso que a cena já sabe desenhar: abre
    um wormhole na cor da família e fecha quando o resultado chega. Um tipo de evento novo só
    para webhook exigiria shader novo para dizer a mesma coisa.
    """
    detail, ok = _summarize(source, payload, headers)
    event_id = f"hook:{source}:{int(time.time() * 1000)}"

    yield {
        "t": "tool",
        "phase": "call",
        "id": event_id,
        "tool": f"hook.{source}",
        "kind": meta["kind"],
        "origin": "webhook",
    }
    yield {
        "t": "tool",
        "phase": "args",
        "id": event_id,
        "tool": f"hook.{source}",
        "kind": meta["kind"],
        "detail": detail,
    }
    yield {
        "t": "tool",
        "phase": "result",
        "id": event_id,
        "tool": f"hook.{source}",
        "kind": meta["kind"],
        "ok": ok,
        "detail": detail,
    }
    if not ok:
        # Falha externa vira interferência na cena — o glitch já está ligado a `error`.
        yield {"t": "error", "service": source, "message": detail}


def _summarize(source: str, payload: dict, headers) -> tuple[str, bool]:
    """Uma linha do que aconteceu, e se foi sucesso. Formato por fonte, sem biblioteca."""
    if source == "github":
        event = headers.get("X-GitHub-Event", "?")
        repo = (payload.get("repository") or {}).get("full_name", "?")
        if event == "push":
            commits = payload.get("commits") or []
            ref = str(payload.get("ref", "")).split("/")[-1]
            return f"push · {repo}@{ref} · {len(commits)} commit(s)", True
        if event == "workflow_run":
            run = payload.get("workflow_run") or {}
            conclusion = run.get("conclusion") or run.get("status") or "?"
            return f"{run.get('name', 'workflow')} · {repo} · {conclusion}", conclusion == "success"
        return f"{event} · {repo}", True

    if source == "prometheus":
        alerts = payload.get("alerts") or []
        firing = [a for a in alerts if a.get("status") == "firing"]
        names = ", ".join(
            (a.get("labels") or {}).get("alertname", "?") for a in (firing or alerts)[:3]
        )
        return f"{len(firing)} firing de {len(alerts)} · {names}", not firing

    if source == "ci":
        status = str(payload.get("status") or payload.get("conclusion") or "?")
        return f"{payload.get('name', 'build')} · {status}", status in ("success", "passed", "ok")

    keys = ", ".join(list(payload)[:4]) or "corpo vazio"
    return f"{keys}", True


def subscribe() -> deque:
    queue: deque = deque(maxlen=200)
    with _lock:
        _subscribers.append(queue)
    return queue


def unsubscribe(queue: deque) -> None:
    with _lock:
        if queue in _subscribers:
            _subscribers.remove(queue)


def history() -> list[dict]:
    with _lock:
        return list(_history)


def _bounded(source: str) -> str:
    return source if source in SOURCES else "other"
