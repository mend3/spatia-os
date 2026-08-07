"""Síntese de voz — tudo o que o motor aceita, configurável pela UI.

O browser fala com este servidor, não com o TTS. Três razões: mesma origem (sem CORS), o
cliente não conhece a infra, e voz/parâmetros são estado do sistema — não escolha de quem
abre a página.

**O que este módulo suporta foi medido contra o container que roda aqui**, não deduzido:

| Parâmetro | Faixa/valores | medido |
|---|---|---|
| `speed` | 0.25 – 4.0 | 2.0 → 200 |
| `response_format` | mp3, opus, aac, flac, wav, pcm | wav → 200 |
| `lang_code` | a b e f h i j p z | `p` → 200 |
| `volume_multiplier` | > 0 | 1.6 → 200 |
| mistura de vozes | `voz(peso)+voz(peso)` | 200 |

⚠️ **Mistura: o conceito vem do `kokoro-tts-container`, a sintaxe não.** Aquele projeto é CLI
sobre `kokoro-onnx` e usa `af_sarah:60,am_adam:40`; enviar isso para este fastapi devolve
**400** (medido). A UI oferece a ideia dele — duas vozes e um peso — e este módulo traduz para
`af_sarah(60)+am_adam(40)`, que é o que o fio aceita. Copiar a sintaxe junto teria produzido um
controle que falha em toda síntese.
"""
import json
import logging
import os
import threading
import urllib.error
import urllib.request
from typing import Optional

from . import config, net

logger = logging.getLogger("espatial.speech")

STORE = config.ROOT / ".cache" / "speech.json"
MAX_CHARS = 1200
TIMEOUT_SECONDS = 120

FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"]
SPEED_RANGE = (0.25, 4.0)
VOLUME_RANGE = (0.1, 4.0)

# Código de idioma do Kokoro (uma letra) → rótulo. A ordem é a da UI.
LANGUAGES = {
    "": "AUTO (PELO PREFIXO DA VOZ)",
    "p": "PORTUGUÊS (BR)",
    "a": "INGLÊS (EUA)",
    "b": "INGLÊS (GB)",
    "e": "ESPANHOL",
    "f": "FRANCÊS",
    "i": "ITALIANO",
    "h": "HINDI",
    "j": "JAPONÊS",
    "z": "MANDARIM",
}

# Prefixo da voz → idioma. É a convenção do próprio Kokoro (`pf_dora` = portuguese female),
# e é o que permite o modo AUTO não exigir que o operador saiba o mapa de cor.
VOICE_LANGS = {
    "a": "a", "b": "b", "e": "e", "f": "f", "h": "h", "i": "i", "j": "j", "p": "p", "z": "z",
}


def _defaults() -> dict:
    return {
        "voice": config.get("TTS_VOICE"),
        "speed": 1.0,
        "lang_code": "",
        "response_format": "mp3",
        "volume_multiplier": 1.0,
        "normalize": True,
        # Mistura: desligada por default. `blend_voice`/`blend_weight` só valem com `blend`.
        "blend": False,
        "blend_voice": "",
        "blend_weight": 50,
    }


_lock = threading.Lock()
_state: Optional[dict] = None


def load() -> dict:
    global _state
    with _lock:
        if _state is not None:
            return _state
        state = _defaults()
        if STORE.is_file():
            try:
                stored = json.loads(STORE.read_text(encoding="utf-8"))
                state.update({k: v for k, v in stored.items() if k in state})
            except (OSError, json.JSONDecodeError) as e:
                # Config de voz corrompida degrada para o default e nada mais: ao contrário das
                # permissões, aqui o pior caso é a voz errada — não autoridade a mais.
                logger.warning(f"config de voz ilegível, usando defaults: {e}")
        _state = state
        return state


def update(patch: dict) -> dict:
    global _state
    merged = {**load(), **{k: v for k, v in patch.items() if k in _defaults()}}

    merged["speed"] = _clamp(merged["speed"], *SPEED_RANGE, 1.0)
    merged["volume_multiplier"] = _clamp(merged["volume_multiplier"], *VOLUME_RANGE, 1.0)
    merged["blend_weight"] = int(_clamp(merged["blend_weight"], 1, 99, 50))
    if merged["response_format"] not in FORMATS:
        merged["response_format"] = "mp3"
    if merged["lang_code"] not in LANGUAGES:
        merged["lang_code"] = ""
    merged["blend"] = bool(merged["blend"]) and bool(merged["blend_voice"])
    merged["normalize"] = bool(merged["normalize"])

    with _lock:
        _state = merged
        try:
            STORE.parent.mkdir(parents=True, exist_ok=True)
            STORE.write_text(json.dumps(merged, indent=1), encoding="utf-8")
        except OSError as e:
            logger.warning(f"não gravei a config de voz: {e}")
    logger.info(
        f"voz: {wire_voice(merged)} · {merged['speed']}x · {merged['response_format']} · "
        f"idioma={merged['lang_code'] or 'auto'}"
    )
    return merged


