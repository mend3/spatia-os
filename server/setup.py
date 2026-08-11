"""O SETUP do ambiente — escolher a raiz pela tela, e o que essa escolha derruba.

## O seletor é do SERVIDOR, e isso é decisão de arquitetura

☠️ **Nenhuma API de navegador serve aqui, e as duas candidatas falham por razões diferentes.**
`showDirectoryPicker()` devolve um handle cujo `.name` é só o nome da pasta — o caminho absoluto é
escondido do JS por projeto, então não há o que entregar ao processo que vai indexar. E a permissão
"apps no dispositivo" (Local Network Access) governa uma origem PÚBLICA alcançar o loopback: o
SpatIA já é servido de `127.0.0.1`, então ela nunca é pedida, e mesmo se fosse governaria REDE e
não arquivo.

O servidor roda na máquina do operador e já enxerga o disco. Ele lista, a tela navega.

## O que uma troca de raiz DERRUBA

Corpus diferente é céu diferente. Tudo o que descreve o corpus velho vira afirmação sobre uma
árvore que ninguém está mais olhando:

* a coleção do Qdrant — reconstruída em coleção NOVA, com troca de apelido no fim;
* o grafo e os snapshots de `.cache/` — o servidor já RECUSA snapshot cujo `corpus` não bate, e é
  essa recusa que impede o céu de servir topologia de um corpus e corpos de outro;
* `.cache/conceitos*.json` — inferência sobre a prosa de UM corpus.

⚠️ **Invalidar é RENOMEAR, não apagar.** Um snapshot removido e um snapshot de outro corpus são
indistinguíveis para quem depois pergunta "por que sumiu?"; o arquivo com sufixo diz que existiu e
de qual corpus era.
"""
import os
import shutil
import threading
import subprocess
import time
from pathlib import Path
from typing import Callable, Iterator, Optional

from . import config

# Snapshots que descrevem o CORPUS. `config.json` (permissões) e `ambiente.json` não entram: eles
# são do operador, não do céu.
SNAPSHOTS_DO_CORPUS = (
    "conceitos.json",
    "conceitos-brutos.json",
    "influencia.json",
    "uso.json",
    "conectividade.json",
    "vizinhanca.json",
)


def raiz_atual() -> Optional[Path]:
    bruto = config.get("CORPUS_ROOT")
    return Path(bruto) if bruto else None


# ─────────────────────────────────────────────────────────── o seletor


def listar(caminho: Optional[str] = None) -> dict:
    """Os subdiretórios de `caminho`, para a tela navegar. Sem `caminho`, parte do HOME.

    ⚠️ **Diretório ilegível é LISTADO com a marca, nunca omitido.** Sumir com o que existe faria o
    operador procurar uma pasta que a tela decidiu não mostrar, e concluir que ela não existe.
    """
    base = Path(caminho).expanduser() if caminho else Path.home()
    try:
        base = base.resolve(strict=True)
    except (OSError, RuntimeError):
        return {"erro": f"não existe: {base}", "caminho": str(base), "entradas": []}
    if not base.is_dir():
        return {"erro": f"não é diretório: {base}", "caminho": str(base), "entradas": []}

    entradas = []
    try:
        for item in sorted(base.iterdir(), key=lambda p: p.name.lower()):
            if not item.is_dir():
                continue
            legivel = os.access(item, os.R_OK | os.X_OK)
            entradas.append(
                {
                    "nome": item.name,
                    "caminho": str(item),
                    "legivel": legivel,
                    # Ruído declarado aparece MARCADO, não escondido: o operador pode querer
                    # justamente apontar para uma pasta que a política excluiria por dentro.
                    "ruido": not config.indexavel(item.name),
                }
            )
    except PermissionError:
        return {"erro": f"sem permissão: {base}", "caminho": str(base), "entradas": []}

    return {
        "caminho": str(base),
        "pai": str(base.parent) if base.parent != base else None,
        "entradas": entradas,
        "home": str(Path.home()),
    }


