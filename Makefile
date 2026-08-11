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
.PHONY: ajuda leis leis-lista pixel pixel-gravar smoke hooks serve cerebro indexar reconfigurar rematerializar grafo snapshots conceitos censos fixture fixture-limpar tipos

# ⚠️ CRASE em receita de make é SUBSTITUIÇÃO DE COMANDO no shell — a primeira versão desta
# receita escreveu "o portão é `make leis`" e o `make ajuda` RODOU o portão inteiro para montar a
# própria mensagem de ajuda. É a armadilha nº 1 do repo (crase fechando o que não devia) noutra
# linguagem. Aqui e em toda receita: aspas simples, e nenhuma crase.
ajuda:  ## o que dá para rodar
	@printf 'SpatIA — tooling\n\n'
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'
	@printf '\n  \033[2mo portao e "make leis", e ele ja roda no pre-commit\033[0m\n'

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

serve:  ## sobe o servidor em 127.0.0.1:8787 (Qdrant 6333 · Neo4j 7474)
	@./serve.py

# ⚠️ Sozinho ele não muda nada: `server/llm.py` só é chamado com `BRAIN=ollama`, e o cérebro
# Ollama não tem ferramenta nenhuma. Ligar é decisão de quem opera, e são DUAS linhas no `.env`.
cerebro:  ## cérebro MLX local falando Ollama nativo, em 127.0.0.1:11500
	@./cerebro.py

# ─────────────────────────────────────────────────────── o corpus, do disco ao céu

# ⚠️ O indexador NUNCA escreve na coleção servida: ele constrói uma coleção física com carimbo e
# move o APELIDO no fim. Falha no meio não degrada o céu — o rollback é não trocar o apelido.
indexar:  ## (re)constrói o índice da raiz escolhida, em coleção nova + troca de apelido
	@uv run --with fastembed python -m server.indexador

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
conceitos:  ## os assuntos — inferência, não fato. Rode quando a PROSA mudar
	@node scripts/conceitos.mjs

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
