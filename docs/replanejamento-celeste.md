# Cena UNIVERSO — o replanejamento celeste

> **Estudo, não implementação.** Nada aqui está em `src/`. O documento existe para ser aprovado por
> partes: cada seção tem o número que a torna decidível e a fonte que a sustenta.
>
> Base: [`catalogo-celeste.md`](./catalogo-celeste.md) (o modelo atual), o briefing
> [`briefings/multi-scene.md`](./briefings/multi-scene.md) (a cena nova) e uma rodada de pesquisa
> em fontes primárias (NASA, ESA, Chandra) feita em 2026-08-07.

---

## 0. O veredito, em cinco linhas

1. O céu de hoje afirma uma hierarquia gravitacional **invertida**, centenas de vezes por quadro.
2. A causa é uma só: **tipo de corpo e massa são tratados como eixos independentes**, e na
   astrofísica eles são o mesmo eixo.
3. Duas outras inversões (`compose` → nebulosa, `script` → cometa) são consequências dela.
5. O buraco negro central não é um detalhe estético: ele é a afirmação de que existe **um** centro,
   e o universo real não tem nenhum.
6. A colisão dos três aros se resolve **pela física**, não por ajuste de brilho — cada feição já
   tem um vocabulário próprio que ninguém usou.

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

⚠️ **O que a pesquisa NÃO cobriu, e portanto não sustenta nada aqui:** superaglomerado e filamento
(o topo do briefing), objetos artificiais (a estação não tem análogo natural — ela é a única feição
do céu que é *construída*, e isso é coerente com ela representar um agente) e a física de sistemas
binários, que o catálogo já cita como fronteira `μ ≥ 5` sem fonte externa.
