"""A ponte autenticada: o agente fala com ela, não com o terceiro.

É a extensão de um princípio que este projeto já tomou — *o browser fala com `/api/tts`, não com
o TTS*. A regra completa passa a ser **o agente fala com a ponte**, e a ponte é o único lugar do
sistema onde um segredo é lido.

O que isso compra, e cada item é concreto:

- o token **nunca entra no contexto do agente**, logo não vaza numa resposta nem num log de tool;
- cada chamada nasce no diário, com provedor e caminho;
- revogar é apagar uma linha, sem reiniciar sessão nem reescrever config;
- o teto por execução tem onde ser aplicado.

⚠️ **A alternativa (MCP com ambiente injetado) continua sendo obrigatória para MCP autenticado**,
porque o protocolo é do servidor MCP e não passa por aqui. A ponte é preferível quando o terceiro
é REST — que é o caso da maioria.

⚠️ **O caminho é PREFIXADO, não livre.** Sem isso a ponte seria um proxy autenticado para
qualquer host da internet com a credencial do operador — um SSRF com token embutido, e de graça.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

from . import credentials, journal, metrics

logger = logging.getLogger("espatial.bridge")

MAX_RESPONSE_BYTES = 256 * 1024

# Base por provedor. O caminho que o agente pede é ANEXADO a esta base e nunca a substitui: é o
# que impede a ponte de virar proxy para host arbitrário.
BASES = {
    "github": "https://api.github.com",
    "google": "https://www.googleapis.com",
}

# Cabeçalho de autorização por provedor. GitHub aceita `Bearer` desde 2021; manter a forma por
# provedor evita descobrir a diferença com um 401 sem explicação.
AUTH = {
    "github": lambda token: {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    "google": lambda token: {"Authorization": f"Bearer {token}"},
}


def available() -> list[dict]:
    saved = {item["provider"]: item for item in credentials.describe()["providers"]}
    return [
        {
            "id": name,
            "base": base,
            "ready": name in saved and saved[name]["state"] == "válida",
            "state": saved.get(name, {}).get("state", "ausente"),
            # A URL que o AGENTE recebe. É só isto que ele precisa saber, e é só isto que ele sabe.
            "url": f"/api/bridge/{name}/<caminho>",
        }
        for name, base in BASES.items()
    ]


def _safe_path(raw: str) -> Optional[str]:
    """Recusa o que sairia da base: `..`, esquema, host, barra dupla."""
    caminho = raw.lstrip("/")
    if not caminho:
        return ""
    if "://" in caminho or caminho.startswith("/") or ".." in caminho.split("/"):
        return None
    return caminho


def call(provider: str, path: str, *, method: str = "GET", body: bytes = b"",
         query: str = "") -> tuple[int, dict]:
    """Chama o terceiro com o `Authorization` injetado aqui. Devolve (status, payload)."""
    base = BASES.get(provider)
    if not base:
        return 404, {"error": f"provedor desconhecido: {provider}"}

    caminho = _safe_path(path)
    if caminho is None:
        journal.denial("bridge", provider, f"caminho recusado: {path}")
        return 400, {"error": "caminho inválido — a ponte não sai da base do provedor"}

    token = credentials.token_for(provider)
    if not token:
        journal.denial("bridge", provider, "sem credencial")
        return 401, {"error": f"sem credencial para {provider} — autorize em #/integrations"}

    url = f"{base}/{caminho}" + (f"?{query}" if query else "")
    request = urllib.request.Request(
        url,
        data=body or None,
        method=method,
        headers={**AUTH[provider](token), "User-Agent": "SpatIA"},
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read(MAX_RESPONSE_BYTES)
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read(MAX_RESPONSE_BYTES)
        status = error.code
    except OSError as error:
        metrics.upstream_up.set(0, service=provider)
        return 502, {"error": f"{provider} inalcançável: {error}"}

    metrics.upstream_up.set(1 if status < 500 else 0, service=provider)
    # O caminho vai para o log; o token não tem como ir, porque não passa por aqui como dado —
    # ele é montado no header e descartado com a requisição.
    logger.info(f"ponte {provider} {method} /{caminho} → {status}")

    try:
        return status, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return status, {"raw": raw.decode("utf-8", "replace")[:2000]}
