# O tooling do SpatIA — um lugar só, e nenhuma dependência.
#
# ⚠️ **Por que `make` e não `package.json`:** metade deste tooling é Python (`serve.py`,
# `fixture.py`, `motivo-upstream.py`, `server/lei_fio.py`), então npm seria um gerente de pacotes
# fazendo de despachante para outra linguagem. E `package.json` tem dois efeitos colaterais que este
# repo não quer: ele passa a decidir o `type` de TODO `.js` (os oráculos importam `src/**/*.js`, que
# hoje o Node resolve por detecção de sintaxe), e `npm install` PODA pacote fora do lockfile — o
# `node_modules/three` daqui é escrito à mão pelo `censo-planetas.mjs`, não instalado.
#
# `make` não muda como um arquivo é interpretado. É despachante, e só.

.DEFAULT_GOAL := ajuda
.PHONY: ajuda ordem leis leis-lista pixel pixel-gravar smoke hooks serve ambiente cerebro up down speech \
        app docker-env ollama-cpu ollama-gpu searxng-settings neo4j-auth docker-ok indexar reconfigurar rematerializar \
        grafo snapshots conceitos censos fixture fixture-limpar tipos

# ⚠️ CRASE em receita de make é SUBSTITUIÇÃO DE COMANDO no shell — a primeira versão desta
# receita escreveu "o portão é `make leis`" e o `make ajuda` RODOU o portão inteiro para montar a
# própria mensagem de ajuda. É a armadilha nº 1 do repo (crase fechando o que não devia) noutra
# linguagem. Aqui e em toda receita: aspas simples, e nenhuma crase.
ajuda:  ## o que dá para rodar
	@printf 'SpatIA — tooling\n\n'
	@grep -E '^[a-z][a-z0-9-]*:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'
	@printf '\n  \033[2mo portao e "make leis", e ele ja roda no pre-commit\033[0m\n'
	@printf '  \033[2m"make ordem" diz o que ja vem encadeado e o que voce dispara\033[0m\n'

