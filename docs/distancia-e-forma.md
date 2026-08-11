# Distância e forma — por que o UNIVERSO morre de longe e o AGENTE não

> **Relatório, não implementação.** Nada aqui está em `src/` nem em `server/`. Ele existe para
> responder por MEDIDA um relato da tela, e para entregar à próxima sessão um passo 1 concreto.
>
> Base normativa: [`replanejamento-celeste.md`](./replanejamento-celeste.md) (§16, a Fase D
> destravada) e o `CLAUDE.md`. Medições feitas em 2026-08-08 contra o corpus `espatial_fixture`
> (71 corpos, 21 sistemas) no servidor em `127.0.0.1:8787`.

O relato, palavra por palavra:

> *"a cena padrão 'agente' é mais bonita. Consegue mostrar a forma/brilho/cores dos astros mesmo de
> longe. Na cena do universo, todos ficam opacos a menos que o foco esteja nele. Não importa o zoom,
> se não estiver focado todos ficam opacos (têm cores diferentes, mas ainda assim esferas opacas).
> Deveríamos poder ver as formas/brilhos/cores mesmo a certa distância, como na física no universo
> real."*

---

## 1. O sintoma, e o que ele NÃO é

O relato descreve **um** defeito e três não-defeitos. Separá-los é o que impede a próxima sessão de
consertar por palpite o que já foi escolhido por medida.

### O que NÃO é defeito

| suspeita | por que ela cai |
|---|---|
| **"os corpos são pequenos demais"** | É **consequência declarada** de uma escolha. O comentário de `RAIO_MINIMO` em `universe.js` já a registra: o planeta é limitado pela BANDA orbital dele, e forçar um piso ali quebraria a disjunção que impede as órbitas de se cruzarem — *"entre 'o planeta some de longe' e 'as órbitas colidem', a cena escolhe o primeiro"*. Aumentar o raio de mundo é **mexer na simulação**, e a REGRA DA FÍSICA proíbe resolver composição por dentro dela. |
| **"a silhueta está facetada"** | Já consertado. 32×16 segmentos, e o §16 do replanejamento registra a medida (120 fps, 188 corpos). Não é esta a metade que sobrou. |
| **"falta rotear as peles pela ontologia nova"** | Já existe: `src/space/superficies.js` é a tabela `classificar() → superfície`, e `scene.js` a consome (`decisaoDoUniverso`). A pele **é escolhida corretamente** — ela só nunca chega a ser desenhada, e o motivo é pixel, não roteamento (§2.2). |
| **"o custo não deixa"** | Medido: a passada de geometria da cena UNIVERSO custa **0,24–0,27 ms**, contra **1,95 ms** da cena AGENTE no mesmo buffer e no mesmo fov. Há folga de sobra, e ela está do lado errado da comparação. |

### O que É defeito, e são duas metades

1. **O UNIVERSO não tem representação de LONGE.** Ele tem *esfera lisa* e *pele completa*, e nada no
   meio — enquanto **70% do céu vive abaixo de 4 px de raio aparente** no enquadramento de casa, que
   é onde nenhum modelo de sombreamento consegue produzir gradiente nenhum.
2. **O único canal que sobra de longe está CHAPADO.** `brilhoDe()` devolve **5 valores distintos em
   71 corpos, e 51 deles são exatamente o mesmo número** (0,55). De longe, a única coisa que ainda
   distingue dois corpos é a cor do `kind` — que é literalmente o que o relato diz: *"têm cores
   diferentes, mas ainda assim esferas opacas"*.

---

## 2. A medida

Ambiente de todas as tabelas: buffer **3024×1484** (DPR 2), **fov 80°** (valor do slider de
afinação no momento da medida; ver ⚠️ ao fim do §2.1), `k = H/(2·tan(fov/2)) = 884,3`.

⚠️ **O `k` foi conferido contra a cena viva, e não só derivado.** `spatia.planet()` devolveu
`px 103,33 · dist 14,2327 · raio 1,54642` num buffer de altura 1596, o que recupera `k = 951`; a
mesma constante escalada para 1484 dá **884,3**. As duas fórmulas concordam, que é a divergência que
o comentário de `ancoraDoUniverso` manda vigiar.

Geometria da cena, medida: raio de corpo **0,162 a 1,995** unidades (mediana **0,349**), corpos
distribuídos até **ρ = 77,2** do centro. Classes: 21 estrela · 35 planeta · 13 lua · 2 asteroide.

### 2.1 Quantos pixels de raio um corpo tem, por distância de câmera

Cada linha é a média sobre **32 direções de câmera** (esfera de Fibonacci) — a teia é quase
isotrópica, e a média com os extremos ao lado é o que impede a tabela de descrever uma pose só.

| pose | dist. da câmera | **abaixo de 4 px** | abaixo de 8 px | **≥ 22 px** (o menor piso de pele da base) | ≥ 90 px (piso de planeta/fotosfera) | maior corpo da tela |
|---|---|---|---|---|---|---|
| **casa** | 150 (`HOME_UNIVERSO`) | **49,7 de 71** (70%) | 67,5 de 71 (95%) | **0 de 71** | **0 de 71** | 17,1 px |
| metade | 75 | 35,5 de 71 (50%) | 49,3 de 71 | 1,5 de 71 | 0 de 71 | 62,7 px |
| perto | 25 | 9,8 de 71 | 35,9 de 71 | 11,5 de 71 | 0,3 de 71 | 191,3 px |
| **chão do zoom livre** | 12 (`ZOOM_RANGE.min`) | 6,3 de 71 | 31,6 de 71 | 13,4 de 71 | **0,3 de 71** | 251,4 px |

Distribuição do raio aparente no enquadramento de casa: **min 0,76 · P25 1,50 · P50 2,07 · P75 5,53
· P95 7,98 · máx 17,13 px**.

