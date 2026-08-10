# Armadilhas — o que MENTE ao medir, e o que falha CALADO

> **Este arquivo é DURÁVEL, não é estado.** Nada aqui envelhece com o working tree: são os modos de
> falha que já custaram sessão nesta base, escritos no imperativo. O que está aberto AGORA vive em
> [`roadmap.md`](./roadmap.md); o ambiente de medida, em [`HANDOFF.md`](./HANDOFF.md).
>
> ⚠️ **Entrada nova aqui é paga com uma sessão.** Não escreva armadilha hipotética — se ninguém foi
> mordido, é conselho, e conselho mora no comentário do módulo. E toda entrada diz **como
> DIAGNOSTICAR**, não só que existe: uma armadilha sem detector é uma história.
>
> ⭑ **A régua que vale para as duas metades:** quando o usuário descreve um sintoma, a descrição
> dele geralmente já é o diagnóstico. Meça o que ele apontou antes de propor hipótese própria — e
> quando uma medida sua contradisser a foto dele, a medida costuma estar na régua errada.

## A. Medir na TELA — as armadilhas que mentem

⚠️ **Depois do boot vem a camada `splash`, e ela NÃO bloqueia** (`pointer-events: none`, nenhum
`preventDefault`): as sondas respondem com ela na tela. O que muda é
`spatia.tela().camada === 'splash'` até o primeiro gesto — **e o primeiro gesto a dissolve**, então
uma medida que comece com um clique já entra com `camada: 'mundo'`. Ler a camada antes e depois é
o que distingue "a splash não saiu" de "a sonda leu antes do gesto".

⭑ **`spatia.cena().composicao` separa as TRÊS causas de "a tela está preta"**, que a foto não separa:
ela diz em que alvo a cena grava profundidade (`gravaACena`), em qual a lente escreve
(`escreveALente`) e se os dois colidem (`realimentacao`). Buffer errado é ela; câmera no vazio é
`universo.ancora()`; laço parado é o `requestAnimationFrame`. ⚠️ `leitura` é RESÍDUO do quadro que
acabou — numa cena de paridade ímpar ela sai no outro alvo por construção, e isso está certo.

**⚠️ A aba precisa estar VISÍVEL.** Aba em segundo plano é estrangulada no MOTOR: `rAF` não dispara e
a sonda devolve um quadro velho. **E a sonda congelada é PLAUSÍVEL** — já se leu `raioDaCamera = 33.938`
três vezes seguidas e se foi caçar defeito na câmera; o valor era de um voo antigo.

> **O detector é `spatia.cena().quadros` (ou `.universo.pixels().quadros`) ANDAR entre duas leituras.**
> Se não andou, nenhum número daquela sonda é do presente.
> ☠️ **`cena().quadros` conta SÓ o UNIVERSO — na cena AGENTE ele fica em 0 com o céu vivo**, e aí o
> detector afirma "congelou" sobre uma cena que desenha. Medido: contador parado e **180 `rAF` em
> 1,5 s**. Na AGENTE o detector é contar `requestAnimationFrame` à mão:
> `let n=0; const t=()=>{n++;requestAnimationFrame(t)}; requestAnimationFrame(t)`.

☠️ **`readPixels` FORA de um `rAF` aninhado devolve o buffer INTEIRO ZERADO** — não erro, não exceção:
zero. Basta um `await`/`setTimeout` entre o desenho e a leitura para o compositor já ter apresentado
o quadro. O sintoma é uma medida perfeitamente formada afirmando tela preta sobre uma cena que
desenha, e ela é indistinguível de defeito real. ⭑ Dentro do `ler` de `mesmoQuadro` o problema não
existe — ela roda com o desenho ainda no buffer, e é por isso que ela é síncrona.

☠️ **LER O CENTRO DA TELA PARA DETECTAR "TELA PRETA" CAI DENTRO DA SOMBRA.** Um recorte central de
256×256 na cena AGENTE com o buraco negro enquadrado dá luma **0 exato** — e está certo, o horizonte
é preto de verdade. *"Tela preta"* se responde por `spatia.cena().composicao`, nunca por um recorte
que o objeto mais escuro do céu ocupa de propósito.

