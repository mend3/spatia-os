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
| **T-46** | **A sonda da HUD** (`spatia.hud()`) — quanto da janela a interface reivindica ao PONTEIRO, por rota, e o que está recolhido | `done` | — | T-51, T-52 | KR2.1 |
| **T-47** | A lista de fontes tem TETO de vista, rolagem, scrim e o **total publicado** — as 24 continuam no DOM | `done` | — | — | KR2.1 |
| **T-48** | O conjunto residente é DECLARADO **e imposto** — `RESIDENTES` + `declararApp`, e `#/security` monta `timeline` | `done` | — | T-52 | KR2.1 |
| **T-49** | `registerWidget` aceita chave fora do vocabulário — a REGRA DO CATÁLOGO sem portão | `doing` | — | T-50 | — |
| **T-50** | `br-deliveries` é widget de palco **sem `surface: true`** — o disco atravessa o texto | `todo` | T-49 | — | — |
| **T-51** | O painel de palco cria ZONA MORTA sobre o corpo em foco — **quem PINTA reivindica, quem só POSICIONA cede** | `done` | T-46 | — | KR2.1 |
| **T-52** | A linha de referência sai quando um painel VISÍVEL já a afirma — e vira PONTEIRO, com o `[n]` dentro | `done` | — | — | KR2.1 |
| **T-53** | O que sobe para o MUNDO — `space/bodies.js` está pronto e desmontado | `blocked` | decisão do usuário | — | — |
| **T-54** | ☠️ **A cena AGENTE volta PRETA ao voltar do UNIVERSO** — o suspeito é a PARIDADE DE SWAPS | `todo` | — | — | KR2.3 |
| **T-55** | Enxugar a BANCADA — ela é o storybook dos objetos 3D, e tem espécimes depreciados | `blocked` | T-26 | — | — |
| **T-56** | Satélites estão com LUAS — não existe e não faz sentido | `todo` | — | — | — |
| **T-57** | Falta a família de anel para arquivo EXCLUÍDO (`D`) — ⚠️ o servidor nem emite esse estado | `todo` | — | — | KR3.1 |
| **T-58** | ☠️ **Deeplink de FOCO não funciona** — o `prefs` vence o endereço | `todo` | — | — | KR4.1 |
| **T-59** | Melhorar o visual do QUASAR (`briefings/quasar-enhance.md`) | `todo` | — | — | — |
| **T-60** | Melhorar o visual do PULSAR — luz FLAT (devia expandir em 360°) e nuvem estática | `todo` | — | — | — |
| **T-61** | Texturas: asteroide, cometa, anel — pedregulho, poeira, colisão eventual | `todo` | T-34 | — | — |
| **T-62** | Camada externa do BURACO NEGRO — poeira, detritos, profundidade e volume | `todo` | — | — | — |

### `postponed` e `archived` ficam escritos — apagá-los faz a próxima sessão reabrir

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

