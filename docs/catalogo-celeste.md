# Catálogo celeste

**O que existe no céu do SpatIA**, de que fato cada corpo nasce, como ele varia e o que se vê.

Este documento descreve o **presente**. A pesquisa de taxonomia que deu origem a ele (2026-08-05/06)
e os dois briefings de refinamento visual (pulsar, buraco negro) já foram absorvidos: o raciocínio
que sobreviveu virou comentário no código, e é lá que ele mora. O `git log` guarda a medida que
decidiu cada número.

Vocabulário de status, o mesmo do `catalog.js`: `rendered` existe no céu · `partial` parte dela
desenha · `applied` outro módulo a aplica · `declared` está no modelo e nada a desenha. **Nenhuma
entrada mente sobre estar pronta.**

> **A fonte da verdade é o código, não este arquivo.** `src/space/catalog.js` classifica,
> `src/space/solver.js` resolve a pele, `src/space/lod.js` decide o que é desenhável. Quando este
> documento e eles discordarem, eles estão certos. `node scripts/censo-morfologias.mjs` dá a
> distribuição real do corpus atual.

---

## O princípio: a forma é o fato

Nenhum corpo desta cena é decorativo, e a regra vale nos dois sentidos — **feição sem fato por trás
não entra, e fato sem feição não é dado.** É por isso que o catálogo tem `forbids`, e por isso a
tabela "O que ficou de fora" é a parte mais densa dele.

| camada | pergunta | onde vive |
|---|---|---|
| **CLASSE** | o que este corpo **É** | `catalog.classify` |
| **MORFOLOGIA** | que corpo o **tipo de arquivo** declara | `MORPHOLOGY_BY_KIND` |
| **PELE** | o que ele **desenha de perto** | `solver.resolveBody` |

Uma classe pode recusar a morfologia declarada — o censo chama isso de **recusa do solver**, e é
saudável: a classe estrela cobre 87,5% do corpus e recusa `surface`, porque estrela não tem crosta.

⚠️ O texto anterior dizia "87,5% do corpus pede `surface` e leva `photosphere`"; a distribuição de
peles abaixo diz `photosphere` 35,9%. As duas medidas estão registradas; a conciliação não está.

## O eixo ortogonal: o PAPEL

Antes de "que objeto astronômico é este?" vem **o que este objeto faz no universo?** — independente
da classe. Duas entradas do mesmo papel podem ser corpos sem parentesco, e a mesma feição pode
ocupar papéis diferentes (a supernova é modificador aqui e seria fenômeno num modelo que tivesse o
commit como fato).

| papel | o que é | como se reconhece |
|---|---|---|
| **estrutura** | contêiner; não representa arquivo, e a POSIÇÃO dos filhos é o vínculo | não tem superfície própria |
| **corpo** | um nó do grafo, com massa e órbita | tem pele |
| **fenômeno** | acontece e passa; não tem massa nem órbita | dura menos que uma sessão |
| **modificador** | anexa-se a um corpo e não existe sem ele | some quando o fato some |

⚠️ **Dois dos quatro papéis passam pelo `catalog.js`**: ele resolve CORPO por classe e enumera
MODIFICADOR (`RING_BY_STATE`, envoltório, luas). FENÔMENO é desenhado em outro lugar. ESTRUTURA não
existe como papel: `galaxia` é estrutura e classe ao mesmo tempo, e é essa acumulação que a infla.

---

## Distribuição real — corpus de 1 862 nós (2026-08-07)

| classe | n | % | | pele | n | % |
|---|---|---|---|---|---|---|
| estrela | 1629 | 87,5% | | photosphere | 668 | 35,9% |
| galáxia | 228 | 12,2% | | station | 459 | 24,7% |
| cometa-extinto | 5 | 0,3% | | planet | 361 | 19,4% |
| | | | | galaxy | 228 | 12,2% |
| | | | | comet | 103 | 5,5% |
| | | | | nebula | 43 | 2,3% |

Morfologia por tipo de arquivo: `config` → fotosfera 499 · `agent` → estação 414 · `doc` → planeta
332 · `schema` → fotosfera 159 · `script` → cometa 103 · `infra` → estação 47 · `compose` → nebulosa
44 · `lock` → estrela 12 · `decision` → planeta 12 · `memory` → planeta 12.

⚠️ `compose` → nebulosa conta 44 arquivos e a pele `nebula` conta 43. A diferença de um não está
explicada.

⚠️ **A distribuição é do corpus, não do catálogo.** Um corpus sem `docker-compose.yml` não tem
nebulosa nenhuma, e isso não é buraco de cobertura — é o céu descrevendo o repositório com
honestidade. A doutrina de cobertura (fixture · fixture paramétrico · corpus real) está em
[`cobertura.md`](./cobertura.md).

