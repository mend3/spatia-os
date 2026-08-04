"""Anexos: arquivo que o operador manda pela UI e o agente lê do disco.

O caminho é indireto de propósito. O agente NÃO recebe bytes — ele recebe um caminho e usa a
ferramenta `Read` dele, que já sabe lidar com imagem, PDF e texto. Enfiar conteúdo no prompt
duplicaria o que o agente faz melhor, e estouraria o contexto num anexo grande.

Corpo cru, não multipart: o nome vem no cabeçalho `X-Filename`. Parsear multipart na stdlib
significa `cgi` (removido no 3.13) ou escrever um parser — e não há razão, porque o `fetch` do
browser envia um `File` como corpo direto.
"""
import logging
import re
import time
from pathlib import Path

from . import config

logger = logging.getLogger("espatial.attach")

DIR = config.ROOT / ".cache" / "attachments"
MAX_BYTES = 24 * 1024 * 1024
KEEP = 40


def _safe_name(raw: str) -> str:
    """Nome de arquivo sem travessia nem surpresa.

    Só a base do caminho, e só caracteres previsíveis: um `X-Filename` é entrada do cliente, e
    `../../.ssh/authorized_keys` chegaria por ali se ninguém olhasse.
    """
    base = (raw or "anexo").replace("\\", "/").rsplit("/", 1)[-1]
    clean = re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._") or "anexo"
    return clean[:96]


def save(data: bytes, filename: str) -> dict:
    DIR.mkdir(parents=True, exist_ok=True)
    _prune()
    name = _safe_name(filename)
    target = DIR / f"{int(time.time() * 1000)}-{name}"
    target.write_bytes(data)
    logger.info(f"anexo: {target.name} ({len(data)} bytes)")
    return {
        "name": name,
        # Caminho ABSOLUTO: é o que vai no prompt, e o agente roda com outro cwd.
        "path": str(target.resolve()),
        "bytes": len(data),
    }


def _prune() -> None:
    """Mantém os últimos anexos e descarta o resto.

    Sem isto o diretório cresce para sempre — e são arquivos que o operador mandou uma vez para
    uma pergunta. Guardar tudo seria acumular dado sensível sem ninguém decidir por isso.
    """
    try:
        files = sorted(DIR.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
        for stale in files[KEEP:]:
            stale.unlink(missing_ok=True)
    except OSError as e:
        logger.warning(f"não consegui podar anexos: {e}")
