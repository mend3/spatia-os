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

E nunca `render entity → query → query → query`. Um céu de MILHARES de corpos que consultasse o grafo por
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
"não medi". Colapsar os dois faz o céu afirmar periferia sobre o corpus INTEIRO por causa de um
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
| `Agent` | o brain que executou | `id` (= `brain`) | `brain`. ⚠️ `model` NÃO mora aqui — ver §3.2.3 |
| `Tool` | uma ferramenta | `name` | — |
| `Run` | uma execução do agente | `run_id` | `started_at` |

`Run` e `Tool` fecham o ciclo que hoje só existe no diário JSONL: **o que o agente tocou** vira
relação, e aí "este arquivo é usado por muitos agentes" passa a ser um fato consultável — que é
justamente o exemplo que a revisão deu para *atividade ≠ massa*.

⚠️ **`Agent` não fechava nada até 2026-08-08**, e a medida mostrou por quê: o diário não registrava
agente. Esta frase dizia "`Run`, `Agent` e `Tool`" e estava errada em um terço. O conserto não foi
inventar identidade — foi **gravar a que já existia no runtime e era descartada**. Ver §3.2.3.

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

`calibracao` §4.4 mediu as arestas deriváveis sem embedding no corpus real:

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

### 3.2.3 ⚠️ `TOUCHED` medido: o fato existe, a população não — e `Agent` não tem fato nenhum

Medido em **2026-08-08** sobre `.cache/journal/` (2 dias, cadeia íntegra) contra os 1 636 nós do céu:

| medida | valor |
|---|---|
| registros no diário | 114 — mas **só 11 são execuções** (`boot` 37 · `shutdown` 20 · `denial` 46) |
| arquivos distintos citados | 57, dos quais **51 são nós do céu**; os 6 restantes são páginas web (`kind: web`), que não são corpo nenhum |
| arestas `TOUCHED` | **70** — contra 556 do `CO_EDITED` e 8 130 do `SIMILAR_TO` |
| cobertura | **51/1 636 = 3,12%** — menos da metade dos 7,2% que o §3.2.1 já declarou insuficiente |
| **grau máximo** | **2** (38 arquivos com grau 1 · 13 com grau 2) |

**O grau máximo é o número que decide.** A dimensão prometida é *"usado por muitos agentes"*, e
**"muitos" tem teto 2** neste corpus. PageRank sobre isso repete o que o §8 já apurou para o
`CO_EDITED`, agora com menos da metade da cobertura: redistribui o nada sobre 3% dos corpos.

**E o rótulo `Agent` não tinha fato — o fato existia e estava sendo jogado fora.** Os campos de uma
execução eram `answer · cost_usd · flags · id · origin · outcome · prev · question · sources ·
started · tokens · tools · turns` — nenhum de agente, nenhum de modelo. `origin` é **canal**, não
identidade: `console` nas 11 execuções, e os demais valores (`files`, `github`, `server`,
`callback`) são portas de entrada. Criar `Agent` a partir dele seria a **REGRA DO CATÁLOGO ao
contrário**: em vez de campo declarado sem leitor, **nó criado sem fato**.

⚠️ **Mas `recorder.run.model` já recebia o modelo do frame `init` do brain** — e só alimentava
métrica, morrendo com o processo. O diário registrava a pergunta, as ferramentas e o custo, e não
registrava QUEM executou. Desde 2026-08-08 o `journal.begin(question, origin, brain)` grava
`agent: {brain, model, session}`, e o `recorder` o completa quando o frame chega.

Consequências, e nenhuma delas mente sobre o estado atual:

- **execuções anteriores não têm a chave e não ganham `Agent`** — viram `Run` órfão, que é a
  verdade: rodaram num tempo em que ninguém registrou quem rodava;
- **`model` mora no `Run`, não no `Agent`** — um agente roda modelos diferentes ao longo do tempo,
  então modelo é propriedade da execução. Pendurá-lo no agente faria a última execução reescrever
  a história de todas as anteriores;
- o rótulo e a constraint existem com **0 nós**, e isso é o contrato nascendo antes da população.

