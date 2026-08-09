# Handoff — SpatIA · branch `cena-universo`

> **O que é preciso saber para dar o próximo passo, e nada além disso.** Este arquivo é o PRESENTE:
> em que ambiente se mede, o que está em voo agora, e por onde continuar. **A história vive no
> `git log`** — os corpos de commit desta base são longos de propósito, com a medida que decidiu
> cada número.
>
> ⚠️ **Se o texto vale igual daqui a dez sessões, ele NÃO é handoff.** Lei, doutrina, armadilha e
> número medido são duráveis e moram em outro lugar — o §3 diz qual. Handoff que acumula durável
> deixa de ser lido, e foi assim que este arquivo chegou a **1.112 linhas** com o que importa
> perdido no meio.
>
> ⭑ **O par deste arquivo é [`roadmap.md`](./roadmap.md), e os dois mudam JUNTOS.** Ele responde
> *"para onde, em que ordem, e o que cada peça destrava"*; este responde *"em que ambiente se mede e
> o que está em voo"*. **Item aberto vive LÁ, como tarefa** — anotá-lo aqui cria a segunda cópia, e
> a que alguém ler primeiro decide por acaso.

---

## 0. ⚠️ AMBIENTE — confira ANTES de medir qualquer coisa

**Este documento já afirmou o oposto do que o `.env` dizia, por meia sessão.** O arquivo é a verdade;
isto aqui é lembrança. Um censo rodado contra o corpus errado responde com convicção total sobre um
céu que ninguém está vendo.

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

