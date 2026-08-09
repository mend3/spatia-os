# Roadmap — SpatIA

> **Este arquivo e o [`HANDOFF.md`](./HANDOFF.md) são a MESMA verdade vista de dois lados**, e mudam
> juntos.
> O handoff responde *"o que está aberto AGORA e como não cair nas armadilhas"*; este responde
> *"para onde vamos, em que ordem, e o que cada peça destrava"*. Fechar uma tarefa aqui **obriga** a
> tirar o item do handoff (movendo o resíduo para §5/§6), e abrir um item lá obriga a criar a
> tarefa aqui. Divergiram, os dois estão errados — e o sintoma é sempre o mesmo: alguém lê um e
> decide contra o que o outro já mediu.
>
## O vocabulário

| status | significa |
|---|---|
| `todo` | decidido, não começado |
| `doing` | em andamento no working tree |
| `done` | entregue **e provado** — número, oráculo ou foto. "Compila" não é `done` |
| `blocked` | depende de outra tarefa ou de decisão do usuário; `blocked_by` diz de quê |
| `postponed` | possível hoje, e escolhemos não fazer. O motivo fica escrito |
| `archived` | não vamos fazer. Refutado por medida, ou o problema deixou de existir |

⚠️ **`blocked` por decisão do usuário não é `blocked` por engenharia.** As decisões listadas abaixo
são do usuário por natureza — nenhum agente deve "destravá-las" resolvendo sozinho.

---

## Os objetivos

### O1 — O universo está VIVO sem o operador perguntar

> Princípio 6 e a Regra dos Cinco Minutos. ☠️ **A fila tem produtor e continua em silêncio, e isso
> é o desenho certo:** o vigia de `ambient.py` dispara por TRANSIÇÃO, e num sistema parado não há
> transição. Medido: **0 eventos em 301 s** (handoff §6). **"Vivo" não pode significar "tem
> novidade"** — quem depende de novidade para parecer vivo acaba inventando repetição. Significa
> que o que a tela afirma é do presente, ou diz de quando é.

| KR | medida | hoje |
|---|---|---|
| KR1.1 | existe produtor ambiental emitindo **sem pergunta do operador** | ⭑ `server/ambient.py` — vigia de 5 observadores por TRANSIÇÃO, a cada `SCAN_SECONDS` |
| KR1.2 | `notice` carrega `severity` e a tela distingue ruído de aviso | ⭑ cabeça da timeline (`hud/streams.js`): `warn`/`alert` de pé com `action`, `info` apaga |
| KR1.3 | cinco minutos parado produzem evento legítimo (não sintético) | ☠️ **0 eventos em 301 s**, medido na assinatura real — e está CERTO: 3 dos 5 observadores não têm como disparar hoje, 2 são eco de comando humano (handoff §6) |
| KR1.4 | cinco minutos parado, o que a tela afirma no presente **foi medido no presente** | ⭑ `watchHealth` + a idade da aferição; leitura vencida para de afirmar sem apagar o medido |

☠️ **KR1.3 mede a coisa errada, e a medida é que mostrou.** Contar EVENTOS faz "vivo" depender de o
sistema ter novidade — e o produtor certo, que dispara por transição, fica em silêncio justamente
quando nada mudou. Encher a fila para o KR fechar é inventar heartbeat, que é o que ensina o
operador a não ler a tela (`ambient.py` recusa por escrito). O que a Regra dos Cinco Minutos cobra é
**KR1.4**: ao fim dos cinco minutos, o que está na tela tem de ser do presente, ou dizer que não é.

### O2 — Todo estado tem UM dono

> As três ausências de dono que quatro leituras independentes acharam. Nenhuma é shader, e cada uma
> multiplica o custo de toda cena nova.

| KR | medida | hoje |
|---|---|---|
| KR2.1 | **estado de tela** tem dono único | ⭑ `core/tela.js` — camada · cena · rota num objeto só, `spatia.tela()`. ⚠️ `session.route` sobrevive **sem leitor** (handoff 0e) |
| KR2.2 | **pose da câmera** tem nome próprio | ⭑ `escalaLocal()` · `porteLocal()` · `orbit.distance`, provado na tela |
| KR2.3 | **cena** é definição declarativa registrada, não `if` em `setMode` | ⭑ `CENAS` em `scene.js` |
| KR2.4 | oráculo prova que trocar de cena **não muda classe, física nem pele** de nenhum corpo | ⭑ `lei-cena.mjs` sai 0 (fixture, 09/08: 72 corpos · 11 call sites · 1.080 perturbações) |

### O3 — Nenhuma afirmação sem substrato

