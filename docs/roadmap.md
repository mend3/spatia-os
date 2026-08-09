# Roadmap — SpatIA

> **Este arquivo e o [`HANDOFF.md`](./HANDOFF.md) são a MESMA verdade vista de dois lados**, e mudam
> juntos.
> O handoff responde *"o que está aberto AGORA e como não cair nas armadilhas"*; este responde
> *"para onde vamos, em que ordem, e o que cada peça destrava"*. Fechar uma tarefa aqui **obriga** a
> tirar o item do handoff (movendo o resíduo para `armadilhas.md`/`medidas.md`), e abrir um item lá obriga a criar a
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
> transição. Medido: **0 eventos em 301 s** ([`medidas.md`](./medidas.md)). **"Vivo" não pode significar "tem
> novidade"** — quem depende de novidade para parecer vivo acaba inventando repetição. Significa
> que o que a tela afirma é do presente, ou diz de quando é.

| KR | medida | hoje |
|---|---|---|
| KR1.1 | existe produtor ambiental emitindo **sem pergunta do operador** | ⭑ `server/ambient.py` — vigia de 5 observadores por TRANSIÇÃO, a cada `SCAN_SECONDS` |
| KR1.2 | `notice` carrega `severity` e a tela distingue ruído de aviso | ⭑ cabeça da timeline (`hud/streams.js`): `warn`/`alert` de pé com `action`, `info` apaga |
| KR1.3 | cinco minutos parado produzem evento legítimo (não sintético) | ☠️ **0 eventos em 301 s**, medido na assinatura real — e está CERTO: 3 dos 5 observadores não têm como disparar hoje, 2 são eco de comando humano ([`medidas.md`](./medidas.md)) |
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
| KR2.1 | **estado de tela** tem dono único | ⭑ `core/tela.js` — camada · cena · rota num objeto só, `spatia.tela()`. ⚠️ `session.route` sobrevive **sem leitor** (T-64) |
| KR2.2 | **pose da câmera** tem nome próprio | ⭑ `escalaLocal()` · `porteLocal()` · `orbit.distance`, provado na tela |
| KR2.3 | **cena** é definição declarativa registrada, não `if` em `setMode` | ⭑ `CENAS` em `scene.js` |
| KR2.4 | oráculo prova que trocar de cena **não muda classe, física nem pele** de nenhum corpo | ⭑ `lei-cena.mjs` sai 0 (fixture, 09/08: 72 corpos · 7 call sites · 1.080 perturbações), e a §5 varre o FONTE: uma decisão de pele só, sem ramo por cena |

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
| **T-18** | Um diretório sem agregado é um sistema? — o censo agrupa por `dir`, a cena por nó AGREGADO | `done` | — | — | — |
| **T-36** | `conectividade.mjs` agrupa como a cena agrupa — e o ρ com o tamanho do sistema NÃO era o filho único | `done` | — | — | KR3.1 |
| **T-19** | Quebrar a dependência de `M_total` nas luas — RISCO DE EXPIRAÇÃO, não defeito vivo | `postponed` | — | — | — |
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
| **T-39** | As duas cenas olham pela MESMA ontologia — a pele tem um dono só (`space/sistemas.js`) | `done` | — | — | KR2.4 |
| **T-71** | **A REGRA DO FOCO no pixel — nas DEZ rotas**, não só na cena principal | `todo` | — | T-72 | KR2.1 |
| **T-72** | Orçamento de ALTURA por fenda — a REGRA DO FOCO não é aplicável sem esta régua | `todo` | — | T-71 | KR2.1 |
| **T-73** | `sec-effective` mora em `strip`, a fenda dos RESIDENTES — mover ou redeclarar | `todo` | decisão do usuário | — | KR2.1 |
| **T-74** | MEDIR o custo de um painel de VIDRO 3D — o número que decide o launcher | `todo` | — | T-14 | — |
| **T-75** | MEDIR o custo de um atlas de glifo por token — decide se a §5.1 tem saída barata | `todo` | — | T-53 | — |
| **T-76** | Descoberta de MCP — o widget que lista e instala servidores | `todo` | T-21 | — | — |
| **T-77** | Catálogo de APIs públicas como CAPACIDADE, não como lista | `todo` | T-21 | — | — |
| **T-78** | **Capability Registry** — instalar CAPACIDADE (widgets+MCP+eventos+agentes), não plugin | `todo` | T-21 | T-76, T-77 | — |
| **T-79** | **AUDITAR os 17 «Quem reage» de `EVENTS.md`** — quantos fenômenos declarados têm leitor | `todo` | — | T-23 | KR1.1 |
| **T-80** | O inspector tem TRÊS estados (recolhido → **resumo** → aberto) e ganha AÇÕES | `todo` | — | T-71 | KR2.1 |
| **T-81** | Comprimir o cabeçalho — ⚠️ colide com refutação escrita sobre esconder dado atrás de gesto | `todo` | decisão do usuário | — | KR2.1 |
| **T-82** | O documento como EXTENSÃO ESPACIAL do astro — âncora e profundidade, não janela | `todo` | T-53 | — | KR2.1 |
| **T-69** | `SURFACE` (solver) e `SUPERFICIE` (superficies) são DOIS nomes do mesmo vocabulário | `todo` | — | — | KR2.4 |
| **T-70** | `resolveBody()` ainda decide uma PELE que ninguém lê — sobrou o modificador | `todo` | T-69 | — | KR2.4 |
| **T-40** | A marca não tem CONSUMIDOR — nada no céu nem em lista sabe o que foi marcado | `todo` | — | — | KR2.1 |
| **T-41** | A aferição data CINCO pontos e só TRÊS são aferidos | `todo` | — | — | KR3.1 |
| **T-42** | `sys-about` é um segundo dono de `/api/health`, com o dobro da cadência | `todo` | — | — | KR2.1 |
| **T-43** | A repintura da marca (`context.js`) é invariante DECLARADA sem oráculo | `todo` | — | — | KR2.4 |
| **T-44** | A seção FAVORITO empurra VÍNCULOS para baixo da dobra — a ordem já corrigida OLHANDO | `todo` | — | — | — |
| **T-45** | `.row.warn` não existe no CSS — quatro emissores de um tom sem leitor | `todo` | — | — | — |
| **T-46** | `spatia.hud()` — ⭑ **rodada nas 10 rotas**; as estimativas do briefing viraram medida | `done` | — | — | KR2.1 |
| **T-47** | A lista de fontes tem TETO de vista, rolagem, scrim e o **total publicado** — as 24 continuam no DOM | `done` | — | — | KR2.1 |
| **T-48** | O conjunto residente é DECLARADO **e imposto** — `RESIDENTES` + `declararApp`, e `#/security` monta `timeline` | `done` | — | T-52 | KR2.1 |
| **T-49** | `registerWidget` aceita chave fora do vocabulário — a REGRA DO CATÁLOGO sem portão | `done` | — | T-50 | — |
| **T-50** | `br-deliveries` é widget de palco **sem `surface: true`** — o disco atravessa o texto | `done` | — | — | — |
| **T-51** | Zona morta do palco — ⭑ **medido nas 10 rotas: o corpo reivindica, a moldura cede** | `done` | — | — | — |
| **T-52** | A linha de referência sai quando um painel VISÍVEL já a afirma — e vira PONTEIRO, com o `[n]` dentro | `done` | — | — | KR2.1 |
| **T-53** | O que sobe para o MUNDO — `space/bodies.js` está pronto e desmontado | `blocked` | decisão do usuário | — | — |
| **T-54** | A cena AGENTE voltava PRETA ao voltar do UNIVERSO — era a PARIDADE DE SWAPS, e o par agora é FIXADO | `done` | — | — | KR2.3 |
| **T-55** | Enxugar a BANCADA — ela é o storybook dos objetos 3D, e tem espécimes depreciados | `blocked` | T-26 | — | — |
| **T-56** | Satélites estão com LUAS — não existe e não faz sentido | `todo` | — | — | — |
| **T-57** | Falta a família de anel para arquivo EXCLUÍDO (`D`) — ⚠️ o servidor nem emite esse estado | `todo` | — | — | KR3.1 |
| **T-58** | ☠️ **Deeplink de FOCO não funciona** — o `prefs` vence o endereço | `todo` | — | — | KR4.1 |
| **T-59** | Melhorar o visual do QUASAR (`briefings/quasar-enhance.md`) | `todo` | — | — | — |
| **T-60** | Melhorar o visual do PULSAR — luz FLAT (devia expandir em 360°) e nuvem estática | `todo` | — | — | — |
| **T-61** | Texturas: asteroide, cometa, anel — pedregulho, poeira, colisão eventual | `todo` | T-34 | — | — |
| **T-62** | Camada externa do BURACO NEGRO — poeira, detritos, profundidade e volume | `todo` | — | — | — |
| **T-63** | `orbital-zones.js` empresta nome de FÍSICA a metáfora — é DECISÃO, não renomeação | `todo` | decisão do usuário | — | KR3.2 |
| **T-64** | `session.route` sobrevive **sem leitor** — apagá-lo ou dar-lhe um leitor | `todo` | — | — | KR2.1 |
| **T-65** | Levar a REDE à cena AGENTE — o dado e o desenho já existem; falta decidir | `blocked` | decisão do usuário | — | — |
| **T-66** | O sistema APERTADO — 38 arquivos numa pasta dão planetas de 0,10 unidade | `todo` | — | — | — |
| **T-67** | Segunda textura de estrela (K/M, fria), escolhida pela TEMPERATURA | `todo` | — | — | — |
| **T-68** | Passo 2 — feição no SPRITE, e **não** aro no corpo: é lá que os corpos vivem | `todo` | — | — | — |