⚠️ **O número que decide o documento inteiro está na coluna dos 22 px.** No enquadramento de casa,
**nenhum** dos 71 corpos alcança sequer o *menor* piso de pele que existe nesta base (nebulosa,
`LOD_FAR_PX = 22`). E na quarta linha — com a câmera no **chão do voo livre**, o mais perto que o
operador consegue chegar sem travar num corpo — ainda são **0,3 de 71** acima de 90 px. Ou seja: a
pele não é alcançável por zoom. Ela é alcançável **só por foco**, e o foco é o que reenquadra a
câmera pelo raio do corpo (`FOCUS_FIT_PX = 260`).

A mesma coisa dita pelo avesso — **a que distância a câmera precisa estar para o corpo alcançar cada
limiar**:

| limiar | corpo mais brilhante | **mediana** | corpo maior |
|---|---|---|---|
| 90 px (planeta · fotosfera) | 1,6 un | **3,4 un** | 19,6 un |
| 22 px (nebulosa, o menor da base) | 6,5 un | **14,0 un** | 80,2 un |
| 4 px (onde uma esfera deixa de ser corpo) | 35,8 un | **77,1 un** | 441,1 un |

Um universo que vai até ρ = 77 exige a câmera a **3,4 unidades** do corpo mediano para ele ganhar
pele. Isso não é uma distância: é um foco.

⚠️ **E a conclusão não depende do slider de fov.** Refeita a conta com o `CAMERA.fov = 46` do
código (`k = 1748`, o dobro), o enquadramento de casa ainda dá **34,4 de 71 abaixo de 4 px**, `0 de
71` acima de 90 px e um corpo máximo de 33,9 px. O fov muda quantos corpos somem; não muda que
nenhum ganha pele.

### 2.2 O mesmo corpo, a mesma distância, nas duas cenas

Este é o par que o relato pede que se compare, e ele é medido nos **mesmos 71 arquivos** com a
câmera a ~150 unidades do centro nas duas cenas (`CAMERA.start` da AGENTE tem módulo 149,8).

| | **AGENTE** (sprite de `graph.js`) | **UNIVERSO** (esfera instanciada) |
|---|---|---|
| raio desenhado, mínimo | 1,99 px | 0,76 px |
| raio desenhado, **P50** | **9,22 px** | **2,07 px** |
| raio desenhado, P75 | 12,60 px | 5,53 px |
| raio desenhado, máximo | 20,44 px | 17,13 px |
| **corpos abaixo de 4 px** | **1 de 71** | **≈ 50 de 71** |
| mistura | **aditiva**, sem escrita de profundidade → o bloom amplifica | opaca, alfa 1 |

**O corpo mediano do AGENTE é 4,5× maior em raio — 20× em área — que o mesmo corpo no UNIVERSO, à
mesma distância.** E onde o UNIVERSO põe 50 corpos sob o limiar em que uma esfera deixa de ser
corpo, o AGENTE põe 1.

### 2.3 O brilho, que é o único canal que sobra de longe

Réplica exata de `brilhoDe()` (`universe.js`) sobre os 71 nós:

| valor de brilho | quantos corpos |
|---|---|
| **0,5500** | **51** |
| 0,5792 | 8 |
| 0,6375 | 6 |
| 0,6667 | 3 |
| 0,9000 | 3 |

**Cinco valores distintos em 71 corpos, amplitude total 1,64×, e 72% do céu no mesmo número.** As
três causas são todas fatos medidos do corpus, não bugs:

- `centrality` é `number` em **0 de 71** — o Neo4j não está materializado neste fixture, e a lei nº 1
  da integração manda o brilho cair para a atividade sozinha em vez de para zero;
- `churn > 0` em **20 de 71** — nos outros 51, `atividade = 0` e o brilho é o piso, exato;
- `usage` é `number` em **8 de 71**, e mesmo esses só entram se o portão de evidência (`usoVale`)
  estiver aberto — que é o desenho correto do P5 e não deve mudar.

⚠️ **Isto não é defeito de `brilhoDe`.** É a constatação de que, num corpus real, o brilho por
atividade **é ralo por natureza** — a maioria dos arquivos não foi tocada nos últimos 30 dias. Um
canal que empata em 72% dos casos não pode ser o único portador da diferença de longe.

### 2.4 O custo do quadro, nas duas cenas

`spatia.renderCost(30)`, EXT_disjoint_timer_query_webgl2, duas amostras por cena, aba **visível** e
`spatia.cena().quadros` avançando (96 quadros em 800 ms ≈ 120 fps) — sem isso o número não vale.

| cena | passada de **geometria** | cadeia de **pós** | quadro | fração do pós |
|---|---|---|---|---|
| **UNIVERSO** | **0,236 · 0,272 ms** | 2,325 · 2,339 ms | 2,561 · 2,611 ms | **89,6–90,8%** |
| **AGENTE** | **1,945 · 1,951 ms** | 1,418 · 1,437 ms | 3,363 · 3,388 ms | 42,2–42,4% |

⚠️ **A folga do UNIVERSO é de 1,7 ms, e ela não está onde parece.** O céu de 92 esferas de 1 024
triângulos custa um quarto de milissegundo; **90% do quadro dele é pós-processamento**. Isso repete,
na cena nova, a conclusão que o `CLAUDE.md` já cravou para a antiga: *"não existe 'otimizar a
galáxia' — o orçamento está todo na lente"*. Qualquer proposta que economize corpos economiza de um
bolso que tem 0,24 ms dentro.

Área de preenchimento, para dimensionar propostas de sprite: **os 71 corpos juntos cobrem 3 876 px²
no enquadramento de casa — 0,086% do buffer de 4,49 Mpx**; a 75 unidades, 0,377%.

### 2.5 O que o AGENTE desenha que o UNIVERSO não desenha