---

# A escada de contenção — o papel ESTRUTURA

O payload tem **três níveis de nó** (`repo` → `dir` → `file`, em `server/graph.py`) e **um só tipo
de aresta**: as 1 856 são todas pai→filho. Os dois primeiros níveis resolvem para a MESMA classe, e
é aí que a galáxia deixa de descrever alguma coisa — 228 agregados para 1 629 arquivos são **7,1
arquivos por agregado**, contando repos e pastas juntos. Uma galáxia de sete estrelas é um
aglomerado aberto.

| escala | fato no payload | hoje | no modelo | status |
|---|---|---|---|---|
| workspace | a cena inteira | universo | universo | `rendered` |
| repositório | `type === 'repo'` | galáxia | **grupo de galáxias** | `declared` |
| pasta densa | `type === 'dir'` + nº de filhos | galáxia | galáxia | `partial` |
| pasta rasa | idem | galáxia | **aglomerado estelar** | `declared` |
| arquivo | `type === 'file'` | estrela | estrela | `rendered` |
| seção | `node.sections` | lua | lua | `applied` |

**O fato que separa aglomerado de galáxia já é contado.** `_hierarchy` conta filhos diretos por
diretório (`dir_children`) e usa a contagem para decidir quem vira hub; `degree()` está marcado
DISPONÍVEL no estágio 3 de [`modelo-de-renderizacao.md`](./modelo-de-renderizacao.md). Falta o
limiar — e ele tem de ser **medido** na distribuição de filhos por diretório, como o piso do pulsar
foi, caindo num afinamento da distribuição e não na parte densa dela.

Grupo de galáxias custa ainda menos: `type` já distingue `repo` de `dir` e o solver já ignora a
diferença (`node?.type === 'repo' || node?.type === 'dir'` devolve a mesma pele). É o item 6 da
ordem de adoção do modelo de renderização.

⚠️ **Esta escada discorda de `modelo-de-renderizacao.md`, que mapeia *pasta → sistema estelar*.** O
motivo é o `sections`: sistema estelar é uma estrela com corpos em órbita, e isso **já é o arquivo
com suas luas** — 23 corpos e 182 luas medidos na janela Roche→Hill. Uma pasta contém arquivos que
já são sistemas; logo ela é aglomerado ou galáxia, nunca sistema.

---

# Os corpos

## Estrela — a classe padrão

**Representa:** o arquivo indexado comum, sem sinal que o distinga.
**Pele:** `photosphere` (config, schema) ou `planet` (doc, decision, memory).

De longe é um ponto num `THREE.Points` com centenas de irmãos — o campo inteiro custa 0,45 ms de
GPU, e centenas de malhas de esfera não caberiam nesse orçamento. De perto, **um** corpo ganha
geometria: o que a câmera travou.

**Fotosfera** — granulação de convecção fervendo, manchas escuras, limbo escurecido. Sem relevo e
sem mar: o catálogo proíbe crosta na estrela, porque relevo afirmaria corpo sólido.

**Planeta procedural** — gerado por semente do caminho. Continentes, mares, calotas, atmosfera com
espalhamento no limbo. É a pele de `doc`, e a diferença com a fotosfera é categórica: documento é
coisa acabada, com superfície; configuração é coisa viva, que ferve.

## Galáxia — o agregado

**Representa:** uma pasta (`node.type !== 'file'`). Os arquivos dela são a população.
**Variações:** quatro classes de Hubble — **S0** (lenticular, sem braços), **Sa**, **SBb**, **SBc**.

A classe sai da contagem de arquivos e da concentração; o número de braços é o número de GRUPOS de
arquivos daquela pasta. Passo do braço, razão bojo/disco e cor saem das faixas observadas por
classe (Sa 4–25°, Sb 8–35°, Sc 10–50°). **Não é decoração:** olhando o céu, uma pasta rasa e uma
pasta profunda têm silhuetas diferentes.

Em foco o disco vira **mundo** e responde à órbita da câmera; fora de foco continua billboard.

**Escada de detalhe:** 26 px (braços) → 90 px (textura) → 200 px (pleno), em pixels de raio do
disco. A mediana do corpus fica em 32 px — o estado normal é o pé da escada.

## Quasar — o núcleo ativo

**Representa:** a pasta massiva cujo bojo passa do limiar **e** que está acretando. Sete acesos no
corpus atual (≈3%, contra ~1% de quasares luminosos e ~10% de Seyferts na natureza).
**Não é um pulsar ampliado** — é um motor de acreção.