- **T-71** — ⭑ **DEIXOU DE SER PROPOSTA: virou LEI.** *"Nada deve competir com o objeto que está em
  foco"* está no `CLAUDE.md` como **A REGRA DO FOCO**, com a tabela de quem domina em cada gesto
  (navegando · lendo · conversando · inspecionando · árvore). A tarefa não é mais "avaliar a
  sugestão" — é implementar a lei, e o que se discute é COMO, não SE.
  ☠️ **Duas coisas que a lei já resolve e que a proposta não tinha:** (1) "dominar" é adjetivo até
  se dizer de que grandeza — são três, e `metrics` reivindica 33,1% ao ponteiro com 10,3% de glifo;
  (2) **recolher não é desmontar**, e **controle de estado ATIVO não cede** — `sky-time` governa a
  janela temporal do céu em toda rota, e escondê-la deixa o corpus filtrado por uma data invisível.
  ⭑ `answer` já obedece: sem resposta ele não desenha nada. É o exemplar.
  Origem: revisão externa sobre uma captura da cena de foco — três estados (EXPLORE, FOCUS,
  INSPECT), trilhos virando *drawers*, conteúdo maior e a resposta do agente como faixa transitória.
  ⭑ **Os quatro TIERS que o review propõe são o vocabulário que falta ao `RESIDENTES`:**
  `persistent · contextual · transient · optional`. Hoje a tabela é binária (é residente ou não), e
  os quatro nomes separam *"nunca sai"* de *"aparece quando é a vez dele"* de *"vive segundos"*.
  ⚠️ **Pôr `uiBudget` na tabela `CENAS` MEXE NUMA LEI:** `lei-cena.mjs` §1 recusa chave fora de
  `id`/`passes`/`camadas`/`chegada`/`aoEntrar`. Chave nova ali é decisão de modelo e passa pelo
  oráculo — não é um campo a mais.
  ⭑ **A HIERARQUIA ORDENADA é a parte checável da proposta**, e vale mais que os percentuais:
  ① objeto em foco · ② conteúdo dele · ③ atividade do agente (temporária) · ④ contexto · ⑤
  instrumentação (só quando pedida). Ordem é verificável na bancada; *"65% / 20% / 10% / 5%"* não é
  — os percentuais dele foram medidos e não batem (ver a tabela acima).
  ⭑ **A faixa do agente decai em DOIS estágios**, e é o desenho certo: texto inteiro → depois de
  segundos vira `● 3 relações encontradas` → recolhe. *"Evento é fenômeno temporário; a entidade
  permanece"* — que é a mesma frase de `integracao-organica.md`, e ela amarra T-71 a T-79.
  ⭑ **LOD aplicado à HUD** é empréstimo de vocabulário que a base já tem em 3D (`space/lod.js`): a
  entidade permanece completa e a APRESENTAÇÃO muda com o nível de foco. Vale para o painel como
  vale para o corpo.
  ☠️ **O REVIEW OLHOU A CENA PRINCIPAL, E O INVENTÁRIO INVERTE A PRIORIDADE.** Medido nas dez rotas:
  a **raiz é a mais LEVE** (5,4% de glifo · 88,4% de céu) e `journal` é a mais pesada (**24,7% ·
  60,2%**), com `metrics`, `storage` e `system` entre 73% e 75% de céu. Os princípios são gerais —
  *"o objeto em foco"* é a execução em `journal`, o gráfico em `metrics`, o arquivo em `files` —
  então **aplicar a regra só ao céu conserta a tela menos quebrada**. A ordem por ganho é
  `journal` → `metrics`/`storage`/`system` → o resto.
  ⚠️ **E o ponteiro reordena de novo:** `metrics` reivindica **33,1%** com só 10,3% de glifo. Quem
  otimizar por texto não vê essa; quem otimizar por ponteiro não vê o `journal`. São duas filas.
- **T-80** — ☠️ **O inspector hoje é BINÁRIO (recolhido/aberto) e a crítica do review é que tudo
  pesa igual** — caminho, tipo, massa, commit, reescritas, disco, indexado, alcance, favorito,
  vínculos, seções, localizar, todos no mesmo tom. Três estados resolvem sem esconder nada:
  **recolhido → RESUMO → aberto**, com o resumo sendo `nome · classe · massa · estado` e nada mais.
  ⭑ **E há um vazio que o review acha e ninguém tinha nomeado: o inspector não oferece AÇÃO.** Ele
  descreve o corpo e não diz o que dá para fazer com ele — *"abrir · relacionar · …"*. É o Princípio
  Final ao contrário: depois de ler o painel, o operador ainda precisa descobrir sozinho o próximo
  gesto. ⚠️ Quais ações existem depende de T-78 (o catálogo de ações por tipo de corpo).
- **T-81** — o cabeçalho carrega `CUSTO · CHUNKS · JANELA · ÍNDICE`, que são operacionais e estão em
  toda rota. Medido: o topo é **1,1% da tela em glifo** — pouco, e é a PRIMEIRA coisa na hierarquia
  visual, sempre presente.
  ☠️ **Colide com refutação ESCRITA nesta base:** `index.html:41-44` recusa esconder dado atrás de
  gesto — *"dado que exige gesto para aparecer deixa de ser monitorado"*, com ganho medido de ~4% de
  pixel. Mandar custo e janela para um popover é exatamente isso. **Ou a refutação cai com medida
  nova, ou o cabeçalho encolhe sem esconder** (menos rótulo, mais densidade). É decisão de produto.
- **T-82** — ⭑ **O review acerta o diagnóstico e a base já tem a peça construída e DESLIGADA.** Ele
  diz que o documento *"flutua no centro sem relação espacial clara com o astro"* e que o operador
  não sabe se aquilo pertence ao planeta, ao buraco negro, ao sistema ou à cena. A saída que ele
  propõe — âncora, profundidade, parallax, o conteúdo emergindo da SUPERFÍCIE do corpo — é o que
  `space/bodies.js` faz: posiciona HTML pela projeção da câmera **com oclusão pelo horizonte de
  eventos** (`bodies.js:216-260`), e `installApps` não tem chamador.
  ⚠️ **O desligamento de 07/08 foi por MOBÍLIA DE UI, e conteúdo não é mobília** — o próprio roadmap
  já registra que *"o motivo do desligamento não alcança CONTEÚDO"*. Por isso isto depende de T-53,
  que é a decisão de o que sobe para o mundo, e não é tarefa nova de engenharia: é religar com
  escopo. ⚠️ *"Não um retângulo preto sólido"* também é parte do pedido, e essa metade é shader.
  ⭑ **A estrutura já tem casa nesta base, e isso é o que a torna barata:** `CENAS` (`scene.js`) já é
  tabela declarativa, `RESIDENTES` (`apps/residentes.js`) já declara o que cada rota monta COM o
  motivo, e `spatia.hud().widgets` já separa `recolhidos` de `naoMontados` de `ausentes` — o
  `uiBudget` que a proposta pede é `RESIDENTES` com uma coluna de PERMANÊNCIA a mais.
  ⭑ **A MEDIDA existe, e a bancada monta o APP DE VERDADE** (`bancada-hud.html`, `index.html` num
  `<iframe>`): painéis reais, conteúdo real, recolhimento real (`data-collapsed`). `HOJE` não aplica
  override nenhum — o controle É a tela. As outras mexem em três coisas: a GRADE do `#hud`, quais
  painéis recolhem, e o que vira alça.

  Medido em 1426×712, grade de 12 px, 7 021 pontos, rota raiz, corpo `bloco-04.md` travado:

  | composição | TEXTO | TINTA | céu limpo | ⟵ | palco | ⟶ |
  |---|---|---|---|---|---|---|
  | **HOJE** (controle) | 7,4% | 6,7% | 85,9% | 1,3% | 0,0% | 4,1% |
  | EXPLORE | **2,2%** | 5,8% | **92,0%** | 0,1% | 0,0% | 0,1% |
  | FOCUS | 5,6% | 6,3% | 88,1% | 0,1% | 0,0% | 3,5% |
  | INSPECT | 9,6% | 6,7% | 83,7% | 3,2% | 0,0% | 4,1% |

  ☠️ **DUAS TABELAS ANTERIORES DESTE ITEM ESTAVAM ERRADAS, e as duas pelo mesmo motivo: espécime
  reconstruído à mão.** A primeira dizia *"FOCUS não libera céu"* — era um painel com `width` fixa
  transbordando uma coluna estreita. A segunda corrigiu isso e ainda media painéis que eu havia
  escrito (`tipo 1 ▮▮▯▯`, `pasta 1..10`), com **tinta 19,6% no controle** contra **6,7% do app real**
  — quase 3× para cima. **Reconstrução não é medida**, e o relato do operador foi exatamente esse:
  *"os painéis reais são retráteis e têm mais conteúdo do que a bancada mostra"*.

  ⚠️ **O QUE ESTES NÚMEROS AINDA NÃO DESCREVEM, e é a captura que motivou a proposta:** `palco 0,0%`
  nas quatro linhas. A tela do relato tinha **documento aberto E resposta do agente no palco**, e
  este estado não. Enquanto a bancada não dirigir o app até lá (abrir o arquivo, rodar a pergunta),
  a comparação fala de uma tela mais vazia do que a que incomodou. **É a próxima peça de fidelidade,
  e sem ela o número de FOCUS está subestimado.**

  ⭑ **O que já se sustenta:** EXPLORE libera céu de verdade (85,9% → 92,0%) e derruba o texto de
  7,4% para 2,2%; INSPECT com tudo aberto é o teto (83,7%), e ainda assim sobra mais céu do que a
  proposta supõe. E o `ponteiro` do app anda junto na barra, para as três grandezas ficarem lado a
  lado sem conversão.
  ⚠️ **Um piso que a proposta não menciona:** trilho recolhido não pode virar caixa vazia. Um widget
  sem conteúdo continua com corpo, e o CSS do app pinta o corpo — a primeira tentativa deixou dois
  slabs pretos flanqueando o céu, piores que os trilhos que substituíam. A alça é uma coluna de
  30 px com um glifo, e o recolhimento é o do app (`data-collapsed`), não um `display: none` novo.
  ⚠️ **É `blocked` por DECISÃO do usuário**, e não por engenharia: trocar o que fica na tela em cada
  estado é produto. A bancada existe para essa decisão ser tomada olhando número e pixel juntos.

