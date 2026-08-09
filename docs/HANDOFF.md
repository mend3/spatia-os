# Handoff — SpatIA · branch `cena-universo`

> **Este arquivo é o PRESENTE. A história vive no `git log`** — os corpos de commit desta base são
> longos de propósito, com a medida que decidiu cada número. Antes de escrever um relato aqui,
> pergunte se ele não pertence à mensagem do commit. **Se o texto começa com "consertei" ou nomeia um
> hash, ele é história — corte.**
>
> **O que fica:** o normativo, o operacional (como medir sem cair nas armadilhas), o que está aberto,
> e os números já medidos que ninguém deveria remedir.
>
> ⭑ **O par deste arquivo é [`roadmap.md`](./roadmap.md), e os dois mudam JUNTOS.** Ele responde
> *"para onde, em que ordem, e o que cada peça destrava"*; este responde *"o que está aberto agora e
> como não cair nas armadilhas"*. **Fechar item aqui obriga a fechar a tarefa lá**, e abrir lá obriga
> a abrir aqui. Divergiram, os dois estão errados — e o sintoma é alguém decidir contra o que o outro
> já mediu.
>
> **Fechar um item é MOVER o resíduo** — a armadilha para o §5, o número para o §6, o resto para o
> corpo do commit — **e apagar o relato.** Item fechado que fica *"pelo valor do sintoma"* é o modo
> de falha característico daqui.
>
> ⚠️ **Tamanho não é a métrica; DUPLICAÇÃO é.** O §6 cresce porque se mediu, e medida com "não
> remeça" ao lado é o arquivo funcionando. Antes de cortar por comprimento, procure **o mesmo fato
> em dois lugares** — foi assim que ele chegou a 1.122 linhas, com uma seção inteira repetindo o
> `roadmap`. Se nada estiver duplicado e ele ainda incomodar, o que falta é **partir o §6**, não
> apagá-lo.

---

## 0. ⚠️ AMBIENTE — confira ANTES de medir qualquer coisa

**Este documento já afirmou o oposto do que o `.env` dizia, por meia sessão.** O arquivo é a verdade;
isto aqui é lembrança. Um censo rodado contra o corpus errado responde com convicção total sobre um
céu que ninguém está vendo.

```bash
grep -E 'AGENT_CWD|QDRANT_COLLECTION|CORPUS_PREFIX' .env    # a verdade
echo $AGENT_CWD                                             # o primeiro diagnóstico de "corpus vazio"
```

☠️ **Três variáveis estão EXPORTADAS no perfil do shell e apontam para lugares que não existem**
(`AGENT_CWD=devshell-one`, `QDRANT_COLLECTION=workspace_embedding`, `CORPUS_PREFIX=vault/`). Elas
vencem o servidor e produzem **zero com cara de medida** — um relatório inteiro certo, menos a
premissa. Os scripts atuais conferem ou ignoram o override; **script novo precisa da mesma guarda.**

⚠️ **`.env` (arquivo) vence o ambiente.** `VAR=x ./serve.py` só funciona se a chave não estiver lá.

| corpus | coleção | `AGENT_CWD` | tamanho | para quê |
|---|---|---|---|---|
| **fixture** *(ativo hoje)* | `espatial_fixture` | `~/workspace/espatial-fixtures` | **72 corpos · 20 sistemas** (09/08) | CAPACIDADE — todos os `kind`, exercita `untracked`/`staged` e as 11 morfologias |
| vivo | `espatial_vivo` | o próprio projeto | 188 corpos · 191 arq | COMPORTAMENTO — o `git status` casa com os nós por construção |
| real | `workspace_embedding` | `~/workspace/devshell` (prefixo `vault/`) | 1.432 arq | ZERO código; e **não tem anel** (os sujos não estão indexados) |

Trocar é `cp .cache/env.<x>.bak .env` **e REINICIAR o servidor**.
☠️ **`env.vivo.bak` e `env.real.bak` NÃO EXISTEM** — esta linha prometeu backup por várias sessões e
`ls .cache/env.*.bak` não casa nada. Existe **`env.fixture.bak`**, escrito em 09/08 antes de uma
troca. Trocar hoje é editar as três chaves à mão (a tabela acima tem os valores) e **guardar o atual
primeiro**. Recriar o fixture:
`FIXTURE_ROOT=~/workspace/espatial-fixtures uv run --with fastembed python scripts/fixture.py`
(⚠️ o `rmtree` continua nas linhas 220 e 409 — passar `FIXTURE_ROOT` explícito é hábito, não paranoia).

⚠️ **A coleção precisa de DOIS vetores nomeados** (denso `fast-<modelo>` + esparso `bm25` com
`modifier: idf`) — declarar só um derruba a busca inteira.

⚠️ **Um corpus jovem esconde toda regra que depende de janela antiga.** O fixture pegou um `if` que
devolvia 188 de 188 no vivo e ZERO nele — por IDADE do repositório, não por atividade. Rode os censos
nos **dois** corpora antes de acreditar em qualquer distribuição.

---

## 1. Rodar e validar

O produto é **SpatIA** (`Espatial OS` está aposentado; o diretório em disco continua `espatial-os` de
propósito). A janela de depuração é **`window.spatia`**.

```bash
cd /Users/victor/workspace/espatial-os && ./serve.py    # 127.0.0.1:8787 · Qdrant 6333 · Neo4j 7474
```

Abra, clique em **IGNORAR** na tela de boot (obrigatório depois de TODO reload, senão ela fica por
cima e as sondas devolvem `null`).

⚠️ **Depois do boot vem a camada `splash`, e ela NÃO bloqueia** (`pointer-events: none`, nenhum
`preventDefault`): as sondas respondem com ela na tela. O que muda é
`spatia.tela().camada === 'splash'` até o primeiro gesto — **e o primeiro gesto a dissolve**, então
uma medida que comece com um clique já entra com `camada: 'mundo'`. Ler a camada antes e depois é
o que distingue "a splash não saiu" de "a sonda leu antes do gesto".

| guarda | quando |
|---|---|
| `node scripts/check-shaders.mjs` | **antes de todo commit** — sai 0 |
| `node scripts/lei-neo4j.mjs` | após tocar em `entity-physics.js` |
| `node scripts/lei-cena.mjs` | após tocar em `scene.js` ou nos módulos puros — prova que a cena é LENTE |
| `node scripts/lei-tela.mjs` | após tocar em `core/tela.js` ou em quem escreve na tela |
| `node scripts/lei-teclado.mjs` | após tocar em `core/keys.js` — nenhuma tecla fica presa |
| `node scripts/lei-notice.mjs` | após tocar em `hud/streams.js` ou no contrato de `notice` |
| `node scripts/lei-favoritos.mjs` | após tocar em `space/favoritos.js` — a marca não vaza para a ontologia |
| `node scripts/lei-teclado.mjs` | após tocar em `core/keys.js` — nenhuma tecla sobrevive a perder o foco |
| `node scripts/lei-cena.mjs` | após tocar em `CENAS`/`aplicarCena`, ou em `entity-physics.js`/`superficies.js` |
| `node scripts/censo-superficies.mjs` | após tocar em roteamento de pele — nenhuma pele pode nascer vazia |
| `node scripts/censo-ontologia.mjs` · `censo-corpus.mjs` · `censo-morfologias.mjs` | ao mexer em classificação, limiar ou constante calibrada |
| `node scripts/censo-planetas.mjs` | quando o céu parecer "todos iguais" |
| `node scripts/campo.mjs` · `costura-disco.mjs` · `lado-distante.mjs` | qualquer edição no buraco negro |
| `node scripts/lente-estelar.mjs` | ao mexer na lente — e **antes de dar lente a qualquer corpo novo** |
| `python3 scripts/motivo-upstream.py` | ao mexer em erro de upstream |
| `python3 -m server.lei_fio` | ao mexer em `brain.py`, `fio.py` ou no portão de capacidades — sobe um CLI de mentira e confere a argv; ☠️ **não toca no diário real, e prova que não tocou** |

⚠️ **Os oráculos TRANSCREVEM o GLSL — a fonte é o shader, a transcrição é cópia.** Mudou um, mude o
outro, ou o oráculo passa a atestar código que não existe. E **`check-shaders` NÃO compila GLSL**:
nome de função errado passa inteiro por ele. Shader novo só se prova abrindo o espécime em
`sandbox.html`.

**Rematerialização — a ordem é obrigatória.** A rede lê o SNAPSHOT, não o banco:

```
citacoes.mjs → vizinhanca.mjs → conectividade.mjs      (+ conceitos.mjs quando a prosa mudar)
```

`.cache/*.json` são fotos; o servidor relê por `mtime` (não precisa reiniciar), mas **rematerializar
exige rodar o script de novo**.