☠️ **DUAS FOTOS SEPARADAS POR SEGUNDOS ATRIBUEM ANIMAÇÃO AO TRATAMENTO.** Medido: dois quadros a 8 s
de distância sugeriram um efeito enorme de um termo que, no MESMO quadro, é sutil. A cena anda
sozinha — deriva de câmera, órbita, advecção do disco. Comparação de aparência é `mesmoQuadro` ou
não é comparação.

☠️ **CONTROLE POSITIVO É OBRIGATÓRIO NUM A/B QUE SAI NULO** — senão *"não mudou nada"* e *"o
interruptor não chegou ao shader"* são a mesma leitura. Medido no dither de saída: ganho 1 muda 8,0%
dos pontos, ganho 60 muda 96,5%.

☠️ **E ELE NÃO BASTA: A MÉTRICA É PARTE DA HIPÓTESE.** O mesmo dither saiu **nulo com controle
fechado** e a refutação errada quase foi escrita. A medida varria a faixa clara INTEIRA sem isolar o
regime em que o defeito vive — gradiente RASO —, e ali a maior parte é saturada, onde platô largo é
sinal chato e não degrau; a cauda ficava diluída em dezenas de milhares de platôs de 1 px. Isolado o
regime (passo local ≤ 2 LSB), o mesmo A/B dá p99 **21 → 11** e máx **160 → 42**.
> **Antes de aceitar um nulo, pergunte se a métrica ALCANÇA o defeito.** Nulo com controle fechado é
> a forma mais convincente de estar errado — ele traz junto a prova de que o instrumento funciona.

☠️ **RECORTE COMPARADO EXIGE O MESMO RETÂNGULO, nunca o mesmo CRITÉRIO.** Dois recortes centrados
por "centroide da área clara" caem em lugares diferentes quando o tratamento muda a área clara — e a
diferença de conteúdo lê como artefato. Foi assim que uma "aresta reta" virou pista de bloom por uma
sessão inteira.

⚠️ **Passa-alta amplificado mostra contorno em QUALQUER gradiente de 8 bits** — é o piso do formato,
não defeito. Ele serve para ACHAR onde a banda mora, nunca para julgar se ainda há banda.

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

⚠️ **`spatia.hud()` é a exceção, e saber disso evita descartar uma medida boa.** Ela lê LAYOUT
(`elementFromPoint`, `getBoundingClientRect`), que continua vivo em aba oculta — `quadros` não é
guarda dela, e exigir que ande faria alguém jogar fora o único número que T-52 tem. ☠️ **E o
inverso vale:** ela não prova nada sobre o que a cena DESENHOU. As duas guardas continuam
obrigatórias para toda sonda de cena.
> ☠️ **`painelDePalco.aceitaPonteiro` lê a MOLDURA, e desde T-51 a moldura cede sempre.** Ele
> devolve `false` com o painel cheio de conteúdo — verdade sobre a moldura, mentira sobre o painel.
> **A medida honesta é `painelDePalco.aoPonteiro`** (pontos da subárvore inteira) contra
> `painelDePalco.fracaoJanela` (a caixa da moldura, que o conserto **não** mudou): a diferença entre
> as duas É a zona morta devolvida, e ela reaparece em `ponteiro.fracaoAoCanvas`.

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
dois na hora (máx/mín 23,96× é fase; ~1× seria aro). É a armadilha §B-5 em forma nova.

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

☠️ **MESMA PALAVRA, DUAS GRANDEZAS — três casos medidos, e todos na mesma sessão.** O retorno de
`scene.loadGraph` soma corpos **+ LUAS** (460 num corpus de 72) e já saiu rotulado "corpos"; o
`answer.turns` é o laço INTERNO do agente numa execução e o `thread.turn` é a ordem da pergunta na
conversa, os dois na mesma timeline; e `orbit.distance` servia de proxy a quatro perguntas
diferentes. **Antes de reusar um nome, pergunte que grandeza o outro dono mede** — o sintoma é
sempre um número plausível na tela que ninguém reconcilia com o censo.

