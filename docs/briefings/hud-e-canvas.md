# A HUD disputa o céu — o que é PAINEL, o que é MUNDO

> **Estado:** varredura conferida contra o código em 2026-08-09, nos moldes do
> [`cena-como-lente.md`](./cena-como-lente.md). Toda afirmação sobre o que existe hoje traz
> `arquivo:linha`; todo número traz o comando que o produz. O que é proposta está marcado como
> proposta.
>
> **Origem:** relato do usuário — *"os painéis HTML estão concorrendo clique com o canvas, ocupam
> espaço desordenado, não há uma boa disposição de conteúdo, e em algumas páginas está com bug para
> mostrar todos os painéis. Ao falar com o agente, a lista de referências toma muito espaço — alguns
> são redundantes, pois já são mostrados no painel de MEMÓRIA RECUPERADA"* — e a preferência de
> produto: *"fazer tudo em canvas, para manter a interface moderna, futurista, permitindo feeling de
> realidade aumentada/virtual"*.
>
> ⚠️ **Esta varredura não tocou uma linha de `src/`.** Defeito achado aqui vira TAREFA, não conserto.
>
> **A régua:** *quando o usuário descreve um sintoma, a descrição dele geralmente já é o
> diagnóstico*. As cinco afirmações dele foram medidas antes de qualquer hipótese própria.

---

## 0. As cinco afirmações, contra a medida

| ele disse | a medida diz |
|---|---|
| *"concorrem clique com o canvas"* | ⭑ **verdade, e o mecanismo não é roubo de evento — é ÁREA.** Existe **um único** `stopPropagation` em `src/` (`hud/systray.js:42`), e **todo** ouvinte de ponteiro da cena está preso ao `canvas` (`scene.js:1202,1210,1248,1280,1306`). Retângulo com `pointer-events: auto` por cima não intercepta: ele **impede o evento de existir para a cena**, sem fallback |
| *"ocupam espaço desordenado"* | ⚠️ **meio.** A régua existe e é dura: os trilhos somam **40,0% da largura** por construção (`index.html:104`). O que não tem régua é a fenda `stage`, e é lá que o texto cai sobre o disco |
| *"não há uma boa disposição de conteúdo"* | ⭑ **o vocabulário existe** (`OS-SCREENS.md` §0, `SLOTS` em `registry.js:51`) e **não tem portão**: `registerApp` confere que o widget EXISTE (`registry.js:72-77`) e nada mais. Ver §6 |
| *"em algumas páginas nem todos os painéis aparecem"* | ☠️ **três causas distintas, e só UMA é defeito.** Ver §3 |
| *"a lista de referências toma muito espaço — alguns são redundantes"* | ☠️ **verdade, e maior do que ele viu: na rota raiz a redundância é 24 de 24, e o corpus é afirmado TRÊS vezes.** Ver §4 |

---

## 1. O INVENTÁRIO, com número

### 1.1 Quantos são, e onde

**46 widgets registrados**, distribuídos pelas quatro fendas:

    for s in left right stage strip; do printf "%-6s %s\n" $s \
      "$(grep -rc "slot: '$s'" src/apps/*.js | awk -F: '{t+=$2} END{print t}')"; done

| fenda | quantos | semântica declarada (`OS-SCREENS.md` §0) |
|---|---|---|
| `left` | **19** | *o que é* — identidade, configuração, estado declarado |
| `right` | **16** | *o que está acontecendo* — medido, observado, agora |
| `stage` | **9** | *o objeto do app* — sem moldura |
| `strip` | **2** | *residentes* — o que nunca deve sair da tela |

Quem os monta: `src/kernel/registry.js` (o registro), `src/kernel/widgets.js` (o host que difere,
monta e preserva), `src/apps/*.js` (os contratos). Seis deles **adotam** nós que já nascem no HTML
(`apps/widgets-core.js:56-61` → `index.html:1537-1546`, o `.attic`); o resto é construído em JS.

### 1.2 O que cada rota monta

| rota | n | `left` | `right` | `stage` | `strip` | painel de palco (`surface: true`) |
|---|---|---|---|---|---|---|
| `#/` (`core`) | 9 | 3 | **4** | 1 | 1 | — |
| `#/files` | 8 | 3 | 2 | 2 | 1 | `fs-content` |
| `#/system` | 9 | **4** | 2 | 2 | 1 | `sys-config` |
| `#/web` | 7 | 3 | 2 | 1 | 1 | — |
| `#/bridge` | 8 | 3 | 2 | 2 | 1 | — |
| `#/journal` | 9 | 3 | 3 | 2 | 1 | `jr-runs` |
| `#/metrics` | 9 | 3 | 3 | 2 | 1 | `mx-stages` |
| `#/security` | 9 | 2 | 3 | 2 | **2** | `sec-catalog` |
| `#/activity` | 8 | 2 | 3 | 2 | 1 | `act-running` |
| `#/storage` | 7 | 2 | 2 | 2 | 1 | `st-coverage` |