⭑ **`spatia.cena().aneisPose` — a sonda de POSE do anel, e ela é o modelo do que uma sonda deve ser.**
Devolve `{mundo, billboard, deltaCamera, deltaBillboard, camQuat}`. O anel do corpo em foco é objeto
de MUNDO e o resto é billboard; o modo caiu **duas vezes calado** e a única sonda existente
(`aneis`) contou 17 nas duas, porque **contagem não distingue objeto de sinal**.
⚠️ A prova NÃO é `mundo: 1` — é `deltaCamera`, **com o `deltaBillboard` de controle ao lado**: o
billboard copia o quaternion da câmera, então ali o ângulo é constante por construção. Mover a
câmera e ver um andar enquanto o outro fica parado é pose própria; os dois andando juntos seria a
sonda medindo o próprio movimento. Medido em 09/08: câmera girou 0,3212 rad → mundo 1,6668 → 1,7405
(monotônico), billboard 1,2414 → 1,2413 (plano).
⚠️ `camQuat` sai com SEIS casas de propósito — com quatro, o produto escalar de um quaternion com
ELE MESMO já sai < 1 e `2·acos` devolve **0,025 rad para rotação nenhuma**. Uma tabela inteira saiu
com esse piso parecendo medida. **A guarda é comparar a primeira leitura consigo: se não der 0
exato, o resto não vale.**

**Sondas:** `spatia.cena()` · `.tela()` · `.planet()` · `.galaxy()` · `.moons()` · `.lod()` ·
`.renderCost(n)` ·
`.bloom()` · `.core()` · `.session()` · `.state()` · `.universo.{sobreposicoes,entre,pixels}()` ·
`.pele(ajuste)` · `.peleAB(condicoes, ler)` · `.aroAB(condicoes, ler)` (as três últimas são a
bancada dos termos de borda — ver o §4, o A/B no mesmo quadro).
A lista inteira está em `main.js`, no `window.spatia`. **Antes de dizer "não dá para medir", leia lá.**
Traço ao vivo: `localStorage.setItem('espatial.trace','1')`.

---

## 2. As três leis desta base

Escritas pelo usuário. Valem sobre qualquer decisão técnica.

**A REGRA DA FÍSICA** — *Nenhuma decisão de composição pode alterar a simulação. Se um problema pode
ser resolvido fora da simulação, ele deve ser resolvido fora dela.*
Proíbe de imediato: reduzir `R_s` para o buraco negro incomodar menos, enfraquecer a lente de perto,
alterar a geodésica por distância, trocar física por curva artística.
**O corolário vale mais que a regra:** quando a física produz exatamente o fenômeno esperado, o
defeito costuma estar em **linguagem visual**.

**A REGRA DA INSPEÇÃO** — *Todo objeto tem de poder ser rotacionado.*
O padrão que a satisfaz: **em foco vira MUNDO; fora de foco continua billboard.**
Dois modos de falha silenciosos: (1) a malha virou mundo mas o **ÂNGULO** não chegou ao shader — um
uniform servindo a dois donos (tela × física); (2) **objeto com dois modos precisa dos dois na
bancada**, senão o caminho onde o defeito mora não é desenhável.
Ainda violam (auditado, nada consertado): `remnant.js:145`, `nebula.js`, `comet.js:577`,
`pulsar-pulse.js:169`, `bodies.js:236`, `satellites.js:189,263`. ⚠️ Varra o COMPORTAMENTO, não a
string — a galáxia não tinha `quaternion.copy` e era billboard no vértice.

**A REGRA DO CATÁLOGO** — *Nomeie os tipos que a classe ACEITA; nunca exclua os que ela não aceita.
Ponha a proibição em `forbids`.*
Classificar por exclusão (`type !== 'file'`) fazia uma LUA em foco resolver como GALÁXIA.
**E o corolário que esta base já pagou CINCO vezes: declarar uma invariante não a implementa.** A
auditoria que acha isso é barata (varra cada chave declarada e procure um leitor) e vale rodar depois
de toda entrada nova no catálogo, no `tuning.SPEC` ou num vocabulário de métrica.

**A FRONTEIRA FÍSICA × COGNITIVA** — *Nenhuma grandeza física é derivada de uma variável cognitiva
sem uma unidade e uma constante física explicitamente definidas.* Escrita em 08/08.
`EntityPhysics` não tem grandezas SI: `chunks` é contagem de conhecimento, `scale` é degrau,
`activity` é toque em 30 dias. São metáforas — legítimas, e é o que faz a cena significar algo. O que
não pode é uma delas atravessar para onde a matemática precisa ser física, porque o caminho é curto e
calado: `chunks → "massa" → gravidade → órbita → lente`, e no fim ninguém sabe onde a metáfora
terminou.
⭑ **A saída é RAZÃO, não massa:** `alfa = 2·(R_s/R)` e `R_s/R` é ADIMENSIONAL — atravessa qualquer
escala sem `G`, sem `c`, sem quilograma. Basta a razão da CLASSE. O buraco negro é legítimo porque
`R_s` É a propriedade definidora dele; o pulsar porque `0,4` é o fato de uma estrela de nêutrons.
O portão é `scripts/lente-estelar.mjs`. Detalhe e tabela: §11.2 do `replanejamento-celeste.md`.

**As duas leis do Neo4j:** (1) ele muda o **BRILHO, nunca a CLASSE** — se `centrality` decidisse
classe, um container caindo faria corpos trocarem de identidade; (2) ele **nunca está no caminho do
quadro** (materialização → snapshot → servidor anexa → renderer lê pronto). E **`null` ≠ `0`**:
`null` é "não medi", `0` é "medi e é periférico".

**A distinção que vale para toda dimensão nova:** *"a dimensão existe" ≠ "a dimensão tem poder
estatístico para classificar"*. Dimensão presente e fraca vale um número pequeno **com o veredito ao
lado** (`evidenciaDeUso()`), nunca um número que finge.

---

## 3. Onde o modelo mora — normativo

- **[`docs/replanejamento-celeste.md`](../docs/replanejamento-celeste.md)** é a SPEC. A trava do
  cabeçalho: *"não implementar mais nenhuma morfologia até a classificação que decide quando ela
  existe estar correta"* — **leis de LAYOUT e de DADO não são morfologia e podem entrar.**
- **`src/space/entity-physics.js`** — módulo **PURO** (sem `three`): estrutura/corpo/fenômeno.
  ⭑ **`mass` virou `chunks` em 08/08** e `MASSA_REMANESCENTE` virou `CHUNKS_REMANESCENTE`. O campo se
  chamava `mass` e o comentário dizia *"a grandeza que governa ESCALA e gravidade"* — não governa
  gravidade nenhuma. Com `mass` no contrato, `gravity = mass * k` passa em revisão; com `chunks`, ela
  se lê como o absurdo que é. **O nome é o guarda mais barato que existe.**
  ⭑ **FECHADO — o segundo `mass` também caiu.** `planetParams.mass` virou **`chunksNorm`** e
  `MASS_LOG_FULL` virou `CHUNKS_LOG_FULL`. Renomeação pura: os oito guardas saem 0 e o censo repete
  os números ao dígito (ρ −0,927 · −0,982 · 0,914 · 1,000 · mín 0,250 · MED 0,476 · máx 0,934), só o
  rótulo muda. Fotografado depois: `pele: planet` a 134,9 px, mundo liso e azul num corpo de 168
  chunks — que é o que `chunksNorm` alto DEVE produzir (menos relevo, mais mar, mais atmosfera).
  ⚠️ **A §6 do `censo-planetas.mjs` não estava no caminho** — a transcrição GLSL é de
  `amplitude`/`sea`/`sharpness` e nunca leu `mass`. Quem escreveu que ela seria tocada não tinha
  aberto a seção. Os consumidores reais eram três: §4, §7 e o rótulo do `specs.js`.
  ☠️ **E existe um TERCEIRO `mass`, pior que os dois, ainda ABERTO: `orbital-zones.js`.** Lá
  `const mass = node.chunks || 0` alimenta `physicalRadius`, `rocheLimit` e `hillRadius` — nomes que
  **são** físicos, e uma função chamada `rocheLimit` afirma um limite de maré. `DENSITY_K` é
  constante CALIBRADA (e já degradou uma vez: corpus 5,6× maior, **297 luas viraram 0**), não
  constante física com unidade. É exatamente o caminho curto e calado que a FRONTEIRA §11.2 proíbe,
  e é o único dos três que empresta nome de física a metáfora. **Não tocado — é decisão, não
  renomeação:** ou os nomes deixam de ser físicos, ou a razão vira adimensional como no
  `astrofisica.js`.
- **`src/space/astrofisica.js`** — **o único lugar onde a matemática precisa ser física.** Puro, sem
  `three`, com as razões `R_s/R` adimensionais por classe. Dois consumidores: o `corpoDaLente` do
  pulsar em `scene.js` (que era um `0.4` literal) e o oráculo `lente-estelar.mjs`, que IMPORTA em vez
  de transcrever. ⚠️ A POLÍTICA (quem está autorizado a dobrar a luz) fica declarada no oráculo e
  separada das razões — derivada da conta, a conferência viraria tautologia e não pegaria nada.
  **DOMINÂNCIA decide papel, MASSA decide porte** (a dominante é a mais massiva do sistema, o que
  torna "planeta maior que a sua estrela" impossível por construção).
- **`src/space/superficies.js`** — a tabela `classificar() → superfície`. **Pele nova é permitida, mas
  roteada por aqui, NUNCA pelo `kind`.** Ligar pele pelo `solver.js` é o modelo velho falando por
  cima do novo (a taxonomia que a Fase B refutou: 228 de 228 agregados viravam galáxia).