☠️ **MEDIR SUB-ROTA EXIGE CARGA FRIA.** Trocar só o `location.hash` **não recarrega o documento**, e
o router trata sub-rota **sem remontar** de propósito — o endereço existe para trazer o estado de
volta, e remontar destruiria isso. Quem mudar o hash e ler estará medindo o mount ANTERIOR. Force
documento novo (navegue para outra página e volte). ⚠️ E confira que o id existe como LINHA: o
diário tem registros que não são execução.

☠️ **WIDGET COLAPSADO PARECE WIDGET VAZIO** — só o cabeçalho, sem nem a mensagem de vazio. O estado
está em `localStorage` (`espatial.collapsed.v1`, listas `abertas`/`fechadas`) e é PREFERÊNCIA DO
OPERADOR, não defeito. Confira essa chave antes de acusar a tela de não desenhar.
> ⚠️ **E o operador não precisa ter recolhido nada:** abrir UMA seção recolhe e PERSISTE todas as
> irmãs do mesmo trilho (`kernel/widgets.js:63-71`), e a chave é por `id` de widget, não por
> (rota, widget) — recolher `context` em `#/files` recolhe `context` nas dez rotas. Um clique deixa
> até 3 painéis do trilho como cabeçalho puro, para sempre.
> ⚠️ **A outra causa de "o painel não está aí" é o MANIFESTO, e não é defeito:** `memory`, `tools` e
> `plan` estão em **1 das 10** listas de widgets (só a rota raiz), `vitals` e `web-results` em 2 —
> enquanto `answer` está nas 10. **A resposta é residente; os painéis que ela duplica não são.**
> A contagem por rota sai do censo de `node scripts/lei-residentes.mjs`, nunca deste parágrafo.
> ⭑ **A terceira causa era DEFEITO e está fechada (T-48):** quem é residente está em `RESIDENTES`
> (`src/apps/residentes.js`) e `declararApp` recusa a rota que não o monta — antes disso a regra
> era prosa em dois lugares e `#/security` não montava `timeline`.
> ⭑ **E a lista de fontes deixou de repetir o painel (T-52):** a linha sai quando um painel
> VISÍVEL já a afirma — montado, aberto, e com a linha DESTA fonte dentro — e vira uma linha que
> nomeia o painel com todos os `[n]` do grupo. ☠️ **«Montado» não vale por «mostrando»:** o painel
> de web guarda `WEB_LIMIT` de 18, e o acordeão deixa no máximo um dos dois irmãos de `right`
> aberto. Portão: `scripts/lei-referencia.mjs`.

☠️ **`cena().quadros` CONTA SÓ O UNIVERSO — no AGENTE ele congela.** Usá-lo como prova de vida ao
medir a cena AGENTE devolve "não mudou" com a tela parada, que é a armadilha de §A com o contador
errado. **A contagem que não pertence a cena nenhuma é o `requestAnimationFrame`**, e é ela que vale
quando a medida atravessa as duas cenas.

---

---

### A régua de uma SONDA — o modelo, e por que contagem não basta

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

---

## B. Armadilhas de CÓDIGO que falham caladas

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

19. ⚠️ **ARREDONDAMENTO NA SONDA VIRA PISO COM CARA DE MEDIDA.** Detalhado no `HANDOFF.md` e na sonda `camQuat`: quatro
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
    [0,1]), nunca nos extremos observados. Números em `medidas.md`.

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

25. ☠️ **O ORÁCULO SATISFEITO PELO VIZINHO — e a MUTAÇÃO que erra o alvo é a mesma doença.** Três
    vezes na mesma sessão, e todas com o oráculo VERDE: (a) a lei que exigia `flex: 0 0 auto` nos
    filhos de `.sources` casava qualquer seletor terminado em `*` e passava pelo `.surface > *`, que
    fala de outro elemento; (b) a lei que proibia `scrollIntoView` varria o arquivo COM comentários
    e era satisfeita pela prosa que explica a proibição; (c) duas mutações de prova editaram o
    `.answer` e o `.aviso-detail`, que têm o MESMO texto CSS do alvo — a lei ficou verde sobre uma
    mutação que nunca a tocou, que é o jeito mais barato de atestar guarda inexistente.
    ⭑ **A guarda é uma só:** toda mutação de prova tem de ser vista derrubando a lei que ela ataca
    **pelo nome** — verde depois de mutar é resultado a INVESTIGAR, nunca a comemorar. E o alvo do
    oráculo se ancora no próprio elemento (o último composto do seletor, o código sem comentário),
    nunca numa forma que o vizinho também tem.

