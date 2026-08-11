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


def _sem_leitores() -> bool:
    """Varre `server/` procurando quem ainda LEIA `AGENT_CWD`.

    ⚠️ A régua é a LEITURA (`config.get`), nunca a menção: comentários que explicam por que a
    chave morreu são justamente o que impede alguém de ressuscitá-la, e apagá-los para satisfazer
    um grep seria perder a refutação.
    """
    import re

    raiz = Path(__file__).resolve().parent.parent / "server"
    padrao = re.compile(r"""get\(\s*["'](AGENT_CWD|FILE_ROOTS|FILES_ROOT)["']\s*\)""")
    return not any(padrao.search(f.read_text(encoding="utf-8")) for f in raiz.glob("*.py"))


def main() -> int:
    real = config.RUNTIME_STORE
    antes = real.read_text(encoding="utf-8") if real.is_file() else None

    with tempfile.TemporaryDirectory() as tmp:
        config.RUNTIME_STORE = Path(tmp) / "ambiente.json"
        config._runtime = None

        do_env = config.get("QDRANT_URL")
        checa("§1", config.origem("QDRANT_URL") in ("env", "default"), "sem runtime, quem decide é o `.env` ou o default")

        config.definir({"QDRANT_URL": "http://decidido-pela-ui:6333"})
        checa("§1", config.get("QDRANT_URL") == "http://decidido-pela-ui:6333", "a UI vence o `.env`")
        checa("§3", config.origem("QDRANT_URL") == "ui", "e `origem` NOMEIA quem decidiu")

        config.definir({"CORPUS_PREFIX": ""})
        checa(
            "§2",
            config.get("CORPUS_PREFIX") == "" and config.origem("CORPUS_PREFIX") == "ui",
            "vazio na UI é ESCOLHA — não cai para o default",
        )

        config.definir({"QDRANT_URL": None})
        checa("§1", config.get("QDRANT_URL") == do_env, "remover do runtime devolve a palavra ao `.env`")
        checa("§3", config.origem("QDRANT_URL") != "ui", "e a origem deixa de ser `ui`")

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
        checa("§6", config.get("CORPUS_ROOT") == esperado, "a raiz é a escolha, e ela grava resolvida")
        # ☠️ **UMA raiz, e a lei conta.** Nome a mais para a mesma pasta é um lugar a mais onde ela
        # discorda de si mesma — a §6c confere que ninguém em `server/` ainda os LÊ.
        for extinta in ("AGENT_CWD", "FILE_ROOTS", "FILES_ROOT"):
            checa("§6", extinta not in config.DEFAULTS, f"`{extinta}` não existe mais")
            checa("§6", extinta not in config.CONFIGURAVEIS and extinta not in config.DERIVADAS,
                  f"e `{extinta}` não é configurável nem derivada")
        checa("§6", config.get("CORPUS_PREFIX") == "", "indexando da raiz, não há recipiente a podar")
        checa("§6", escrito["QDRANT_COLLECTION"].startswith("spatia_"), "a coleção acompanha a raiz")
        gemea = Path(tmp) / "outra" / "corpus-de-prova"
        gemea.mkdir(parents=True)
        checa(
            "§6",
            config.colecao_de(alvo) != config.colecao_de(gemea),
            "duas pastas de mesmo NOME em lugares diferentes não colidem de coleção",
        )
        # ☠️ §6c — `AGENT_CWD` está EXTINTO, não desligado. Ele era a segunda raiz, e a segunda
        # raiz é a causa raiz: `espatial-os/CLAUDE.md` resolvia para `devshell/CLAUDE.md`, com
        # leitura bem-sucedida e conteúdo de outra árvore. Enquanto a chave existir, alguém a lê.
        checa("§6c", "AGENT_CWD" not in config.DEFAULTS, "`AGENT_CWD` saiu dos defaults")
        checa("§6c", "AGENT_CWD" not in config.CONFIGURAVEIS and "AGENT_CWD" not in config.DERIVADAS,
              "e não é configurável nem derivada")
        checa("§6c", _sem_leitores(), "nenhum módulo de `server/` ainda LÊ as chaves extintas")

        # ☠️ §6b — SOBREVIVE A UM PROCESSO NOVO, e sem esta seção a lei é cega para uma classe
        # inteira: `definir` atualiza o cache em memória, então tudo acima passa mesmo com o LEITOR
        # descartando chaves. O defeito só aparece relendo o arquivo do zero.
        config._runtime = None
        for chave in ("CORPUS_ROOT",):
            checa("§6b", config.origem(chave) == "ui", f"`{chave}` sobrevive à releitura do arquivo")
        checa("§6b", config.get("CORPUS_PREFIX") == "" and config.origem("CORPUS_PREFIX") == "ui",
              "`CORPUS_PREFIX` derivado sobrevive à releitura")

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
        for caminho in ("docs/notas.md", "notas.txt", "app/Dockerfile", "Makefile", "LICENSE"):
            checa("§8", config.admitido(caminho, 4 * KB), f"`{caminho}` entra")
        # ☠️ **Só PROSA entra, e os outros dois grupos ficam DECLARADOS e desligados.**
        # `schema`, `config` e `infra` têm mediana de UM chunk: eles dobram a contagem de corpos
        # sem trazer massa, e `chunks` é o eixo que decide CLASSE — metade do céu vira asteroide e
        # o porte "gigante" desaparece junto com o fenômeno que dele depende.
        for fora in ("db/schema.sql", "infra/main.tf", "k8s/values.yaml", "pkg/tsconfig.json"):
            checa("§8", not config.admitido(fora, 4 * KB), f"`{fora}` NÃO entra — estrutura é outra fase")
        for fonte in ("app/main.py", "web/App.tsx", "lib/index.ts", "s/x.js"):
            checa("§8", not config.admitido(fonte, 4 * KB), f"`{fonte}` NÃO entra — código é outra fase")
        vazados = [
            e
            for grupo in (config.CORPUS_ADMITE_CODIGO, config.CORPUS_ADMITE_ESTRUTURA)
            for e in grupo
            if e in config.CORPUS_ADMITE_PADRAO
        ]
        checa("§8", not vazados, f"nenhum grupo desligado vazou para o padrão{f' — {vazados}' if vazados else ''}")

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