Lendo o shader de ponto de `graph.js` (`VERTEX` + `FRAGMENT`), feição por feição, e conferindo se o
UNIVERSO **já tem o fato** nos nós que carrega:

| feição do sprite | o fato que a alimenta | o UNIVERSO tem o fato? | população no fixture |
|---|---|---|---|
| **tamanho** `aSize = 0,55 + log2(1+chunks)·0,42` | `chunks` | **sim** — e já usa (`raioPorMassa`) | 71 de 71 |
| **cor** `aColor = KIND_COLORS[kind]` | `kind` | **sim** — `universe.js` já importa `KIND_COLORS` e pinta `instanceColor` | 11 kinds |
| **ignição** `aIgnition` (pulso + corona quente) | evento de busca | **sim** (é evento; hoje só o grafo o recebe) | sob demanda |
| **casca de supernova** `aSupernova` (`ENVELOPE_GLSL`) | `node.supernova`, do servidor | **sim** — e `fenomenos()` já a nomeia | 3 de 71 |
| **anã branca** `aDwarf` (aro fino azul-branco) | `node.dwarf` | **sim** — e `fenomenos()` já a nomeia | 7 de 71 |
| **coroa / cessão do miolo** `aHalo` + `uHaloYield` | foco + `keepsCrown()` | **sim** — `universe.js` já tem `coroar()` e `cederPara()` | 1 por quadro |
| janela de recência `aRecency` / `uReveal` | `recency` | sim, mas o UNIVERSO **não tem playhead** — fica fora | — |
| mistura **aditiva** + bloom | material | a cena UNIVERSO passa pelo **mesmo** composer | — |

**Seis das oito feições rodam sobre fatos que a cena UNIVERSO já carrega nos nós.** Nenhuma delas
exige dado novo, servidor novo ou classificação nova.

---

## 3. A causa

Três frases, cada uma amarrada a um número acima.

**Primeira: o AGENTE desenha em PIXELS, o UNIVERSO desenha em MUNDO.** O tamanho do sprite é
`uSize · aSize · (300 / −z)` — ele nasce em `gl_PointSize`, que **é pixel de framebuffer**, e a
constante 300 lhe dá um piso generoso que não depende do raio físico de nada. O corpo do UNIVERSO é
uma esfera de raio real projetada pela câmera, e o raio real foi comprimido de propósito para as
bandas orbitais não se cruzarem. Daí os 9,22 px contra 2,07 px do §2.2: **as duas cenas não estão
desenhando o mesmo objeto em escalas diferentes — estão desenhando em unidades diferentes.**

**Segunda: abaixo de ~4 px, sombrear é impossível, e só emitir funciona.** Meia-lambert precisa de um
terminador; limbo precisa de uma borda; relevo precisa de área. Num disco de 2 px não existe
nenhuma das três — sobra **um** valor de cor por corpo. É por isso que o relato registra "cores
diferentes, mas ainda assim esferas opacas": está literalmente certo. O AGENTE não tem esse
problema porque um sprite aditivo de 9 px com bloom **afirma luz**, e luz se lê em qualquer tamanho;
uma esfera opaca de 2 px afirma matéria, e matéria de 2 px não se lê.

**Terceira: a escada de LOD das peles não é a culpada — ela é o sintoma.** `LOD_FAR_PX = 90` não
está alto: ele é o número de pixels abaixo do qual desenhar relevo é desperdício. O que a medida
mostra é que **nenhum corpo desta cena chega perto dele em distância nenhuma que não seja um foco**
(0 de 71 em casa, 0,3 de 71 no chão do zoom). Ou seja, a cena UNIVERSO tem **dois** estados de
representação — esfera lisa e pele — e o corpus vive **inteiro** no primeiro. O degrau do meio, que
é justamente o que o AGENTE tem, nunca foi construído.

> **O defeito, em uma linha:** a cena UNIVERSO herdou do AGENTE a ideia de que "de longe é um
> ponto", mas não herdou o PONTO.

---

## 4. As saídas, com trade-off medido

Todas obedecem à REGRA DA FÍSICA por construção: nenhuma toca posição, raio de mundo, banda orbital
ou excentricidade. Se alguma precisasse, estaria descartada antes de ser avaliada.

### (a) Camada de sprite/impostor para os corpos distantes — a que o AGENTE já tem

**O que ela afirma:** *este corpo existe, tem esta massa, este tipo, esta energia e este estado*, e
afirma isso a 2 px, que é onde a esfera não afirma nada.

**Como:** um `THREE.Points` filho do grupo do UNIVERSO, com o **mesmo** shader de `graph.js`,
alimentado pelos mesmos buffers de posição que o `InstancedMesh` já usa por quadro. O sprite cede o
miolo para a esfera exatamente como já cede para a pele (`uHaloYield` / `aHalo`), e a esfera continua
sendo o corpo assim que ela tem pixels para tanto.

**Custo estimado: +0,05 a +0,15 ms** — quadro de 2,58 → ~2,70 ms (**+2 a +6%**). A estimativa está
ancorada em duas medidas, e não em opinião: (i) o preenchimento total dos corpos no enquadramento de
casa é **0,086% da tela**, então mesmo um sprite com 3× o raio do corpo cobre 0,77% do buffer, em
uma passada aditiva sem profundidade; (ii) o `CLAUDE.md` já registra **0,31–0,35 ms para o céu
inteiro do AGENTE com 213 instâncias**, e este céu tem 71 corpos. É **um** desenho a mais.

⚠️ **Não é medida direta.** Tentei isolá-la num renderizador sintético e o quadro saiu **vazio**
(`pixelsAcesos = 0`), porque `createGraph().load()` sozinho não põe o céu numa pose desenhável. O
número acima é um limite superior derivado de duas medidas reais, e a próxima sessão deve
substituí-lo por `spatia.renderCost()` antes e depois.