> As leis desta base, viradas para fora: o que a tela afirma tem de ter alguém capaz de emitir.

| KR | medida | hoje |
|---|---|---|
| KR3.1 | overlay recusa snapshot de outro corpus, com motivo | ⭑ **feito** (09/08) |
| KR3.2 | grandeza que descreve corpo de uma classe é razão ancorada em limiar FIXO | ⭑ **feito no pulsar**; varrer o resto |
| KR3.3 | nenhuma pele roteada nasce vazia | ⭑ `censo-superficies.mjs` sai 0 |
| KR3.4 | nenhuma dimensão do grafo altera classe | ⭑ `lei-neo4j.mjs` sai 0 |

### O4 — O que já está gravado chega à tela

> O traço de explicabilidade — que o usuário chamou de *"talvez a feature mais importante"* — **já
> está gravado inteiro**: sete degraus, sete eventos, ledger encadeado por hash, tela pronta.
>
> ⭑ **E o endereço também está**, provado em carga fria sobre `#/journal/r-2026-08-07-050`: aba do
> dia ativa, linha da execução marcada, detalhe com os sete campos.

| KR | medida | hoje |
|---|---|---|
| KR4.1 | `#/journal/<run-id>` é endereçável e compartilhável | ⭑ **provado na tela** |
| KR4.2 | a segunda pergunta do operador sabe da primeira, **ou a tela diz que não** | ⭑ **feito** — `--resume` (fio em `server/fio.py`) e o `thread` na cabeça da timeline, com `broken` escrevendo linha |

---

## As fontes estão em disco — `opensrc`

    opensrc list                  # os 14 repositórios espelhados
    opensrc path owner/repo       # o caminho absoluto (busca se faltar)

