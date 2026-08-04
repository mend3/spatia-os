"""Síntese de voz pelo TTS global do oracle (Kokoro, API compatível com OpenAI).

O browser fala com este servidor, não com o TTS direto. Três razões:

1. **Mesma origem.** Sem CORS, sem preflight, sem configurar o TTS para aceitar a página.
2. **O cliente não conhece a infra.** Trocar Kokoro por outro motor não muda uma linha de JS
   — a UI conhece `/api/tts`, e é o mesmo princípio do resto da arquitetura.
3. **Voz e modelo são config de servidor.** O browser manda texto; que voz sai disso é
   decisão de quem opera, não de quem abre a página.
"""
import logging
import urllib.error
import urllib.request
from typing import Optional

from . import config, net

logger = logging.getLogger("espatial.speech")

# O texto de uma resposta inteira estoura o limite prático do motor e a paciência de quem
# ouve. O cliente já quebra por frase; este teto é a rede de segurança.
MAX_CHARS = 1200
TIMEOUT_SECONDS = 90


def _base() -> str:
    return config.get("TTS_URL").rstrip("/")


def available() -> Optional[list[str]]:
    """Vozes disponíveis, ou None se o TTS não responder.

    Devolver a lista (e não um booleano) faz o health responder duas perguntas de uma vez:
    o serviço está no ar, e a voz configurada existe nele.
    """
    try:
        data = net.get_json("tts", f"{_base()}/v1/audio/voices", timeout=5)
    except net.UpstreamError:
        return None
    voices = data.get("voices") if isinstance(data, dict) else data
    return voices if isinstance(voices, list) else []


def synthesize(text: str, voice: str = "") -> bytes:
    """Devolve MP3. Levanta `UpstreamError` se o TTS estiver fora ou recusar.

    `urlopen` direto em vez de `net.post_json`: a resposta é binária, e o helper decodifica
    JSON. É a única rota do sistema que não devolve JSON.
    """
    payload = {
        "model": config.get("TTS_MODEL"),
        "input": text[:MAX_CHARS],
        "voice": voice or config.get("TTS_VOICE"),
        "response_format": "mp3",
    }
    import json

    request = urllib.request.Request(
        f"{_base()}/v1/audio/speech",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise net.UpstreamError("tts", detail or e.reason, e.code) from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise net.UpstreamError("tts", f"inalcançável ({e})") from e