Fonte: as listas `widgets:` dos nove `registerApp` + `SYSTEM_VIEW` (`apps/index.js:118-129`).
**7 dos 46 declaram `surface: true`** (`grep -rn "surface: true" src/apps/*.js`) e **todos os sete
estão no `stage`** — a fenda que fica exatamente onde o buraco negro é desenhado.

### 1.3 Quanto de tela, e a régua está no CSS

A régua é `index.html:80,104`:

    --gutter: clamp(24px, 3.4vw, 72px);
    grid-template-columns: minmax(230px, 20vw) 1fr minmax(230px, 20vw);

Logo, para janela entre 1 150 px e 2 118 px de largura:

> **trilhos = 40,0% da largura, exatos e independentes do gutter.** Abaixo de 1 150 px eles travam
> em 230 px cada e a fração CRESCE. Abaixo de 900 px `aside { display: none }` (`index.html:1308-1312`).

No ambiente de medida já usado por esta base (buffer 2582×1484 · DPR 2 → **1291×742 px CSS**,
`HANDOFF.md` §6), a conta fecha assim:

| superfície | régua no CSS | tamanho | fração da janela |
|---|---|---|---|
| trilhos `left`+`right` | `index.html:104` | 516×(≤654) px | ≤ **35,3%** (teto) |
| palco (coluna central) | 1fr | 599 px de largura | 46,4% da largura |
| painel de palco (`surface`) | `index.html:848-861` | 599×≤460 px | ≤ **28,8%** |
| `.answer` | `index.html:442-456` | ≤563×≤267 px | ≤ **15,7%** |
| overlay (`` ` `` · `P` · `V`) | `index.html:782-789` | 660×≤490 px | ≤ **33,7%** |
| `.inspector` | `index.html:678-683` | 420×≤416 px | ≤ **18,2%** |

⚠️ **A altura dos trilhos é TETO, não medida** — a linha `1fr` divide o que sobra do header, da
faixa e do rodapé, e isso só a tela responde. Ver §8, item 1.

### 1.4 O que é HTML e o que é canvas HOJE

☠️ **Os 46 são HTML. Zero widgets em canvas.** Só existem dois `<canvas>` no documento
(`grep -n "<canvas" index.html`): `#space` (WebGL, a cena) e `[data-waveform]` (2D, a onda da voz,
`hud/terminal.js:31-32`).

⭑ **E existe um TERCEIRO caminho, construído e DESMONTADO** — ver §5.3.

---

## 2. ☠️ A CONCORRÊNCIA DE CLIQUE, medida no código

### 2.1 Por que um retângulo HTML mata o raycaster inteiro

Os cinco ouvintes de ponteiro da cena estão presos ao elemento `canvas`:

| gesto | linha |
|---|---|
| `pointerdown` (início do arraste, `pressTravel = 0`) | `scene.js:1202` |
| `pointerup` | `scene.js:1210` |
| `pointermove` (órbita, pan livre, coordenada do pick) | `scene.js:1248` |
| `wheel` (zoom, com `preventDefault`) | `scene.js:1280-1289` |
| `click` (pick, com a guarda de 6 px `CLICK_SLOP_PX`) | `scene.js:1306-1320` |

O raycaster roda no laço (`scene.js:1995-2019`) sobre a **última coordenada que o canvas recebeu**.
Não há um único ouvinte de `click`/`pointerdown` em `window` que reencaminhe o gesto — o único
ouvinte global de ponteiro da cena é o de `pointermove` em captura (`scene.js:1230-1245`), e ele
existe para **APAGAR** o hover quando o cursor sai do céu, não para devolver o gesto.

> **Consequência exata:** qualquer elemento com `pointer-events: auto` sobre o canvas não *disputa*
> o clique — ele **cancela** órbita, zoom e pick naquele retângulo, e nada acusa.

### 2.2 A arquitetura está certa, e a refutação está escrita

`index.html:106-111` é o desenho correto e deliberado:

    #hud { pointer-events: none; }
    #hud a, #hud button, #hud input, #hud .clickable { pointer-events: auto; }

E `src/hud/yield.js:6-9` guarda uma **refutação medida** de um relato anterior quase idêntico:
*"varrendo a tela em 45 pontos, 37 chegam ao canvas — a HUD não bloqueia o mouse"*.

⚠️ **Essa medida continua verdadeira e não cobre o estado de hoje.** Ela foi feita sobre uma tela
sem painel de palco montado. Os retângulos que **de fato** reivindicam o ponteiro são:

| seletor | linha | quando existe | onde fica |
|---|---|---|---|
| `.scroll` | `index.html:343` | **todo corpo de widget de lista** | dentro dos trilhos (40,0% da largura) |
| `.widget[data-panel-surface]` | `index.html:825-827` | **7 das 10 rotas** | centro do palco, ≤28,8% |
| `.answer` | `index.html:455` | sempre que há resposta | centro-baixo, ≤15,7% |
| `.surface[data-surface="overlay"]` | `index.html:756` | `` ` `` · `P` · `V` abertos | centro, ≤33,7% |
| `.inspector` | `index.html:682` | citação de corpus clicada | direita, ≤18,2% |
| `.tray-menu` | `index.html:257` | popover aberto | topo direito, ≥132 px |

☠️ **O painel de palco é o que responde ao relato.** Ele fica no centro da coluna central, que é
onde o astro em foco e o buraco negro são desenhados, e sobe `z-index: 8` **por cima** do canvas.
Existe um escape — mas ele só dispara com o widget VAZIO:

    .widget[data-panel-surface]:has(> .widget-body > .scroll > .widget-empty:only-child) {
      pointer-events: none;                                              /* index.html:846 */
    }

O comentário acima dele (`index.html:832-845`) descreve o defeito **exatamente** como o usuário o
descreve agora, e nomeia a régua: *"a moldura mede ~448×436px e fica no centro do palco, que é
exatamente onde o astro em foco é desenhado… `document.elementFromPoint` no centro da tela
devolvia a `section.widget` em vez do canvas"*. **O conserto de então cobriu o caso vazio.** Com
conteúdo — que é o caso normal em `#/files`, `#/system`, `#/journal`, `#/metrics`, `#/security`,
`#/activity` e `#/storage` — a zona morta está de pé.

### 2.3 O que NÃO é a causa

- **`stopPropagation`:** um só em `src/`, e é de captura e deliberado (`hud/systray.js:42`; a razão
  está em `hud/systray.js:20-26` e em `hud/surface.js:22-24`).
- **`preventDefault`:** cinco (`core/keys.js:215`, `space/scene.js:1283`, `apps/sky-time.js:219`,
  `hud/terminal.js:170`, `sandbox/main.js:66`). O da cena é o do `wheel`, e é o que faz o zoom
  funcionar em vez de rolar a página. Nenhum deles come clique de canvas.
- **z-index:** o `#hud` é `position: fixed` e cria contexto de empilhamento, então `#bodies`
  (z-index 2, `index.html:982`) passa por cima da HUD **de propósito**. A elevação é `:has()`-ada
  (`index.html:797-798`).

⚠️ **E há uma contradição LATENTE nessa elevação:** `#hud:has(.widget[data-panel-surface])` eleva o
`#hud` a `z-index: 3` — e como o painel de palco está montado o tempo todo em 7 rotas, a elevação
também está. O comentário ao lado (`index.html:738-740`) declara que elevar sempre *"mataria a
ilusão de profundidade em que os astros passam à frente da interface — que é o efeito, não um
acidente"*. Hoje isso não custa pixel nenhum porque `#bodies` está **vazio** (§5.3). No dia em que
voltar a ter conteúdo, o efeito estará morto em 7 de 10 rotas e ninguém vai ligar as duas coisas.

---

## 3. OS PAINÉIS QUE NÃO APARECEM — três causas, e só uma é defeito

### 3.1 Estado do operador (não é defeito) — e ele é mais agressivo do que parece

`espatial.collapsed.v1` guarda dois conjuntos (`abertas` / `fechadas`, `kernel/widgets.js:19-39`) —
duas listas porque *"nunca mexi"* e *"abri e quero assim"* são fatos diferentes.

☠️ **E o acordeão faz mais do que lembrar: ABRIR UM RECOLHE TODOS OS IRMÃOS DO TRILHO, e persiste.**

    function collapseSiblings(id, slot) {                    // kernel/widgets.js:60-68
      for (const [other, entry] of live) {
        if (other === id || entry.contract.slot !== slot || !entry.colapsar) continue;
        collapsedState.add(other); expandedState.delete(other); entry.colapsar(true);
      }
    }

Um clique num rótulo do trilho esquerdo de `#/system` deixa **3 dos 4 widgets daquele trilho** como
cabeçalho puro — e a decisão **atravessa a rota**, porque a chave é o `id` do widget, não o par
(rota, widget). Recolher `context` em `#/files` recolhe `context` em todas as dez.

⭑ **Isso é decisão escrita**, anunciada em `README.md:207` e justificada em `kernel/widgets.js:127-136`
(*"com todas abertas elas disputam a altura, e o que perde não fica menor, fica com ZERO"* — o mesmo
fato está em `README.md:677`). **Antes de acusar a tela, leia a chave:**

    JSON.parse(localStorage.getItem('espatial.collapsed.v1') || '{}')

⚠️ **Um widget nasce recolhido de propósito:** `sky-time` (`apps/sky-time.js:116`).