- **T-54** — relato do usuário: *"algumas vezes, ao voltar da cena universo para agente, a cena
  agente volta toda preta, forçando trocar as cenas até que ela renderize normalmente ou F5"*.
  ⚠️ **INTERMITENTE**, e isso é parte do fato: um conserto que funciona uma vez não prova nada aqui.

  ☠️ **O suspeito já está nomeado nesta base, e é o único que explica a intermitência.**
  `cena-como-lente.md` §3.1 escreve: *"a cadeia de passes tem PARIDADE DE SWAPS
  (`RenderPass → lensing → UnrealBloom → OutputPass`). Acrescentar ou remover um passe inverte para
  qual buffer a profundidade é gravada, e a lente passa a ler um buffer vazio, EM SILÊNCIO."*

  E é exatamente isso que a troca de cena faz: `CENAS.agente.passes.lensing = true` ·
  `CENAS.universo.passes.lensing = false` (`scene.js`, tabela `CENAS`). **Passe desabilitado é
  PULADO pelo composer**, então ligar e desligar muda a contagem de swaps. A profundidade é ligada
  UMA VEZ a `composer.renderTarget2` (`scene.js:567`) — se a paridade inverter, ela passa a ser
  gravada no outro alvo e a lente lê vazio.

  ⚠️ **Antes de consertar, DISTINGA três causas** — "toda preta" é o sintoma de todas:
  1. paridade de swaps (a hipótese acima);
  2. a câmera apontando para o vazio — `HOME.distance` vem do `prefs`, e a volta ao AGENTE
     restaura a pose do operador, que pode estar longe de tudo;
  3. o laço de quadro parado. ⚠️ `cena().quadros` **conta só o UNIVERSO** e congela no AGENTE —
     usá-lo aqui devolve "não mudou" com a tela viva. A contagem que não pertence a cena nenhuma é
     o `requestAnimationFrame`.

  ☠️ **A saída fácil é a errada:** renderizar duas vezes na troca ESCONDE a paridade em vez de
  corrigi-la, e ela volta no dia em que alguém acrescentar um passe. O briefing já diz o desfecho
  certo: *"isso precisa de guarda automática, não de memória"* — a paridade tem de ser CONFERIDA,
  e `scripts/leis.mjs` é onde a conferência passa a viver.

  ⚠️ E há um agravante para quem for medir: `spatia.renderCost()` e as sondas leem o quadro que
  está na tela. Um quadro preto com `renderCost` normal aponta para buffer errado; um quadro preto
  com custo perto de zero aponta para o laço parado. **São diagnósticos diferentes.**

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
  ☠️ **FICA POR PROVAR NA TELA** (esta sessão não abriu navegador): quanto de céu voltou, por rota.
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
  ☠️ **Fica por PROVAR na tela** (esta sessão não abriu navegador): que a linha apontada caiba na
  régua de `.source` sem quebrar em duas, que as marcas `.cite` de um grupo de oito não transbordem
  a terceira coluna do grid, e quanto a lista de fato encolhe por rota. `spatia.hud().fontes` e
  `.fendas[].alturaPx` respondem as três.

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
  ⚠️ **Por provar na tela** (a sessão que entregou não abriu navegador): as 7 linhas cabendo, a
  barra aparecendo com `scrollbar-color`, e `.answer` 36 vh + `.sources` 20 vh + meta dentro da
  altura do palco. `spatia.hud().fontes` e `.fendas[].alturaPx` respondem.

- **T-49 / T-50** — ⭑ **o portão existe:** `VOCABULARIO_DO_WIDGET` e `FENDAS` em
  `kernel/registry.js` nomeiam o que o contrato aceita, o que cada fenda EXIGE declarado e o que ela
  proíbe; `registerWidget` recusa NO REGISTRO e `scripts/lei-catalogo.mjs` prova as duas recusas por
  perturbação (12 mutações vistas caindo, cada uma nomeada).
  ☠️ **Faltam TRÊS linhas, e enquanto elas não entrarem a lei sai 1 e o boot morre em
  `registerApps()`** — todas em território que T-49 não podia tocar:
  1. `apps/index.js:1161` (`br-deliveries`) → `surface: true,` — é T-50.
  2. `apps/widgets-core.js:67` (`answer`) → `surface: false,`. **`br-deliveries` NÃO era o único
     widget de palco sem `surface`**: o `answer` também não declara, e a decisão dele é legítima
     (o palco não leva moldura) — o que faltava era DIZÊ-LA.
  3. `apps/widgets-core.js:79` → tirar o padrão `surface = false` de `listWidget`. Enquanto ele
     existir, o invólucro FABRICA a decisão e o registro nunca vê a ausência — o portão em runtime
     fica armado sobre um valor que ninguém declarou.
  ⚠️ **A varredura da fonte (§4 da lei) é o que alcança o que o invólucro engole:** `surafce: true`
  num `listWidget({…})` some na desestruturação antes do registro, e só a auditoria da declaração
  acusa. Contagem de hoje, do `node scripts/lei-catalogo.mjs`: **46 declarações · 44 passam · 9 no
  palco**.

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
| `hud-e-canvas.md` | T-46 … T-53 | ⭑ sonda (T-46), teto com corte publicado (T-47), residentes com portão (T-48), zona morta do palco (T-51) e a referência que aponta em vez de repetir (T-52) estão entregues; faltam T-49/T-50 e T-53 estar decidida |