- **T-14 · O LAUNCHER — duas decisões tomadas, e uma delas por MEDIDA de colisão.**
  ☠️ **O briefing pede `Space` e `Space` JÁ TEM DONO:** `hud/terminal.js` usa *segure ESPAÇO* para a
  entrada de voz, e a instrução está impressa no rodapé (*"MANTENHA ESPAÇO PARA FALAR"*). **Decidido:
  `Ctrl+K`**, que o próprio briefing oferece e que não colide com nada. Trocar a voz de tecla
  reescreveria um hábito já anunciado na tela.
  ⭑ **A camada já tem casa e nunca foi declarada:** `core/tela.js` é a pilha, e `launcher` aparece
  **só em comentário** (`tela.js:8`, `hud/boot.js:69`). Registrar é `registrar({ id: 'launcher' })`
  — uma linha, e o portão de vocabulário da camada já recusa id não declarado.
  ⚠️ **O "Action Ring" (ações por CONTEXTO, não itens fixos) é a parte do briefing que vale mais e
  não é do launcher:** ele precisa de um catálogo de ações por tipo de corpo, que é T-78. Sem ele o
  menu é uma lista de rotas com vidro.
- **T-74** — ☠️ **O canvas foi refutado para os 46 WIDGETS, não para um menu, e a diferença é real:**
  a refutação (`hud-e-canvas.md` §7) conta 521 `el()`, 17 corpos de fonte e 26 `aria-*`, e nada
  disso descreve uma superfície transitória de oito elementos. **Mas o orçamento é o mesmo**, e ele
  não tem folga: a lente custa **3,8–5,1 ms** contra 0,31–0,35 ms do céu inteiro. Então a ordem é
  MEDIR primeiro — um painel de vidro com refração na bancada, contra o quadro — e só depois
  decidir. ⚠️ Glass real por FBO/transmissão é um segundo passe de composição, que é exatamente o
  bolso já cheio.
- **T-72** — ⭑ **É a regra que tem um TERMO FALTANDO, e o próprio código já confessa.** A semântica
  das fendas diz o que cada uma significa e **não diz quantos cabem**. O acordeão
  (`kernel/widgets.js:63-71`) é o remendo de runtime disso, e o comentário dele é a prova:
  *"com todas abertas elas disputam a altura, e o que perde não fica menor, fica com ZERO. Um
  gráfico de 14px sumia inteiro enquanto a legenda dele continuava na tela, sem erro nenhum"*.
  ⚠️ **Uma regra que precisa de remendo de runtime para ser habitável é uma regra incompleta** — e o
  termo é orçamento de altura por fenda. Ele conversa com T-71: decidir o que fica na tela sem ter
  a régua de altura é decidir metade.
- **T-73** — a fenda `strip` tem semântica declarada de RESIDENTES (*"o que nunca deve sair da
  tela"*) e `sec-effective` mora nela existindo em **1 de 10 rotas** (medido; o censo de
  `lei-residentes.mjs` §5 imprime o caso em amarelo toda vez). A fenda ganhou um segundo significado
  sem que nada recusasse. ⚠️ **Não é renomeação:** ou o painel muda de fenda, ou a semântica de
  `strip` passa a admitir o caso — e a régua da faixa (largura inteira) **não é** a do trilho de
  230 px, então a decisão MUDA A TELA e tem de ser vista.
- **T-76 / T-77 / T-78** — `features-widgets.md` é 5× maior que o T-21 que o roadmap lhe dava. As
  três peças abaixo dele são independentes entre si e todas dependem da postura de segurança (T-21),
  que é decisão sua: instalar coisa de terceiro é a premissa das três.
  ☠️ **HOMÔNIMO, e ele é do tipo que esta base cobra caro:** `server/capabilities.py` **já existe** e
  é escopo de PERMISSÃO (`decide`, `enforceable`, `settings_file`, `release`). O *Capability
  Registry* do briefing é outra coisa — o que uma capacidade INSTALA (widgets, MCP, eventos,
  agentes). Mesmo nome, grandezas diferentes; `docs/identidade.md` existe para impedir exatamente
  esse `sed`. **Quem construir T-78 nomeia diferente, ou funde os dois de propósito e por escrito.**
  ⭑ **E parte já existe:** `br-mcp` é widget montado na rota `bridge` (`apps/index.js:1207`) — T-76
  não começa do zero, ele começa perguntando o que aquele widget já faz.
- **T-79** — ☠️ **A TAREFA ERA OUTRA, e o review externo mostrou por quê.** Ele pede que *"o agente
  invada o UNIVERSO, não a UI"* — pulsos percorrendo as conexões enquanto o agente trabalha, para a
  tela não precisar de caixas. ⭑ **Isso já está DECLARADO:** `EVENTS.md` tem uma coluna *"Quem
  reage"* para os **17** tipos de evento, e ela nomeia o fenômeno de cada um — `memory` → *"estrelas
  do grafo acendem"*, `tool` → *"wormhole abre na cor de `kind`"*, `web` → *"satélite liga,
  resultados caem como meteoros"*, `thought` → *"trilha tênue de partículas"*, `state` → *"o buraco
  negro muda de regime"*.
  ⭑ **E o substrato do AGENTE é real, ao contrário do ambiental:** toda pergunta emite. A fila
  ambiental entrega 0 eventos em 301 s; o barramento do agente entrega dezenas por execução.
  ⚠️ **Varredura CRUA (`grep` por nome em `src/space/*.js`, não medida): ~8 dos 17 têm menção.** Isso
  é indício, não auditoria — `error` e `token` casam palavra comum. **A tarefa é a AUDITORIA:** para
  cada um dos 17, existe leitor de verdade? O que não tiver é *fenômeno declarado sem leitor*, a
  família que esta base já pagou cinco vezes — e aqui ela está num DOC que promete comportamento.
  ☠️ **Só depois disso se sabe o que falta construir.** Construir o motor antes da auditoria é
  reimplementar o que já existe com outro nome, que é a forma mais cara de desperdício desta base.
  ⚠️ O barramento AMBIENTAL segue silencioso e a nota abaixo continua valendo para ele.
  ☠️ **E construir o motor inteiro agora anima o vazio:** a fila entrega **0 eventos em 301 s**, e
  três dos cinco observadores de `ambient.py` **não têm como disparar** (`index` precisa de 30 dias,
  `credential` de um `expires_at` que ninguém declara, `graphdb` só dispara na queda). É a mesma
  refutação do T-16.
  ⭑ **O que destrava em pequeno:** os DOIS que emitem são `corpus` e `topology`, e os dois são eco de
  comando humano — reindexar e rematerializar. **`topology` é o candidato**: a cadeia de
  rematerialização é rodada de propósito e com frequência, então dá para ligar UM fenômeno de ponta
  a ponta e provar `System Event → Universe Event → Phenomenon → Animation` com substrato real, sem
  fabricar heartbeat. ⚠️ **Um fenômeno só, e com a lei do `ambient.py` valendo:** repetição inventada
  é o que ensina o operador a não ler a tela.

### `postponed` e `archived` ficam escritos — apagá-los faz a próxima sessão reabrir

- **T-20** — ☠️ **está MEDIDO, e não é defeito de código.** O "planeta transparente" é o corpo em foco
  iluminado por trás: o que se vê é um **CRESCENTE**. A/B no mesmo quadro, controle em **0 pixels** —
  o limbo por setor varia **23,96×** entre o lado aceso e o apagado, e desligar os dois termos de
  atmosfera deixa em **24,53×**, inalterado. Não é aro; é fase. Vale o corolário da REGRA DA FÍSICA:
  a física produziu o fenômeno esperado, então o que sobra é **linguagem visual**. ⚠️ Mudar a direção
  da luz conserta a leitura **e muda a composição que o usuário chama de "mais bonita"** — decisão dele.
- **T-24** — a borda do planalto anda com a pose (**3 px a 260 un · 4 a 150 e 116 · 4,5 a 58**): a
  FORMA da conclusão sobrevive, a magnitude não. Mais sistemas no mesmo `OCUPACAO` dão envelopes
  menores, e é por isso que o `PISO` não se congela contra o fixture.
- **T-19** — ⭑ **a expiração, escrita como conta:** `slack = a_pai / (2,44 · DENSITY_K · ∛(3M))`.
  `inner` escala com `DENSITY_K` e `outer` (Hill) **não** — é essa assimetria que fecha a janela.

**As quatro dimensões do grafo têm dono, e duas foram RECUSADAS por escrito:** `centrality` ✅ ·
`usage` ✅ · `connectivity` ✅ (como **ALCANCE**, porque o grau repetia a centralidade) · `density`
**adiada** (é bytes por chunk; conserta-se no indexador) · `importance` **recusada** (é juízo, não
fato).

