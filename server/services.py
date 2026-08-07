"""Os SERVIÇOS declarados num arquivo compose — as partes nomeadas que ele contém.

## Por que este módulo existe

A nebulosa (a pele de `compose`) estava escondendo os próprios corpos. Medido em 2026-08-07
sobre o corpus indexado: **44 arquivos compose declaram 164 serviços**, e nenhum deles existia
na cena. Um `docker-compose.yml` de 14 serviços e outro de 1 desenhavam a mesma nuvem.

É o mesmo buraco que `sections` já tinha preenchido para o documento, e a pergunta é a mesma —
*que partes nomeadas este arquivo tem?* — então a resposta viaja pelo mesmo caminho: o cliente
sintetiza luas a partir dela (`orbital-zones.js`), dentro da janela Roche→Hill. Nuvem molecular
que condensa em corpos é, por acaso, a leitura fisicamente correta da metáfora.

## O parser é MÍNIMO, e isso é declarado

Não há PyYAML neste ambiente (conferido), e adicionar dependência para ler uma lista de chaves
não se paga. O reconhecimento é textual e cobre a forma canônica do compose:

    services:
      nome:            <- dois espaços, uma chave, fim de linha

Ele NÃO resolve `extends`, anchors YAML (`<<: *base`), `include:`, nem indentação de 4 espaços.
Medido no corpus: 40 dos 44 arquivos respondem; os 4 restantes não têm bloco `services` (são
fragmentos de override e um `networks:` solto). Um arquivo que o parser não entende sai com
lista vazia e a nebulosa fica como está hoje — a falha é DEGRADAÇÃO, nunca serviço inventado.

⚠️ A ordem é a de declaração, e ela importa: `orbital-zones.js` mapeia a ordem em DISTÂNCIA
orbital, então a estrutura do arquivo continua legível como raio. Reordenar aqui embaralharia o
sistema sem que nada no arquivo tivesse mudado.
"""
import logging
import re
from pathlib import Path
from typing import Optional

from . import config

logger = logging.getLogger("espatial.services")

# O mesmo teto que `graph.py` aplica a `sections`. Não é performance: é o payload não carregar
# uma lista que a geometria da cena nunca vai desenhar — `moonsOf` já corta por Roche→Hill bem
# antes disso.
MAX_SERVICES = 12

_BLOCO = re.compile(r"^services:\s*(#.*)?$")
# Chave de serviço: exatamente dois espaços, um nome, dois-pontos, e nada de valor na linha.
# `image: x` é filho e tem quatro espaços; `x: {}` inline é raro e fica de fora de propósito.
_SERVICO = re.compile(r"^ {2}([A-Za-z0-9][A-Za-z0-9._-]*):\s*(#.*)?$")
_RAIZ = re.compile(r"^[A-Za-z0-9]")


def _workspace_root() -> Optional[Path]:
    root = config.get("AGENT_CWD")
    return Path(root).resolve() if root else None


def _absolute(source: str) -> Optional[Path]:
    """O caminho em disco de um `source` do índice.

    Mesma regra de `recency.changed_at`: relativo é ancorado no PAI da raiz do workspace, porque
    o primeiro segmento do source já é o nome da raiz.
    """
    if source.startswith("/"):
        return Path(source)
    root = _workspace_root()
    return (root.parent / source) if root else None


def parse(text: str) -> list[str]:
    """Nomes de serviço declarados no texto de um compose, na ordem de declaração."""
    names: list[str] = []
    dentro = False
    for line in text.splitlines():
        if _BLOCO.match(line):
            dentro = True
            continue
        if not dentro:
            continue
        # Qualquer chave na coluna 0 encerra o bloco (`volumes:`, `networks:`, ...).
        if _RAIZ.match(line):
            break
        found = _SERVICO.match(line)
        if found and found.group(1) not in names:
            names.append(found.group(1))
    return names


def annotate(nodes: list[dict]) -> None:
    """Escreve `services` em cada nó de compose. Nó que não é compose não ganha o campo.

    Só o `kind` decide, e não a extensão: quem classifica compose é `graph.classify`, e ter duas
    definições do que é um compose é exatamente o tipo de divergência que este projeto paga caro.
    """
    lidos = 0
    total = 0
    for node in nodes:
        if node.get("kind") != "compose" or node.get("type") != "file":
            continue
        path = _absolute(node.get("source", ""))
        if not path:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            # Arquivo indexado que sumiu do disco. Acontece entre reindexações e não é erro:
            # a nebulosa fica sem serviço, como era antes deste módulo.
            continue
        names = parse(text)
        lidos += 1
        if not names:
            continue
        node["services"] = names[:MAX_SERVICES]
        total += len(node["services"])
    if lidos:
        logger.info(f"serviços: {total} em {lidos} arquivos compose")