- **[`docs/integracao-neo4j.md`](../docs/integracao-neo4j.md)** — P0–P7 **todos fechados**, sem fase
  aberta.
- **[`docs/distancia-e-forma.md`](../docs/distancia-e-forma.md)** — por que o UNIVERSO morria de longe.
  Diagnóstico medido; passo 1 executado (§6 abaixo).

**Fase D destravada e em curso.** As quatro dimensões do §11 têm dono: `centrality` ✅ · `usage` ✅ ·
`connectivity` ✅ (como **ALCANCE**, porque o grau repetia a centralidade) · `density` **adiada por
escrito** (é bytes por chunk; conserta-se no indexador) · `importance` **recusada por escrito** (é
juízo, não fato).

Outros docs vivos: `catalogo-celeste.md` · `modelo-de-renderizacao.md` · `OS-SCREENS.md` ·
`cobertura.md` · `medicoes-2026-08-07.md`. (⚠️ `docs/proximos-passos.md` era citado pelo handoff
antigo e **não existe** — se ele voltar, é aqui que se anota.)
Bancada: `sandbox.html` — um objeto por vez, sem pós-processamento; todo espécime **importa** o módulo
real, e o campo `watch` nomeia o defeito que ele pega.

---

## 4. Medir na tela — as armadilhas que MENTEM

**⚠️ A aba precisa estar VISÍVEL.** Aba em segundo plano é estrangulada no MOTOR: `rAF` não dispara e
a sonda devolve um quadro velho. **E a sonda congelada é PLAUSÍVEL** — já se leu `raioDaCamera = 33.938`
três vezes seguidas e se foi caçar defeito na câmera; o valor era de um voo antigo.

> **O detector é `spatia.cena().quadros` (ou `.universo.pixels().quadros`) ANDAR entre duas leituras.**
> Se não andou, nenhum número daquela sonda é do presente.

⚠️ **A aba do MCP costuma ser uma aba de FUNDO** — `document.hidden` fica `true` mesmo com o Chrome em
foco, e `renderCost`/`pixels()` devolvem zeros do nascimento. Pior: **cada `Bash` que você roda tira o
foco de novo.** A receita que funciona é agendar a ativação para acontecer **durante** a chamada de
JS, e não antes dela:

```bash
nohup bash -c 'sleep 3; osascript \
  -e "tell application \"Google Chrome\" to activate" \
  -e "tell application \"Google Chrome\" to set active tab index of window 1 to <n>"' >/dev/null 2>&1 &
# e IMEDIATAMENTE a chamada de javascript_tool, que espera o `quadros` andar antes de ler
```

Para achar `<n>`: varra `tabs of window 1` por `URL starts with "http://127.0.0.1:8787"`.

☠️ **O RELÓGIO DA CENA É REFÉM DO FOCO DA JANELA — e esta é a armadilha que mais distorceu 08/08.**
Com `document.hasFocus() === false`, `elapsed`/`delta` **param**, enquanto o `rAF` continua a 120 fps.
Medido: `galaxy().tempo` fixo em `7,8043` por 8 s com os quadros correndo, `document.hidden` FALSO e
`motion.isReduced()` FALSO. Consequência: **tudo que suaviza por tempo congela** — âncora, órbita,
giro do planeta, chegada de foco — e tudo que não depende de tempo continua desenhando normalmente.
> A foto fica perfeita e o movimento não existe. É pior que a aba de fundo, porque lá a sonda devolve
> um quadro velho; aqui ela devolve um quadro NOVO de um mundo parado.
> **Diagnóstico:** `document.hasFocus()` junto de `quadros` andando. Os dois discordando é isto.
> ⚠️ **E são DOIS testes, não um.** `document.hidden` (aba em segundo plano → `rAF` não dispara,
> `quadros` fica em 0) e `document.hasFocus()` (janela atrás → o RELÓGIO congela com os quadros
> correndo). Medir sem checar os dois produziu zeros com cara de defeito de código duas vezes em
> 08/08. **Abra toda medida com as duas guardas e deixe estourar** — é mais barato que o diagnóstico.
> ☠️ **O índice da aba MUDA** (`set active tab index of window 1 to N`): revarra `tabs of window 1`
> por URL antes de ativar, senão você ativa outra aba e acha que o app é que está morto.
> ⭑ **`mesmoQuadro()` é imune** — ele não precisa que o tempo ande, só que a GPU desenhe.

⚠️ **`spatia.galaxy().tempo` não serve de detector de VIDA, mas serve de detector de RELÓGIO.** Ele ficou em `85,4838` em **três chamadas
seguidas** enquanto o trace registrava **120 quadros/s** — congelado de forma perfeitamente
plausível, que é a pior espécie. Detectores que se provaram: `spatia.universo.pixels().quadros`, e
**dois `readPixels` separados por ~400 ms contando pixels diferentes** (deu 37,6% da janela numa cena
viva). Antes de usar uma sonda como prova de vida, prove a SONDA.

⚠️ **O foco por `ui.focus-node` SOLTA sozinho em ~10–20 s** (sai um `[solver]` no log quando cai), e
`#/files/<source>` na rota **não** trava o astro — ela reenquadra e deixa `focado: null`. Toda medida
de foco precisa da sonda lida **ANTES e DEPOIS** do `readPixels`: sem isso mede-se a cena já
desfocada, e o número tem toda a cara de medida. Mordeu uma vez em 08/08.

⚠️ **A/B DE UMA CONDIÇÃO POR QUADRO NÃO FUNCIONA NESTA CENA.** Entre duas amostras a câmera acomoda,
o corpo gira e a paralaxe anda. Medido: **seis réplicas da MESMA condição base** espalharam o limbo
entre **13,6 e 27,0** — mais do que qualquer diferença entre tratamentos. Intercalar não salvou.
> **A saída é `scene.mesmoQuadro()`:** desenhar as condições entre dois `composer.render()` sem
> soltar o quadro. Nada avança entre elas e a única coisa que difere é o uniform — **controle em 0
> pixels**. Sondas: `spatia.peleAB(condicoes, ler)` e `spatia.aroAB(condicoes, ler)`.
> `ler` roda com o desenho ainda no buffer e tem de ser **SÍNCRONA** — um `await` ali devolve o
> quadro ao compositor e a amostra passa a ser de outra coisa.
> ⭑ Como ele não usa `rAF`, **é a única medida desta base que não depende da aba estar visível.**

⚠️ **Um uniform novo que não muda nada pode ser um uniform que não chegou.** O `check-shaders` não
compila GLSL. Antes de concluir "o termo não contribui", **force um valor absurdo**: `borda = 40`
acendeu 636.210 pixels e `−40` derrubou para 6.405 — só depois disso o `1 vs 0` valeu como medida.
E cuidado com a cena FRIA: a primeira leitura do A/B do UNIVERSO saiu com os três desenhos idênticos
byte a byte porque a malha das estrelas ainda não estava montada, 9 s após trocar de cena.

⚠️ **Média radial sobre um crescente parece um aro.** Foi assim que "disco iluminado na borda"
entrou no meu relato — e o corpo estava iluminado **de um lado só**. Decompor em SETORES separa os
dois na hora (máx/mín 23,96× é fase; ~1× seria aro). É a armadilha nº 5 do §5 em forma nova.

**Outras regras da bancada:**

- **A sonda lida na MESMA chamada que emite vem VELHA.** O `emit` do barramento é síncrono, e mesmo
  assim o valor novo só aparece na chamada SEGUINTE. **Emita numa chamada, leia na outra.**
- ☠️ **`universo.pixels().geometria.max` NÃO É A ESTRELA DO SISTEMA EM QUE VOCÊ ESTÁ.** O perfil corre
  sobre TODOS os corpos do céu, então o máximo é de quem estiver mais perto da câmera — e isso muda
  com a **fase da órbita**, sem a câmera sair do lugar: parado no mesmo sistema, à mesma distância,
  ele deu **18,2 px e logo depois 9,2 px**. Um vizinho de passagem lido como "a estrela deste sistema"
  virou uma pendência documentada que sobreviveu a uma sessão inteira (§7.6 de `distancia-e-forma.md`).
  > ⭑ **Para o pixel de um corpo NOMEADO, a régua é `anexar`:** ele publica
  > `alvoDeDistancia = k·raio/CHEGADA_PX`, logo `px(d) = alvoDeDistancia × 135 / d`. **O `k` cancela**
  > — dispensa fov, altura de framebuffer e projeção, que são as três coisas que já divergiram aqui.
  > E `anexar` é SÍNCRONO: os 74 corpos saem numa chamada, sem esperar voo nenhum.
- ☠️ **A CÂMERA DO UNIVERSO ESTÁ EM DERIVA, e ela envelhece COORDENADA — não só valor.** Fora de
  foco e sem gesto, `orbit.targetAzimuth` anda sozinho todo quadro (`DRIFT_BASE × tune.cameraDrift`).
  Consequência medida em 08/08: `geometria.p50` andou **1,68 → 1,52 → 1,45** em três chamadas sem
  ninguém tocar em nada, e um recorte de tela escolhido numa chamada **caiu no vazio** na seguinte —
  a foto sai perfeita, do lugar errado, e nada no retorno acusa.
  > **Congelar é um `wheel` de `deltaY: 0` no canvas:** `Math.sign(0) === 0` deixa `targetDistance`
  > intacto e liga `userControlled`, que é quem desarma a deriva (`scene.js`, o `if (!dragging &&
  > !userControlled)`). `spatia` não expõe isso — `scene.release()` faz o contrário, devolve a deriva.
  > ⚠️ **Congelar a câmera NÃO congela os corpos** (as órbitas correm no `elapsed`). Para pose
  > realmente idêntica, **varredura e recorte saem da MESMA chamada de JS**: entre dois
  > `mesmoQuadro()` seguidos o `rAF` está bloqueado e nem o relógio anda.
