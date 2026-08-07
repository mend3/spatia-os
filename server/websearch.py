"""Busca web por provedor — Brave, SerpAPI, SearXNG, e um fallback sem chave.

Cada provedor é um satélite na tela, e a tela precisa saber a verdade: provedor sem chave
aparece como satélite *offline*, não como satélite que não respondeu. Por isso
`availability()` é separado de `search()` — o HUD consulta o primeiro no boot.

O fallback (DuckDuckGo HTML) existe para a instalação recém-clonada ter meteoros reais na
primeira execução, sem nenhuma chave. Ele raspa HTML, então quebra quando a página mudar —
é conveniência de demonstração, não caminho de produção.
"""
import html
import logging
import re
import time
from typing import Callable

from . import config, net

logger = logging.getLogger("espatial.websearch")

MAX_RESULTS = 6
SNIPPET_CHARS = 240


# O resultado da sonda do SearXNG, com validade curta: o `/api/health` é consultado em loop
# pela UI, e sondar a cada chamada transformaria a checagem num ping constante.
_PROBE_TTL_SECONDS = 30
_searxng_probe: tuple[float, bool] = (0.0, False)


def searxng_up() -> bool:
    """Sonda o SearXNG de verdade.

    Provedor sem chave é diferente em espécie dos com chave: para Brave e SerpAPI, a ausência
    da variável É a resposta (sem credencial não há como consultar). Para o SearXNG,
    self-hosted e keyless, a variável não prova nada — ela pode estar setada e o container
    desligado, ou vazia e o serviço no ar no endereço padrão. Só a sonda responde.
    """
    global _searxng_probe
    base = config.get("SEARXNG_URL").rstrip("/")
    if not base:
        return False
    now = time.monotonic()
    if now - _searxng_probe[0] < _PROBE_TTL_SECONDS:
        return _searxng_probe[1]
    # `net.probe`, não `get_json`: o `/healthz` do searxng responde 200 com corpo VAZIO, e
    # parsear isso levantava JSONDecodeError — que não é UpstreamError, vazava do `except` e
    # quebrava o /api/health inteiro. Sonda de vida não lê corpo.
    up = net.probe("searxng", f"{base}/healthz") or net.probe("searxng", f"{base}/config")
    _searxng_probe = (now, up)
    return up


def availability() -> list[dict]:
    """O que a UI desenha como satélite, com o motivo de estar offline."""
    searxng = searxng_up()
    return [
        {"id": "brave", "label": "BRAVE", "online": bool(config.get("BRAVE_API_KEY")), "needs": "BRAVE_API_KEY"},
        {"id": "serpapi", "label": "SERPAPI", "online": bool(config.get("SERPAPI_API_KEY")), "needs": "SERPAPI_API_KEY"},
        {
            "id": "searxng",
            "label": "SEARXNG",
            "online": searxng,
            # Sem chave para pedir: se estiver fora, o que falta é o serviço, não credencial.
            "needs": "" if searxng else f"serviço em {config.get('SEARXNG_URL')} (oracle: make up searxng)",
        },
        {"id": "duckduckgo", "label": "DDG·FALLBACK", "online": True, "needs": ""},
    ]


def online_providers() -> list[str]:
    keyed = [p["id"] for p in availability() if p["online"] and p["id"] != "duckduckgo"]
    return keyed or ["duckduckgo"]


def search(provider: str, query: str) -> list[dict]:
    runner = _PROVIDERS.get(provider)
    if runner is None:
        raise ValueError(f"provedor desconhecido: {provider}")
    return runner(query)[:MAX_RESULTS]


def _result(title: str, url: str, snippet: str) -> dict:
    return {
        "title": _clean(title)[:160],
        "url": url,
        "snippet": _clean(snippet)[:SNIPPET_CHARS],
    }


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def _brave(query: str) -> list[dict]:
    url = "https://api.search.brave.com/res/v1/web/search?" + net.encode_query(
        {"q": query, "count": MAX_RESULTS}
    )
    data = net.get_json(
        "brave", url, headers={"X-Subscription-Token": config.get("BRAVE_API_KEY")}, timeout=15
    )
    return [
        _result(item.get("title", ""), item.get("url", ""), item.get("description", ""))
        for item in (data.get("web") or {}).get("results", [])
    ]


def _serpapi(query: str) -> list[dict]:
    url = "https://serpapi.com/search.json?" + net.encode_query(
        {"q": query, "num": MAX_RESULTS, "api_key": config.get("SERPAPI_API_KEY")}
    )
    data = net.get_json("serpapi", url, timeout=20)
    return [
        _result(item.get("title", ""), item.get("link", ""), item.get("snippet", ""))
        for item in data.get("organic_results", [])
    ]


def _searxng(query: str) -> list[dict]:
    base = config.get("SEARXNG_URL").rstrip("/")
    url = f"{base}/search?" + net.encode_query({"q": query, "format": "json"})
    data = net.get_json("searxng", url, timeout=20)
    return [
        _result(item.get("title", ""), item.get("url", ""), item.get("content", ""))
        for item in data.get("results", [])
    ]


def _duckduckgo(query: str) -> list[dict]:
    """Raspagem do HTML lite. Frágil por natureza — falha vira lista vazia, não exceção."""
    url = "https://html.duckduckgo.com/html/?" + net.encode_query({"q": query})
    try:
        page = net.get_text(
            "duckduckgo", url, headers={"User-Agent": "Mozilla/5.0 (SpatIA)"}, timeout=15
        )
    except net.UpstreamError as e:
        logger.warning(f"fallback ddg falhou: {e}")
        return []

    results = []
    pattern = re.compile(
        r'<a[^>]+class="result__a"[^>]+href="(?P<url>[^"]+)"[^>]*>(?P<title>.*?)</a>'
        r'.*?class="result__snippet"[^>]*>(?P<snippet>.*?)</a>',
        re.S,
    )
    for match in pattern.finditer(page):
        results.append(_result(match.group("title"), match.group("url"), match.group("snippet")))
        if len(results) >= MAX_RESULTS:
            break
    return results


_PROVIDERS: dict[str, Callable[[str], list[dict]]] = {
    "brave": _brave,
    "serpapi": _serpapi,
    "searxng": _searxng,
    "duckduckgo": _duckduckgo,
}
