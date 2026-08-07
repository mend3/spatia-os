"""Unidades de serviço: o DESEJADO, ao lado do real.

`/api/health` responde o real. Sem o desejado declarado em algum lugar, TTS fora do ar é
indistinguível de TTS que nunca foi para ser usado nesta instalação — e a tela pinta de vermelho
uma ausência que é escolha, ensinando o operador a ignorar vermelho.

O arquivo responde uma pergunta que ninguém respondia: **o que eu perco se o Ollama cair?**
`degrades` é a resposta, escrita por quem instalou, não inferida da ausência.

⚠️ **A unidade tem `start_hint` de TEXTO, nunca `start()`.** O SpatIA não é o init desta máquina:
ele não sobe Qdrant nem Ollama. Um botão que finge poder é a mesma classe de erro do interruptor
que não controla — e este projeto já decidiu, no `#/system`, que o que cabe é o comando copiável.

O arquivo é OPCIONAL. Sem ele todo serviço é `optional` e a tela some com a coluna do desejado, em
vez de inventar uma intenção que ninguém declarou.
"""
import json
import logging
from typing import Optional

from . import config

logger = logging.getLogger("espatial.units")

PATH = config.ROOT / "config" / "units.json"

# `required` derruba a instalação; `optional` degrada; `disabled` não é falha nem aparece como
# tal. O default é `optional`: assumir `required` por omissão transformaria toda instalação
# enxuta num painel vermelho.
STATES = ("required", "optional", "disabled")
DEFAULT = {"state": "optional", "degrades": "", "start_hint": ""}

_cache: Optional[dict] = None


def load() -> dict:
    """Lê e valida. Nunca levanta: um arquivo de unidades quebrado não pode impedir o servidor de
    dizer como está — seria a informação de diagnóstico sumindo justamente quando algo está
    errado. O problema entra no payload, em `error`, e a tela mostra."""
    global _cache
    if _cache is not None:
        return _cache

    _cache = {"units": {}, "error": None}
    if not PATH.is_file():
        return _cache

    try:
        raw = json.loads(PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        logger.warning(f"units.json ilegível: {error}")
        _cache["error"] = f"{PATH.name}: {error}"
        return _cache

    for name, spec in (raw or {}).items():
        if not isinstance(spec, dict):
            _cache["error"] = f"{name}: esperava objeto, veio {type(spec).__name__}"
            continue
        state = spec.get("state", "optional")
        if state not in STATES:
            # Estado desconhecido vira `optional` E é reportado. Silenciar faria um erro de
            # digitação em `requiredd` degradar a garantia sem ninguém notar.
            _cache["error"] = f"{name}: estado inválido '{state}' — tratado como optional"
            state = "optional"
        _cache["units"][name] = {**DEFAULT, **spec, "state": state}
    return _cache


def describe(health: dict) -> dict:
    """Casa o desejado com o real e diz o que está em falta.

    O `real` sai do MESMO payload que a HUD acende, não de uma segunda sondagem: duas leituras do
    mesmo serviço em instantes diferentes acabam discordando na tela.
    """
    data = load()
    units = data["units"]
    real = {
        "qdrant": bool(health.get("qdrant", {}).get("online")),
        "ollama": bool(health.get("ollama", {}).get("online")),
        "tts": bool(health.get("tts", {}).get("online")),
        "claude": bool(health.get("claude_cli")),
        "embed": bool(health.get("embed_ready")),
        **{provider["id"]: bool(provider.get("online")) for provider in health.get("providers", [])},
    }

    linhas = []
    for name, up in sorted(real.items()):
        spec = units.get(name, DEFAULT)
        linhas.append(
            {
                "id": name,
                "wanted": spec["state"],
                "up": up,
                "degrades": spec["degrades"],
                "start_hint": spec["start_hint"],
                # Só é FALTA o que foi declarado necessário e não está lá. Um `optional` fora do ar
                # é degradação anunciada, e um `disabled` fora do ar é o esperado.
                "missing": spec["state"] == "required" and not up,
            }
        )

    return {
        "declared": bool(units),
        "path": str(PATH),
        "error": data["error"],
        "units": linhas,
        "missing": [line["id"] for line in linhas if line["missing"]],
    }