def prever(caminho: str) -> dict:
    """Quantos arquivos essa raiz renderia, ANTES de indexar.

    ⭑ Existe para a escolha não ser às cegas: apontar para uma pasta e descobrir só depois que ela
    rende 15 mil arquivos é o tipo de surpresa que custa uma indexação inteira.
    """
    raiz = Path(caminho).expanduser().resolve()
    if not raiz.is_dir():
        raise ValueError(f"não é um diretório: {raiz}")
    admitidos = bytes_admitidos = descartados = 0
    por_tipo: dict[str, int] = {}
    inicio = time.time()
    for base, dirs, arquivos in os.walk(raiz):
        rel_base = os.path.relpath(base, raiz)
        rel_base = "" if rel_base == "." else rel_base
        dirs[:] = [d for d in dirs if config.indexavel(os.path.join(rel_base, d))]
        for nome in arquivos:
            rel = os.path.join(rel_base, nome) if rel_base else nome
            try:
                tamanho = os.path.getsize(os.path.join(base, nome))
            except OSError:
                continue
            if config.admitido(rel, tamanho):
                admitidos += 1
                bytes_admitidos += tamanho
                sufixo = Path(nome).suffix.lower() or nome
                por_tipo[sufixo] = por_tipo.get(sufixo, 0) + 1
            else:
                descartados += 1
    return {
        "raiz": str(raiz),
        "admitidos": admitidos,
        "descartados": descartados,
        "mb": round(bytes_admitidos / 1048576, 1),
        "por_tipo": dict(sorted(por_tipo.items(), key=lambda kv: -kv[1])[:12]),
        "segundos": round(time.time() - inicio, 1),
    }


# ─────────────────────────────────────────────────────────── o estado


def descrever() -> dict:
    """O que vale AGORA, com a ORIGEM de cada chave ao lado.

    ☠️ A origem não é enfeite: três camadas decidindo a mesma chave sem a ordem legível é como esta
    base já perdeu um dia, com o `.env` dizendo uma coisa e a tela mostrando outra.
    """
    chaves = {}
    for chave, o_que_e in config.CONFIGURAVEIS.items():
        chaves[chave] = {
            "valor": config.get(chave),
            "origem": config.origem(chave),
            "o_que_e": o_que_e,
        }
    for chave in config.DERIVADAS:
        chaves[chave] = {
            "valor": config.get(chave),
            "origem": config.origem(chave),
            "o_que_e": "derivado da raiz do corpus",
            "derivado": True,
        }
    return {
        "chaves": chaves,
        "so_no_env": list(config.SO_NO_ENV),
        "precedencia": ["ui", "env", "default"],
        "admite": list(config.admite()),
        "exclui": list(config.excludes()),
        "nunca": list(config.NUNCA_INDEXADOS),
        "codigo_fonte": {"admitido": False, "extensoes": list(config.CORPUS_ADMITE_CODIGO)},
        "teto_kb": config.teto_bytes() // 1024,
        "raiz": str(raiz_atual()) if raiz_atual() else None,
        # ⚠️ **Sem raiz, a tela não anuncia coleção** — o valor viria do `.env` e nomearia um
        # corpus que ninguém escolheu. Quem decide isso é o cliente, lendo `raiz`.
        "trabalho": progresso(),
    }


# ☠️ **O que a indexação em fundo CAPTURA no início e não relê.** Trocar qualquer uma no meio da
# corrida deixa a configuração nomeando uma coleção que nunca foi criada — a thread termina, troca o
# apelido ANTIGO, grava `pronto`, e a tela mostra RAIZ nova + INDEXADO com um céu vazio por trás.
# É o pior formato: cabeçalho afirmando sobre carga que não existe.
CONGELADAS_DURANTE_INDEXACAO = ("CORPUS_ROOT", "QDRANT_COLLECTION", "EMBED_MODEL", "SPARSE_MODEL")


def _esquecer_fatos_da_arvore() -> None:
    """Descarta o que foi medido na árvore ANTERIOR — git, alterações locais e topologia.

    ⚠️ Sem isto a troca de raiz é parcial e silenciosa: as tabelas ficam em memória por até 15
    minutos (recência) e o céu novo nasce com os fatos do velho.
    """
    from . import dirty, recency

    recency.esquecer()
    dirty.esquecer()
    alvo = config.ROOT / ".cache" / "graph.json"
    if alvo.is_file():
        alvo.unlink()


def aplicar(patch: dict) -> dict:
    """Grava as chaves que a tela mandou. Raiz nova passa por `definir_corpus`, que deriva o resto.

    ⚠️ **Recusa, nunca enfileira.** Uma escrita adiada seria pior: o operador veria "salvo" e o
    valor só valeria minutos depois, sem nada dizendo qual dos dois está em vigor.
    """
    if progresso().get("estado") == "correndo":
        travadas = [k for k in patch if k in CONGELADAS_DURANTE_INDEXACAO]
        if travadas:
            raise ValueError(
                "indexação em andamento — estas só mudam depois que ela terminar: "
                + ", ".join(sorted(travadas))
            )
    if "CORPUS_ROOT" in patch:
        raiz = patch.pop("CORPUS_ROOT")
        config.definir_corpus(raiz)
    if patch:
        config.definir(patch)
    _esquecer_fatos_da_arvore()
    return descrever()