⚠️ O caminho `(:Agent)-[:RAN]->(:Run)-[:TOUCHED]->(:Astro)` foi **exercitado por semeadura antes de
existir uso real** — 1 977 percursos, 1 `Agent` com `id: "claude"` vindo do fato. Sem isso ele seria
código que nunca rodou, que é a armadilha nº 6 do handoff: *objeto com dois modos precisa dos dois
na bancada*. O sintético foi apagado em seguida.

⚠️ `Tool`, ao contrário, tem fato: o diário registra **30 ferramentas distintas** com `tool`, `kind`,
`ok` e `ms`. O que falta é só o `Agent` que as usaria.

#### A decisão: CONSTRUIR agora, com a distinção escrita no código

O **P2b caiu por ESTRUTURA**: as 627 arestas de teste↔alvo vivem no disco e, exigindo os dois lados
indexados, sempre sobrarão 4. Ele não cresce com nada.

O **P5 está vazio por JUVENTUDE** — cada `/api/ask` acrescenta arestas. Medido isso, havia duas
saídas, e a escolhida foi **construir**: o encaixe custa menos agora, enquanto a ontologia está
sendo desenhada, do que depois de milhares de runs descobrir que o grafo não foi feito para
representar uso. A alternativa — esperar — economizava trabalho e cobrava uma segunda integração
justamente quando o universo já dependesse dela.

O que impede isso de virar autoengano é uma distinção que passa a existir **em código**, não em
promessa:

| pergunta | onde é respondida | hoje |
|---|---|---|
| a dimensão EXISTE? | `usage` no `EntityPhysics`, `number \| null` | **sim** |
| ela tem PODER estatístico? | `evidenciaDeUso()`, publicada no snapshot e no `/api/graph` | **não** — grau máx 2 < 5 |
| ela pode decidir CLASSE? | `scripts/lei-neo4j.mjs`, por perturbação | **nunca**, e está provado |

⚠️ **"Dimensão indisponível" e "evidência esparsa" deixam de ser a mesma frase.** Ausência vale
`null` e nenhum nó ganha o campo; evidência rala vale um número pequeno com o veredito ao lado. Era
a confusão que faria um `usage` baixo parecer medida forte de pouco uso, quando é medida fraca de
nada.

**O piso para a evidência exercer influência** (`EVIDENCIA_USO_MINIMA`, em `entity-physics.js`):
grau máximo **≥ 5** — abaixo disso "usado por muitos" é empate, não afirmação — **e** cobertura
acima de **7,2%**, que é exatamente a do `CO_EDITED` que esta spec já reprovou. A dimensão tem de
passar do piso que já reprovou outra.

⚠️ **E a escala foi escolhida para não precisar de migração.** O `usage` satura em `USO_CHEIO = 12`
execuções distintas, em vez de normalizar por posto como a influência faz. Com grau máximo 2, o
posto daria `1.0` ao corpo mais tocado — "o mais usado do céu", sobre um arquivo que duas execuções
abriram: verdadeiro na ordem, falso na afirmação. Com saturação declarada ele vale 2/12 = **0,17**, e
sobe sozinho conforme o diário cresce. **A mesma escala serve para 11 e para 10 000 execuções.**

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
| **`connectivity`** | **Neo4j** | ~~grau ponderado das laterais~~ → **ALCANCE**. Ver §4.1: o grau foi REFUTADO por medida. Degrada para `null` |
| **`centrality`** | **Neo4j** | PageRank ou grau sobre as laterais + `TOUCHED`. Degrada para `null` |
| **`density`** | **NÃO é do Neo4j** | é bytes por chunk — fato de corpus que o **indexador não emite**. Conserta-se no indexador, não no grafo |
| **`importance`** | **cortar ou redefinir** | ver abaixo |

### 4.1 ⚠️ `connectivity` NÃO é o grau — e quem decidiu foi a medida, em 2026-08-08

Esta spec definia `connectivity` como *"grau ponderado das laterais"* e `centrality` como *"PageRank
ou grau sobre as laterais"*: **o mesmo substrato, duas vezes.** E como o `SIMILAR_TO` tem `k` fixo,
todo corpo nasce com 8 arestas de saída — o grau bruto é uma constante somada ao grau de ENTRADA,
que é exatamente o que a centralidade normaliza.

`scripts/conectividade.mjs` mediu três candidatas contra o que o céu já tem (188 corpos, Spearman):