- **Não meça no meio do voo.** Foco por console:
  `(await import('/src/core/bus.js')).emit({t:'ui.focus-node', source:'<repo>/<caminho>'})` — espere
  ~8 s. ⚠️ `ui.focus-node` **troca a cena para AGENTE**; volte com `spatia.cena('universo')`.
- **Globais que você escrever em `window` não sobrevivem à chamada seguinte** — monte cada medição
  inteira numa chamada só.
- **⚠️ Não passe de ~40 s num `javascript_tool`** — o CDP corta em 45 s e o retorno vem como *"renderer
  may be frozen"*, que lê como cena travada e não é.
- **FPS NÃO se mede por automação.** Forjar `document.hidden` não desestrangula; bombear quadros passa
  a medir a bomba. **Peça o FPS ao humano** (`scripts/baseline.js` colado no console, janela à frente).
- **O que screenshot NÃO julga:** movimento, transição, e qualquer coisa que dependa de dois instantes.
- **Ler pixels da cena:** `gl.readPixels` dentro de um `rAF` aninhado funciona. ⚠️ Ache o corpo pela
  POSIÇÃO (hover/projeção), nunca pelo pixel mais brilhante — o mais brilhante costuma ser um vizinho.
- **Fontes em disco antes de deduzir:** `~/.opensrc/repos/github.com/` espelha three.js r171 (a versão
  vendorizada), `webgl-noise`, `pmndrs/postprocessing`, `thebookofshaders`. Semântica de API se
  responde grepando ali, não de memória.

---

☠️ **`TOPOLOGIA` DO BOOT NÃO CONTA A MESMA COISA QUE O RESTO DA BASE.** Ele publica o retorno de
`scene.loadGraph`, que soma corpos + LUAS (**460** num corpus de **72 corpos**), com o rótulo
"corpos" — a mesma palavra que `stats.files`, `cena().corpos` e todo censo usam para ARQUIVO.
Mesma palavra, duas grandezas, e a maior aparece na primeira tela que alguém lê.

☠️ **MEDIR SUB-ROTA EXIGE CARGA FRIA.** Trocar só o `location.hash` **não recarrega o documento**, e
o router trata sub-rota **sem remontar** de propósito — o endereço existe para trazer o estado de
volta, e remontar destruiria isso. Quem mudar o hash e ler estará medindo o mount ANTERIOR. Force
documento novo (navegue para outra página e volte). ⚠️ E confira que o id existe como LINHA: o
diário tem registros que não são execução.

☠️ **WIDGET COLAPSADO PARECE WIDGET VAZIO** — só o cabeçalho, sem nem a mensagem de vazio. O estado
está em `localStorage` (`espatial.collapsed.v1`, listas `abertas`/`fechadas`) e é PREFERÊNCIA DO
OPERADOR, não defeito. Confira essa chave antes de acusar a tela de não desenhar.

☠️ **`cena().quadros` CONTA SÓ O UNIVERSO — no AGENTE ele congela.** Usá-lo como prova de vida ao
medir a cena AGENTE devolve "não mudou" com a tela parada, que é a armadilha do §4 com o contador
errado. **A contagem que não pertence a cena nenhuma é o `requestAnimationFrame`**, e é ela que vale
quando a medida atravessa as duas cenas.

---

## 5. Armadilhas de código que falham CALADAS

1. **CRASE dentro de bloco `/* glsl */` fecha o template do JS.** Mordeu **oito** vezes, sempre em
   comentário recém-escrito — inclusive no comentário que documentava a armadilha. E `*/` no meio de um
   comentário de bloco fecha o comentário do GLSL. O sintoma é um `SyntaxError` de JavaScript apontando
   para a primeira palavra depois da crase, e nada liga esse erro a um comentário de GLSL.
2b. ☠️ **TROCAR A FORMA DE UM ITERÁVEL SOME COM FEIÇÃO, e compila.** `cedidos` era um `Set` de
   índices e virou `Map` (índice → `BODY_SPAN × FATOR_NUCLEO`) quando a esfera passou a ceder pelo
   PORTE da pele. Um `[...cedidos][0]` a três arquivos de distância passou a devolver
   **`[chave, valor]`** em vez do índice, e `ring.index === focusedIndex` nunca mais foi verdade:
   **todo anel da cena UNIVERSO caiu no billboard** e parou de ser um objeto de mundo. Relatado da
   tela como *"independente da posição/ângulo da câmera elas sempre estão na mesma posição"* — que é
   o modo de falha nº 1 da REGRA DA INSPEÇÃO (a malha existe, o ÂNGULO não chega). Os oito guardas
   saem 0, o anel desenha com estrutura, cor e família certas, e nada acusa. **Quem trocar Set↔Map
   varre TODO espalhamento e TODA comparação de identidade do símbolo, não só os usos no arquivo.**
2. **`node --check` NÃO pega método ausente.** Um `replace` que não casa a âncora falha em silêncio: a
   CHAMADA entra e o MÉTODO não. **Confira o SÍMBOLO** (`grep -c "nome(" arquivo`), não só que compila.
   ⚠️ E o estrago viaja: o `catch` de `watchDirty` trata qualquer falha como "disco não verificável" e
   chama `forgetDirty()` — um método faltando na cena NOVA apagava os anéis da cena VELHA.
3. **LEIA O LOG DA TELA ANTES DE INSTRUMENTAR.** Três rodadas investigando o anel sumido enquanto o app
   escrevia a causa no stream: *"universe.sujar is not a function · ANÉIS REMOVIDOS"*. **Sondas medem o
   que você lembrou de perguntar; o log diz o que o sistema já sabe.**
4. **Um resto não é diagnóstico.** `total − shown − dropped` juntava três desfechos e chamava todos de
   "fora do índice". O que o cálculo não sabe nomear vira o rótulo de todos.
5. **MEDIR A GRANDEZA ERRADA PARECE MEDIR.** O oráculo do lado distante deu "não comprime" duas vezes
   seguidas, com a marcha perfeita, medindo a grandeza errada nas duas. **Antes de concluir que o efeito
   não existe, pergunte se o número que você lê é o número do efeito.**
6. **`||` e `??` sobre configuração de corpus não falham** — medem o corpus errado com convicção total.
7. **`vertexColors: true` em `InstancedMesh` pinta de PRETO.** Quem colore instância é `instanceColor`, e
   em `ShaderMaterial` o varying tem de ser declarado à mão. A cena inteira nasce invisível, sem console.
8. **Chamada de `update` no bloco errado não avisa.** `NaN` é posição; bloco não executado é ausência.
   **Prove movimento com CONTADOR, nunca com foto** — órbita parada e órbita lenta têm a mesma imagem.
9. **Espaço de coordenadas.** `planetAnchor` devolve MUNDO; o buffer de posições cru é LOCAL; o campo
   `dir` de um nó NÃO reproduz a árvore. Já mordeu duas vezes.
10. **Unidade de pixel:** `canvas.height` (framebuffer), nunca `clientHeight` (CSS). Em DPR 2 a bancada
    dividiu por dois todo número que o shader via.
11. **Campo novo em nó exige `SCHEMA_VERSION`** (`server/graph.py`) — senão a feature nasce morta em
    qualquer clone que já tenha `.cache/graph.json`. ⚠️ **Mas o bump NÃO alcança valor que envelheceu**:
    o fingerprint é do CORPUS, e o snapshot muda sem o corpus mudar. Anotação de snapshot tem de ser
    overlay reaplicado na leitura (`_reanexar_snapshots`), disparado por `mtime`.
12. **Esconder o grupo do buraco negro não o tira da cena** — ele é um PASSE (`lensing.pass`).
13. **O `source` do Qdrant não é o do céu:** ele traz o `CORPUS_PREFIX` e mora em `metadata.source`.
14. **`source` em `opensrc/.env` cria arquivos vazios** no CWD — há um `>` sem aspas na linha 12.
15. **Não edite shader com regex em bloco grande** (já comeu 74 linhas), e afirme a âncora antes de
    substituir.
16. **Um defeito pode estar te mordendo enquanto você o procura.** O arraste-vira-clique pulou o foco
    duas vezes, anotado como "imprecisão da automação", horas antes de o usuário relatar o mesmo defeito.

