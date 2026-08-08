# Integração Neo4j — o plano, e a lei da degradação

> **Spec, não implementação.** Nada aqui está em `src/` nem em `server/`. Ela existe para destravar
> as quatro dimensões sem fato do
> [`replanejamento-celeste.md`](./replanejamento-celeste.md) §11.
>
> Estado hoje: **Neo4j 5.26.0 Community no ar** em `localhost:7474`, bolt em `7687`.
> `config.py` já declara `NEO4J_HTTP` e `metrics.py` já lista `neo4j` entre os serviços — mas o
> `/api/health` **não** o reporta e **nada lê dele**. É exatamente a situação que a REGRA DO
> CATÁLOGO proíbe: declarado sem leitor.

---

## 1. A lei que governa tudo: Neo4j muda o BRILHO, nunca a CLASSE

O requisito do usuário é explícito — *"é uma conexão que pode não estar sempre disponível, não pode
impedir o funcionamento, mas deve fazer parte da hierarquia quando ativo"*. A tradução dele para
esta arquitetura é uma regra só, e ela decide todo o resto:

> **Nenhum fato que só o Neo4j conhece pode decidir a CLASSE de um corpo.**
> Ele pode decidir **brilho, energia e destaque** — nunca escala, nunca identidade.

O motivo é o pior modo de falha imaginável para este produto: se `centrality` decidisse classe, um
container caindo faria **corpos trocarem de identidade** — o céu inteiro se reclassificando porque
um serviço piscou. Um usuário aprenderia que a forma não significa nada.

E a física já dizia onde essas grandezas moram (§11.1 do replanejamento):

| grandeza | governa | fonte | pode faltar? |
|---|---|---|---|
| massa | escala e gravidade | corpus (`chunks`) | **não** |
| atividade | energia e brilho | git (`churn`) | **não** |
| **centralidade** | **influência** | **Neo4j** | **sim** |
| **relações** | **estrutura visível na seleção** | **Neo4j** | **sim** |
| idade | evolução | git (`recency`) | não |

⚠️ As duas que podem faltar são exatamente as duas que só modulam. **Isso não é coincidência: é o
critério.** Se uma dimensão nova só puder ser calculada com o Neo4j, ela tem de caber em brilho ou
destaque — senão ela não entra.

### 1.1 A segunda lei: o Neo4j nunca está no caminho do quadro

A primeira lei protege a IDENTIDADE do corpo. Esta protege o QUADRO.

> **O renderer nunca consulta o Neo4j.** Ele recebe um `EntityPhysics` já resolvido, com
> `centrality: number | null` dentro.

```
Neo4j → materialização em background → snapshot de física → estado do universo → renderer
```

E nunca `render entity → query → query → query`. Um céu de 1 636 corpos que consultasse o grafo por
objeto teria o custo do banco multiplicado por corpo **e por quadro** — e ficaria refém da latência
dele a 60 Hz.

Isto também é o que torna a primeira lei executável: se a física é um snapshot, o Neo4j cair entre
dois snapshots não muda nada na tela até a próxima materialização, e a mudança é **um número de
brilho**, nunca uma reclassificação.

⚠️ Vale para LEITURA, não só para escrita. O documento já dizia que ingestão fica fora de banda; a
consulta também fica. **O Neo4j é fonte opcional de conhecimento sobre o universo, não o mecanismo
que mantém o universo funcionando.**

### 1.2 Degradar declarando, não silenciando

O precedente existe e está medido nesta base: `server/units.py` distingue **falta** de **desligado
por decisão**, e `voice.applyHealth` usa isso para desabilitar VOZ *antes* de falhar. O Neo4j entra
no mesmo grafo `DEPENDS`.

| estado | o que a tela diz | o que o céu faz |
|---|---|---|
| ativo | `neo4j: no ar · 4 812 vínculos · lido há 40 s` | brilho por influência, linhas na seleção |
| fora, **declarado opcional** | `neo4j: desligado nesta instalação` | brilho cai para atividade pura, **sem vermelho** |
| fora, **declarado obrigatório** | `neo4j: FORA — influência indisponível` | idem, **com** o aviso |
| nunca configurado | a dimensão não aparece na tela | idem |

