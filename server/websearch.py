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
from typing import Callable

from . import config, net

logger = logging.getLogger("espatial.websearch")

MAX_RESULTS = 6
SNIPPET_CHARS = 240


def availability() -> list[dict]:
    """O que a UI desenha como satélite, com o motivo de estar offline."""
    return [
        {"id": "brave", "label": "BRAVE", "online": bool(config.get("BRAVE_API_KEY")), "needs": "BRAVE_API_KEY"},
        {"id": "serpapi", "label": "SERPAPI", "online": bool(config.get("SERPAPI_API_KEY")), "needs": "SERPAPI_API_KEY"},
        {"id": "searxng", "label": "SEARXNG", "online": bool(config.get("SEARXNG_URL")), "needs": "SEARXNG_URL"},
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
            "duckduckgo", url, headers={"User-Agent": "Mozilla/5.0 (espatial-os)"}, timeout=15
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