Desenho instanciado sobre o campo de hubs, não corpo do céu. Seis componentes existem: **disco de
acreção**, **corona quente interna**, **jatos relativísticos** (Doppler `δ^(2+α)` a β = 0,9),
**toro de poeira** (abertura de 55°, modelos de unificação), **lóbulos sincrotron** e o horizonte
como vazio central. A radiação volumétrica entra pelo contínuo da corona.

⚠️ **Broad-line region, partículas de acreção e lente ficam conscientemente de fora**, e o número é
o argumento: `CORE_RADIUS = 0,016` do disco da galáxia, mediana do corpus a 32 px → o núcleo do
quasar tem **0,5 px** e o disco de acreção dele 2,2 px. A BLR (0,01–0,1 pc contra 1–10 pc do toro)
cairia em menos de meio pixel. Custo sem imagem.

## Estação — o corpo de um agente

**Representa:** `agent` e `infra`. É **o único corpo não natural do céu**, e por isso o único que
não é feito de ruído — ruído é a ferramenta certa para o que a natureza faz e errada para o que
alguém projetou.

Módulos, treliça, painéis solares retangulares. O **farol** é a única parte que pulsa, e carrega a
única informação que muda: atividade (`churn`). Agente parado tem farol apagado, e isso é o dado.

> Painel solar é retângulo de borda dura, e isso é fidelidade. O bloom antigo o escondia.

## Cometa — o corpo que aponta

**Representa:** `script`. **O único corpo anisotrópico do céu** — todos os outros têm a mesma
silhueta de qualquer ângulo.

A cauda aponta para longe da fonte de radiação, **sempre**, e não segue a órbita. A atividade sai
do churn por `log₂(1+churn)/log₂(28)`, e ela move três coisas juntas: coma (0,9 → 2,4 raios), cauda
(22% → 100% do máximo) e brilho. Núcleo de albedo 0,04 — escuro, como cometa real.

**Cometa extinto** é uma CLASSE separada, não um estado: arquivo dormente há duas janelas e sem
churn. Superfície sem cauda — o gelo acabou.

⚠️ A coma do cometa ativo **satura** em 255 num platô de 0,7 a 1,5 raios. Medido: não é geometria,
é estouro de exposição, e o perfil não tem degrau onde a borda do quad estaria. Pela regra da
física o conserto seria de apresentação, não da coma.

## Nebulosa — a ausência de superfície

**Representa:** arquivo de `compose`. **O único corpo do céu sem superfície:** gás e poeira sem
contorno, transparente em qualquer direção. Todas as outras peles respondem "o que há na superfície
deste objeto"; esta responde que não há.

A nuvem cresce com a massa do arquivo. Enquadramento 3,4 (o maior do céu), porque o que se enquadra
é a nuvem, não um corpo.

## Pulsar — o ritmo

**Representa:** arquivo com **regularidade ≥ 0,5** — commits em cadência, não em rajada. O que o
define não é o corpo (uma estrela de nêutrons tem 10 km: em qualquer escala útil é um ponto), são
os **feixes**.

Hierarquia de escalas, em raios do corpo:

| camada | alcance | o que é |
|---|---|---|
| núcleo + hotspots polares | 1 | 10% esfera, o resto é emissão |
| magnetosfera | ~7 | casca de densidade, `L = 1/sin²θ`, com trechos apagados |
| cone de emissão | 7–12 | duas oitavas de ruído ao longo do eixo, média 1 |
| vento relativístico | 25–47 | toro, espiral de Arquimedes, concentração equatorial |
| **nebulosa de vento** | **>50** | teia sincrotron achatada no equador, brilhante no limbo |

Um batimento só governa brilho, calota, halo e vento — **exceto a nebulosa**, que não respira: ela
tem milhares de anos e o pulso tem segundos.

A cor vem de uma rampa **sincrotron por energia** (branco do polo → azul → roxo da cauda), com o
tipo do arquivo entrando apenas como tingimento de 28%. Beaming relativístico `0,35 + 2,4·cos³`.
Lente gravitacional de campo fraco no passe de tela.

⚠️ O piso 0,5 foi medido em ~6.400 caminhos versionados (`catalog.js`): 287 têm regularidade acima
de zero, ≥0,3 → 110 · ≥0,4 → 67 · ≥0,5 → 27 · ≥0,6 → 17 · ≥0,7 → 7. O salto entre 0,4 e 0,5 é o
afinamento onde o corte cai. **Medição de 2026-08-07 no corpus indexado: nenhum corpo acima do
piso, topo em 0,452.** O corpo é `rendered` e a população é zero.

## Buraco negro — o núcleo cognitivo

**Representa:** o agente. **É o único corpo que não descreve um arquivo** — ele descreve o estado
de quem está respondendo.