- **T-63** — ☠️ **É o TERCEIRO `mass`, e o pior dos três.** Os dois primeiros caíram por renomeação
  (`mass` → `chunks`, `planetParams.mass` → `chunksNorm`), mas em `orbital-zones.js` o
  `const mass = node.chunks || 0` alimenta `physicalRadius`, `rocheLimit` e `hillRadius` — nomes que
  **são** físicos, e uma função chamada `rocheLimit` afirma um limite de maré. `DENSITY_K` é
  constante CALIBRADA (já degradou uma vez: corpus 5,6× maior, **297 luas viraram 0**), não constante
  física com unidade. É o caminho curto e calado que a FRONTEIRA proíbe. **Não é renomeação:** ou os
  nomes deixam de ser físicos, ou a razão vira adimensional como no `astrofisica.js`.
  ⭑ `hillRadius` está ABSOLVIDO — `∛(m/3M)` é razão de massas, o mesmo argumento que salva o `R_s/R`.
- **T-64** — **duas verdades sobre a mesma rota, e a segunda não tem leitor.** `core/tela.js` guarda a
  rota que o kernel resolveu; `core/session.js` continua lendo o hash CRU. **Divergem em 7 de 12
  endereços**, medido recortando os dois decodificadores do próprio código: sub-rota, app inexistente,
  caixa e escape. ⚠️ **Unificar MUDA valor observável** — `route` sai `''` na raiz pela `session` e
  `core` pela `tela`. Hoje o campo **não tem nenhum leitor** além de `spatia.session()` (`grep` em
  `src/` devolve 0): a decisão é apagá-lo ou dar-lhe leitor, e ela é de quem opera.
- **T-65** — hoje só o UNIVERSO desenha os quatro tipos. O dado é o mesmo (`/api/vizinhanca`) e o
  desenho é o mesmo (`links.js`); falta decidir se as duas cenas devem afirmar a mesma coisa —
  **isso é produto, não engenharia**.
- **T-66** — as três saídas: aceitar o LOD, subir `OCUPACAO` pagando com os vazios, ou desenhar o
  sistema apertado como agregado e resolvê-lo na aproximação. ⚠️ **Agregar de longe vai na direção
  OPOSTA ao relato do usuário** — é resposta para ESCALA, não para distância.
- **T-67** — com uma foto só, o que resta de parecido entre as estrelas é inerente: `FORCA_DO_MAPA` e
  `uCroma` já estão no limite útil.
- **T-68** — ☠️ **A régua mudou, e para pior.** `CORPO_FS` é meia-lambert puro (`0,10 + 0,90·d²`) e
  **não tem aro nenhum** — o passo 2 CRIA um termo, não afina um. E o único aro desta cena (o `borda`
  do `ESTRELA_FS`) é potente e **mesmo assim não responde o relato**: no enquadramento de casa a
  geometria tem P50 **1,55 px**, então a luz do aro é espalhada pelo bloom em vez de desenhada como
  borda. Vira brilho, não vira forma — e a faixa que ele conserta (8–90 px) tem **0 corpos** ali.
  ⭑ **O sprite é onde os corpos REALMENTE vivem**, e `distancia-e-forma.md` §2.5 mediu que 6 das 8
  feições do sprite rodam sobre fatos que o UNIVERSO já carrega. **Não medido:** quanto disso
  sobrevive ao bloom num disco de 4 px. ⚠️ `aSupernova`/`aDwarf` ficam em zero pelo mesmo motivo.

**Parados por DECISÃO, não por falta de trabalho:** `usage` no brilho (é POPULAÇÃO — sobe sozinha
conforme o `/api/ask` rodar; gerar à mão é o que `--semear` recusa fazer) · `connectivity` no pixel
(o alcance é o número que os arcos já desenham; um canal visual próprio seria segunda codificação do
mesmo fato).

- **T-55** — a bancada é o **storybook** dos objetos 3D: ver, testar, renderizar, depurar e criar
  antes de levar para as cenas. ⚠️ **`V1 GRÃO · V2 ENXAME · V3 PEDREGULHO · V4 LAJE` NÃO são lixo —
  são as quatro candidatas do T-26**, e o T-26 está aberto justamente porque *"a comparação a 25 px
  foi feita a olho, sem timer de GPU"*. **Apagá-las antes de decidir joga fora o experimento**;
  decidir T-26 apaga três sozinho. O resto do inventário (o que não é espécime nem candidata) é
  que sai — e sai com o motivo escrito.
- **T-56** — satélite é objeto CONSTRUÍDO; lua é PARTE NOMEADA de um documento (seção). Dar lua a
  satélite afirma que ele tem partes que orbitam, o que não é fato de nada. ⚠️ Meça de onde vem —
  se `moonsOf` alcança o nó de satélite, o portão é `partsOf`/`MU_MIN`, não o desenho.
- **T-57** — ☠️ **Não é variação visual, é PIPELINE.** `server/dirty.py` emite **três** estados
  (`modified` · `staged` · `untracked`) e **não existe `deleted`** — conferido no fonte. O mapa em
  `catalog.js:416-418` casa cada um com uma família (`saturn` · `uranus` · `jupiter`), e uma
  quarta família sem quem a emita seria **classe sem população**, o defeito que `censo-corpus`
  existe para acusar em vermelho. **Ordem: o servidor emitir `deleted` primeiro; a família depois.**
  ⚠️ E o caso é ontologicamente diferente dos outros três: os três dizem *"existe e divergiu"*; o
  quarto diz *"não existe mais no disco"* — um corpo cujo arquivo sumiu ainda deve ter anel, ou
  deve ter outra coisa? É pergunta de MODELO.
- **T-58** — ☠️ **O deeplink do DIÁRIO funciona** (provado em carga fria: aba do dia ativa, linha
  marcada, detalhe preenchido). Quem não funciona é o **FOCO da cena**: `camera.focus` vive no
  `prefs`, e o `aplicarFocoPendente` restaura o último visitado. **Duas fontes para "que corpo
  olhar", e a gravada vence a pedida** — que é a mesma família do defeito do carimbo de corpus (o
  estado velho vencendo o fato novo). ⚠️ A saída não é apagar a preferência: endereço PEDIDO e
  último visitado são fatos diferentes, e o endereço tem precedência **quando existe**.
- **T-60** — ⚠️ **A queixa já está escrita na própria bancada.** `sandbox/pulsar-rig.js` lista como
  itens de brief ABERTOS: *#3 campo turbulento (o campo magnético é liso demais)*, *#4 feixes como
  volume (hoje são geometria)*, *#5 vento difuso no lugar da agulha*, *#9 halo em quatro camadas*.
  "Luz flat que devia expandir em 360°" é o #4 + #9; "nuvem estática" é o #3. ⚠️ E o watch dela
  avisa: *"a NEBULOSA é a única camada que NÃO respira com o batimento"*.
  ☠️ **Custo medido:** o pulsar já é a pele mais cara do pool — **quadro 5,66 ms · geometria
  1,73 ms**, contra 2,5–3,2 ms sem ele. Ele quase DOBRA o quadro sozinho. Volume e camadas entram
  no bolso caro; **conte `fatias × amostras` antes de empilhar** (o próprio rig avisa).
- **T-61 / T-62** — ⚠️ **Textura fotográfica aqui é decisão de MODELO, não de acabamento.** O mapa
  de `assets/CREDITS.md` separa onde ela acrescenta (asteroide: única classe sem pele) de onde ela
  MENTE (planeta é procedural por decisão; pulsar e buraco negro não têm foto de superfície — o que
  se vê deles é EMISSÃO, que é o que o shader calcula). Para T-62, "poeira e detritos" é **ruído
  volumétrico**, não imagem — e o disco já tem costura provada (`costura-disco.mjs`) que qualquer
  mexida tem de manter.
  ☠️ **E o orçamento não tem folga:** a lente sozinha custa **3,8–5,1 ms** contra 0,31–0,35 ms do
  céu inteiro. *"Não existe otimizar a galáxia"* — o buraco negro é onde o quadro já é gasto.

- **T-54 FECHADO** — era a PARIDADE DE SWAPS, e a causa nomeada em `cena-como-lente.md` §3.1 estava
  certa. `EffectComposer` **pula o passe desabilitado** e **não reinicia o par entre quadros**, então
  desligar a lente no UNIVERSO deixa um único passe que troca e o par inverte a cada quadro; a volta
  ao AGENTE com o par invertido põe a lente escrevendo no alvo cuja `depthTexture` ela amostra —
  feedback loop, preto, sem erro. Conserto: `desenharQuadro` FIXA `readBuffer`/`writeBuffer` antes de
  todo `composer.render()`, e os quatro caminhos de desenho passam por ele. Portão:
  `scripts/lei-paridade.mjs`, que roda o motor de swap VENDORIZADO com passes de mentira em vez de
  transcrevê-lo (6 mutações vistas caindo, cada uma nomeada).
  ⭑ **O A/B na tela, e é ele que fecha a tarefa** — mesma máquina, mesma sequência, `readPixels` de
  256×256 no centro do buffer de 2582×1484: **sem o fixador 4 de 6 idas ao AGENTE voltaram com ZERO
  pixels acesos** (`luz` 0 exato, não "escuro"); **com o fixador, 0 de 6**, entre 11,7 mil e 14,2 mil
  pixels acesos. ☠️ **O discriminante NÃO é a paridade da ida, é o BUFFER:** os 4 pretos saíram todos
  com `leitura: rt1` e os 2 acesos com `rt2` — 6 de 6 de correlação. Contar quadros por ida engana
  porque a paridade ACUMULA entre idas; quem responde é `spatia.cena().composicao`.
  ⚠️ **Renderizar duas vezes na troca continua REFUTADO** — esconde a paridade em vez de removê-la e
  volta no dia em que alguém acrescentar um passe. A §4 do oráculo cobre justamente esse caso: um
  passe que troque inserido ANTES da lente derruba a lei.
  ⚠️ **As outras duas causas de "tela preta" seguem sem oráculo, e não são esta:** a câmera no vazio
  (`HOME.distance` vem do `prefs`) e o laço parado. ☠️ `cena().quadros` **conta só o UNIVERSO** e
  congela no AGENTE — a contagem que atravessa as duas cenas é o `requestAnimationFrame`.

