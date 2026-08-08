# Cena UNIVERSO — o replanejamento celeste

> **Este documento é a SPEC DE TRANSIÇÃO da cena UNIVERSO.** Ele deixou de ser uma lista de
> melhorias visuais quando ficou claro que define uma **nova ontologia** — decisão do usuário em
> 2026-08-07, na revisão que virou o §10.
>
> **A regra que governa tudo o que vem depois:**
>
> > **Não implementar mais nenhuma morfologia até a classificação que decide quando ela existe
> > estar correta.**
>
> Nada aqui está em `src/`. Base: [`catalogo-celeste.md`](./catalogo-celeste.md) (o modelo atual),
> [`briefings/multi-scene.md`](./briefings/multi-scene.md) (a cena nova) e pesquisa em fontes
> primárias (NASA, ESA, JPL, Chandra, NTRS) feita em 2026-08-07.

---

## 0. O veredito, em seis linhas

1. O céu de hoje afirma uma hierarquia gravitacional **invertida**, centenas de vezes por quadro.
2. A causa é uma só: **tipo de corpo e massa são tratados como eixos independentes**, e na
   astrofísica eles são o mesmo eixo.
3. São **cinco inversões** — `kind` decidindo o corpo, `compose` → nebulosa, `script` → cometa, o
   raio do anel de Júpiter e o quasar como classe separada do buraco negro.
4. O buraco negro **não sai de cena**: ele muda de cena. O briefing resolve isso melhor do que a
   primeira versão deste documento — são dois universos, não duas câmeras (§9.1).
5. A colisão dos três aros se resolve **pela física** — cada feição já tem um vocabulário próprio
   que ninguém usou.
6. O briefing acerta a ESTRUTURA e erra as FOLHAS, e sempre pelo mesmo motivo: ele assume fatos que
   o corpus não tem (§9.2).

---

## 1. O problema que a cena nova existe para resolver

Hoje a topologia é literalmente esta:

```
buraco negro
     └── todos os 1 636 arquivos, por recência
```

O briefing já nomeou o defeito: *"não existe um centro absoluto; o universo possui bilhões de
centros gravitacionais locais, e cada estrutura domina apenas sua vizinhança"*.

O custo não é só conceitual. Com um centro único, **a distância ao centro precisa carregar um
significado global** — hoje ela carrega a recência, que é um ranking. Isso força duas coisas
erradas ao mesmo tempo: um arquivo antigo de um projeto vivo fica longe do projeto dele, e dois
arquivos sem nenhuma relação ficam vizinhos por terem a mesma idade.

**O que substitui o centro:** contenção. Ela já é o único fato relacional que o grafo tem —
medido, `arestas laterais = 0`, o grafo é 100% hierárquico (`repo → diretório → arquivo`).

---

## 2. O que a física diz, e onde o modelo a contradiz

### 2.1 Tipo de corpo É massa

A distinção estrela/planeta não é de aparência nem de papel: é o limiar de **fusão**. Estrela funde
e brilha por luz própria; planeta não tem massa para isso e apenas **reflete**. E a estrela domina
a gravidade do sistema — os planetas do Sol somam ~0,1% da massa total.