O horizonte não é uma esfera preta: é a **sombra gravitacional**, com raio aparente √27/2 ≈ 2,6 R_s,
e a borda dela é macia sozinha porque a fração de raios capturados cresce continuamente perto do
parâmetro de impacto crítico. Tudo é traçado geodésico — o anel de fótons, o arco do lado distante
por cima da sombra e a lente do fundo **são o mesmo raio**, não três desenhos que precisam
concordar.

Disco de 3,7 a 18,2 R_s (a borda interna é a imagem aparente da ISCO). Espessura pela lei
`τ/cos(i)`, a mesma do anel planetário. Vazio e filamento por limiar, nós quentes na temperatura,
assimetria m=1 precessando rígido, corona somando sem alfa fora da borda externa, ejeção a cada
14 s.

**O lado distante afunila** 3,00× a 78°, 4,75× a 72° e 6,70× a 66°, contra 1,07–1,11× da imagem
direta — o efeito é da geodésica e `scripts/lado-distante.mjs` o trava.

### Regimes cognitivos → parâmetros físicos

Ele não "fica animado": muda de regime, e o regime é o estado real do agente. A convergência é
exponencial a 2,4/s, então a troca é sentida como aceleração e não como corte.

| regime | giro | intensidade | turbulência | **espessura** |
|---|---|---|---|---|
| boot | 0,05 | 0,25 | 0,4 | 0,55 |
| idle | 0,18 | 0,75 | 0,6 | 0,70 |
| searching | 0,70 | 1,00 | 1,3 | 1,10 |
| retrieving | 0,60 | 1,10 | 1,1 | 1,15 |
| answering | 1,15 | 1,60 | 1,0 | 1,30 |
| thinking | 0,85 | 1,25 | 1,5 | **1,45** |
| error | 0,12 | 0,50 | **2,6** | 0,85 |

A espessura não é escolha estética: em disco de acreção a razão de aspecto `h/r` **cresce com a
taxa de acreção**. Regime que processa mais matéria infla; regime parado assenta.

**Carga cognitiva** (`cogload`, tokens estimados) engrossa até +45% e ilumina até +20%, saturando
por `1 - exp(-t/60000)` — saturação porque o cliente não conhece o teto da janela do modelo.

Bancada: `spatia.core({ regime: 'thinking', tokens: 120000 })`.

---

# Fenômenos — o que a SESSÃO desenha

Quatro já estão no céu. Classe é do arquivo, e **fenômeno não é de arquivo nenhum — é da sessão**.
Todos nascem do stream de [`EVENTS.md`](./EVENTS.md), não do índice, e por isso somem sozinhos.

| fenômeno | evento | o que é | onde |
|---|---|---|---|
| **corona de ignição** | `memory` | o nó recuperado acende; passa | `catalog.js`, `features.corona` |
| **satélite de busca** | `web` | provedor externo em órbita alta (74) e plano inclinado, para ler como "fora do sistema"; sem chave fica APAGADO, não ausente | `space/satellites.js` |
| **wormhole de ferramenta** | `tool` | anel que abre, gira e fecha, na cor de `tool.kind`. O par `call`/`result` tem começo e fim, e o anel também — **anel que fica aberto é ferramenta que nunca retornou** | idem |
| **meteoro** | `web.result` | o resultado voltando do satélite para o núcleo | `space/scene.js` |

⚠️ Fenômeno não tem massa nem órbita, e dar-lhe uma seria o erro que a supernova-classe cometeu:
como classe, ela sequestrava o corpo e tirava dele as duas superfícies possíveis (27 corpos medidos
em 2026-08-05). Evento que ganha órbita vira corpo, e aí ele não passa mais.

---

# Modificadores — anexáveis a qualquer corpo

## Anel — o estado do git

**A única coisa na cena que fala do disco AGORA.** O céu inteiro mostra conhecimento indexado, e
índice é sempre uma foto do passado; apareceu anel, aquele arquivo mudou depois da reindexação.

| estado | família | alcance | espalhamento | assinatura |
|---|---|---|---|---|
| `modified` | **saturn** | 2,45 | retro | faixas largas C/B/A, Divisão de Cassini, lacuna de Encke, F estreito por fora |
| `staged` | **uranus** | 2,2 | retro | dez anéis estreitos e separados, o ε mais largo e brilhante |
| `untracked` | **jupiter** | 3,2 | forward | halo espesso e difuso, anel principal fino, dois gossamer desbotando |

As três famílias têm **assinaturas fotométricas opostas** — é isso que as distingue de longe, mais
do que a cor. Rotação kepleriana (`ω ∝ r^-1.5`): a borda interna gira mais rápido que a externa.

⚠️ O anel é **evento, não estado**: existe enquanto o trabalho está aberto e some no commit. Por
isso ele vence o envoltório de supernova quando os dois cabem no mesmo corpo — ganha o sinal
perecível, que é acionável agora e se limpa sozinho.