- **T-46 … T-53** — a varredura da interface está em
  [`briefings/hud-e-canvas.md`](./briefings/hud-e-canvas.md), com a conta de cada número.
  ⭑ **T-46 FECHADO: `spatia.hud()` existe** (`src/main.js`, bloco `⟦sonda-hud⟧`; portão
  `scripts/lei-hud.mjs`, 36 leis). A contagem de sondas de `window.spatia` sai de
  `awk '/window.spatia = Object.freeze\(\{/,/^  \}\);/' src/main.js | grep -cE "^    [a-zA-Z]+:"`,
  nunca deste parágrafo.
  ☠️ **A grandeza da sonda é `ponteiro.fracaoReivindicada`** — área
  que aceita ponteiro, não área desenhada. Um retângulo sobre o céu não disputa o clique: ele
  cancela órbita, zoom e pick ali (`space/scene.js`, os cinco ouvintes presos ao canvas).
  `hud/yield.js:6-15` já se enganou uma vez medindo a grandeza errada, e a medida dele (37 de 45
  pontos) é de uma tela **sem painel de palco montado** — por isso a sonda carimba `rota`.
  ⚠️ **A sonda também lê o QUINTO dono do estado de tela:** `espatial.collapsed.v1` decide quais
  painéis têm corpo visível, `core/tela.js` não o conhece, e ele **atravessa a rota** — abrir uma
  seção recolhe e PERSISTE todos os irmãos do trilho (`kernel/widgets.js:63-71`). As três causas de
  *"o painel não apareceu"* saem separadas em `widgets.recolhidos` (o operador fechou),
  `widgets.naoMontados` (o manifesto não pediu) e `widgets.ausentes` (☠️ **declarado e ausente —
  defeito**, que é o T-48).

- **T-48 FECHADO** — o conjunto residente é DADO em `RESIDENTES` (`src/apps/residentes.js`), com a
  frase de por que cada um não pode sair da tela, e `declararApp`/`declararVista` recusam no
  registro a lista que não o traz. `scripts/lei-residentes.mjs` prova por perturbação (9 recusas,
  4 aceites) e varre a fonte: nenhuma rota alcança o `registerApp` do kernel por fora, e o doc
  aponta para a declaração em vez de transcrevê-la.
  ⭑ **A pergunta "qual dos dois estava certo" tem resposta medida:** `#/security` era a única das
  dez sem `timeline` e não havia recusa escrita em lugar nenhum — a declaração estava certa, o
  manifesto é que faltava. `#/security` passou a montar 10 widgets (`left` 2→3).
  ⚠️ **A rota raiz não é app** e um portão montado só no `registerApp` a deixaria de fora — é a
  rota INICIAL. `declararVista(ROUTE_ROOT, …)` é o mesmo portão para ela, e a lei cai se ela voltar
  a ser um literal.
  ⚠️ **Fica aberto, e é MEDIDA e não lei:** `sec-effective` mora em `strip` — a fenda cuja semântica
  declarada é RESIDENTES (`FENDAS.strip`) — e existe em 1 das 10 rotas. Virar lei obrigaria a
  movê-lo, e a régua da faixa (largura inteira, `index.html:707-710`) não é a do trilho de 230 px:
  a decisão muda a tela e tem de ser vista. O censo da lei imprime o caso em amarelo toda vez.

- **T-51 FECHADO** — a regra é **quem PINTA reivindica; quem só POSICIONA cede**, e ela vale para
  qualquer superfície nova sobre o céu. A moldura do painel de palco é `flex: 1` (`.widget-stage`):
  ela **estica pela coluna central inteira** e não pinta nada — `background: none; border: none;
  padding: 0`. Quem pinta é o `.widget-body`, que para no teto de 62vh e na altura do conteúdo.
  Toda a faixa entre os dois era retângulo transparente com `pointer-events: auto` **exatamente
  onde o corpo em foco e o buraco negro são desenhados**. O ponteiro mudou de elemento
  (`index.html`, o bloco `.widget[data-panel-surface]`); o escape do painel VAZIO continua, agora
  no corpo. Portão: `scripts/lei-palco.mjs` (15 leis + censo).
  ⭑ **`pointer-events` não move um pixel** — a moldura ocupa o mesmo espaço, com o mesmo conteúdo,
  no mesmo lugar. Muda só quem recebe o gesto onde não há nada desenhado.
  ⚠️ **O `.scroll` precisava entrar no escape do vazio**, e essa metade faltava desde o conserto
  anterior: `pointer-events` não é herança que descendente respeite — um filho com `auto` volta a
  ser alvo sob ancestral `none`, e `.scroll` declara `auto` por conta própria.
  ⭑ **MEDIDO NAS 10 ROTAS** (fixture, 09/08, aba visível e em foco, `spatia.hud()`):

  | rota | moldura (caixa) | corpo (ao ponteiro) | céu ao canvas |
  |---|---|---|---|
  | raiz · web | não monta palco | — | 89,3% · 87,6% |
  | files · bridge · activity | 9,6% · 10,0% · 7,8% | **0** (painel vazio → escape total) | 85,3% · 76,5% · 85,0% |
  | system | 13,8% | 7,2% | 68,8% |
  | metrics | 13,8% | 6,9% | 78,5% |
  | security | 6,4% | 3,8% | 67,7% |
  | storage | 10,5% | 9,7% | 66,1% |
  | journal | 18,7% | 17,6% | 67,1% |

  ☠️ **A LINHA DA TABELA DIZIA *"ZERO ao ponteiro nas 8 rotas que o montam"*, e isso é FALSO — e
  seria um DEFEITO se fosse verdade.** Zero em toda rota significaria que o `.widget-body`, que
  PINTA, não reivindica nada — o oposto da regra que T-51 implementou. Zero é o caso do painel
  VAZIO, e ele acontece em 3 das 8. Nas outras 5 o corpo reivindica **menos que a moldura**, e a
  diferença é a zona morta devolvida: **6,6 pontos percentuais da janela em `system`**, 6,9 em
  `metrics`, 2,6 em `security`, 0,8 em `storage` e 1,1 em `journal`.
  ⚠️ **`journal` é o piso do ganho** (18,7% → 17,6%): lá o painel é quase todo corpo pintado, então
  quase não havia moldura vazia a devolver. O ganho é grande onde o conteúdo é curto.
  ⭑ `conservacao.bate` verdadeiro e `desconhecidos: 0` nas 10 rotas — nenhum ponto se perde, e não
  há superfície sem dono.
  ⚠️ **Contaminação medida, e ela é do instrumento:** a extensão do navegador que dirigiu a medida
  injeta `#claude-static-chat-button` e `#claude-static-close-button`, que reivindicam **8 pontos
  (0,2% da janela)** e entram em `reivindicado`. Descontá-los é subtrair 0,2 pp de cada linha.
  A grandeza é `spatia.hud().painelDePalco.aoPonteiro / ponteiro.pontos` — que deve cair para a
  fração do CORPO — contra `painelDePalco.fracaoJanela`, que é a caixa da MOLDURA e **não muda**;
  a diferença entre as duas é a zona morta devolvida, e ela reaparece em `ponteiro.fracaoAoCanvas`.
  ⚠️ **E `painelDePalco.aceitaPonteiro` passou a ler a moldura, que agora cede sempre.** Ele lê o
  `pointer-events` do nó `[data-panel-surface]`, então responde `false` com o painel cheio — o que
  é verdade sobre a moldura e mentira sobre o painel. **A medida honesta é `aoPonteiro`**, que
  conta pontos da subárvore inteira. O comentário do bloco `⟦sonda-hud⟧` (`src/main.js`) ainda diz
  que o escape só desarma o painel vazio, e essa frase envelheceu junto.