☠️ **E aqui está o achado de ARQUITETURA:** essa chave é um **quinto dono do estado de tela**.
`core/tela.js` guarda camada · cena · rota; `core/session.js` guarda a pilha de painéis
(`hud/surface.js:42`); `espatial.collapsed.v1` guarda **quais painéis têm corpo visível** — e não
tem leitor fora de `kernel/widgets.js` nem sonda. `window.spatia` expõe **16 sondas** e **nenhuma**
responde sobre a HUD (`awk 'NR>=324 && NR<=464' src/main.js | grep -cE "^\s{4}[a-zA-Z]+:"` → 16).
É o KR2.1 com um dono que ninguém contou.

### 3.2 O manifesto (não é defeito, é decisão — e ela contradiz o relato)

Seis widgets que o operador reconhece como "os painéis" existem em quase nenhuma rota:

| widget | rótulo na tela | em quantas das 10 rotas |
|---|---|---|
| `memory` | **MEMÓRIA RECUPERADA** | **1** (só `#/`) |
| `tools` | FERRAMENTAS | **1** (só `#/`) |
| `plan` | PLANO | **1** (só `#/`) |
| `vitals` | SINAIS VITAIS | 2 (`#/`, `#/system`) |
| `web-results` | SATÉLITES DE BUSCA | 2 (`#/`, `#/web`) |
| `timeline` | TIMELINE | 9 |

☠️ **E o `answer` está nas 10.** A RESPOSTA — com a lista de referências dentro dela — é residente;
os três painéis que essas referências duplicam são residentes em **zero**. É a mesma leitura,
partida ao meio pela navegação.

### 3.3 O DEFEITO, e é uma invariante declarada e não implementada

**`#/security` não monta `timeline`** (`apps/security.js:79-82`). É a única das dez.

E a invariante está escrita em dois lugares:

- `OS-SCREENS.md` §0, *O conjunto residente*: *"`core.prompt` e `core.timeline` entram na lista de
  widgets de **todos** os apps"*;
- `apps/index.js:65-72`: *"`context` entra em TODAS as listas, como `sky-time` e `timeline`"*.

O portão que a imporia não existe: `registerApp` valida que o widget pedido EXISTE
(`registry.js:72-77`), que a tecla é 1–9 e única, que o gesto tem um dono só — e **nada** sobre
residentes. É a forma exata que o `CLAUDE.md` diz que esta base já pagou **cinco vezes**: *declarar
uma invariante não a implementa*.

⚠️ **Segundo defeito da mesma família:** `br-deliveries` é widget de `stage` **sem `surface: true`**
(`apps/index.js:1158-1161`) — o único assim. `index.html:839-842` nomeia esse caso: *"o escopo era
`[data-widget="fs-content"]` … então a página de configuração nasceu sem fundo e o disco de acreção
atravessou o texto"*. `registerWidget` aceita chave desconhecida em silêncio (`registry.js:119`
espalha `...contract` sem vocabulário), então `surafce: true` também não reprovaria.

---

## 4. AS REFERÊNCIAS — a redundância, medida

### 4.1 De onde saem os 24

    grep -n "MEMORY_LIMIT = \|MAX_RESULTS = " server/agent.py server/websearch.py
    grep -n -A4 "def online_providers" server/websearch.py

- `server/agent.py:19` — `MEMORY_LIMIT = 6` → as fontes `[1]`–`[6]`, sempre 6.
- `server/websearch.py:21` — `MAX_RESULTS = 6`, **por provedor** (`websearch.py:80`).
- `server/websearch.py:71-73` — `online_providers()` devolve os provedores COM CHAVE (`brave`,
  `serpapi`, `searxng`), com `duckduckgo` só como último recurso.

Os três estão configurados neste `.env`
(`awk -F= '/^(SERPAPI_API_KEY|BRAVE_API_KEY|SEARXNG_URL)=/{print $1" len="length($2)}' .env` → 64,
31, 21 caracteres). Logo:

> **6 + 3×6 = 24.** Os `[7]`–`[24]` da captura não são acaso de amostra: são **um provedor a mais =
> mais seis linhas**, por construção (`agent.py:142-154`).

### 4.2 A redundância não é parecença — é o MESMO CAMPO

| `[n]` | o que a lista imprime | o que o painel imprime | mesmo campo? |
|---|---|---|---|
| `[1]`–`[6]` | `source.label` = `hit["source"]` (`agent.py:146`; desenhado em `hud/answer.js:146`) | `shortPath(hit.source, 46)` em MEMÓRIA RECUPERADA (`hud/streams.js:240`) | ☠️ **sim** |
| `[7]`–`[24]` | `source.label` = `hit["title"]` (`agent.py:151`; `hud/answer.js:145`) | `result.title` em SATÉLITES DE BUSCA (`hud/streams.js:519`) | ☠️ **sim** |

E há um **terceiro canal para os seis do corpus**, que já é canvas: o evento `memory` acende a
estrela no céu e derruba partículas no núcleo (`space/scene.js:993-1002`), com `blackHole.surge`.

| rota | dos 24, quantos já estão num painel montado | canais para os 6 do corpus |
|---|---|---|
| `#/` | **24 (100%)** | **3** — lista + painel + céu |
| `#/web` | 18 (75%) | 2 — lista + céu |
| as outras oito | **0** | 2 — lista + céu |