def _clamp(value, low, high, fallback):
    try:
        return max(low, min(high, float(value)))
    except (TypeError, ValueError):
        return fallback


def wire_voice(state: dict) -> str:
    """A string de voz que vai no fio, já com a mistura traduzida."""
    if not state.get("blend") or not state.get("blend_voice"):
        return state["voice"]
    weight = int(state.get("blend_weight") or 50)
    return f"{state['voice']}({weight})+{state['blend_voice']}({100 - weight})"


def lang_of(voice: str) -> str:
    """Idioma inferido do prefixo da voz — o que o modo AUTO usa."""
    return VOICE_LANGS.get((voice or "")[:1], "")


def _base() -> str:
    return config.get("TTS_URL").rstrip("/")


def available() -> Optional[list[str]]:
    """Vozes do motor, ou None se não responder."""
    try:
        data = net.get_json("tts", f"{_base()}/v1/audio/voices", timeout=5)
    except net.UpstreamError:
        return None
    voices = data.get("voices") if isinstance(data, dict) else data
    return voices if isinstance(voices, list) else []


def describe() -> dict:
    """O que a UI desenha: estado, domínios válidos, catálogo e a string efetiva."""
    state = load()
    voices = available()
    catalog: dict[str, list[str]] = {}
    for voice in voices or []:
        catalog.setdefault(lang_of(voice) or "?", []).append(voice)
    return {
        "state": state,
        "wire_voice": wire_voice(state),
        "effective_lang": state["lang_code"] or lang_of(state["voice"]),
        "online": voices is not None,
        "voices": voices or [],
        "catalog": catalog,
        "languages": LANGUAGES,
        "formats": FORMATS,
        "speed_range": SPEED_RANGE,
        "volume_range": VOLUME_RANGE,
        # A voz configurada existir no motor é diferente do motor estar no ar: voz inexistente
        # falha em TODA síntese e devolveria 200 no health.
        "voice_ok": bool(voices) and state["voice"] in voices,
        "blend_ok": (not state["blend"]) or (bool(voices) and state["blend_voice"] in voices),
    }


def synthesize(text: str, overrides: Optional[dict] = None) -> tuple[bytes, str]:
    """Devolve (áudio, mime). Overrides valem só para esta chamada — não persistem.

    `urlopen` cru em vez de `net.post_json`: a resposta é binária, e o helper decodifica JSON.
    """
    state = {**load(), **(overrides or {})}
    fmt = state["response_format"] if state["response_format"] in FORMATS else "mp3"

    payload = {
        "model": config.get("TTS_MODEL"),
        "input": text[:MAX_CHARS],
        "voice": wire_voice(state),
        "response_format": fmt,
        "speed": _clamp(state["speed"], *SPEED_RANGE, 1.0),
        "volume_multiplier": _clamp(state["volume_multiplier"], *VOLUME_RANGE, 1.0),
        "normalization_options": {"normalize": bool(state.get("normalize", True))},
    }
    # `lang_code` ausente deixa o motor inferir do prefixo. Mandar string vazia é diferente de
    # não mandar: a vazia sobrescreve a inferência com nada.
    lang = state.get("lang_code") or ""
    if lang:
        payload["lang_code"] = lang

    request = urllib.request.Request(
        f"{_base()}/v1/audio/speech",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read(), _mime(fmt)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise net.UpstreamError("tts", detail or e.reason, e.code) from e
    except TimeoutError as e:
        raise net.UpstreamError("tts", f"timeout em {TIMEOUT_SECONDS:.0f}s", reason="timeout") from e
    except urllib.error.URLError as e:
        raise net.UpstreamError("tts", f"inalcançável ({e})", reason="unreachable") from e


def _mime(fmt: str) -> str:
    return {
        "mp3": "audio/mpeg",
        "opus": "audio/opus",
        "aac": "audio/aac",
        "flac": "audio/flac",
        "wav": "audio/wav",
        "pcm": "audio/pcm",
    }.get(fmt, "application/octet-stream")