26. ☠️ **CAIXA QUE POSICIONA NÃO É CAIXA QUE PINTA, e a HUD cobra o gesto pela primeira.** Sobre o
    céu o custo de uma superfície **não é a tinta dela, é a caixa dela**: os cinco ouvintes de
    gesto da cena estão presos ao `canvas` e não há em `window` quem reencaminhe, então
    `pointer-events: auto` num retângulo transparente **cancela** órbita, zoom e pick ali — não
    disputa, cancela, e nada acusa. A moldura do painel de palco era `flex: 1` e esticava pela
    coluna central inteira enquanto quem pinta (`.widget-body`) parava em 62vh; a faixa entre as
    duas ficava morta em cima do corpo em foco.
    ⭑ **A regra, e ela vale para superfície nova:** quem PINTA reivindica; quem só POSICIONA cede.
    ⚠️ **E `pointer-events` NÃO é herança que descendente respeite:** filho com `auto` volta a ser
    alvo sob ancestral `none` — é assim que o `#hud` funciona de propósito, e é como um escape que
    zera só o pai continua reivindicando pelo `.scroll` de dentro. Portão: `scripts/lei-palco.mjs`.

27. ☠️ **`ui.route` CHEGA ANTES DOS WIDGETS — quem repinta nele lê o mount ANTERIOR.** O router
    emite a rota e só então agenda `host.apply` dentro do `setTimeout` do voo
    (`kernel/router.js`), então um assinante que consulte o DOM nesse evento vê os widgets da rota
    de onde se está SAINDO. É a armadilha de §A («a sonda lida na mesma chamada que emite vem
    velha») no barramento, e o conserto por temporizador seria um número escolhido para a foto
    fechar. ⭑ **O que muda é observável e tem observador:** `MutationObserver` de `childList` nas
    quatro fendas pega a moldura entrando e saindo; um de `attributeFilter: ['data-collapsed']`
    pega o operador recolhendo. Atributo com `subtree` **não** dispara em `childList`, então o
    stream de tokens não repinta nada. Quem usa isso hoje é a lista de fontes (`hud/answer.js`).

28. ☠️ **ESTADO QUE SOBREVIVE AO QUADRO + PASSE QUE SOME DA CADEIA = DEFEITO INTERMITENTE QUE CONTA
    QUADROS.** O `EffectComposer` **pula** o passe desabilitado (`if (pass.enabled === false)
    continue`) e **não reinicia** `readBuffer`/`writeBuffer` entre quadros — só o construtor e o
    `reset()` os atribuem. Então quem decide em que alvo o `RenderPass` grava é a PARIDADE acumulada
    dos passes que trocam, e uma cena que liga ou desliga um passe muda essa paridade. Desligar a
    lente no UNIVERSO deixava um passe trocador só, o par invertia a cada quadro, e a volta ao
    AGENTE punha a lente escrevendo no alvo cuja `depthTexture` ela amostra: feedback loop,
    indefinido em WebGL, **PRETO em silêncio**.
    ⭑ **A guarda é fixar o estado no começo de cada quadro** — nunca redesenhar para compensar, que
    esconde a paridade e a devolve no primeiro passe novo. Portão: `scripts/lei-paridade.mjs`.
    ⚠️ **A família é maior que o composer:** toda vez que um objeto de terceiro guarda estado ENTRE
    chamadas e a sua configuração muda quantas vezes esse estado avança, o defeito nasce
    intermitente e o intervalo entre as ocorrências mede QUADROS (ou chamadas), não tempo. Um
    conserto visto funcionando uma vez não prova nada nessa forma.
    ☠️ **E não confunda com o item 8:** lá a foto não distingue órbita parada de órbita lenta; aqui a
    foto é conclusiva (zero pixels acesos é zero), mas **o gatilho não está no quadro que você
    fotografa** — está em quantos quadros a outra cena desenhou antes.


---