## Envoltório de supernova — a história violenta

Arquivo com churn acima do piso. De longe vive dentro do sprite (`envelope()` sobre
`gl_PointCoord`); de perto ganha geometria própria. 2% do corpus.

## Luas — as seções do arquivo

Um arquivo com **≥ 5 seções** e massa suficiente ganha luas. Órbitas elípticas, sem colisão, dentro
da janela Roche→Hill (`ROCHE_FLUID = 2,44` raios). O piso de legibilidade
(`MOON_MIN_OVER_OUTER = 0,0154`) mede contra a órbita externa, que é quem fixa a distância da
câmera — foi ele que fez a lua virar corpo em vez de um ponto de 1,27 px.

Com o astro em foco, as órbitas ganham traço.

---

# O modelo declarado

⚠️ **Nada desta seção está no céu.** Toda entrada aqui nasce `declared`, e ela existe para que a
pergunta "de que fato isso nasceria?" tenha resposta antes de alguém escrever shader.

**Um fato ausente explica quase a lista inteira: o grafo não tem aresta que não seja de contenção.**
As 1 856 arestas são pai→filho. Referência, import, similaridade e dependência não existem no
payload — os vetores estão no Qdrant e não saem de lá para a topologia. Enquanto isso não mudar,
toda feição que afirme RELAÇÃO entre dois corpos afirma um fato que ninguém mediu. É a mesma razão
pela qual `importance()` está AUSENTE no estágio 3 do modelo de renderização: PageRank sobre árvore
é função degenerada de profundidade e grau.

| papel | entrada | nasceria de | o que falta |
|---|---|---|---|
| estrutura | **grupo de galáxias** | `type === 'repo'`, já no payload | só o desenho |
| estrutura | **aglomerado estelar** | nº de filhos diretos do `dir`, já contado em `_hierarchy` | o limiar, e ele tem de ser medido |
| corpo | **protoestrela** | arquivo na fila de indexação | **o nó**: a topologia nasce da varredura do Qdrant (`graph.py`, `qdrant.scroll`), e arquivo sem chunk não tem nó. Exige o servidor emitir o que está NA FILA, não só o que está no índice |
| corpo | **anã branca** | massa alta com `churn` 0, `dormant` 0 e recência no fundo | nada no dado — os quatro campos já chegam no nó; falta o corte e o desenho |
| corpo | **binária** | duas fontes inseparáveis (parser+lexer, interface+implementação) | **a aresta**: nenhuma relação não-hierárquica existe em `server/graph.py` |
| corpo | **exoplaneta** | recurso externo referenciado (API, SaaS, URL) | **o nó**: nada de fora do índice entra no grafo |
| fenômeno | **eclipse** | conflito de merge | o FATO quase existe — `server/dirty.py` já lê `git status`, e hoje `UU` cai em `staged`, ou seja, o conflito é desenhado como anel de Urano dizendo "preparado para commit". Falta a FEIÇÃO: ocultação exige dois corpos alinhados, e a posição no céu vem da recência, não da relação |
| fenômeno | **chuva** de meteoros | volume de eventos não solicitados (webhooks, journal) | o meteoro único já existe; a chuva exige eventos que hoje não chegam à cena |
| modificador | **campo gravitacional** | importância no grafo | **a aresta**, de novo: o grafo é árvore |
| modificador | **satélite artificial** · **entrelaçamento** | teste↔alvo, relação permanente | a MESMA aresta ausente da binária — três feições, um fato |

## As recusas do modelo declarado

`forbids` vale para o que ainda não desenha, senão a colisão só aparece na tela:

| entrada | recusa | motivo |
|---|---|---|
| protoestrela | anel `untracked` | os dois dizem "novo" — um pelo git, outro pelo índice. Ganha o anel, pela mesma regra que o faz vencer o envoltório: ele é o sinal perecível |
| anã branca | classe `cometa-extinto` | `dormant ≥ 2` é mais específico. Ali houve trabalho e ele parou; a anã branca é o arquivo que nunca esquentou |
| binária | lua | lua é PARTE do corpo (uma seção); binária são dois corpos com massa própria. Desenhar uma como a outra afirma contenção onde há par |
| exoplaneta | estação | servidor MCP já é ESTAÇÃO, e o motivo é o mesmo que vale para `agent` e `infra`: alguém construiu aquilo. Exoplaneta é o que ninguém aqui construiu |
| aglomerado estelar | braços espirais | braço é padrão de densidade de disco, e aglomerado aberto não tem disco. A classe de Hubble continua sendo da galáxia |
| grupo de galáxias | superfície, supernova, recência | é agregado de agregados: herda inteiras as três recusas que a classe `galaxia` já declara |
| chuva de meteoros | órbita | ver a advertência da seção "Fenômenos" — evento com órbita vira corpo |