17. ☠️ **UMA CONSTANTE NOVA NO LUGAR DA CONSTANTE VELHA NÃO É CONSERTO — e a foto não denuncia.**
    O anel saía com a metade próxima cruzando o planeta ACIMA do centro, contra a referência de
    Saturno. A primeira tentativa inverteu o sinal do tombo (`-π/2 + obliquity` → `-π/2 - obliquity`)
    e **a foto ficou certa**. Estava errada: um sinal fixo só acerta na pose em que foi escolhido, e
    a queixa era justamente que a pose não acompanhava a câmera. A causa real era o item 2b, três
    arquivos adiante. **Quando a correção é escolher um valor que faz a foto fechar, pergunte de
    quantos ângulos ela fecha** — foi o usuário quem cortou: *"tem um jeito melhor: fazer com que a
    faixa seja influenciada pelo ângulo da câmera"*.

18. ☠️ **CONSERTAR O SÍMBOLO E MANTER O PROXY — o mesmo defeito volta com outra causa, e a foto é
    idêntica.** O anel de mundo do UNIVERSO caiu DUAS vezes, com a mesma imagem (todo anel em
    billboard) e causas diferentes: primeiro `[...cedidos][0]` devolvendo `[chave, valor]` depois de
    um Set virar Map; depois a guarda `cedidos.size === 1` deixando de significar FOCO quando a
    cessão virou plural — e essa segunda mudança tinha entrado **dois commits antes, no mesmo
    branch**. O primeiro conserto arrumou o espalhamento e manteve o proxy; o proxy é que tinha
    expirado. **Ao consertar um símbolo, pergunte também se o que ele MEDE ainda é o que o nome
    diz** — um proxy expira sem avisar quando a lei que ele resumia muda de forma.
    ⭑ A saída é a mesma de sempre nesta base: o fato passa a ser DECLARADO por quem o conhece
    (`cederParaVarios(entradas, focoSource)`), em vez de inferido de um efeito colateral dele. E o
    que a inferência escondia ganhou sonda (`aneisPose`), porque o defeito sobreviveu duas vezes
    exatamente por não haver quem o medisse.

19. ⚠️ **ARREDONDAMENTO NA SONDA VIRA PISO COM CARA DE MEDIDA.** Detalhado no §1 (`camQuat`): quatro
    casas decimais num quaternion produzem 0,025 rad de "rotação" onde não houve nenhuma, igual em
    todas as amostras. **Toda sonda que devolve número derivado de valor arredondado precisa de uma
    leitura contra SI MESMA valendo zero exato.**

20. ☠️ **ASSINATURA INVENTADA DEVOLVE ZERO COM CARA DE MEDIDA — e reincidiu DUAS VEZES em 09/08.**
    Primeiro `entityPhysics(n, {dominante, sistema: corpos})` fez todo espécime sair `PELE=none`;
    depois `moonsOf(n, chunks, a, M)` devolveu **0 luas em 63 corpos elegíveis** — a assinatura real
    é `moonsOf(node, centralMass, hash)` **e o nó precisa de `node.radius`** (o raio ORBITAL) já
    resolvido. Nas duas o script rodou limpo, sem exceção, e o zero parecia conclusão sobre a cena.
    ⭑ **A guarda é uma linha:** antes de acreditar num zero vindo de módulo importado, abra a
    assinatura. E prefira o call site real (`graph.js:747`) à leitura do JSDoc.
    ⚠️ **Duas armadilhas de bancada junto**, porque as duas fazem o script morrer e não mentir (é o
    caso bom): `import` é **IÇADO**, então o esboço `globalThis.window` só funciona com `await
    import()` dinâmico; e `pulsar-eixo` errou o alvo ao procurar `classe.tipo === 'pulsar'` — a pele
    PULSAR é roteada pelo **fenômeno `colapso`** (`superficies.js:141`), não por tipo de classe.

21. ☠️ **PERCENTIL DE UMA CAUDA ENCOLHE CONFORME O CORPUS CRESCE — o defeito ANTI-ESCALA.** O rig do
    pulsar lia `node.massRank` (posto de `chunks` no céu inteiro) para descrever um corpo que só
    nasce da cauda de cima. Resultado: 16,9% do eixo num corpus de 72, **0,36% num de 276** — os
    mesmos poucos gigantes dividindo um céu maior. ⚠️ **Não confunda com constante degradada**
    (`SPAN`, `DENSITY_K`): aquelas funcionaram e expiraram; esta **nunca varreu nada**, e piora
    sozinha. ⭑ **A guarda:** grandeza que descreve corpo de uma CLASSE tem de ser razão ancorada num
    limiar FIXO (`chunks / GIGANTE`), nunca posto de população. É a forma que a REGRA DA FRONTEIRA
    já abençoa no `R_s/R`. ⚠️ E normalizar *dentro* da classe é a mesma família de erro — com
    população 1 ela é degenerada de saída.
    ⭑ **`min`/`max` da amostra são a mesma doença com outro nome**, e ela reincidiu na `forca` do
    vínculo: `(v − min)/(max − min)` manda o mais fraco para `0` — que aqui significa *"medi e não
    há"* — e faz o mesmo par valer coisas diferentes conforme o céu. **Escala de saída se ancora na
    UNIDADE** (contagem: `v/(v+1)`, razão ao quantum de um evento; cosseno: identidade, que já é
    [0,1]), nunca nos extremos observados. Números em §6.

22. ☠️ **CARIMBO AUSENTE NÃO É CARIMBO NEUTRO.** O `annotate_*` servia snapshot de outro corpus
    porque não havia campo dizendo de qual céu ele era — e a tentação, ao acrescentar o campo, é
    tolerar quem não o tem "para não quebrar". Tolerar reproduz o defeito: sem carimbo é exatamente
    o estado que estava errado. **Recuse, e ponha o comando do conserto dentro do motivo.**

23. ☠️ **TECLA PRESSIONADA SEM `blur` FICA PRESA PARA SEMPRE — e o único sintoma é o movimento que
    não para.** O `keyup` da tecla que estava no dedo quando a janela perdeu o foco é entregue a
    **quem recebeu o foco**, não à página; ninguém o vê. O ⌘ do macOS produz o mesmo estado sem
    trocar de janela: enquanto ele está embaixo o navegador **não entrega o `keyup` das outras
    teclas**, então ⌘S deixa o `S` pressionado depois que os dois sobem. ⭑ A saída é esvaziar o
    estado INTEIRO em `blur`, em `visibilitychange` oculto e na subida do ⌘ — soltar tecla por
    tecla exige justamente o evento que não vem. Portão: `scripts/lei-teclado.mjs`.

24. ☠️ **O `session_id` DO CLI NÃO MUDA ENTRE EXECUÇÕES DE UM MESMO FIO — e tudo que for contado
    por ele deixa de ser por execução.** Com `--resume`, os turnos 1 e 10 declaram o mesmo
    `session_id` (só `--fork-session` o troca). O portão de capacidades contava `calls_per_run` por
    ele: um teto de 3 leituras viraria 3 para a conversa INTEIRA, e depois disso o portão negaria
    tudo — enquanto `release()`, que recebia a chave da execução, nunca casava e deixava `_calls`
    crescendo para sempre. ⭑ **A saída é o servidor CARIMBAR a chave**: `capabilities.settings_file`
    escreve o `run` literal dentro do `jq` da `--settings` efêmera, que é escrita uma vez por
    execução. Quem sabe onde uma execução começa é quem a começa, não o CLI.
    ⚠️ **A família é maior que este caso:** antes de contar, limitar ou expirar qualquer coisa por
    um id que veio do CLI, pergunte se ele muda na frequência que você supõe. Portão:
    `python3 -m server.lei_fio`, lei 3.

**E a régua desta base:** quando o usuário descreve um sintoma, **a descrição dele geralmente já é o
diagnóstico**. Meça o que ele apontou antes de propor hipótese própria — e quando uma medida sua
contradisser a foto dele, a medida costuma estar na régua errada.

---

## 6. Números já medidos — NÃO remeça

**A retomada do agente (CLI `claude` 2.1.226, 09/08) — a incógnita do T-10, medida à mão:**
`--resume <uuid>` **convive com a `--settings` efêmera do portão**. As duas entram no mesmo comando,
o hook `PreToolUse` roda na execução retomada e uma negação continua chegando como `tool_result` de
erro com o motivo do portão. Retomar não é porta lateral: a settings é por EXECUÇÃO, não por sessão.

| fato | medido |
|---|---|
| `session_id` ao longo do fio | **o mesmo nos 3 turnos** (ver armadilha 24) |
| sessão que o CLI não conhece | sai **1**, `result/error_during_execution`, `num_turns: 0`, **sem `init`** |
| `--resume` com valor não-UUID e sem título | recusado antes de rodar |
| `cache_read` por turno do mesmo fio | 40.056 → 53.745 → 57.167 (a transcrição volta, o cache a absorve) |
| custo dos 3 turnos (`claude-haiku-4-5`) | 0,0335 → 0,0132 → 0,0105 USD |

⚠️ **O custo de continuar CRESCE com o fio** — é `cache_read`, não `input`, e por isso é barato, não
grátis. Fio longo é decisão de quem opera; `POST /api/thread` corta.

**Céu (corpus vivo, 08/08):** 188 corpos · 203 nós · uma estrela por sistema.
`CO_EDITED` 897 pares (85,1%) · `SIMILAR_TO` 1.504 (**k=8 derivado** — k=5 deixa 10,6% de isolados,
acima do corte de 10%) · `REFERENCES` 452 (88,8%) · `IMPORTS` 313 (59,6%) · `ABOUT` 100 conceitos /
130 arestas (**só 16 ligam dois corpos**) · `TOUCHED` 0 (as execuções antigas citam o corpus morto) ·
Spearman(grau, pagerank) 0,898.

