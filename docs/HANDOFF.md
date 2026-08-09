# Handoff — SpatIA · `main`

> **O que é preciso saber para dar o próximo passo, e nada além disso.** Este arquivo é o PRESENTE:
> em que ambiente se mede, o que está em voo agora, e por onde continuar. **A história vive no
> `git log`** — os corpos de commit desta base são longos de propósito, com a medida que decidiu
> cada número.
>
> ⚠️ **Se o texto vale igual daqui a dez sessões, ele NÃO é handoff.** Lei, doutrina, armadilha e
> número medido são duráveis e moram em outro lugar — o §3 diz qual. Handoff que acumula durável
> deixa de ser lido.
>
> ⭑ **O par deste arquivo é [`roadmap.md`](./roadmap.md), e os dois mudam JUNTOS.** Ele responde
> *"para onde, em que ordem, e o que cada peça destrava"*; este responde *"em que ambiente se mede e
> o que está em voo"*. **Item aberto vive LÁ, como tarefa** — anotá-lo aqui cria a segunda cópia, e
> a que alguém ler primeiro decide por acaso.

---

## 0. ⚠️ AMBIENTE — confira ANTES de medir qualquer coisa

O `.env` é a verdade; isto aqui é lembrança. Um censo rodado contra o corpus errado responde com
convicção total sobre um céu que ninguém está vendo.

```bash
grep -E 'AGENT_CWD|QDRANT_COLLECTION|CORPUS_PREFIX' .env    # a verdade
echo $AGENT_CWD                                             # o primeiro diagnóstico de "corpus vazio"
```

☠️ **Três variáveis estão EXPORTADAS no perfil do shell e apontam para lugares que não existem**
(`AGENT_CWD=devshell-one`, `QDRANT_COLLECTION=workspace_embedding`, `CORPUS_PREFIX=vault/`). Elas
vencem o servidor e produzem **zero com cara de medida** — um relatório inteiro certo, menos a
premissa. Os scripts atuais conferem ou ignoram o override; **script novo precisa da mesma guarda.**

⚠️ **`.env` (arquivo) vence o ambiente.** `VAR=x ./serve.py` só funciona se a chave não estiver lá.

| corpus | coleção | `AGENT_CWD` | tamanho | para quê |
|---|---|---|---|---|
| **fixture** *(ativo hoje)* | `espatial_fixture` | `~/workspace/espatial-fixtures` | **72 corpos · 20 sistemas** (09/08) | CAPACIDADE — todos os `kind`, exercita `untracked`/`staged` e as 11 morfologias |
| vivo | `espatial_vivo` | o próprio projeto | 188 corpos · 191 arq | COMPORTAMENTO — o `git status` casa com os nós por construção |
| real | `workspace_embedding` | `~/workspace/devshell` (prefixo `vault/`) | 1.432 arq | ZERO código; e **não tem anel** (os sujos não estão indexados) |

☠️ **Só existe `.cache/env.fixture.bak`** — confira com `ls .cache/env.*.bak` antes de contar com um
backup. Trocar de corpus é **guardar o `.env` atual primeiro**, editar as três chaves à mão (a tabela
acima tem os valores) e **REINICIAR o servidor**. Recriar o fixture:
`FIXTURE_ROOT=~/workspace/espatial-fixtures uv run --with fastembed python scripts/fixture.py`
(⚠️ há `rmtree` em `fixture.py` — passar `FIXTURE_ROOT` explícito é hábito, não paranoia).

⚠️ **A coleção precisa de DOIS vetores nomeados** (denso `fast-<modelo>` + esparso `bm25` com
`modifier: idf`) — declarar só um derruba a busca inteira.

⚠️ **Um corpus jovem esconde toda regra que depende de janela antiga.** O fixture pegou um `if` que
devolvia 188 de 188 no vivo e ZERO nele — por IDADE do repositório, não por atividade. Rode os censos
nos **dois** corpora antes de acreditar em qualquer distribuição.

---

## 1. Rodar, e o portão

O produto é **SpatIA** (`Espatial OS` está aposentado; o diretório em disco continua `espatial-os` de
propósito). A janela de depuração é **`window.spatia`**.