# ─────────────────────────────────────────────────── o que a troca derruba


def invalidar_snapshots() -> list[str]:
    """Renomeia os snapshots do corpus velho. Devolve o que saiu de circulação."""
    marca = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
    movidos = []
    cache = config.ROOT / ".cache"
    for nome in SNAPSHOTS_DO_CORPUS:
        alvo = cache / nome
        if alvo.is_file():
            destino = cache / f"{nome}.corpus-anterior-{marca}"
            shutil.move(str(alvo), str(destino))
            movidos.append(destino.name)
    return movidos


def limpar_grafo() -> int:
    """Apaga os corpos do corpus ANTERIOR no Neo4j. Devolve quantos saíram.

    ☠️ **`MERGE` acrescenta, nunca substitui — e o carimbo de corpus não salva aqui.** O nome da
    coleção deriva do CAMINHO da raiz, então reindexar a mesma pasta com outra política de admissão
    produz um céu diferente com o MESMO carimbo: os corpos que saíram do índice continuam no grafo,
    indistinguíveis dos que ficaram. Medido: um céu de 1 085 arquivos com 2 432 `:Astro` no banco.

    ⚠️ Por isso a limpeza é do CORPUS INTEIRO, e não "o que sumiu": comparar listas exigiria confiar
    que as duas descrevem a mesma coisa, que é justamente o que o carimbo não garante. A cadeia
    reconstrói tudo em seguida.
    """
    import base64
    import json as _json
    import urllib.request

    corpus = config.get("QDRANT_COLLECTION")
    if not corpus:
        return 0
    user, senha = config.get("NEO4J_USER"), config.get("NEO4J_PASSWORD")
    if not user or not senha:
        return 0
    auth = base64.b64encode(f"{user}:{senha}".encode()).decode()
    pedido = urllib.request.Request(
        f"{config.get('NEO4J_HTTP').rstrip('/')}/db/neo4j/tx/commit",
        data=_json.dumps(
            {
                "statements": [
                    {
                        "statement": "MATCH (a:Astro {corpus: $c}) DETACH DELETE a RETURN count(*) AS n",
                        "parameters": {"c": corpus},
                    }
                ]
            }
        ).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Basic {auth}"},
    )
    try:
        with urllib.request.urlopen(pedido, timeout=300) as r:
            dados = _json.loads(r.read())
        return dados["results"][0]["data"][0]["row"][0]
    except (OSError, ValueError, KeyError, IndexError):
        return 0


def rematerializar(relatar: Callable[[str, str], None] = lambda *_: None) -> list[dict]:
    """Roda a cadeia do grafo NA ORDEM MEDIDA. Cada etapa relata, e a primeira falha interrompe.

    ⚠️ A ordem não é escolha deste módulo: `scripts/lei-tooling.mjs` a DERIVA do fonte e reprova
    receita que chame um dependente sem a dependência. Aqui ela é obedecida, não redecidida —
    duplicar a regra criaria a segunda fonte que a lei existe para impedir.
    """
    etapas = [
        ("vinculos", ["node", "scripts/vinculos.mjs"]),
        ("similares", ["node", "scripts/similares.mjs"]),
        ("citacoes", ["node", "scripts/citacoes.mjs"]),
        ("uso", ["node", "scripts/uso.mjs"]),
        ("centralidade", ["node", "scripts/centralidade.mjs"]),
        ("vizinhanca", ["node", "scripts/vizinhanca.mjs"]),
        ("conectividade", ["node", "scripts/conectividade.mjs"]),
    ]
    resultados = []
    for nome, comando in etapas:
        relatar(nome, "correndo")
        proc = subprocess.run(comando, cwd=config.ROOT, capture_output=True, text=True, timeout=900)
        ok = proc.returncode == 0
        resultados.append(
            {"etapa": nome, "ok": ok, "saida": (proc.stdout + proc.stderr).strip()[-400:]}
        )
        relatar(nome, "ok" if ok else "falhou")
        if not ok:
            break
    return resultados


# ─────────────────────────────────────────── indexar SEM sair da tela