⭑ **A leitura que isso impõe:** a queixa não é "a lista é longa". É que **na única rota onde os
painéis existem, a lista não acrescenta nada** — e nas outras oito ela é a única testemunha. O
mesmo componente é redundante e insubstituível conforme a rota, e nada na tela diz qual dos dois
está valendo.

### 4.3 A diferença REAL entre fonte de corpus e resultado de web

Não é a origem. É o que o clique faz, e são coisas de naturezas opostas:

| | corpus (`kind: 'memory'`) | web (`kind: 'web'`) |
|---|---|---|
| elemento | `<span class="source-label">` (`answer.js:146`) | `<a target="_blank" rel="noreferrer">` (`answer.js:145,148-150`) |
| clique | abre o INSPETOR com os chunks reais (`answer.js:102,152` → `api.node`) | **sai do SpatIA** |
| tem lugar no céu? | ⭑ **sim** — a estrela dele já acende (`scene.js:993`) | não |
| `§ seção` | sim (`agent.py:146`) | não |

☠️ **E a numeração é CONTRATO, não decoração.** `EVENTS.md:145-146` e `agent.py:142-144`: *"a
numeração que vai no prompt é a mesma que a HUD mostra"*, e `hud/answer.js:89-95` desenha `[n]`
**apagado e riscado** quando não bate com fonte nenhuma. **Sumir com a lista quebra a citação**, que
é o oposto do que o usuário quer.

### 4.4 Por que ela cai sobre o disco — a régua está faltando, não sobrando

    grep -n "^  .sources\|^  .answer {" index.html

| | `.answer` (`index.html:442-456`) | `.sources` (`index.html:494`) |
|---|---|---|
| teto de altura | `max-height: 36vh` | ☠️ **nenhum** |
| rolagem | `overflow-y: auto` | ☠️ **nenhuma** |
| fundo | gradiente scrim + `backdrop-filter` | ☠️ **nenhum** |
| `pointer-events` | `auto` | herda `none` do `#hud` |

Com `font-size: 9px` e `gap: 2px`, 24 linhas empilham **≈305 px** — **≈41% da altura** num viewport
de 742 px. ⚠️ **Esse número supõe `line-height: normal` ≈ 1,2** (nenhum `line-height` é declarado
para `.source`); a régua exata só a tela dá, e por isso ele é estimativa e não medida — ver §8.

E o que transborda **não rola: some.** `.widget-body { overflow: hidden }` (`index.html:714`), e o
comentário de `index.html:332-336` já diagnosticou essa forma de falha uma vez: *"conteúdo cortado
sem barra não lê como 'tem mais abaixo': lê como bug"*.

---

## 5. ☠️ A PERGUNTA CENTRAL: o que faz sentido ser HTML, e o que faz sentido ser CANVAS

A preferência do usuário é decisão de produto e está aceita. O que segue **não discute o destino**;
mede o pedágio dos dois lados, para que a decisão saiba o que compra.

### 5.1 O que o CANVAS custa — três contas, e as três já têm número nesta base

**(a) O ORÇAMENTO DO QUADRO, e ele já está gasto.**

| cena | geometria | pós | quadro | fração do pós |
|---|---|---|---|---|
| UNIVERSO | **0,23 ms** | 2,3–2,6 ms | ~2,5 ms | **~90%** |
| AGENTE | 1,95 ms | 1,42 ms | 3,37 ms | 42% |

(`HANDOFF.md` §6; a lente sozinha custa **3,8–5,1 ms** contra **0,31–0,35 ms** do céu inteiro com 213
instâncias.)

**Texto em canvas é PASSE ou TEXTURA, e os dois bolsos são diferentes:**

- **passe novo** entra no bolso de 2,4 ms — e ☠️ **muda a PARIDADE DE SWAPS da cadeia**
  (`RenderPass → lensing → UnrealBloom → OutputPass`, `scene.js:540-567`): acrescentar um passe
  inverte para qual buffer a profundidade é gravada e **a lente passa a ler um buffer vazio, em
  silêncio** (`cena-como-lente.md` §3.1). Uma HUD por passe **remede o quadro inteiro e precisa de
  guarda automática**, não de memória.
- **textura** (atlas 2D enviado à GPU) entra no bolso barato de 0,23 ms — e paga **upload por
  mudança**. ⚠️ A HUD reescreve a cada token: `hud/answer.js:162-165` redesenha a resposta INTEIRA
  por token, e `hud/dom.js:7-8,18-21` existe porque escrever `textContent` idêntico *"força layout à
  toa, dezenas de vezes por segundo"*. **O que hoje é um layout descartado vira um upload de
  textura.** Ninguém mediu esse upload — é o buraco mais caro deste briefing (§8).