# ⭑ **O que este alvo responde é QUANDO disparar, que é a única parte que não sai de uma medida.**
# A ORDEM entre scripts é derivada do fonte por `scripts/lei-tooling.mjs` e imposta nas receitas; o
# que roda no portão sai de `make leis-lista`, medido. Transcrever qualquer um dos dois aqui criaria
# a segunda fonte que os dois existem para evitar — então isto aponta, e descreve só o gatilho.
ordem:  ## o que ja vem encadeado, e o que so roda quando voce manda
	@printf '\n\033[1mENCADEADO — uma receita, na ordem que a lei deriva do fonte\033[0m\n'
	@printf '  make indexar         indexa + rematerializa. A consequencia vem junto.\n'
	@printf '  make reconfigurar    RAIZ=/caminho. Troca o corpus INTEIRO: invalida, indexa, rematerializa.\n'
	@printf '  make rematerializar  grafo (escreve no Neo4j) -> snapshots (leem dele).\n'
	@printf '  make serve           deriva a plataforma, sobe a infra, roda o servidor nativo.\n'
	@printf '  make app             gera o .env do conteiner, sobe o SpatIA em conteiner.\n'
	@printf '  make leis            todos os guardas. Ja roda no pre-commit.\n'
	@printf '\n\033[1mVOCE DISPARA — e o motivo de nao ser encadeavel\033[0m\n'
	@printf '  make conceitos       inferencia, nao fato. QUANDO: a prosa mudou.\n'
	@printf '                       Custa uma chamada de modelo por arquivo de prosa.\n'
	@printf '  make censos          relatorio, nao muda nada. QUANDO: mexeu em limiar ou constante calibrada.\n'
	@printf '  make relatorio       MEDE e reescreve docs/relatorio.md. QUANDO: reindexou, ou trocou de corpus.\n'
	@printf '                       Exige "make serve" no ar — o relatorio descreve o ceu SERVIDO.\n'
	@printf '  make pixel           exige "make serve" no ar e sobe um Chrome (~15 s). QUANDO: mexeu em shader ou pele.\n'
	@printf '  make smoke           exige "make serve" no ar e MUTA a config (grava e restaura).\n'
	@printf '                       QUANDO: mexeu em configuracao, raiz ou indexador.\n'
	@printf '  make tipos           exige npx e rede. QUANDO: mexeu em JSDoc ou suspeita de assinatura mentindo.\n'
	@printf '  make fixture         APAGA e recria o corpus sintetico (ha rmtree). QUANDO: precisa de um corpo\n'
	@printf '                       que o corpus real nao produz. Coleccao PROPRIA — nunca por cima do ceu servido.\n'
	@printf '  make speech          baixa ~2 GB. QUANDO: quer a voz.\n'
	@printf '  make ollama-cpu      cerebro em conteiner. QUANDO: nao ha Ollama nativo. Suba UM dos dois.\n'
	@printf '  make ollama-gpu      idem, com NVIDIA (Linux/Windows). No macOS nao ha passagem de GPU.\n'
	@printf '  make cerebro         modelo MLX nativo. QUANDO: macOS com Apple Silicon.\n'
	@printf '  make hooks           UMA vez por clone.\n'
	@printf '  make up              so as memorias e a busca. QUANDO: quer a infra sem o servidor.\n'
	@printf '  make down            para tudo SEM apagar dado (os volumes ficam).\n'
	@printf '  make fixture-limpar  apaga o repo sintetico E a coleccao dele.\n'
	@printf '  make pixel-gravar    REGRAVA a linha de base do pixel. E DECISAO, nunca conserto:\n'
	@printf '                       regravar para calar a lei e baixar o limiar ate passar.\n'
	@printf '\n\033[1mDEGRAUS INTERNOS — outro alvo ja os roda; solto e o que a cadeia evita\033[0m\n'
	@printf '  make grafo           so a fase de ESCRITA no Neo4j. Sem os snapshots depois, a rede le o velho.\n'
	@printf '  make snapshots       so a fase de LEITURA. Sem o grafo antes, le uma topologia que nao existe mais.\n'
	@printf '  make ambiente        detecta a plataforma e sobe o perfil. Ja vem no "make serve".\n'
	@printf '  make docker-env      deriva o .env do conteiner. Ja vem no "make app".\n'
	@printf '  make searxng-settings  gera o settings do searxng. Ja vem no "make up" e no "make app".\n'
	@printf '  make neo4j-auth      gera a credencial do Neo4j no .env. Ja vem no "make up"/"serve"/"app".\n'
	@printf '  make docker-ok       confere o daemon do Docker. Ja vem no "make up"/"serve"/"app".\n'
	@printf '\n  \033[2ma ordem entre scripts e DERIVADA: node scripts/lei-tooling.mjs\033[0m\n'
	@printf '  \033[2mo que roda no portao e MEDIDO: make leis-lista\033[0m\n\n'

# ─────────────────────────────────────────────────────────────────────── o portão

leis:  ## ☠️ TODOS os guardas, ~4 s. Sai 1 se qualquer um cair
	@node scripts/leis.mjs

leis-lista:  ## o que roda, e o que NÃO roda com o motivo medido
	@node scripts/leis.mjs --lista

# ☠️ FORA do portão de propósito, e a razão é CUSTO DE ADMISSÃO, não desconfiança: ela sobe um
# Chrome headless (~15 s) e exige o `serve.py` no ar. `make leis` roda a cada commit em ~5 s, e
# essa propriedade vale mais — é a mesma decisão que deixou `make tipos` de fora.
pixel:  ## o QUADRO desenhado, na bancada. Exige `make serve` no ar
	@node scripts/lei-pixel.mjs

# ☠️ FORA do portão e fora de `scripts/`: ele MUTA a configuração do operador (grava e restaura) e
# exige o servidor no ar. Em `scripts/` o portão o rodaria a cada commit, trocando o corpus de quem
# só queria commitar.
smoke:  ## confere o setup contra o servidor VIVO. Exige `make serve` no ar
	@./smoke.py

