"""Webhooks de entrada: o mundo externo virando eventos da cena.

Um push do GitHub cai como meteoro, um build vermelho vira glitch, um alerta do Prometheus
acende o núcleo. Isso funciona porque o protocolo de eventos já existe — um webhook não é um
sistema paralelo, é **mais um produtor no mesmo barramento** que o ciclo cognitivo usa.

Consequência de projeto: nenhum widget, shader ou métrica precisa saber que webhook existe.
Quem desenha `tool` desenha o `tool` de um webhook do mesmo jeito.

Segurança — três camadas, e vale ser explícito sobre o que cada uma cobre:

1. **Segredo por fonte OBRIGATÓRIO** (`WEBHOOK_SECRET_<FONTE>`): HMAC-SHA256 do corpo cru,
   comparado em tempo constante. Sem segredo, o endpoint **não sobe** — devolve 401 e a recusa
   vira linha no diário. Esta é a única rota do sistema sem barreira de origem (o remetente é um
   servidor e não preenche `Sec-Fetch-Site`), então o HMAC não é configurável: é o que existe.
2. **Corpo limitado.** `Content-Length` acima do teto é recusado antes de ler.
3. **Sem `Sec-Fetch-Site`.** Ao contrário de `/api/ask`, aqui a chamada VEM de fora por
   definição, então a barreira de mesma origem não se aplica — quem protege é o HMAC.

**Política por endpoint** (`WEBHOOK_POLICY_<FONTE>`), com `draw` de default:

- `draw`    — publica no barramento; a cena desenha e nada fica retido
- `enqueue` — publica E grava na fila em disco, para quem chegar depois ver o que passou
- `off`     — recusa. Endpoint desligado é decisão declarada, e a recusa é registrada

O que este módulo NÃO faz: retry com recuo, ordenação, entrega exatamente-uma-vez. A fila em
disco (`hookqueue`) dá DURABILIDADE, que é o que o 202 promete — não um broker.
"""
import hashlib
import hmac
import json
import logging
import os
import threading
import time
from collections import deque
from typing import Iterator

from . import ambient, config, hookqueue, journal, metrics

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


def secret_for(source: str) -> str:
    return os.environ.get(f"WEBHOOK_SECRET_{source.upper()}", "")


POLICIES = ("draw", "enqueue", "off")


def policy_for(source: str) -> str:
    """`draw` de default: o efeito mais barato e o único que não retém nada."""
    declared = os.environ.get(f"WEBHOOK_POLICY_{source.upper()}", "").strip().lower()
    return declared if declared in POLICIES else "draw"


# Teto de entregas por fonte numa janela. Não é anti-DDoS — é o que impede um remetente em laço
# de encher o disco da fila e o diário de recusas.
RATE_WINDOW_SECONDS = 60
RATE_MAX = 60
_rate: dict[str, list[float]] = {}


def _rate_ok(source: str) -> bool:
    agora = time.time()
    with _lock:
        marcas = [t for t in _rate.get(source, []) if agora - t < RATE_WINDOW_SECONDS]
        if len(marcas) >= RATE_MAX:
            _rate[source] = marcas
            return False
        marcas.append(agora)
        _rate[source] = marcas
        return True


def availability() -> list[dict]:
    """O que a tela de integrações desenha, incluindo quem está desligado por falta de segredo."""
    return [
        {
            "id": source,
            "label": meta["label"],
            "kind": meta["kind"],
            "verified": bool(secret_for(source)),
            # `policy` e `live` são o que a tela precisa para distinguir os três estados: no ar,
            # desligado por decisão, e desligado por falta de segredo. Sem isso um endpoint sem
            # segredo pareceria "aberto", que é o oposto do que ele agora faz.
            "policy": policy_for(source),
            "live": bool(secret_for(source)) and policy_for(source) != "off",
            "url": f"/hooks/{source}",
            "needs": f"WEBHOOK_SECRET_{source.upper()}",
        }
        for source, meta in SOURCES.items()
    ]


def verify(source: str, body: bytes, headers) -> tuple[bool, str]:
    """(aceito, motivo).

    ⚠️ Chamada SÓ depois de `deliver` garantir que há segredo. Sem ele o endpoint não sobe, e
    esta função não tem mais um caminho de "aceita sem verificar" — deixá-lo aqui seria uma
    segunda porta para a política que a rota acabou de fechar.
    """
    secret = secret_for(source)
    if not secret:
        return False, "sem segredo configurado"

    # GitHub manda `sha256=<hex>`; os demais, o hex puro. Aceitar os dois evita um campo de
    # configuração que só existiria para acomodar um prefixo. `X-Espatial-Signature` é o nome
    # que a documentação publica, então é o primeiro da lista.
    provided = (
        headers.get("X-Espatial-Signature")
        or headers.get("X-Hub-Signature-256")
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
    policy = policy_for(source)

    def recusa(reason: str) -> dict:
        """Toda recusa vira LINHA NO DIÁRIO. Um endpoint que recusa em silêncio é
        indistinguível de um endpoint que ninguém está usando."""
        metrics.webhook_total.inc(source=_bounded(source), outcome="error")
        logger.warning(f"webhook {source} recusado: {reason}")
        journal.denial("webhook", source, reason)
        return {"accepted": False, "reason": reason}

    if policy == "off":
        return recusa("endpoint desligado por política")

    # ⚠️ Sem segredo o endpoint NÃO SOBE. `Sec-Fetch-Site` não protege esta rota — o remetente é
    # um servidor e não preenche o cabeçalho —, então o HMAC é a única barreira que existe aqui.
    if not secret_for(source):
        return recusa("sem segredo configurado — endpoint não sobe")

    if not _rate_ok(source):
        return recusa(f"limite de {RATE_MAX} entregas por {RATE_WINDOW_SECONDS}s")

    accepted, reason = verify(source, body, headers)
    if not accepted:
        return recusa(reason)

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
        # O `detail` mora no evento de RESULTADO, não no de chamada: `events[0]` é sempre a
        # abertura do wormhole e nunca tem descrição. Toda entrega ficava com resumo vazio, e a
        # tela de entregas recentes mostrava "—" para tudo desde que existe.
        "summary": next((event.get("detail") for event in events if event.get("detail")), ""),
        "events": len(events),
    }

    record["policy"] = policy
    # `enqueue` grava ANTES de publicar: publicar primeiro e cair antes de gravar devolveria um
    # 202 por uma entrega que só existiu na memória de quem já morreu.
    if policy == "enqueue":
        record["queued"] = hookqueue.enqueue(source, events, record["summary"]) is not None

    with _lock:
        _history.appendleft(record)
    ambient.publish(events)

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
        "origin": "webhook",
        "detail": detail,
    }
    yield {
        "t": "tool",
        "phase": "result",
        "id": event_id,
        "tool": f"hook.{source}",
        "kind": meta["kind"],
        # ⚠️ `origin` nos TRÊS eventos, não só no `call`.
        #
        # O widget ENTREGAS RECENTES redesenha em `origin == "webhook" and phase == "result"`
        # — uma condição que era IMPOSSÍVEL de satisfazer, porque só o `call` carregava o
        # campo. O widget nunca atualizou desde o primeiro desenho, e o comentário dele
        # descrevia um comportamento que nunca existiu.
        "origin": "webhook",
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


def history() -> list[dict]:
    with _lock:
        return list(_history)


def _bounded(source: str) -> str:
    return source if source in SOURCES else "other"