**(b) A TIPOGRAFIA — e a HUD é hairline, que é o pior caso possível.**

    grep -o "font-size: [0-9.]*px" index.html | sort -u | wc -l      # 17
    grep -o "letter-spacing: [0-9.]*em" index.html | sort -u | wc -l # 17
    grep -c "font-size:\|letter-spacing:" index.html                 # 107 e 62

**17 corpos de fonte distintos** (de 6,5 px a 34 px) e **17 espaçamentos distintos** (0,02 a 0,34 em).
Um atlas de glifo é por (família, corpo, peso, **DPR**) — 17 corpos × 2 DPRs já são 34 atlas antes
de contar o peso. E:

- **`letter-spacing` não é propriedade de fonte** — é colocação por glifo. No atlas, cada avanço
  passa a ser conta à mão, e é justamente o eixo em que a HUD tem 17 valores.
- ☠️ **A armadilha de unidade desta base morde aqui na hora:** *"`canvas.height` (framebuffer),
  nunca `clientHeight` (CSS). Em DPR 2 a bancada dividiu por dois todo número que o shader via"*
  (`HANDOFF.md` §5 item 10). Um atlas medido em CSS sai borrado em retina e nada acusa.
- ☠️ **E o bloom come hairline.** Já está medido em outro objeto: a luz do aro de estrela move
  +25,9% da luz total e mesmo assim *"é espalhada pelo bloom em vez de desenhada como borda. Vira
  brilho, não vira forma"* (`HANDOFF.md` §7 item 2, com a geometria a P50 1,55 px). Um rótulo de
  8 px com traço de 1 px dentro do mesmo pós é o mesmo caso, com menos luz.

**(c) ACESSIBILIDADE, SELEÇÃO E COPIAR — o que o DOM dá de graça.**

    grep -rho "\bel(" src/ | wc -l                     # 521 nós construídos em JS
    grep -c "<button\|<input\|<a " index.html          # 19 focáveis estáticos
    grep -rho "\bbutton(\s*{" src/ | wc -l             # 37 chamadas do primitivo

**521 chamadas de `el()`** desenham a HUD. Canvas não tem DOM: não há seleção de texto, não há
`Ctrl+F`, não há leitor de tela, não há `href`. E a base já **decidiu por escrito** que isso
importa:

- `kernel/widgets.js:96-99`: o rótulo de recolher é *"`<button>` de verdade, não `div` com handler —
  teclado e leitor de tela vêm de graça"*;
- `hud/streams.js:216-218`: o id de 36 caracteres vai para o `title` porque é *"o único lugar onde
  um id de 36 caracteres pode existir sem quebrar a régua da HUD"* — **e dá para copiar**;
- `hud/answer.js:145-150`: a fonte de web é um `<a target="_blank" rel="noreferrer">`. Em canvas,
  abrir um link é reimplementar navegação.

Existem **26 atributos `aria-*`** no `index.html` e **11** em `src/` — `aria-expanded`,
`aria-pressed`, `aria-haspopup`, `aria-valuenow`. Nenhum deles tem equivalente em canvas sem uma
árvore de acessibilidade sombra escrita à mão.

### 5.2 O que o CANVAS ganha, e é real

Três coisas, e nenhuma é estética:

1. **Oclusão como FATO.** `space/bodies.js:216-221` diz o que o DOM não consegue: o rótulo é
   *"a única coisa da cena capaz de atravessar um horizonte de eventos"*. Um corpo que passa atrás
   do buraco negro com o nome boiando é uma mentira, e ela é estrutural no DOM.
2. **Profundidade.** O texto vivendo no mesmo espaço dos corpos é o que a preferência descreve, e é
   coerente com o Princípio 7 (*tudo possui comportamento*) e com a REGRA DA FÍSICA — **desde que o
   que sobe ao mundo TENHA um lugar no mundo.**
3. **O ponteiro deixa de disputar.** Um rótulo desenhado no canvas não tem `pointer-events`; ele
   entra no mesmo raycaster do resto (§2.1), que é um dono só em vez de dois.

⚠️ **E o inverso é uma mentira nova:** um widget de QUOTAS ocluído por um planeta afirmaria que a
quota está atrás de alguma coisa. Ela não está em lugar nenhum. **Feição sem fato não entra** —
`identidade.md`, a REGRA DA FÍSICA.

### 5.3 ⭑ O MEIO-TERMO JÁ EXISTE, ESTÁ COMPLETO, E ESTÁ DESLIGADO

**`src/space/bodies.js` é HTML posicionado pela projeção da câmera, pronto:**

| peça | linha |
|---|---|
| o rótulo é um `<button class="body-label">` real | `bodies.js:162-173` |
| posição por `.project(camera)` → `transform: translate(…vw, …vh)` | `bodies.js:251,263-264` |
| descarte de quem está atrás da câmera (`projected.z > 1`) | `bodies.js:252` |
| ☠️ **oclusão pelo horizonte de eventos** (mais longe que o núcleo **E** dentro do disco aparente) | `bodies.js:216-260` |
| esmaecimento por distância | `bodies.js:265-267` |
| a camada, acima da HUD e transparente ao ponteiro | `index.html:982-984` |