> Fontes: [NASA · Stars](https://science.nasa.gov/universe/stars/) ·
> [Britannica · Planets vs Stars](https://www.britannica.com/science/Whats-the-Difference-Between-Planets-and-Stars)

**A INVERSÃO Nº 1, e é a raiz de todas.** Hoje o corpo vem do `kind` e o tamanho vem dos `chunks`,
como se fossem independentes:

| `kind` | corpo hoje | n |
|---|---|---|
| `config` | **fotosfera (estrela)** | 499 |
| `schema` | **fotosfera (estrela)** | 159 |
| `doc` | planeta | 332 |
| `agent` | estação | 414 |

Um `config` de 2 chunks desenha uma ESTRELA ao lado de um `doc` de 200 chunks desenhado como
PLANETA. **A estrela é menor que o planeta**, o que é fisicamente impossível e visualmente
constante: são 668 fotosferas contra 363 planetas no corpus real.

⚠️ Não é um erro de valor, é de **eixo**: nenhuma calibração conserta, porque o problema é os dois
números não conversarem.

### 2.2 Nebulosa é berço ou cadáver

As quatro famílias têm causas distintas e nenhuma delas é "coisa grande e difusa": **emissão** (gás
ionizado *por* uma estrela), **reflexão** (espalha luz de uma vizinha), **escura** (bloqueia o que
está atrás) e **planetária** — a casca expelida por uma estrela moribunda.

> Fonte: [NASA · Decoding Nebulae](https://science.nasa.gov/universe/stories/quick-reads/decoding-nebulae/)

**A INVERSÃO Nº 2.** `compose` → nebulosa contradiz o próprio modelo, por dois caminhos
independentes:

- O catálogo define nebulosa como *"a ausência de superfície"* — **sem corpo central**.
- Mas o `partsOf()` transforma os serviços declarados em **luas orbitando** — medido: **162
  serviços em 44 arquivos** compose.

Um corpo com satélites tem centro por definição: é o centro que os segura. E o compose é o arquivo
**mais estruturado** de um repositório — ele declara um sistema inteiro. É o oposto de difuso.

### 2.3 Atividade de cometa é proximidade, não identidade

O núcleo tem poucos quilômetros. Coma e cauda existem **só perto do Sol**, e somem quando ele se
afasta. Cometa que esgotou os voláteis é *dormente* e **indistinguível de um asteroide**.

> Fonte: [NASA · Comet Facts](https://science.nasa.gov/solar-system/comets/facts/)

**A INVERSÃO Nº 3, e o modelo já sabe metade dela.** A coma e a cauda já saem do `churn`, que é a
analogia certa — trabalho recente é o calor. Mas o `kind` faz **todo `script` ser cometa** (103
corpos), inclusive com churn zero. Pela definição acima, esses são asteroides desenhados como
cometas. O catálogo já tem `cometa-extinto` como classe: ele conhece o caso dormente e mesmo assim
deixa o `kind` decidir antes do estado.

### 2.4 O raio dos três anéis está invertido — e este é medível contra a fonte

Os anéis reais, na ordem em que a NASA os descreve:

| anel | raio | estrutura | material |
|---|---|---|---|
| **Júpiter** | **~1,8 raios planetários** | *"a mere wisp"* — tênue, ejeta de corpos-pai escondidos | silicatos |
| **Urano** | **~1,8 raios planetários** | nove bandas ESTREITAS, com satélites-pastores | gelo de metano modificado |
| **Saturno** | até ~282 000 km, mas **~10 m de espessura** | vasto e complexo | gelo de água |

E o `catalog.js` de hoje:

```
modified  → saturn   reach 2,45
staged    → uranus   reach 2,2
untracked → jupiter  reach 3,2   ← o MAIS LARGO
```

**A INVERSÃO Nº 4.** Júpiter é desenhado como o anel mais largo do céu (3,2) quando na natureza ele
é o mais interno e o mais tênue, junto de Urano em ~1,8 raios. A parte *difusa* está correta; o
**raio** está invertido. Saturno e Urano estão na ordem certa entre si.

⚠️ O `ROCHE_FLUID = 2,44` do `orbital-zones.js` **está certo e agora tem fonte**: para densidades
iguais, o limite de Roche fica em ~2,5 raios planetários, e é dentro dele que o material não
consegue se acretar em lua — que é exatamente por que anel é anel.

> Fontes: [NASA · Cassini FAQ](https://science.nasa.gov/mission/cassini/faq/) ·
> [NASA · Saturn Facts](https://science.nasa.gov/saturn/facts/) ·
> [NASA/NTRS · The narrow rings of Jupiter, Saturn and Uranus](https://ntrs.nasa.gov/citations/19800044425)

### 2.5 Anã branca é massa do Sol no tamanho da Terra

Sustentada por degenerescência eletrônica, **sem fusão**, esfriando por bilhões de anos. Uma colher
de chá do material pesa ~9,5 toneladas.

> Fontes: [NASA · White Dwarfs](https://imagine.gsfc.nasa.gov/science/objects/dwarfs2.html) ·
> [Chandra · White Dwarfs](https://chandra.harvard.edu/xray_sources/white_dwarfs.html)

Ou seja: o que a define é a razão **massa/tamanho**, não um contorno. Ver §5.

### 2.6 O quasar NÃO é um corpo — é o buraco negro comendo

> *"Quasars and AGN aren't separate from supermassive black holes — they're different
> manifestations of the same phenomenon."*

Um núcleo ativo é um buraco negro supermassivo **consumindo matéria**. O disco de acreção e os
jatos não são entidades separadas: são estruturas criadas pela matéria caindo. E só **1 em 10**
AGN produz jatos.

> Fontes: [NASA · What Are Active Galactic Nuclei?](https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-are-active-galactic-nuclei/) ·
> [Chandra · Quasars & Active Galaxies](https://chandra.harvard.edu/xray_sources/quasars.html)

**A INVERSÃO Nº 5.** O `catalogo-celeste.md` tem **`## Quasar`** e **`## Buraco negro`** como duas
entradas, dois corpos. Fisicamente são o mesmo objeto em dois estados.

E o modelo já tem o estado certo à mão: o buraco negro é o **núcleo cognitivo**, e ele já muda de
regime quando o agente trabalha. Quasar deveria ser **o núcleo enquanto consome** — o disco e os
jatos acendendo com a execução e apagando com ela. Isso troca uma classe por um estado, que é a
mesma correção que a supernova já sofreu.

⚠️ E o "1 em 10 com jato" é uma régua grátis: jato em todo núcleo ativo afirmaria uma frequência
que a natureza não tem.

### 2.7 O pulsar é o que SOBRA de uma supernova

Pulsar é uma estrela de nêutrons **deixada para trás quando uma estrela massiva explode**. Ele pulsa
porque o eixo magnético **não está alinhado** com o eixo de rotação — o feixe varre a linha de
visada como um farol. Períodos vão de **1,4 ms a 8,5 s**, e os de milissegundo rivalizam com
relógios atômicos.

> Fontes: [NASA · Neutron Stars](https://imagine.gsfc.nasa.gov/science/objects/neutron_stars1.html) ·
> [NASA · Lighthouse Pulsar](https://science.nasa.gov/missions/ixpe/nasa-space-telescope-maps-magnetic-fields-of-lighthouse-pulsar/)

Duas consequências, e a primeira é uma **relação que o modelo não tem**:

- **Pulsar vem DEPOIS de supernova.** Hoje as duas feições são independentes: supernova sai de surto
  de churn, pulsar sai de regularidade de edição, e nada liga uma à outra. Na física, um é o
  cadáver do outro. Se o céu respeitasse isso, pulsar só seria alcançável por um corpo que teve
  supernova — e a classe deixaria de ter **população zero** por acaso, passando a tê-la por
  dependência declarada.
- **A obliquidade é a CAUSA do pulso, não um enfeite.** Hoje ela vem do hash do caminho, o que é
  arbitrário mas inofensivo. Já a faixa de período do céu (1,55–3,58 s) é uma fatia estreita de uma
  faixa real de quase quatro ordens de grandeza — o milissegundo, que é o caso espetacular, não
  existe aqui.

### 2.8 O universo é vazio, e isso é layout

A estrutura em grande escala tem nós densos ligados por **filamentos**, envolvendo **vazios** — e
**mais de 70% do volume do universo é vazio**. Superaglomerados medem 20–100 megaparsecs.

> Fonte: [NASA/ESA e levantamentos SDSS via literatura de estrutura em grande escala](https://science.nasa.gov/universe/galaxies/)

Isso não é curiosidade: é a instrução de distribuição que falta ao §3.1. A cena UNIVERSO **não deve
espalhar sistemas uniformemente** — ela deve concentrá-los em nós, ligá-los por filamentos e deixar
a maior parte do volume vazio. Céu uniforme é justamente o que produz a leitura de "campo de
pontos" em vez de "estrutura".

⚠️ Isto conflita com o layout atual por recência, que é **uniforme por construção** (`recency` é
posição no ranking, feita para ser uniforme). Trocar o centro sem trocar a distribuição só muda o
lugar do problema.

---

## 3. O replanejamento — três camadas, três fatos

A regra que substitui `MORPHOLOGY_BY_KIND`:

| camada | decide | o fato | por que este fato |
|---|---|---|---|
| **escada de massa** | asteroide → lua → planeta → estrela | `chunks`, limiares **absolutos** | é o eixo que a física usa; percentil é não-estacionário (refutado em `medicoes-2026-08-07` §3.1) |
| **família** | que *tipo* de planeta ou estrela — pele e cor | `kind` | ele deixa de decidir o CORPO e passa a decidir a variação dentro do degrau |
| **estado** | o que está em volta | churn · git · surto · massa parada | já é assim para anel e supernova; passa a valer para cometa também |

O que muda na prática, e é o teste da proposta: **`doc` grande vira estrela; `config` pequeno vira
planeta ou lua.** A hierarquia se endireita sozinha, sem ninguém plantar população — que é a mesma
régua que o `cobertura.md` aplica ao corpus.

### 3.1 A hierarquia gravitacional, com os números de hoje

O briefing pede `Universo → Galáxia → Sistema Estelar → Estrela → Planetas → Luas`. O corpus já
tem os degraus, medidos pelo `censo-corpus.mjs`:

| degrau | o que é | n | medida |
|---|---|---|---|
| universo | o workspace | 1 | — |
| galáxia | repo, ou agregado do topo | 7 repos | por contenção: **17** seriam galáxia |
| sistema estelar | a pasta | **221** | 188 só com arquivos · 33 com subpasta |
| estrela | o corpo mais massivo do sistema | 221 | um por sistema |
| planetas | os demais arquivos da pasta | 1 300 | **MED 4 por estrela** · P90 12 · máx 72 |
| luas | as seções do arquivo | — | janela Roche→Hill, já implementada |

**Razão planeta/estrela: 5,88.** No universo real estima-se ≥1 planeta por estrela — a proporção
aqui **emerge do corpus** e não precisa ser imposta.

⚠️ **Os 336 órfãos (20,5%) são a pergunta que decide se o modelo é honesto.** São arquivos
pendurados direto no repo, sem pasta: planeta sem estrela. Ou o repo vira a estrela deles, ou o céu
passa a conviver com duas leis de órbita. Sobra sem lei é o que revela que a lei não valia para
tudo.

### 3.2 O que acontece com a nebulosa

Ela sai do `compose` e volta a ser o que é — berço ou cadáver:

- **berço**: região de arquivos novos/não rastreados, onde o sistema ainda está se formando;
- **cadáver**: a casca expelida, que a supernova **já desenha** hoje.

O `compose` vira **estrela com sistema declarado**: os 162 serviços que já são luas passam a ser os
planetas dela. Isso encaixa exatamente na decisão "a pasta vira estrela e os arquivos orbitam" — um
compose é uma pasta declarada em arquivo.

### 3.3 O que acontece com o buraco negro

Ele **deixa de ser o centro do universo** e passa a ser o que um buraco negro é: um objeto
específico, num lugar específico. Os candidatos naturais, em ordem de honestidade:

1. **o núcleo cognitivo do agente**, que é o papel que ele já tem em `catalogo-celeste.md` §Buraco
   negro — mas então ele mora numa galáxia, não no centro de tudo;
2. **o centro de uma galáxia** (como o Sgr A\*), se algum agregado justificar;
3. **nenhum**, na cena UNIVERSO, e ele volta ao entrar num sistema.

⚠️ **Esta é a decisão mais cara do documento**, porque a lente do buraco negro custa **3,8–5,1 ms**
de GPU contra **0,31–0,35 ms** do céu inteiro com 213 instâncias. Onde ele estiver, ele domina o
orçamento — e ele está travado por decisão sua desde 2026-08-06.

---

## 4. O que NÃO muda, e por quê

| continua | motivo |
|---|---|
| a janela Roche→Hill das luas | é lei física correta e já demonstrada, não estimada |
| anel = estado do git | é o único dos três aros que **é** um anel (material em órbita) |
| supernova como modificador | virou estado depois de reprovar como classe; a medida está no git |
| a cor por `kind` | é o fato do corpus; o `kind` perde o CORPO mas mantém a cor |
| galáxia = agregado | o único mapeamento que a pesquisa não contradiz |

---

## 5. A colisão dos três aros — a física resolve

Hoje **três feições diferentes leem como "um aro em volta do corpo"**, e afirmam coisas sem relação:

| feição | afirma | vocabulário PRÓPRIO que ela não usava |
|---|---|---|
| anel do git | trabalho aberto | **é** um anel — material em órbita dentro do limite de Roche. **Fica com o aro** |
| anã branca | massa parada | **tamanho e densidade**: massa do Sol no tamanho da Terra |
| coroa da busca | foi recuperado agora | **tempo**: pulsa e passa |

**O conserto da anã branca:** ela perde a borda inteiramente e passa a ser desenhada como o que é —
um corpo **pequeno e desproporcionalmente brilhante para o tamanho**. Nenhuma outra feição do céu
usa esse par, é impossível confundir com anel, e é mais barato de desenhar do que o contorno que
está lá hoje.

A coroa da busca já se distingue por tempo; o que faltava era ela não competir no eixo da forma.

---

## 6. O que precisa ser MEDIDO antes de escrever código

Cada linha aqui é um número que a proposta assume e ninguém conferiu:

1. **Os limiares absolutos da escada de massa.** `chunks` hoje: P50 5 · P75 13 · P90 25 · máx 289.
   Onde ficam os cortes asteroide/lua/planeta/estrela, e quantos corpos caem em cada um?
2. **Quantos sistemas ficam com estrela ambígua** — pasta onde dois arquivos empatam em massa.
3. **A cobertura de nebulosa depois da mudança**: se "berço" não encontrar nenhuma região, a classe
   nasce vazia, e classe vazia é a armadilha que o `censo-corpus.mjs` §3 existe para acusar.
4. **O orçamento de quadro sem o buraco negro central** — a única medida que pode *melhorar* com
   esta reforma, e vale saber quanto.
5. **Quantos dos 103 cometas de hoje sobrevivem** quando o gatilho for atividade e não `kind`.

⚠️ **A regra do catálogo vale aqui inteira:** declarar uma invariante não a implementa. Esta base já
pagou cinco vezes por campo declarado sem leitor. Cada degrau novo precisa nascer com quem o
consulta, ou não nasce.

---

## 7. Ordem de construção sugerida

Do isolado para o estrutural, para que cada passo seja reversível:

1. **A anã branca perde o aro** (§5) — isolado, um shader, sem tocar em taxonomia.
2. **O cometa passa a ser estado, não `kind`** (§2.3) — o modelo já tem `cometa-extinto`.
3. **A escada de massa** (§3) — a mudança de raiz; exige as medidas 1 e 2 do §6.
4. **A órbita local** (`arquivo orbita a pasta`) — exige a decisão dos 336 órfãos.
5. **O buraco negro sai do centro** (§3.3) — a mais cara, e a que mais depende do seu olho.

Os passos 1 e 2 podem ir hoje. O 3 reescreve `MORPHOLOGY_BY_KIND` e move ~1 600 corpos de lugar.

⚠️ **O passo 0, e ele é grátis:** corrigir o `reach` do anel de Júpiter (§2.4) é trocar um número
contra uma fonte primária, sem tocar em taxonomia nenhuma.

---

## 8. Fontes — o que cada uma sustenta

A pesquisa foi feita em 2026-08-07, restrita a NASA, ESA, JPL, Chandra e NTRS. Cada linha diz o que
a fonte afirma e **o que isso decide aqui** — fonte sem consequência não entra.

| fonte | o que ela afirma | o que decide neste documento |
|---|---|---|
| [NASA · Stars](https://science.nasa.gov/universe/stars/) · [Britannica · Planets vs Stars](https://www.britannica.com/science/Whats-the-Difference-Between-Planets-and-Stars) | estrela funde e brilha por luz própria; planeta não tem massa para fundir e só reflete; os planetas do Sol somam ~0,1% da massa do sistema | **§2.1 — a inversão nº 1.** Tipo de corpo É massa. Funda a escada do §3 e derruba `kind` como quem decide o corpo |
| [NASA · Brown dwarf](https://starchild.gsfc.nasa.gov/docs/StarChild/questions/question62.html) | a fronteira estrela/planeta fica em ~13 massas de Júpiter (fusão de deutério) | há um **limiar**, não um degradê — justifica limiares absolutos em vez de percentil |
| [NASA · Decoding Nebulae](https://science.nasa.gov/universe/stories/quick-reads/decoding-nebulae/) | quatro famílias: emissão (ionizada *por* estrela), reflexão, escura (bloqueia), planetária (**casca expelida por estrela moribunda**) | **§2.2 — a inversão nº 2.** Nebulosa é berço ou cadáver; nunca "arquivo grande e difuso". Tira `compose` dela e devolve a nebulosa ao §3.2 |
| [NASA · Comet Facts](https://science.nasa.gov/solar-system/comets/facts/) | núcleo de poucos km; coma e cauda **só perto do Sol**; cometa dormente é indistinguível de asteroide | **§2.3 — a inversão nº 3.** Atividade é estado, não `kind`. Valida o `churn` como gatilho e condena o mapeamento `script` → cometa |
| [NASA · Cassini FAQ](https://science.nasa.gov/mission/cassini/faq/) · [NASA · Saturn Facts](https://science.nasa.gov/saturn/facts/) · [NTRS · Narrow rings of Jupiter, Saturn and Uranus](https://ntrs.nasa.gov/citations/19800044425) | limite de Roche ≈ **2,5 raios** para densidades iguais; dentro dele o material não se acreta; Júpiter e Urano orbitam a ~1,8 raios, e o de Júpiter é *"a mere wisp"* de silicatos | **§2.4 — a inversão nº 4**, e a única medível contra um número do código. Confirma `ROCHE_FLUID = 2,44` e condena `jupiter reach 3,2`. Sustenta o anel FICAR com o aro no §5 |
| [NASA · White Dwarfs](https://imagine.gsfc.nasa.gov/science/objects/dwarfs2.html) · [Chandra · White Dwarfs](https://chandra.harvard.edu/xray_sources/white_dwarfs.html) | massa do Sol no tamanho da Terra; sem fusão, sustentada por degenerescência eletrônica; esfria por bilhões de anos | **§5** — o vocabulário próprio dela é **massa/tamanho**, não contorno. Manda remover a borda implementada em 2026-08-07 |
| [NASA · Characteristics of Galaxies](https://imagine.gsfc.nasa.gov/educators/galaxies/imagine/characteristics.html) · [ESA · Hubble tuning fork](https://sci.esa.int/web/hubble/-/52791-the-hubble-tuning-fork-classification-of-galaxies) | sequência de Hubble: espiral (braços mais ou menos enrolados), espiral barrada, elíptica (E0–E7), irregular; disco plano + bojo central | **§4** — galáxia = agregado é o único mapeamento que a pesquisa **não** contradiz. E dá vocabulário para o degrau: quem tem grupo vira espiral, quem não tem vira elíptica ou irregular |
| [NASA · Active Galactic Nuclei](https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-are-active-galactic-nuclei/) · [Chandra · Quasars](https://chandra.harvard.edu/xray_sources/quasars.html) | quasar e AGN **não são separados** do buraco negro supermassivo — são manifestações do mesmo objeto consumindo matéria; disco e jatos são estruturas da queda; só 1 em 10 tem jato | **§2.6 — a inversão nº 5.** Quasar deixa de ser classe e vira **estado** do núcleo cognitivo. O "1 em 10" vira régua de frequência do jato |
| [NASA · Neutron Stars](https://imagine.gsfc.nasa.gov/science/objects/neutron_stars1.html) · [NASA · Lighthouse Pulsar](https://science.nasa.gov/missions/ixpe/nasa-space-telescope-maps-magnetic-fields-of-lighthouse-pulsar/) | pulsar é o que **sobra** de uma estrela massiva que explodiu; pulsa porque o eixo magnético é desalinhado do de rotação; períodos de 1,4 ms a 8,5 s | **§2.7** — cria a dependência supernova → pulsar que o modelo não tem, e mostra que a faixa de período do céu é uma fatia estreita da real |
| levantamentos de estrutura em grande escala (SDSS, via [NASA · Galaxies](https://science.nasa.gov/universe/galaxies/)) | nós ligados por filamentos, envolvendo vazios; **>70% do volume é vazio**; superaglomerados de 20–100 Mpc | **§2.8** — instrução de distribuição para a cena UNIVERSO: concentrar em nós, não espalhar. Conflita com o layout uniforme por recência |

⚠️ **O que a pesquisa continua NÃO cobrindo, e portanto não sustenta nada aqui:** objetos
artificiais — a estação não tem análogo natural, e é a única feição do céu que é *construída*, o que
por sinal é coerente com ela representar um agente — e a física de sistemas binários, que o catálogo
cita como fronteira `μ ≥ 5` sem fonte externa. Os dois seguem valendo por decisão de produto, não
por embasamento.

---

## 9. O briefing, conferido linha a linha

`briefings/multi-scene.md` é a base desta branch. Ele **acerta a estrutura e erra as folhas**, e o
motivo é sempre o mesmo: ele assume fatos que o corpus não tem. Abaixo, o que fica, o que cai e o
que precisa de trabalho novo.

### 9.1 O que o briefing resolve — e resolve melhor do que eu

**A proposta final dele responde a minha §3.3 e a torna obsoleta.** Eu tratei "o buraco negro sai do
centro" como perda; o briefing mostra que não é remoção, é **separação em dois universos**:

| cena | pergunta | o buraco negro |
|---|---|---|
| **Agentic** | *como a IA está pensando* | **é o centro, e está certo** — tudo converge, gravidade = prioridade |
| **Universe** | *onde o conhecimento vive* | não aparece; cada estrutura domina só a vizinhança |

Isso também **confirma a inversão nº 5** por outro caminho: se o buraco negro é o cérebro e o quasar
é ele consumindo, então quasar é estado da cena Agentic, não corpo da cena Universe.

E o item **"separar contenção de relacionamento"** é o maior ganho do documento: posição comunica
contenção (nunca linha), e a rede de conhecimento aparece **só na seleção**. Isso mata as linhas
gigantes atravessando a cena sem perder o dado.

### 9.2 O que está desatualizado ou não se sustenta no corpus de hoje

| o briefing diz | o que a medida diz | veredito |
|---|---|---|
| **luas = dependências diretas** (`teste.spec.ts`, imagens, métodos) | as luas de hoje são as **`sections`** do arquivo. E dependência exigiria aresta lateral: **medido, `arestas laterais = 0`** | **não implementável hoje.** Ou se cria o fato, ou lua continua sendo seção |
| **cometas = objetos temporários** (downloads, uploads, pesquisas web) | nada disso está indexado. A classe nasceria com **população zero** | **cai.** E a pesquisa dá a definição melhor: cometa é **atividade** (§2.3), que o `churn` já mede |
| **asteroides = snippets, TODOs, comentários** | o indexador **não ingere código**: zero `.ts`/`.py` no índice | **cai como está.** Sobrevive se asteroide for *massa pequena* (§3), não *tipo de conteúdo* |
| **rede de conhecimento** (imports, embeddings, similaridade) | o relacionamento semântico existe **no qdrant**, não no grafo | **trabalho novo**, não ajuste. Criar arestas que hoje não existem |
| **Universo → Superaglomerado → Galáxia → Sistema → Estrela → Planeta → Lua** (6 níveis) | o corpus tem **4**: `repo → dir → file → section` | **precisa de colapso.** Ver 9.3 |

⚠️ **O padrão é único e vale como aviso:** onde o briefing nomeia um tipo de CONTEÚDO (download,
TODO, import), ele descreve um corpus que não existe aqui. Onde ele nomeia uma RELAÇÃO
(contenção, domínio local, escala), ele acerta — porque relação é o que o grafo tem.

### 9.3 Os seis níveis contra os quatro reais

| briefing | corpus | n | como resolver |
|---|---|---|---|
| Universo | o workspace | 1 | direto |
| Superaglomerado | — | — | **não existe fato.** 7 repos não são superaglomerado; ou se apoia em um agrupamento novo, ou o nível é cortado |
| Galáxia | repo | 7 | direto (por contenção, 17 agregados se qualificariam) |
| Sistema Estelar | pasta | **221** | direto |
| Estrela | o corpo mais massivo da pasta | 221 | **um por sistema**, pela escada do §3 |
| Planeta | os demais arquivos da pasta | **1 300** | MED 4 por estrela |
| Lua | as `sections` | — | mantém o fato atual, não o do briefing |

**Dois níveis do briefing não têm fato: superaglomerado e a lua-como-dependência.** Os outros
cinco estão medidos e cabem.

⚠️ E os **336 órfãos** (§3.1) continuam sem lugar nesta tabela — o briefing não os previu, porque
ele descreve a hierarquia ideal e não a que o disco tem.

### 9.4 O que o briefing pede e ainda não foi medido

- **"só aquele sistema é simulado com detalhes; o resto vira LOD"** — a cena já tem escada de LOD
  por pele, mas nunca foi medida com **sistemas locais**; o orçamento de hoje (0,31–0,35 ms para
  213 instâncias) é de um céu plano.
- **"sistemas separados por distâncias realistas"** — precisa da distribuição em nós e vazios do
  §2.8, que contradiz o layout uniforme por recência.
- **"escalar para milhões de entidades"** — o corpus tem 1 864 nós. A afirmação não é testável
  aqui, e o `advance()` já foi medido linear até 10 000 (0,278 ms). Nada sugere problema, e nada
  prova a escala pedida.

---

## 10. A ontologia congelada — estrutura, corpo e fenômeno

Revisão do usuário em 2026-08-07. Ela promove este documento de "melhorias visuais" a **fundação**,
e a tese central é uma inversão de ordem:

```
hoje       filesystem → kind → corpo celeste
a partir   entidade → massa/escala + atividade + composição + relações → manifestação celeste
```

**O filesystem passa a ser fonte de OBSERVAÇÃO, não a taxonomia do universo.** É a mesma correção
da inversão nº 1 (§2.1), agora dita como arquitetura em vez de como defeito.

### 10.1 Três famílias que nunca mais disputam o campo `kind`

```
UNIVERSE
├── STRUCTURES   filamento cósmico · grupo de galáxias · galáxia · aglomerado estelar · sistema
├── BODIES       buraco negro · estrela · planeta · lua · anã branca · pulsar · …
└── PHENOMENA    quasar · supernova · atividade de cometa · acreção · colisão · fluxo de conhecimento
```

Isto resolve, de uma vez, quatro das cinco inversões do §2 — porque todas elas são a mesma coisa:
**um fenômeno ou uma estrutura ocupando o assento de um corpo.** O quasar é o caso exemplar
(§2.6): ele nunca deveria ter competido com "buraco negro" como se fossem corpos equivalentes.

⚠️ O catálogo de hoje já tinha os quatro papéis (`estrutura · corpo · fenômeno · modificador`) e
**registra que dois deles não passam pelo `catalog.js`** — *"ESTRUTURA não existe como papel:
`galaxia` é estrutura e classe ao mesmo tempo, e é essa acumulação que a infla"*. O modelo já sabia
onde doía; faltava separar os campos.

### 10.2 O buraco negro muda de universo, e não de forma

Mantida integralmente a decisão do §9.1. O ganho de a decisão ser esta, e não "tirar o buraco
negro", é ele parar de ser **cinco coisas ao mesmo tempo**: centro cognitivo, objeto astronômico,
splash, representação do agente e representação do workspace.

Na cena Agentic ele continua sendo a interface conceitual do Context Engine — e lá o centro único
está **certo**, porque ali a gravidade É prioridade.

---

## 11. `EntityPhysics` — a peça que falta, e o que dela tem fato hoje

O modelo intermediário que impede a recaída (`if kind === 'folder' galaxy()`):

```
EntityGraph → EntityPhysics → classificação → Structure|Body|Phenomenon → morfologia → render
```

**Nenhuma morfologia nova antes disto.** Mas antes de especificar as onze dimensões, uma medida —
porque a REGRA DO CATÁLOGO diz que declarar uma invariante não a implementa, e esta base já pagou
cinco vezes por campo declarado sem leitor:

| dimensão | fato hoje | de onde | veredito |
|---|---|---|---|
| `mass` | ✅ | `chunks` (P50 5 · P75 13 · P90 25 · máx 289) | pronto |
| `activity` | ✅ | `churn` na janela de 30 dias | pronto |
| `recency` / `age` | ✅ | posição no ranking, uniforme por construção | pronto |
| `volatility` | ~ | `regularity` existe, mas mede RITMO, não variância de tamanho | precisa definir |
| `composition` | ~ | `kind` + extensão — **13 extensões, 45,7% `.md`, ZERO código** | pobre por construção do indexador |
| `scale` | ~ | derivável de `mass`, mas é o que a escada do §3 precisa nomear | precisa dos limiares |
| `density` | ❌ | não há bytes por chunk no nó | **sem fato** |
| `centrality` | ❌ | só grau de contenção; **arestas laterais = 0** | **sem fato** |
| `connectivity` | ✅ | **ALCANCE** — fração dos vínculos laterais que sai do sistema (`scripts/conectividade.mjs`, 08/08) | resolvida, e **não como pedida**: o grau repetia a centralidade (ρ 0,821) |
| `importance` | ❌ | nada mede | **sem fato** |

**Quatro das onze não têm fato, e duas delas (`centrality`, `connectivity`) são justamente as que
o §7 da revisão usa para separar atividade de massa.** Especificá-las sem criar o fato seria repetir
o defeito que o modelo está tentando corrigir.

⚠️ **O caminho para as duas é o mesmo, e o usuário já o nomeou:** o relacionamento semântico do
qdrant. Ele existe, mas **não está no grafo** — hoje o grafo é 100% contenção. Criar essas arestas
é a única dependência dura de `EntityPhysics`, e é trabalho, não configuração.

**→ O plano está em [`integracao-neo4j.md`](./integracao-neo4j.md)**, e ele resolve as quatro:
`connectivity` e `centrality` vêm do Neo4j; `density` **não é do Neo4j** (é bytes por chunk, fato
que o indexador não emite); e `importance` é **recusada como dimensão** — ela é juízo, não fato, e
derivá-la seria reconstruir o score composto que a §3.2 das medições já refutou.

A lei que torna isso seguro, e que decide o desenho inteiro: **o Neo4j pode mudar o BRILHO, nunca a
CLASSE.** Se `centrality` decidisse classe, um container caindo faria corpos trocarem de identidade
— e o usuário aprenderia que a forma não significa nada.

### 11.1 A quinta dimensão: atividade ≠ massa

A separação que a revisão acrescenta, e que este documento não explorava:

| grandeza | governa |
|---|---|
| massa | escala e gravidade |
| atividade | energia e brilho |
| centralidade | influência |
| idade | evolução |
| relações | estrutura |

O caso que ela protege: **um arquivo pequeno, muito acessado, usado por muitos agentes e com muitas
relações não deve virar galáxia.** Ele é pequeno — vira um corpo pequeno e **muito brilhante**.

Isso encaixa exatamente na correção da anã branca (§5): lá o par é massa alta + brilho baixo; aqui é
massa baixa + brilho alto. **Os dois eixos passam a ser lidos juntos, e é isso que dá vocabulário
próprio a cada feição** — sem precisar de mais um aro.

---

## 12. As fases, e a métrica que decide se funcionou

**A ordem é inegociável: a próxima rodada não começa pelo visual.**

| fase | o que se faz | condição de saída |
|---|---|---|
| **A — congelar ontologia** | `Structure`, `Body`, `Phenomenon`, `EntityPhysics`, classificação derivada | os quatro fatos ausentes do §11 têm dono ou estão explicitamente adiados |
| **B — recalcular o céu** | rodar os **1 636** objetos e medir distribuição por classe, massa, atividade, densidade, composição, centralidade, conectividade, linguagem, idade | um censo novo, na linha do `censo-corpus.mjs` |
| **C — comparar antes/depois** | o mesmo corpus nos dois modelos | ver a métrica abaixo |
| **D — shaders** | só aqui | — |

### A métrica principal

> **Quantas entidades continuam recebendo uma classe cosmologicamente grande sem merecê-la?**

O número de partida está medido e é brutal: **hoje TODO agregado é galáxia — 228 de 228.** Por
contenção, o modelo declarado já separa `galáxia 17 · aglomerado 21 · sistema 71 · hub raso 119`.

```
1 636 entidades + 228 agregados

ANTES   ████████████████████  228 galáxias  (100% dos agregados)
DEPOIS  █ 17 galáxias · ██ 21 aglomerados · ████ 71 sistemas · ██████ 119 hubs rasos
```

⚠️ **Este é o teste da reforma inteira.** Se depois do recálculo os 228 continuarem grandes, a
ontologia não mudou nada — só trocou os nomes.

### O pipeline de cobertura, na ordem certa

```
CORPUS REAL → medição → EntityPhysics → classificação → morfologia → FIXTURE → stress test
```

E não o contrário. A regra de engenharia, que o `cobertura.md` já sustenta:

- **fixture = CAPACIDADE** — pode conter de propósito um pulsar extremo, uma nebulosa rara, um
  cometa saturado;
- **corpus real = COMPORTAMENTO do céu** — é ele que diz se o universo está repetitivo, saturado ou
  fisicamente incoerente.

---

## 13. Só depois: o universo vivo

Com a cosmologia correta, os eventos voltam — e ganham lugar, porque agora existe a família
PHENOMENA para recebê-los:

```
System Event → Universe Event → Phenomenon → Entity → Animation
```

```
file.uploaded     → proto-objeto capturado → acreção → a entidade evolui
agent.reasoning   → fluxo de conhecimento  → conexões iluminam
semantic.search   → ativação gravitacional → entidades relevantes brilham
```

⚠️ **`fluxo` e não `entrelaçamento`**, e a distinção é semântica, não estilística: entrelaçamento
representa **relação persistente**; fluxo representa **atividade real**. Chamar o segundo pelo nome
do primeiro afirmaria permanência onde há evento.

---

## 14. A pilha congelada

```
                    SPATIA
                       │
                 ENTITY GRAPH
                       │
                ENTITY PHYSICS
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
      STRUCTURE      BODY       PHENOMENON
          │            │            │
          └────────────┼────────────┘
                       ↓
                  MORPHOLOGY
                       ↓
                   DYNAMICS
                       ↓
                  RENDERING
                       ↓
                 EVENT SYSTEM
                       ↓
                  USER ACTION
```

**A próxima peça a especificar é `EntityPhysics`** — antes de qualquer implementação, e com os
quatro fatos ausentes do §11 resolvidos ou adiados por escrito.

⚠️ O §7 (ordem de construção) fica **subordinado a isto**. O passo 0 (raio do anel de Júpiter) e o
passo 1 (a anã branca perde o aro) sobrevivem porque são correções de valor contra fonte, não
morfologias novas. Os passos 3 a 5 esperam a Fase A.

---

## 15. O que a bancada já validou — 2026-08-07/08

A cena começou pelos espécimes, e não pelo céu, porque a regra do cabeçalho proíbe morfologia nova
antes da classificação. **Nenhuma linha de `src/space/` foi tocada.** O que existe são dois
espécimes e quatro leis derivadas com medida.

### `SISTEMA LOCAL` — um sistema

| lei | como ficou | medida |
|---|---|---|
| **massa → raio** | **duas curvas**: planeta `R ∝ M^(1/3)`, estrela `R ∝ M^0.8`, encontrando-se no limiar | razão estrela/maior planeta **1,36 → 3,62**; faixa do corpus 3,6× → **23×** |
| **órbita** | elipse com a estrela no **foco**, equação de Kepler por Newton | área varrida em tempos iguais **máx/mín = 1,0008**; v periélio/afélio converge para o `(1+e)/(1−e)` teórico |
| **excentricidade** | **planetária** por default (0,018–0,042) | de cima lê como círculo (achatamento 0,01–0,08%); a elipse lateral é a inclinação |
| **movimento** | o sistema **viaja**, e a composição orbita+translação é uma **hélice** | rastro amostrado em coordenadas de mundo |

⚠️ **O achado que mudou o replanejamento:** a inversão nº 1 tem DUAS metades. Corrigir quem é
estrela sem corrigir a lei de raio troca a inversão por um empate — a lei `log2` comprimia o corpus
inteiro em 3,6×, e nenhuma escada de massa sobrevive a isso.

### `UNIVERSO` — 221 deles

| pergunta | resposta |
|---|---|
| 221 sistemas cabem? | **sim, com rejeição**: 30 tentativas → **0 colisões**, vizinho 12,02 (= 2× o raio, o limite de empacotamento) |
| distribuição em teia funciona? | sim, mas **só com rejeição** — reservar volume não basta, é o problema do aniversário |
| e a uniforme de hoje? | também converge, e é justamente esse o problema: ela não produz nós nem vazios |

⚠️ Duas tentativas fracassadas ficaram registradas no código (vizinho 0,0 com queda cúbica; 132
colisões estagnadas com volume reservado), porque a terceira só se entende contra elas.

### O que a bancada NÃO valida, e continua bloqueado

- **quem é estrela** — depende da escada de massa (§3), que depende da Fase A;
- **de onde vem a excentricidade** — o candidato é atividade (cometa é o corpo excêntrico da
  natureza), mas isso é classificação, não layout;
- **os 336 órfãos** — arquivo sem pasta continua sem lugar;
- **`MASSA_FUSAO = 20`** — âncora entre P75 e P90, marcada como expirável no código.

**A ordem do §7 permanece.** O que a bancada fez foi derivar as leis de LAYOUT, que não são
morfologia e por isso não esbarravam na regra. A cena no céu espera a Fase A.

---

## 16. Fases A · B · C — executadas, 2026-08-08

`src/space/entity-physics.js` (o modelo) + `scripts/censo-ontologia.mjs` (o leitor). O módulo é
**puro** — não importa `three` — e é isso que deixa medida e céu usarem a MESMA derivação em vez de
duas cópias. **Nenhum shader tocado: a Fase D não começou.**

### Fase A — ontologia congelada

As três famílias existem em código, e as quatro dimensões sem fato estão **declaradas** em
`AUSENTES`, valendo `null` e nunca `0`.

⚠️ **A regra que a medida corrigiu: DOMINÂNCIA decide papel, MASSA decide porte.** A primeira
versão usava o limiar global de massa para decidir quem é estrela, e o corpus respondeu: **80
estrelas, 148 sistemas SEM estrela e 174 "companheiras"**. Cento e setenta e quatro binárias não é
um céu — é um limiar aplicado na pergunta errada.

E a correção torna a inversão nº 1 **impossível por construção**: a dominante é a mais massiva do
sistema, logo nenhum planeta pode ser maior que a sua estrela. É a diferença entre invariante
implementada e invariante declarada, que esta base já pagou cinco vezes para aprender.

### Fase B — o céu recalculado

| família | n | | corpo | n | % |
|---|---|---|---|---|---|
| estrutura | 228 | | **estrela** | **228** | 13,9% |
| corpo | 1 636 | | planeta | 444 | 27,1% |
| | | | lua | 407 | 24,9% |
| | | | asteroide | 557 | 34,0% |

**Uma estrela por sistema, exatamente 228.** Porte: anã 148 · normal 57 · gigante 23.

Fenômenos, que acontecem sem trocar classe nenhuma: atividade-de-cometa 229 · anã branca 45 ·
supernova 38 · extinto 5 — 301 corpos (18,4%) com ao menos um.

⚠️ **Os 336 órfãos deixaram de existir, e a resposta é estrutural:** eles penduram direto no
REPO, e repo é agregado. O sistema deles é o repositório. A pergunta do §3.1 tinha resposta no
próprio grafo.

### Fase C — a métrica

```
ANTES   ████████████████████████████████████████  228 galáxias (100% dos agregados)
DEPOIS  █                                           7 galáxias (repo)
        ███████████████████████████████████████   221 sistemas (diretório)
```

**Classe grande indevida: 228 → 7 (−96,9%).** A ontologia não trocou nomes; ela mudou quantos
corpos recebem escala cosmológica.

### E uma correspondência que ninguém plantou

65% das estrelas do corpus são **anãs** (dominante abaixo do limiar de fusão). Na Via Láctea, anãs
vermelhas são ~70–75% de todas as estrelas. A forma da população estelar bate com a da natureza
porque as duas saem da mesma coisa — a maioria das pastas é pequena, como a maioria das estrelas.

### O que trava a Fase D

`connectivity` continua sem fato. `centrality` fechou no P3 e **`usage` fechou no P5** — a quinta
grandeza do §11.1 pelo caminho que só o diário conhece: *influência por USO, não por semelhança*.

⚠️ **E o P5 introduziu uma distinção que vale para toda dimensão daqui em diante:**

> **"a dimensão existe" ≠ "a dimensão tem poder estatístico para classificar".**

Ele foi construído com evidência deliberadamente rala (11 execuções, grau máximo 2), porque o
encaixe custa menos agora do que uma segunda integração depois — e o que impede isso de virar
autoengano é a evidência ser **publicada junto com o número**, por `evidenciaDeUso()`. Dimensão
ausente vale `null`; dimensão presente e fraca vale um número pequeno com o veredito ao lado.

A lei que protege tudo isso deixou de ser declaração: **`scripts/lei-neo4j.mjs` perturba
`centrality`, `usage` e `connectivity` em 29 448 combinações sobre os 1 636 corpos e exige classe,
porte, fenômeno e escala idênticos.** Era a última invariante desta base que valia por lembrança —
e esta base já pagou cinco vezes por isso.