# ☠️ **O TERMINAL NÃO ENTRA NO CAMINHO FELIZ.** Pedir um comando para que uma escolha feita na tela
# tenha efeito é exigir do operador o procedimento interno do app — e é onde quem não é técnico
# para, com o céu vazio e nenhuma pista. Indexar acontece daqui.
#
# ⚠️ **Uma indexação por vez, e o estado é LEGÍVEL.** Duas correndo escreveriam na mesma coleção
# física; e progresso que não se consulta transforma uma operação de minutos em tela travada sem
# explicação — que é o mesmo defeito com outra roupa.
_trabalho = {"estado": "parado", "feitos": 0, "total": 0, "detalhe": "", "resumo": None, "erro": None}
_trava = threading.Lock()


def progresso() -> dict:
    with _trava:
        return dict(_trabalho)


def indexar_em_fundo() -> dict:
    """Dispara a troca INTEIRA numa thread e volta na hora. O progresso sai de `progresso()`."""
    from . import indexador
    from .indexador import Progresso

    with _trava:
        if _trabalho["estado"] == "correndo":
            return dict(_trabalho)
        if not config.get("CORPUS_ROOT"):
            raise ValueError("escolha uma pasta antes de indexar")
        _trabalho.update(estado="correndo", feitos=0, total=0, detalhe="", resumo=None, erro=None)

    def relatar(p) -> None:
        with _trava:
            _trabalho.update(feitos=p.feitos, total=p.total, detalhe=p.detalhe, fase=p.fase)

    def correr() -> None:
        """A troca INTEIRA, não só o índice.

        ☠️ **Indexar sozinho deixa o céu MENTINDO.** O índice novo passa a servir corpos que o
        grafo e os snapshots de `.cache/` não descrevem — topologia de um corpus sobre corpos de
        outro, que é o defeito que o carimbo de corpus passou a recusar. O botão da tela promete
        "reindexar"; entregar metade disso é pior que não ter botão.

        ⚠️ A ordem é a mesma de `reconfigurar`: invalidar ANTES, porque snapshot velho convivendo
        com índice novo é o estado em que a API afirma sobre uma árvore que ninguém está olhando.
        """
        try:
            with _trava:
                _trabalho.update(fase="invalidando")
            invalidar_snapshots()
            limpar_grafo()

            resumo = indexador.indexar(relatar=relatar)

            with _trava:
                _trabalho.update(fase="rematerializando", detalhe="grafo e snapshots")
            etapas = rematerializar(lambda nome, estado: relatar(Progresso("rematerializando", detalhe=f"{nome}: {estado}")))
            falhou = [e for e in etapas if not e["ok"]]
            with _trava:
                _trabalho.update(
                    estado="pronto" if not falhou else "falhou",
                    resumo={**resumo, "cadeia": etapas},
                    detalhe="",
                    erro=None if not falhou else f"cadeia parou em {falhou[0]['etapa']}: {falhou[0]['saida'][:160]}",
                )
        except Exception as e:  # noqa: BLE001 — a tela precisa do motivo, não do traceback
            with _trava:
                _trabalho.update(estado="falhou", erro=str(e))

    threading.Thread(target=correr, name="indexador", daemon=True).start()
    return progresso()


def reconfigurar(raiz: str, *, relatar: Callable[[str, str], None] = lambda *_: None) -> Iterator[dict]:
    """A troca de corpus INTEIRA, em etapas relatadas.

    ⭑ A ordem é deliberada: **invalidar ANTES de indexar**. Um snapshot do corpus velho convivendo
    com um índice do novo é o estado em que a API afirma topologia de uma árvore sobre corpos de
    outra — o defeito que custou um dia e que o carimbo de `corpus` passou a recusar. Melhor sem
    snapshot nenhum (a tela diz "não medi") do que com o snapshot errado.
    """
    from . import indexador

    yield {"etapa": "escolhendo", "raiz": raiz}
    aplicar({"CORPUS_ROOT": raiz})

    yield {"etapa": "invalidando", "movidos": invalidar_snapshots(), "grafo_apagado": limpar_grafo()}

    resumo = indexador.indexar(relatar=lambda p: relatar("indexando", p.detalhe))
    yield {"etapa": "indexado", **resumo}

    yield {"etapa": "rematerializando", "resultados": rematerializar(relatar)}
    yield {"etapa": "pronto", "raiz": raiz, "colecao": config.get("QDRANT_COLLECTION")}
