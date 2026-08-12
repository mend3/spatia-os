"""O indexador do corpus — varre a RAIZ escolhida e constrói a coleção que o céu serve.

## O que ele é, e por que ele passou a existir

O SpatIA lia o índice de um indexador de fora, e a arquitetura declarada era
`raiz → seu indexador → Qdrant → SpatIA`. Isso torna "trocar de corpus pela tela" impossível de
fechar: a UI escolheria a pasta e nada aconteceria, porque quem constrói o índice não é este
programa. Ele agora é.

## ☠️ Ele NUNCA escreve na coleção que está servindo

Indexar é longo. Falhando no meio — disco, modelo, energia — a coleção servida ficaria com metade
do corpus, o carimbo certo e a carga incompleta: o pior padrão desta base, porque o cabeçalho
AFIRMA e ninguém procura mais.

A saída é construir numa coleção NOVA e mover um APELIDO no fim. Enquanto a nova não fecha, a
velha responde inteira; a troca é uma operação atômica do Qdrant, e o rollback é não fazê-la.
O nome que o resto do sistema conhece (`QDRANT_COLLECTION`) é o APELIDO — nunca a coleção física.

## ⚠️ O payload é CONTRATO, e divergir dele não dá erro

`server/qdrant.py:_normalize` espera `document` no formato `"<caminho> § <seção>\\n\\n<corpo>"` e
`metadata` com `source`, `path`, `file_name`, `section`, `chunk_index` e `indexed_at`. Nome de
vetor ou chave de payload divergente devolve **resultado vazio**, não exceção — é o acoplamento
silencioso que a tela `#/storage` existe para acusar.
"""
import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator, Optional

from . import config, net

# Alvo de tamanho por chunk, em caracteres. O modelo denso tem janela curta; o que importa aqui é
# que a fatia caiba com folga e que a fronteira caia num limite SEMÂNTICO quando houver um.
CHUNK_ALVO = 1200
CHUNK_MAX = 2400
LOTE = 64

_CABECALHO = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)


@dataclass
class Progresso:
    fase: str
    feitos: int = 0
    total: int = 0
    detalhe: str = ""


def _url(caminho: str) -> str:
    return f"{config.get('QDRANT_URL').rstrip('/')}{caminho}"


# ─────────────────────────────────────────────────────────── varredura


def varrer(raiz: Path) -> Iterator[tuple[str, Path, int]]:
    """Os arquivos que a política admite, como `(relativo, absoluto, tamanho)`.

    ⚠️ A poda é na DESCIDA: entrar em `node_modules` para descartar depois custa o passeio inteiro,
    e é a diferença entre uma varredura de um segundo e uma de minutos.
    """
    for base, dirs, arquivos in os.walk(raiz):
        rel_base = os.path.relpath(base, raiz)
        rel_base = "" if rel_base == "." else rel_base
        dirs[:] = [d for d in dirs if config.indexavel(os.path.join(rel_base, d))]
        dirs.sort()  # ordem estável: dois índices do mesmo corpus saem comparáveis
        for nome in sorted(arquivos):
            rel = os.path.join(rel_base, nome) if rel_base else nome
            absoluto = Path(base) / nome
            try:
                tamanho = absoluto.stat().st_size
            except OSError:
                continue
            if config.admitido(rel, tamanho):
                yield rel.replace(os.sep, "/"), absoluto, tamanho


# ─────────────────────────────────────────────────────────── fatiamento


def fatiar(texto: str, relativo: str) -> list[tuple[str, str]]:
    """Fatia em `(seção, corpo)`.

    Markdown quebra por CABEÇALHO — a seção é o que o inspetor mostra e o que dá nome à lua de um
    arquivo, então a fronteira tem de ser a que o autor escreveu. O resto quebra por tamanho, com
    a seção vazia: inventar um título para um bloco de SQL seria afirmar estrutura que não existe.
    """
    if relativo.lower().endswith((".md", ".mdc", ".markdown")):
        marcas = list(_CABECALHO.finditer(texto))
        if marcas:
            fatias = []
            for i, m in enumerate(marcas):
                fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
                corpo = texto[m.end() : fim].strip()
                if corpo:
                    fatias.extend((m.group(2), p) for p in _por_tamanho(corpo))
            preambulo = texto[: marcas[0].start()].strip()
            if preambulo:
                fatias = [("", p) for p in _por_tamanho(preambulo)] + fatias
            return fatias
    return [("", p) for p in _por_tamanho(texto)]


def _por_tamanho(texto: str) -> list[str]:
    """Quebra em parágrafos e reagrupa até o alvo — nunca no meio de uma linha."""
    if len(texto) <= CHUNK_MAX:
        return [texto] if texto.strip() else []
    partes, atual = [], ""
    for paragrafo in texto.split("\n\n"):
        if atual and len(atual) + len(paragrafo) + 2 > CHUNK_ALVO:
            partes.append(atual.strip())
            atual = ""
        atual += (("\n\n" if atual else "") + paragrafo)
        while len(atual) > CHUNK_MAX:  # parágrafo único e gigante: corta duro
            partes.append(atual[:CHUNK_MAX])
            atual = atual[CHUNK_MAX:]
    if atual.strip():
        partes.append(atual.strip())
    return partes


