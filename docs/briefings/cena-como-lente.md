# A cena é uma LENTE, não uma dona

> **Estado:** briefing conferido contra o código em 2026-08-09, nos moldes do §9 do
> [`replanejamento-celeste.md`](../replanejamento-celeste.md). Cada afirmação sobre o que existe hoje
> traz `arquivo:linha`. O que é proposta está marcado como proposta.
>
> **Origem:** pedido do usuário (*"uma forma prática, dinâmica, escalável e otimizada para controlar
> as cenas"*) + revisão arquitetural externa. Este documento **adota a tese central** da revisão e
> **corrige as folhas** — que é o padrão que todo briefing desta pasta seguiu até agora.

---

## 0. A tese, aceita sem ressalva

> **A cena não é dona do universo. A cena é uma lente sobre o universo.**

Ela está certa, e está certa *nesta base em particular* — porque esta base já pagou duas vezes pelo
oposto. A REGRA DO CATÁLOGO nasceu quando classificar por exclusão fez **uma LUA em foco resolver
como GALÁXIA**; a Fase B foi refutada quando a taxonomia velha transformou **228 de 228 agregados em
galáxia**. Nos dois casos o defeito tem a mesma forma: *o modo de olhar decidiu o que a coisa é*.

O corolário operacional, e é ele que este documento defende linha a linha:

> **Nenhuma cena pode alterar a CLASSE, a FÍSICA ou o COMPORTAMENTO de uma entidade. Cena decide
> APRESENTAÇÃO — o que é desenhado, com que pose, em que composição, sob quais gestos.**

⚠️ Isto é a mesma forma da **primeira lei do Neo4j** (*muda o BRILHO, nunca a CLASSE*) e da
**REGRA DA FÍSICA** (*se um problema pode ser resolvido fora da simulação, deve ser*). Não é uma lei
nova: é a lei existente aplicada a um eixo que ainda não a tinha.

---

## 1. O que a revisão descreve e JÁ EXISTE — com outro nome

Metade da arquitetura proposta está construída. Nomear isso primeiro evita a armadilha nº 5 (*medir a
grandeza errada parece medir*) na sua forma de projeto: **reescrever o que já funciona.**

| a revisão pede | já existe como | evidência |
|---|---|---|
| *"um controlador, duas apresentações"*, e a troca **anunciada** | `setMode` emite `ui.scene-mode`; quem desenha ESCUTA, em vez de se repintar no clique | `scene.js:2486-2563`, `hud/cena.js:57` |
| separar `System Event → Universe Event → Phenomenon → Entity → Animation` | é o desacoplamento do barramento, com a justificativa escrita | `docs/EVENTS.md:6-9`, `src/core/bus.js:1-8` |
| *"a animação nunca conhece Qdrant ou Webhook"* | já é lei, e a prova é o webhook: um push do GitHub é traduzido num par `tool` call/result **porque é isso que a cena já sabe desenhar** | `server/webhooks.py:214-221` |
| um registro com recusa alta de id duplicado | `registerApp` / `registerWidget`, com manifesto e `claims` | `src/kernel/registry.js:65-131` |
| **slots** | `SLOTS = ['left', 'right', 'stage', 'strip']` — o conceito existe, com outro vocabulário | `src/kernel/registry.js:51` |
| gesto declarado fora do núcleo | `claims` — `ui.select:file` reivindica o gesto sem o kernel saber de arquivos | `kernel/router.js:169-173` |
| *"tabela em vez de `if` encadeado"* para composição | **`ROTAS_DO_POOL` é o exemplar desta base**, e o comentário dele já é a defesa da ideia: *"pele nova é uma linha; quem esquecer o `far` não compila um caso silencioso, porque a rota inteira falta"* | `scene.js:286-300` |
| Entity independente da taxonomia visual | `entity-physics.js` e `superficies.js` são módulos **PUROS** (sem `three`), e é isso que deixa o censo e o céu usarem a MESMA derivação | `src/space/entity-physics.js`, `src/space/superficies.js:22-27` |
| LOD por representação, não por perda de capacidade | `lod.js` decide nível por **PIXEL** do corpo, e a pele some sem o corpo deixar de existir | `src/space/lod.js:44-49,168` |

⭑ **A conclusão que isso impõe ao plano:** o trabalho **não é construir uma arquitetura de cenas.**
É **extrair** a que já existe de dentro de `setMode`, dar-lhe nome, e torná-la declarativa. O risco
do projeto não é ambição — é reescrita.

---

## 2. TRÊS COLISÕES DE NOME — e nesta base o nome é o guarda mais barato

A revisão é agnóstica de código e por isso escolhe palavras que aqui **já estão ocupadas**. Trocar o
nome depois custa mais do que escolher agora. Esta base já registrou que *"o nome é o guarda mais
barato que existe"* — foi assim que `mass` caiu duas vezes.

### 2.1 ☠️ `capability` já é um conceito, e é de SEGURANÇA

`server/capabilities.py` define **capability = (verbo, escopo, limite)**, e ela é o portão real que
autoriza uma chamada de ferramenta: `_matches` casa o verbo por `fnmatch`, `_in_scope` confere o
alvo, e o gate roda no `PreToolUse` (`server/capabilities.py:83-102`, `server/app.py:459`).

A revisão usa `capabilities` para **afordâncias de entidade** (`open`, `inspect`, `focus`, `orbit`).
São coisas de naturezas opostas: uma **proíbe**, a outra **oferece**. Um leitor que veja
`entity.capabilities` vai procurar `config/capabilities.json`.

> **Proposta:** a afordância chama-se **`acoes`** (ou `affordances`). `capability` fica reservada à
> segurança. ⚠️ E a distinção é substantiva, não cosmética: a ação de uma entidade **pode exigir**
> uma capability — clicar em "executar" num corpo passa pelo portão. Se os dois tiverem o mesmo
> nome, essa dependência fica invisível.

### 2.2 `slots` já existe, com outro vocabulário

`registry.js:51` declara `SLOTS = ['left', 'right', 'stage', 'strip']` — vocabulário de **layout de
app**. A revisão propõe `{overlay, hud, sidebar, world, navigation, debug}` — vocabulário de **cena**.

Dois conjuntos de slots com o mesmo nome e semânticas diferentes é a receita de um `strip` que às
vezes é `hud`. **Proposta:** ou a cena reusa os quatro existentes, ou o conceito dela chama-se
**`camadas`** (que é o que o próprio documento também chama de `layers`) e `slots` continua sendo do
kernel. **Não os dois.**

### 2.3 `mode` já está gasto, e somar um eixo dá 8 estados

A cena já tem um eixo de modo (`agente | universo`), com switcher, tecla `U` e sonda. Existe **também**
o modo CINEMA, que é global e já implementado (`main.js:776-781`, `index.html:121-122`). A revisão
propõe um `SceneMode` por cena (Explore/Focus/Inspect/**Cinematic**) — e `Cinematic` **já existe como
outra coisa**.

Somar um eixo ortogonal dá `cena × modo × cinema`. E a lição já foi paga: um segundo lugar pintando
estado **mente** — foi medido em quatro capturas, com a sonda em UNIVERSO e o botão em AGENTE, e foi
o que `77c97d9` consertou.

> **Proposta:** **um estado, um anunciante.** Se `modo` entrar, ele entra *dentro* do estado de cena
> (`{cena, modo}` emitido por um único `ui.scene-mode`), e `cinematic` é **migrado para dentro dele**
> como modo — não convive como terceiro eixo.

---

## 3. O que a revisão NÃO sabe, e muda o desenho

Cinco fatos desta base que qualquer contrato de cena tem de absorver. Os cinco já custaram caro.

### 3.1 ☠️ Cena não é `visible` — é PASSE, e passe tem PARIDADE

Trocar de cena aqui **não é ligar e desligar objetos**. A linha que de fato muda de universo é:

```js
lensing.pass.enabled = !universo;        // scene.js:2501
```

O buraco negro é, acima de tudo, um **passe de pós-processamento**. Esconder o grupo dele deixa a
lente rodando: *"a cena trocou, os corpos sumiram, e a distorção do espaço-tempo ficou"*
(`scene.js:2491-2499`, e a armadilha nº 12 do §5 do handoff).

E há um agravante que nenhum briefing menciona: **a cadeia de passes tem PARIDADE DE SWAPS**
(`RenderPass → lensing → UnrealBloom → OutputPass`). Acrescentar ou remover um passe inverte para
qual buffer a profundidade é gravada, e **a lente passa a ler um buffer vazio, em silêncio**
(`scene.js:~528-533`).

> **Consequência para o contrato:** `SceneDefinition` declara **`passes`** como cidadão de primeira
> classe, e a troca de cena varre a lista inteira — nunca só `visible`. Uma cena que declara passe
> novo **muda a paridade**, e isso precisa de guarda automática, não de memória.

### 3.2 ☠️ `orbit.distance` tem SETE consumidores, e não é distância

Ela é usada como proxy de *"quão longe estão as coisas"* por: piso do zoom (`scene.js:1362-1385`),
escala do pan livre (`:713`), amplitude da paralaxe (`:1798`), chegada a sistema (`:741`), chegada por
`anexar` (`:2652`), persistência em `prefs` (`:1448,1467`) e a sonda `ancora()` (`:2605`).

Uma cena com câmera livre (voo, primeira pessoa, timeline) **não tem âncora**, e `orbit.distance`
deixa de significar qualquer coisa — mas os sete continuam lendo. Eles passam a discordar **em
silêncio**, que é a armadilha nº 5 multiplicada por sete.

> **Consequência:** a política de câmera não pode ser um preset de valores. Ela precisa publicar uma
> **`escalaLocal`** — a grandeza que responde *"quão longe estão as coisas daqui"* — e os sete
> passam a ler ela. Na câmera orbital, `escalaLocal === orbit.distance` (número idêntico, zero
> mudança). Numa câmera livre, é `corpoMaisProximo(pos).dist`. **Uma pergunta, uma variável.**

### 3.3 O teclado desta base não sabe responder "está pressionado AGORA"

`keys.js` é **keydown-only**, bloqueia `event.repeat` salvo permissão explícita, e dá
`preventDefault()` em todo acerto (`keys.js:112-129`). **Não existe um único `keyup` em `src/`.**

E a guarda de duplicidade (`keys.js:86-92`, que lança erro alto) **tem um furo**: `hud/cena.js:41`
prende `KeyU` num `window.addEventListener('keydown')` cru, invisível para `keys.list()`/`hints()`. E
`Shift` — que a revisão e o `ship-navigator` querem para boost — **já é o gesto de VOO LIVRE**
(`scene.js:1098-1103`), também fora do `keys.js`.

> **Consequência:** o mapa de atalhos por cena/modo é uma boa ideia **e não é suficiente**. Ele exige
> (a) **camadas** no registro (`keys.setLayer`), para que uma cena suprima os atalhos da outra em vez
> de competir; (b) **eliminar os dois listeners crus**, senão a guarda continua cega justamente onde
> o conflito nasce; (c) um canal separado para tecla MANTIDA, com `keyup` **e** `blur`/
> `visibilitychange` — sem isso, sair da aba com a tecla apertada deixa o gesto ligado para sempre.

### 3.4 O LOD daqui é por PIXEL, e "detalhe por zoom" está REFUTADO por medida

A revisão propõe a escada `billboard → geometry → full shader → internals` como responsabilidade da
cena. Metade disso já existe (`lod.js`), e **a outra metade está refutada**:

- *"A pele não é alcançável por zoom, só por foco"* — medido: 49,7 de 71 corpos abaixo de 4 px, **0
  de 71** acima de 22 px (o menor `LOD_FAR_PX` da base), maior corpo da tela 17,1 px.
- **Baixar `LOD_FAR_PX` está refutado por medida** — não existe valor que faça pele aparecer a
  distância; só alarga a bolha do foco.

> **Consequência:** `entityFilter` e LOD por cena são legítimos, mas **a cena não pode prometer
> detalhe por aproximação de câmera** — nesta geometria isso não acontece. O que revela detalhe aqui
> é **foco** e o **pool de peles** (teto 4, `cortadas` publicado). Uma cena nova herda esse fato ou
> repete a medida.

### 3.5 O orçamento está no PÓS, e é por isso que cena é barata mas passe não é

| cena | geometria | pós | quadro |
|---|---|---|---|
| UNIVERSO | **0,23 ms** | 2,3–2,6 ms | ~2,5 ms (**~90% pós**) |
| AGENTE | 1,95 ms | 1,42 ms | 3,37 ms |

> **Consequência:** **cena nova é barata; passe novo não é.** Uma cena que só recompõe o que existe
> entra no bolso de 0,23 ms. Uma que declara um passe próprio entra no bolso de 2,4 ms — e o pulsar
> sozinho já leva o quadro a 5,66 ms. **Toda `SceneDefinition` que declarar passe próprio remede.**

---

## 4. O CONTRATO — cinco peças, na ordem em que devem nascer

Adotando a recomendação da revisão (**não começar pelo `SceneManager`**) e corrigindo os nomes.

### 4.1 `SceneDefinition` — o que a cena É (dado, não código)

```js
{
  id: 'universo',
  rotulo: 'UNIVERSO',

  // ☠️ PASSES são cidadão de primeira classe — ver §3.1. Não é `visible`.
  passes:   { lensing: false, bloom: true },
  visiveis: { blackHole: false, graph: false, galaxy: false, universe: true },

  camera:   { estrategia: 'orbita', alvo: 'ancora-livre', chegada: 'envelope*2.6' },
  foco:     { estrategia: 'livre' },          // ver §4.2
  gestos:   { pan: 'shift|meio', roll: false },
  atalhos:  { KeyF: 'focar', Escape: 'soltar' },

  pele:     { pool: true, teto: 4 },
  camadas:  ['corpos', 'sprites', 'aneis', 'rede'],
  filtro:   (entidade, ctx) => …,
  observa:  ['memory', 'token', 'tool'],      // ver §4.5
}
```

⚠️ **Ela é DADO, e isso é o ponto.** O molde é o `ROTAS_DO_POOL` (`scene.js:290`), e a propriedade que
o comentário dele defende vale igual aqui: **quem esquecer uma chave não compila um caso silencioso,
porque a rota inteira falta.** É a REGRA DO CATÁLOGO aplicada à cena — nomeie o que ela ACEITA.

### 4.2 A política de FOCO — e aqui a revisão está certa e a base já concorda

A revisão propõe estratégias (`entity`, `selection`, `cluster`, `bounds`, `origin`, `dynamic`) em vez
de uma coordenada. **Isso já é o comportamento desta base, e por escrito.** A âncora do UNIVERSO
publica um campo **`porque`** que nomeia o degrau em vigor — *"voo livre → objeto anexado → corpo em
foco"* (`scene.js:2595`) — e ele existe justamente porque a origem e um sistema perto dela **dão a
MESMA foto** num enquadramento largo.

> ⭑ **A sonda `porque` é a prova de que a estratégia é o modelo certo, e ela deve ser obrigação do
> contrato:** toda política de foco publica **por que** está onde está. Sem isso, "o centroide mudou"
> não tem imagem e nenhum defeito de âncora é diagnosticável.

⚠️ E o fato mais importante que a revisão não tem: *"não existe centro no universo real"* é decisão
escrita do usuário, e a cena UNIVERSO **já** implementa voo livre por causa dela. Uma estratégia de
foco que reintroduza um centro obrigatório desfaz isso.

### 4.3 `SceneRuntime` — o que está acontecendo nela AGORA

Estado vivo, separado da definição: câmera corrente, seleção, foco, camadas ativas, peles montadas.

⚠️ **A obrigação que a revisão não menciona e é a mais cara:** trocar de cena **não pode destruir o
universo**. Hoje isso já vale — `universe.setVisible()` e `graph.group.visible` escondem, não
descartam. Um runtime que monte e desmonte entidades por troca de cena reintroduziria o custo que
essa decisão evita, e quebraria o princípio 11 do `CLAUDE.md` (*nada aparece, nada desaparece*).

### 4.4 `SceneRegistry` — e ele já tem molde nesta base

`registry.js:65-131` já faz exatamente isto para apps e widgets, **com recusa alta de id duplicado**
(`keys.js:86-92` faz o mesmo para atalhos). O registro de cenas copia a disciplina, não a inventa.

### 4.5 `observa` — o filtro de eventos, e ele tem um pré-requisito

A revisão propõe que cada cena declare os eventos que observa, para o runtime não entregar tudo a
todos. Correto — e **hoje é prematuro por um motivo medido**: existe **um único produtor** de eventos
(`webhooks.subscribe()`), e `universe.js` **não tem uma única assinatura de barramento**. Filtrar um
produtor entre duas cenas é cerimônia.

> **Ele passa a valer no dia em que o produtor ambiental existir** (item 3 da ordem do §7-B do
> handoff). Declará-lo antes é a REGRA DO CATÁLOGO pela sexta vez: **entrada sem leitor.**

---

## 5. As AÇÕES da entidade — o ponto nº 12 da revisão, e ele é o coração

A revisão está certa e o exemplo dela é exatamente o defeito a evitar:

```js
UniverseScene.onClickPlanet = () => openDocument()     // ❌
AgentScene.onClickPlanet    = () => inspectAgent()     // ❌
```

⭑ **E esta base já resolveu isso uma vez, com outro nome: `claims`.** O gesto `ui.select:file` é
reivindicado por um app, e o kernel **não sabe o que é um arquivo** (`kernel/router.js:169-173`). A
entidade oferece; a cena escolhe o que expor; o kernel não decide nada.

> **Proposta:** a ação de entidade nasce **como `claims` de cena**, reusando o mecanismo que já
> existe e já foi validado, em vez de um registro paralelo. `acoes` na entidade (§2.1), `claims` na
> cena, e o kernel continua ignorante.

⚠️ **A trava que precisa vir junto:** uma ação **nunca** pode alterar classe, física ou pele. Se
puder, a cena voltou a ser dona — e o oráculo que prova isso já existe em espírito:
`scripts/lei-neo4j.mjs` perturba as dimensões do grafo em 29.448 combinações e **exige classe
idêntica**. Um oráculo irmão (`lei-cena.mjs`) faria o mesmo perturbando a cena: **classificar o céu
inteiro em cada cena registrada e exigir classe, física e pele idênticas.**

> ⭑ **Este oráculo é a peça mais importante de todo o plano.** Sem ele, "a cena é uma lente" é uma
> invariante declarada — e esta base já pagou **cinco vezes** por invariante declarada e não
> implementada. Com ele, é comportamento provado a cada commit.

---

## 6. O que NÃO entra, e por quê

| proposta | veredito |
|---|---|
| `SceneManager` que possua os objetos | ❌ **a própria revisão o recusa**, e com razão |
| detalhe revelado por aproximação de câmera | ❌ **refutado por medida** — ver §3.4 |
| `Cinematic` como modo de cena | ⚠️ **já existe como modo global** — migrar, não duplicar (§2.3) |
| `capabilities` para afordância de entidade | ⚠️ **colide com segurança** — usar `acoes` (§2.1) |
| `observa` por cena | ⏸️ **prematuro** — um produtor só (§4.5) |
| cena declarando passe próprio | ⚠️ permitido **com remedição obrigatória** — paridade de swaps + 90% do quadro (§3.1, §3.5) |
| entidade montada/desmontada na troca de cena | ❌ viola *nada aparece, nada desaparece* (§4.3) |
| `mode` como terceiro eixo ortogonal | ❌ 8 estados, e um segundo anunciante **mente** (§2.3) |

---

## 7. A ORDEM, com as guardas

O critério é o desta base: **extração antes de invenção, e todo passo com um número que tem de se
repetir.**

1. **Extrair `SceneDefinition` de `setMode`, sem mudar um número.** As cinco linhas de
   `scene.js:2501-2510` viram duas tabelas (`passes`, `visiveis`) para as duas cenas existentes.
   **Guarda:** `spatia.cena()`, `.universo.pixels()`, `.ancora()` e `sobreposicoes()` repetem ao
   dígito, do jeito que a renomeação `mass → chunksNorm` fez. Se um número mudar, a extração mudou
   comportamento.
2. **`escalaLocal`** — os sete consumidores de `orbit.distance` passam a lê-la; na câmera orbital ela
   **é** `orbit.distance`. **Guarda:** os mesmos números, ao dígito.
3. **`lei-cena.mjs`** — o oráculo do §5, antes de existir uma terceira cena. Ele é barato agora
   (duas cenas) e insubstituível depois.
4. **Camadas no `keys.js` + matar os dois listeners crus** (`hud/cena.js:41` e o `Shift` de
   `scene.js:1098`). **Guarda:** `keys.list()` passa a conter tudo; a guarda de duplicidade volta a
   ser verdadeira.
5. **`SceneRegistry`**, copiando a disciplina de `registry.js`. Só aqui uma terceira cena vira barata.
6. **`{cena, modo}` num anunciante só**, com `cinematic` migrado para dentro.
7. **`observa`** — depois do produtor ambiental, não antes.

⚠️ **O que este briefing NÃO mediu:** o custo de uma cena nova (nenhuma foi construída sob este
contrato), o custo de um passe por cena, e se `escalaLocal` cobre os sete consumidores sem resto —
o sétimo (`prefs`) **persiste** o valor, e persistir uma grandeza que muda de significado por cena é
um caso que precisa de decisão, não de código.

---

## 8. A dependência que decide a metade disto

`ship-navigator.md`, `black-hole-router.md`, `menu-iniciar.md` e `splash-screen.md` **todos** pedem
uma cena, um modo ou um estado sobre a cena. Nenhum deles é construível antes do passo 1 sem virar
`if` dentro do laço de quadro — que é exatamente o que `setMode` é hoje, com cinco.

E há um pré-requisito fora deste documento: **não existe dono do estado de TELA** (o `#boot`, o
`modo`, o `current` do router e o `session.js` — que não tem campo de cena — são quatro donos que não
se conhecem). O `SceneRuntime` do §4.3 e o `tela.js` do §7-B do handoff **são a mesma peça vista de
dois lados**, e construí-los separados cria o quinto dono.