| candidata | × centralidade | × massa | × atividade | veredito |
|---|---|---|---|---|
| **grau** (o da spec) | **0,821** | 0,688 | 0,714 | **cai** — é a soma de três dimensões que já existem |
| **agrupamento** (Watts–Strogatz) | −0,416 | **−0,609** | −0,239 | cai — a massa explica boa parte dela |
| **alcance** | **−0,083** | **0,040** | **0,130** | **fica** — praticamente ortogonal |

**ALCANCE = a fração dos vínculos laterais cujo destino está FORA do sistema (pasta) do corpo.**

O motivo de ele ser a resposta certa não é só estatístico: ele mede **a parte da relação que a
POSIÇÃO não comunica.** A cena já diz por contenção quem mora junto — é o §"separar contenção de
relacionamento" do briefing. O que ela nunca disse é se o vizinho semântico de um corpo está dentro
ou fora da pasta dele, e é justamente esse cruzamento que a rede da seleção desenha.

Distribuição: min 0 · P10 0,31 · MED **0,60** · P90 0,89 · máx 1,0. Cobertura **188/188**.

⚠️ **O confesso, publicado no snapshot:** ρ **−0,623** com o TAMANHO do sistema — filho único de
pasta tem alcance 1,0 por construção (7 corpos em 1,0, dos quais 3 são filho único). O alcance é uma
RAZÃO, então ele não sabe volume: 8 vínculos todos fora valem o mesmo que 85 todos fora. Volume é
`centrality`, e misturar os dois refaria o score composto.

⚠️ E as candidatas recusadas ficam gravadas **no próprio snapshot**, com o ρ de cada uma: sem isso a
próxima sessão remede as três para descobrir o que esta já sabia.

### `importance` deve ser recusada como dimensão

Ela não é um fato: é um **juízo**. Derivá-la de massa+atividade+centralidade a torna um **score
composto** — e score composto já foi **refutado com número** nesta base: *"o score composto é
tamanho com ofuscação"* (`calibracao` §3.2).

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

Isso não é preferência estética: é a única forma de a rede caber num céu desta ordem sem virar
grafo-espaguete, e é o que o briefing já pedia ao separar contenção de relacionamento — *"posição
comunica contenção; a linha aparece só na seleção"*.

⚠️ E é aqui que a legenda do §3.2.2 paga: cinco vínculos desenhados com a mesma linha seriam cinco
fatos com a mesma voz — a colisão dos três aros, de novo, agora nas arestas.

### 5.1 ✅ FEITO em 2026-08-08 — e três decisões que a medida obrigou

`scripts/vizinhanca.mjs` → `.cache/vizinhanca.json` → `/api/vizinhanca` → `universe.js`. A cadeia é a
da lei nº 2, inteira: o renderer lê uma lista pronta, e o Neo4j não está no caminho do quadro.

| | |
|---|---|
| população | **4 226 vínculos desenháveis em 188 corpos** (com o P6) · grau MED 26 · P90 56 · **máx 182** · 0 isolados |
| teto | **28 arcos**, herdado do `MAX_LINKS` de `links.js` — mesma tela, mesmo olho |
| acima do teto | **79 corpos (42,0%)** depois do P6, e o corte é PUBLICADO (`total` por tipo) |

**1. Rota própria, e não mais um campo no `/api/graph`.** `centrality` e `usage` são um número por
corpo e cabem no nó. A vizinhança são **408 kB contra 119 kB da topologia inteira** — 3,4×. Anexá-la
faria toda abertura de tela pagar por um dado que só a seleção lê. Por isso **não houve bump de
`SCHEMA_VERSION`**: nenhum campo novo entrou no nó.

**2. O corte é RODÍZIO entre tipos, não ordenação única.** `SIMILAR_TO` tem `score` (0,51–0,97) e
`CO_EDITED` tem `peso` (1–21 commits); ordenar os dois juntos compararia cosseno com contagem, que é
o score composto já refutado. O rodízio nunca compara dois tipos, e é o que impede o teto de
silenciar o tipo menos numeroso.

