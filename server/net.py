"""Cliente HTTP mínimo sobre urllib — o projeto fala com Qdrant, Ollama e provedores de
busca sem arrastar `requests`/`qdrant-client` para as dependências.

Todo erro de rede vira `UpstreamError` com corpo truncado: o handler transforma isso em
JSON para a UI, que precisa mostrar *qual* serviço caiu (o HUD tem um indicador por
serviço) em vez de um 500 anônimo.
"""
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterator, Optional

MAX_ERROR_BODY = 400


class UpstreamError(RuntimeError):
    def __init__(self, service: str, detail: str, status: int = 0):
        super().__init__(f"{service}: {detail}")
        self.service = service
        self.detail = detail
        self.status = status


def _request(
    service: str,
    url: str,
    *,
    method: str = "GET",
    payload: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: float = 30.0,
) -> urllib.request.addinfourl:
    body = None
    all_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        all_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=body, headers=all_headers, method=method)
    try:
        return urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:MAX_ERROR_BODY]
        raise UpstreamError(service, detail or e.reason, e.code) from e
    except urllib.error.URLError as e:
        raise UpstreamError(service, f"inalcançável ({e.reason})") from e
    except TimeoutError as e:
        raise UpstreamError(service, f"timeout em {timeout:.0f}s") from e


def get_json(service: str, url: str, *, headers: Optional[dict] = None, timeout: float = 30.0) -> Any:
    with _request(service, url, headers=headers, timeout=timeout) as response:
        return json.load(response)


def post_json(
    service: str, url: str, payload: dict, *, headers: Optional[dict] = None, timeout: float = 60.0
) -> Any:
    with _request(service, url, method="POST", payload=payload, headers=headers, timeout=timeout) as r:
        return json.load(r)


def stream_ndjson(service: str, url: str, payload: dict, *, timeout: float = 300.0) -> Iterator[dict]:
    """Lê uma resposta linha-a-linha de JSON (formato de stream do Ollama).

    Linha ilegível é descartada em vez de derrubar o stream: o custo de perder um token é
    menor que o de abortar uma resposta inteira já em andamento na tela.
    """
    with _request(service, url, method="POST", payload=payload, timeout=timeout) as response:
        for raw in response:
            line = raw.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def get_text(service: str, url: str, *, headers: Optional[dict] = None, timeout: float = 20.0) -> str:
    with _request(service, url, headers={"Accept": "text/html", **(headers or {})}, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def probe(service: str, url: str, timeout: float = 2.0) -> bool:
    """Sonda de vida: só o status HTTP importa, o corpo não é lido nem parseado.

    Existe porque usar `get_json` para isso é uma armadilha: um `/healthz` que responde 200 com
    corpo VAZIO levanta `JSONDecodeError`, que não é `UpstreamError` — então o `except` óbvio
    não pega e a exceção vaza para quem só queria saber "está no ar?".
    """
    try:
        with _request(service, url, timeout=timeout):
            return True
    except (UpstreamError, OSError, ValueError):
        return False


def encode_query(params: dict) -> str:
    return urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