```bash
make            # o que dá para rodar — o tooling inteiro está no Makefile
make hooks      # UMA vez por clone: o git passa a usar os hooks VERSIONADOS de .githooks/
make serve      # 127.0.0.1:8787 · Qdrant 6333 · Neo4j 7474
make leis       # ☠️ o portão. Já roda no pre-commit
```

Abra, clique em **IGNORAR** na tela de boot (obrigatório depois de TODO reload, senão ela fica por
cima e as sondas devolvem `null`).

**O portão é um só.** `node scripts/leis.mjs` roda todos os guardas em ~4 s e sai 1 se qualquer um
cair. ⚠️ **Quantos são sai do próprio comando**, nunca deste parágrafo — guarda novo entra sozinho, e
quem NÃO roda é MEDIDO (efeito colateral), não declarado à mão. Está no `pre-commit`; clone novo pede
**`make hooks`** (aponta o git para `.githooks/`, que é versionado — `.git/hooks/` não é).

**Rematerialização — `make rematerializar`.** A rede lê o SNAPSHOT, não o banco. A ordem é
obrigatória e está nas receitas (`make grafo` escreve no Neo4j, `make snapshots` lê dele); quem a
impõe é `scripts/lei-tooling.mjs`, que a DERIVA do fonte em vez de confiar numa lista.

`.cache/*.json` são fotos; o servidor relê por `mtime` (não precisa reiniciar), mas **rematerializar
exige rodar o script de novo**. `make conceitos` fica de fora: é inferência, não fato.

☠️ **Antes de medir qualquer coisa na tela, leia
[`armadilhas.md`](./armadilhas.md) §A.** As duas guardas de ambiente (`document.hidden` **e**
`document.hasFocus()`), o `quadros` que tem de ANDAR, o A/B que só funciona no mesmo quadro e a
deriva da câmera do UNIVERSO estão todos lá — e cada um deles já produziu um número plausível e
falso nesta base.

---

## 2. Por onde continuar

**Branch `main`.** Status de tarefa vive no [`roadmap.md`](./roadmap.md); esta seção é só a ORDEM, e
ela é por dívida de MODELO, não por tamanho.

1. **T-71** — a REGRA DO FOCO no pixel. A régua de altura já existe (T-72), e a ordem por ganho tem
   dois apoios que concordam: `journal` é a rota mais pesada em GLIFO **e** a fenda mais pressionada
   em ALTURA.
2. **T-40** — a marca de favorito não tem consumidor.
3. **T-14, o launcher** — a medida que faltava está feita: ele leva vidro de **CSS**, e vidro 3D
   está recusado por aritmética sobre o orçamento do quadro. A tecla é `Ctrl+K` (decidida — `Space`
   já é da voz), e a camada `launcher` só precisa ser registrada em `core/tela.js`.
4. **T-80** — o inspector tem três estados e ganha AÇÕES. ⚠️ Quais ações existem depende de T-78,
   que é decisão sua; os TRÊS ESTADOS não dependem.

⭑ **T-41 · T-42 · T-43 · T-45 · T-64 são um CLUSTER, não cinco tarefas soltas:** todas são
*"declarado sem leitor"* ou *"dois donos para um estado"*. O corolário da REGRA DO CATÁLOGO
(`CLAUDE.md`) diz como a auditoria se faz, e fazê-las juntas cobra uma varredura só.
⚠️ **T-83 é vizinho e NÃO é do cluster** — lá o leitor existe e é imposto; o que não tem guarda é a
POPULAÇÃO da lista que ele lê.

**O que ainda espera a TELA**, e o vocabulário cobra: `done` é *"entregue **e provado** — número,
oráculo ou foto"*.

| tarefa | o que falta julgar |
|---|---|
| **T-13** | a foto da tela de entrada |
| T-16 · T-35 · T-52 | ☠️ **não é esforço — não há OCORRÊNCIA para julgar**: nenhuma aferição vencida na tela, `favoritos().degradadas` é 0, e a linha que vira ponteiro exige um painel de fonte ABERTO (o acordeão não abre por clique programático). **Fabricá-las mede outra coisa** — quem vir a primeira ocorrência julga nela |

⚠️ Antes de medir ali, o §1 e [`armadilhas.md`](./armadilhas.md) §A: aba VISÍVEL, janela em FOCO,
detector de quadro andando. Comando de shell rouba o foco de volta.