☠️ **E não há um único chamador de `installApps`.** `grep -rn "installApps" src/` devolve três
linhas: a definição (`scene.js:2607`) e **dois comentários** (`main.js:210`, `main.js:1048`). O
motivo está escrito em `main.js:208-225` e é decisão do usuário de 2026-08-07: *"um corpo de UI no
meio do céu compete por atenção com os astros que são o conteúdo"* — e o mesmo bloco declara que o
módulo FICA porque *"voltar a montar é uma linha"*.

> ⭑ **Isto reordena a discussão inteira.** O meio-termo não é proposta: é mecanismo na prateleira,
> com o motivo do desligamento escrito ao lado. E o motivo **não se aplica** ao que este briefing
> está tratando: uma fonte de corpus **não é mobília de UI, é o conteúdo** — e a estrela dela já
> acende no céu (`scene.js:993`). Ressuscitar `bodies.js` para o que TEM lugar é a versão barata da
> preferência do usuário; reescrever os 46 widgets em canvas é a versão cara da mesma frase.

### 5.4 A linha divisória — proposta, no vocabulário que a base já usa

> **O que tem LUGAR no mundo sobe: canvas, ou HTML projetado.**
> **O que é LEITURA SOBRE O SISTEMA fica no DOM.**

| superfície | tem lugar? | destino proposto |
|---|---|---|
| fonte de corpus `[1]`–`[6]` | ⭑ sim — a estrela já acende | **projetada** (rótulo no corpo), com o `[n]` sobrevivendo no DOM |
| resultado de web `[7]`–`[24]` | ~ meio — o satélite existe (`scene.js:1027-1037`), o resultado não | DOM, agrupado por provedor |
| CONTEXTO (o astro sob atenção) | sim, é sobre UM corpo | candidato a projetado |
| TIMELINE · QUOTAS · MÉTRICAS · PERMISSÕES · CONFIGURAÇÃO | **não** | **DOM, sem discussão** |
| a RESPOSTA do agente | não — é prosa longa, selecionável, copiável | **DOM** |

---

## 6. A DISPOSIÇÃO: falta de regra ou regra não cumprida?

⭑ **Regra não cumprida — e a diferença decide o conserto.** A regra existe e é boa:

- `OS-SCREENS.md` §0 dá semântica às quatro fendas e diz *"Layout é do produto; o operador não
  arrasta nada"*;
- `registry.js:51` declara `SLOTS = ['left','right','stage','strip']`;
- `kernel/widgets.js:172-203` monta na **ordem declarada pelo app**, preserva o que continua
  declarado e só destrói o que saiu.

O que falta é **portão**, e a assimetria é gritante dentro da própria base:

| vocabulário | quem recusa chave desconhecida |
|---|---|
| camada de tela | ⭑ `core/tela.js:40` — `const CHAVES = new Set(['id'])` |
| cena | ⭑ `scripts/lei-cena.mjs` — chave fora de `id`/`passes`/`camadas`/`chegada`/`aoEntrar` reprova |
| **widget** | ☠️ **ninguém** — `registry.js:119` espalha `...contract` sem conferir nada |
| **lista de widgets de um app** | ☠️ **ninguém confere os residentes** — `registry.js:72-77` só confere existência |

Três consequências medidas, todas em §3:

1. `#/security` sem `timeline`, contra duas declarações escritas;
2. `br-deliveries` no palco sem `surface: true`, repetindo um defeito já nomeado no CSS;
3. `sec-effective` mora em `strip` — a fenda cuja semântica declarada é **residentes**, *"o que
   nunca deve sair da tela"* — e existe em **1 de 10 rotas**. A fenda ganhou um segundo significado
   sem que nada recusasse.

⚠️ **E há um termo faltando na regra, não só o portão:** a semântica das fendas não diz **quantos**
cabem. O acordeão de `kernel/widgets.js:63-71` é o remendo de runtime disso, e o comentário dele é a
prova: *"com todas abertas elas disputam a altura, e o que perde não fica menor, fica com ZERO. Um
gráfico de 14px sumia inteiro enquanto a legenda dele continuava na tela, sem erro nenhum no
console"* (o mesmo fato em `README.md:677`). **Uma regra que precisa de remendo de runtime para ser
habitável é uma regra com um termo faltando** — e o termo é orçamento de altura por fenda.

---

## 7. O que NÃO entra, e por quê

