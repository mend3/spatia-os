# Modelo de renderização — seis estágios, 2026-08-05

Como um corpo do céu decide o que ele é, que forma tem, de que tamanho, o que carrega e como se
move. Seis estágios, cada um com uma responsabilidade só.

Este documento governa **renderização**. A taxonomia astronômica — que corpo existe e com que regra
física — continua em [`catalogo-celeste.md`](catalogo-celeste.md).

> **O modo de falha que ele existe para impedir:** semântica, física e estado disputando a mesma
> dimensão visual. Quando isso acontece, o observador vê um anel e não sabe se ele significa
> "arquivo em edição", "muitas relações" ou "tipo config" — e a partir daí nenhuma das três
> informações existe de verdade.

---

## O pipeline

```
  kind ──▶ 1. IDENTIDADE ──▶ 2. MORFOLOGIA ─┐
                                            │
  grafo ─▶ 3. COSMOLOGIA ───────────────────┤
                                            ├──▶ 5. SOLVER ──▶ RenderableBody ──▶ 6. ANIMAÇÃO
  fatos ─▶ 4. ESTADO (candidatos) ──────────┘   (compatibilidade)   { malha, material,
                                                                      feições, órbita }
```

Duas propriedades que o desenho garante:

**Modificador nunca é aplicado direto.** Ele entra como *candidato* e passa pelo solver. É a
diferença entre uma regra que cada classe carrega (e que se perde quando as classes somem) e um
estágio por onde tudo obrigatoriamente passa.

**Animação não decide nada estrutural.** Ela recebe um objeto já resolvido e anima. Se ela pudesse
escolher feição, existiriam duas autoridades sobre a mesma pergunta.

| Estágio | Responde | Vem de | Muda quando |
|---|---|---|---|
| 1. Identidade | o que este objeto É | `kind` | nunca |
| 2. Morfologia | que forma ele tem | `kind` | nunca |
| 3. Cosmologia | que tamanho, que capacidades | grafo | o corpus muda |
| 4. Estado | o que está acontecendo com ele | fatos | a qualquer momento |
| 5. Solver | o que sobrevive junto | as regras de composição | — |
| 6. Animação | onde ele está agora | elementos orbitais + tempo | nunca (é `f(t)`) |

### Por que isto substitui "massa decide a classe"