- **T-52 FECHADO** — a linha some quando um painel **VISÍVEL** já a afirma, e no lugar dela entra
  UMA linha que nomeia o painel e carrega **todos os `[n]` do grupo** como marca clicável. Portão:
  `scripts/lei-referencia.mjs` (28 leis, 8 mutações vistas caindo, cada uma nomeada).
  ☠️ **A linha nunca é APAGADA, só APONTADA.** `[n]` é contrato com o prompt (`EVENTS.md`,
  `agent.py`, `sources_of`) e **o painel não mostra número nenhum**: apagar a linha levando o
  número junto tiraria da tela a única coisa que a lista tinha de exclusiva, e `citeMark`
  desenharia riscada uma fonte real.
  ☠️ **«Montado» não vale por «mostrando».** A conferência é por FONTE, contra o DOM em vigor, e
  falha para o lado seguro em quatro pontos — nó no sótão, painel recolhido, resultado que o painel
  podou (`WEB_LIMIT`, `hud/streams.js`), moldura sem título. **Duas medidas que a varredura do
  briefing não tinha e que mudam a conta:** o painel de web guarda 8 de 18, e na rota raiz os dois
  painéis são irmãos da fenda `right` — o acordeão (`kernel/widgets.js`) recolhe os irmãos ao abrir
  um, então «os dois abertos» é o estado de quem nunca clicou, não o estado normal.
  ⚠️ **A repintura segue a TELA e não o `ui.route`:** o router emite a rota **antes** do
  `host.apply` (que mora no `setTimeout` do voo), e repintar ali leria o mount ANTERIOR. Quem avisa
  são dois `MutationObserver` — moldura entrando/saindo da fenda, e `data-collapsed`.
  ⭑ **O número por rota continua saindo do censo de `node scripts/lei-residentes.mjs` (§5)**, nunca
  deste parágrafo: `memory` 1/10 · `tools` 1/10 · `plan` 1/10 · `web-results` 2/10 contra `answer`
  10/10. **Cortar `MEMORY_LIMIT` segue refutado** — ele alimenta o modelo (`agent.py`), então
  encolheria a RESPOSTA, não a tela.
  ⭑ **A METADE CONSERVADORA ESTÁ FOTOGRAFADA, e é a que falha para o lado seguro** (fixture, 09/08,
  rota raiz, resposta real de 24 fontes): `memory` e `web-results` estavam **RECOLHIDOS** —
  `spatia.hud().widgets.recolhidos` os lista —, e por isso **nenhuma das 24 linhas foi apontada**.
  Painel recolhido não afirma nada, então manter as 24 é o comportamento CERTO, e o ramo que o
  garante está exercido na tela.
  ☠️ **A metade INTERESSANTE segue sem foto:** a linha que some e vira PONTEIRO com os `[n]` do
  grupo dentro. Ela exige um painel de fonte **ABERTO**, e o acordeão não abriu por clique
  programático no cabeçalho — precisa do gesto humano. **O que falta julgar quando abrir:** se a
  linha apontada cabe na régua de `.source` sem quebrar em duas, e se as marcas de um grupo de oito
  não transbordam a terceira coluna do grid.

- **T-47 FECHADO** — `.sources` ganhou `max-height: 20vh`, `overflow-y: auto`, `pointer-events: auto`
  (barra que não se pode agarrar é enfeite — lição 1 do `.surface`) e o scrim em gradiente do
  `.answer`, **sem** `backdrop-filter` (o segundo passe de composição compraria contraste que o
  `text-shadow` do `#hud` já dá). ⚠️ **Fundo opaco continua refutado** por `hud/yield.js:11-15`.
  ☠️ **O teto é da VISTA, nunca da lista** — truncar em JS apagaria o destino de um `[n]` já escrito,
  e a citação passaria a ser desenhada como inventada. As 24 ficam no DOM; o clique em `[n]` rola
  até a linha (`deslocamentoAte`, e **não** `scrollIntoView`, que rolaria o `.widget-body`
  `overflow: hidden`), e o total viaja publicado num cabeçalho grudado — o mesmo desenho do teto de
  28 arcos da rede (`apps/context.js`, `legenda()`).
  ⭑ A conta do teto virou EXATA: `.source` declara `line-height: 1,45` (passo 15,05 px → ~7 linhas
  à vista em 742 px). Sem ele a altura era `normal` e o "≈305 px" da varredura era estimativa.
  Portão: `scripts/lei-fontes.mjs` (25 leis, 13 mutações vistas caindo, cada uma nomeada).
  ⭑ **FOTOGRAFADO** (fixture, 09/08, resposta real com **24 fontes** — 6 de memória, 18 de web):
  vista de **87 px** com passo medido de **13,05 px** (`font-size` 9 px × razão 1,4497) → **6,6
  linhas à vista**, que é o "~7 linhas" da conta. As **24 continuam no DOM**, a lista mede 396 px de
  altura total, `overflow-y: auto` com rolagem de fato, e a barra aparece com `scrollbar-color`
  laranja (`rgb(184,118,58)`). O teto declarado é `max-height: 148,4 px` = 20 vh de 742.

- **T-49 / T-50** — ⭑ **o portão existe:** `VOCABULARIO_DO_WIDGET` e `FENDAS` em
  `kernel/registry.js` nomeiam o que o contrato aceita, o que cada fenda EXIGE declarado e o que ela
  proíbe; `registerWidget` recusa NO REGISTRO e `scripts/lei-catalogo.mjs` prova as duas recusas por
  perturbação (12 mutações vistas caindo, cada uma nomeada).
  ⭑ **As três linhas entraram, e o portão está armado ponta a ponta:** `br-deliveries`
  (`apps/index.js`) declara `surface: true` — é T-50; `answer` (`apps/widgets-core.js`) declara
  `surface: false`, porque a decisão dele é legítima (o palco não leva moldura) e o que faltava era
  DIZÊ-LA; e `listWidget` perdeu o padrão `surface = false`. ☠️ **O padrão era o pior dos três:**
  enquanto ele existia, o invólucro FABRICAVA a decisão e o registro nunca via a ausência — o portão
  em runtime ficava armado sobre um valor que ninguém declarou.
  ⚠️ **A varredura da fonte (§4 da lei) é o que alcança o que o invólucro engole:** `surafce: true`
  num `listWidget({…})` some na desestruturação antes do registro, e só a auditoria da declaração
  acusa. A contagem do dia sai de `node scripts/lei-catalogo.mjs`, nunca deste parágrafo.

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

- **T-39 FECHADO** — a pele do corpo em foco sai de `superficieDe` nas DUAS cenas, e o contexto que
  ela exige (quem DOMINA o sistema) tem um dono só: `src/space/sistemas.js`, puro e sem cena.
  ☠️ **A causa não era a taxonomia velha ser preferida em algum lugar — era a dominância morar
  DENTRO de uma cena.** `universe.load()` a publicava, e a cena AGENTE não tinha como lê-la sem
  inverter a dependência; sem ela, o único caminho até uma pele era `resolveBody`, o `kind` que a
  Fase B refutou. Havia TRÊS derivações da mesma regra (a cena, a transcrição declarada em
  `hud/favoritos-ui.js`, e a reconstrução por `dir` do oráculo) — medidas como idênticas antes de
  fundir: **21 sistemas · 21 dominantes · 72/72 cobertos, 0 exclusivos de cada lado**.
  ⭑ **O que a convergência custou, medido no fixture de 09/08:** `station` **7 → 0** e `nebula`
  **5 → 0** na cena AGENTE — as duas peles saem do céu vivo e seguem na bancada. **As duas ausências
  já estavam declaradas com motivo** em `AUSENTES_NA_TABELA` (`superficies.js`): a estação
  representa um AGENTE, que não é corpo do corpus e não tem produtor que o ponha na topologia; o
  berço da nebulosa exige uma contenção que o corpus não tem. Não mudou a decisão — mudou uma cena
  parar de contradizê-la. Distribuição final (72 corpos): planeta 48 · fotosfera 20 · cometa 2 ·
  pulsar 1 · sem pele 1.
  ☠️ **A LUA quase virou uma regressão de 368 objetos, e o que a pegou foi a TELA.** Ela é seção
  sintetizada em `graph.load`, com `id` derivado do pai (`pai#0`) e **sem `source`** — então não há
  como indexá-la na carga, e `identidadeDe` devolve `null` para ela por construção. A primeira
  versão desta entrega devolvia *"sem pele"* nesse caso.
  ⚠️ **A medida offline que autorizou aquela linha dizia `0 luas`, e era FALSA** — ela replicava
  `moonsOf` com a massa central errada em vez de perguntar à cena. **O boot PUBLICA o número, e ele
  nunca precisou ser reconstruído: `368 em órbita · 277 seções sem espaço`** (`spatia.moons()`).
  ⭑ **A causa raiz era `classificar` classificando por EXCLUSÃO** (`node.type !== 'file'` → estrutura)
  — o defeito que a REGRA DO CATÁLOGO proíbe, e o MESMO tipo de nó que já o pagou no `solver.js`
  (*"uma lua em foco resolvia como GALÁXIA"*). Hoje `TIPOS_DE_NO` nomeia o que a ontologia aceita:
  contêiner (`repo`, `dir`) → ESTRUTURA, folha (`file`, `moon`) → CORPO, e tipo desconhecido cai em
  ESTRUTURA **dizendo que não foi reconhecido**. Provado na página viva: a lua classifica
  `body/lua` e resolve pele `planet` — a mesma que desenhava antes.
  ⭑ **Ganho de quadro que veio junto:** o pool de peles sem foco refazia física, classe, fenômenos e
  pele **por candidato e por quadro**; hoje é consulta a um índice derivado na carga.
  ☠️ **O PAINEL ERA O QUARTO LEITOR DA TAXONOMIA REFUTADA — reportado da tela, com foto.**
  `scene.bodyTypeOf` devolvia `null` fora do UNIVERSO, e `null` ali significa *"pergunte ao catálogo
  antigo"*: `apps/context.js` caía em `morphologyOf(node.kind).body`. **Medido: 35 dos 72 rótulos
  divergiam do que a tela desenhava.** Os dois casos fotografados — `nucleo/bloco-13.md` desenhado
  como FOTOSFERA com o painel dizendo PLANETA (é a estrela DOMINANTE do sistema, 177 chunks), e
  `atlas/scripts/build.sh` desenhado como PLANETA com o painel dizendo COMETA (é `lua`, 7 chunks,
  atividade **zero** — o rótulo vinha de `script → cometa`, que é composição, não estado).
  ⚠️ **É a QUARTA ocorrência desta forma** (o comentário de `superficies.js` registra as três
  anteriores): o painel nomeia por uma derivação e a tela desenha por outra. Hoje `bodyTypeOf`
  responde nas duas cenas, do mesmo índice — **para ARQUIVO**. O AGREGADO segue divergindo de
  propósito: ele é DESENHADO diferente em cada cena (galáxia no AGENTE, sistema no UNIVERSO), e
  igualar o rótulo faria ele mentir sobre o que está na tela.
  ⭑ **PROVADO NA PÁGINA VIVA** (cena AGENTE, fixture, 09/08), e são os dois corpos reportados com
  foto: `nucleo/bloco-13.md` → painel **ESTRELA** · desenho `photosphere`; `atlas/scripts/build.sh`
  → painel **PLANETA** · desenho `planet`. Os dois batem, contra PLANETA/COMETA antes.
  ☠️ **Fica por ver com o OLHO** (a medida acima é do índice, não do pixel): que os 7 corpos que
  desenhavam ESTAÇÃO no AGENTE desenham bem o que a ontologia diz, e que a troca de cena não pisca
  pele. As sondas que enquadram são `spatia.cena()` e `spatia.universo.peles()`.