☠️ **Fonte em disco vence memória, e isto é regra do projeto.** Um shader lembrado é um shader
inventado. `three.js` está espelhado em **r171** — a versão exata de `vendor/` —, então perguntar à
memória sobre "a API do three" é perguntar sobre outra versão. O que cada repositório deu a este
projeto está no [`README`](../README.md#referencias-e-links).

⚠️ **Espelhar é caro.** `nasa/NASA-3D-Resources` sozinho puxa **2,6 GB** contra 1,7 GB dos catorze
juntos, e por isso **não está espelhado**: acervo de malha não se lê como código — quer-se um modelo
por vez, e isso se baixa do item. Os links por modelo estão em
[`../assets/CREDITS.md`](../assets/CREDITS.md).

---

## As tarefas

⚠️ **A ordem não é valor puro: é destravar o maior número de briefings por peça**, e não construir
tela que assista ao vazio. ☠️ **E o produtor não bastou:** com ele de pé a fila entrega **0 eventos
em 301 s**, porque ele dispara por transição. Superfície nova pede a medida do que ela vai mostrar
ANTES de existir — *"por que não acontece nada?"* é o Princípio Final ao contrário, e nasce igual
com ou sem produtor.

| id | tarefa | status | blocked_by | blocks | OKR |
|---|---|---|---|---|---|
| **T-01** | Portão de corpus nos cinco overlays + carimbo nos scripts | `done` | — | T-12 | KR3.1 |
| **T-02** | Eixo do pulsar ancorado no limiar (`GIGANTE`) | `done` | — | — | KR3.2 |
| **T-03** | Foto do pulsar na bancada | `done` | — | — | KR3.2 |
| **T-04** | `SceneDefinition` extraída de `setMode`, **sem mudar um número** | `done` | — | T-05, T-06, T-08 | KR2.3 |
| **T-05** | `lei-cena.mjs` — o oráculo que prova que a cena é LENTE | `done` | — | — | KR2.4 |
| **T-06** | `src/core/tela.js` — dono único do estado de tela | `done` | — | T-13, T-14 | KR2.1 |
| **T-07** | Sub-rota endereçável (`#/journal/<run-id>`) | `done` | — | — | KR4.1 |
| **T-08** | Pose da câmera com nome próprio (`escalaLocal`) | `done` | — | T-15 | KR2.2 |
| **T-09** | `notice` com `severity` + produtor ambiental — **juntos, nunca separados** | `done` | — | T-16 | KR1.1, KR1.2 |
| **T-10** | `--resume` no `brain.py` | `done` | — | T-37 | KR4.2 |
| **T-11** | Traçar a elipse dos planetas (cópia de `moon-orbits.js`) | `todo` | — | — | — |
| **T-12** | Força do vínculo no arco | `blocked` | substrato | — | — |
| **T-30** | `forca` sai da UNIDADE do tipo, não dos extremos da amostra | `done` | — | T-12 | KR3.1 |
| **T-13** | **Reescrever a TELA DE ENTRADA** — o `#boot` vira a abertura, com o diagnóstico dentro | `todo` | — | — | KR2.1 |
| **T-14** | Launcher / menu iniciar | `todo` | — | — | KR2.1 |
| **T-15** | Voo básico (o começo do `ship-navigator`) | `blocked` | T-08 | — | — |
| **T-16** | Modo Assistir — **não é um modo**: é a AFERIÇÃO do que a tela já afirma | `done` | — | — | KR1.3 |
| **T-17** | `keyup` + `blur` no teclado — `keys.isHeld` e a lei da tecla que não fica presa | `done` | — | T-15 | — |
| **T-18** | Um diretório sem agregado é um sistema? (handoff 0b) | `done` | — | — | — |
| **T-36** | `conectividade.mjs` agrupa como a cena agrupa — e o ρ com o tamanho do sistema NÃO era o filho único | `done` | — | — | KR3.1 |
| **T-19** | Quebrar a dependência de `M_total` nas luas (handoff 0c) | `postponed` | — | — | — |
| **T-20** | De onde vem a luz de um corpo em foco | `blocked` | decisão do usuário | — | — |
| **T-21** | Marketplace × a postura de segurança escrita | `blocked` | decisão do usuário | — | — |
| **T-22** | Gravidade cognitiva (uso movendo órbita) | `blocked` | decisão do usuário | — | — |
| **T-23** | Agente como corpo (a ESTAÇÃO) | `blocked` | decisão do usuário | — | — |
| **T-24** | Passo 3 — distância × pixel contra o corpus real | `todo` | — | — | — |
| **T-25** | Licença de `assets/textures/sun.jpg` | `done` | — | — | — |
| **T-26** | Granulação do anel — escolher entre `GRAIN`/`SWARM`/`BOULDER`/`SLAB` | `todo` | — | — | — |
| **T-27** | i18n | `postponed` | — | — | — |
| **T-28** | Zonas por razão de massa — declaradas, sem leitor | `archived` | — | — | KR3.3 |
| **T-29** | `core` do pulsar é PARÂMETRO SEM LEITOR — medido em T-03 | `done` | — | — | KR3.3 |
| **T-32** | Música de fundo (`assets/interstellar.mp3`) — canal novo, e a LICENÇA é parte da tarefa | `todo` | — | publicação | — |
| **T-33** | O assinante de `notice` no cliente — a outra metade do T-09 | `done` | — | T-16 | KR1.2 |
| **T-34** | Malha `glb` para asteroide e estação — **CubeSat GENÉRICO** é o candidato de estação | `todo` | — | — | — |
| **T-35** | **FAVORITOS** — fase 1 (modelo + persistência) `done`; a INTERFACE é a fase 2 | `doing` | — | T-34 | KR2.1 |
| **T-37** | O assinante de `thread` no cliente + o botão que corta o fio — a outra metade do T-10 | `done` | — | — | KR4.2 |
| **T-38** | O favorito oferece aparência que a cena não sabe aplicar | `done` | — | — | KR2.4 |
| **T-39** | As duas cenas discordam sobre **32 de 72 corpos** — a lei agora MEDE e recusa crescimento | `doing` | — | — | KR2.4 |
| **T-40** | A marca não tem CONSUMIDOR — nada no céu nem em lista sabe o que foi marcado | `todo` | — | — | KR2.1 |
| **T-41** | A aferição data CINCO pontos e só TRÊS são aferidos | `todo` | — | — | KR3.1 |
| **T-42** | `sys-about` é um segundo dono de `/api/health`, com o dobro da cadência | `todo` | — | — | KR2.1 |
| **T-43** | A repintura da marca (`context.js`) é invariante DECLARADA sem oráculo | `todo` | — | — | KR2.4 |
| **T-44** | A seção FAVORITO empurra VÍNCULOS para baixo da dobra — a ordem já corrigida OLHANDO | `todo` | — | — | — |
| **T-45** | `.row.warn` não existe no CSS — quatro emissores de um tom sem leitor | `todo` | — | — | — |
| **T-46** | **A sonda da HUD** (`spatia.hud()`) — quanto da janela a interface reivindica ao PONTEIRO, por rota, e o que está recolhido | `todo` | — | T-51, T-52 | KR2.1 |
| **T-47** | `.sources` não tem teto, nem rolagem, nem scrim — 24 fontes empilham ≈305 px sobre o disco | `todo` | — | — | — |
| **T-48** | O conjunto residente é DECLARADO e não imposto — `#/security` não monta `timeline` | `todo` | — | T-52 | KR2.1 |
| **T-49** | `registerWidget` aceita chave fora do vocabulário — a REGRA DO CATÁLOGO sem portão | `todo` | — | T-50 | — |
| **T-50** | `br-deliveries` é widget de palco **sem `surface: true`** — o disco atravessa o texto | `todo` | T-49 | — | — |
| **T-51** | O painel de palco cria ZONA MORTA sobre o corpo em foco — o escape só cobre o widget VAZIO | `todo` | T-46 | — | — |
| **T-52** | A referência repete o painel: **24 de 24** na raiz, **0** nas outras oito | `todo` | T-48 | — | — |
| **T-53** | O que sobe para o MUNDO — `space/bodies.js` está pronto e desmontado | `blocked` | decisão do usuário | — | — |

### `postponed` e `archived` ficam escritos — apagá-los faz a próxima sessão reabrir

- **T-46 … T-53** — a varredura da interface está em
  [`briefings/hud-e-canvas.md`](./briefings/hud-e-canvas.md), com a conta de cada número.
  ☠️ **T-46 vem primeiro e não é cerimônia:** `window.spatia` expõe **16 sondas** e **nenhuma**
  responde sobre a HUD (`awk 'NR>=324 && NR<=464' src/main.js | grep -cE "^\s{4}[a-zA-Z]+:"`), e é
  por isso que *"o painel está na frente do astro"* e *"o painel tem o mesmo âmbar do anel"* dão a
  MESMA foto — `hud/yield.js:6-15` já se enganou uma vez por isso e mediu 37 de 45 pontos chegando
  ao canvas. ⚠️ **Aquela medida vale, e não cobre 7 das 10 rotas:** ela é de uma tela sem painel de
  palco montado. Consertar T-51 antes de T-46 é escolher um valor que faz a foto fechar
  (armadilha 17 do handoff).
  ⚠️ **T-46 também mede o QUINTO dono do estado de tela:** `espatial.collapsed.v1` decide quais
  painéis têm corpo visível, `core/tela.js` não o conhece, e ele **atravessa a rota** — abrir uma
  seção recolhe e PERSISTE todos os irmãos do trilho (`kernel/widgets.js:63-71`). Antes de acusar a
  tela, `JSON.parse(localStorage.getItem('espatial.collapsed.v1') || '{}')`.

- **T-48** — é invariante DECLARADA em dois lugares (`OS-SCREENS.md` §0 e `apps/index.js:65-72`,
  *"`context` entra em TODAS as listas, como `sky-time` e `timeline`"*) e imposta em nenhum:
  `registerApp` confere que o widget EXISTE (`registry.js:72-77`) e nada mais. `#/security`
  (`apps/security.js:79-82`) é a única das dez sem `timeline`.

- **T-52** — ☠️ **a redundância não é parecença, é o MESMO CAMPO.** A fonte de corpus imprime
  `hit["source"]` na lista (`agent.py:146` → `hud/answer.js:146`) e o mesmo `hit.source` em MEMÓRIA
  RECUPERADA (`hud/streams.js:240`); a de web imprime `hit["title"]` nos dois
  (`agent.py:151` · `hud/streams.js:519`). E os 24 são derivados, não amostra:
  **`MEMORY_LIMIT = 6` (`agent.py:19`) + `MAX_RESULTS = 6` por provedor (`websearch.py:21,80`) ×
  3 provedores com chave (`websearch.py:71-73`)**. Provedor a mais = seis linhas a mais.
  ⚠️ **A assimetria é que decide o conserto, não o tamanho:** na raiz os painéis existem e a
  redundância é **24 de 24**; nas outras oito rotas `memory`/`tools`/`web-results` não são montados
  e a lista é a **única** testemunha. Por isso T-48 vem antes.
  ☠️ **E o `[n]` é CONTRATO com o prompt** (`EVENTS.md:145`, `agent.py:142-144`): sumir com a lista
  quebra a citação, que `hud/answer.js:89-95` desenha riscada quando não bate. **Cortar
  `MEMORY_LIMIT` está refutado como saída** — ele alimenta o modelo (`agent.py:158-163`), então
  encolheria a RESPOSTA, não a tela.

- **T-47** — `.answer` tem teto (`max-height: 36vh`), rolagem e scrim em gradiente
  (`index.html:442-456`); `.sources` não tem nenhum dos três (`index.html:494`). O que transborda
  não rola: **some**, porque `.widget-body` é `overflow: hidden` (`index.html:714`) — a mesma forma
  de falha que `index.html:332-336` já nomeou (*"conteúdo cortado sem barra … lê como bug"*).
  ⚠️ **Fundo opaco está refutado por escrito** em `hud/yield.js:11-15`: a HUD hairline vive de pouco
  contraste. A saída é o scrim que o `.answer` já usa.

- **T-49 / T-50** — a assimetria é dentro da própria base: `core/tela.js:39` recusa chave fora do
  vocabulário de camada e `scripts/lei-cena.mjs` faz o mesmo pela cena; `registry.js:117` espalha
  `...contract` sem conferir nada, então `surafce: true` nasceria sem fundo e sem ninguém acusar.
  `br-deliveries` (`apps/index.js:1158-1161`) é o único widget de palco sem `surface: true` — o
  defeito que `index.html:839-842` já descreveu quando a página de configuração nasceu sem fundo.

- **T-40 … T-45** — achados por dois revisores adversariais sobre as entregas de T-35 fase 2 e
  T-16, e **T-40 é o mais grave**: a marca só aparece no painel do corpo em que o operador **já
  está**, então ela responde uma pergunta que ele não pode ter. Depois de marcar, ele precisa fazer
  MAIS perguntas — *"quais eu marquei?"*, *"como volto lá?"* — que é o Princípio Final ao
  contrário. As três condições de T-35 estão fechadas e **nenhuma delas é a que faz a marca VALER:
  alguém ler.**
- **T-41** — a idade carimba os cinco pontos do cabeçalho e só `brain`/`qdrant`/`ollama` vêm do
  `/api/health`. `graph` é leitura de BOOT afirmada como presente; `stream` é repintado a cada 1 s
  do store local e apagado como "vencido" **no mesmo tique em que foi escrito**. É o defeito que a
  entrega diz ter fechado, sobrevivendo em dois dos cinco.

- **T-38 / T-39** — relatado com foto: o painel diz `ESTAÇÃO · agent` e o favorito oferece TERRA,
  MARTE, JÚPITER… Medido em `atlas/.claude/agents/revisor.md`:

  | caminho | resultado |
  |---|---|
  | `kind: agent` → `solver.js` (cena **AGENTE**) | desenha **ESTAÇÃO** |
  | `superficieDe` (cena **UNIVERSO**) | pele **`planet`** |
  | `contextoDe` → opções do favorito | `planetario` |

  ☠️ **São DUAS TAXONOMIAS vivas, e o favorito escolheu uma sem saber que havia outra.** O painel
  lê o que a cena DESENHA; o favorito lê a ontologia. Oferecer mapa equiretangular a um objeto
  desenhado como malha construída é oferecer o que não se aplica.
  ⭑ **T-38** é o conserto imediato: o contexto sai da pele que a CENA CORRENTE desenha, não de uma
  das duas fixa. ⚠️ Consequência que precisa ser dita na tela: o mesmo corpo oferece opções
  diferentes em cada cena — porque ele É desenhado diferente em cada uma.
  ☠️ **T-39 é o buraco no oráculo, e é o mais grave.** `lei-cena.mjs` prova que a cena não
  contamina `classificar`/`superficieDe` — e **não alcança a cena AGENTE**, que não os chama: ela
  usa `resolveBody` (`solver.js`), a taxonomia por `kind` que a Fase B refutou (228 de 228
  agregados virando galáxia). A lei passa enquanto as duas cenas discordam sobre o mesmo corpo.
  **Provar "a cena é uma lente" exige provar que as duas OLHAM PELA MESMA ontologia.**

- **T-13** — ☠️ **Splash como CAMADA PRÓPRIA está refutada por uso**: ela virou uma SEGUNDA parede
  entre o diagnóstico e o céu, e chegou a desenhar a marca **por cima do céu vivo**. E o que ela
  mostrava o `#boot` já mostra — `TOPOLOGIA` e a coleção no `NÚCLEO COGNITIVO`. O pedido é
  **reescrever a tela de entrada**, não somar uma. `src/hud/splash.js` fica como material da
  reescrita; hoje não é montado.

- **T-32** — o arquivo já está no disco e **não tem consumidor**; o motor de áudio é síntese pura,
  então música de fundo é canal NOVO. ☠️ **A licença não se resolve por inspeção:** os metadados
  foram removidos (só `TYER 2025` e o encoder sobraram) e a origem não declara direito nenhum.
  Uso local não é distribuição — o bloqueio é a publicação, e vale para o repositório, não só para o
  build. As saídas e as fontes licenciadas estão em [`../assets/CREDITS.md`](../assets/CREDITS.md).
- **T-35** — é a peça que torna corpo NOMEADO legítimo: quem escolhe *"este é o meu Marte"* é o
  operador, então a textura vira MARCA e não afirmação derivada do dado. ⚠️ **Três condições, e sem
  elas volta a ser o defeito:** (a) a marca **não entra em `classificar()`** — classe, física e pele
  continuam saindo do corpus, e `lei-cena.mjs` continua valendo; (b) mora no OPERADOR (`prefs`), não
  no corpus — dois operadores veem marcas diferentes sobre a mesma topologia, e é isso que a torna
  marca; (c) a tela **diz que é escolha**, senão é a única forma de isto virar mentira.
  ⚠️ **Quando o arquivo muda de classe**, a marca guarda a escolha POR CLASSE ou degrada anunciando
  — *"não marquei"* e *"marquei e não vale mais aqui"* são fatos diferentes.
  ⭑ Ela **muda o que vale baixar**: com favoritos, planeta nomeado passa a ter uso, e a lista do
  Solar System Scope (Terra, Marte, Júpiter, Saturno, Vênus, Mercúrio, Netuno, Urano) deixa de ser
  inútil aqui. **T-35 vem antes de T-34.**
  ⭑ **As três condições estão fechadas.** A terceira mora em `hud/favoritos-ui.js`, desenhada na
  seção FAVORITO do painel de CONTEXTO (`apps/context.js`), com gesto em `F` e sonda em
  `spatia.favoritos()`. 99 leis sem navegador em `scripts/lei-favoritos-ui.mjs`, 12 mutações vistas
  reprovando. **O que falta é FOTO**, e são três coisas que só ela julga: a faixa de `degradada`
  em `--busy` se lendo como ANÚNCIO sobre o fundo do painel, os 8 chips de aparência cabendo na
  régua de 250 px do trilho sem virar rolagem, e `F` chegando ao alvo que o painel nomeia.
  ⚠️ **Nada da marca alcança o pixel do CÉU** — a escolha é registrada e `emDisco` é `null` porque
  ninguém mediu o disco. Quem transformar `null` em medida é o carregador de textura de T-34, por
  `declararEmDisco()`.
- **T-16** — ☠️ **MODO ASSISTIR COMO MODO ESTÁ REFUTADO POR MEDIDA.** A fila que ele assistiria
  entregou **0 eventos em 301 s** de assinatura real ao `/api/system-events` (handoff §6, com a
  tabela dos cinco observadores). Uma superfície que assiste ao vazio CRIA a pergunta *"por que não
  acontece nada?"* — o Princípio Final ao contrário — e um terceiro eixo de estado ao lado de
  `view.cinematic` seria o segundo lugar pintando estado, já medido como defeito.
  ⭑ **O que a medida achou no lugar:** a tela afirmava o presente com uma leitura do BOOT. Entregue
  como comportamento de quem já tem dono (`hud/frame.js` + `watchHealth` em `main.js`), sem camada,
  sem cena, sem rota — **`core/tela.js` não é tocado, e `PERMITIDOS` não muda**. 44 leis sem
  navegador em `scripts/lei-afericao.mjs`, 16 mutações vistas reprovando.
  ⚠️ **O que falta é FOTO**, e são duas coisas que só ela julga: a idade a 8 px cabendo ao lado dos
  cinco pontos sem empurrar o CONTEXTO da faixa central, e o ponto sem `box-shadow` a 45% se lendo
  como *"isto não é o presente"* em vez de como mais um ponto apagado.
  ⚠️ **Recusado por escrito:** repetir o aviso, emitir no barramento a cada volta e escrever linha
  de timeline por aferição — os três são a repetição que `ambient.py` e `streams.js` proíbem. E
  realimentar `installProviders`/`showProviders`/`voice.applyHealth` no laço: eles MONTAM coisa, e
  remontar não é aferir.
- **T-34** — os links por modelo estão em [`../assets/CREDITS.md`](../assets/CREDITS.md).
  ⚠️ Malha resolve FORMA, não CLASSE: usar um asteroide para todos repete o erro que a textura de
  planeta cometeria. Sortear por semente do caminho, como o terreno do planeta já faz. E o custo de
  malha única por corpo **não está medido** — o "geometria é barato" desta base foi medido para
  esferas instanciadas.

- **T-13** — a camada `splash` está no working tree e **25 leis saem 0 sem navegador** (a pilha
  `mundo > splash > boot`, a entrega sem ninguém nomear o de baixo, `null` de topologia que não
  vira `0 corpos`, carimbo de corpus ausente recusado em vermelho). **O que falta é FOTO**, e são
  três coisas que só ela julga: a legibilidade sobre o disco de acreção (a splash não tem fundo —
  a régua é a sombra de 1px da HUD), a marca não SALTAR entre `#boot` e `#splash`, e o gesto que
  a dissolve chegar mesmo ao canvas. ⚠️ Ao fechar: anunciar no `README.md` e **só então** apagar
  `docs/briefings/splash-screen.md`.

- **T-12** — a `forca` já é da UNIDADE do tipo (`ESCALAS` em `vizinhanca.mjs`): contagem por
  `v/(v+1)`, cosseno pela identidade. O que falta é **substrato**: o fixture tem UM tipo só
  (`CO_EDITED`, 1 a 4 commits, três valores distintos), e julgar a codificação visual de quatro
  tipos sobre um deles é julgar um tipo. Os quatro só convivem no corpus VIVO.
  ☠️ **`(valor − min)/(max − min)` está REFUTADO, não substituído por gosto** — normalizar pelos
  extremos observados manda o mais fraco para `0`, e `0` aqui é *"medi e não há"*: **92,8% dos
  vínculos do fixture** e **312 de 313 `IMPORTS` do vivo (99,7%)** sairiam afirmando ausência sobre
  vínculo que existe. E `min`/`max` são amostra: os mesmos 3 commits davam **0,667** num céu de máx
  4 e **0,100** num de máx 21 — a força de um par dependendo de quem mais está no céu.

- **T-31** — as 22 leis da tela (pureza, vocabulário da camada, a pilha que nunca esvazia, o
  assinante reentrante que estabiliza em 2 emissões, e a rota batendo com o decodificador do
  kernel em 12 de 12 endereços) já rodam em `node` sem navegador. **O que falta é o arquivo morar
  em `scripts/`** — invariante provada uma vez e sem portão é invariante declarada na sessão
  seguinte.

- **T-19** — `a_corte` 23,9 (fixture) e 26,3 (real) contra o raio orbital máximo 62, **zero janelas
  fechadas**: expiração, não defeito, e só morde se `M_total` crescer ~13×. ☠️ **A saída óbvia é
  falsa** — `rocheLimit(mass)` já É `2,44·R`, e a constante mora em `physicalRadius`.
- **T-26** — as quatro candidatas estão prontas em `src/sandbox/ring-variants.js` com a pesquisa em
  `catalogo-celeste.md`. **Falta o número:** a comparação a 25 px foi feita a olho, sem timer de
  GPU, e as quatro custam coisas diferentes. ⚠️ O anel **não aparece no corpus real** (a varredura
  de sujos é enraizada no `AGENT_CWD` e os arquivos que o `git status` acusa não estão indexados) —
  só se julga no fixture ou na bancada.
- **T-27** — o custo não é traduzir: são ~210 literais, e essa é a parte fácil. Os rótulos são
  curtos e caixa-alta porque a HUD é hairline, e as réguas da systray, do `.config-key` (68 px para
  a tecla) e do `.headstat` foram dimensionadas para o português. **Alemão e francês estouram
  30–40% em largura** — i18n aqui é redesenhar largura, não trocar string. Só o passo que não se
  desfaz foi dado (`plural()` em `hud/dom.js`).
- **T-28** — ☠️ **A zona graduada está REFUTADA por medida, e o símbolo tinha DOIS donos.** Na
  tabela apagada `μ` era a razão entre a massa de DOIS CORPOS de um sistema; em `orbital-zones.js`
  ele é o número de SEÇÕES de um arquivo — mesmo símbolo, mesmo 5, grandezas diferentes. Medido no
  fixture de 09/08 pela definição da tabela (22 sistemas): *família colisional* (`μ ≪ 1`) é **vazia
  por aritmética** (`μ` é a maior massa sobre a segunda e nunca desce de 1), *sistema duplo*
  (`1 ≤ μ < 5`) leva **18 dos 22 (81,8%)** e *primária* leva 4, dos quais 2 são de um corpo só. A
  cena desenha **uma estrela por sistema nos 22**, então a zona graduada não muda um pixel; quem
  tem leitor é o fato BINÁRIO, `dominanteDe`. Implementá-la seria desenhar um segundo corpo em
  81,8% dos sistemas — **pipeline novo, não limiar**, e com as 0 sobreposições em 17.578 pares no
  caminho. ⭑ **Fica o portão, sai a zona:** `MU_MIN = 5` continua recusando 9 dos 72 corpos e
  agora se justifica pelo caso degenerado (`N^(-1/3)` = 1,000 com uma seção).

### As decisões que são do usuário

Elas não são `blocked` por engenharia e **nenhum agente deve resolvê-las sozinho**:

1. **T-21 · Marketplace × segurança.** `OS-SCREENS.md` recusou por escrito (*"instalar app de
   terceiro nisso é entregar a máquina"*) e o `/api/health` confirma a premissa. É binário.
2. **T-22 · Gravidade cognitiva.** Colide com a 1ª lei do Neo4j, com a FRONTEIRA, e com as **0
   sobreposições em 17.578 pares** que uma coordenada nova pode destruir.
3. **T-23 · Agente como corpo.** É **pipeline novo, não limiar** — e há recusa por escrito em
   `modelo-de-renderizacao.md:462`: *"estação orbital, não nave"*.
4. **T-53 · O que sobe para o MUNDO.** A preferência escrita é *"fazer tudo em canvas"*, e o pedágio
   está medido nos dois sentidos (`hud-e-canvas.md` §5). ⭑ **O meio-termo não é proposta: está
   construído e desligado** — `space/bodies.js` posiciona HTML pela projeção da câmera
   (`bodies.js:251,263-264`) **com oclusão pelo horizonte de eventos** (`bodies.js:216-260`), e
   `installApps` **não tem chamador** (`grep -rn "installApps" src/` devolve a definição em
   `scene.js:2607` e dois comentários). O desligamento é decisão do usuário de 07/08
   (`main.js:208-225`): *"um corpo de UI no meio do céu compete por atenção com os astros que são o
   conteúdo"* — e o mesmo bloco declara que *"voltar a montar é uma linha"*.
   ⚠️ **O motivo do desligamento não alcança CONTEÚDO.** Uma fonte de corpus não é mobília de UI: a
   estrela dela já acende no céu por `memory` (`scene.js:993-1002`). A pergunta binária é **o que
   TEM lugar no mundo** — e QUOTAS, MÉTRICAS e PERMISSÕES não têm, então ocluí-las por um planeta
   seria feição sem fato.

---

## Os briefings — o razão, e quando cada um morre

> **Um briefing é ANDAIME.** Quando o conteúdo dele estiver diluído nos docs permanentes (o
> `README.md` para o que o usuário ganha, o `CLAUDE.md` para como se mede, o comentário do módulo
> para por que é assim), **o arquivo é apagado**. O git guarda o texto; o que não pode é haver duas
> fontes divergentes sobre a mesma coisa.
>
> ⚠️ **Ao destravar um item de briefing:** marque no briefing E anuncie no `README.md` como
> feature/capability. Item entregue que ninguém sabe que existe é o mesmo que não entregue.
>
> ⚠️ **A triagem que vale para todos**, e quatro leituras independentes chegaram nela sozinhas: os
> briefings **acertam a ESTRUTURA e erram as FOLHAS**. Onde nomeiam uma RELAÇÃO, acertam — e às
> vezes descrevem algo que já existe com outro nome. Onde nomeiam um FATO DE MUNDO, descrevem um
> corpus que não existe. **Leia cada linha perguntando qual das duas ela é.**

| briefing | tarefas | morre quando |
|---|---|---|
| `cena-como-lente.md` | T-04, T-05, T-08 | a `SceneDefinition` existir e o `lei-cena.mjs` sair 0 |
| `multi-scene.md` | T-04 | idem — é o mesmo assunto por outro nome |
| `splash-screen.md` | T-13 | `tela.js` existir e a splash montar nele |
| `menu-iniciar.md` | T-14 | idem |
| `entrevista-usuario.md` | T-09, T-16, T-07 | ⚠️ as três estão `done` e ele **não morre**: 923 linhas, 15 expectativas, e só três tinham tarefa. Reler para extrair as próximas — **e sem confundir emitir com afirmar** (handoff §7-B) |
| `black-hole-router.md` | — | ⚠️ o item favorito do autor (`cogload` → `setLoad`) **já existe ponta a ponta** |
| `gravidade-entrelacamento.md` | T-12, T-22 | T-12 entregue e T-22 decidida |
| `orbita-eliptica.md` | T-11 | ⚠️ a órbita elíptica **já está feita e medida** (área varrida máx/mín 1,0008) — resta o TRAÇO |
| `quasar-enhance.md` | — | ⚠️ pede sete coisas e **quatro já existem** — conferir antes de implementar |
| `ship-navigator.md` | T-15, T-08, T-17 | ⚠️ cita "arquitetura existente de agentes como drones e naves" e **a arquitetura citada é outro briefing não implementado** |
| `integracao-organica.md` | T-23 | decisão do usuário |
| `features-widgets.md` | T-21 | decisão do usuário |
| `hud-e-canvas.md` | T-46 … T-53 | a sonda da HUD existir, os residentes terem portão e T-53 estar decidida |