⚠️ **`k` e Gini são propriedades DAQUELE corpus e não transferem.** O critério que decide é a cobertura.
⚠️ **`ABOUT` é a única dimensão que não é FATO** — toda aresta carrega `modelo` e `as_of`, e o painel
escreve *"inferido por qwen3:8b — não é medida"*. Apagar tudo o que veio de inferência é uma consulta só.

**`connectivity` é ALCANCE**, não grau: o grau repetia a centralidade (ρ 0,821). O alcance dá ρ −0,083
com centralidade, 0,040 com massa, 0,130 com atividade — mede a parte da relação que a POSIÇÃO não
comunica. **As candidatas recusadas estão gravadas no snapshot com o ρ de cada uma**, para ninguém
remedir. Confesso: ρ −0,623 com o TAMANHO do sistema (é razão, não sabe volume).

**Rede da seleção:** 4.226 vínculos · grau MED 26 · P90 56 · máx 182 · **teto 28 arcos** · 42% truncados
(o corte é publicado). `TOUCHED` fica fora porque liga `Run → Astro` e as duas pontas não são corpos.

**A FORÇA do vínculo é da UNIDADE, e o piso do tipo NUNCA vale zero** (09/08, `vizinhanca.mjs`).
Contagem sai `v/(v+1)` (1 → **0,500**, 4 → 0,800, 21 → 0,955); cosseno sai identidade. O que a
normalização por extremos observados produziria, medido nos dois corpora — é por isso que ela está
refutada (armadilha 21):

| corpus · tipo | n | bruto | `min`–`max` → em zero | unidade → em zero |
|---|---|---|---|---|
| fixture · `CO_EDITED` | 416 | 1–4 | **386 (92,8%)** | 0 |
| vivo · `CO_EDITED` | 1.794 | 1–21 | 1.338 (74,6%) | 0 |
| vivo · `REFERENCES` | 904 | 1–4 | 840 (92,9%) | 0 |
| vivo · `IMPORTS` | 626 | 1–2 | ☠️ **624 (99,7%)** | 0 |
| vivo · `SIMILAR_TO` | 3.008 | 0,508–0,975 | 2 (0,1%) | 0 |

⚠️ **O fixture tem UM tipo só** (`CO_EDITED`, três valores distintos): ele prova o piso e não julga
codificação visual de quatro tipos. ⭑ **As arestas dos dois corpora convivem no Neo4j com
`r.corpus`**, então a distribuição do vivo se mede **sem trocar o `.env`** — só o `/api/graph` é
que precisa da troca.

**Geometria da cena UNIVERSO:** bandas orbitais disjuntas — **0 sobreposições em 17.578 pares**, medido
12×. Folga mínima entre bandas 0,1999 un (2× o raio do corpo). ⚠️ **Aumentar o corpo ou baixar a
excentricidade NÃO aumenta a folga** — a excursão da elipse absorve o que o corpo não usa.
⚠️ **COLISÃO e OCLUSÃO dão a MESMA imagem** nesta cena (sem sombra projetada): use `sobreposicoes()`.

**Custo (fixture, buffer 2582×1484, DPR 2, fov 80):**

| cena | geometria | pós | quadro | fração do pós |
|---|---|---|---|---|
| UNIVERSO | **0,23 ms** | 2,3–2,6 ms | ~2,5 ms | **~90%** |
| AGENTE | 1,95 ms | 1,42 ms | 3,37 ms | 42% |

**Não existe "otimizar o céu" — o orçamento está todo no pós e na lente** (a lente sozinha custa
3,8–5,1 ms contra 0,31–0,35 ms do céu inteiro com 213 instâncias). Qualquer proposta que economize
corpos economiza de um bolso com 0,23 ms dentro.

**Distância × pixel (fixture, enquadramento de casa a 150 un)** — de `distancia-e-forma.md`:
49,7 de 71 corpos abaixo de 4 px de raio, **0 de 71** acima de 22 px (o menor `LOD_FAR_PX` da base),
maior corpo da tela 17,1 px. **A pele não é alcançável por zoom, só por foco.** Baixar `LOD_FAR_PX`
está **refutado por medida** — não existe valor que faça pele aparecer a distância; só alarga a bolha
do foco.

**Os dois termos de borda da pele do planeta (AGENTE), A/B no MESMO quadro, 08/08.** Controle
(mesma condição desenhada duas vezes) = **0 pixels de diferença**, exato — é ele que torna o resto
atribuível.

| condição | miolo (<0,30 R) | meio (0,30–0,70) | limbo (0,85–0,98) | fora (≥1,05) |
|---|---|---|---|---|
| base (1/1) | 8,75 | 14,96 | **52,03** | 9,71 |
| sem limbo | 8,94 | 15,12 | 49,80 | 10,38 |
| sem casca | 8,75 | 14,96 | 52,03 | **3,91** |
| **ambos 0** | 8,94 | 15,12 | **49,80** | 4,56 |

- **Nenhum dos dois autora a leitura de "transparente":** com os dois em zero o limbo cai só **4,3%**
  e o miolo sobe 2%. O que resta é a FASE (o crescente, §7 item 1).
