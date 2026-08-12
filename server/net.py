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
from urllib.response import addinfourl

MAX_ERROR_BODY = 400


class UpstreamError(RuntimeError):
    """Falha de um serviço externo, com o MOTIVO junto — não só o texto.

    ⚠️ `reason` existe porque ele estava sendo RECONSTRUÍDO a partir da mensagem: `recorder._reason`
    procurava "timeout"/"inalcanç"/"json" dentro da frase para escolher o rótulo da métrica, e
    `app.py` respondia `reason="unreachable"` fixo em toda falha de TTS. Duas consequências
    medidas: chave inválida (401) e serviço fora (503) chegavam ao operador como o mesmo 502
    anônimo, e dois dos seis rótulos de `UPSTREAM_REASONS` (`http_client`, `http_server`) não
    tinham NINGUÉM capaz de emiti-los — vocabulário declarado sem escritor, que é a mesma classe
    de defeito que `forbids`/`features` já pagou do outro lado.

    O motivo é decidido aqui, onde o fato existe: quem levanta sabe se foi timeout, rede ou
    resposta HTTP, e o status classifica as duas famílias de HTTP.
    """

    def __init__(self, service: str, detail: str, status: int = 0, reason: str = ""):
        super().__init__(f"{service}: {detail}")
        self.service = service
        self.detail = detail
        self.status = status
        self.reason = reason or _reason_of(status)


def _mensagem_de(corpo: str) -> str:
    """A frase LEGÍVEL de um corpo de erro, ou o corpo cru quando ele não é JSON conhecido.

    ☠️ **O corpo cru vazava até a TELA DE ENTRADA.** Com a coleção ausente, o operador lia
    `{"status":{"error":"Not found: Collection \u0060x\u0060 doesn't exist!"},"time":5.8e-6}` —
    payload de upstream apresentado como diagnóstico, com um tempo de resposta em notação
    científica no meio. Ele não diz o que fazer e ocupa a linha que deveria dizer.

    ⚠️ **Isto NÃO mexe em `status` nem em `reason`** — os dois continuam saindo do FATO, e é sobre
    eles que `scripts/motivo-upstream.py` legisla. Aqui é só a frase.

    ⭑ As três formas cobrem o que esta base fala: Qdrant aninha em `status.error`, o padrão de
    APIs JSON é `error`/`message`, e o resto volta como veio — nunca vazio, porque perder a única
    pista seria pior que mostrá-la feia.
    """
    corpo = corpo.strip()
    if not corpo.startswith("{"):
        return corpo
    try:
        dados = json.loads(corpo)
    except ValueError:
        return corpo
    if not isinstance(dados, dict):
        return corpo
    aninhado = dados.get("status")
    if isinstance(aninhado, dict) and isinstance(aninhado.get("error"), str):
        return aninhado["error"]
    for chave in ("error", "message", "detail"):
        if isinstance(dados.get(chave), str) and dados[chave]:
            return dados[chave]
    return corpo


def _reason_of(status: int) -> str:
    """Rótulo de `metrics.UPSTREAM_REASONS` para um status HTTP. 0 = nem chegou a haver resposta."""
    if status >= 500:
        return "http_server"
    if status >= 400:
        return "http_client"
    return "unreachable"


def _request(
    service: str,
    url: str,
    *,
    method: str = "GET",
    payload: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: float = 30.0,
) -> addinfourl:
    body = None
    all_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        all_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=body, headers=all_headers, method=method)
    try:
        return urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as e:
        detail = _mensagem_de(e.read().decode("utf-8", "replace")[:MAX_ERROR_BODY])
        raise UpstreamError(service, detail or e.reason, e.code) from e
    except urllib.error.URLError as e:
        raise UpstreamError(service, f"inalcançável ({e.reason})", reason="unreachable") from e
    except TimeoutError as e:
        # O único motivo que o status não distingue: sem resposta, mas o serviço EXISTE. Confundir
        # com "inalcançável" apaga a diferença entre serviço lento e serviço fora.
        raise UpstreamError(service, f"timeout em {timeout:.0f}s", reason="timeout") from e


def get_json(service: str, url: str, *, headers: Optional[dict] = None, timeout: float = 30.0) -> Any:
    with _request(service, url, headers=headers, timeout=timeout) as response:
        return json.load(response)


def post_json(
    service: str, url: str, payload: dict, *, headers: Optional[dict] = None, timeout: float = 60.0
) -> Any:
    with _request(service, url, method="POST", payload=payload, headers=headers, timeout=timeout) as r:
        return json.load(r)


def request_json(
    service: str,
    method: str,
    url: str,
    payload: Optional[dict] = None,
    *,
    timeout: float = 120.0,
) -> Any:
    """Qualquer verbo, para quem CRIA e APAGA recurso — o indexador precisa de PUT e DELETE.

    ⚠️ O timeout é folgado de propósito: `PUT /points?wait=true` só volta quando o Qdrant terminou
    de gravar o lote, e o default de 30 s cortaria um lote grande no meio, deixando a coleção
    física a meio caminho com o cliente achando que falhou.
    """
    with _request(service, url, method=method, payload=payload, timeout=timeout) as response:
        corpo = response.read()
        return json.loads(corpo) if corpo else {}


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