**3. ⚠️ `TOUCHED` NÃO entra, e não é por estar vazio.** Ele liga `Run → Astro`: **as duas pontas não
são corpos.** Desenhá-lo entre dois astros afirmaria que dois arquivos abertos pela mesma execução
"se usam", que ninguém mediu. Ele volta quando houver decisão sobre o que a outra ponta é — e a
população dele hoje é 0 de qualquer forma, então o que se perdeu foi só a ilusão de completude.

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
regra que o SpatIA já aplica ao índice: indexar acontece FORA do quadro, e o que a requisição lê é
o resultado pronto.

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
| **P4** ✅ | `SIMILAR_TO` materializado (`scripts/similares.mjs`) | **8 130 arestas, k=5 derivado, 6,6% isolados** | ⚠️ números do corpus que os volumes levaram; no `espatial_vivo` são **1 504 arestas, k=8** (aqui `k=5` deixa 10,6% de isolados, acima do corte). A rede na seleção fechou — §5.1 |
| **P5** ✅ | `Agent` + `Run` + `TOUCHED` (`scripts/uso.mjs`) | `usage` no `EntityPhysics`; influência por USO | **11 Run · 64 TOUCHED · 51 corpos (3,12%) · grau máx 2 · 0 Agent.** Construído com evidência RALA de propósito, e o snapshot publica o veredito. Ver §3.2.3 |
| **lei nº 1** ✅ | `scripts/lei-neo4j.mjs` | a lei vira invariante **implementada** | 29 448 perturbações de `centrality`/`usage`/`connectivity` sobre 1 636 corpos: **nenhuma altera classe** |
| **P6** ✅ | `REFERENCES`, `IMPORTS` (`scripts/citacoes.mjs`) | dependência documental e estrutural | **452 REFERENCES · 88,8% do céu** e **313 IMPORTS · 59,6%** — e são as duas ÚNICAS relações DIRIGIDAS. Ver §6.1 |
| **P7** ✅ | `ABOUT`, `Concept` (`scripts/conceitos.mjs`) | inferência | **100 conceitos · 130 ABOUT · 23/23 arquivos**, e só **16 ligam** dois corpos. Ver §7.1 |

### A derivação do `k`, e o que ela me corrigiu

Montei a derivação em torno do **Gini do grau de entrada** — com `k` fixo o grau de SAÍDA é
constante, então quem carrega sinal é a ENTRADA: ser vizinho de muitos é o que significa influência.

Medido, o Gini é **quase plano**: 0,469 · 0,460 · 0,451 · 0,451 · 0,455 para k = 3 · 5 · 8 · 12 · 20.
**A discriminação está no dado, não no parâmetro.** O critério que eu escolhi não escolhe nada — e
quem decide de fato é a COBERTURA:

| k | isolados | grau de entrada MED · P90 · máx |
|---|---|---|
| 3 | 196 (12,0%) | 2 · 6 · 75 |
| **5** | **108 (6,6%)** | **4 · 11 · 86** |
| 8 | 59 (3,6%) | 6 · 16 · 91 |
| 20 | 24 (1,5%) | 14 · 38 · 148 |

`k = 5` é o menor que fica abaixo de 10% de isolados. Subir mais compra cobertura pagando com
densidade — e densidade alta é a outra morte da dimensão.

⚠️ **A ORDEM MUDOU, e a medida obrigou.** P3 (centralidade) **não pode vir antes de P4**
(`SIMILAR_TO`): com `CO_EDITED` como única aresta, **92,8% do céu fica com `centrality = null` por
falta de aresta** — não por o Neo4j estar fora. PageRank sobre isso não cria dimensão útil, só
redistribui o nada sobre 7,2% dos corpos.

A ordem executável passa a ser **P4 → P3**: materializar a vizinhança semântica do Qdrant primeiro,
porque ela é a única aresta que alcança todo o corpus (todo nó tem vizinho semântico; nem todo nó
tem co-editor).

### 6.1 ✅ P6 — as duas relações que têm SETA (2026-08-08)

`scripts/citacoes.mjs` lê o DISCO e resolve cada citação contra a topologia — ponta que não é corpo
do céu não vira aresta, que é a lição do P2b (627 no disco viraram 4 exigindo os dois lados
indexados).

