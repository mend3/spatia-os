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
    # ⚠️ **A contagem é do céu EM VIGOR, não do banco.** O `Astro` é chaveado por `source`, e dois
    # corpora não colidem — eles COEXISTEM. Sem este filtro, apontar o servidor para o fixture faria
    # o health somar os 188 do vivo aos 71 dele e anunciar 259 corpos sobre um céu de 71. É a mesma
    # regra que já vale para o graphiti: publicar o que é do outro como se fosse deste sistema é a
    # mentira que ninguém consegue rastrear depois.
    corpus = config.get("QDRANT_COLLECTION")
    payload = consultar(
        f"MATCH (n:{ROTULOS['corpo']} {{corpus: '{corpus}'}}) WITH count(n) AS corpos "
        f"OPTIONAL MATCH ()-[r:{tipos} {{corpus: '{corpus}'}}]->() "
        f"RETURN corpos, count(r) AS vinculos"
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


def _recusa_de_corpus(dados: dict, script: str) -> Optional[str]:
    """`None` se este snapshot é do céu SERVIDO; o motivo da recusa se não é.

    ## Por que existe

    Todo snapshot deste módulo é uma FOTOGRAFIA, e `as_of` responde só metade da pergunta: ele diz
    QUANDO a foto foi tirada e cala sobre DE QUE CÉU. Uma foto velha do céu certo ainda descreve
    corpos que existem; uma foto nova do céu ERRADO não descreve nenhum — e as duas chegavam aqui
    indistinguíveis, porque o leitor casa por `source` e `source` de outro corpus simplesmente não
    casa com ninguém.

    ⚠️ **O modo de falha não é o campo faltar: é o CABEÇALHO afirmar.** Medido em 2026-08-09, com
    o servidor no fixture (72 corpos) e os snapshots do vivo (188):

        GET /api/vizinhanca?source=<qualquer corpo do fixture>
          → disponivel: true · corpos: 188 · vinculos: 4226     ← cabeçalho de OUTRO céu
          → vizinhanca: null                                    ← 12 de 12 amostrados

    A cena não desenhava **um único arco** e o painel anunciava 4 226 vínculos disponíveis. Junto,
    `connectivity` chegava a **0 de 72 corpos** enquanto `stats.conexao` saía com cabeçalho cheio
    (`as_of`, `metrica`, a definição por extenso, `spearman_centralidade: −0,0706`). Isso é pior do
    que faltar, porque quem lê o cabeçalho **para de procurar**.

    ## Por que a recusa é o desfecho certo, e não um aviso

    É `null` ≠ `0` aplicado ao snapshot INTEIRO em vez de a um valor. Servir carga vazia sob
    cabeçalho cheio afirma "medi e não há"; recusar afirma "não medi ESTE céu", que é o fato. E a
    recusa é barata de desfazer — o motivo já vem com o comando que a resolve.

    ⚠️ **Sem carimbo também é recusa**, e não tolerância. Um snapshot sem `corpus` é exatamente o
    estado que produziu o defeito: o leitor não tem como saber, e "não tenho como saber" não
    autoriza afirmar. Todo script de `scripts/` carimba desde 2026-08-09, e o nome sai do
    `/api/graph` — do servidor, que é quem lê o `.env` — nunca de palpite (ver `graph._corpus`).
    """
    servido = config.get("QDRANT_COLLECTION")
    carimbo = dados.get("corpus")
    if not carimbo:
        return f"snapshot sem carimbo de corpus — rematerialize com `node scripts/{script}`"
    if carimbo != servido:
        return (
            f"snapshot é do corpus `{carimbo}` e o servido é `{servido}` — "
            f"rematerialize com `node scripts/{script}`"
        )
    return None


#: Onde `scripts/centralidade.mjs` deixa o snapshot. Ler arquivo, e não o banco, é a lei nº 2.
SNAPSHOT = config.ROOT / ".cache" / "influencia.json"


def annotate_influence(nodes: list[dict]) -> Optional[dict]:
    """Anexa `centrality` (0…1) a cada nó, do snapshot materializado.

    Devolve os metadados do snapshot, ou `None` se ele não existe — e nesse caso **nenhum nó ganha
    o campo**. Ausência do campo é "não medi"; `0` seria "medi e é periférico", e escrever zero em
    1 636 corpos porque um arquivo não existe é exatamente a mentira que a lei nº 1 proíbe.

    ⚠️ O snapshot é fotografia: ele envelhece com a reindexação e com o corpus. `as_of` viaja junto
    para quem lê poder decidir se ainda vale — sem a data, um número velho é indistinguível de um
    número novo. E `corpus` viaja pela outra metade: foto de OUTRO céu não envelhece, ela nunca foi
    desta — ver `_recusa_de_corpus`, que decide isso antes de qualquer nó ser tocado.
    """
    try:
        dados = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None

    recusa = _recusa_de_corpus(dados, "centralidade.mjs")
    if recusa:
        return {"disponivel": False, "motivo": recusa, "as_of": dados.get("as_of")}

    tabela = dados.get("influencia") or {}
    for node in nodes:
        valor = tabela.get(node.get("source"))
        if isinstance(valor, (int, float)):
            node["centrality"] = valor
    return {"disponivel": True, **{k: v for k, v in dados.items() if k != "influencia"}}


#: Onde `scripts/uso.mjs` (P5) deixa o snapshot de uso. Mesma lei nº 2: arquivo, nunca o banco.
SNAPSHOT_USO = config.ROOT / ".cache" / "uso.json"


def annotate_usage(nodes: list[dict]) -> Optional[dict]:
    """Anexa `usage` (0…1) a cada nó, do snapshot do P5 — influência por USO, não por semelhança.

    Devolve os metadados **com o veredito de evidência junto**, ou `None` se não há snapshot.

    ⚠️ Aqui há QUATRO estados, não dois, e confundi-los foi o que esta integração existe para evitar:

    - **sem snapshot** → nenhum nó ganha o campo. "Não materializei."
    - **snapshot de OUTRO corpus** → nenhum nó ganha o campo, e `disponivel` é falso COM MOTIVO.
      "Materializei, mas não este céu." Ver `_recusa_de_corpus` — este estado existia e era servido
      como se fosse o terceiro, que é a diferença entre ausência e mentira.
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

    recusa = _recusa_de_corpus(dados, "uso.mjs")
    if recusa:
        return {"disponivel": False, "motivo": recusa, "as_of": dados.get("as_of")}

    tabela = dados.get("uso") or {}
    for node in nodes:
        valor = tabela.get(node.get("source"))
        if isinstance(valor, (int, float)):
            node["usage"] = valor
    return {"disponivel": True, **{k: v for k, v in dados.items() if k != "uso"}}


#: Onde `scripts/conectividade.mjs` deixa o alcance por corpo. Mesma lei nº 2: arquivo em disco.
SNAPSHOT_CONEXAO = config.ROOT / ".cache" / "conectividade.json"


def annotate_connectivity(nodes: list[dict]) -> Optional[dict]:
    """Anexa `connectivity` (0…1) a cada nó — a última das quatro dimensões sem fato do §11.

    ⚠️ **E ela não é o que a spec pedia.** O §4 definia `connectivity` como *"grau ponderado das
    laterais"*, e medido isso repete a centralidade: ρ de Spearman **0,821** contra a influência já
    materializada, além de 0,688 com a massa e 0,714 com a atividade. Seria uma quarta dimensão que
    é a soma de três — o score composto que esta base refutou com número.

    O que ficou é o **ALCANCE**: a fração dos vínculos laterais cujo destino está FORA do sistema
    do corpo. Ele mede exatamente a parte da relação que a POSIÇÃO não comunica — a cena já diz por
    contenção quem mora junto, e nada dizia se o vizinho semântico está dentro ou fora da pasta.
    Medido: ρ **−0,083** com a centralidade, **0,040** com a massa, **0,130** com a atividade.

    ⚠️ O confesso: ρ **−0,623** com o TAMANHO do sistema — filho único de pasta tem alcance 1,0 por
    construção (7 corpos, 3,7%). O snapshot publica os três ρ para quem lê o número saber contra o
    que ele foi conferido.
    """
    try:
        dados = json.loads(SNAPSHOT_CONEXAO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None

    # ⚠️ Esta é a dimensão em que o defeito foi mais caro: medido em 09/08, `connectivity` chegava a
    # **0 de 72 corpos** e `stats.conexao` saía com cabeçalho completo. O §3 declarava a dimensão ✅
    # com dono, e neste corpus ela não existia. Recusar é o que separa as duas afirmações.
    recusa = _recusa_de_corpus(dados, "conectividade.mjs")
    if recusa:
        return {"disponivel": False, "motivo": recusa, "as_of": dados.get("as_of")}

    tabela = dados.get("conectividade") or {}
    for node in nodes:
        valor = tabela.get(node.get("source"))
        if isinstance(valor, (int, float)):
            node["connectivity"] = valor
    return {"disponivel": True, **{k: v for k, v in dados.items() if k != "conectividade"}}


#: Onde `scripts/vizinhanca.mjs` deixa os vínculos laterais por corpo. Arquivo, nunca o banco.
SNAPSHOT_REDE = config.ROOT / ".cache" / "vizinhanca.json"

_rede: dict | None = None
_rede_mtime: int = 0


def _rede_atual() -> Optional[dict]:
    """O snapshot da vizinhança, relido quando o `mtime` muda.

    Mesmo gatilho do overlay de `graph.py`, e pelo mesmo motivo: rematerializar é escrever um
    arquivo, e sem olhar o `mtime` o processo serviria para sempre a foto que leu ao subir — o modo
    de falha característico desta base, silencioso e convincente.
    """
    global _rede, _rede_mtime
    try:
        agora = SNAPSHOT_REDE.stat().st_mtime_ns
    except OSError:
        _rede, _rede_mtime = None, 0
        return None
    if _rede is None or agora != _rede_mtime:
        try:
            _rede = json.loads(SNAPSHOT_REDE.read_text(encoding="utf-8"))
            _rede_mtime = agora
        except (OSError, ValueError):
            _rede, _rede_mtime = None, 0
    return _rede


def network(source: Optional[str] = None) -> dict:
    """A vizinhança lateral de UM corpo — a rede que a cena desenha só na seleção.

    ⚠️ **Rota própria, e não mais um campo no `/api/graph`.** `centrality` e `usage` são um número
    por corpo e cabem no nó; a vizinhança são 3 705 vínculos, **408 kB contra os 119 kB da topologia
    inteira**. Anexá-la ao céu faria toda abertura de tela pagar 3,4× por um dado que só a seleção
    lê — e no corpus real, com 8 130 `SIMILAR_TO`, o fator seria muito maior.

    A lei nº 2 fica intacta: isto lê um ARQUIVO que o script materializou, nunca o Neo4j. Sem
    snapshot, `disponivel` é falso e a cena simplesmente não desenha rede — nenhum corpo ganha uma
    lista vazia, que afirmaria "medi e ele não tem vizinhos".

    Sem `source`, devolve só o cabeçalho: é como a tela pergunta se a dimensão existe antes de
    haver seleção.
    """
    dados = _rede_atual()
    if dados is None:
        return {"disponivel": False, "motivo": "sem snapshot: rode scripts/vizinhanca.mjs"}
    # ⚠️ A recusa vem ANTES do cabeçalho, e é aí que estava o defeito: o cabeçalho era montado com
    # `corpos` e `vinculos` do snapshot e `disponivel: True` fixo, então um snapshot de outro céu
    # anunciava 4 226 vínculos e devolvia `vizinhanca: null` para todo mundo. Ver `_recusa_de_corpus`.
    recusa = _recusa_de_corpus(dados, "vizinhanca.mjs")
    if recusa:
        return {"disponivel": False, "motivo": recusa, "as_of": dados.get("as_of")}
    cabecalho = {
        "disponivel": True,
        "as_of": dados.get("as_of"),
        # O corpus viaja no cabeçalho, e não só é conferido: quem lê a resposta consegue provar de
        # que céu ela é sem uma segunda chamada. `corpos: 188` sozinho não acusa nada — foi
        # justamente ele que passou por medida durante um dia inteiro.
        "corpus": dados.get("corpus"),
        "teto": dados.get("teto"),
        "corpos": dados.get("corpos"),
        "vinculos": dados.get("vinculos"),
        "tipos": dados.get("tipos"),
        "fora": dados.get("fora"),
    }
    if source is None:
        return cabecalho
    # ⚠️ Corpo ausente do snapshot devolve `null`, não `[]`. "Não medi este" e "medi e ele não tem
    # vizinho" são fatos diferentes, e o segundo tem representação própria (`v: []`).
    return {
        **cabecalho,
        "source": source,
        "vizinhanca": (dados.get("vizinhanca") or {}).get(source),
        # Os ASSUNTOS deste corpo (P7). Vêm na mesma resposta porque respondem a mesma pergunta —
        # "com o que este corpo se relaciona" — por um caminho diferente: o vínculo liga corpo a
        # corpo, o assunto liga corpo a conceito. Ver `conceitos`.
        "conceitos": conceitos(source),
    }


#: Onde `scripts/conceitos.mjs` deixa os assuntos por corpo (P7). Arquivo, nunca o banco.
SNAPSHOT_CONCEITOS = config.ROOT / ".cache" / "conceitos.json"

_conceitos: dict | None = None
_conceitos_mtime: int = 0


def conceitos(source: Optional[str] = None) -> Optional[dict]:
    """Os assuntos de um corpo, do snapshot do P7 — ou o cabeçalho, sem `source`.

    ⚠️ **É a única dimensão deste sistema que NÃO é fato.** As outras saem de disco, de git ou de
    vetor, e qualquer pessoa recalcula e chega ao mesmo número; esta sai de um modelo, e duas
    execuções podem discordar. Por isso `modelo` e `as_of` viajam junto: quem lê o assunto precisa
    saber quem o afirmou, e quando.

    ⚠️ E `corpos` (quantos exercem cada conceito) viaja por conceito porque é ele que separa as
    duas coisas que a extração produz: assunto com 1 corpo DESCREVE o documento; com 2 ou mais,
    LIGA os dois. Medido no `espatial_vivo`: 100 conceitos, **só 16 compartilhados**.
    """
    global _conceitos, _conceitos_mtime
    try:
        agora = SNAPSHOT_CONCEITOS.stat().st_mtime_ns
    except OSError:
        return None
    if _conceitos is None or agora != _conceitos_mtime:
        try:
            _conceitos = json.loads(SNAPSHOT_CONCEITOS.read_text(encoding="utf-8"))
            _conceitos_mtime = agora
        except (OSError, ValueError):
            return None
    # Mesma guarda das outras quatro dimensões: assunto extraído sobre outro céu não descreve
    # nenhum corpo deste, e o `modelo`/`as_of` no cabeçalho faria a lista vazia parecer veredito.
    recusa = _recusa_de_corpus(_conceitos, "conceitos.mjs")
    if recusa:
        return {"disponivel": False, "motivo": recusa, "as_of": _conceitos.get("as_of")}
    cabecalho = {"disponivel": True, **{k: v for k, v in _conceitos.items() if k != "porCorpo"}}
    if source is None:
        return cabecalho
    return {**cabecalho, "lista": (_conceitos.get("porCorpo") or {}).get(source)}