- **T-69 / T-70** — ☠️ **Duas pontas soltas da convergência, e as duas são "declarado sem leitor".**
  `SURFACE` (`solver.js`) e `SUPERFICIE` (`superficies.js`) são o MESMO vocabulário com dois nomes —
  o segundo já diz por escrito *"os valores têm de bater com `SURFACE`"*, que é uma cópia com
  portão em vez de uma fonte. São **48 sítios** de `SURFACE.` em `src/`, e as chaves divergem
  (`SURFACE` tem `GALAXY`, que a tabela nova não roteia), então não é alias: é decisão de qual
  vocabulário sobrevive. Feito isso, `resolveBody()` para de calcular uma `surface` que **nenhum
  leitor em `src/` consome** — o que sobra dele, e é legítimo, é ANEL · DISCO DE DETRITOS ·
  ENVOLTÓRIO, que a ontologia não produz. ⚠️ A ordem importa: T-69 antes de T-70.

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
  reprovando.
  ⭑ **FOTOGRAFADO** (fixture, 09/08, corpo `nucleo/bloco-04.md` travado, contexto `planetario`):
  os **8 chips cabem em DUAS LINHAS DE QUATRO** dentro do trilho de **255 px medidos**, sem rolagem
  e sem transbordo horizontal; a tela diz *"marca do operador — não é medida, e não decide o que o
  corpo é"* logo abaixo de `VOCÊ MARCOU · operador · data · corpus`; e **`F` marcou o corpo que o
  painel nomeia**.
  ☠️ **A faixa `degradada` não tem OCORRÊNCIA para julgar** — `spatia.favoritos().degradadas` é 0.
  Ela só se fotografa com uma marca cuja classe mudou, e fabricá-la é medir outra coisa.
  ⚠️ **UM SINTOMA VISTO UMA VEZ, e ele não é conclusão:** logo após um clique perdido, o cabeçalho
  do painel nomeava `bloco-04.md · PLANETA · TRAVADO` enquanto a seção FAVORITO ainda desenhava o
  texto do AGREGADO, e o `F` daquele instante marcou um `dir:`. **Reproduzido com eventos de ponteiro
  SINTÉTICOS**, que não são o gesto do operador — então isto é indício, não defeito medido. Se
  confirmar-se com gesto real, é exatamente o que **T-43** prevê: a repintura da seção segue um sinal
  diferente do cabeçalho, e as duas podem discordar por um quadro.
  ⚠️ **Nada da marca alcança o pixel do CÉU** — a escolha é registrada e `emDisco` é `null` porque
  ninguém mediu o disco. Quem transformar `null` em medida é o carregador de textura de T-34, por
  `declararEmDisco()`.
- **T-16** — ☠️ **MODO ASSISTIR COMO MODO ESTÁ REFUTADO POR MEDIDA.** A fila que ele assistiria
  entregou **0 eventos em 301 s** de assinatura real ao `/api/system-events` (`medidas.md`). Uma superfície que assiste ao vazio CRIA a pergunta *"por que não
  acontece nada?"* — o Princípio Final ao contrário — e um terceiro eixo de estado ao lado de
  `view.cinematic` seria o segundo lugar pintando estado, já medido como defeito.
  ⭑ **O que a medida achou no lugar:** a tela afirmava o presente com uma leitura do BOOT. Entregue
  como comportamento de quem já tem dono (`hud/frame.js` + `watchHealth` em `main.js`), sem camada,
  sem cena, sem rota — **`core/tela.js` não é tocado, e `PERMITIDOS` não muda**. 44 leis sem
  navegador em `scripts/lei-afericao.mjs`, 16 mutações vistas reprovando.
  ⭑ **A PRIMEIRA METADE ESTÁ FOTOGRAFADA** (fixture, 09/08): o cabeçalho sai
  `● OCIOSO ● ● ● ● ● HÁ 29S` — a idade em `.svc-afericao`, **8 px medidos no computado**, à direita
  dos cinco pontos, **sem empurrar a faixa central**, e legível na ampliação.
  ☠️ **A segunda metade NÃO TEM OCORRÊNCIA PARA JULGAR, e isso é resultado, não pendência de
  esforço:** os cinco pontos estavam todos acesos (`opacity 1`, `box-shadow` presente nos cinco),
  porque nenhuma leitura estava vencida no instante da medida. O ponto a 45% sem sombra só se julga
  com uma aferição VELHA na tela — e fabricá-la derrubando um subsistema é medir outra coisa.
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

## O que já está PRONTO — confira ANTES de abrir tarefa

> ⚠️ **Os briefings não sabem disto, e é a forma mais cara de desperdício desta base:**
> reimplementar o que já existe com outro nome. Cada linha abaixo foi conferida NO CÓDIGO.

- **O traço de explicabilidade** — que o usuário chamou de *"talvez a feature mais importante"* —
  **está pronto, endereço incluído**: sete eventos do `EVENTS.md` em ledger encadeado por hash, tela
  em `src/apps/journal.js`, e `router.parse()` devolvendo `{app, arg}` com `journal.js:190`
  resolvendo o alvo. Provado em carga fria: aba do dia ativa, linha marcada, detalhe preenchido.
- **`cogload{tokens}` → `blackHole.setLoad`** existe ponta a ponta. O item favorito do autor do
  `black-hole-router` é o mais barato dos dez dele.
- **A soft collision** do `ship-navigator` já tem o fato **e o padrão implementado**:
  `corpoMaisProximo()` devolve `{source, radius, dist}` e o piso do zoom já o consome por quadro.
- **A órbita elíptica** do `orbita-eliptica` está feita e medida: estrela no FOCO, Kepler por Newton
  (**área varrida máx/mín 1,0008**), e excentricidade **derivada da folga da banda**, não escolhida.
- **Os braços da galáxia já são campo de densidade** (Lin–Shu, com órbita kepleriana proibida por
  escrito), a poeira já é extinção, o bojo existe, o jato tem beaming Doppler e o "1 em 10" é
  portão medido em 9,7%. O `quasar-enhance` pede sete coisas e **quatro já existem**.
- **`anexar` já é meia nave**: prende a câmera a um corpo que viaja com ele, e `scene.js` já declara
  por escrito o destino *"uma sonda 3D representando o operador"*.

---

## A POSE da câmera são QUATRO grandezas, e uma delas nem é distância

   `escalaLocal()` (*quão longe está o que eu olho* — quem lê são a escala do pan e a amplitude da
   paralaxe), `porteLocal()` (*que RAIO tem o que está aqui* — quem lê é o piso do zoom), e
   `orbit.distance`/`.targetDistance`, que volta a significar só o raio da órbita (posição da
   câmera, roda, amortecimento, `prefs`, a sonda).
   ⚠️ **A quarta é a distância de CHEGADA e não passa por nenhuma das outras:** ela sai de um alvo
   NOMEADO (o envelope daquele sistema, o raio daquele corpo, `FOCUS_FIT_PX`/`CHEGADA_PX`), nunca de
   "onde eu estou" — forçá-la por `escalaLocal` trocaria o número de todas as chegadas.
   ⚠️ **`prefs` grava `camera.distance` e a chave NÃO é renomeável** — renomear não migra o que já
   está salvo, e a afinação do operador evapora em silêncio.
   ⚠️ **Falta a prova de tela** (T-08), e ela é uma RENOMEAÇÃO: as quatro sondas têm de sair
   idênticas com e sem o diff. **Numa chamada só**, com as duas guardas do §4 abertas e `quadros`
   andando, e sem tocar na câmera entre as duas leituras (a deriva envelhece COORDENADA):
   `spatia.cena('universo')` → congele com um `wheel deltaY:0` → leia
   `{ancora: spatia.universo.ancora(), pixels: spatia.universo.pixels(), sobrep:
   spatia.universo.sobreposicoes(), cena: spatia.cena()}`. Repita com `git stash`. **Esperado:**
   `ancora().distancia`/`alvoDeDistancia` e os percentis de `pixels().geometria` ao dígito, e
   `sobreposicoes()` em **0 pares**. Os três gestos que passam pelas grandezas separadas são a
   RODA (piso), o **SHIFT + arraste** (escala do pan) e o **movimento do ponteiro parado**
   (paralaxe) — o piso do zoom só se prova rodando a roda até o fim e lendo `ancora().distancia`.

⚠️ **`prefs` grava `camera.distance` e a chave NÃO é renomeável** — renomear não migra o
que já está salvo, e a afinação do operador evapora em silêncio.

---

## As decisões de cena já FECHADAS — o mínimo para não reabrir

> Não são refutações (essas estão abaixo) nem tarefas: é como a cena UNIVERSO se comporta HOJE,
> por decisão já tomada. Está aqui porque cada linha destas já foi reaberta por alguém que não
> sabia que havia decisão — e reabrir custa a medida de novo.

- **Câmera em VOO LIVRE** (decisão do usuário: *"não existe centro no universo real"*). A âncora
  translada com **SHIFT + arraste** ou **botão do meio**, só no UNIVERSO e só fora de foco. O
  centroide sobrou como alvo do PRIMEIRO quadro e morre no instante em que o operador voa.
  `spatia.universo.anexar(source)` prende a câmera a um corpo — PoC do operador como objeto.