---

# A revisão de 2026-08-07 — o objeto como manifestação de eixos

⚠️ **`declared` inteiro.** Nada desta seção existe no código, e algumas medidas que a sustentam
discordam do resto deste documento — as discordâncias estão marcadas, não resolvidas.

Tese: **o filesystem não é a taxonomia do universo**, é uma das fontes de observação. Hoje o
catálogo deriva `filesystem → tipo → objeto`. A proposta é `Entidade → (escala · composição ·
atividade · papel · relações · linguagem · idade · dinâmica) → objeto celeste`: o objeto deixa de
ser escolhido por regra fixa ("arquivo X vira planeta") e passa a ser a **manifestação** de um
estado físico multidimensional. Dois objetos só parecem iguais quando compartilham as propriedades
fundamentais, e diferença importante (linguagem, coedição, autoria, composição) vira visível sem
abrir menu.

## 1. Linguagem é um eixo cosmológico

Medido: **58% TypeScript · 12% Python · 10% Markdown · 5% JSON**, e **92% das pastas têm uma
linguagem dominante**. Os eixos em uso hoje (quantidade, churn, recência, tipo) ignoram justamente
o atributo que melhor explica a composição da galáxia.

⚠️ **Discorda da distribuição por `kind` deste documento**, que não tem categoria de código: 499
config · 414 agent · 332 doc · 159 schema · 103 script · 47 infra · 44 compose · 12 lock · 12
decision · 12 memory. Uma medição independente do índice de 2026-08-07 dá **0 arquivos `.ts`/`.py`
e 46% `.md`**. As duas medidas não podem ser do mesmo corpus.

Proposta: o braço da galáxia deixa de representar grupos (que "quase não existem") e passa a
representar linguagem — ou, melhor, a galáxia ganha **espectro**: 100% TS → azul, 100% Python →
amarelo, 100% Markdown → vermelho, mista → gradiente. Reconhece-se o repositório pela cor, como se
faz com estrelas.

## 2. Galáxias deveriam ser raríssimas

Medido: **1347 pastas → 228 hubs → 7 repositórios**, e **35% das pastas têm 1 arquivo só**. A
natureza tem bilhões de estrelas, milhões de aglomerados e poucas galáxias; o céu de hoje tem
praticamente o inverso.

Escada proposta por contagem de arquivos:

| arquivos | objeto |
|---|---|
| 1 | corpo |
| 2–10 | sistema |
| 10–80 | aglomerado |
| 80–300 | associação estelar |
| 300+ | galáxia |

Uma pasta como `src` vira um punhado de estrelas, não uma galáxia. Isto é a mesma escada de
contenção da seção acima, com o limiar já proposto em números.

## 3. O git é uma fonte de gravidade

Já existem commit, autor, tempo, pares, frequência e co-edição — e isso é física, mais interessante
que embeddings.

**Binárias:** `cache.ts` ↔ `cache.test.ts` com **J = 1.0** (Jaccard de co-edição). Merece virar
objeto, não linha: uma estrela binária literal. **Sistema múltiplo:** `en.json` · `pt.json` ·
`es.json` deixa de ser binária e vira sistema múltiplo, ou pequeno sistema hierárquico — a
astronomia tem os dois, e comunica "esses arquivos vivem juntos" melhor que qualquer aresta.

⚠️ A binária está listada em "O modelo declarado" como bloqueada pela **aresta ausente**. A
co-edição do git é uma aresta que o payload ainda não carrega; medi-la não é o mesmo que emiti-la.
⚠️ O exemplo `cache.ts`/`cache.test.ts` pressupõe TypeScript no corpus — ver a discordância do
eixo 1.

## 4. Compose deveria deixar de ser um objeto

Hoje `compose.yml` → nebulosa. Mas a medição conta **308 serviços**: a nebulosa está escondendo os
próprios corpos. Proposta: `Nebulosa → serviços → protoestrelas`, ou `Nebulosa → sistemas`. Cada
serviço nasce da condensação da nuvem, que é fiel ao processo de formação estelar.

⚠️ Uma contagem independente de 2026-08-07 dá **164 serviços em 44 arquivos compose**. Os dois
números estão registrados; nenhum foi escolhido.

## 5. Bytes e conhecimento são massas diferentes

Hoje `massa = chunks`. Uma imagem de **7,7 MB** produz **0 chunks**, logo massa 0 — o que claramente
não deveria. Proposta: separar `PhysicalMass` de `KnowledgeMass`. Um PDF enorme tem massa física
alta e massa cognitiva baixa; um README tem massa física baixa e massa cognitiva enorme. É o par
matéria bariônica × matéria escura: uma mede o que é material, a outra a influência gravitacional.