⚠️ **Nunca inventar zero.** `centrality = 0` significa "medi e é periférico"; a ausência significa
"não medi". Colapsar os dois faz o céu afirmar periferia sobre 1 636 corpos por causa de um
container. `null` é a resposta honesta e a tela sabe escrevê-la.

---

## 2. Quem é dono de qual fato — e por que não pode haver dois

A regra que a pesquisa confirma como padrão canônico: *"offloading embeddings to Qdrant while
keeping relationships in Neo4j"*.

| fonte | é dona de | exemplos | disponibilidade |
|---|---|---|---|
| **Qdrant** | **semântica** | vetores, similaridade, chunks | necessária (o céu não carrega sem ela) |
| **git + filesystem** | **contenção e tempo** | `chunks`, `churn`, `recency`, `dormant`, estado sujo | sempre (é disco) |
| **Neo4j** | **relação lateral** | referência, import, co-edição, vizinhança semântica materializada | **opcional** |
| **agente / ollama** | **inferência** | extrair relação de prosa, nomear vínculo | opcional e caro |

⚠️ **Neo4j NÃO duplica o corpus.** Nó dele é **fino**: identidade e rótulo, mais nada. Toda
propriedade que o corpus já tem (massa, kind, recência) fica fora — duas fontes para o mesmo fato é
o defeito que este projeto persegue, e aqui ele teria a forma mais cruel, porque as duas cópias
envelheceriam em ritmos diferentes.

**O identificador é o `source` do céu** (`devshell-one/docs/x.md`) — o mesmo que `dirty.state_of`,
`read_source` e `registerPath` já usam. Ele é a chave natural, e a modelagem do Neo4j pede
exatamente isso: *"always have a property that uniquely identifies a node"*.

---

## 3. O modelo de grafo

### 3.1 Nós

| rótulo | é | chave | propriedades |
|---|---|---|---|
| `Entity` | um nó do céu (arquivo, pasta, repo) | `source` | `kind` (só para consulta), nada mais |
| `Concept` | assunto extraído de prosa | `slug` | `label` |
| `Agent` | um agente declarado | `id` | — |
| `Tool` | uma ferramenta | `name` | — |
| `Run` | uma execução do agente | `run_id` | `started_at` |

`Run`, `Agent` e `Tool` fecham o ciclo que hoje só existe no diário JSONL: **o que o agente tocou**
vira relação, e aí "este arquivo é usado por muitos agentes" passa a ser um fato consultável — que
é justamente o exemplo que a revisão deu para *atividade ≠ massa*.

### 3.2 Relações

Nomes específicos de propósito — a modelagem do Neo4j é explícita: *"be as specific as possible in
order to allow Neo4j to traverse only relevant connections"*.

| relação | de → para | fato de origem | dimensão que ela alimenta |
|---|---|---|---|
| `REFERENCES` | Entity → Entity | link/caminho citado na prosa | conectividade |
| `IMPORTS` | Entity → Entity | import/require (quando houver código no índice) | conectividade |
| `CO_EDITED` | Entity → Entity | commits que tocam os dois | conectividade, e é a mais barata |
| `SIMILAR_TO` | Entity → Entity | vizinhança do Qdrant **materializada** | conectividade |
| `MENTIONS` | Entity → Concept | extração por LLM | composição |
| `TOUCHED` | Run → Entity | diário de execuções | centralidade **de uso** |
| `USES` | Agent → Tool | manifesto | — |

⚠️ **`CO_EDITED` e `SIMILAR_TO` precisam de qualificadores** (contagem, janela, score, data da
medida), e relação com muitos campos é o caso em que a documentação manda usar **nó intermediário**.
Proposta: `(:Entity)-[:IN]->(:CoEdit {count, window, as_of})<-[:IN]-(:Entity)`. Sem isso, o score de
similaridade vira propriedade solta que ninguém sabe quando expirou.

