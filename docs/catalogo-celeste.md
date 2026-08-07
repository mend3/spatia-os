# Catálogo celeste

**O que existe no céu do Espatial OS**, de que fato cada corpo nasce, como ele varia e o que se vê.

Este documento descreve o **presente**. A pesquisa de taxonomia que deu origem a ele (2026-08-05/06)
e os dois briefings de refinamento visual (pulsar, buraco negro) já foram absorvidos: o raciocínio
que sobreviveu virou comentário no código, e é lá que ele mora. O `git log` guarda a história — os
corpos de commit desta base são longos de propósito, com a medida que decidiu cada número.

> **A fonte da verdade é o código, não este arquivo.** `src/space/catalog.js` classifica,
> `src/space/solver.js` resolve a pele, `src/space/lod.js` decide o que é desenhável. Quando este
> documento e eles discordarem, eles estão certos. Rode `node scripts/censo-morfologias.mjs` para
> ver a distribuição real do corpus atual.

---

## O princípio: a forma é o fato

Nenhum corpo desta cena é decorativo. Cada feição visual afirma alguma coisa sobre o arquivo, e a
regra vale nos dois sentidos — **feição sem fato por trás não entra, e fato sem feição não é dado.**
É por isso que o catálogo tem `forbids`: uma estrela não pode ter crosta porque relevo afirmaria
corpo sólido, e um cometa não pode ter anel porque cauda e anel juntos não descrevem nada.

Três camadas independentes, e confundi-las é o erro mais comum:

| camada | pergunta | onde vive |
|---|---|---|
| **CLASSE** | o que este corpo **É** | `catalog.classify` |
| **MORFOLOGIA** | que corpo o **tipo de arquivo** declara | `MORPHOLOGY_BY_KIND` |
| **PELE** | o que ele **desenha de perto** | `solver.resolveBody` |

Uma classe pode recusar a morfologia declarada (o censo chama isso de **recusa do solver**), e é
saudável: 87,5% do corpus pede `surface` e leva `photosphere`, porque a classe é estrela e estrela
não tem crosta.

---

## Distribuição real — corpus de 1 862 nós (2026-08-07)

**Classe** — o que o corpo é:

    estrela           1629   87,5%
    galáxia            228   12,2%
    cometa-extinto       5    0,3%

**Pele** — o que ele desenha de perto:

    photosphere        668   35,9%
    station            459   24,7%
    planet             361   19,4%
    galaxy             228   12,2%
    comet              103    5,5%
    nebula              43    2,3%

**Morfologia por tipo de arquivo:**

    config   → fotosfera   499      schema  → fotosfera  159
    agent    → estação     414      script  → cometa     103
    doc      → planeta     332      infra   → estação      47
    compose  → nebulosa     44      lock    → estrela      12
    decision → planeta      12      memory  → planeta      12

⚠️ **A distribuição é do corpus, não do catálogo.** Um corpus sem `docker-compose.yml` não tem
nebulosa nenhuma, e isso não é buraco na cobertura — é o céu descrevendo o repositório com
honestidade. A doutrina de cobertura (fixture · fixture paramétrico · corpus real) está em
[`cobertura.md`](./cobertura.md).

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

**Representa:** arquivo de infraestrutura com **regularidade ≥ 0,5** — commits em cadência, não em
rajada. O que o define não é o corpo (uma estrela de nêutrons tem 10 km: em qualquer escala útil é
um ponto), são os **feixes**.

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

Bancada: `espatial.core({ regime: 'thinking', tokens: 120000 })`.

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

Sondas: `espatial.bloom({ threshold, radius })` · `espatial.core({ regime, tokens })` ·
`espatial.lod()` · `espatial.planet()` · `espatial.galaxy()` · `espatial.moons()`.

---

# O que ficou de fora, e por quê

| ideia | por que não |
|---|---|
| broad-line region / partículas no quasar | 0,5 px — custo sem imagem |
| disco de fallback no pulsar | fallback é supernova recaindo, não cascata colisional; a cena não modela nenhum dos dois |
| anel em cometa | cauda e anel juntos não descrevem nada |
| crosta em estrela | relevo afirmaria corpo sólido |
| supernova em galáxia | agregado não tem história própria, tem a dos filhos |

---

# Onde procurar o resto

- **A física de cada corpo** — o cabeçalho do módulo em `src/space/`. Eles são longos de propósito.
- **A decisão por trás de cada número** — `git log`, no commit que o introduziu.
- **A distribuição do corpus** — `node scripts/censo-morfologias.mjs`.
- **Cobertura e o que o fixture exercita** — [`cobertura.md`](./cobertura.md).
- **Como a cena é desenhada** — [`modelo-de-renderizacao.md`](./modelo-de-renderizacao.md).
- **A bancada, um objeto por vez, sem pós-processamento** — `sandbox.html`.
