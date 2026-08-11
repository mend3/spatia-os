#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11"
# ///
"""SMOKE — o setup do ambiente conferido contra o servidor VIVO.

    ./smoke.py                 # exige `make serve` no ar

## Por que ele não é uma lei

`scripts/lei-config.py` prova a precedência com o módulo em memória: é lógica pura, roda offline e
entra no portão. Isto aqui prova outra coisa — que a rota existe, que ela recusa o que deve recusar
e que o valor atravessa HTTP até voltar mudado. Precisa do servidor de pé.

☠️ **E ele MUTA a configuração do operador.** É por isso que mora na raiz, ao lado do `serve.py`:
`leis.mjs` roda tudo o que está em `scripts/`, e um smoke que reescreve o `ambiente.json` a cada
commit trocaria o corpus de quem só queria commitar. Ele guarda o estado antes e devolve no fim,
inclusive quando falha.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8787"
VERDE, VERMELHO, AMARELO, FRACO, FIM = "\x1b[32m", "\x1b[31m", "\x1b[33m", "\x1b[2m", "\x1b[0m"
falhas = 0


def checa(nome: str, cond: bool, detalhe: str = "") -> bool:
    global falhas
    if cond:
        print(f"  {VERDE}✓{FIM} {nome} {FRACO}{detalhe}{FIM}")
    else:
        falhas += 1
        print(f"{VERMELHO}✗ {nome} {detalhe}{FIM}")
    return cond


def pedir(metodo: str, caminho: str, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(
        f"{BASE}{caminho}",
        data=dados,
        method=metodo,
        headers={
            "Content-Type": "application/json",
            # A rota exige mesma origem — sem isto ela recusa com 403, e o smoke mediria a guarda
            # em vez do que veio testar.
            "Sec-Fetch-Site": "same-origin",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main() -> int:
    try:
        urllib.request.urlopen(f"{BASE}/api/health", timeout=5)
    except Exception:
        print(f"{VERMELHO}servidor fora do ar em {BASE}{FIM} — suba com `make serve`.")
        return 1

    print(f"\x1b[1mSMOKE — setup do ambiente{FIM}\n")

    # ── 1. o estado se descreve, com a ORIGEM de cada chave
    status, estado = pedir("GET", "/api/setup")
    checa("GET /api/setup responde", status == 200, f"status={status}")
    chaves = estado.get("chaves", {})
    checa("descreve chaves configuráveis", bool(chaves), f"{len(chaves)} chaves")
    checa(
        "toda chave declara a ORIGEM",
        bool(chaves) and all("origem" in v for v in chaves.values()),
        "sem isso a precedência é folclore",
    )
    checa(
        "a precedência é declarada",
        estado.get("precedencia") == ["ui", "env", "default"],
        str(estado.get("precedencia")),
    )
    checa(
        "bootstrap fica fora do alcance da tela",
        set(estado.get("so_no_env", [])) == {"ESPATIAL_HOST", "ESPATIAL_PORT"},
        str(estado.get("so_no_env")),
    )
    checa(
        "código-fonte declarado e DESLIGADO",
        estado.get("codigo_fonte", {}).get("admitido") is False
        and len(estado.get("codigo_fonte", {}).get("extensoes", [])) > 10,
        "fase 2, nomeado e não admitido",
    )
    checa("o piso de segredo é publicado", ".env" in estado.get("nunca", []), "")

    # ── 2. o seletor de diretório é do SERVIDOR
    status, dirs = pedir("GET", "/api/setup/dirs")
    checa("GET /api/setup/dirs lista o HOME", status == 200 and "entradas" in dirs, f"status={status}")
    entradas = dirs.get("entradas", [])
    # ☠️ `all()` de lista VAZIA é VERDADEIRO. Sem exigir população, estas duas linhas afirmariam
    # sobre um seletor que não devolveu nada — o mesmo "cabeçalho afirma, carga vazia" que este
    # smoke existe para pegar. Visto passar verde com o endpoint em 500.
    checa("o seletor devolveu população", len(entradas) > 0, f"{len(entradas)} diretórios")
    checa(
        "cada entrada traz caminho ABSOLUTO",
        bool(entradas) and all(e["caminho"].startswith("/") for e in entradas),
        "",
    )
    checa("e diz se é legível", bool(entradas) and all("legivel" in e for e in entradas), "")
    status, fundo = pedir("GET", "/api/setup/dirs?" + urllib.parse.urlencode({"path": "/nao/existe/mesmo"}))
    checa("caminho inexistente ACUSA em vez de sumir", bool(fundo.get("erro")), fundo.get("erro", "")[:40])

    # ── 3. a prévia decide a escolha ANTES de indexar
    status, previa = pedir("GET", "/api/setup/prever?" + urllib.parse.urlencode({"path": "docs"}))
    if status != 200:
        status, previa = pedir(
            "GET", "/api/setup/prever?" + urllib.parse.urlencode({"path": str(__file__).rsplit("/", 1)[0] + "/docs"})
        )
    checa("GET /api/setup/prever conta antes de indexar", status == 200 and previa.get("admitidos", 0) > 0,
          f"{previa.get('admitidos')} admitidos · {previa.get('mb')} MB")
    checa("e separa o que foi descartado", "descartados" in previa, f"{previa.get('descartados')} fora")

    # ── 4. a escrita atravessa, e a recusa NOMEIA a chave
    antes = chaves.get("CORPUS_EXCLUDES", {}).get("valor", "")
    origem_antes = chaves.get("CORPUS_EXCLUDES", {}).get("origem")
    try:
        status, depois = pedir("POST", "/api/setup", {"CORPUS_EXCLUDES": "node_modules,__smoke__"})
        checa("POST grava e devolve o estado novo", status == 200, f"status={status}")
        agora = depois.get("chaves", {}).get("CORPUS_EXCLUDES", {})
        checa("o valor atravessou", "__smoke__" in agora.get("valor", ""), agora.get("valor", "")[:40])
        checa("e a origem virou `ui`", agora.get("origem") == "ui", str(agora.get("origem")))

        status, erro = pedir("POST", "/api/setup", {"ESPATIAL_PORT": "9999"})
        checa("chave de bootstrap é RECUSADA", status == 400, f"status={status}")
        checa("e a recusa NOMEIA a chave", "ESPATIAL_PORT" in str(erro.get("error", "")), str(erro.get("error"))[:60])

        status, ainda = pedir("GET", "/api/setup")
        checa(
            "a recusa não gravou nada pela metade",
            ainda["chaves"]["ESPATIAL_PORT"]["valor"] != "9999" if "ESPATIAL_PORT" in ainda["chaves"] else True,
            "",
        )
    finally:
        # ⚠️ Devolve o estado mesmo se algo acima estourou: um smoke que deixa resíduo é pior que
        # um smoke que não roda — o operador fica com uma configuração que ele não escolheu.
        pedir("POST", "/api/setup", {"CORPUS_EXCLUDES": antes if origem_antes == "ui" else None})
        _, final = pedir("GET", "/api/setup")
        restaurado = final["chaves"]["CORPUS_EXCLUDES"]
        checa(
            "estado do operador RESTAURADO",
            restaurado.get("origem") == origem_antes and restaurado.get("valor") == antes,
            f"origem={restaurado.get('origem')}",
        )

    print(
        f"\n{VERDE}✓ o setup responde{FIM}"
        if not falhas
        else f"\n{VERMELHO}✗ {falhas} falha(s){FIM}"
    )
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
