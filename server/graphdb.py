"""Sonda do Neo4j — a camada de RELAÇÃO, e a única que pode faltar.

Ver `docs/integracao-neo4j.md`. As duas leis que este módulo existe para respeitar:

1. **Neo4j muda o BRILHO, nunca a CLASSE.** Nenhum fato daqui pode decidir o que um corpo É. Se
   `centrality` decidisse classe, um container caindo faria corpos trocarem de identidade.
2. **Ele nunca está no caminho do quadro.** Esta sonda é chamada pelo `/api/health`, que a UI já
   consulta periodicamente; nada aqui roda por corpo nem por quadro.

⚠️ **`0` e `None` não são a mesma coisa, e o módulo inteiro depende disso.** `0` afirma "medi e é
zero"; `None` afirma "não medi". Colapsar os dois faria o céu declarar periferia sobre 1 636 corpos
por causa de um container fora do ar.

## O isolamento, decidido pela auditoria de 2026-08-08

O Neo4j do workspace **já tem outro grafo dentro**: o graphiti, com os rótulos `Entity`,
`Episodic`, `Community` e `Saga`, o tipo `MENTIONS`, e 33 índices. E a edição é **Community**, que
não tem multi-database livre — só existem `neo4j` e `system`.

Ou seja: **`Entity` e `MENTIONS`, que o plano original propunha para o SpatIA, estão tomados.** O
isolamento possível é por RÓTULO, e é o que `ROTULOS` declara. `GRUPO` é a segunda camada, pela
mesma convenção que o graphiti já usa (`group_id`), e serve para limpeza: apagar o que é nosso é
uma consulta só.
"""
from __future__ import annotations

import base64
import json
from typing import Optional

from . import config, net

#: Rótulos e tipos do SpatIA. Nenhum colide com o graphiti — conferido na auditoria.
ROTULOS = {"corpo": "Astro", "estrutura": "Sistema"}
RELACOES = ("CO_EDITED", "SIMILAR_TO", "TOUCHED", "REFERENCES", "IMPORTS", "ABOUT")

#: Segunda camada de isolamento, na convenção do próprio graphiti.
GRUPO = "spatia"

#: Rótulos que NÃO são nossos. Escrever em qualquer um deles é misturar dois grafos.
ALHEIOS = ("Entity", "Episodic", "Community", "Saga")

TIMEOUT = 4


def _auth() -> Optional[str]:
    user = config.get("NEO4J_USER")
    senha = config.get("NEO4J_PASSWORD")
    if not user or not senha:
        return None
    return base64.b64encode(f"{user}:{senha}".encode()).decode()


def consultar(cypher: str) -> Optional[dict]:
    """Executa um Cypher e devolve o payload, ou `None` se o banco não respondeu.

    `None` é resposta legítima aqui — o chamador tem de distinguir "não medi" de "medi e deu zero",
    e uma exceção obrigaria todo chamador a um `try` que acabaria virando `except: pass`.
    """
    base = config.get("NEO4J_HTTP")
    auth = _auth()
    if not base or not auth:
        return None
    try:
        return net.post_json(
            "neo4j",
            f"{base}/db/neo4j/query/v2",
            {"statement": cypher},
            headers={"Authorization": f"Basic {auth}"},
            timeout=TIMEOUT,
        )
    except Exception:
        # Qualquer falha é "não medi". O céu não pode parar porque o grafo caiu — é a lei nº 1.
        return None