Trocar é `cp .cache/env.<x>.bak .env` **e REINICIAR o servidor**.
☠️ **`env.vivo.bak` e `env.real.bak` NÃO EXISTEM** — esta linha prometeu backup por várias sessões e
`ls .cache/env.*.bak` não casa nada. Existe **`env.fixture.bak`**, escrito em 09/08 antes de uma
troca. Trocar hoje é editar as três chaves à mão (a tabela acima tem os valores) e **guardar o atual
primeiro**. Recriar o fixture:
`FIXTURE_ROOT=~/workspace/espatial-fixtures uv run --with fastembed python scripts/fixture.py`
(⚠️ o `rmtree` continua nas linhas 220 e 409 — passar `FIXTURE_ROOT` explícito é hábito, não paranoia).

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
cd /Users/victor/workspace/espatial-os && ./serve.py    # 127.0.0.1:8787 · Qdrant 6333 · Neo4j 7474
node scripts/leis.mjs                                   # ☠️ SEMPRE, antes de commitar
```

Abra, clique em **IGNORAR** na tela de boot (obrigatório depois de TODO reload, senão ela fica por
cima e as sondas devolvem `null`).

**O portão é um só.** `node scripts/leis.mjs` roda todos os guardas em ~4 s e sai 1 se qualquer um
cair. ⚠️ **Quantos são sai do próprio comando**, nunca deste parágrafo — guarda novo entra sozinho, e
quem NÃO roda é MEDIDO (efeito colateral), não declarado à mão. Está no `pre-commit`; clone novo pede
`sh scripts/instalar-hook.sh`.

⚠️ **A tabela por-guarda não mora aqui.** Ela dizia *quando* rodar cada um, e escolher era exatamente
como os defeitos passavam — quatro guardas foram flagrados sem guardar o que diziam na mesma sessão.
O que cada um responde está no cabeçalho dele e no `CLAUDE.md`; **quando** rodar tem uma resposta só.

**Rematerialização — a ordem é obrigatória.** A rede lê o SNAPSHOT, não o banco:

```
citacoes.mjs → vizinhanca.mjs → conectividade.mjs      (+ conceitos.mjs quando a prosa mudar)
```

`.cache/*.json` são fotos; o servidor relê por `mtime` (não precisa reiniciar), mas **rematerializar
exige rodar o script de novo**.

☠️ **Antes de medir qualquer coisa na tela, leia
[`armadilhas.md`](./armadilhas.md) §A.** As duas guardas de ambiente (`document.hidden` **e**
`document.hasFocus()`), o `quadros` que tem de ANDAR, o A/B que só funciona no mesmo quadro e a
deriva da câmera do UNIVERSO estão todos lá — e cada um deles já produziu um número plausível e
falso nesta base.

---

## 2. O estado agora

**Branch `cena-universo`** — sem push, não mesclada. Working tree LIMPO.

**Não rastreados e NÃO são meus:** `docs/briefings/ship-navigator.md`, `src/.DS_Store`.

☠️ **O que está aberto vive no [`roadmap.md`](./roadmap.md), como tarefa com status** — não aqui.
Tabela de item em voo envelhece a cada commit e vira a primeira linha errada que alguém lê; foi assim
que este arquivo carregou por sessões dois itens (`0b`, `0f`) **já fechados no código**, contradizendo
o roadmap ao lado.

**Por onde continuar, hoje:** a dívida de modelo aberta mais cara é **T-39** — as duas cenas
discordam sobre 32 de 72 corpos, porque o UNIVERSO usa a ontologia e o AGENTE usa a taxonomia por
`kind` do `solver.js` que a Fase B refutou. `lei-cena.mjs` §5 já MEDE o número e recusa que ele
cresça, então a lei segura a borda enquanto a dívida existe. Depois dela, **T-40** (a marca de
favorito não tem consumidor) e **T-58** (o `prefs` vence o endereço pedido no deeplink de foco).

⚠️ **As decisões que são do usuário não são `blocked` por engenharia e nenhum agente as resolve
sozinho** — estão nomeadas no fim do `roadmap.md`.

---

## 3. Onde cada coisa mora — e por que não está aqui

| o que você procura | onde |
|---|---|
| **as leis desta base** (FÍSICA · INSPEÇÃO · CATÁLOGO · FRONTEIRA · as duas do Neo4j) | [`../CLAUDE.md`](../CLAUDE.md) — é a Constituição, e lei mora lá |
| **o que mente ao medir, e o que falha calado** | [`armadilhas.md`](./armadilhas.md) |
| **números já medidos — NÃO remeça** | [`medidas.md`](./medidas.md) |
| **o que está aberto, em que ordem, o que está REFUTADO e o que já foi decidido** | [`roadmap.md`](./roadmap.md) |
| **as ferramentas de `scripts/`, e o que cada oráculo responde** | [`../CLAUDE.md`](../CLAUDE.md) |
| **a SPEC do modelo celeste** | [`replanejamento-celeste.md`](./replanejamento-celeste.md) — a trava do cabeçalho: *não implementar morfologia nova até a classificação que decide quando ela existe estar correta*. Leis de LAYOUT e de DADO não são morfologia e podem entrar |
| **o que o usuário GANHA** | [`../README.md`](../README.md) |
| **por que um módulo é assim** | o comentário do próprio módulo |
| **a história** | o `git log`, e o corpo do commit é longo aqui de propósito |

Os módulos que carregam o modelo: **`src/space/entity-physics.js`** (puro, sem `three` —
estrutura/corpo/fenômeno), **`src/space/astrofisica.js`** (o único lugar onde a matemática precisa
ser física, com as razões `R_s/R` adimensionais por classe) e **`src/space/superficies.js`** (a
tabela `classificar() → superfície`; **pele nova é roteada por aqui, NUNCA pelo `kind`**).

Bancada: `sandbox.html` — um objeto por vez, sem pós-processamento; todo espécime **importa** o
módulo real, e o campo `watch` nomeia o defeito que ele pega.

Outros docs vivos: `catalogo-celeste.md` · `modelo-de-renderizacao.md` · `OS-SCREENS.md` ·
`cobertura.md` · `integracao-neo4j.md` (P0–P7 fechados) · `distancia-e-forma.md` ·
`medicoes-2026-08-07.md`.

☠️ **A ORDEM DE PRECEDÊNCIA, quando duas fontes discordam: o CÓDIGO vence o doc, e o doc vence o
relatório de agente.** Relatório de subagente é leitura, não medida.