### 3.2.1 ⚠️ `CO_EDITED` já foi medido, e ele é ESPARSO demais para carregar centralidade

`medicoes-2026-08-07` §4.4 mediu as arestas deriváveis sem embedding no corpus real:

| aresta | como | quantidade |
|---|---|---|
| **teste ↔ alvo** | convenção de nome (regex) | **627** (53% de 1 190 testes) |
| **co-edição no git** | commits que tocam os dois | **44 pares** |

**44 pares em 1 636 arquivos.** No melhor caso isso dá grau > 0 para 88 nós — **~5% do céu**. Os
outros 95% teriam `centrality = null` não por o Neo4j estar fora, mas por não haver aresta.

Isso muda a ordem: **`CO_EDITED` é o primeiro relacionamento por ser barato e objetivo, não por ser
suficiente.** Ele serve para provar o caminho ponta a ponta — derivador, escrita, projeção, leitura,
snapshot — com um volume que cabe na cabeça. Ele **não** entrega a dimensão.

Quem tem densidade para isso é a aresta de **teste ↔ alvo**: 627 arestas, 14× mais, também sem LLM e
sem Qdrant. Ela não estava no plano e deveria estar.

⚠️ E a mesma §4.4 registra uma correção que vale repetir: *"o catálogo declarava as duas bloqueadas
pela aresta semântica do Qdrant. **Não estão.**"* Duas arestas úteis foram consideradas impossíveis
por dependerem de algo que elas não precisam.

### 3.2.2 O que cada relação SIGNIFICA — a legenda que a seleção vai usar

| relação | lê-se como |
|---|---|
| `REFERENCES` | dependência **documental** |
| `IMPORTS` | dependência **estrutural** |
| `CO_EDITED` | afinidade de **trabalho** |
| `SIMILAR_TO` | afinidade **semântica** |
| `TOUCHED` | **uso por agentes** |

É por isso que os tipos são específicos em vez de um `RELATED_TO` genérico: cinco vínculos com o
mesmo nome seriam cinco fatos diferentes desenhados com a mesma linha — a colisão dos três aros
outra vez, agora nas arestas.

### 3.3 O que NÃO vira relação

| tentação | por que não |
|---|---|
| contenção (`repo → dir → file`) | já é o grafo do céu, e **a posição já comunica** (briefing §"separar contenção de relacionamento"). Duplicar é criar divergência |
| massa, recência, churn | são do corpus. Nó fino |
| o estado do git | perecível demais para um banco; some no commit |

---

## 4. As quatro dimensões sem fato, resolvidas

| dimensão | veredito | como |
|---|---|---|
| **`connectivity`** | **Neo4j** | grau ponderado das laterais. Degrada para `null` |
| **`centrality`** | **Neo4j** | PageRank ou grau sobre as laterais + `TOUCHED`. Degrada para `null` |
| **`density`** | **NÃO é do Neo4j** | é bytes por chunk — fato de corpus que o **indexador não emite**. Conserta-se no indexador, não no grafo |
| **`importance`** | **cortar ou redefinir** | ver abaixo |

### `importance` deve ser recusada como dimensão

Ela não é um fato: é um **juízo**. Derivá-la de massa+atividade+centralidade a torna um **score
composto** — e score composto já foi **refutado com número** nesta base: *"o score composto é
tamanho com ofuscação"* (`medicoes-2026-08-07` §3.2).

Só existe uma forma honesta dela: **declarada pelo usuário** (fixar, favoritar, marcar). Aí ela
deixa de ser física da entidade e vira **intenção do operador** — outro eixo, com outra fonte, e que
merece outro nome.

---

## 5. A regra visual: a teia só existe na seleção

A rede só aparece quando alguém pergunta por ela — e o objeto selecionado vira o **centro temporário
daquela topologia**.