| relação | pares | corpos | cobertura | grau MED · P90 · máx |
|---|---|---|---|---|
| `REFERENCES` | 452 | 167 | **88,8%** | 3 · 11 · 36 |
| `IMPORTS` | 313 | 112 | 59,6% | 4 · 10 · 34 |

**A cobertura do `REFERENCES` passa a do `CO_EDITED`** (85,1%) — e ele afirma algo que nenhuma das
duas primeiras afirma: *quem aponta para quem*. `SIMILAR_TO` e `CO_EDITED` são estatísticas e
simétricas; citação é uma afirmação que alguém escreveu, e tem direção. É por isso que o arco delas
pulsa com sentido e o das outras respira sem seta.

⚠️ **`IMPORTS` é capacidade DESTE corpus, não do real.** O real tem zero código; `espatial_vivo`
inclui `.js/.mjs/.py` de propósito. `REFERENCES` transfere — prosa cita caminho em qualquer corpus.

⚠️ **O script APAGA as arestas do grupo antes de escrever.** Citação some quando alguém edita o
arquivo, e um grafo que só cresce descreve o passado em vez do corpus — a mesma razão pela qual o
overlay do servidor remove o campo antes de reaplicar.

⚠️ E ele achou uma armadilha viva: **`AGENT_CWD` exportado no perfil do shell** aponta para
`devshell-one`, que não existe desde a reorganização. A precedência cega ao ambiente devolvia
**0 arquivos lidos e um relatório inteiro de zeros** — resultado com cara de resultado. Os scripts
que leem disco agora CONFEREM que o caminho existe antes de obedecê-lo, e zero lidos é erro fatal.

### 7.1 ✅ P7 — e a extração livre NÃO liga nada (2026-08-08)

A condição estava cumprida: quatro relações medidas e a rede desenhando, então o grafo provou valor
sem LLM e o custo da inferência se justifica.

⚠️ **Mas a primeira versão produziu uma relação que não relaciona: 138 conceitos, ZERO
compartilhados.** Extração livre nunca colide como string — "replanejamento celeste" e "cosmologia
do céu" são o mesmo assunto e viravam dois nós. Cada corpo ficava com etiquetas particulares, e um
conceito que só um corpo exerce **descreve** o documento em vez de **ligar** dois. É rótulo com
custo de inferência.

**O conserto é consolidar por SIGNIFICADO, não por texto.** Os rótulos são embutidos com
`nomic-embed-text` — o vetorizador que o workspace já tem — e agrupados por cosseno. O limiar é
DERIVADO, com a mesma régua do `k` do `SIMILAR_TO`:

| limiar | conceitos | compartilhados | maior grupo |
|---|---|---|---|
| 0,68 | 76 | 16 | **13 corpos — engole mais da metade** |
| **0,72** | **100** | **16** | 8 |
| 0,76 | 111 | 14 | 5 |
| 0,85 | 133 | 5 | 2 |

O critério tem os dois lados: maximizar o compartilhamento **com** o teto de nenhum grupo tocar mais
da metade dos corpos — um conceito que todo mundo exerce não distingue ninguém, que é a armadilha da
classe vazia pelo avesso.

Resultado: **100 conceitos · 130 `ABOUT` · 23/23 arquivos de prosa · 16 compartilhados** (84%
continuam solitários, e isso está publicado). Os que ligam são reconhecíveis: *estrutura* (8
corpos), *renderização* (5), *classificação* (3), *memória viva* (3).

⚠️ **`ABOUT` liga `Astro → Concept`: as duas pontas não são corpos, então ela NÃO entra na rede da
seleção** — pela mesma razão que o `TOUCHED` ficou de fora (§5.1). O leitor dela é o painel
CONTEXTO, por `/api/vizinhanca`.

⚠️ **É a única dimensão deste sistema que não é fato.** Toda aresta carrega `modelo` e `as_of`, o
snapshot também, e o painel escreve *"inferido por qwen3:8b — não é medida"*. Apagar tudo o que veio
de inferência é uma consulta só, porque o tipo é próprio.

⚠️ E a EXTRAÇÃO é cacheada em `.cache/conceitos-brutos.json` enquanto a consolidação não é: sem
isso, cada ajuste de limiar pagaria uma extração nova — e **diferente**, tornando impossível saber
se o número mudou por causa do limiar ou do modelo.

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