def describe() -> dict:
    """Estado do Neo4j para o `/api/health`, nos quatro estados do plano.

    - `configured` falso → nunca configurado; a dimensão nem aparece na tela;
    - `online` falso → fora, e quem decide se isso é grave é o `units.json` (desejado vs real);
    - `online` verdadeiro → traz a contagem do que é NOSSO, e só dela.

    ⚠️ `vinculos` conta apenas as relações do SpatIA. Contar as do graphiti seria publicar o
    trabalho de outro sistema como se fosse deste, e a primeira vez que os dois divergissem
    ninguém saberia de quem era o número.
    """
    base = config.get("NEO4J_HTTP")
    if not base or not _auth():
        return {
            "configured": False,
            "online": False,
            "motivo": "NEO4J_HTTP, NEO4J_USER ou NEO4J_PASSWORD não declarados",
            "corpos": None,
            "vinculos": None,
        }

    tipos = "|".join(RELACOES)
    payload = consultar(
        f"MATCH (n:{ROTULOS['corpo']}) WITH count(n) AS corpos "
        f"OPTIONAL MATCH ()-[r:{tipos}]->() RETURN corpos, count(r) AS vinculos"
    )
    if payload is None:
        return {
            "configured": True,
            "online": False,
            "motivo": "sem resposta",
            "corpos": None,
            "vinculos": None,
        }

    valores = (payload.get("data") or {}).get("values") or [[0, 0]]
    corpos, vinculos = (valores[0] + [0, 0])[:2]
    return {
        "configured": True,
        "online": True,
        "corpos": corpos,
        "vinculos": vinculos,
        # A tela precisa saber que este banco é compartilhado, senão "9 nós" parece nosso.
        "compartilhado": {"grupo": GRUPO, "rotulos": list(ROTULOS.values()), "alheios": list(ALHEIOS)},
    }


#: Onde `scripts/centralidade.mjs` deixa o snapshot. Ler arquivo, e não o banco, é a lei nº 2.
SNAPSHOT = config.ROOT / ".cache" / "influencia.json"


def annotate_influence(nodes: list[dict]) -> Optional[dict]:
    """Anexa `centrality` (0…1) a cada nó, do snapshot materializado.

    Devolve os metadados do snapshot, ou `None` se ele não existe — e nesse caso **nenhum nó ganha
    o campo**. Ausência do campo é "não medi"; `0` seria "medi e é periférico", e escrever zero em
    1 636 corpos porque um arquivo não existe é exatamente a mentira que a lei nº 1 proíbe.

    ⚠️ O snapshot é fotografia: ele envelhece com a reindexação e com o corpus. `as_of` viaja junto
    para quem lê poder decidir se ainda vale — sem a data, um número velho é indistinguível de um
    número novo.
    """
    try:
        dados = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None

    tabela = dados.get("influencia") or {}
    for node in nodes:
        valor = tabela.get(node.get("source"))
        if isinstance(valor, (int, float)):
            node["centrality"] = valor
    return {k: v for k, v in dados.items() if k != "influencia"}


#: Onde `scripts/uso.mjs` (P5) deixa o snapshot de uso. Mesma lei nº 2: arquivo, nunca o banco.
SNAPSHOT_USO = config.ROOT / ".cache" / "uso.json"


def annotate_usage(nodes: list[dict]) -> Optional[dict]:
    """Anexa `usage` (0…1) a cada nó, do snapshot do P5 — influência por USO, não por semelhança.

    Devolve os metadados **com o veredito de evidência junto**, ou `None` se não há snapshot.

    ⚠️ Aqui há três estados, não dois, e confundi-los foi o que esta integração existe para evitar:

    - **sem snapshot** → nenhum nó ganha o campo. "Não materializei."
    - **snapshot com evidência RALA** → os nós ganham o número, e `evidencia.suficiente` é falso.
      A dimensão EXISTE e é publicada; ela só não tem poder para influenciar nada ainda.
    - **snapshot com evidência suficiente** → idem, com o veredito verdadeiro.

    O que nunca acontece é o campo valer `0` por ausência: um corpus que ninguém leu e um corpo que
    ninguém abriu são fatos diferentes, e só o segundo é um zero.

    ⚠️ `origem` distingue diário real de semeadura de bancada. Um snapshot semeado descreve
    CAPACIDADE, não comportamento — publicá-lo sem o carimbo faria a bancada contaminar a leitura
    do céu, que é exatamente a confusão que o `cobertura.md` separa.
    """
    try:
        dados = json.loads(SNAPSHOT_USO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None

    tabela = dados.get("uso") or {}
    for node in nodes:
        valor = tabela.get(node.get("source"))
        if isinstance(valor, (int, float)):
            node["usage"] = valor
    return {k: v for k, v in dados.items() if k != "uso"}