hooks:  ## aponta o git para os hooks VERSIONADOS de .githooks/
	@git config core.hooksPath .githooks
	@chmod +x .githooks/*
	@if [ -e .git/hooks/pre-commit ]; then \
	  echo "⚠️  .git/hooks/pre-commit existe e agora é IGNORADO (core.hooksPath vence)."; \
	  echo "    Ele é resto da instalação antiga — apague-o: rm .git/hooks/pre-commit"; \
	fi
	@echo "✓ core.hooksPath = .githooks  (pre-commit · post-checkout)"

# ─────────────────────────────────────────────────────────────────────── rodar

# ⚠️ Este alvo sobe só as MEMÓRIAS e a busca. O servidor tem alvo PRÓPRIO e é escolha: `make serve`
# (nativo) ou `make app` (contêiner). Os dois na mesma porta — nunca juntos.
# ☠️ `searxng-settings` é PRÉ-REQUISITO, não conveniência: o bind-mount do searxng precisa do
# arquivo existindo, e esquecer disso produz um erro que não aponta para a causa.
up: docker-ok searxng-settings neo4j-auth  ## sobe as memórias e a busca, em loopback
	@docker compose up -d
	@docker compose ps

searxng-settings:  ## gera .docker/searxng/settings.yml com um secret novo (idempotente)
	@./scripts/setup-searxng-settings.sh

# ☠️ Sem ele um clone limpo não sobe: o compose exige a credencial e o `.env.example` não pode
# trazê-la escrita — um default viraria a senha real de todo clone que não a trocou.
neo4j-auth:  ## cria a credencial do Neo4j no .env se não houver (idempotente)
	@./scripts/setup-neo4j-auth.sh

# ☠️ PRIMEIRO de todos os pré-requisitos de contêiner: sem daemon, o erro fala de socket e não do
# SpatIA, no meio de um `make serve`.
docker-ok:  ## confere que o Docker existe e responde, com a instrução da sua plataforma
	@./scripts/checar-docker.sh

# ⚠️ Fora do `up` de propósito: a imagem baixa ~2 GB e carrega os modelos no boot.
speech:  ## sobe a voz (Kokoro TTS) — opt-in, ~2 GB
	@docker compose --profile speech up -d tts

# ☠️ Opt-in porque `make serve` roda o MESMO servidor nativo na MESMA porta — subir os dois é uma
# porta com dois donos. Escolha um.
app: docker-ok searxng-settings neo4j-auth docker-env  ## sobe o SpatIA em contêiner (127.0.0.1:8787) + as memórias
	@docker compose --profile app up -d --build
	@docker compose --profile app ps

docker-env:  ## deriva .docker/spatia.env do .env (endereços da rede do compose)
	@./scripts/setup-docker-env.sh

# ☠️ Suba UM dos dois: eles dividem o volume de modelos e a porta.
ollama-cpu:  ## cérebro offline em contêiner, CPU — funciona em Linux, macOS e Windows
	@docker compose --profile ollama-cpu up -d ollama-cpu

# ⚠️ Linux e Windows (WSL2) com NVIDIA. No macOS o Docker não passa GPU — use `make cerebro`.
ollama-gpu:  ## cérebro offline em contêiner, NVIDIA
	@docker compose --profile ollama-gpu up -d ollama-gpu

down:  ## para as memórias SEM apagar dado (os volumes ficam)
	@docker compose down

# ⭑ Ele DERIVA o ambiente antes: detecta a plataforma, decide o perfil do cérebro e sobe a infra.
# ☠️ Nunca o perfil `app` — aquele é o servidor em contêiner, e este alvo roda o NATIVO na mesma porta.
serve: ambiente  ## sobe o servidor em 127.0.0.1:8787, com a infra que esta máquina pede
	@./serve.py

ambiente: docker-ok searxng-settings neo4j-auth  ## detecta a plataforma e sobe o perfil de infra adequado (idempotente)
	@./scripts/setup-ambiente.sh

# ⚠️ Sozinho ele não muda nada: `server/llm.py` só é chamado com `BRAIN=ollama`, e o cérebro
# Ollama não tem ferramenta nenhuma. Ligar é decisão de quem opera, e são DUAS linhas no `.env`.
cerebro:  ## cérebro MLX local falando Ollama nativo, em 127.0.0.1:11500
	@./cerebro.py

# ─────────────────────────────────────────────────────── o corpus, do disco ao céu

# ⚠️ O indexador NUNCA escreve na coleção servida: ele constrói uma coleção física com carimbo e
# move o APELIDO no fim. Falha no meio não degrada o céu — o rollback é não trocar o apelido.
# ☠️ **A REMATERIALIZAÇÃO VEM JUNTO, e é por isso que ela está DENTRO da receita.** Indexar troca o
# apelido para uma coleção com carimbo NOVO; grafo e snapshots continuam carimbados com o corpus
# ANTERIOR, e o servidor recusa o que não é do céu servido. O sintoma não é erro: é o céu perdendo
# vínculo, centralidade, conectividade e vizinhança de uma vez, com `disponivel: false` num canto.
# ⚠️ O caminho da TELA (`setup.indexar_em_fundo`) já roda a cadeia inteira — este alvo existe para
# ter a mesma consequência, senão o atalho do terminal deixa o sistema num estado que a tela nunca
# produz.
indexar:  ## (re)constrói o índice + rematerializa o grafo (a consequência vem junto)
	@uv run --with fastembed python -m server.indexador
	@$(MAKE) --no-print-directory rematerializar

# ⭑ A troca INTEIRA: escolhe a raiz, invalida o que descrevia o corpus velho, indexa e
# rematerializa o grafo na ordem medida. `RAIZ=/caminho make reconfigurar`.
reconfigurar:  ## troca o corpus: RAIZ=/caminho make reconfigurar
	@test -n "$(RAIZ)" || { echo 'faltou RAIZ=/caminho'; exit 1; }
	@uv run --with fastembed python -c "import sys;sys.path.insert(0,'.');from server import setup;	[print(e) for e in setup.reconfigurar('$(RAIZ)')]"

# ─────────────────────────────────────────────────────── materializar o que a rede lê

# ☠️ A ORDEM É OBRIGATÓRIA, e ela mora aqui em vez da memória de quem roda: a rede lê o SNAPSHOT,
# não o banco. Fora de ordem os arquivos saem coerentes entre si e ERRADOS quanto ao grafo.
#
# ⚠️ A ordem NÃO é mantida à mão. `scripts/lei-tooling.mjs` a DERIVA do fonte — quem lê um
# `.cache/X.json` depende de quem o escreve, quem lê o grafo depende de quem escreve nele — e
# reprova a receita que chame um dependente antes da dependência, ou sem ela. Script novo entra na
# sequência porque a lei recusa deixá-lo órfão.

rematerializar: grafo snapshots  ## ☠️ a cadeia INTEIRA, do grafo aos snapshots. É este o comando
	@echo "✓ topologia e snapshots rematerializados. \`conceitos\` fica de fora — ver \`make conceitos\`."

# As duas fases são ESCREVER no grafo e LER dele — e é isso que decide em qual cada script entra,
# não o que ele produz. `uso` materializa `.cache/uso.json` E dá `MERGE` em `Astro`/`Run`/`Agent`:
# escrever no grafo o põe na primeira fase, senão quem lê o grafo lê sem as execuções.
grafo:  ## escreve a topologia no Neo4j (vinculos · similares · citacoes · uso)
	@node scripts/vinculos.mjs
	@node scripts/similares.mjs
	@node scripts/citacoes.mjs
	@node scripts/uso.mjs

# ⚠️ `centralidade` ANTES de `conectividade`: o segundo lê `.cache/influencia.json` e SAI 1 sem ele
# — a pergunta dele é se a dimensão nova REPETE a velha, e sem a velha não há com o que comparar.
snapshots:  ## rematerializa .cache/ na ordem medida (centralidade → vizinhanca → conectividade)
	@node scripts/centralidade.mjs
	@node scripts/vizinhanca.mjs
	@node scripts/conectividade.mjs

# ⚠️ Fora da cadeia de propósito: é a única dimensão que NÃO é fato, e só se roda quando a prosa
# muda. Entrar no `rematerializar` a faria reescrever inferência a cada topologia nova.
# ⭑ **E sair da cadeia é SEGURO por medida, não por convenção:** ele grava só arestas `:ABOUT`, e
# nenhum leitor de snapshot as consome — `centralidade` lê `SIMILAR_TO|CO_EDITED`, `conectividade` e
# `vizinhanca` leem essas duas mais `REFERENCES|IMPORTS`. Rodá-lo depois não envelhece snapshot
# nenhum. ⚠️ Quem acrescentar `:ABOUT` a um desses leitores traz `conceitos` para dentro da cadeia.
conceitos:  ## os assuntos — inferência, não fato. Rode quando a PROSA mudar
	@node scripts/conceitos.mjs

# ⚠️ Ele ESCREVE um arquivo versionado, então fica fora do portão — e a medida de efeito colateral
# do `leis.mjs` o reconhece pelo que ele FAZ, não por constar de uma lista.
relatorio:  ## MEDE o corpus servido e reescreve docs/relatorio.md. Exige `make serve` no ar
	@node scripts/relatorio.mjs

censos:  ## o que o céu DESENHA e o que o corpus É — inclui a saúde das constantes calibradas
	@node scripts/censo-corpus.mjs
	@node scripts/censo-morfologias.mjs
	@node scripts/censo-ontologia.mjs
	@echo "⚠️  censo-superficies e censo-planetas são GUARDAS: rodam em \`make leis\`."

# ─────────────────────────────────────────────────────────────────────── o corpus de prova

# ⚠️ `FIXTURE_ROOT` explícito é hábito, não paranoia: há `rmtree` no fixture.py.
fixture:  ## cria e indexa o corpus sintético que exercita todos os kind
	@FIXTURE_ROOT=$${FIXTURE_ROOT:-$$HOME/workspace/espatial-fixtures} \
	  uv run --with fastembed python scripts/fixture.py

# ─────────────────────────────────────────────────────────────────── os tipos, e é CENSO
#
# ⚠️ **Fora do portão, e é medida — não lei.** `leis.mjs` varre `scripts/` INTEIRO, então um guarda
# ali dentro faria `make leis` inteiro depender de `npx` e de rede. O portão roda offline em ~4 s, e
# essa propriedade vale mais do que ter isto dentro dele.
#
# `tsc` confere JS por JSDoc e pega a classe que nenhum oráculo alcança: documentação que MENTE
# sobre a própria assinatura, nome de propriedade trocado, contagem de argumento errada.
#
# ⚠️ **`vendor/` sai do relatório.** O TS segue import e entra no `jsm/` mesmo com ele no `exclude`;
# são ~19 diagnósticos sobre código que este repo não mantém e que abafariam os nossos.
# ☠️ **A PRIMEIRA versão desta receita relatou "0 diagnosticos" com o tsc NAO tendo rodado.**
# `npx -y typescript@5 tsc` falha ("could not determine executable to run") — o pacote precisa vir
# em `-p`. O `grep -c` sobre a saida de erro devolvia 0, e zero-porque-nao-mediu e zero-porque-esta-
# limpo saiam identicos. E `null` != `0` aplicado ao proprio relatorio, e o pior padrao que existe
# nesta base: o cabecalho AFIRMA e a carga esta vazia. A receita agora RECUSA relatar sem medir.
tipos:  ## confere os tipos por JSDoc (tsc --checkJs). MEDIDA, não lei — fora do portão
	@npx -y -p typescript@5 tsc --version > /dev/null 2>&1 \
	  || { printf '\033[31mnao medi\033[0m: tsc indisponivel (npx -p typescript@5). Sem rede?\n'; exit 1; }
	@npx -y -p typescript@5 tsc -p tsconfig.json 2>&1 | grep -v '^vendor/' > /tmp/spatia-tipos.txt || true
	@printf 'diagnosticos em src/: %s\n\n' "$$(grep -c 'error TS' /tmp/spatia-tipos.txt || true)"
	@grep -oE 'error TS[0-9]+' /tmp/spatia-tipos.txt | sort | uniq -c | sort -rn | head -12
	@printf '\n  \033[2mrelatorio completo em /tmp/spatia-tipos.txt\033[0m\n'

fixture-limpar:  ## apaga o repositório do fixture e a coleção
	@FIXTURE_ROOT=$${FIXTURE_ROOT:-$$HOME/workspace/espatial-fixtures} \
	  uv run --with fastembed python scripts/fixture.py --limpar

pixel-gravar:  ## regrava a linha de base do quadro. DECISÃO, não conserto — justifique no commit
	@node scripts/lei-pixel.mjs --gravar