**O que ela custa, além de milissegundos:** exige uma decisão explícita para não violar a lei nº 3
(*o que a posição já comunica não se codifica de novo*). O `aSize` do AGENTE deriva de `chunks`; o
raio do UNIVERSO **também** deriva de `chunks`. Duas leis de tamanho para o mesmo fato é exatamente
o defeito que esta base mais persegue — e aqui ele seria visível, porque as duas divergem (log2
contra `raioPorMassa` com piso de banda). **O sprite tem de derivar do raio JÁ DESENHADO, não do
`chunks` outra vez:** `px_sprite = max(px_geometria, PISO)`. Assim ele nunca contradiz a esfera; ele
só impede que ela desapareça.

⚠️ E **não é morfologia nova** — é a mesma feição desenhada por quem esta cena tem, que é o
precedente já aplicado **duas vezes** dentro de `universe.js`: a coroa da estrela e o anel do git
foram ambos trazidos para cá pelo mesmo argumento ("`rings` é instanciado dentro de `graph.js` e o
UNIVERSO esconde o grupo inteiro"). O §16 do replanejamento autoriza a Fase D; e o que a regra do
cabeçalho proíbe é morfologia **sem classificação**, não reuso de feição já classificada.

### (b) Baixar `LOD_FAR_PX` e desenhar pele em mais corpos

**Refutada pela medida, e o número é seco.** No enquadramento de casa o maior corpo da tela tem
**17,1 px** — abaixo do **menor** piso que existe na base (nebulosa, 22 px). Para o corpo mediano
chegar a 90 px a câmera precisa estar a **3,4 unidades** dele; para chegar a 22 px, a **14
unidades**. Não existe valor de `LOD_FAR_PX` que faça a pele aparecer "a certa distância": baixá-lo
não aproxima os corpos, só **alarga a bolha do foco**.

E o que se ganharia não seria forma: um relevo de planeta amostrado em 8 px é ruído em 8 px. O piso
de 90 não é conservadorismo — é o ponto em que a pele passa a ter o que dizer.

**Custo:** o mais caro das quatro, e por uma ordem de grandeza. A passada de geometria do AGENTE
custa **1,95 ms** com **uma** pele em foco (mais a lente e o campo de galáxias); a do UNIVERSO custa
**0,24 ms** com nenhuma. Cada pele adicional vale dezenas de sprites. Pagar isso por relevo
sub-legível é o pior negócio da lista.

⚠️ Mexer nesses números também acorda as duas invariantes obrigadas na carga de `lod.js`
(`extentMax` e `extentPleno`). Elas não são um empecilho — são a prova de que o número tem dono.

### (c) Enriquecer o shader instanciado (limbo, atmosfera barata, emissão por atividade)

**O que ela afirma:** que o corpo tem volume e temperatura. `CORPO_FS` hoje é meia-lambert puro e
`ESTRELA_FS` já tem limbo; falta ao planeta um aro de atmosfera e falta aos dois um canal de emissão
que não seja o brilho chapado do §2.3.

**Custo: +0,00 a +0,02 ms.** Mesma chamada de desenho, mesmo número de fragmentos, e a carga de
fragmento inteira da cena é **0,086% da tela**. É, de longe, a mais barata.

> ⚠️ **MEDIDO DEPOIS (08/08) — esta saída é mais potente e menos útil do que este parágrafo supunha.
> Ver o §7.** Em resumo: `CORPO_FS` não tem aro nenhum para afinar (é meia-lambert puro), então (c)
> **cria** um termo; e o único aro que a cena tem hoje — o `borda` do `ESTRELA_FS` — move **+25,9%
> da luz** e **+85% dos pixels acesos** quando ligado. Potente. Só que, com a geometria em **P50
> 1,55 px**, essa luz é **espalhada pelo bloom** em vez de desenhada como borda: vira brilho, não
> vira forma. E a faixa que (c) conserta (8–90 px) tinha **0 corpos** no enquadramento medido.

**O que ela custa:** ela **não resolve o relato**. Limbo, aro e terminador são gradientes **de
borda**, e 70% do céu não tem borda — tem 2 px. Ela conserta com precisão a faixa dos **8 aos 90
px** (3,5 de 71 corpos em casa, 22 de 71 na metade do caminho) e conserta o "opaco mesmo grande",
que é a segunda metade legítima do relato. Sozinha, ela deixa 50 de 71 corpos exatamente como estão.

⚠️ **Mas há aqui um conserto que vale por si, e é barato:** os 51 corpos empatados em brilho 0,55
(§2.3). Quando `centrality` é `null` e `churn` é 0, o céu perde **toda** a variação de energia. Um
terceiro termo derivado de fato que **existe em 71 de 71** — a massa, que já governa a escala —
seria codificar duas vezes o mesmo fato e está proibido pela lei nº 3. O caminho honesto é o
oposto: **aceitar que a energia empata e devolver a diferença ao canal que ainda está livre**, que é
a forma — ou seja, (a).

### (d) Escada de LOD de verdade, com o sistema apertado virando agregado de longe

É o que o briefing pede (§9.4 do replanejamento) e é a resposta certa para **escala** — o corpus real é
UMA ordem de grandeza acima do fixture (as duas contagens saem de `make censos`).

**Custo: economiza no máximo 0,24 ms**, porque é isso que a passada de geometria inteira custa hoje.
Contra um quadro de 2,58 ms cujo pós custa 2,33 ms, é economizar menos de 10% de onde não dói.

**O que ela custa:** ela vai na **direção oposta ao pedido**. Fundir o sistema num agregado luminoso
de longe é decidir que, de longe, os corpos individuais **não devem** ser vistos — e o relato diz
exatamente o contrário. Ela continua sendo trabalho legítimo, para quando o corpus real entrar; ela
só não é a resposta a esta pergunta.

### A recomendação

> **(a) primeiro, (c) logo atrás, e as duas na mesma rodada. (b) descartada por medida. (d) adiada
> para quando a pergunta for escala e não distância.**

E o porquê é uma frase só: **a medida diz que o problema é PIXEL, não sombreamento.** Com 49,7 de 71
corpos abaixo de 4 px, nenhum modelo de iluminação — por melhor que seja — tem área para escrever
nada. A única coisa que se lê em 2 px é **emissão com pegada maior que a geometria**, e é
literalmente isso que o AGENTE faz, é o que o relato chama de "mais bonita", e é a única das quatro
propostas que ataca o número medido em vez de um sintoma dele.

(c) entra junto porque conserta a **outra** metade do relato — "opacos" — na faixa em que o corpo
JÁ tem pixels e mesmo assim lê como adesivo, e porque custa perto de zero.

⚠️ **E as duas juntas continuam dentro do orçamento com folga:** 2,58 → ~2,72 ms de quadro, com a
passada de geometria saindo de 0,24 para ~0,40 ms — ainda **cinco vezes** mais barata que a passada
de geometria do AGENTE, que já roda a 120 fps nesta máquina.

---

## 5. O que a medida NÃO decide

A medida diz que 50 corpos estão abaixo de 4 px e que a pele é inalcançável fora do foco. Ela **não**
diz nada sobre o seguinte, e cada item aqui é do olho do usuário:

- ~~**Quanto maior que a geometria o sprite deve ser.**~~ **CADUCOU — o §7.5 decide quase tudo.**
  Estava escrito aqui que o piso *"pode ser 3 px, 6 px ou 10 px"* e que entre o chão e o teto era
  gosto. A varredura de 2 a 10 px no mesmo quadro, em quatro poses, diz que não é uma faixa de gosto:
  é um **planalto** (2,5–4,0 px, custo ZERO) e um **despenhadeiro** (de 4,5 em diante o céu colapsa
  num tamanho só, 91% já em 5 px). **`PISO_SPRITE_PX = 4` é o teto do planalto.** O que sobrou para o
  olho é 3 contra 4, que a medida empata e a foto desempata. Ver §7.5.
  > ⭑ **A "mesma pose duas vezes" existe como instrumento:** `spatia.aroAB([{piso:4},{piso:6},
  > {piso:8}], ler)` desenha os pisos **no mesmo quadro** (ver §7). Conferido em 08/08: a geometria
  > fica intocada nos três (P50 1,50 · máx 11,54) e só o sprite anda (mín/P50 4 · 6 · 8), que é a
  > lei `px_sprite = max(px_geometria, PISO)` se comportando como escrita.
- **Se o sprite deve continuar aceso quando o corpo já é grande.** No AGENTE ele cede por
  `uHaloYield`; aqui a esfera assume por conta própria. Onde exatamente o cruzamento fica confortável
  é decisão de olho.
- **Se a cena UNIVERSO deve ter bloom na mesma força da AGENTE.** As duas passam pelo mesmo
  composer, mas a UNIVERSO já teve de baixar o ganho da estrela de 1,6 para 1,15 porque *"228
  estrelas em 9 grumos"* somavam numa mancha branca. Uma camada aditiva nova mexe nesse equilíbrio,
  e o equilíbrio foi calibrado no olho.
- **FPS real.** Nada aqui é medida de FPS: `renderCost` é relógio de GPU por passada, e o
  `quadros` só prova que a cena não estava congelada. **Se o número de FPS importar, ele é medida do
  humano**, com `scripts/baseline.js` colado no console e a janela em primeiro plano.
- **Se o corpus real muda a tabela do §2.1.** Ele quase certamente a
  piora — mais sistemas dentro do mesmo `OCUPACAO` significa envelopes menores, e o comentário de
  `OCUPACAO` já prevê 5,8 unidades de envelope contra os ~14 do fixture. A conclusão sobrevive; a
  magnitude, não. **Refazer a tabela no corpus real é passo obrigatório antes de calibrar o piso.**

---

## 6. Prompt de handoff

```
CONTEXTO
Leia, nesta ordem: CLAUDE.md · docs/replanejamento-celeste.md §16 · docs/distancia-e-forma.md.
O diagnóstico está provado por medida em distancia-e-forma.md §2 e não precisa ser refeito para
o fixture. O que ele conclui: a cena UNIVERSO não tem representação de LONGE — 49,7 de 71 corpos
ficam abaixo de 4 px de raio no enquadramento de casa (150 un) e ZERO alcança 22 px, que é o menor
piso de pele desta base. Não é sombreamento; é pixel.

O QUE FAZER — passo 1, e SÓ ele
Uma camada de SPRITE para os corpos da cena UNIVERSO, reusando o shader de ponto de graph.js.
Não é morfologia nova: é a mesma feição já classificada, desenhada por quem esta cena tem — o
mesmo precedente da coroa da estrela e do anel do git, ambos já trazidos para universe.js pelo
mesmo argumento.

A LEI QUE O PASSO 1 TEM DE OBEDECER, e é a que decide o desenho:
  px_sprite = max(px_geometria, PISO)
O tamanho do sprite deriva do RAIO JÁ DESENHADO, nunca de `chunks` outra vez. `chunks` já decide
o raio de mundo (raioPorMassa); derivar o sprite dele de novo criaria DUAS leis de tamanho para o
MESMO fato — a lei nº 3 do replanejamento, e as duas divergiriam (log2 contra piso de banda).
Comece com PISO = 4 px de raio de framebuffer e leve à tela; o intervalo defensável é 3–8 px
(§5 diz por que a medida não escolhe dentro dele).
  ⚠️ ESTE PARÁGRAFO É HISTÓRIA — o passo 1 já foi executado, e a varredura posterior (§7.5)
  derrubou o "3–8": o intervalo é 2,5–4,0 e o 4 é o teto dele, não um ponto de gosto.

ARQUIVOS A TOCAR
  src/space/universe.js   a camada nova, os buffers por quadro, a sonda
  src/space/graph.js      SÓ para EXPORTAR o material/shader do ponto, se ele ainda não for
                          exportável. Nenhuma mudança de comportamento na cena AGENTE.
  src/main.js             a sonda nova em `spatia.universo`
NÃO TOQUE em: posição, raio de mundo, banda orbital, excentricidade, OCUPACAO, FRACAO_ESTRELA,
RAIO_MINIMO, LOD_FAR_PX, LOD_NEAR_PX. A REGRA DA FÍSICA: se dá para resolver fora da simulação,
resolve-se fora. Esta resolve.

O QUE NÃO FAZER
  · não baixar LOD_FAR_PX — refutado por medida (§4b): no enquadramento de casa o MAIOR corpo da
    tela tem 17,1 px e o menor piso da base é 22
  · não agregar sistemas de longe — vai na direção oposta ao relato (§4d)
  · não inventar um terceiro termo em brilhoDe() a partir da massa — massa já governa a escala

A GUARDA A RODAR
  node scripts/check-shaders.mjs        obrigatório, é shader
  node scripts/censo-superficies.mjs    prova que nenhuma pele ficou sem população
E, na cena viva, com a ABA VISÍVEL e `spatia.cena().quadros` avançando entre duas leituras:
  spatia.renderCost(30)

OS NÚMEROS QUE PROVAM QUE FUNCIONOU
  1. Sonda nova `spatia.universo.pixels()` — histograma do raio DESENHADO por corpo no
     enquadramento de casa. Ela precisa existir, senão "ficou melhor" volta a ser foto.
       ANTES  49,7 de 71 abaixo de 4 px · 0 de 71 acima de 22 px · máx 17,1 px
       DEPOIS 0 de 71 abaixo do PISO escolhido
  2. spatia.renderCost(30), buffer 3024x1484, DPR 2, fov 80:
       ANTES  geometria 0,236-0,272 ms · pós 2,325-2,339 ms · quadro 2,561-2,611 ms
       TETO   geometria <= 0,45 ms · quadro <= 2,80 ms
     Estourar o teto significa que o sprite está grande demais, não que a proposta é cara.
  3. spatia.cena().quadros tem de avançar entre duas leituras. Sonda congelada MENTE.

DEPOIS DO PASSO 1, E SÓ DEPOIS
  passo 2 — §4c: aro de atmosfera em CORPO_FS e emissão por atividade. Custo estimado +0,00 a
  +0,02 ms (mesma chamada de desenho; a carga de fragmento da cena inteira é 0,086% da tela).
  Ele conserta a faixa dos 8 aos 90 px, que é a outra metade do relato.
  passo 3 — refazer a tabela do §2.1 contra o CORPUS REAL antes de
  congelar o PISO. Mais sistemas no mesmo OCUPACAO dão envelopes menores: a conclusão sobrevive,
  a magnitude não.

ARMADILHAS DE BANCADA
  · document.hidden congela tudo. `osascript -e 'tell application "Google Chrome" to activate'`
    e cada medição INTEIRA numa chamada só.
  · depois de todo reload, clicar em IGNORAR.
  · FPS não se mede por automação. Se precisar, é medida do humano (scripts/baseline.js).
```

---

## 7. O que foi medido depois — e o que caiu

> Adendo de **2026-08-08**, mesmo corpus (`espatial_fixture`) e mesma máquina. O §1–§5 continua
> valendo; o que muda aqui é a *régua de duas saídas* e o *diagnóstico do relato paralelo*.

### 7.1 O instrumento: A/B no MESMO quadro

Medir uma condição por quadro **não funciona nesta base**. Entre duas amostras a câmera acomoda, o
corpo gira e a paralaxe anda: seis réplicas da **mesma** condição base espalharam o limbo entre
**13,6 e 27,0** — mais do que qualquer diferença entre tratamentos. Intercalar não salvou.

A saída é desenhar as condições entre dois `composer.render()`, sem soltar o quadro
(`scene.mesmoQuadro`, exposto como `spatia.peleAB` e `spatia.aroAB`). **Controle: 0 pixels de
diferença** entre a primeira e a última amostra da mesma condição. É esse zero que autoriza tudo
abaixo. Como não usa `rAF`, é a única medida desta base que não depende da aba estar visível.

⚠️ **Um uniform que não muda nada pode ser um uniform que não chegou** — o `check-shaders` não
compila GLSL. Antes de concluir "o termo não contribui", force um valor absurdo (`borda = 40`
acendeu 636.210 pixels; `−40` derrubou para 6.405). E cuidado com a **cena fria**: a primeira
leitura do A/B do UNIVERSO saiu com os três desenhos idênticos byte a byte porque a malha das
estrelas ainda não estava montada, 9 s depois de trocar de cena.

### 7.2 O relato paralelo ("o planeta em foco lê como transparente") — não é defeito de código

Estava registrado como suspeita do sprite esvaziando o miolo com `uHaloYield = 0`. **Refutado:** no
raio onde o núcleo do sprite teria PICO (`d ≈ 0,35`) o perfil tem um **mínimo local**, e luz aditiva
não produz mínimo. A corona sai junto — ela é multiplicada por `vIgnition`, zero fora de uma busca.

Os dois termos de borda da pele, isolados no mesmo quadro:

| condição | miolo (<0,30 R) | meio (0,30–0,70) | limbo (0,85–0,98) | fora (≥1,05) |
|---|---|---|---|---|
| base | 8,75 | 14,96 | **52,03** | 9,71 |
| sem limbo (fresnel²) | 8,94 | 15,12 | 49,80 | 10,38 |
| sem casca (aditiva) | 8,75 | 14,96 | 52,03 | **3,91** |
| **ambos 0** | 8,94 | 15,12 | **49,80** | 4,56 |

Com os dois em zero o limbo cai **4,3%**: nenhum dos dois é o autor. A **casca** age quase toda
fora da silhueta (−60% no `fora`, zero dentro) — a afirmação que já estava escrita no
`SHELL_FRAGMENT` agora está medida.

O autor é a **fase**: decompondo o limbo em 12 setores, ele varia **23,96×** entre o lado aceso e o
apagado, e **24,53× com os dois termos desligados**. O corpo em foco está iluminado por trás e o que
se vê é um **crescente** — disco escuro com uma borda acesa, que é exatamente a leitura "transparente".
Vale o corolário da REGRA DA FÍSICA: a física produziu o fenômeno esperado, então o que sobra é
**linguagem visual**, e mudar de onde vem a luz é decisão de composição do usuário.

⚠️ **Armadilha que me pegou:** média radial sobre um crescente **parece um aro**. Decompor em
setores separa os dois na hora (≈24× é fase; ≈1× seria aro). É a armadilha nº 5 do handoff em forma
nova — medir a grandeza errada parece medir.

### 7.4 ⚠️ A REFUTAÇÃO DE (b) CADUCOU — e por mudança de câmera, não por erro de medida

O §4b concluiu, com números secos, que *"a pele não é alcançável por zoom, só por foco"*. Aquilo era
**verdade sob a câmera daquele dia**: ela orbitava a ORIGEM a 150 unidades e o único jeito de se
aproximar de um corpo era travar nele. Em 08/08 a câmera do UNIVERSO passou a **chegar dentro de um
sistema** (âncora = voo livre, distância = envelope × 2,6 ≈ 19 a 25 unidades), e a premissa caiu.

Medido depois da mudança, **sem foco nenhum**, com a câmera dentro de um sistema:

| | valor |
|---|---|
| raio aparente P50 | **5,52 px** |
| P75 · P95 | 14,50 · 21,09 px |
| **máximo** | **91,34 px** |
| corpos ≥ 22 px (menor piso de pele) | **3 de 71** |
| corpos ≥ 90 px (piso de planeta/fotosfera) | **1 de 71** |

Contra o `0 de 71` em ambas as colunas que o §2.1 mediu. **A pele passou a ser alcançável sem foco.**

⚠️ **Mas o que bloqueia hoje não é mais pixel, é ARQUITETURA:** `photosphere`, `planet` e as outras
são objetos ÚNICOS, alimentados por `ancoraDoUniverso(focusedNode)`. A cena sabe desenhar **uma** pele,
a do corpo travado. "Ver a forma sem foco" é passar de uma pele para N — e a medida acima diz que N é
**pequeno e limitado** (3 corpos nesta pose, 1 deles com pele cheia), o que era exatamente a dúvida
que tornava a proposta cara. Não é mais a mesma proposta que o §4b recusou.

### 7.3 A régua da saída (c) mudou

`CORPO_FS` é meia-lambert puro (`0,10 + 0,90·d²`): **não há aro para afinar, (c) cria um.** Medindo
o único aro existente na cena (o `borda` do `ESTRELA_FS`): **+25,9% de luz total, +85% de pixels
acesos, 128.279 pixels alterados.** Potente — e ainda assim não responde o relato, porque na mesma
leitura a geometria tem **P50 1,55 px e máx 11,49 px**, e a conta fecha em ~639 pixels acesos por
corpo: **a diferença é bloom, não borda.** Vira brilho, não vira forma.

**Consequência para a ordem de trabalho:** a metade de (c) que ainda age onde os corpos vivem é a
**feição no SPRITE** (4 px, que é o piso), não o aro no corpo — e o §2.5 já mediu que 6 das 8 feições
do sprite rodam sobre fatos que esta cena carrega. População no fixture: supernova 3 de 71, anã
branca 7 de 71. **Não medido:** quanto disso sobrevive ao bloom num disco de 4 px.

### 7.5 O PISO NÃO É UM GRADIENTE — é um planalto e um despenhadeiro

O §5 entregava o piso ao olho dentro de **3–8 px**. Varrido de 2 a 10 px em passos de 0,5 no mesmo
quadro, em quatro poses (fixture, 74 corpos, `spatia.aroAB` lendo `universo.pixels()` por condição),
o intervalo não se comporta como uma escala contínua de gosto:

| pose | distância | geo P50 | 2,5 px | 3 | 3,5 | 4 | 4,5 | 5 | 5,5 | 6 | 7,5 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| longe | 260 | 0,86 px | 52 | 54 | 68 | 73 | 73 | 73 | 74 | 74 | 74 |
| **casa** | **150** | **1,19 px** | **52** | **52** | **52** | **52** | **61** | **69** | **73** | **73** | **74** |
| casa | 116 | 1,36 px | 52 | 52 | 52 | 52 | 55 | 61 | 68 | 73 | 73 |
| perto | 58 | 1,60 px | 49 | 52 | 52 | 52 | 52 | 55 | 59 | 66 | 73 |

*(corpos travados NO piso, de 74 — isto é, que perderam o tamanho próprio e desenham o do vizinho)*

Dois fatos, e o segundo é a decisão:

**52 de 74 estão abaixo de 2,5 px em TODA pose, e o número não se move.** É estrutural: são
exatamente a população que a camada de sprite existe para resgatar, e nenhuma escolha de piso os
devolve à hierarquia de tamanho. Quem lê "70% do céu travado" como custo do piso está lendo o custo
da DISTÂNCIA.

**Os 22 restantes são o que a escolha destrói.** De 2,5 a 4,0 px o custo é **zero** — os mesmos 52,
em três das quatro poses. De 4,5 em diante o céu colapsa num tamanho só: no enquadramento de casa,
4,5 leva 9 dos 22, 5,0 leva 17, 5,5 leva 21, e 7,5 leva todos.

> ⭑ **`PISO_SPRITE_PX = 4` é o TETO DO PLANALTO, não um valor de gosto dentro de uma faixa larga.**
> Ele é o maior piso que não custa um corpo sequer no enquadramento de casa e mais perto, e o
> intervalo defensável é **2,5–4,0**, não 3–8. Entre 3 e 4 a medida empata (52 nos dois) e a foto
> desempata: em 3 px os corpos pequenos ficam mais apagados sem comprar hierarquia nenhuma.

⚠️ **A ponta de cima do intervalo antigo está REFUTADA POR MEDIDA, não por olho.** O §5 supunha que
o teto (~8 px) fosse onde *"o sprite começa a cobrir a esfera"*; a varredura mostra que muito antes
disso — em 5 px — 91% do céu já desenha o mesmo diâmetro. **A mentira sobre tamanho não começa quando
o sprite fica grande; começa quando ele fica IGUAL.**

⚠️ **A borda do planalto anda com a pose, o planalto não.** A 260 unidades o último piso grátis é 3;
a 150 e 116 é 4; a 58 é 4,5. A FORMA (planalto + despenhadeiro) sobrevive às quatro; a posição da
borda é da pose, e por isso o passo 3 — **refazer contra o corpus real** — continua obrigatório: mais
sistemas no mesmo `OCUPACAO` dão envelopes menores, o que empurra a borda para a esquerda.

### 7.6 A "tangência" entre a chegada e o piso da pele NÃO EXISTE — e o que a inventou

Ficou registrado como pendência que `envelope × 2,6` punha o maior corpo em **84,2 px** contra um
piso de pele de **90**, *"os dois números quase se tocam"*, e que **um passo de roda acendia**. A
conclusão que se tirava dali era que amarrar os dois (*"chegar num sistema é a estrela dele ganhar
pele"*) seria uma linha de código.

Medido corpo a corpo nos 21 sistemas mapeáveis do fixture, o pixel do MAIOR corpo na chegada:

| | px na chegada |
|---|---|
| mínimo | **19,8** (`nucleo`, 14 corpos) |
| mediana | **48,5** |
| máximo | **69,9** (`atlas/config`) |
| **acendem a pele (≥ 90 px)** | **0 de 21** |

Nenhum sistema encosta no piso. A mediana está a **0,54× dele** — e chegar com pele acesa exigiria a
câmera a **0,36× da distância de hoje**, não um passo de roda. Não há tangência para amarrar: há uma
distância inteira entre as duas coisas, e ela é de propósito.

☠️ **O 84,2 era de outro corpo.** `universo.pixels().geometria.max` corre sobre TODOS os corpos do
céu, então o máximo é de quem estiver mais perto da câmera — um vizinho de passagem, não a estrela do
sistema adotado. Medido: parado no mesmo sistema, à mesma distância, `max` deu **18,2 px e logo
depois 9,2 px**, só porque as órbitas andaram. A leitura tinha a marcha perfeita e era da grandeza
errada — a armadilha nº 5 do `CLAUDE.md`, com roupa nova, e desta vez ela virou uma pendência
documentada que sobreviveu a uma sessão inteira.

> ⭑ **O instrumento que responde certo, e ele não pediu código novo.** `universeAttach` publica
> `alvoDeDistancia = k·raio / CHEGADA_PX`. Logo, para um corpo NOMEADO:
> ```
> px_chegada = alvoDeDistancia × CHEGADA_PX / (2,6 × envelope)
> ```
> **O `k` cancela** — a medida dispensa fov, altura de framebuffer e matriz de projeção, que são
> justamente as três coisas que já divergiram nesta base (`clientHeight` × `canvas.height`, a
> armadilha nº 10). E `anexar` é síncrono: os 74 corpos saem numa chamada, sem esperar voo nenhum.
> **Validado contra o comportamento do próprio código:** alvo 7,34 → **134,95 px medidos** na tela,
> contra o `CHEGADA_PX = 135` declarado, e a previsão de 48,5 px para a chegada bateu com os 48,4
> recalculados a partir dela.

**A decisão, e ela é de produto:** a cena já tem as duas poses, e elas dizem coisas diferentes.
`irPara` põe **o sistema no quadro** (envelope × 2,6); `anexar` põe **um corpo com pele** (135 px =
1,5× o piso). Amarrar a chegada ao piso não afina a primeira — ela vira a segunda, em todos os
sistemas. Fotografado no sistema mediano (`varredura/fotosfera`, envelope 7,86): a 20,44 unidades o
aglomerado inteiro cabe no quadro e nada tem pele; a 7,34 a fotosfera aparece em relevo, com anel e
luas, **e o resto do sistema sai do quadro**.

**Fica como está.** O que falta não é distância — é que chegar num sistema não conta a ninguém que
anexar acende a pele.

### 7.7 A câmera do UNIVERSO está em DERIVA — e ela envelhece COORDENADA, não só valor

Fora de foco e sem gesto, `orbit.targetAzimuth` anda sozinho todo quadro. Duas varreduras separadas
por uma chamada de JS leram os corpos em lugares diferentes (`geometria.p50` andou **1,68 → 1,52 →
1,45** sem ninguém tocar em nada), e um recorte de tela escolhido na primeira **caiu no vazio** na
segunda — a foto sai perfeita, do lugar errado, e nada no retorno acusa.

Congelar é um `wheel` de `deltaY: 0` no canvas: `Math.sign(0) === 0` deixa `targetDistance` intacto e
liga `userControlled`, que é quem desarma a deriva. ⚠️ **Congelar a câmera NÃO congela os corpos** —
as órbitas correm no `elapsed`. Para pose idêntica de verdade, **varredura e recorte saem da MESMA
chamada de JS**: entre dois `mesmoQuadro()` seguidos o `rAF` está bloqueado e nem o relógio anda.