⭑ **A FRENTE DE UI/HUD sai de quatro briefings**, e o mapa briefing → tarefa está na tabela final do
[`roadmap.md`](./roadmap.md) — não aqui, senão são duas listas divergindo.
A ferramenta dela é **`bancada-hud.html`**, que monta o `index.html` DE VERDADE num `<iframe>`;
`bancada.rotas()` varre as dez rotas e o inventário está em [`medidas.md`](./medidas.md).
⚠️ **O que ela NÃO faz:** dirigir o app até documento aberto + resposta no palco. Ali ela sai
`palco 0,0%` e o número de FOCUS fica subestimado. A composição com o documento aberto está medida
no APP, à mão, em [`medidas.md`](./medidas.md).

⚠️ **As decisões que são do usuário não são `blocked` por engenharia e nenhum agente as resolve
sozinho** — estão nomeadas no fim do `roadmap.md`.

---

## 3. Onde cada coisa mora — e por que não está aqui

| o que você procura | onde |
|---|---|
| **as leis desta base** (FÍSICA · INSPEÇÃO · CATÁLOGO · FRONTEIRA · **FOCO** · as duas do Neo4j) | [`../CLAUDE.md`](../CLAUDE.md) — é a Constituição, e lei mora lá |
| **o que mente ao medir, e o que falha calado** | [`armadilhas.md`](./armadilhas.md) |
| **números já medidos — NÃO remeça** | [`medidas.md`](./medidas.md) |
| **o que está aberto, em que ordem, o que está REFUTADO e o que já foi decidido** | [`roadmap.md`](./roadmap.md) |
| **as ferramentas de `scripts/`, e o que cada oráculo responde** | [`../CLAUDE.md`](../CLAUDE.md) |
| **a SPEC do modelo celeste** | [`replanejamento-celeste.md`](./replanejamento-celeste.md) — a trava do cabeçalho: *não implementar morfologia nova até a classificação que decide quando ela existe estar correta*. Leis de LAYOUT e de DADO não são morfologia e podem entrar |
| **o que o usuário GANHA** | [`../README.md`](../README.md) |
| **por que um módulo é assim** | o comentário do próprio módulo |
| **a história** | o `git log`, e o corpo do commit é longo aqui de propósito |

Os módulos que carregam o modelo, e os quatro são PUROS (sem `three`, sem DOM, sem cena):
**`entity-physics.js`** (estrutura/corpo/fenômeno), **`astrofisica.js`** (o único lugar onde a
matemática precisa ser física, com as razões `R_s/R` adimensionais por classe), **`superficies.js`**
(a tabela `classificar() → superfície`; **pele nova é roteada por aqui, NUNCA pelo `kind`**) e
**`sistemas.js`** (a CONTENÇÃO servida → quem domina cada sistema → a identidade de cada corpo).
⭑ **As duas cenas leem a pele dali, e nenhuma a deriva** — `sistemas.identidadeDe` é a porta.

Bancadas — **duas, e a divisão é por dimensão**: `sandbox.html` para os objetos 3D e
`bancada-hud.html` para as SUPERFÍCIES (painel, fenda, moldura, composição). A de superfícies
**extrai o CSS real de `index.html` em runtime** e recusa desenhar se o recorte falhar; ela mede
TEXTO e TINTA, que são grandezas diferentes do PONTEIRO de `spatia.hud()`.
☠️ **`elementFromPoint` não serve para medir composição aqui:** `#hud` é `pointer-events: none`, e
hit-test pula quem não recebe ponteiro — a medida certa colhe as caixas de linha com
`Range.getClientRects()`.

`sandbox.html` — um objeto por vez, sem pós-processamento; todo espécime **importa** o
módulo real, e o campo `watch` nomeia o defeito que ele pega.

Outros docs vivos: `catalogo-celeste.md` · `modelo-de-renderizacao.md` · `OS-SCREENS.md` ·
`cobertura.md` · `integracao-neo4j.md` (P0–P7 fechados) · `distancia-e-forma.md` ·
`medicoes-2026-08-07.md`.

☠️ **A ORDEM DE PRECEDÊNCIA, quando duas fontes discordam: o CÓDIGO vence o doc, e o doc vence o
relatório de agente.** Relatório de subagente é leitura, não medida.
