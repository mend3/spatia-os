#!/usr/bin/env python3
"""A LEI DA PRECEDÊNCIA — três camadas decidindo a mesma chave, e a ordem é auditável.

    python3 scripts/lei-config.py

## Por que ela existe

Esta base já pagou por DUAS fontes discordando sobre `AGENT_CWD` sem nada acusar: o perfil do
shell exportava uma árvore, o `.env` declarava outra, e a tela mostrava um corpus enquanto o
servidor lia outro. A camada de runtime (a UI) acrescenta uma TERCEIRA fonte para as mesmas
chaves — e uma terceira fonte sem ordem legível repete o defeito com mais um andar.

O que esta lei guarda:

1. a ordem é **UI > `.env` > default**, e vale nos dois sentidos (definir e remover);
2. **vazio é ESCOLHA, não ausência**, em qualquer camada — `CORPUS_PREFIX=` significa "sem
   prefixo", e cair no default apontaria o céu para caminhos que não existem no corpus;
3. `origem()` NOMEIA quem decidiu, porque precedência que ninguém consegue ler é folclore;
4. a UI só alcança o que o CATÁLOGO declara — chave de fora é RECUSADA, nunca ignorada em
   silêncio, e nunca gravada pela metade.

☠️ **Ele NÃO toca o `.cache/ambiente.json` de verdade.** O portão roda a cada commit; um oráculo
que escrevesse no arquivo do operador mudaria a configuração dele para provar um ponto. A loja é
desviada para um temporário, e o real é conferido intacto no fim.
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import config  # noqa: E402

VERDE, VERMELHO, FRACO, FIM = "\x1b[32m", "\x1b[31m", "\x1b[2m", "\x1b[0m"
falhas = 0


def checa(secao: str, cond: bool, frase: str) -> None:
    global falhas
    if cond:
        print(f"  {VERDE}✓{FIM} {FRACO}{secao}{FIM} {frase}")
    else:
        falhas += 1
        print(f"{VERMELHO}✗ {secao} {frase}{FIM}")


def main() -> int:
    real = config.RUNTIME_STORE
    antes = real.read_text(encoding="utf-8") if real.is_file() else None

    with tempfile.TemporaryDirectory() as tmp:
        config.RUNTIME_STORE = Path(tmp) / "ambiente.json"
        config._runtime = None

        do_env = config.get("AGENT_CWD")
        checa("§1", config.origem("AGENT_CWD") in ("env", "default"), "sem runtime, quem decide é o `.env` ou o default")

        config.definir({"AGENT_CWD": "/tmp/decidido-pela-ui"})
        checa("§1", config.get("AGENT_CWD") == "/tmp/decidido-pela-ui", "a UI vence o `.env`")
        checa("§3", config.origem("AGENT_CWD") == "ui", "e `origem` NOMEIA quem decidiu")

        config.definir({"CORPUS_PREFIX": ""})
        checa(
            "§2",
            config.get("CORPUS_PREFIX") == "" and config.origem("CORPUS_PREFIX") == "ui",
            "vazio na UI é ESCOLHA — não cai para o default",
        )

        config.definir({"AGENT_CWD": None})
        checa("§1", config.get("AGENT_CWD") == do_env, "remover do runtime devolve a palavra ao `.env`")
        checa("§3", config.origem("AGENT_CWD") != "ui", "e a origem deixa de ser `ui`")

        try:
            config.definir({"ESPATIAL_PORT": "9999"})
            checa("§4", False, "chave de bootstrap foi ACEITA pela UI")
        except ValueError as e:
            checa("§4", "ESPATIAL_PORT" in str(e), "chave de bootstrap é RECUSADA, e o erro a nomeia")
        gravado = json.loads(config.RUNTIME_STORE.read_text(encoding="utf-8"))
        checa("§4", "ESPATIAL_PORT" not in gravado, "e a recusa não grava nada pela metade")

        for proibida in config.SO_NO_ENV:
            checa(
                "§4",
                proibida not in config.CONFIGURAVEIS and proibida not in config.DERIVADAS,
                f"`{proibida}` fora do alcance da UI — a tela não pode mudar onde ela mesma é servida",
            )

        # §6 — a RAIZ é a escolha, e o resto é consequência dela.
        alvo = Path(tmp) / "corpus-de-prova"
        alvo.mkdir()
        escrito = config.definir_corpus(str(alvo))
        # ⚠️ Comparar contra o caminho RESOLVIDO: `definir_corpus` normaliza, e no macOS
        # `/var/folders/…` é link para `/private/var/folders/…`. Guardar o caminho não resolvido
        # faria duas grafias da MESMA pasta virarem dois corpora, cada uma com sua coleção.
        esperado = str(alvo.resolve())
        for derivada in config.DERIVADAS_DA_RAIZ:
            checa("§6", config.get(derivada) == esperado, f"`{derivada}` deriva da raiz, sem segunda escolha")
        checa("§6", config.get("CORPUS_PREFIX") == "", "indexando da raiz, não há recipiente a podar")
        checa("§6", escrito["QDRANT_COLLECTION"].startswith("spatia_"), "a coleção acompanha a raiz")
        gemea = Path(tmp) / "outra" / "corpus-de-prova"
        gemea.mkdir(parents=True)
        checa(
            "§6",
            config.colecao_de(alvo) != config.colecao_de(gemea),
            "duas pastas de mesmo NOME em lugares diferentes não colidem de coleção",
        )
        checa("§6", "AGENT_CWD" not in config.CONFIGURAVEIS, "`AGENT_CWD` deixou de ser escolha separada")

        # §7 — o que NÃO entra no índice. Duas listas, e só uma é editável.
        for caminho in ("espatial-os/CLAUDE.md", "docs/notas.md", "src/app/main.js"):
            checa("§7", config.indexavel(caminho), f"`{caminho}` entra")
        for caminho in (
            "repo/node_modules/three/index.js",
            "a/b/__pycache__/x.pyc",
            "app/package-lock.json",
            "app/pnpm-lock.yaml",
        ):
            checa("§7", not config.indexavel(caminho), f"`{caminho}` é ruído e fica fora")
        # ☠️ O piso de segredo: indexar põe o conteúdo no VETOR, e o que está no vetor volta
        # numa resposta. Estes não dependem da lista editável.
        for segredo in ("projeto/.env", "projeto/.env.local", "deploy/chave.pem", "home/.ssh/id_rsa"):
            checa("§7", not config.indexavel(segredo), f"`{segredo}` NUNCA entra")
        config.definir({"CORPUS_EXCLUDES": ""})
        checa(
            "§7",
            not config.indexavel("projeto/.env"),
            "esvaziar a lista de ruído NÃO derruba o piso de segredo",
        )
        checa("§7", config.indexavel("repo/node_modules/x.js"), "e esvaziá-la é ESCOLHA — o ruído passa a entrar")
        checa("§7", "CORPUS_EXCLUDES" in config.CONFIGURAVEIS, "a lista de ruído é editável pela tela")
        config.definir({"CORPUS_EXCLUDES": None})

        # §8 — ADMISSÃO: nomear o que entra, não listar o que não entra.
        KB = 1024
        for caminho in ("docs/notas.md", "infra/main.tf", "db/schema.sql", "app/Dockerfile", "Makefile"):
            checa("§8", config.admitido(caminho, 4 * KB), f"`{caminho}` entra")
        # ☠️ Código-fonte é FASE 2: declarado no módulo, fora do padrão.
        for fonte in ("app/main.py", "web/App.tsx", "lib/index.ts", "s/x.js"):
            checa("§8", not config.admitido(fonte, 4 * KB), f"`{fonte}` NÃO entra — código é outra fase")
        for grupo in config.CORPUS_ADMITE_CODIGO:
            if grupo in config.CORPUS_ADMITE_PADRAO:
                checa("§8", False, f"`{grupo}` vazou do grupo de código para o padrão")
                break
        else:
            checa("§8", True, "nenhuma extensão de código vazou para o padrão")

        # ☠️ Tipo admitido não é sinônimo de conhecimento: o teto corta o GERADO.
        checa("§8", not config.admitido("pkg/generated/index.d.ts", 15_000 * KB), "arquivo gigante fica fora")
        checa("§8", not config.admitido("specs/products.json", 6_500 * KB), "spec gerada de 6,5 MB fica fora")
        checa("§8", config.admitido("docs/longo.md", config.teto_bytes()), "exatamente no teto ainda entra")
        checa("§8", not config.admitido("docs/longo.md", config.teto_bytes() + 1), "um byte acima do teto, não")
        config.definir({"CORPUS_MAX_KB": "0"})
        checa("§8", config.admitido("docs/enorme.md", 99_000 * KB), "`0` remove o teto — e é ESCOLHA")
        config.definir({"CORPUS_MAX_KB": None})

        # A ordem importa: o piso de segredo vem ANTES do tipo e do tamanho.
        checa("§8", not config.admitido("projeto/.env", 1), "um `.env` minúsculo não entra por ser pequeno")
        for chave in ("CORPUS_ADMITE", "CORPUS_MAX_KB"):
            checa("§8", chave in config.CONFIGURAVEIS, f"`{chave}` é editável pela tela")

        checa(
            "§5",
            config.RUNTIME_STORE.name != "config.json",
            "a loja do runtime NÃO é o `config.json` das permissões — dois donos, um arquivo, é como um apaga o outro",
        )

    config.RUNTIME_STORE = real
    config._runtime = None
    depois = real.read_text(encoding="utf-8") if real.is_file() else None
    checa("§0", antes == depois, "o `ambiente.json` do operador ficou INTACTO")

    print(
        f"\n{VERDE}✓ a lei vale{FIM}  {FRACO}UI > .env > default, declarada e auditável{FIM}"
        if not falhas
        else f"\n{VERMELHO}✗ {falhas} falha(s){FIM}"
    )
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
