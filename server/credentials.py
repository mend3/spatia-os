"""Onde o segredo mora — e o único lugar do sistema que o lê.

Não no `.env`, que é o arquivo que se copia e se cola em chat. Não no `localStorage`, que é o
arquivo que qualquer XSS lê. Um `.cache/credentials.json` com modo `0600`, e o modo importa tanto
quanto o caminho: `Path.write_text` cria `0644`, e aqui isso é a diferença entre segredo e
arquivo.

⚠️ **Nenhuma rota devolve segredo, em nenhum estado da UI, nem mascarado.** `describe()` é a
única saída pública, e ela não tem como vazar o valor porque nunca o carrega. A IMPRESSÃO existe
para o operador dizer "é a mesma credencial de ontem" sem que exista um caminho de código capaz
de devolver o valor — mascarar seria manter o caminho e confiar na formatação.

O keychain do sistema seria melhor. Enquanto ele não existe, o arquivo `0600` é o fallback
**declarado**: "onde está minha credencial" é pergunta de tela, e a resposta não pode ser
"depende" — por isso `describe()` publica `storage`.
"""
import hashlib
import json
import logging
import os
import threading
import time
from typing import Optional

from . import config

logger = logging.getLogger("espatial.credentials")

PATH = config.ROOT / ".cache" / "credentials.json"
MODE = 0o600
STORAGE = "arquivo 0600"

_lock = threading.Lock()


def _read() -> dict:
    if not PATH.is_file():
        return {}
    try:
        return json.loads(PATH.read_text(encoding="utf-8")) or {}
    except (OSError, json.JSONDecodeError) as error:
        # Não apaga e não recria: um arquivo de credenciais ilegível pode ser o único lugar onde
        # um refresh token existe, e sobrescrevê-lo por conveniência custaria uma reautorização.
        logger.error(f"credentials.json ilegível ({error}) — nenhuma credencial disponível")
        return {}


def _write(data: dict) -> None:
    PATH.parent.mkdir(parents=True, exist_ok=True)
    # `os.open` com o modo no ato da criação. Criar 0644 e depois `chmod` deixa uma janela em que
    # o segredo esteve legível para todo mundo — curta, e suficiente.
    descriptor = os.open(PATH, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, MODE)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    # O arquivo pode preexistir com outro modo; o `O_CREAT` não o corrige.
    os.chmod(PATH, MODE)


def fingerprint(token: str) -> str:
    """Impressão do segredo, nunca o segredo. Prefixo curto: o suficiente para comparar duas
    credenciais e insuficiente para qualquer outra coisa."""
    return f"sha256:{hashlib.sha256(token.encode()).hexdigest()[:12]}"


def save(provider: str, token: str, *, refresh: str = "", scopes: Optional[list] = None,
         expires_at: Optional[float] = None) -> None:
    with _lock:
        data = _read()
        data[provider] = {
            "token": token,
            "refresh": refresh,
            "scopes": scopes or [],
            "expires_at": expires_at,
            "saved_at": time.time(),
        }
        _write(data)
    logger.info(f"credencial de {provider} gravada ({fingerprint(token)})")


def token_for(provider: str) -> Optional[str]:
    """SÓ a ponte chama isto. É o único caminho de leitura do valor em todo o sistema."""
    with _lock:
        entry = _read().get(provider)
    return entry.get("token") if entry else None


def forget(provider: str) -> bool:
    with _lock:
        data = _read()
        existia = provider in data
        data.pop(provider, None)
        if existia:
            _write(data)
    return existia


def state_of(entry: dict) -> str:
    if not entry.get("token"):
        return "ausente"
    expires = entry.get("expires_at")
    if expires and expires <= time.time():
        return "expirada"
    return "válida"


def describe() -> dict:
    """O que a tela vê. Nunca carrega `token` nem `refresh`."""
    with _lock:
        data = _read()
    modo = None
    if PATH.exists():
        modo = oct(PATH.stat().st_mode & 0o777)
    return {
        "storage": STORAGE,
        "path": str(PATH),
        "mode": modo,
        # Um arquivo de segredo legível por outros é um achado, não um detalhe: a tela precisa
        # poder gritar em vez de exibir `0644` como se fosse informação neutra.
        # `None` = ainda não há arquivo. Reportar `false` aqui faria a tela acusar permissão
        # errada num segredo que não existe, e o operador procuraria um problema inexistente.
        "mode_ok": None if modo is None else modo == oct(MODE),
        "providers": [
            {
                "provider": name,
                "scopes": entry.get("scopes") or [],
                "expires_at": entry.get("expires_at"),
                "fingerprint": fingerprint(entry.get("token", "")),
                "state": state_of(entry),
            }
            for name, entry in sorted(data.items())
        ],
    }
