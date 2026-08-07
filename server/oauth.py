"""OAuth: Authorization Code + PKCE, com o loopback como redirect.

É o fluxo canônico para aplicação nativa (RFC 8252), e é exatamente o que este servidor é: um
processo local, sem segredo de cliente confiável, servindo a própria página.

**A página nunca toca em segredo, e o agente também não.** `start()` devolve só a URL de
autorização; o `code_verifier` e o `state` ficam em memória com TTL curto, e a troca por token é
POST servidor-a-servidor. O `code` transita pela barra de endereços por um instante — é por isso
que existem `state`, PKCE e TTL, e é por isso que o callback não devolve nada útil ao JavaScript.

⚠️ **Restrições que se declaram, não se descobrem na hora:** alguns provedores exigem `localhost`
em vez de `127.0.0.1`, outros exigem HTTPS no redirect, e TODOS exigem a porta exata registrada.
`ESPATIAL_PORT` deixa de ser detalhe local no momento em que a primeira integração existe — por
isso `providers()` publica o redirect efetivo, para conferir contra o que foi registrado no
provedor antes de a autorização falhar.
"""
import base64
import hashlib
import json
import logging
import os
import secrets
import threading
import time
import urllib.parse
import urllib.request
from typing import Optional

from . import config, credentials, journal

logger = logging.getLogger("espatial.oauth")

# TTL curto de propósito: a janela em que um `state` roubado vale é a janela em que ele existe.
PENDING_TTL_SECONDS = 300

# Provedores conhecidos. `client_id` e `client_secret` vêm do ambiente — um provedor sem id
# configurado aparece na tela como indisponível, com o nome da variável que falta, em vez de
# falhar no meio do fluxo.
PROVIDERS = {
    "github": {
        "label": "GITHUB",
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "scopes": ["repo", "read:org"],
        # O GitHub aceita `127.0.0.1` e não exige HTTPS em loopback.
        "loopback_host": "127.0.0.1",
    },
    "google": {
        "label": "GOOGLE",
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "scopes": ["https://www.googleapis.com/auth/drive.readonly"],
        # O Google exige `localhost` literal em loopback; `127.0.0.1` é recusado no registro.
        "loopback_host": "localhost",
    },
}

_lock = threading.Lock()
_pending: dict[str, dict] = {}


def _env(provider: str, field: str) -> str:
    return os.environ.get(f"OAUTH_{provider.upper()}_{field.upper()}", "")


def redirect_uri(provider: str) -> str:
    spec = PROVIDERS[provider]
    return f"http://{spec['loopback_host']}:{config.get_int('ESPATIAL_PORT')}/api/oauth/callback"


def providers() -> list[dict]:
    """O que a tela desenha, incluindo o que falta configurar e o redirect a registrar."""
    saved = {item["provider"]: item for item in credentials.describe()["providers"]}
    return [
        {
            "id": name,
            "label": spec["label"],
            "scopes": spec["scopes"],
            "configured": bool(_env(name, "client_id")),
            "needs": f"OAUTH_{name.upper()}_CLIENT_ID",
            # O redirect EFETIVO, para conferir contra o registrado no provedor antes de a
            # autorização falhar com uma mensagem que não diz qual dos dois está errado.
            "redirect_uri": redirect_uri(name),
            "credential": saved.get(name),
        }
        for name, spec in PROVIDERS.items()
    ]


def _prune_locked() -> None:
    agora = time.time()
    for state in [s for s, item in _pending.items() if agora - item["at"] > PENDING_TTL_SECONDS]:
        _pending.pop(state, None)


def start(provider: str) -> dict:
    """Devolve APENAS a URL de autorização. A página faz `window.open` e não sabe mais nada."""
    spec = PROVIDERS.get(provider)
    if not spec:
        raise ValueError(f"provedor desconhecido: {provider}")
    client_id = _env(provider, "client_id")
    if not client_id:
        raise ValueError(f"defina OAUTH_{provider.upper()}_CLIENT_ID")

    verifier = secrets.token_urlsafe(64)
    # S256, nunca `plain`: o desafio existe para que interceptar a URL de autorização não baste.
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(32)

    with _lock:
        _prune_locked()
        _pending[state] = {"provider": provider, "verifier": verifier, "at": time.time()}

    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri(provider),
            "scope": " ".join(spec["scopes"]),
            "state": state,
            "response_type": "code",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return {"url": f"{spec['authorize']}?{query}", "provider": provider}


def callback(code: str, state: str) -> dict:
    """Troca o `code` por token, servidor-a-servidor, e grava a credencial."""
    with _lock:
        _prune_locked()
        # `pop`: um `state` vale UMA vez. Deixá-lo vivo transformaria um replay do callback numa
        # segunda troca válida.
        pending = _pending.pop(state, None)

    if not pending:
        journal.denial("oauth", "callback", "state desconhecido ou expirado")
        raise ValueError("state desconhecido ou expirado")
    if not code:
        journal.denial("oauth", pending["provider"], "callback sem code")
        raise ValueError("callback sem code")

    provider = pending["provider"]
    spec = PROVIDERS[provider]
    body = urllib.parse.urlencode(
        {
            "client_id": _env(provider, "client_id"),
            "client_secret": _env(provider, "client_secret"),
            "code": code,
            "redirect_uri": redirect_uri(provider),
            "grant_type": "authorization_code",
            "code_verifier": pending["verifier"],
        }
    ).encode()

    request = urllib.request.Request(
        spec["token"],
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))

    token = payload.get("access_token")
    if not token:
        journal.denial("oauth", provider, f"troca sem access_token: {payload.get('error', '?')}")
        raise ValueError(f"troca falhou: {payload.get('error_description') or payload.get('error') or '?'}")

    expires = payload.get("expires_in")
    credentials.save(
        provider,
        token,
        refresh=payload.get("refresh_token", ""),
        scopes=(payload.get("scope") or "").split() or spec["scopes"],
        expires_at=time.time() + float(expires) if expires else None,
    )
    return {"provider": provider, "fingerprint": credentials.fingerprint(token)}


def pending_count() -> int:
    with _lock:
        _prune_locked()
        return len(_pending)
