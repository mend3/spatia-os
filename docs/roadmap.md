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

⚠️ **`blocked` por decisão do usuário não é `blocked` por engenharia.** As três decisões do §7-B são
do usuário por natureza — nenhum agente deve "destravá-las" resolvendo sozinho.

---

## Os objetivos

### O1 — O universo está VIVO sem o operador perguntar

> Princípio 6 e a Regra dos Cinco Minutos. **Não está bloqueado por render: está bloqueado por não
> haver quem emita.** `/api/system-events` é SSE vivo, o cliente despeja no barramento, a cena já
> desenha — e do outro lado da fila há **um único produtor** (`webhooks.subscribe()`). O tubo está
> montado e vazio.

| KR | medida | hoje |
|---|---|---|
| KR1.1 | existe produtor ambiental emitindo **sem pergunta do operador** | ✗ 1 produtor, reativo |
| KR1.2 | `notice` carrega `severity` e a tela distingue ruído de aviso | ✗ |
| KR1.3 | cinco minutos parado produzem evento legítimo (não sintético) | ✗ |

### O2 — Todo estado tem UM dono

> As três ausências de dono que quatro leituras independentes acharam. Nenhuma é shader, e cada uma
> multiplica o custo de toda cena nova.

| KR | medida | hoje |
|---|---|---|
| KR2.1 | **estado de tela** tem dono único | ✗ **quatro** donos que não se conhecem (`#boot`, `modo`, `router.current`, `session.js`) |
| KR2.2 | **pose da câmera** tem nome próprio | ⚠️ `escalaLocal()`/`porteLocal()` separados em `scene.js` — **sem prova de tela** |
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
| KR4.2 | a segunda pergunta do operador sabe da primeira, **ou a tela diz que não** | ✗ (viola o princípio 10) |

---

## As tarefas

⚠️ **A ordem não é valor puro: é destravar o maior número de briefings por peça**, e não construir
tela que assista ao vazio — Modo Assistir antes do produtor **cria** a pergunta *"por que não
acontece nada?"*, que é o Princípio Final ao contrário.

| id | tarefa | status | blocked_by | blocks | OKR |
|---|---|---|---|---|---|
| **T-01** | Portão de corpus nos cinco overlays + carimbo nos scripts | `done` | — | T-12 | KR3.1 |
| **T-02** | Eixo do pulsar ancorado no limiar (`GIGANTE`) | `done` | — | — | KR3.2 |
| **T-03** | Foto do pulsar na bancada | `done` | — | — | KR3.2 |
| **T-04** | `SceneDefinition` extraída de `setMode`, **sem mudar um número** | `done` | — | T-05, T-06, T-08 | KR2.3 |
| **T-05** | `lei-cena.mjs` — o oráculo que prova que a cena é LENTE | `done` | — | — | KR2.4 |
| **T-06** | `src/core/tela.js` — dono único do estado de tela | `todo` | — | T-13, T-14 | KR2.1 |
| **T-07** | Sub-rota endereçável (`#/journal/<run-id>`) | `done` | — | — | KR4.1 |
| **T-08** | Pose da câmera com nome próprio (`escalaLocal`) | `doing` | — | T-15 | KR2.2 |
| **T-09** | `notice` com `severity` + produtor ambiental — **juntos, nunca separados** | `todo` | — | T-16 | KR1.1, KR1.2 |
| **T-10** | `--resume` no `brain.py` | `todo` | — | — | KR4.2 |
| **T-11** | Traçar a elipse dos planetas (cópia de `moon-orbits.js`) | `todo` | — | — | — |
| **T-12** | Força do vínculo no arco | `blocked` | substrato | — | — |
| **T-30** | `forca` sai da UNIDADE do tipo, não dos extremos da amostra | `done` | — | T-12 | KR3.1 |
| **T-13** | Splash | `blocked` | T-06 | — | KR2.1 |
| **T-14** | Launcher / menu iniciar | `blocked` | T-06 | — | KR2.1 |
| **T-15** | Voo básico (o começo do `ship-navigator`) | `blocked` | T-08 | — | — |
| **T-16** | Modo Assistir | `blocked` | T-09 | — | KR1.3 |
| **T-17** | `keyup` + `blur` no teclado — `keys.isHeld` e a lei da tecla que não fica presa | `done` | — | T-15 | — |
| **T-18** | Um diretório sem agregado é um sistema? (handoff 0b) | `todo` | — | — | — |
| **T-19** | Quebrar a dependência de `M_total` nas luas (handoff 0c) | `postponed` | — | — | — |
| **T-20** | De onde vem a luz de um corpo em foco | `blocked` | decisão do usuário | — | — |
| **T-21** | Marketplace × a postura de segurança escrita | `blocked` | decisão do usuário | — | — |
| **T-22** | Gravidade cognitiva (uso movendo órbita) | `blocked` | decisão do usuário | — | — |
| **T-23** | Agente como corpo (a ESTAÇÃO) | `blocked` | decisão do usuário | — | — |
| **T-24** | Passo 3 — distância × pixel contra o corpus real | `todo` | — | — | — |
| **T-25** | Licença de `assets/textures/sun.jpg` | `todo` | — | publicação | — |
| **T-26** | Granulação do anel — escolher entre `GRAIN`/`SWARM`/`BOULDER`/`SLAB` | `todo` | — | — | — |
| **T-27** | i18n | `postponed` | — | — | — |
| **T-28** | Zonas por razão de massa — declaradas, sem leitor | `todo` | — | — | KR3.3 |
| **T-29** | `core` do pulsar é PARÂMETRO SEM LEITOR — medido em T-03 | `todo` | — | — | KR3.3 |