def ponto_id(relativo: str, indice: int) -> str:
    """UUID determinístico por (arquivo, fatia): reindexar o mesmo corpus não duplica ponto."""
    bruto = hashlib.sha1(f"{relativo}#{indice}".encode()).hexdigest()
    return f"{bruto[:8]}-{bruto[8:12]}-{bruto[12:16]}-{bruto[16:20]}-{bruto[20:32]}"


# ─────────────────────────────────────────────────────────── a coleção


def _fisica(apelido: str) -> str:
    return f"{apelido}__{int(time.time())}"


def criar_colecao(nome: str, dimensao: int) -> None:
    """Cria a coleção física com os DOIS vetores nomeados que o resto do sistema espera.

    ⚠️ O esparso precisa de `modifier: idf` — sem ele o BM25 não pontua, e a busca híbrida degrada
    para densa pura sem nada acusar.
    """
    denso = config.vector_name(config.get("EMBED_MODEL"))
    net.request_json(
        "qdrant",
        "PUT",
        _url(f"/collections/{nome}"),
        {
            "vectors": {denso: {"size": dimensao, "distance": "Cosine"}},
            "sparse_vectors": {config.SPARSE_VECTOR_NAME: {"modifier": "idf"}},
        },
    )


def trocar_apelido(apelido: str, para: str) -> Optional[str]:
    """Move o APELIDO para a coleção nova, atomicamente. Devolve a física anterior, se havia.

    ☠️ É esta linha que torna o reindex seguro: até ela, quem consulta lê a coleção velha INTEIRA.

    ☠️ **A pergunta é ao REGISTRO GLOBAL de apelidos, nunca ao `/collections/<apelido>/aliases`.**
    Para um APELIDO esse endpoint devolve lista VAZIA — medido —, então `anterior` saía `None`
    SEMPRE e a coleção velha nunca era recolhida: uma cópia inteira do corpus vazando em disco a
    cada reindexação, sem erro em lugar nenhum. É a mesma armadilha que a guarda de colisão em
    `indexar()` já documenta; ela mordeu duas vezes porque a régua estava certa numa função e
    errada na outra.
    """
    anterior = None
    try:
        registro = net.get_json("qdrant", _url("/aliases"))
        for a in (registro.get("result") or {}).get("aliases", []):
            if a.get("alias_name") == apelido:
                anterior = a.get("collection_name")
    except net.UpstreamError:
        pass
    acoes = [{"create_alias": {"collection_name": para, "alias_name": apelido}}]
    net.request_json("qdrant", "POST", _url("/collections/aliases"), {"actions": acoes})
    return anterior


def apagar_colecao(nome: str) -> None:
    try:
        net.request_json("qdrant", "DELETE", _url(f"/collections/{nome}"), None)
    except net.UpstreamError:
        pass


# ─────────────────────────────────────────────────────────── o laço


