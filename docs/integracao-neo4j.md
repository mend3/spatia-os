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

### 1.1 Degradar declarando, não silenciando

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

## 5. Como o dado entra

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

## 6. O que medir antes de escrever código

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

## 7. Ordem de integração

| passo | o que | destrava |
|---|---|---|
| **0** | `neo4j` no `/api/health` e no `units.json`, com os três estados do §1.1 | a tela para de mentir por omissão |
| **1** | `CO_EDITED` a partir do git | `connectivity` com o fato mais barato |
| **2** | `centrality` como **modulador de brilho**, degradando para `null` | a §11.1 do replanejamento |
| **3** | `SIMILAR_TO` materializado do Qdrant | a rede de conhecimento do briefing (linha só na seleção) |
| **4** | `TOUCHED` do diário | "usado por muitos agentes" vira fato |
| **5** | `MENTIONS` por LLM | último, e só se os anteriores pagarem |

O passo 0 pode ir hoje e não depende de nada: ele só torna verdadeiro o que o `metrics.py` já
afirma.

---

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