| proposta | veredito |
|---|---|
| reescrever os 46 widgets em canvas | ❌ **521 `el()`, 17 corpos de fonte, 17 espaçamentos, 26 `aria-*`** — e o bloom come hairline. Paga acessibilidade, seleção e `Ctrl+F` por profundidade que uma tabela de quotas não tem |
| HUD como PASSE de pós-processamento | ❌ entra no bolso de 2,4 ms (90% do quadro) **e inverte a paridade de swaps** — a lente lê buffer vazio em silêncio (`cena-como-lente.md` §3.1) |
| a lista de fontes em canvas | ❌ o `[n]` é contrato com o prompt (`EVENTS.md:145`) e a fonte de corpus abre o inspetor; virar textura é reimplementar alvo de clique dentro de uma imagem |
| dar fundo opaco a `.sources` | ⚠️ colide com a lição de `hud/yield.js:11-15`: *"a HUD hairline vive de pouco contraste e perderia legibilidade em toda a tela"*. **A saída já existe e é o scrim em gradiente do `.answer`** (`index.html:453`) |
| cortar `MEMORY_LIMIT` para a lista encolher | ❌ **muda o PROMPT, não a tela** — os 6 hits alimentam o modelo (`agent.py:158-163`). Cortar a lista da tela é grátis; cortar a recuperação muda a resposta |
| HUD arrastável / layout escolhido pelo operador | ❌ *"Layout é do produto"* — `OS-SCREENS.md` §0 |
| esconder painéis atrás de hover para ganhar pixel | ❌ refutado por escrito em `index.html:41-44`: *"dado que exige gesto para aparecer deixa de ser monitorado"*, e o ganho medido é ~4% de pixel |
| centro de notificações | ❌ já recusado por escrito — `OS-SCREENS.md` §1.1 |

---

## 8. A ORDEM, com as guardas

O critério é o desta base: **medir antes de consertar, e todo passo com um número que tem de se
repetir.**

1. **A SONDA, antes de tudo.** `spatia.hud()`: quanto da janela a HUD reivindica ao ponteiro, por
   rota, e quais widgets estão recolhidos. **Guarda:** ela reproduz a varredura de 45 pontos de
   `hud/yield.js:6-9` como comportamento permanente, e mede as três coisas que este briefing só
   estimou — a altura real dos trilhos, o `line-height` de `.source` e os pontos que chegam ao
   canvas em cada rota. **Barata agora, insubstituível depois.** → **T-46**
2. **`.sources` ganha teto, rolagem e scrim.** Independente de tudo, e é o que o usuário fotografou.
   **Guarda:** com 24 fontes, a pilha do palco não passa da altura do palco e nada é cortado sem
   barra. → **T-47**
3. **Os residentes viram DECLARAÇÃO com portão.** `registerApp` recusa lista sem o conjunto
   residente; `registerWidget` recusa chave fora do vocabulário — a disciplina de `core/tela.js:40`
   aplicada onde ela falta. **Guarda:** `#/security` deixa de compilar até ganhar `timeline`.
   → **T-48**, **T-49**
4. **`br-deliveries` opta por `surface: true`.** Uma linha, e o portão do passo 3 impede o próximo.
   → **T-50**
5. **A zona morta do painel de palco** — só **depois** do passo 1, senão o conserto é escolher um
   valor que faz a foto fechar. → **T-51**
6. **A redundância das referências**, com a assimetria por rota resolvida antes: a linha some quando
   o painel que a repete está MONTADO, e fica quando não está. Depende do passo 3. → **T-52**
7. **A decisão do usuário: o que sobe para o mundo.** `bodies.js` religado para o que TEM lugar
   (§5.3/§5.4). É produto, não engenharia. → **T-53**

⚠️ **O que este briefing NÃO mediu**, e cada um é uma pergunta que só a tela ou uma bancada responde:

- **a altura real dos trilhos** — a linha `1fr` divide o que sobra do header, da faixa e do rodapé; o
  35,3% da §1.3 é TETO, não medida;
- **o `line-height` de `.source`** — nenhum é declarado, e o ≈305 px dos 24 itens supõe ≈1,2;
- **o custo de upload de um atlas de glifo por token** — ninguém construiu um, e é o número que
  decide se a §5.1(a) tem saída barata;
- **quantos pontos da varredura de 45 chegam ao canvas HOJE, por rota** — o 37/45 de `yield.js` é de
  uma tela sem painel de palco montado.

---

## 9. A dependência que decide a metade disto

Os passos 2, 3, 4 e 5 são independentes e baratos. Os passos 6 e 7 **não são construíveis antes do
1**, e por um motivo que esta base já pagou: sem sonda, *"o painel está na frente"* e *"o painel tem
o mesmo âmbar do anel"* dão a mesma foto — foi exatamente o que `hud/yield.js` descobriu ao medir um
relato de forma idêntica a este.

⚠️ **E há um pré-requisito fora deste documento:** `espatial.collapsed.v1` é um dono de estado de
tela que `core/tela.js` não conhece (§3.1). Enquanto ele não tiver leitor nem sonda, **"o painel não
apareceu" tem três causas indistinguíveis a olho** — recolhido, não declarado no manifesto, ou
defeito. É a armadilha que `HANDOFF.md` §4 registra por escrito, e ela é a razão da ordem do §8.