O `catalogo-celeste.md` estabeleceu que massa decide a CLASSE e composição decide o TIPO. A regra
resolveu o bug que a originou — um corpo saía com anel E casca, duas classes no mesmo objeto — mas
resolveu **fundindo**: usa uma dimensão só para carregar forma, escala e estado ao mesmo tempo. O
custo disso está medido em [O que isto corrige](#o-que-isto-corrige-com-medida).

⚠️ **Nota de linguagem:** este projeto é ESM puro, sem build e sem TypeScript — os módulos citados
adiante são `.js` com JSDoc. Interface aqui é contrato documentado, não tipo verificado.

---

## 1. Identidade

`kind` diz o que o arquivo é: `config`, `doc`, `script`, `agent`, `infra`, `compose`, `decision`,
`lock`, `memory`, `schema`.

É o único eixo que **não influencia física** — nem massa, nem órbita, nem atração. Ele escolhe a
morfologia, e nada mais.

## 2. Morfologia

`kind → forma`. Geometria, material, shader, LOD, silhueta. Nada além.

Contagem do corpus em 2026-08-05 (397 arquivos; os 9 `lock` não entram no céu, então a cobertura é
sobre 388):

| Morfologia | kinds | corpos | cobertura acumulada | estado |
|---|---|---|---|---|
| **fotosfera** | `config`, `schema` | 126 | 32% | implementada (`photosphere.js`) |
| **planeta** | `doc`, `decision`, `memory` | 95 | **57%** | implementada (`planet.js`) |
| **cometa** | `script` | 57 | 72% | proposta |
| **estação** | `agent` | 54 | **86%** | proposta |
| **pulsar** | `infra` | 39 | 96% | proposta |
| **nebulosa** | `compose` | 17 | **100%** | proposta |

Duas morfologias já existentes cobrem 57% do céu. **Cometa e estação levam a 86%** — é onde o
esforço de bancada rende mais, e nessa ordem.

`decision` e `memory` **não ganham morfologia própria**: são markdown, logo planetas. O que os
distingue é Estado e Animação, não forma. Uma sétima forma para 15 corpos gastaria um shader para
dizer o que uma cor e uma órbita já dizem.

### A régua que decide gasoso × sólido

`kind` decide se o corpo é **emissivo** (fotosfera, pulsar, nebulosa) ou **sólido** (planeta,
cometa, estação). É essa fronteira que governa a superfície procedural de perto: relevo, mar,
atmosfera e nuvens só existem em corpo sólido. Estrela tem fotosfera — gás opaco, sem terminador.

E ela resolve o anel sem exceção: **corpo sólido sujo ganha anel planetário; corpo emissivo sujo
ganha disco de detritos.** A proibição do catálogo (*"estrela tem DISCO DE DETRITOS, não anel:
radiação e Poynting–Robertson varrem"*) deixa de ser um veto e vira um caminho alternativo.

## 3. Cosmologia

Escala e capacidades, derivadas do **grafo**, nunca do `kind`. Um `doc` muito conectado pode ser um
gigante gasoso com luas enquanto outro permanece um corpo modesto — mesma identidade, massas
diferentes.

### O provedor, e o que ele pode entregar hoje

```
CosmologyProvider
  mass()        → chunks                       DISPONÍVEL
  degree()      → nº de filhos diretos         DISPONÍVEL
  importance()  → pagerank / betweenness       AUSENTE
  community()   → cluster semântico            AUSENTE
```

A interface existe inteira desde já para que o renderer não precise ser tocado quando a fonte
melhorar. Mas ela precisa de uma regra, senão vira armadilha:

⚠️ **Métrica ausente devolve `null`, nunca um default plausível.** Se `importance()` devolvesse 0,5
para todo mundo, o céu inteiro cairia no degrau do meio e ninguém saberia que aquilo não significa
nada — uma feature que "funciona" e não informa. Com `null`, **o renderer não pode liberar
capacidade que dependa de métrica ausente**, e a ausência aparece como ausência.

**Por que `importance()` e `community()` estão ausentes:** o grafo é uma **árvore**. As arestas são
`filho → pai` (`_hierarchy` em `server/graph.py`), e PageRank ou betweenness sobre árvore são
funções degeneradas de profundidade e grau. As relações de verdade viriam do Neo4j/Graphiti, e o
`graph.py` registra que ele pode estar desligado; em 2026-08-05, nesta máquina, está.

### A escada libera CAPACIDADE, o tamanho é contínuo

Errado — degrau no tamanho:

```
99 chunks  → planeta
100 chunks → estrela
```

O corpus é vivo: uma reindexação promoveria e rebaixaria astros sem que nada tivesse acontecido com
eles, e o corpo *pularia* na tela.

Certo — tamanho contínuo, capacidade em limiar:

```
raio          = log2(1 + chunks)     sempre contínuo, sem degrau
lua           a partir de X de massa
atmosfera     a partir de Y
anel          a partir de Z
```

O corpo cresce liso e ganha lua num marco. O marco é o evento; o susto não existe.

### Massa é `chunks`, e ela age para baixo

**A massa de um corpo é o número de chunks dele.** Vale para todo corpo, sem exceção.

A consequência dinâmica não é simétrica, e a assimetria é física: **massa age para BAIXO — sobre o
que orbita você — nunca para o lado (pares) nem sobre a sua própria órbita.** Pela terceira lei de
Kepler, `ω² = GM/r³`, onde `M` é a massa **central**: um corpo pesado e um leve no mesmo raio
orbitam no mesmo ritmo. Fazer a massa própria mudar a própria órbita seria a cena afirmando uma
falsidade.

**A CONTRADIÇÃO FOI FECHADA em 2026-08-05, pela segunda saída.** Ela era entre este documento e o
`motion-catalog.js`: aqui se dizia que a massa governa a rotação do disco de um hub, e lá, na
entrada `patternSpin`, que a taxa é propriedade da ONDA e toda galáxia compartilha.

Quem tinha razão era o catálogo de movimento — braço espiral é onda de densidade (Lin–Shu), e a
velocidade do PADRÃO é da onda; massa governa a curva de rotação do MATERIAL, que não é o que a
cena desenha. Mas em vez de apagar a intenção, a massa ganhou o papel dinâmico que ela alegava ter:
**a esfera de Hill das luas está implementada** (`orbital-zones.js`, `catalog.js:lua`). O alcance
do anel NÃO — e não por falta de tempo, mas por medida; está logo abaixo.

⚠️ **A armadilha que o trabalho descobriu, e ela vale para qualquer fronteira orbital futura.**
Roche sai do RAIO DO CORPO; Hill sai do RAIO ORBITAL. O raio desenhado desta cena é log-comprimido
de propósito, e o orbital não é — medido, `R/a ≈ 0,022…0,087` aqui contra `4,2e-5` da Terra: os
corpos são ~1500× maiores que as próprias órbitas. Derivar uma fronteira de cada régua e comparar
as duas não significa nada, e o sintoma foi silencioso: a janela entre elas vinha com no máximo 21%
de largura, e com o fator de estabilidade progrado real (0,5 r_H) **0 de 136** arquivos seguravam
lua. A correção é usar o raio FÍSICO implicado pela massa (`physicalRadius`) para mecânica, e
reservar o log só para pixel.

Cai daí um resultado melhor que o pedido: na razão Hill/Roche o `m^(1/3)` **cancela**, então quem
decide se um corpo segura lua não é a massa — é só `a`, o raio orbital, que nesta cena é a
RECÊNCIA. Arquivo antigo segura suas seções em órbita; arquivo recente não. É a física certa
(Mercúrio não tem lua por estar perto do Sol, não por ser leve) e é exatamente o que o
`catalogo-celeste.md` previa. Medido: corte em `a = 37,9` — **40 corpos, 279 luas**, 5 seções sem
espaço.

**Cada lua tem a SUA órbita — uma banda radial por lua.** (Substituiu o modelo co-orbital em
2026-08-05, depois de o usuário olhar a cena: todas na mesma elipse liam como fila de contas num
fio, porque era literalmente isso.) A janela é cortada em N bandas disjuntas, e raio, período,
fase, periastro, inclinação e excentricidade são todos **próprios de cada lua**.

**A não-colisão continua DEMONSTRADA, e por uma propriedade do `advance()`:** a posição da lua é
`(r·cosθ, r·senθ·sen i, r·senθ·cos i)`, cuja distância ao pai é `r` exatamente — a inclinação não
altera a distância. Basta então o intervalo `[a(1−e) − r_lua, a(1+e) + r_lua]` caber na banda para
que duas luas nunca estejam à mesma distância do pai. Medido no corpus: **0 sobreposições de faixa
em 278 luas**, pior folga +1,93e-2.

**O gargalo não era a janela — era a lua estar desenhada grande demais.** A conta antiga estava
certa no que mediu (`W/r_lua` de 0,44 a 3,05, e separar N luas exige `2N`: **0 de 40 corpos**
comportavam duas faixas), mas não questionou o `r_lua`. Ele vinha da densidade comum
(`r = P·∛(1/N)`), dando luas de 0,44 a 0,58 do raio do pai — isso é um binário, não uma lua.
Agora o raio desenhado é o que a banda paga, limitado pelo teto da massa: **0,010 a 0,054 do raio
do pai**, que é onde satélites reais vivem (Io 2,6% de Júpiter, Titã 4,4% de Saturno). É uma
compressão declarada, do mesmo tipo que a escala log dos tamanhos.

**A excentricidade continua MEDINDO A IDADE, pelo mesmo argumento de sempre: ela não é escolhida —
é o que sobra.** Antes era `(outer−inner)/(outer+inner)`, a maior elipse que a *zona* comportava;
agora é a maior que a *banda* comporta, e a cadeia preserva o sinal: `wiggle ∝ band = W/N` e
`W = inner·(slack − 1)`, logo `e ≈ (slack − 1)/(8N)` — proporcional à mesma folga de janela.

Ela também varia **entre as luas do mesmo corpo** sem hash nenhum: a excursão radial é igual em
todas as bandas, então a lua interna, com `a` menor, fica mais excêntrica que a externa.

Medido: 40 corpos, **278 luas**, 6 seções sem espaço, `e` de **0,00181 a 0,01057**.

| correlação | r |
|---|---|
| idade do pai × `e` média — global | 0,732 |
| idem, **controlando o nº de seções** (n=5, n=9, n=12) | **1,000 · 0,999 · 1,000** |
| nº de seções × `e` média | −0,328 |

⚠️ **O confundidor, que o modelo co-orbital não tinha:** o `N` no denominador. Documento com mais
seções tem bandas mais estreitas e portanto luas menos excêntricas na mesma idade — o modelo antigo
escapava disso só porque colapsava todas as luas numa órbita só. Dentro de uma contagem fixa de
seções o gradiente é exato; entre contagens diferentes, ele é uma tendência. A amplitude também
caiu uma ordem de grandeza (0,050–0,231 → 0,002–0,011): é o preço de cada lua ter órbita própria.

**Alcance do anel: MEDIDO E RECUSADO.** Seria a outra metade da frase, e não sobrevive à medida. O
alcance em raios do corpo é `∝ m^(1/3)/R(m)`, e com a lei log de tamanho isso espalha só **1,54×**
no corpus inteiro — pior, entre q1 e q3 espalha **3%**. Normalizado no 2,44 clássico, o intervalo
inteiro (2,42–3,72) cai ACIMA do `SPAN_CAP = 2,4` que já trunca todos os anéis hoje. Implementar
seria trocar uma constante honesta por uma fórmula que devolve ~2,44 para tudo: variação existindo
no código sem existir na tela, que é o que este documento recusa em outros lugares.

Na prática, hoje:

- **hub** (o único corpo com filhos) → massa governa o TAMANHO. A rotação do padrão é da onda, e o
  alcance do anel continua sendo do perfil da família, com teto visual;
- **arquivo com ≥5 seções e `a > 44`** → massa governa a esfera de Hill, e portanto quantas seções
  ele segura como lua e a que raio. Aqui a massa age para baixo de verdade;
- **folha** → mantém `ω ∝ r^-1.5`, raio = recência, massa central única (o núcleo);
- **atração mútua** → **não**. Exige integração, integração exige estado, e estado faz a posição
  depender do histórico da sessão — some a garantia do README de que *"o mesmo conhecimento cai
  sempre no mesmo lugar"*. Se um dia o efeito for desejado, entra como **padrão** (deformação
  fechada da órbita analítica), não como simulação. Mesma distinção que fez o vínculo virar arco sob
  demanda em vez de teia material.

Medido nos 70 hubs com filhos diretos, para calibrar qual eixo carrega a forma:

| eixo | mín | q1 | mediana | q3 | máx | espalhamento |
|---|---|---|---|---|---|---|
| massa (`chunks`) | 2 | 6 | 18 | 56 | 3551 | **1775×** |
| nº de arquivos | 2 | 2 | 4 | 6 | 54 | 27× |
| densidade (chunks/arquivo) | 1,0 | 2,4 | 4,5 | 9,6 | 65,8 | **66×** |

**Contagem de arquivos é o pior dos três eixos**: q1 e mínimo são ambos 2 — metade das pastas tem
entre 2 e 4 arquivos. Derivar forma dela daria quase a mesma silhueta para quase todas as galáxias:
variações existindo no código sem existir na tela.

→ **Massa governa tamanho e dinâmica. Densidade governa morfologia.** Não é conveniência
estatística: elípticas são suportadas por dispersão e concentradas, espirais tardias são discos
difusos suportados por rotação. A sequência de Hubble cai naturalmente sobre densidade.

⚠️ Os dois eixos são correlacionados neste corpus — 5 dos 6 hubs mais massivos também estão entre os
6 mais densos. A distinção informa nas margens (`.k8s`: 303 chunks, densidade 9,8 — grande e
difuso; `knowledge-topology`: 125 chunks, densidade 31 — pequeno e concentrado). E `devshell-one`
(3551 chunks, densidade 65,8) é outlier nos dois: vai sozinho em qualquer extremo e provavelmente
quer tratamento de núcleo do sistema.

## 4. Estado — candidatos, não decisões

Modificadores que **nunca trocam a forma do corpo**. Ele continua sendo o que é; muda o que carrega.
Este estágio apenas **propõe**; quem decide é o solver.

| Estado | Vem de | Modificador candidato |
|---|---|---|
| sujo | `/api/dirty` | anel planetário (sólido) ou disco de detritos (emissivo) |
| churn alto | `recency.py`, janela 30d | coroa instável |
| churn dormente | `recency.py`, janela 30–180d | crosta refratária, cauda extinta |
| hub | topologia | halo gravitacional |
| isolado | grau 0 | brilho baixo |
| aceso pela busca | evento | corona, temporária |
| travado | gesto do operador | vínculos desenhados, âmbar |

## 5. Solver de compatibilidade

Recebe a lista de candidatos e devolve o conjunto que pode coexistir:

```
[sujo, churn alto, travado, aceso]
        │
        ▼  resolve()
[disco de detritos, coroa instável, halo de seleção]   ← anel caiu: conflita com disco
```

Hoje a exclusão mútua vem **de graça** da unicidade da classe: um corpo resolve para uma classe só,
e a classe declara `forbids`. Quando as classes viram modificadores essa garantia some e o risco se
multiplica — anel, disco de acreção e coroa são três coisas concêntricas em volta do mesmo núcleo, e
nada impede um corpo de ganhar as três. O solver é onde a garantia volta a existir, agora como
**propriedade da composição visual** e não de cada classe.

Três coisas que ele precisa carregar do catálogo atual, senão o refactor perde o que o motivou:

**Motivo declarado por conflito.** O `forbids` de hoje não guarda um booleano, guarda a frase — *"anel
e envoltório à volta do mesmo núcleo é o empilhamento que criou o catálogo"*. É documentação
executável: quem lê o código descobre por que, e não só que.

**Prioridade com justificativa.** A resolução atual não é arbitrária: `planeta-anelado` (40) vence
`supernova` (25) porque *"ganha o EVENTO EM ABERTO: ele é acionável agora e some sozinho no commit,
enquanto o churn continua lá amanhã"*. Essa lógica migra para o solver; se ela virar ordem de array,
a decisão fica sem dono.

**O solver precisa ser OBSERVÁVEL.** Um modificador descartado em silêncio é indistinguível de um
fato ausente: "por que este arquivo sujo não tem anel?" passa a não ter resposta na tela nem no
console. A sonda (`window.espatial.planet()`) já segue essa disciplina — ela escreve inclusive o caso
negativo, porque *"diagnóstico que só existe no caminho feliz não é diagnóstico"*. O solver expõe
pela mesma sonda os candidatos rejeitados **com o motivo**.

## 6. Animação

O SSOT vive em [`src/space/motion-catalog.js`](../src/space/motion-catalog.js): as leis, as taxas,
o `reduced` de cada uma e — como no `catalog.js` — o que cada movimento **proíbe**. Cada entrada
declara o próprio `status`, e hoje só `expansion` continua `declared` — nada expande na cena.

**Trazer os `own` para cá não foi a substituição mecânica que este documento previa.** Centralizar
revelou três constantes que já viviam em dois lugares, livres para divergir sem que nada acusasse:

| duplicata | onde estava | o que a divergência quebraria |
|---|---|---|
| `GM` do núcleo | `graph.js:makeOrbit` (`(r/26)^-1.5·0.16`) e `orbital-zones.js:MU_CORE` (`0.16²·26³`) | lua e pai orbitando sistemas diferentes |
| taxa/inflação/amplitude do pulso | vertex shader do ponto **e** o espelho JS de `starRadius()` | anel respirando fora de fase com a estrela |
| três taxas da granulação | soltas no GLSL da fotosfera | — (só ilegibilidade) |
| velocidade de padrão | `galaxy.js:OMEGA_P` = 0,06, contra os 0,1396 que a cena roda | a bancada checando enrolamento numa base 2,33× mais lenta que a cena |

A segunda é a mais instrutiva: o comentário do espelho **já afirmava** "a MESMA expressão do shader,
nenhum caminho separado para manter em dia", e três literais depois isso era falso.

Um quarto movimento não tinha entrada nenhuma: o **balanço vertical** (`bob`) do céu. Ele foi
encontrado sem nome dentro de `advance()` — que é como um movimento decorativo sobrevive, já que
nada no modelo o reivindica e portanto nada o questiona. Está declarado agora, inclusive a parte
incômoda: ele **não é física** (órbita circular não balança), e existe por legibilidade.

⚠️ `applied` compromete o campo `reduced` também. `boil` e `spin` declaravam `freeze` e continuavam
animando com `prefers-reduced-motion` — declarar sem obedecer é a mesma mentira que este catálogo
existe para impedir, então os dois passaram a congelar o RELÓGIO (não o parâmetro: o planeta para
virado para um lado, com nuvem e crosta lendo o mesmo tempo).

`f(tempo)` puro: nenhum estado interno, nenhuma integração. É o que a cena já faz — `graph.js:511`
calcula `angle = phase + elapsed * speed`, sem velocidade acumulada, e é isso que sustenta a posição
determinística.

### Elementos orbitais, todos derivados do id

Um corpo nunca "anda". Ele percorre uma órbita **fixa**, e a posição de agora é função do tempo
global. Volte amanhã e ele estará em outro ponto da mesma elipse, pertencendo ao mesmo sistema.

| Elemento | Fonte hoje |
|---|---|
| semieixo maior | recência (rank temporal) — **é o eixo do tempo da cena** |
| inclinação | `hash01(node.id, 2)` — já implementado |
| fase | `hash01(node.id, 3)` — já implementado |
| período | `ω ∝ r^-1.5` — já implementado |
| excentricidade | `hash01(node.id, n)` — **falta** |

⚠️ **A excentricidade colide com "raio = recência", e a colisão precisa de decisão explícita.** O
raio orbital é o eixo temporal da cena: um corpo mais externo é mais novo, e é isso que faz o
scrubber de tempo funcionar. Uma órbita muito excêntrica atravessa cascas de idade — o cometa
visitaria o raio de arquivos com recência diferente da dele, e a leitura "raio = quando" deixaria de
valer para aquele corpo.

Três saídas, e a escolha é de produto:

1. **Excentricidade pequena** (≤0,15) em todos: a elipse existe, a casca temporal continua legível.
2. **Cometa é a exceção declarada**: viajar é o significado dele, e uma classe cruzando as cascas é
   aceitável se o catálogo disser isso em voz alta.
3. **Excursão vertical em vez de radial**: a variação vai para a inclinação, não para o raio — o
   corpo sobe e desce fora do plano e nunca troca de casca.

A 3 é a que preserva o invariante sem abrir exceção. A 2 é a mais expressiva. **Nenhuma foi
escolhida ainda — para o céu.**

⚠️ **A lua já é elíptica, e ela NÃO abre este conflito.** O trade-off acima existe porque, no céu, o
raio orbital É o eixo do tempo, então uma elipse atravessa cascas de idade. No sistema de luas o
raio não é tempo nenhum — é a distância ao próprio pai, dentro da janela Roche→Hill. A
excentricidade ali não colide com invariante algum, e por isso ela pôde entrar antes desta decisão,
sem prejulgá-la. Ver `orbital-zones.js`.

⚠️ **"Errante" não entra, e o motivo é uma garantia.** O README promete que *"o mesmo conhecimento
cai sempre no mesmo lugar"*. Determinismo no tempo não basta: um corpo errante é sempre calculável e
**nunca está no mesmo lugar**, então achar um arquivo onde você o deixou deixa de valer.

---

## O que isto corrige, com medida

Varredura do céu por classe em 2026-08-05, voando a câmera até um corpo de cada (468 nós do payload,
incluindo os 9 `lock` que não entram no céu):

| classe | corpos | ao aproximar |
|---|---|---|
| `estrela` | 365 | 841px, nível 1, fotosfera desenha |
| `galaxia` | 71 | 502px, **nada** |
| `supernova` | 27 | 470px, **nada** |
| `cometa-extinto` | 5 | 975px, nível 1, planeta desenha |

**Depois, medido em 2026-08-05 no mesmo caminho.** Os dois buracos fecharam:

| o que era | virou |
|---|---|
| `supernova`, 27 corpos sem nada | deixou de ser classe; o mais reescrito do corpus (`CLAUDE.md`, 26 toques em 30d) desenha fotosfera em nível 1 |
| `galaxia`, 71 corpos sem nada | `space/galaxy.js` ligado à cena viva; `docs/operations` reporta `tipo: galaxy, desenhado: true` a 254px |
| eixo de classe | `estrela` 383 · `cometa-extinto` 5 — `supernova` saiu |

**Supernova como classe é o defeito, e ele é medível.** O catálogo a descreve como *"ESTADO DURÁVEL
do repositório: diz 'este arquivo é um ponto quente', não 'algo aconteceu agora'"* — e mesmo assim a
modela como classe, que por definição exclui as outras. Ela não declara `photosphere` e proíbe
`surface`, então tira do corpo as duas superfícies possíveis. Sobra um sprite: 27 corpos sem nada ao
aproximar.

→ **Supernova sai do eixo de forma e vira Estado + Animação.** Qualquer corpo pode explodir e
continua sendo ele mesmo. Um `config` com churn alto volta a ser estrela com fotosfera **mais** uma
coroa instável, e os 27 param de ser buracos na experiência.

## Conflitos resolvidos

**`lock` (9)** — fica fora do céu, como já está (`corpus.js`: centenas de chunks e zero
conhecimento). Se voltar, volta como **anotação sobre o espaço** — grade, beacon, marcador — nunca
como corpo. O critério: deixa de contar na massa, na hierarquia e no LOD de uma vez. É a mesma razão
pela qual meteoro está certo hoje — fenômeno, não corpo.

**`memory` (4)** — o buraco negro é **singular por construção**: ele é o núcleo, e é dele que a tela
fala. Quatro memórias virando buracos negros criam cinco centros e destroem o significado do centro.
Memória é **matéria em acreção**: órbita baixa, caindo para o núcleo.

**`decision` (11)** — não vira supernova, porque supernova deixou de ser forma. Morfologia de
planeta (é markdown), com a explosão no estágio de animação.

**`schema` (1)** — não ganha geometria exclusiva; tratamento visual próprio para um corpo é caro por
unidade de valor. Ganha cor, brilho e espectro sobre a fotosfera.

**`agent` (54)** — **estação orbital, não nave.** Nave implica posição independente, e posição
independente quebra a estabilidade espacial. A estação fica presa ao seu centro gravitacional e
ganha antenas, painéis e luzes; quando o agente executa, ela **emite** — drones, feixes, hologramas.
O centro nunca muda, o determinismo fica intacto. E há de onde nascer: `satellites.js` já desenha
satélites de ferramenta e wormholes quando o agente age — é aquele módulo apontado para o corpo do
agente em vez de para o núcleo.

## Como isto divide o `catalog.js`

Hoje ele acumula três responsabilidades: taxonomia astronômica, regras físicas (`forbids`) e regras
de renderização. A divisão segue os estágios:

| Arquivo | Contém | Não contém |
|---|---|---|
| `catalog/archetypes.js` | estrela, planeta, cometa, pulsar, nebulosa, estação | nada sobre estado |
| `catalog/modifiers.js` | sujo, quente, dormente, travado, aceso, isolado | nada sobre forma |
| `catalog/compatibility.js` | os conflitos, com motivo e prioridade | nada além de conflitos |

O ganho não é organização: é que **acrescentar uma morfologia não faz reler regra de estado**, uma
métrica nova do Graphiti só toca cosmologia, e um estado novo (`merge conflict`, `deprecated`) vira
uma entrada em `modifiers` mais suas linhas em `compatibility` — sem revisitar decisão antiga e sem
criar exceção.

## Entidades futuras

Mapeamento pretendido para quando o dado existir. **Nada disto está no payload hoje** — chunks são
contados, não enumerados; funções, classes e embeddings não são extraídos.

| Entidade | Astro | Depende de |
|---|---|---|
| workspace | universo | — (já é a cena) |
| repositório | galáxia | separar repo de pasta na topologia |
| pasta | sistema estelar | idem |
| arquivo | estrela ou planeta | já existe |
| classe / seção | lua | `sections` já vem no payload |
| função | satélite | extração por AST |
| chunk | asteroide | enumerar chunks, não só contar |
| embedding | partícula luminosa | idem |
| relação | campo gravitacional | Neo4j/Graphiti no ar |
| resultado de busca | wormhole temporário | **já implementado** |
| servidor MCP | estação espacial | — |
| commit | evento de explosão | segunda janela de `git log` |
| branch | braço espiral | — |

## Ordem de adoção

1. ~~Galáxia por densidade + massa~~ — **feito**, e por CONCENTRAÇÃO de massa, não por densidade
   média: a média manda a pasta mais rica do céu para lenticular sem braços, porque mede tamanho
   de arquivo. Ver `space/galaxy-classes.js`.
2. ~~Solver de compatibilidade~~ — **feito** (`space/solver.js`), com as recusas na sonda.
3. ~~Supernova sai de forma e vira estado~~ — **feito**; 27 corpos recuperaram superfície.
4. **Morfologia de cometa e estação** — leva a cobertura de 57% para 86%.
5. **Excentricidade no CÉU**, junto com a decisão sobre a colisão com "raio = recência". (Na lua ela
   já existe e não depende desta decisão — o raio de uma lua não é eixo de tempo.)
6. **Repo × pasta** como galáxia × sistema estelar.
7. ~~Trazer os movimentos `own` para o catálogo~~ — **feito**; não era substituição direta, e a
   seção 6 traz as três duplicatas que ela achou.

## Estado de implementação

Nenhuma linha desta tabela mente sobre estar pronta.

| Estágio | Hoje |
|---|---|
| Identidade | existe — `kind` do `graph.py`, cor por `KIND_COLORS` |
| Morfologia | 2 de 6 para arquivo (fotosfera, planeta) + galáxia para hub + lua, na cena viva |
| Cosmologia | parcial — massa vira tamanho (`log2`) e concentração vira classe de galáxia. **A primeira capacidade por limiar existe**: lua, pela janela Roche→Hill (`orbital-zones.js`). Atmosfera e anel-por-massa continuam sem limiar |
| Estado | parcial — `envelope` já passa pelo solver; `dirty`, `hub`, `isolado` e `aceso` ainda são aplicados direto |
| Solver | existe — `space/solver.js`: superfície + um conflito, com motivo e sonda. Falta o resto dos candidatos |
| Animação | existe como SSOT e é LIDO — `space/motion-catalog.js`, 6 de 7 entradas `applied` (só `expansion` é `declared`, e nada expande). `reduced` obedecido em todas. **Cada lua tem órbita própria** (banda radial, período/fase/inclinação/`e` próprios, 0 sobreposições em 278); o resto do céu continua circular |