- **A casca age quase toda FORA da silhueta** — `fora` cai 60%, e dentro do disco ela não muda um
  pixel. A afirmação que já estava escrita no `SHELL_FRAGMENT` (*"só a coroa fora da silhueta
  acende; a parte de dentro é ocluída pelo teste de profundidade"*) está **medida**.
- O limbo (fresnel²) toca **10,6×** mais pixels que a casca, com amplitude pequena — e ele é um
  `mix` para a cor do ar, então **pode escurecer** (clareia ~1% no miolo).

**O aro da ESTRELA na cena UNIVERSO (`borda` do `ESTRELA_FS`), mesmo quadro, 08/08:** +25,9% de luz
total, +85% de pixels acesos, 128.279 pixels alterados. **Tamanhos na mesma leitura** (`quadros`
2.211): geometria P50 **1,55 px** · P75 4,62 · máx **11,49** · 51 de 71 abaixo do piso · **0 acima de
22 px**; sprite mín 4 · P50 4 (o piso funcionando). São ~639 pixels acesos por corpo para corpos de
1,55 px de raio: **a diferença é bloom, não borda.**

**Lente gravitacional — NÃO remeça, e NÃO implemente** (08/08, `scripts/lente-estelar.mjs`):
estrela tipo Sol deflete **0,0075 px** no limbo (1,75″, o valor de Eddington em 1919), **133× abaixo**
do piso de um pixel; o anel de Einstein dela só sai de dentro do próprio disco a **1,18e5 raios**
(as 548 UA da lente solar) contra os ~6,5 em que a câmera fica. Anã branca: 0,52 px — também não.
Pulsar 707 px e buraco negro 1.770 px, que é por que esses dois têm lente. **O corte é
`R_s/R ≥ 5,65e-4`.** A ausência de distorção quando um planeta passa atrás de uma estrela é o
comportamento CERTO.

**O PISO DO SPRITE é o TETO DE UM PLANALTO, não um ponto de gosto** (varrido de 2 a 10 px em passos
de 0,5, no mesmo quadro, em quatro poses): de **2,5 a 4,0 px** o piso não custa um corpo sequer, e
logo depois vem um despenhadeiro — 4,5 trava 9 dos 22 corpos que ainda têm tamanho próprio, 5,0
trava 17, 5,5 trava 21, 7,5 trava todos. **`PISO_SPRITE_PX = 4`**, e o intervalo antigo (3–8) está
refutado na ponta de cima: a mentira sobre tamanho não começa quando o sprite fica grande, começa
quando ele fica **IGUAL**, e isso é em 5 px. ⚠️ 52 de 74 estão abaixo de 2,5 px em TODA pose — isso
é da DISTÂNCIA, não do piso, e é a população que a camada de sprite existe para resgatar.

**A ESFERA CEDE PELO PORTE DA PELE** — `cedidos` é Map índice → `BODY_SPAN[pele] × FATOR_NUCLEO`.
`FATOR_NUCLEO` (0,98) só serve a quem tem `BODY_SPAN` = 1, e encolher 2% deixava a esfera opaca por
cima de quatro peles das seis:

| pele | `BODY_SPAN` | esfera ÷ corpo, ANTES |
|---|---|---|
| fotosfera · planeta | 1,00 | 0,98 — correto |
| estação | 0,92 | **1,07 — a esfera vazava para FORA do corpo** |
| cometa | 0,30 | **3,27×** |
| pulsar | 0,16 | **6,13×** (o que o usuário fotografou) |
| nebulosa | 0 | bola opaca dentro de algo que não tem corpo |

⚠️ **A lição operacional:** o cometa foi declarado *"desenhado a 130 px"* pela sonda `peles()` e
estava com uma bola de 3× o núcleo dentro. **`desenhadas: N` prova que a pele recebeu quadro, não
que a imagem está certa.**

**Custo das peles do pool** (fixture, `focado: null`): céu sem pele 0,19–0,26 ms de geometria · uma
fotosfera de 91 px +0,02 ms · **cometa + fotosfera juntos 1,23 ms** · ☠️ **pulsar: quadro 5,66 ms e
geometria 1,73 ms**, contra 2,5–3,2 ms sem ele — **ele quase dobra o quadro sozinho**. É este número
que justifica o teto de 4 ser publicado; **quem subir o teto remede aqui.**

⭑ **O eixo do pulsar é o RITMO, e só ele** (09/08): `massa 0` → período **0,90 s**; `massa 1` →
**4,20 s** — numa janela de 4 s, **4,44 contra 0,95 pulsos** (batimento varrido em nove instantes).
Ritmo não aparece em quadro congelado. **O `core` é CONSTANTE (0,16)**, e o `CORE_GAIN` que o movia
está refutado: as ampliações do miolo nos dois extremos saíam idênticas (feixe, halo e glow dominam
o disco), e o corpo variável punha o `R_s/R` da lente em **0,640** contra os **0,400** que
`astrofisica.js` declara — variável cognitiva movendo razão de CLASSE. Números da faixa, para não
remedir: âncora **216,7 px** na chegada (`FOCUS_FIT_PX/SKIN_EXTENT`, fb 1484 · fov 80), corpo
**21,7 → 34,7 px** de raio na varredura inteira, halos **39→62** e **61→97 px**; e **81,9% do
fixture satura em massa 0**, com só 11 dos 72 no interior da faixa.

**O PULSAR — o eixo do rig** (09/08, e o defeito era ANTI-ESCALA: percentil de cauda encolhe conforme
a população cresce):

| corpus | corpos | pulsares | `massRank` deles | fatia do eixo |
|---|---|---|---|---|
| `espatial_fixture` | 72 | 1 | 0,9014 | — (n=1) |
| gigantes do fixture | 72 | 3 | 0,831 – 1,000 | 16,9% |
| `workspace_embedding` | 276 | 2 | **0,9964 – 1,0000** | ☠️ **0,36%** |

Depois de trocar o posto pela razão ao limiar (`log2(chunks/80)`), A/B nos mesmos corpos com controle
em **0 exato**: amplitude do eixo **0,0036 → 0,6090 (169×)**, amplitude do `period` **0,012 s →
2,010 s**. ⚠️ **Ainda não fotografado** — o que muda na tela é `core` (0,154 → 0,135) e o ritmo.

**As LUAS, nos dois corpora (09/08):** `a_corte` 23,9 (fixture) e 26,3 (real) contra o raio orbital
máximo **62** · **0 janelas fechadas** nos dois · 63 e 163 corpos com lua · `slack` MED 1,871 e 1,582.
⚠️ Como a janela nunca fecha, **`MU_MIN = 5` é o ÚNICO portão da faixa**: 63 dos 72 do fixture passam
por ele e os 9 recusados (12,5%) não são recusados em mais lugar nenhum.

**AS ZONAS POR RAZÃO DE MASSA, medidas pela definição da tabela** (fixture 09/08, `μ` = maior massa
sobre a segunda, por sistema, 22 sistemas): *família colisional* (`μ ≪ 1`) **vazia por aritmética**
(`μ ≥ 1` sempre) · *sistema duplo* (`1 ≤ μ < 5`) **18 (81,8%)** · *primária* (`μ ≥ 5`) 4, dos quais
2 são de um corpo só. μ finito: mín 1,00 · MED 1,56 · máx 24,00, com 4 empates exatos em 1,00.
⚠️ **A cena desenha uma estrela por sistema nos 22** — a zona graduada não muda um pixel, e o `μ`
do `orbital-zones.js` (nº de seções) **não é o mesmo `μ`**.

**Teto de driver:** `ALIASED_POINT_SIZE_RANGE = [1, 511]` nesta máquina. O teto é verdade sobre PIXEL e
mentira sobre GEOMETRIA — derivar tamanho de mundo do valor com teto trava o corpo em 153,3 px para
sempre.

**Populações da Fase D — ⚠️ o fixture MUDOU em 09/08** (`varredura/pulsar/` saiu; ver 0d):
fixture de hoje é **72 corpos · 2 514 pontos · 20 nós `dir`**, com
**21 fotosfera · 47 planeta · 2 cometa · 1 pulsar · 1 sem pele**.
Vivo 17 · 151 · 9 · 11. Corpus real: fotosfera 665 · estação 456 · planeta 360 · galáxia 223 ·
cometa 99 · nebulosa 40 · **pulsar 0** (só se julga na bancada ou no fixture).
⚠️ Os números antigos do fixture (71 ou 74 corpos, 22 fotosferas, 44 planetas) aparecem em medidas
mais velhas deste documento e **são daquele corpus** — a FORMA das conclusões sobrevive, a
magnitude não. Quem reconferir uma tabela antiga confere contra 74, não contra 72.

---

## 7. O estado agora, e o que está aberto

**Branch `cena-universo`** — sem push, não mesclada.
⚠️ **Commit exige REVIEW antes** — e review aqui é rodar os oráculos e **provar por mutação** que
eles reprovam. Oráculo que nunca foi visto falhando não é guarda: é teste verde.
⚠️ **Commite por ARQUIVO, nunca por diretório**, quando houver outra sessão escrevendo — `git add
docs/` já varreu trabalho alheio para dentro de um commit uma vez.

**Working tree LIMPO.** O que está aberto vive no [`roadmap.md`](./roadmap.md), não aqui —
tabela de arquivo em voo envelhece a cada commit e vira a primeira linha errada que alguém lê.

**Não rastreados e NÃO são meus:** `docs/briefings/ship-navigator.md`, `src/.DS_Store`.

### Como a cena UNIVERSO se comporta hoje — o mínimo para não reabrir decisão fechada

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

### O que está aberto, em ordem de valor

0b. ⚠️ **UM DIRETÓRIO SEM AGREGADO É UM SISTEMA?** Não é desempate (esse foi unificado em
   `dominanteDe`): é AGRUPAMENTO. O censo monta um sistema por `dir` DISTINTO; a cena monta sistema
   só onde existe nó AGREGADO no grafo. **A resposta muda a contagem de estrelas do céu:** ou o
   servidor emite os agregados que faltam (e a cena ganha dois sistemas), ou o censo agrupa errado.
   Pergunta de MODELO, não de transcrição. Enunciada por SISTEMA, nunca por fotosfera (o `colapso/`
   é dominante e desenha PULSAR, então a contagem de pele sai −1 e confunde):

   | | fixture de 09/08 |
   |---|---|
   | `dir` distintos com corpo (o que o censo agrupa) | **22** |
   | nós `dir` no grafo (o que a cena monta) | **20** |
   | diferença | **2**, e são exatamente `atlas/.claude/agents` e `atlas/.claude/skills` |

   Os dois têm **um arquivo cada** e nenhum agregado — o censo promove o solitário a dominante do
   próprio sistema, a cena não. A medida é uma linha: comparar `{n.dir}` dos `type === 'file'`
   contra `{n.dir}` dos `type === 'dir'` em `/api/graph`.
   ⚠️ **Repare que os dois são `.claude/`**: um diretório de UM arquivo de configuração é um sistema
   estelar ou é ruído de layout? É a mesma pergunta do item 6, pelo outro lado.

0c. ⚠️ **RISCO DE EXPIRAÇÃO, não defeito vivo — e a saída que estava escrita aqui NÃO funciona.**
   `physicalRadius(mass) = DENSITY_K · ∛mass` converte contagem de conhecimento em COMPRIMENTO, e
   `DENSITY_K` já degradou uma vez (corpus 5,6× maior, **297 luas viraram 0**). Medido em 09/08 nos
   dois corpora: `a_corte` **23,9** (fixture) e **26,3** (real) contra o raio orbital máximo **62** —
   **zero janelas fechadas**, 63 e 163 corpos com lua. Volta a morder quando `M_total` crescer ~13×.
   ☠️ **A saída proposta era falsa:** `rocheLimit(mass)` **já É** `2,44·R`. `DENSITY_K` mora em
   `physicalRadius`, não nele, e o único outro raio da cena está na régua do SPRITE — que o cabeçalho
   de `orbital-zones.js` abre avisando que **não é conversível** com a da mecânica.
   ⭑ **A expiração, escrita como conta:** `slack = a_pai / (2,44 · DENSITY_K · ∛(3M))`. `inner`
   escala com `DENSITY_K` e `outer` (Hill) **não** — é essa assimetria que fecha a janela. Consertar
   exige quebrar a dependência de `M_total`, e isso é pergunta de MODELO.
   ⭑ `hillRadius` está ABSOLVIDO: `∛(m/3M)` é razão de massas, adimensional — o mesmo argumento que
   salva o `R_s/R`.

0e. ⚠️ **DUAS VERDADES SOBRE A MESMA ROTA, e a segunda não tem leitor.** `core/tela.js` guarda a
   rota que o kernel resolveu (`ui.route`, um decodificador só); `core/session.js` continua lendo o
   hash CRU (`(location.hash||'').replace(/^#\/?/,'')`). **Divergem em 7 de 12 endereços**, medido
   recortando os dois decodificadores do próprio código: sub-rota (`#/journal/<run-id>` → `journal`
   contra `journal/run-…`), app inexistente (`#/bogus` → `core` contra `bogus`), caixa (`#/FILES`) e
   escape (`%20` decodificado contra cru). ⚠️ **Unificar MUDA valor observável** — `route` da
   `session` sai `''` na raiz e `core` pela `tela`, e é o que `spatia.session()` mostra. Hoje o
   campo **não tem nenhum leitor** além dessa sonda (`grep` em `src/`): a decisão é apagá-lo da
   `session` ou dar-lhe um leitor, e ela é de quem opera, não de quem mede.

0f. ☠️ **O §8 do `lei-tela.mjs` é uma LISTA BRANCA DE QUATRO ARQUIVOS, não uma varredura** — e
   `src/hud/splash.js` agora escreve na tela sem que ele saiba. Ele confere
   `['src/main.js','src/hud/boot.js','src/core/session.js','src/kernel/router.js']` e exige que só
   os dois primeiros importem `core/tela.js`: **qualquer arquivo fora da lista escreve à vontade e
   o oráculo sai 0.** É a forma exata de invariante que esta base já pagou cinco vezes — declarada,
   e não implementada. **O conserto é trocar a lista por uma varredura de `src/` inteiro** com a
   permissão nomeada (`main.js`, `hud/boot.js`, `hud/splash.js`), e ele mora em `scripts/`.

1. **DECISÃO DO USUÁRIO — de onde vem a luz de um corpo em FOCO.** O "planeta transparente" da cena
   AGENTE está **medido, e não é defeito de código**: o corpo em foco está iluminado por trás, e o
   que se vê é um **CRESCENTE**. Medido em 08/08 (A/B no mesmo quadro, controle em **0 pixels**):
   o limbo por setor varia **23,96×** entre o lado aceso e o apagado, e desligar os dois termos de
   atmosfera deixa em 24,53× — inalterado. Não é aro; é fase.
   ⚠️ **A suspeita antiga está REFUTADA** (o sprite esvaziando o miolo com `uHaloYield = 0`): no raio
   onde o núcleo do sprite teria PICO (`d ≈ 0,35`) o perfil tem um **mínimo local**, e luz aditiva não
   produz mínimo. A corona sai junto — ela é multiplicada por `vIgnition`, que só acende por evento de
   busca, e em repouso vale zero.
   Vale o **corolário da REGRA DA FÍSICA**: a física produziu o fenômeno esperado, então o que sobra é
   **linguagem visual**. Mudar a direção da luz conserta a leitura **e muda a composição da cena que o
   usuário chama de "mais bonita"** — não mexa sem ele.
2. **Passo 2 de `distancia-e-forma.md` (§4c) — a régua MUDOU, e para pior.** Medido em 08/08:
   `CORPO_FS` é **meia-lambert puro** (`0,10 + 0,90·d²`) e **não tem aro nenhum** — o passo 2 **cria**
   um termo, não afina um. Medindo o único aro que esta cena tem (o `borda` do `ESTRELA_FS`) no mesmo
   quadro: ele move **+25,9% da luz total** e **+85% dos pixels acesos** (128.279 pixels mudam, máx
   557 de 765 num canal). É potente — **e mesmo assim não responde o relato**: no enquadramento de
   casa a geometria tem **P50 1,55 px e máx 11,49 px**, então a luz do aro é **espalhada pelo bloom**
   em vez de desenhada como borda. Vira brilho, não vira forma. E a faixa que ele conserta (8–90 px)
   tem **0 corpos** nesse enquadramento.
   Continua barato; deixou de ser "a outra metade do relato". ⚠️ A metade dele que ainda age onde os
   corpos vivem é a **emissão/feição no SPRITE** (4 px), não o aro no corpo — ver o item 4.
3. **Passo 3 — refazer a tabela de distância × pixel contra o CORPUS REAL** antes de congelar o
   `PISO`. Mais sistemas no mesmo `OCUPACAO` dão envelopes menores, e a borda do planalto anda com a
   pose (3 px a 260 un · 4 a 150 e 116 · 4,5 a 58): a FORMA da conclusão sobrevive, a magnitude não.
   O planalto já está medido — ver §6.
4. **O `brilho` não entra no sprite**, e é decisão: exigiria atributo novo no shader compartilhado, o
   que mexe na superfície do AGENTE. O brilho empata em 72% do céu de qualquer jeito (5 valores
   distintos em 71 corpos, 51 no mesmo número) — **é ralo por natureza num corpus real**, e a saída é
   devolver a diferença à FORMA, não inventar um terceiro termo a partir da massa (que já governa a
   escala). `aSupernova`/`aDwarf` ficam em zero pelo mesmo motivo: são o passo 2.
   ⚠️ **O sprite é onde os corpos REALMENTE vivem** (geometria P50 1,55 px), então feição no SPRITE
   age onde há pixel e aro no corpo age numa faixa vazia — `distancia-e-forma.md` §2.5 mediu que 6
   das 8 feições do sprite rodam sobre fatos que o UNIVERSO já carrega. **Não medido:** quanto disso
   sobrevive ao bloom num disco de 4 px.
5. **Levar a rede à cena AGENTE.** Hoje só o UNIVERSO desenha os quatro tipos. O dado é o mesmo
   (`/api/vizinhanca`) e o desenho é o mesmo (`links.js`) — falta decidir se as duas cenas devem afirmar
   a mesma coisa, e **isso é produto, não engenharia**.
6. **O sistema apertado:** 38 arquivos numa pasta dão planetas de 0,10 unidade. As três saídas: aceitar
   o LOD, subir `OCUPACAO` pagando com os vazios, ou desenhar o sistema apertado como agregado e
   resolvê-lo na aproximação. ⚠️ **Agregar de longe vai na direção OPOSTA ao relato do usuário** — é
   resposta para ESCALA, não para distância.
7. **Uma segunda textura de estrela** (K/M, fria), escolhida pela temperatura. Com uma foto só, o que
   resta de parecido entre as estrelas é inerente — `FORCA_DO_MAPA` e `uCroma` já estão no limite útil.

**Parados por decisão, não por falta de trabalho:** `usage` no brilho (é POPULAÇÃO — sobe sozinha
conforme o `/api/ask` rodar; gerar à mão é o que `--semear` recusa fazer) · `connectivity` no pixel (o
alcance é o número do que os arcos já desenham; um canal visual próprio seria segunda codificação do
mesmo fato).

---

---

## 7-B. O que quatro leituras dos briefings acharam, e o código confirmou

Quatro subagentes leram `docs/briefings/` inteiro contra o código, nos moldes do §9 do
`replanejamento-celeste.md`. **O relatório completo morreu com eles; o que fica é o que decide.**

⚠️ **Leia isto antes de abrir qualquer briefing:** os quatro chegaram, sem se falar, ao MESMO
diagnóstico que o §9.2 já tinha registrado uma vez — **os briefings acertam a ESTRUTURA e erram as
FOLHAS**, e sempre pelo mesmo mecanismo: onde nomeiam uma RELAÇÃO, acertam (e às vezes descrevem
algo que já existe com outro nome); onde nomeiam um FATO DE MUNDO, descrevem um corpus que não
existe. **O padrão é tão estável que serve de triagem: leia cada linha perguntando se ela nomeia
relação ou fato.**

### O que os quatro descobriram junto, e é a conclusão que reordena tudo

**O gargalo não é desenho. São TRÊS AUSÊNCIAS DE DONO, e nenhuma é shader.**

1. **Ninguém tem o direito de emitir sem o operador perguntar.** `/api/system-events` é SSE vivo, o
   cliente despeja no barramento e a cena já desenha — e do outro lado da fila há **um único
   produtor** (`webhooks.subscribe()`). Não há cron, scheduler nem daemon; as únicas threads são
   `embed-warm` e `graph-refresh`, e a segunda recarrega topologia **em silêncio**. Metade da
   `entrevista-usuario.md` (universo vivo, modo assistir, a Regra dos Cinco Minutos) não está
   bloqueada por render: está bloqueada por isso. **O tubo está montado e vazio.**
⭑ **A segunda e a terceira caíram.** O estado de TELA tem dono único em `src/core/tela.js` —
camada (pilha declarada), cena e rota num objeto só, lido por `spatia.tela()`. E a cena é `CENAS`
em `scene.js`, com `scripts/lei-cena.mjs` provando que ela não decide o que um corpo é. Resta a de
cima e a de baixo.

3. **A POSE da câmera são QUATRO grandezas, e uma delas nem é distância.** Nomeadas em `scene.js`:
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

### O que já está PRONTO e nenhum briefing sabe

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

### As decisões do usuário, e a ORDEM

Estão em [`roadmap.md`](./roadmap.md) — tarefas com `blocked_by: decisão do usuário`, e a ordem com
o critério dela. ⚠️ **Duas cópias divergiriam**, e a que alguém lesse primeiro decidiria por acaso.

### O que está REFUTADO — não reabra sem medida nova

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
| as ZONAS por razão de massa como classificação graduada (T-28) | a terceira zona é vazia por aritmética, a do meio leva **81,8% dos sistemas**, e a cena desenha a mesma imagem nas três. Quem tem leitor é o fato BINÁRIO (`dominanteDe`); a zona exigiria um segundo corpo em 81,8% dos sistemas — pipeline, não limiar |

## 8. Onde procurar a história

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