```
fora da seleção          ●        ●        ●

na seleção                        ●
                                 /
                        ● ───── ◎ ───── ●
                                 \
                                  ●
```

Isso não é preferência estética: é a única forma de a rede caber num céu de 1 636 corpos sem virar
grafo-espaguete, e é o que o briefing já pedia ao separar contenção de relacionamento — *"posição
comunica contenção; a linha aparece só na seleção"*.

⚠️ E é aqui que a legenda do §3.2.2 paga: cinco vínculos desenhados com a mesma linha seriam cinco
fatos com a mesma voz — a colisão dos três aros, de novo, agora nas arestas.

---

## 6. Como o dado entra

Três escritores possíveis, do mais barato ao mais caro:

| escritor | produz | custo | quando |
|---|---|---|---|
| **derivador de git** | `CO_EDITED` | baixo — um `git log` | contínuo |
| **materializador do Qdrant** | `SIMILAR_TO` (top-k por nó, com `as_of`) | médio — k buscas | agendado |
| **agente / ollama** | `MENTIONS`, `REFERENCES` de prosa | alto | manual, nunca no caminho da pergunta |

⚠️ **Nenhum deles no caminho da requisição.** O `/api/ask` não pode esperar por escrita de grafo, e
o céu não pode esperar por grafo nenhum para montar. Ingestão é sempre fora de banda — a mesma
regra que o SpatIA já aplica ao índice ("o SpatIA não indexa; lê uma coleção que outro pipeline
escreve").

### ⚠️ Já existe outro grafo neste Neo4j

O workspace roda **graphiti** sobre o Neo4j do `oracle`, com `group_ids` por fonte
(`opensrc-<slug>`). Antes de escrever qualquer coisa é preciso confirmar **se é a mesma instância** —
e, se for, isolar por `database` separado ou por convenção de `group_id`. Dois grafos misturados num
banco Community (que não tem multi-database livre) é o tipo de colisão que só aparece quando uma
consulta devolve o nó do outro.

---

## 7. O que medir antes de escrever código

1. **É a mesma instância do graphiti?** Decide isolamento e é bloqueante.
2. **Quantas `CO_EDITED` o git produz** no corpus real, e com que janela — se forem dezenas de
   milhares, o grafo vira denso e a centralidade perde poder de separar.
3. **O k do `SIMILAR_TO`**: k alto conecta tudo com tudo e a centralidade vira ruído. Este número
   precisa ser derivado, não escolhido.
4. **Quantos nós ficariam com grau zero** — se for a maioria, `centrality` nasce quase toda nula e
   a dimensão não paga o custo.
5. **O custo do `/api/health` com mais um serviço** — hoje ele já sonda qdrant, ollama, claude, tts
   e quatro buscadores.

---

## 8. Ordem de integração

**P0 — AUDITORIA DO GRAPHITI. ✅ FEITA em 2026-08-08, e ela achou duas colisões.**

| pergunta | resposta |
|---|---|
| mesma instância? | **sim** — `workspace-neo4j-1`, `neo4j:5.26.0`, portas 7474/7687 |
| mesmo database? | **sim, e não há alternativa**: só existem `neo4j` e `system`. Community **não tem multi-database livre** |
| rótulos do graphiti | `Entity` · `Episodic` · `Community` · `Saga` |
| tipos de relação | `RELATES_TO` · `MENTIONS` · `HAS_EPISODE` · `HAS_MEMBER` · `NEXT_EPISODE` |
| constraints | **nenhuma** |
| indexes | **33**, sobre `uuid`, `group_id`, `name`, `created_at` |
| convenção de isolamento | `group_id` por fonte, e todo nó dele carrega o campo |

⚠️ **Duas colisões diretas com o plano original: `Entity` e `MENTIONS` já são do graphiti.** Eram
exatamente os dois nomes que este documento propunha. Sem a auditoria, o primeiro `CREATE` teria
misturado os dois grafos num banco que não permite separá-los — e o sintoma só apareceria quando
uma consulta devolvesse o nó do outro.

**Resolução, e ela é por RÓTULO porque o database não está disponível:**

| SpatIA | era | ficou |
|---|---|---|
| corpo | `Entity` ❌ | **`Astro`** |
| estrutura | — | **`Sistema`** |
| relação semântica | `MENTIONS` ❌ | **`ABOUT`** |
| demais relações | `CO_EDITED` · `SIMILAR_TO` · `TOUCHED` · `REFERENCES` · `IMPORTS` | livres, mantidas |

Segunda camada: `group_id = "spatia"` em todo nó nosso, pela mesma convenção que o graphiti já usa.
Ela não é redundância — é o que torna a limpeza uma consulta só.

⚠️ E a contagem publicada no `/api/health` conta **apenas o que é nosso**. Publicar os nós do
graphiti como se fossem deste sistema faria "9 corpos" parecer nosso, e na primeira divergência
ninguém saberia de quem era o número.

| passo | o que | destrava | observação |
|---|---|---|---|
| **P1** ✅ | `neo4j` no `/api/health` (`server/graphdb.py`) | a tela para de mentir por omissão | medido: sem credencial → `configured:false` e `corpos:null`; com credencial → `online:true` e `corpos:0`. **`null` ≠ `0`** funcionando |
| **P2** ✅ | `Astro` + `CO_EDITED` (`scripts/vinculos.mjs`) | provou o caminho ponta a ponta | **556 pares · 118 nós · 7,2% do céu.** Grau MED 9 · P90 17 · máx 48 |
| **P2b** ❌ | teste ↔ alvo por convenção de nome | **CAI** | as 627 arestas foram medidas no DISCO; exigindo os dois lados indexados sobram **4** |
| **P3** | `connectivity` → `centrality` → **influência → brilho** | a §11.1 do replanejamento | nunca `centrality → classe` |
| **P4** | `SIMILAR_TO` materializado do Qdrant + a rede visível na seleção | a rede de conhecimento | com `score`, `k`, `window`, `as_of` |
| **P5** | `Agent`, `Run`, `TOUCHED` | "quais objetos os agentes realmente usam" | influência por uso, não massa |
| **P6** | `REFERENCES`, `IMPORTS` | dependência documental e estrutural | semanticamente mais fortes que "parecidos" |
| **P7** | `MENTIONS`, `Concept` | inferência | só depois de o grafo provar valor **sem** LLM |

⚠️ **A ORDEM MUDOU, e a medida obrigou.** P3 (centralidade) **não pode vir antes de P4**
(`SIMILAR_TO`): com `CO_EDITED` como única aresta, **92,8% do céu fica com `centrality = null` por
falta de aresta** — não por o Neo4j estar fora. PageRank sobre isso não cria dimensão útil, só
redistribui o nada sobre 7,2% dos corpos.

A ordem executável passa a ser **P4 → P3**: materializar a vizinhança semântica do Qdrant primeiro,
porque ela é a única aresta que alcança todo o corpus (todo nó tem vizinho semântico; nem todo nó
tem co-editor).

## Fontes

- [Neo4j · Graph modeling tips](https://neo4j.com/docs/getting-started/data-modeling/modeling-tips/) —
  identificador único por nó; relação específica em vez de genérica; nó intermediário quando a
  relação precisa de qualificadores.
- [Neo4j · Graph Data Modeling Core Principles](https://neo4j.com/graphacademy/training-gdm-40/03-graph-data-modeling-core-principles/) —
  modelo dirigido pelas consultas; o que se filtra ou percorre não deve ser propriedade.
- [Qdrant · GraphRAG with Qdrant and Neo4j](https://qdrant.tech/documentation/examples/graphrag-qdrant-neo4j/) ·
  [Neo4j · Qdrant to enhance RAG](https://neo4j.com/blog/developer/qdrant-to-enhance-rag-pipeline/) —
  o padrão canônico: **embeddings no Qdrant, relações no Neo4j**, que é exatamente a divisão que
  este workspace já tem por acidente e passa a ter por decisão.
