#!/usr/bin/env python3
"""
Monta um CORPUS DE TESTE completo para a cena — repo git próprio + coleção Qdrant própria.

Por que existe: a cena real indexa `~/vault` enquanto o `AGENT_CWD` aponta para o workspace, então
o estado git quase nunca casa com um nó — só `Makefile` e `opensrc` aparecem, os dois `modified`.
Não há como validar `untracked` nem `staged` na cena real, e nem como exercitar as morfologias de
propósito. Aqui as duas pontas são construídas juntas e casam por construção.

O que ele garante, e cada linha é deliberada:

  - TODA morfologia de `MORPHOLOGY_BY_KIND` tem pelo menos um corpo: planeta, estrela, fotosfera,
    cometa, estação, pulsar, nebulosa.
  - TODO estado git tem pelo menos um anel: limpo, modified, staged, untracked.
  - As quatro classes de galáxia saem da CONCENTRAÇÃO de massa dos diretórios (V0 concentrado →
    V3 difuso), com um diretório de 2 arquivos para o caso "0 braços, limitado por arquivos".
  - Um hub massivo o bastante para acender QUASAR.
  - Datas de commit espalhadas, porque a recência por git é o raio orbital.

Os vetores são REAIS — saem do mesmo `server.embed` do servidor, denso + BM25 esparso, na mesma
coleção de dois vetores nomeados que a busca híbrida exige. Ver `indexar()`.

    uv run --with fastembed python scripts/fixture.py            # cria repo + indexa
    uv run --with fastembed python scripts/fixture.py --limpar   # apaga repo + coleção
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(os.environ.get("FIXTURE_ROOT") or "~/workspace/espatial-fixtures").expanduser()
QDRANT = "http://localhost:6333"
COLECAO = "espatial_fixture"
DIMENSAO = 384

# ⚠️ O PRIMEIRO SEGMENTO DO `source` É O REPO, E ELE É DESCARTADO NOS DOIS LADOS.
#
# `dirty.state_of` (servidor) faz `source.split("/", 1)[1]` e `registerPath` (cliente,
# `graph.js`) faz `source.slice(source.indexOf("/") + 1)` — os dois jogam fora o primeiro
# segmento para chegar no caminho relativo à raiz do workspace, que é como o `git status` fala.
#
# A primeira versão deste fixture indexou `atlas/infra/main.tf` sem esse segmento. Descartado o
# primeiro pedaço sobrava `infra/main.tf`, que não existe na tabela do git, e o resultado foi
# EXATAMENTE o modo de falha que o comentário do `registerPath` avisa: nenhum anel, em silêncio.
# O caminho em DISCO continua sendo `atlas/infra/main.tf`; o que ganha o prefixo é só o `source`
# gravado no Qdrant.
REPO = RAIZ.name

LIMPO, MODIFICADO, PREPARADO, NOVO = "limpo", "modified", "staged", "untracked"


# ---------------------------------------------------------------- o corpus

def f(caminho: str, estado: str, chunks: int, assunto: str, commits: int = 0) -> dict:
    """Uma entrada do corpus.

    `commits` são commits RECENTES (dentro da janela de 30 dias de `recency.CHURN_WINDOW_DAYS`), e
    é o knob que faltava: `node.churn` é a contagem deles, e dele saem a ATIVIDADE do cometa, o
    FAROL da estação, as MANCHAS da fotosfera e o envoltório da supernova. Sem ele o corpus
    inteiro nascia com churn 0 e essas quatro feições nunca existiam — ver `docs/cobertura.md`.
    """
    return {"caminho": caminho, "estado": estado, "chunks": chunks, "assunto": assunto,
            "commits": commits}


# `atlas` — o sistema que cobre TODA morfologia e TODO estado git.
# A coluna `chunks` é a massa: ela decide o tamanho do corpo e, somada por diretório, a
# concentração que escolhe a classe da galáxia.
ARQUIVOS = [
    # ── REMANESCENTE ESTELAR → PULSAR (§2.7.1 do replanejamento: a MASSA decide qual cadáver).
    #
    # Três condições, e as três são estruturais — não dá para obter nenhuma por acidente:
    #
    #   GIGANTE   `porteEstelar(chunks) === 'gigante'`, isto é >= ESCADA.ESTRELA*4 = 80 chunks.
    #   FRIO      `commits=0` → `churn` 0. A atividade tem de ter ACABADO.
    #   VELHO     `recency <= 0,25`. Aqui idade é POSIÇÃO: o lote histórico commita na ordem de
    #             `ARQUIVOS`, em sete levas de 210 a 30 dias atrás. Por isso o espécime nasce no
    #             TOPO da lista — no fim dela ele sairia recente e a condição falharia em silêncio.
    #
    # ⚠️ E os dois companheiros não são enfeite: `classificar()` limita não-dominante a planeta
    # ("degrau de massa, COM TETO EM PLANETA"), então só o DOMINANTE de um sistema alcança o ramo
    # `case 'estrela'` onde o pulsar mora. Um arquivo grande solto num diretório de outro dono
    # nunca chegaria lá. Com eles, `colapso/` é um sistema cuja estrela está morta — que é o caso
    # real (PSR B1257+12 tem planetas em volta de um pulsar).
    #
    # ⭑ `varredura/pulsar/` FOI REMOVIDO em 2026-08-09 — ele servia ao modelo anterior (cadência),
    # e a medida que o condenou está no lugar onde ele ficava. `colapso/` passou a ser o único
    # espécime do pulsar, o que é cobertura de TIPO e não de PARÂMETRO: ele prova que o caminho
    # desenha, não que o `core`/`period` foram exercitados. Ver a nota em `VARREDURA`.
    f("colapso/remanescente.md", LIMPO, 120, "estrela morta: massa alta, atividade encerrada"),
    f("colapso/orbita-a.md", LIMPO, 5, "companheiro do remanescente"),
    f("colapso/orbita-b.md", LIMPO, 4, "companheiro do remanescente"),
    # doc → PLANETA
    f("atlas/README.md", LIMPO, 12, "visão geral do atlas"),
    f("atlas/docs/guia.md", MODIFICADO, 22, "guia de operação"),
    f("atlas/docs/arquitetura.md", LIMPO, 31, "camadas e limites"),
    # decision → PLANETA
    f("atlas/docs/status/2026-08-06-auditoria.md", NOVO, 9, "auditoria de maturidade"),
    f("atlas/docs/status/2026-07-30-rumo.md", LIMPO, 14, "decisão de rumo"),
    # memory → PLANETA
    f("atlas/memory/costura-do-disco.md", NOVO, 4, "memória: costura em atan"),
    f("atlas/memory/MEMORY.md", LIMPO, 6, "índice de memórias"),
    # script → COMETA
    f("atlas/scripts/build.sh", NOVO, 7, "build do projeto"),
    f("atlas/scripts/deploy.sh", PREPARADO, 11, "deploy em produção"),
    f("atlas/scripts/limpar.sh", LIMPO, 3, "limpeza de artefatos"),
    # agent → ESTAÇÃO
    f("atlas/.claude/agents/revisor.md", NOVO, 8, "agente revisor"),
    f("atlas/.claude/skills/varredura.md", LIMPO, 16, "skill de varredura"),
    # infra → PULSAR
    f("atlas/infra/main.tf", NOVO, 19, "rede e cluster"),
    f("atlas/infra/prod.tfvars", LIMPO, 5, "variáveis de produção"),
    # compose → NEBULOSA
    f("atlas/deploy/docker-compose.yml", NOVO, 13, "orquestração local"),
    f("atlas/deploy/compose.prod.yml", MODIFICADO, 9, "orquestração de produção"),
    # schema → FOTOSFERA
    f("atlas/db/schema.prisma", MODIFICADO, 27, "modelo de dados"),
    f("atlas/db/seed.sql", LIMPO, 8, "carga inicial"),
    # config → FOTOSFERA
    f("atlas/config/app.json", PREPARADO, 6, "configuração da aplicação"),
    f("atlas/config/limites.toml", LIMPO, 4, "limites e cotas"),
    # lock → ESTRELA
    f("atlas/uv.lock", LIMPO, 40, "dependências travadas"),
    # other → ESTRELA
    f("atlas/src/motor.ts", MODIFICADO, 24, "motor de execução"),
    f("atlas/src/rota.ts", LIMPO, 15, "roteamento"),
    f("atlas/src/fila.py", NOVO, 10, "fila de trabalho"),
]

# `varredura` — existe SÓ para o ESPAÇO DE PARÂMETROS, e é a segunda camada de cobertura.
#
# ⚠️ O resto do fixture cobre TIPO: um corpo de cada morfologia, um anel de cada estado. Medido em
# 2026-08-07, isso deixava quase todo parâmetro colado num extremo — cometa com coma e cauda no
# piso, farol da estação em zero nas quatro, manchas da fotosfera em zero na mediana, cavidade da
# nebulosa saturada no teto nas duas. Tipo presente prova que o caminho DESENHA; não prova que o
# shader foi exercitado. A doutrina inteira está em `docs/cobertura.md`.
#
# Cada trio abaixo varre um eixo em MÍNIMO · MÉDIO · MÁXIMO, e os alvos são calculados, não
# escolhidos no gosto:
#
#   churn → atividade/farol/manchas   log2(1+c)/log2(28):  0 → 0,00 · 4 → 0,47 · 27 → 1,00
#   sections → cavidade da nebulosa   0,16 + n·0,035 (teto 0,46):  2 → 0,23 · 5 → 0,34 · 12 → 0,46
#                                     e `sections` = min(chunks, 12), escrito por `indexar()`
VARREDURA = [
    # ATIVIDADE DO COMETA — é ela que acorda a cauda dupla, a curvatura e o comprimento (1,98→9).
    f("varredura/cometa/frio.sh", LIMPO, 6, "cometa sem atividade", commits=0),
    f("varredura/cometa/morno.sh", LIMPO, 6, "cometa de atividade média", commits=4),
    f("varredura/cometa/quente.sh", LIMPO, 6, "cometa de atividade máxima", commits=27),
    # FAROL DA ESTAÇÃO — o pisca que diz "este agente foi mexido".
    f("varredura/.claude/agents/farol-apagado.md", LIMPO, 8, "agente parado", commits=0),
    f("varredura/.claude/agents/farol-lento.md", LIMPO, 8, "agente morno", commits=4),
    f("varredura/.claude/agents/farol-intenso.md", LIMPO, 8, "agente em obra", commits=27),
    # MANCHAS DA FOTOSFERA — corpo mexido tem mancha fria; corpo parado é liso.
    f("varredura/fotosfera/limpa.json", LIMPO, 10, "config intocada", commits=0),
    f("varredura/fotosfera/manchada.json", LIMPO, 10, "config em revisão", commits=4),
    f("varredura/fotosfera/coberta.json", LIMPO, 10, "config em reescrita", commits=27),
    # CAVIDADE DA NEBULOSA — governada por SEÇÕES, não por churn: mais serviços declarados, maior
    # a bolha soprada de dentro. `compose` no nome do arquivo é o que decide o kind.
    f("varredura/nebulosa/compose-mini.yml", LIMPO, 2, "dois serviços"),
    f("varredura/nebulosa/compose-media.yml", LIMPO, 5, "cinco serviços"),
    f("varredura/nebulosa/compose-cheia.yml", LIMPO, 12, "doze serviços"),
    # ⛔ `varredura/pulsar/` SAIU em 2026-08-09, e não por arrumação — por medida. Ele varria o
    # eixo de MASSA do pulsar sob o portão de CADÊNCIA, que o §2.7.1 substituiu. Dois fatos o
    # condenaram, e o segundo é o que impede recriá-lo mais adiante:
    #
    # (1) `regularity` não é lida por ninguém no roteamento. Os dois espécimes classificavam
    #     `asteroide` (sem pele) e `estrela:gigante` (FOTOSFERA) — nenhum chegava a pulsar, e o
    #     `1,00` que eles carregavam em `CADENCIAS` não tinha leitor.
    # (2) **O eixo é invarrível por construção.** `pulsarParams` deriva `core` e `period` de
    #     `massRank`, que é POSTO no céu inteiro; o portão do pulsar é `chunks >= 80`. Gigante
    #     implica massRank 0,822–1,000, então `period` só alcança **3,61–4,25 s de uma escala
    #     0,9–4,2** — a metade rápida do `SPIN_PERIOD` (o pulsar de milissegundo) é inalcançável.
    #     Um trio de massas não varreria nada, e mais espécimes não consertam isso.
    #
    # O pulsar segue com o espécime de TIPO em `colapso/` (um ponto do parâmetro). Fechar o eixo
    # exige acertar a escala que o rig lê contra a que o portão seleciona — é trabalho no `rig`,
    # não no fixture, e está anotado como aberto.
]
ARQUIVOS.extend(VARREDURA)

# `forja` — existe SÓ para as classes de galáxia. A classe sai da concentração de massa (a fração
# do maior filho), e os quatro diretórios abaixo varrem a escada de propósito.
FORJA = [
    # V0 LENTICULAR — muito concentrado (0,85)
    ("forja/concentrado", [("nucleo.md", 85), ("a.md", 4), ("b.md", 4), ("c.md", 4), ("d.md", 3)]),
    # V1/V2 — meio da escada (~0,55)
    ("forja/medio", [("principal.md", 55), ("apoio.md", 20), ("nota.md", 13), ("extra.md", 12)]),
    # V3 MULTI-ARM — difuso, muitos filhos parelhos (0,125)
    ("forja/equilibrado", [(f"parte-{i}.md", 12) for i in range(8)]),
    # 0 braços: dois arquivos só. A galáxia tem de dizer "class asks N, capped by files".
    ("forja/duplo", [("um.md", 9), ("dois.md", 7)]),
]
for pasta, filhos in FORJA:
    for nome, chunks in filhos:
        ARQUIVOS.append(f(f"{pasta}/{nome}", LIMPO, chunks, f"{pasta}/{nome}"))

# CADÊNCIAS — três ritmos de commit, para o limiar do pulsar poder ser escolhido com distribuição
# na mão em vez de no gosto. Todas com 6 commits (5 intervalos), acima do MIN_INTERVALOS = 4.
# A RAJADA é o controle NEGATIVO e é a que mais importa: é o padrão humano típico, e se ela
# acender como pulsar o fato não está medindo o que diz medir.
CADENCIAS = {
    "atlas/scripts/limpar.sh": [40, 40, 40, 40, 40],      # metrônomo  · CV 0
    "atlas/config/limites.toml": [34, 45, 38, 42, 36],    # quase      · CV ~0,10
    "atlas/src/rota.ts": [1, 1, 2, 1, 115],               # rajada     · CV > 1
    # ⛔ Os dois de `varredura/pulsar/` saíram com os espécimes em 2026-08-09 — o motivo está lá.
    # ⚠️ Os três que ficam NÃO são resto: `regularity` continua sendo fato publicado no nó, e a
    # RAJADA segue sendo o controle negativo dele. O que morreu foi a cadência decidir CLASSE,
    # não a cadência ser medida.
}

# `nucleo` — hub massivo, para acender o QUASAR (o portão hoje é massa de bojo).
for i in range(14):
    ARQUIVOS.append(
        f(f"nucleo/bloco-{i:02d}.md", LIMPO if i % 4 else MODIFICADO, 60 + i * 9, f"bloco denso {i}")
    )


# ---------------------------------------------------------------- disco

def texto(entrada: dict, i: int) -> str:
    return (
        f"# {entrada['assunto']}\n\n"
        f"Arquivo de corpus sintético para a cena do espatial-os.\n"
        f"Caminho: {entrada['caminho']} · trecho {i + 1} de {entrada['chunks']}.\n\n"
        f"Este parágrafo existe para dar corpo ao arquivo e um pouco de variação de tamanho "
        f"entre os nós do céu. Assunto declarado: {entrada['assunto']}.\n"
    )


def escrever(entrada: dict, sufixo: str = "") -> None:
    destino = RAIZ / entrada["caminho"]
    destino.parent.mkdir(parents=True, exist_ok=True)
    corpo = "".join(texto(entrada, i) for i in range(min(entrada["chunks"], 6)))
    destino.write_text(corpo + sufixo, encoding="utf-8")


def git(*args: str, quando: str | None = None) -> None:
    env = dict(os.environ)
    if quando:
        env["GIT_AUTHOR_DATE"] = quando
        env["GIT_COMMITTER_DATE"] = quando
    subprocess.run(["git", "-C", str(RAIZ), *args], check=True, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def montar_repo() -> None:
    if RAIZ.exists():
        shutil.rmtree(RAIZ)
    RAIZ.mkdir(parents=True)
    git("init", "-q")
    git("config", "user.email", "fixture@espatial.local")
    git("config", "user.name", "espatial fixture")

    # 1. Tudo que NÃO nasce untracked entra no disco e é commitado, em datas espalhadas — a
    #    recência por git é o RAIO ORBITAL, então commitar tudo junto empilharia o céu num anel só.
    # ⚠️ Os arquivos de CADÊNCIA ficam FORA do lote histórico, e isso não é detalhe: um commit
    # solto no meio da história acrescenta um intervalo grande e irregular ao ritmo deles. Medido:
    # com ele, o "metrônomo" de intervalos idênticos saiu com regularidade 0,67 em vez de ~1,00 —
    # o número deixava de medir a cadência e passava a medir a contaminação.
    commitaveis = [e for e in ARQUIVOS if e["estado"] != NOVO and e["caminho"] not in CADENCIAS]
    for entrada in commitaveis:
        escrever(entrada)
    base = datetime.now(timezone.utc) - timedelta(days=210)
    lote = max(1, len(commitaveis) // 7)
    for n in range(0, len(commitaveis), lote):
        for entrada in commitaveis[n:n + lote]:
            git("add", "--", entrada["caminho"])
        quando = (base + timedelta(days=30 * (n // lote))).strftime("%Y-%m-%dT%H:%M:%S%z")
        git("commit", "-q", "-m", f"lote {n // lote}", quando=quando)

    # 2. ACRECÃO — commits RECENTES, dentro da janela de churn do servidor (30 dias).
    #
    # Sem isto o `churn` de todo arquivo é 0 e, com o portão de acreção, NENHUM quasar acende —
    # o que é a resposta correta para um corpus congelado e inútil para validar o objeto. Só
    # `nucleo/` esquenta: ele é o hub massivo, então é o único que tem as duas condições (bojo
    # alto E gás caindo) e o céu fica com exatamente um núcleo ativo, que é a proporção certa.
    quentes = [e for e in ARQUIVOS if e["caminho"].startswith("nucleo/")][:6]
    for rodada in range(3):
        for entrada in quentes:
            escrever(entrada, sufixo=f"\nRevisão recente {rodada + 1}.\n")
            git("add", "--", entrada["caminho"])
        quando = (datetime.now(timezone.utc) - timedelta(days=20 - rodada * 7)).strftime(
            "%Y-%m-%dT%H:%M:%S%z"
        )
        git("commit", "-q", "-m", f"revisão quente {rodada + 1}", quando=quando)

    # 2b. VARREDURA DE CHURN — o knob que faltava para o espaço de parâmetros existir.
    #
    # `node.churn` é a CONTAGEM de commits na janela de 30 dias, e quatro feições saem dele:
    # atividade do cometa, farol da estação, manchas da fotosfera e o envoltório da supernova.
    # Os commits são espalhados DENTRO da janela em vez de empilhados no mesmo dia, porque um
    # arquivo com 27 commits no mesmo instante é um padrão que o git registra e nenhum humano
    # produz — e a recência (que é o raio orbital) leria a data do último igual nos três casos.
    # ⚠️ E o espaçamento é IRREGULAR de propósito. Commits igualmente espaçados dão CV 0, e CV 0 é
    # regularidade ~1,00 — a classe PULSAR tem prioridade 20 e sequestraria o corpo, então o
    # "cometa de atividade máxima" nasceria pulsar e a varredura mediria outra coisa. O padrão
    # abaixo cicla gaps de 1 a 5 dias: é churn alto com ritmo humano, que é o que se quer imitar.
    GAPS_HUMANOS = (1, 3, 1, 2, 5, 1, 4, 2)
    for entrada in ARQUIVOS:
        quantos = entrada.get("commits", 0)
        if not quantos:
            continue
        dias = 28
        for n in range(quantos):
            escrever(entrada, sufixo=f"\nRevisão {n + 1} na janela de churn.\n")
            git("add", "--", entrada["caminho"])
            quando = (datetime.now(timezone.utc) - timedelta(days=max(dias, 1))).strftime(
                "%Y-%m-%dT%H:%M:%S%z"
            )
            git("commit", "-q", "-m", f"churn {n + 1}/{quantos} de {entrada['caminho']}",
                quando=quando)
            dias -= GAPS_HUMANOS[n % len(GAPS_HUMANOS)]

    # 3. RITMO — o fato de que o pulsar depende.
    #
    # Três cadências de propósito, para o limiar poder ser escolhido com distribuição na mão em
    # vez de no gosto. Todas com 6 commits (5 intervalos), acima do MIN_INTERVALOS = 4:
    #
    #   metronomo  intervalos IDÊNTICOS         → CV 0,00  → regularidade ~1,00
    #   quase      idênticos com ±15% de jitter → CV ~0,10 → regularidade ~0,90
    #   rajada     tudo junto e um buraco longo → CV > 1   → regularidade ausente
    #
    # A rajada é o controle NEGATIVO e é o que mais importa: é o padrão humano típico, e se ela
    # acender como pulsar o fato não está medindo o que diz medir.
    for caminho, gaps in CADENCIAS.items():
        entrada = next(e for e in ARQUIVOS if e["caminho"] == caminho)
        atras = sum(gaps)
        for n, gap in enumerate([0, *gaps]):
            atras -= gap
            escrever(entrada, sufixo=f"\nBatida {n + 1}.\n")
            git("add", "--", caminho)
            quando = (datetime.now(timezone.utc) - timedelta(days=atras + 1)).strftime(
                "%Y-%m-%dT%H:%M:%S%z"
            )
            git("commit", "-q", "-m", f"batida {n + 1} de {caminho}", quando=quando)

    # 4. Os estados sujos, DEPOIS do commit — senão eles nasceriam limpos.
    for entrada in ARQUIVOS:
        if entrada["estado"] == MODIFICADO:
            escrever(entrada, sufixo="\nLinha acrescentada depois do commit.\n")
        elif entrada["estado"] == PREPARADO:
            escrever(entrada, sufixo="\nLinha acrescentada e preparada.\n")
            git("add", "--", entrada["caminho"])
        elif entrada["estado"] == NOVO:
            escrever(entrada)  # nunca commitado


# ---------------------------------------------------------------- qdrant

def pedir(metodo: str, caminho: str, corpo: dict | None = None) -> dict:
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(
        f"{QDRANT}{caminho}", data=dados, method=metodo,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def indexar() -> int:
    """
    ⚠️ OS VETORES SÃO REAIS, e a coleção tem DOIS deles.

    A primeira versão gravou vetor único e anônimo, e a busca quebrou com
    `Not existing vector name error: fast-paraphrase-multilingual-minilm-l12-v2`. A coleção real
    tem um vetor DENSO NOMEADO (o nome sai de `config.vector_name(EMBED_MODEL)`, a regra
    `fast-<último segmento em minúsculas>` do mcp-server-qdrant) e um ESPARSO `bm25` com
    `modifier: idf` — porque `qdrant.search` é HÍBRIDA por padrão: dois prefetch e fusão RRF.
    Declarar só um dos dois derruba a busca inteira.

    Os vetores saem do MESMO embedder do servidor (`server.embed`), não de um hash: um fixture com
    vetor falso não quebraria a busca, mas responderia bobagem — e "a busca não presta" é
    exatamente o tipo de defeito que se atribui ao produto quando a culpa é do corpus de teste.

    ⚠️ DOCUMENTO usa `.embed()`, CONSULTA usa `.query_embed()`. É a distinção que
    `server/embed.py:53` já registra: no BM25 a consulta lista termos sem peso de documento.
    Trocar os dois não dá erro — só devolve ranking ruim.
    """
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from server import config as srv_config, embed as srv_embed

    nome_denso = srv_config.vector_name(srv_config.get("EMBED_MODEL"))
    denso, esparso = srv_embed._load()

    agora = datetime.now(timezone.utc).isoformat()
    docs: list[str] = []
    metas: list[dict] = []
    for entrada in ARQUIVOS:
        caminho = entrada["caminho"]
        # O `source` leva o repo na frente; o caminho em disco, não. Ver REPO, no topo.
        fonte = f"{REPO}/{caminho}"
        nome = caminho.rsplit("/", 1)[-1]
        for i in range(entrada["chunks"]):
            docs.append(f"{fonte} § {entrada['assunto']}\n\n{texto(entrada, i)}")
            metas.append({
                "source": fonte,
                "path": fonte,
                "file_name": nome,
                "section": entrada["assunto"] if i == 0 else f"parte {i + 1}",
                "chunk_index": i,
                "indexed_at": agora,
            })

    print(f"vetorizando {len(docs)} chunks (denso + bm25), pode levar um minuto...")
    densos = [v.tolist() for v in denso.embed(docs)]
    esparsos = [
        {"indices": e.indices.tolist(), "values": e.values.tolist()} for e in esparso.embed(docs)
    ]

    try:
        pedir("DELETE", f"/collections/{COLECAO}")
    except Exception:
        pass
    pedir("PUT", f"/collections/{COLECAO}", {
        "vectors": {nome_denso: {"size": len(densos[0]), "distance": "Cosine"}},
        "sparse_vectors": {"bm25": {"modifier": "idf"}},
    })

    pontos = [
        {
            "id": n + 1,
            "vector": {nome_denso: densos[n], "bm25": esparsos[n]},
            "payload": {"document": docs[n], "metadata": metas[n]},
        }
        for n in range(len(docs))
    ]
    for n in range(0, len(pontos), 128):
        pedir("PUT", f"/collections/{COLECAO}/points?wait=true", {"points": pontos[n:n + 128]})
    return len(pontos)


# ---------------------------------------------------------------- entrada

def limpar() -> None:
    if RAIZ.exists():
        shutil.rmtree(RAIZ)
        print(f"apagado  {RAIZ}")
    try:
        pedir("DELETE", f"/collections/{COLECAO}")
        print(f"apagada  coleção {COLECAO}")
    except Exception as e:
        print(f"coleção não apagada: {e}")


def main() -> None:
    if "--limpar" in sys.argv:
        limpar()
        return
    montar_repo()
    total = indexar()
    estados: dict[str, int] = {}
    for entrada in ARQUIVOS:
        estados[entrada["estado"]] = estados.get(entrada["estado"], 0) + 1
    print(f"repo     {RAIZ}")
    print(f"arquivos {len(ARQUIVOS)}  ·  pontos {total}")
    print("estados  " + " · ".join(f"{k}={v}" for k, v in sorted(estados.items())))
    print(f"coleção  {COLECAO} em {QDRANT}")
    print()
    print("aponte o servidor:  AGENT_CWD=" + str(RAIZ))
    print("                    QDRANT_COLLECTION=" + COLECAO)
    print("                    CORPUS_PREFIX=")


if __name__ == "__main__":
    main()