⚠️ **Dentro do índice, bytes e chunks correlacionam a r = 0,980** (medição de 2026-08-07). A
separação só produz sinal para o que está FORA do índice — que é, por construção, o que não tem nó
(ver `protoestrela`, no modelo declarado).

## 6. Autoria também é física

**15 autores → estrela muito antiga; 1 autor → estrela isolada.** E: múltiplos autores → mais
turbulência na fotosfera · autor único → rotação mais estável · troca frequente de autores →
atividade magnética mais intensa. Dado visualmente rico e praticamente gratuito — o `git log` que
produz churn e regularidade já passa por ele.

## Os dez eixos

| eixo | origem | efeito |
|---|---|---|
| **Escala** | arquivos, chunks, bytes | Lua → Sistema → Aglomerado → Galáxia |
| **Composição** | kind | Planeta, Estação, Nebulosa, Cometa |
| **Linguagem** | extensão dominante | espectro, cor, metalicidade |
| **Atividade** | churn, recency | brilho, ejeções, pulsação |
| **Gravidade** | centralidade, referências, uso | massa gravitacional e órbitas |
| **Relações** | git, embeddings, testes | binárias, sistemas múltiplos, entrelaçamentos |
| **Evolução** | idade, histórico | protoestrela, estrela madura, anã branca |
| **Estrutura** | sections, serviços | luas, satélites, subcorpos |
| **Autoria** | git blame, commits | rotação, turbulência, variabilidade |
| **Matéria** | bytes físicos × conhecimento | densidade, volume, influência |

---

# A segunda cena — `universe`

[`briefings/multi-scene.md`](./briefings/multi-scene.md) pede uma cena sem centro absoluto, em que
a pasta CONTENHA seus arquivos em vez de puxá-los por uma linha que atravessa a tela. **O papel
ESTRUTURA é exatamente o eixo que aquela cena consome e a `agentic` não usa.**

Na `agentic` o centro é o buraco negro — o único corpo que não descreve arquivo — e a contenção é
desenhada como `LineSegments` do arquivo (r≈26–62) até o hub (r≈19–33). O `catalog.js` já registra
o preço disso na classe `galaxia`: raios diferentes têm ω diferente por `speed = (r/r₀)^-1.5`, então
o vínculo se torce. Com a contenção virando POSIÇÃO, as 1 856 arestas deixam de ser linha e o
enrolamento deixa de ser um problema a resolver — filho dentro do pai gira com ele.

A escada de contenção é o que aquela cena precisa que exista antes da câmera: sem separar repo de
pasta e pasta densa de pasta rasa, "galáxia" continua sendo o mesmo objeto em duas escalas, e uma
hierarquia navegável por zoom não tem degrau em que parar. Nada de implementação está projetado aqui.

---

# Enquadramento — quanto de cada corpo cabe na tela

`SKIN_EXTENT` é **recuo**, não tamanho: `px_na_chegada = FOCUS_FIT_PX / SKIN_EXTENT`. `BODY_SPAN` é
a fração do raio de referência que a pele preenche com corpo desenhado.

| pele | extent | LOD_FAR | LOD_NEAR |
|---|---|---|---|
| photosphere | 1 | 90 | 200 |
| planet | 1 | 90 | 200 |
| station | 1,15 | 34 | 120 |
| pulsar | 1,2 | 26 | 100 |
| comet | 1,6 | 30 | 110 |
| nebula | 3,4 | 22 | 95 |

⚠️ A tabela de px medidos no cabeçalho de `lod.js` é de 2026-08-06 e traz os extents ANTIGOS
(pulsar 2,6, cometa 3). Os valores acima são os vigentes — os dois encolheram quando o
enquadramento passou a mirar a figura e deixar a extensão sair do quadro.

**Enquadra-se a FIGURA, não a extensão.** A cauda do cometa (9 raios) e a nebulosa de vento do
pulsar (>50 raios do corpo) saem do quadro de propósito — é o mesmo princípio, e ele passou pelo
olho do usuário no cometa antes de valer para o pulsar.

`lod.js` **lança na carga** se uma pele não declarar `BODY_SPAN` ou se o recuo não alcançar o piso
de detalhe. Declarar a invariante não a implementa; o `throw` implementa.

---

# Apresentação — o bloom é uma PSF

Glare de instrumento óptico é **forte em fonte pontual e fraca em fonte extensa**: a luz de um
objeto extenso já está espalhada por muitos pixels e cada um contribui pouco para a auréola.

