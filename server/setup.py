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
    }


def aplicar(patch: dict) -> dict:
    """Grava as chaves que a tela mandou. Raiz nova passa por `definir_corpus`, que deriva o resto."""
    if "CORPUS_ROOT" in patch:
        raiz = patch.pop("CORPUS_ROOT")
        config.definir_corpus(raiz)
    if patch:
        config.definir(patch)
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

    yield {"etapa": "invalidando", "movidos": invalidar_snapshots()}

    resumo = indexador.indexar(relatar=lambda p: relatar("indexando", p.detalhe))
    yield {"etapa": "indexado", **resumo}

    yield {"etapa": "rematerializando", "resultados": rematerializar(relatar)}
    yield {"etapa": "pronto", "raiz": raiz, "colecao": config.get("QDRANT_COLLECTION")}
