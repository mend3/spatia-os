"""Descobre as skills e os agentes que existem no repo onde o assistente opera.

Lê o frontmatter dos arquivos, não uma lista mantida à mão: agente novo no repo aparece no
painel sozinho, e agente removido desaparece. Uma lista duplicada aqui envelheceria em
silêncio, e um toggle apontando para algo que não existe mais é pior que a ausência dele.

O parser de frontmatter é deliberadamente burro — só `chave: valor` de primeiro nível até o
`---` de fechamento. Não é YAML e não tenta ser: os únicos campos que o painel usa são
`name` e `description`.
"""
import logging
from pathlib import Path

from . import config

logger = logging.getLogger("espatial.catalog")

DESCRIPTION_CHARS = 260


def _frontmatter(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    if not text.startswith("---"):
        return {}

    fields: dict[str, str] = {}
    for raw in text.split("\n")[1:]:
        line = raw.rstrip()
        if line.strip() == "---":
            break
        # Continuação indentada e item de lista pertencem ao campo anterior; ignorar é
        # suficiente porque nenhum campo de interesse é multilinha.
        if not line or line.startswith((" ", "\t", "-")) or ":" not in line:
            continue
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip().strip("'\"")
    return fields


def _root() -> Path:
    return Path(config.get("AGENT_CWD") or config.ROOT)


def agents() -> list[dict]:
    """`.claude/agents/*.md` — um arquivo por agente."""
    directory = _root() / ".claude" / "agents"
    if not directory.is_dir():
        return []
    found = []
    for path in sorted(directory.glob("*.md")):
        meta = _frontmatter(path)
        found.append({
            "id": meta.get("name") or path.stem,
            "label": meta.get("name") or path.stem,
            "description": (meta.get("description") or "")[:DESCRIPTION_CHARS],
            "tools": meta.get("tools", ""),
        })
    return found


def skills() -> list[dict]:
    """`.claude/skills/<nome>/SKILL.md` — um diretório por skill."""
    directory = _root() / ".claude" / "skills"
    if not directory.is_dir():
        return []
    found = []
    for path in sorted(directory.glob("*/SKILL.md")):
        meta = _frontmatter(path)
        found.append({
            "id": meta.get("name") or path.parent.name,
            "label": meta.get("name") or path.parent.name,
            "description": (meta.get("description") or "")[:DESCRIPTION_CHARS],
        })
    return found


def snapshot() -> dict:
    catalog = {"root": str(_root()), "agents": agents(), "skills": skills()}
    logger.info(f"catálogo: {len(catalog['agents'])} agentes, {len(catalog['skills'])} skills")
    return catalog