Valores atuais: **força 0,62 · limiar 1,15 · raio 0,20**. O limiar é linear, e em 0,54 quase todo o
céu cruzava o corte — o bloom deixava de ser realce e virava névoa global, com as galáxias virando
borrões brancos. O raio é fixo em tela e o objeto não é: um halo que no buraco negro de 600 px é uma
borda cobria inteira uma galáxia de 60 px.

⚠️ O **ACES roda depois do bloom** (`OutputPass` é o último passe): o bloom soma em linear e a curva
tonemapeia a soma, convergindo para branco acima de ~1,5. O branco era composto — fonte + halo —, e
por isso mexer só na força não resolvia.

O brilho de cada objeto **nasce no shader**; o bloom só amplifica. Conferido com o bloom em zero:
o buraco negro não perde brilho, ele ganha estrutura.

Sondas: `spatia.bloom({ threshold, radius })` · `spatia.core({ regime, tokens })` ·
`spatia.lod()` · `spatia.planet()` · `spatia.galaxy()` · `spatia.moons()`.

⚠️ **O objeto é `window.spatia`**, e a lista viva está em `src/main.js` — quando os dois
discordarem, o código está certo. ⚠️ Não confundir com as CHAVES `espatial.trace` / `espatial.*.v1` do
`localStorage`, que continuam com o nome antigo **de propósito** (renomeá-las apaga o que está
gravado, em silêncio — ver a tabela de `docs/identidade.md`).

---

# O que ficou de fora, e por quê

| ideia | por que não |
|---|---|
| broad-line region / partículas no quasar | 0,5 px — custo sem imagem |
| disco de fallback no pulsar | fallback é supernova recaindo, não cascata colisional; a cena não modela nenhum dos dois |
| anel em cometa | cauda e anel juntos não descrevem nada |
| crosta em estrela | relevo afirmaria corpo sólido |
| supernova em galáxia | agregado não tem história própria, tem a dos filhos |
| supernova como FENÔMENO | `node.supernova` é churn acumulado numa janela: continua verdadeiro amanhã, e é a definição de estado. O evento exigiria o commit como fato, e o nó carrega uma data (`changed_at`), não uma série |
| nova | mesmo fato ausente da supernova-evento, e nada a distinguiria dela na tela |
| gigante vermelha | massa já é raio contínuo (`log2(1+chunks)`) e idade já é raio orbital — arquivo enorme e antigo JÁ se vê grande e longe. Classe aqui seria degrau onde há contínuo, e o vermelho disputaria com `kind`, que é quem carrega o TIPO |
| aurora | o processamento contínuo já tem feição: o `cogload` no disco do buraco negro |
| atmosfera como maturidade | atmosfera já é feição do planeta e sai da massa; dois significados na mesma imagem |
| magnetosfera como permissão | o nome é da camada de ~7 raios do pulsar — e num workspace de um usuário só, a feição seria idêntica em todo o céu. Feição sem variação não é dado |
| campo de detritos | `disco-de-detritos` já existe e é a resposta da ESTRELA ao arquivo sujo. "Depreciado mas ainda referenciado" precisaria da aresta que não existe |
| sistema estelar como estrutura nova | já existe: é o arquivo com suas luas, na janela Roche→Hill |
| superaglomerado · filamento cósmico | a árvore do payload termina no `repo` e a cena inteira é UM workspace. Dois níveis acima do topo não teriam nó para habitar |
| asteroide | o papel é o da lua, e `sections` já o alimenta |
| meteoroide como corpo | é evento, e já desenha como tal |
| wormhole como corpo | é fenômeno, e já desenha como tal (`space/satellites.js`) |
| magnetar · blazar | o pulsar já cobre o comportamento e o quasar já é o núcleo ativo; blazar é o mesmo quasar visto de frente |
| Wolf-Rayet · T-Tauri · cefeida | nenhum fato do nó os separaria da estrela padrão — a cadência já é o pulsar |

---

# Onde procurar o resto

- **A física de cada corpo** — o cabeçalho do módulo em `src/space/`. Eles são longos de propósito.
- **A decisão por trás de cada número** — `git log`, no commit que o introduziu.
- **A distribuição do corpus** — `node scripts/censo-morfologias.mjs`.
- **Cobertura e o que o fixture exercita** — [`cobertura.md`](./cobertura.md).
- **Como a cena é desenhada** — [`modelo-de-renderizacao.md`](./modelo-de-renderizacao.md).
- **Os fenômenos, um a um** — [`EVENTS.md`](./EVENTS.md), que é o contrato de onde eles nascem.
- **A cena que consome as estruturas** — [`briefings/multi-scene.md`](./briefings/multi-scene.md).
- **A bancada, um objeto por vez, sem pós-processamento** — `canvas.html`.