- **Duas poses, e elas afirmam coisas diferentes:** `irPara` põe **o sistema no quadro**
  (envelope × 2,6); `anexar` põe **um corpo com pele** (`CHEGADA_PX` 135 = 1,5× o piso).
  ⚠️ Amarrar as duas não afina a primeira — transforma-a na segunda em todos os sistemas, e isso
  está **refutado por medida** (§7-B).
- **Pele sem foco é POOL** (`spatia.universo.peles()`), teto 4, `cortadas` publicado. Entram
  fotosfera, planeta, cometa e pulsar. Estação e nebulosa ficam fora — e **não por população**:
  `superficieDe()` não tem ramo que as devolva (`AUSENTES_NA_TABELA` diz o motivo de cada uma).
  ⭑ `ROTAS_DO_POOL` em `scene.js`: pele nova é **uma linha**. É o exemplar desta base para
  "tabela em vez de `if`".
- **A lei do sprite:** `px_sprite = max(px_geometria, PISO)`, `PISO = 4 px` de raio de framebuffer,
  tamanho vindo do **raio já desenhado** — nunca de `chunks` outra vez, que seriam duas leis de
  tamanho para o mesmo fato. ⚠️ `uHaloYield = 1` **aqui** e 0 no AGENTE: em 0 o miolo do sprite é
  esvaziado e sobra o aro, que sobre uma esfera desenhada lê como *"o planeta está transparente"*.
- **A cena é uma TABELA** (`CENAS` em `scene.js`), não um `if`: cada entrada declara `passes`,
  `camadas`, `chegada()` e `aoEntrar()`. ⚠️ `passes` é campo de primeira classe — esconder o GRUPO
  do buraco negro não desliga a LENTE, que deforma o quadro inteiro com o disco invisível.
  ⚠️ A cena não pode declarar o que um corpo É: classe, física e pele saem de `entity-physics.js` e
  `superficies.js`, e nenhuma das duas recebe a cena.
  ⭑ **É invariante PROVADA, não declarada:** `scripts/lei-cena.mjs` audita o vocabulário da
  tabela (chave fora de `id`/`passes`/`camadas`/`chegada`/`aoEntrar` reprova), lê os argumentos de
  todo chamado dos três em `src/`, e perturba cada corpus enfiando a cena por todo canal exposto.
  ⚠️ **`CENAS` não é importável** — é `const` dentro da fábrica, e alcançá-la exigiria WebGL. O
  oráculo RECORTA o bloco do `scene.js` real e o avalia como literal (as arrows não são chamadas),
  então tabela nova entra na varredura sozinha. **Ele não tem tabela de reserva de propósito.**
- **`mesmoQuadro()` é a lei; `skinAB`/`universeAB` só a chamam.** Duas cópias do laço envelheceriam
  em ritmos diferentes, e o laço é justamente o que dá o controle em 0 pixels.

---

## O que está REFUTADO — não reabra sem medida NOVA

> ⚠️ **Refutado não é `archived` por desânimo:** cada linha tem uma MEDIDA por trás, e é ela
> que fica. Reabrir custa uma medida nova que a contradiga — não um argumento.

| proposta | por quê |
|---|---|
| progressive disclosure por ZOOM (2 briefings) | *"a pele não é alcançável por zoom, só por foco"*; `LOD_FAR_PX` menor **refutado por medida** |
| otimizar corpos / LOD por sistema para ganhar quadro | o orçamento está no pós e na lente (céu 0,23 ms × lente 3,8–5,1 ms) |
| sensação de velocidade pelas estrelas (`ship-navigator`) | a casca estelar é raio **150–400 centrada na ORIGEM** e o universo inteiro cabe em **±41,6** — a cena mora dentro do miolo vazio. Voar não aproxima estrela nenhuma |
| `km/s` no HUD | não existe unidade de comprimento, e inventá-la é a FRONTEIRA. A leitura honesta é adimensional (`un/s`, envelopes/s, raios do corpo mais próximo) |
| buraco negro curvando a trajetória da nave | ele está **desligado** no UNIVERSO (`lensing.pass.enabled = !universo`), por decisão de cena E por custo |
| acender pele em tudo por onde a nave passa | cometa 1,23 ms · pulsar **quadro 5,66 ms**. *"Quem subir o teto remede aqui"* |
| excentricidade ou gravidade ∝ importância | `importance` **recusada por escrito**; e `EXCENTRICIDADE_MAX` é TETO, não valor |
| "PRESS ANY KEY TO START" substituindo o boot | o boot atual responde uma pergunta **com duas respostas legítimas** (som), e mostra diagnóstico REAL. *"Uma sequência falsa de SISTEMAS OK ensinaria o operador a não ler a tela"* |
| tirar as "linhas orbitais artificiais" do quasar | diagnóstico errado de objeto: os braços já são densidade; as curvas laranja são os **arcos de vínculo** |
| amarrar a chegada num sistema ao piso da pele | a tangência NUNCA existiu: o maior corpo chega entre **19,8 e 69,9 px** (mediana 48,5) e **0 de 21 sistemas** alcançam o piso de 90. Amarrar não afina `irPara` — transforma-a em `anexar`, e o resto do sistema sai do quadro |
| `rocheLimit(raio)` para apagar o `DENSITY_K` (item 0c) | `rocheLimit(mass)` **já é** `2,44·R`; a constante mora em `physicalRadius`, e o outro raio da cena está na régua do SPRITE, que não é conversível |
| normalizar a massa do pulsar DENTRO da faixa gigante (item 0d) | é a mesma família do defeito — faria o período de um corpo depender de quem mais está no céu, e com população 1 é degenerada |
| a massa mover o `core` do pulsar (T-29) | os 60% da faixa não têm leitor visual (as duas ampliações do miolo saem idênticas) **e** o corpo variável punha o `R_s/R` da lente em 0,640 contra os 0,400 do fato de classe. Subir o ganho até ele agir é pior: a 0,40 de âncora o corpo engole o lobo (87 px contra 89–165) e o `R_s` da lente cresce junto |
| renderizar duas vezes na troca de cena para curar o preto (T-54) | esconde a PARIDADE em vez de removê-la, e ela volta no primeiro passe que alguém acrescentar. O que remove é fixar o par de buffers no começo do quadro, e a conferência é `lei-paridade.mjs` |
| as ZONAS por razão de massa como classificação graduada (T-28) | a terceira zona é vazia por aritmética, a do meio leva **81,8% dos sistemas**, e a cena desenha a mesma imagem nas três. Quem tem leitor é o fato BINÁRIO (`dominanteDe`); a zona exigiria um segundo corpo em 81,8% dos sistemas — pipeline, não limiar |

---

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
| `menu-iniciar.md` | T-14, T-74, T-78 | ⚠️ o `Space` dele COLIDE com a voz (decidido: `Ctrl+K`), e o "Action Ring" é T-78, não T-14 |
| `entrevista-usuario.md` | T-09, T-16, T-07 | ⚠️ as três estão `done` e ele **não morre**: 923 linhas, 15 expectativas, e só três tinham tarefa. Reler para extrair as próximas — **e sem confundir emitir com afirmar** (handoff §7-B) |
| `black-hole-router.md` | — | ⚠️ o item favorito do autor (`cogload` → `setLoad`) **já existe ponta a ponta** |
| `gravidade-entrelacamento.md` | T-12, T-22 | T-12 entregue e T-22 decidida |
| `orbita-eliptica.md` | T-11 | ⚠️ a órbita elíptica **já está feita e medida** (área varrida máx/mín 1,0008) — resta o TRAÇO |
| `quasar-enhance.md` | — | ⚠️ pede sete coisas e **quatro já existem** — conferir antes de implementar |
| `ship-navigator.md` | T-15, T-08, T-17 | ⚠️ cita "arquitetura existente de agentes como drones e naves" e **a arquitetura citada é outro briefing não implementado** |
| `integracao-organica.md` | T-23, **T-79** | ⚠️ T-23 é UMA tabela dele; o corpo é a arquitetura evento→fenômeno, e a PONTE não existe (`grep notice src/space/` = 0) |
| `features-widgets.md` | T-21, **T-76, T-77, T-78** | ⚠️ T-21 era só a §5 dele. ☠️ `capabilities.py` é HOMÔNIMO — permissão, não registry |
| `hud-e-canvas.md` | T-46 … T-53 | ⭑ sonda (T-46), teto com corte publicado (T-47), residentes com portão (T-48), zona morta do palco (T-51) e a referência que aponta em vez de repetir (T-52) estão entregues; faltam T-53 estar decidida, e T-72/T-73/T-75, que ele levanta e o roadmap não cobria |

---

## Onde procurar a HISTÓRIA

O `git log` é a fonte. Estes explicam decisões vivas:

| assunto | commit |
|---|---|
| a órbita vira BANDA DISJUNTA (a lei das luas) e três constantes calibradas caem | `f55013e` |
| a sonda que separa COLISÃO de OCLUSÃO | `b96f576` |
| a PELE volta ao céu decidida pela ontologia nova (início da Fase D) | `25d34d3` |
| o corpus deixa de ter default — fallbacks calados morrem | `01df3e2` |
| P6: as duas relações com SETA | `07f9706` · P7: `4cdc7a4` |
| a coroa do sprite, o teto do driver e o portão `BODY_SPAN` | `efe13fa` |
| o anel deixa de ser classe e vira modificador | `git log --grep=modificador` |
| a segunda lente do buraco negro | `git log --grep=lente` |