def indexar(
    raiz: Optional[Path] = None,
    *,
    relatar: Callable[[Progresso], None] = lambda _: None,
    limite: Optional[int] = None,
) -> dict:
    """Constrói o índice do corpus e troca o apelido no fim. Devolve o resumo do que fez."""
    from fastembed import SparseTextEmbedding, TextEmbedding

    raiz = Path(raiz or config.get("CORPUS_ROOT")).expanduser().resolve()
    if not raiz.is_dir():
        raise ValueError(f"CORPUS_ROOT não é um diretório: {raiz}")
    apelido = config.get("QDRANT_COLLECTION")
    if not apelido:
        raise ValueError("sem QDRANT_COLLECTION — escolha o corpus antes de indexar")

    relatar(Progresso("varrendo", detalhe=str(raiz)))
    alvos = list(varrer(raiz))
    if limite:
        alvos = alvos[:limite]
    if not alvos:
        raise ValueError(f"nenhum arquivo admitido sob {raiz} — confira admissão e exclusões")

    # ☠️ **Apelido e coleção FÍSICA não podem disputar o mesmo nome.** O Qdrant recusa criar um
    # apelido que colida com uma coleção existente, e o erro dele não diz o que fazer. Isto acontece
    # de verdade ao migrar de um índice construído por fora, cujo nome era o da coleção real.
    # ⚠️ A pergunta é ao REGISTRO GLOBAL de apelidos, nunca ao `/collections/<nome>/aliases`: para
    # um APELIDO esse endpoint devolve lista VAZIA — o Qdrant resolve o apelido para achar a
    # coleção e depois lista os apelidos DELA, que não incluem o nome consultado. Medido, e o
    # efeito era um falso positivo que recusava justamente o REINDEX, o caso normal.
    try:
        existente = net.get_json("qdrant", _url(f"/collections/{apelido}"))
    except net.UpstreamError:
        existente = {}  # não existe: é o caso normal, e é o ÚNICO que este `except` deve cobrir
    if (existente.get("result") or {}).get("config") is not None:
        # ⚠️ Esta consulta fica FORA do `try` de propósito: englobá-la fazia uma falha de rede
        # aqui parecer "o apelido existe", e a guarda deixava passar o caso que ela vigia.
        registro = net.get_json("qdrant", _url("/aliases"))
        nomes = {a.get("alias_name") for a in (registro.get("result") or {}).get("aliases", [])}
        if apelido not in nomes:
            raise ValueError(
                f"`{apelido}` já existe como COLEÇÃO, não como apelido. Escolha outro nome em "
                f"QDRANT_COLLECTION, ou apague a coleção antiga — trocar o apelido por cima dela "
                f"é o que o Qdrant recusa."
            )

    relatar(Progresso("carregando modelos", total=len(alvos)))
    denso = TextEmbedding(model_name=config.get("EMBED_MODEL"))
    esparso = SparseTextEmbedding(model_name=config.get("SPARSE_MODEL"))
    dimensao = len(next(iter(denso.embed(["dimensão"]))))

    fisica = _fisica(apelido)
    criar_colecao(fisica, dimensao)

    carimbo = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    pontos: list[dict] = []
    enviados = arquivos_ok = ilegiveis = 0

    def descarregar():
        nonlocal pontos, enviados
        if not pontos:
            return
        net.request_json(
            "qdrant", "PUT", _url(f"/collections/{fisica}/points?wait=true"), {"points": pontos}
        )
        enviados += len(pontos)
        pontos = []

    for i, (rel, absoluto, _tamanho) in enumerate(alvos):
        try:
            texto = absoluto.read_text(encoding="utf-8", errors="strict")
        except (OSError, UnicodeDecodeError):
            # ⚠️ Contado e relatado, nunca engolido: um `continue` mudo é como raiz errada vira
            # "extração pobre" — o laço termina anunciando N/N com metade do corpus faltando.
            ilegiveis += 1
            continue
        fatias = fatiar(texto, rel)
        if not fatias:
            continue
        arquivos_ok += 1
        corpos = [f"{rel}{f' § {sec}' if sec else ''}\n\n{corpo}" for sec, corpo in fatias]
        vetores_d = list(denso.embed(corpos))
        vetores_e = list(esparso.embed(corpos))
        nome_denso = config.vector_name(config.get("EMBED_MODEL"))
        for k, (sec, _corpo) in enumerate(fatias):
            pontos.append(
                {
                    "id": ponto_id(rel, k),
                    "vector": {
                        nome_denso: [float(x) for x in vetores_d[k]],
                        config.SPARSE_VECTOR_NAME: {
                            "indices": [int(x) for x in vetores_e[k].indices],
                            "values": [float(x) for x in vetores_e[k].values],
                        },
                    },
                    "payload": {
                        "document": corpos[k],
                        "metadata": {
                            "source": rel,
                            "path": str(absoluto),
                            "file_name": absoluto.name,
                            "section": sec,
                            "chunk_index": k,
                            "indexed_at": carimbo,
                        },
                    },
                }
            )
        if len(pontos) >= LOTE:
            descarregar()
        relatar(Progresso("indexando", feitos=i + 1, total=len(alvos), detalhe=rel))

    descarregar()

    # ☠️ **Reconfere antes de trocar.** Se a configuração mudou no meio da corrida, trocar o
    # apelido CAPTURADO publicaria um céu que ninguém pediu — e a coleção que a tela agora nomeia
    # nunca teria sido criada. Abortar deixa a física órfã (recolhível), o que é reversível;
    # publicar o alvo errado não é.
    if config.get("QDRANT_COLLECTION") != apelido:
        raise ValueError(
            f"a coleção mudou durante a indexação ({apelido} → {config.get('QDRANT_COLLECTION')}); "
            f"nada foi publicado. A física `{fisica}` ficou órfã e pode ser apagada."
        )
    relatar(Progresso("trocando", detalhe=fisica))
    anterior = trocar_apelido(apelido, fisica)
    # ☠️ **A coleção ANTERIOR é recolhida, senão cada reindexação deixa um corpus inteiro em disco.**
    # Ela só sai DEPOIS da troca do apelido: até ali é ela que responde, e apagá-la antes seria
    # derrubar o céu para publicar o novo.
    if anterior and anterior != fisica:
        apagar_colecao(anterior)

    return {
        "raiz": str(raiz),
        "colecao": apelido,
        "fisica": fisica,
        "anterior": anterior,
        "arquivos": arquivos_ok,
        "pontos": enviados,
        "ilegiveis": ilegiveis,
        "indexed_at": carimbo,
    }


if __name__ == "__main__":
    import sys

    lim = int(sys.argv[sys.argv.index("--limite") + 1]) if "--limite" in sys.argv else None

    def mostrar(p: Progresso) -> None:
        if p.total:
            sys.stdout.write(f"\r  {p.fase}: {p.feitos}/{p.total}  {p.detalhe[:60]:<60}")
        else:
            sys.stdout.write(f"\r  {p.fase}: {p.detalhe[:70]:<70}")
        sys.stdout.flush()

    resumo = indexar(relatar=mostrar, limite=lim)
    print("\n" + json.dumps(resumo, indent=1, ensure_ascii=False))