### `postponed` e `archived` ficam escritos — apagá-los faz a próxima sessão reabrir

- **T-12** — a `forca` já é da UNIDADE do tipo (`ESCALAS` em `vizinhanca.mjs`): contagem por
  `v/(v+1)`, cosseno pela identidade. O que falta é **substrato**: o fixture tem UM tipo só
  (`CO_EDITED`, 1 a 4 commits, três valores distintos), e julgar a codificação visual de quatro
  tipos sobre um deles é julgar um tipo. Os quatro só convivem no corpus VIVO.
  ☠️ **`(valor − min)/(max − min)` está REFUTADO, não substituído por gosto** — normalizar pelos
  extremos observados manda o mais fraco para `0`, e `0` aqui é *"medi e não há"*: **92,8% dos
  vínculos do fixture** e **312 de 313 `IMPORTS` do vivo (99,7%)** sairiam afirmando ausência sobre
  vínculo que existe. E `min`/`max` são amostra: os mesmos 3 commits davam **0,667** num céu de máx
  4 e **0,100** num de máx 21 — a força de um par dependendo de quem mais está no céu.

- **T-29** — a bancada mostra que varrer a massa de 0 a 1 muda `core` de **0,100 para 0,160** e
  as duas ampliações do miolo saem **idênticas**: o brilho e os feixes dominam o disco. Quem carrega
  o eixo é o `period` (**0,90 s → 4,20 s**, 4,44 contra 0,95 pulsos numa janela de 4 s). ⚠️ Ou
  `CORE_GAIN` age em faixa visível, ou ele é invariante sem leitor — o alvo da REGRA DO CATÁLOGO.

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
- **T-28** — a fronteira já trabalha (`μ ≥ 5` separa lua de sistema duplo), mas a zona é **só
  declarada** em `src/space/catalog.js`. ⚠️ Implementar é decidir **o que ela muda na imagem**: se
  não muda nada, é invariante sem leitor — o defeito que a REGRA DO CATÁLOGO existe para impedir.

### As três decisões que são do usuário

Elas não são `blocked` por engenharia e **nenhum agente deve resolvê-las sozinho**:

1. **T-21 · Marketplace × segurança.** `OS-SCREENS.md` recusou por escrito (*"instalar app de
   terceiro nisso é entregar a máquina"*) e o `/api/health` confirma a premissa. É binário.
2. **T-22 · Gravidade cognitiva.** Colide com a 1ª lei do Neo4j, com a FRONTEIRA, e com as **0
   sobreposições em 17.578 pares** que uma coordenada nova pode destruir.
3. **T-23 · Agente como corpo.** É **pipeline novo, não limiar** — e há recusa por escrito em
   `modelo-de-renderizacao.md:462`: *"estação orbital, não nave"*.

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
| `entrevista-usuario.md` | T-09, T-16, T-07 | o produtor ambiental emitir e o Modo Assistir ler |
| `black-hole-router.md` | — | ⚠️ o item favorito do autor (`cogload` → `setLoad`) **já existe ponta a ponta** |
| `gravidade-entrelacamento.md` | T-12, T-22 | T-12 entregue e T-22 decidida |
| `orbita-eliptica.md` | T-11 | ⚠️ a órbita elíptica **já está feita e medida** (área varrida máx/mín 1,0008) — resta o TRAÇO |
| `quasar-enhance.md` | — | ⚠️ pede sete coisas e **quatro já existem** — conferir antes de implementar |
| `ship-navigator.md` | T-15, T-08, T-17 | ⚠️ cita "arquitetura existente de agentes como drones e naves" e **a arquitetura citada é outro briefing não implementado** |
| `integracao-organica.md` | T-23 | decisão do usuário |
| `features-widgets.md` | T-21 | decisão do usuário |
