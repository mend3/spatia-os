# Medidas — números já medidos, NÃO remeça

> **Cada número aqui foi pago com tempo de sessão.** Remedir um deles é trabalho já feito; contradizer
> um deles sem medida nova é decidir contra o que a base já sabe.
>
> ☠️ **Todo número carrega DE QUE CORPUS e QUANDO, ou não vale.** Número sem procedência não
> envelhece — apodrece, porque nada acusa quando ele deixa de valer. *"o fixture tem 14 arquivos"*
> sobreviveu até virar 71; *"74 arquivos · 2.606 pontos"* virou 72 · 2.514 e continuou sendo citado.
> ⭑ **A saída é dizer de onde o número SAI**, para quem ler poder refazê-lo: *"a contagem do dia vem
> do `/api/graph`, nunca deste parágrafo"*.
>
> ⚠️ **Constante calibrada EXPIRA; grandeza de posto PIORA SOZINHA.** São defeitos diferentes:
> `SPAN` e `DENSITY_K` funcionaram e venceram (a conta de refazê-las está no comentário de cada
> uma); percentil de cauda nunca varreu nada e encolhe conforme o corpus cresce. Ver
> [`armadilhas.md`](./armadilhas.md) B-21.
>
> O ambiente em que estes números foram tirados está no §0 de [`HANDOFF.md`](./HANDOFF.md) — medida
> contra o corpus errado responde com convicção total sobre um céu que ninguém está vendo.

## Os números

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

**QUANTOS FATOS POR HORA ESTE SISTEMA EMITE SOZINHO — a medida que decide o Modo Assistir**
(09/08, fixture servido, servidor de pé). ☠️ **`/api/system-events` entregou 0 eventos em 301 s**,
com 301 pings de keep-alive na mesma janela — e 301 s é exatamente a janela da Regra dos Cinco
Minutos. **Não é acaso de amostra; é estrutura**, e os cinco observadores de `ambient.py` dizem por
quê:

| observador | dispara quando | hoje |
|---|---|---|
| `index` | idade ≥ 30 d (`recency.CHURN_WINDOW_DAYS`) | **impossível** — `index_age_days: 0`, faltam 30 dias |
| `credential` | `expires_at` a ≤ 24 h | **impossível** — nenhum provedor declara `expires_at` |
| `graphdb` | Neo4j cai ou volta | de pé (62 corpos · 208 vínculos); só dispara por queda |
| `corpus` | `fingerprint`/`files`/`chunks` mudam | **eco de um comando humano** (reindexar) |
| `topology` | `as_of` de influência/uso/alcance muda | **eco de um comando humano** (rodar o script) |

O outro produtor da fila é `webhooks`, e ele exige `WEBHOOK_SECRET_<FONTE>`: **zero configurados**
no `.env` e no ambiente, então `deliver` recusa tudo com 401. ⭑ **O diário concorda:** 130 registros
em 21,9 h de janela nos três dias (7,3 · 10,8 · 10,0 por hora), e **os quatro tipos são 100% eco de
gesto** — 63 `boot` + 45 `shutdown` (alguém reiniciou o `serve.py`), 55 `denial` e 22 execuções
(alguém perguntou). ⚠️ A contagem do dia sai do `.cache/journal/*.jsonl`, nunca deste parágrafo.

> **A conclusão que fecha o T-16:** o produtor ambiental está certo — dispara por TRANSIÇÃO, e
> transições legítimas são raras. **Uma superfície que assista a essa fila assiste ao VAZIO**, e o
> Princípio Final proíbe: ela CRIA a pergunta *"por que não acontece nada?"*. Modo Assistir **não é
> um modo** (ver a AFERIÇÃO, abaixo).

**A AFERIÇÃO — os pontos de subsistema afirmavam o presente com uma leitura do BOOT** (09/08).
`/api/health` era chamado **uma vez** (`main.js`, no boot) e o cabeçalho repintava aquele valor a
cada 1 s, para sempre: cinco minutos parado deixavam MEMORY verde sobre um Qdrant que podia ter
caído no minuto dois. ☠️ **Não era `notice` faltando** — falha de serviço é o evento `error`, que só
existe dentro de uma pergunta, e o vigia observa corpus, topologia, índice, Neo4j e credencial,
**nunca qdrant/ollama/TTS**. Era afirmação sem substrato e sem dono.
⭑ Hoje `watchHealth` afere a cada `AFERICAO_MS`, e a idade da leitura fica colada nos pontos;
vencida (3 aferições perdidas), o grupo declara `data-afericao="vencida"` e para de afirmar agora —
**sem apagar o que foi medido**. `/api/health` custa **0,02 s** medido três vezes no `curl`, então
120 chamadas/h são ~2,4 s de servidor por hora.
⚠️ **`AFERICAO_MS` é TRANSCRITO de `ambient.SCAN_SECONDS`**, não escolhido: aferir mais fino que o
vigia afirmaria um frescor que não existe em lugar nenhum do sistema. `lei-afericao.mjs` §9 compara
os dois.
☠️ **São TRÊS idades nesta tela e nenhuma é a outra** — a célula `ÍNDICE` mede DIAS do corpus, a
`.aviso-age` mede o FATO de um aviso de pé, e a aferição mede quando o cliente OLHOU. Rampas e
símbolos separados de propósito; o oráculo §10 reprova quem emprestar os do vizinho.

**Céu (corpus vivo, 08/08):** 188 corpos · 203 nós · uma estrela por sistema.
`CO_EDITED` 897 pares (85,1%) · `SIMILAR_TO` 1.504 (**k=8 derivado** — k=5 deixa 10,6% de isolados,
acima do corte de 10%) · `REFERENCES` 452 (88,8%) · `IMPORTS` 313 (59,6%) · `ABOUT` 100 conceitos /
130 arestas (**só 16 ligam dois corpos**) · `TOUCHED` 0 (as execuções antigas citam o corpus morto) ·
Spearman(grau, pagerank) 0,898.

⚠️ **`k` e Gini são propriedades DAQUELE corpus e não transferem.** O critério que decide é a cobertura.
⚠️ **`ABOUT` é a única dimensão que não é FATO** — toda aresta carrega `modelo` e `as_of`, e o painel
escreve *"inferido por qwen3:8b — não é medida"*. Apagar tudo o que veio de inferência é uma consulta só.

**`connectivity` é ALCANCE**, não grau: o grau repetia a centralidade (ρ 0,821). O alcance dá ρ −0,083
com centralidade, 0,040 com massa, 0,130 com atividade no vivo (0,209 · −0,473 · −0,540 no fixture de
09/08) — mede a parte da relação que a POSIÇÃO não comunica. **As candidatas recusadas estão gravadas
no snapshot com o ρ de cada uma**, para ninguém remedir.

☠️ **O ρ alto com o TAMANHO do sistema NÃO é o filho único — está medido, não reabra.** Agrupando
como a cena agrupa (nós `type === 'dir'` do `/api/graph`, que é o que `conectividade.mjs` faz hoje),
o corpo solitário passa a ser do REPO e **0 de 59 corpos do fixture mudam de alcance** (ρ com o
tamanho **−0,808 → −0,806**; no vivo **3 de 188** mudam e o ρ vai de −0,654 a −0,652). A correlação é
MECÂNICA: alcance é fração sobre o sistema, então pasta grande retém vizinho por aritmética.
⭑ **Quem julga a dimensão é o NULO** — o alcance de um corpo cujos vizinhos fossem sorteados no céu
inteiro, `1 − (tamanho − 1)/(corpos − 1)`. Medido: ρ(alcance, nulo) **0,793 no fixture** (o script
publica) e **0,611 no vivo**; o resíduo (alcance − nulo) × centralidade dá 0,241 no fixture e 0,078 no
vivo. **A dimensão sobrevive pelo vivo**,
onde sobra variação própria (dentro de um mesmo sistema de 39 arquivos o alcance vai de 0,091 a
0,711); ⚠️ **o fixture não a julga** — o Neo4j dele só tem `CO_EDITED` (nenhum `SIMILAR_TO`,
`REFERENCES` ou `IMPORTS`), 62 nós `Astro` para 72 corpos, e o alcance ali é quase só contenção.
⭑ **O vivo se mede sem trocar o `.env`** (`a.corpus`/`r.corpus` no Neo4j), mas o agrupamento tem de
ser TRANSCRITO de `graph._hierarchy` — só o `/api/graph` do céu servido publica os nós `dir`. A
transcrição vale onde o Neo4j tem TODOS os corpos (vivo: 188 = 188) e mente onde não tem (no fixture
ela acusa 5 mudanças onde o fato são 0).

**Rede da seleção:** 4.226 vínculos · grau MED 26 · P90 56 · máx 182 · **teto 28 arcos** · 42% truncados
(o corte é publicado). `TOUCHED` fica fora porque liga `Run → Astro` e as duas pontas não são corpos.

**A FORÇA do vínculo é da UNIDADE, e o piso do tipo NUNCA vale zero** (09/08, `vizinhanca.mjs`).
Contagem sai `v/(v+1)` (1 → **0,500**, 4 → 0,800, 21 → 0,955); cosseno sai identidade. O que a
normalização por extremos observados produziria, medido nos dois corpora — é por isso que ela está
refutada (`armadilhas.md` §B-21):

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

**O PRETO DA CENA AGENTE ERA O BUFFER, e o A/B está fechado** (09/08, `readPixels` 256×256 no centro
de um buffer 2582×1484, mesma sequência nos dois tratamentos, seis idas UNIVERSO → AGENTE cada):

| tratamento | idas com ZERO pixel aceso | pixels acesos quando desenha |
|---|---|---|
| **sem** fixar o par | **4 de 6** (`luz` 0 exato) | 13,1–13,2 mil |
| **com** o fixador | **0 de 6** | 11,7–14,2 mil |

☠️ **O discriminante é o BUFFER, não a paridade da ida:** os 4 pretos saíram com `leitura: rt1` e os
2 acesos com `rt2` — 6 de 6. A paridade ACUMULA entre idas, então contar quadros por ida engana;
quem responde é `spatia.cena().composicao` (`gravaACena` · `escreveALente` · `realimentacao`).
⚠️ **Zero aqui é ZERO** — 65.536 pixels somando 0, não "escuro". É o que separa este defeito de uma
câmera apontada para o vazio, que desenha pouco e não desenha nada.

**Teto de driver:** `ALIASED_POINT_SIZE_RANGE = [1, 511]` nesta máquina. O teto é verdade sobre PIXEL e
mentira sobre GEOMETRIA — derivar tamanho de mundo do valor com teto trava o corpo em 153,3 px para
sempre.

**Populações da Fase D — ⚠️ o fixture MUDOU em 09/08** (`varredura/pulsar/` saiu; ver `roadmap.md`):
fixture de hoje é **72 corpos · 2 514 pontos · 20 nós `dir`**, com
**21 fotosfera · 47 planeta · 2 cometa · 1 pulsar · 1 sem pele**.
Vivo 17 · 151 · 9 · 11. Corpus real: fotosfera 665 · estação 456 · planeta 360 · galáxia 223 ·
cometa 99 · nebulosa 40 · **pulsar 0** (só se julga na bancada ou no fixture).
⚠️ Os números antigos do fixture (71 ou 74 corpos, 22 fotosferas, 44 planetas) aparecem em medidas
mais velhas deste documento e **são daquele corpus** — a FORMA das conclusões sobrevive, a
magnitude não. Quem reconferir uma tabela antiga confere contra 74, não contra 72.

---

## INVENTÁRIO DA HUD POR ROTA — as 10 rotas do menu, medidas na TELA (09/08)

Varrido por `bancada-hud.html` (`bancada.rotas()`), que monta o `index.html` de verdade num
`<iframe>` e percorre os endereços. Janela **1426×712**, grade de 12 px, **7 021 pontos** por rota,
corpus `espatial_fixture`, corpo `bloco-04.md` travado.

⚠️ **Três grandezas, e elas não se substituem.** `texto` e `tinta` são desta bancada (glifo e
superfície); `ponteiro` é `spatia.hud().ponteiro.fracaoReivindicada`, do app, e responde *"o gesto
de órbita morre aqui?"*. Céu limpo é o que não é nem texto nem tinta.

| rota | montados | recolhidos | não montados | ausentes | texto | tinta | céu limpo | ponteiro |
|---|---|---|---|---|---|---|---|---|
| raiz | 9 | 6 | 37 | **0** | 5,4% | 6,2% | 88,4% | 7,9% |
| files | 8 | 4 | 38 | **0** | 5,0% | 8,6% | 86,4% | 12,9% |
| system | 9 | 2 | 37 | **0** | 11,1% | 14,7% | 74,2% | 31,0% |
| web | 7 | 3 | 39 | **0** | 5,0% | 6,2% | **88,8%** | 11,4% |
| bridge | 8 | 3 | 38 | **0** | 9,1% | 8,3% | 82,6% | 22,1% |
| **journal** | 9 | 4 | 37 | **0** | **24,7%** | 15,1% | **60,2%** | 28,4% |
| metrics | 9 | 4 | 37 | **0** | 10,3% | 16,6% | 73,1% | **33,1%** |
| security | **10** | 3 | 36 | **0** | 11,1% | 9,7% | 79,1% | 29,6% |
| activity | 8 | 2 | 38 | **0** | 6,3% | 7,8% | 85,9% | 13,2% |
| storage | 7 | 2 | 39 | **0** | 10,1% | 15,1% | 74,8% | 31,0% |

⭑ **`ausentes: 0` nas DEZ, e isto é prova de TELA para o que só tinha oráculo.** «Ausente» é
declarado-e-não-montado — o defeito que T-48 fechou. `scripts/lei-residentes.mjs` provava por
perturbação, sem navegador; agora o app montado concorda em todas as rotas.

☠️ **`journal` é o extremo por uma margem grande:** 24,7% de texto (2,4× a mediana) e **60,2% de céu
limpo**, a única abaixo de 74%. Quem for discutir "a HUD ocupa demais" tem de discutir ESTA rota —
na raiz o mesmo argumento fala de 5,4%.

☠️ **O ponteiro varia 4,2× entre rotas — 7,9% na raiz contra 33,1% em `metrics`.** É a grandeza de
INTERAÇÃO: em `metrics` um terço da tela CANCELA órbita e zoom, e isso não aparece em texto nem em
tinta (a rota tem só 10,3% de glifo). Três grandezas, três respostas — trocá-las fabrica número
plausível e falso.

⚠️ **«recolhidos» é estado do OPERADOR e persiste ATRAVESSANDO a rota** (`espatial.collapsed.v1`,
`kernel/widgets.js`). A coluna descreve ESTA máquina, não um app recém-instalado — e o acordeão
recolhe os irmãos ao abrir um, então «todos abertos» não é alcançável pelo gesto normal. O número
fica publicado em vez de normalizado: normalizar esconderia justamente a variável que faz duas
pessoas verem telas diferentes.

⚠️ **`naoMontados` fica entre 36 e 39** de ~46 widgets do catálogo — a maior parte do vocabulário
não está no ar em rota nenhuma, por desenho. Não confundir com `ausentes`.

⭑ **Os três residentes aparecem nas dez**, e a tela concorda com `RESIDENTES` (`apps/residentes.js`):
`TIMELINE PERFIL REAL` (left), `CONTEXTO SOB ATENÇÃO` (right) e `JANELA DO TEMPO ÚLTIMO COMMIT`
(strip). ⚠️ O palco monta 1–2 molduras **sem título** em toda rota — é o painel de palco, e é por
isso que a régua dele é a do corpo e não a do trilho (T-51).

⚠️ **Estes números descrevem o app OCIOSO na rota:** `palco` sai 0,0% de texto porque não há
documento aberto nem resposta na tela. A composição que motivou a discussão (documento + resposta)
mede MAIS, e a bancada ainda não a dirige — mas o APP já foi dirigido até lá, na tabela abaixo.

---

## O UPLOAD DO ATLAS DE GLIFO — o buraco que o `hud-e-canvas.md` §5.1 declarava sem número

WebGL2 com `EXT_disjoint_timer_query_webgl2`, 60 repetições por medida, aba visível e em foco.
Atlas monoespaçado de 95 glifos, célula de 20 px (corpo 18 px = 9 px CSS a dpr 2).

| operação | µs por chamada |
|---|---|
| base: só o desenho do quad que amostra | 32,5 |
| `texImage2D` do atlas inteiro (512² e 1024²) | **175–257** |
| **`texSubImage2D` de uma faixa 1024×20** | **7,6** |
| repintura do canvas 2D inteiro (CPU, antes de subir) | 43,5 |

⭑ **A saída barata EXISTE e é CONDICIONAL: o upload tem de ser por REGIÃO.** Contra o bolso barato
do UNIVERSO (**230 µs** de geometria), 7,6 µs por token é 3,3% — cabe. Já **175–257 µs por token
consome o bolso inteiro**, e a HUD reescreve a resposta a cada token (`hud/answer.js` redesenha a
resposta INTEIRA). ☠️ **O port ingênuo é o caro:** portar `answer.js` como está, redesenhando tudo,
é justamente o caso de 175–257 µs. O atlas só é viável INCREMENTAL.

⚠️ **A banda 175–257 µs é banda, não ponto, e o motivo está medido:** `texImage2D` REALOCA o
armazenamento, e alternar 512²/1024² entre medidas contamina cada uma com a realocação da anterior
— por isso 512² sai mais caro que 1024² na tabela, que é impossível por pixel. O número que decide
é o da SUB-REGIÃO, que não realoca e por isso sai limpo.

☠️ **DOIS MÉTODOS FORAM REFUTADOS ANTES DESTE, e ficam escritos para ninguém repetir:**

| método | por que não mede |
|---|---|
| `gl.finish()` em volta do upload | **não força o trabalho** na arquitetura de command buffer do Chrome. Deu 1024² inteiro em **0,5 µs** — 4 MB a 8 TB/s, e mais rápido que o 512². Número plausível e falso |
| `readPixels` como sincronia dura | funciona, mas tem **piso de 298 µs** que engole o sinal: a diferença entre com e sem upload some no ruído, e a ordenação sai invertida |

⭑ O único instrumento que responde é a **query de tempo de GPU**. Ela está disponível neste
navegador, e é ela que produziu a tabela.

---

## O CUSTO DO VIDRO — o número que decide o launcher (fixture, 1426×742, dpr 2, buffer 2852×1484)

### A folga do quadro é de CENA, e as duas não se parecem

| cena | `comCadeia` | `semCadeia` (só o céu) | `custoDoPos` | folga de 8,33 ms |
|---|---|---|---|---|
| raiz · UNIVERSO (lente desligada) | **3,76 ms** | 0,23 ms | 3,54 ms | ~4,6 ms |
| AGENTE (lente ligada) | **8,47 ms** | 1,97 ms | 6,50 ms | ☠️ **estourado** |

⚠️ **Uma superfície que vale em QUALQUER rota é orçada pela cena PIOR**, não pela média. O launcher
é `Ctrl+K` em toda tela, então quem decide é a linha do AGENTE.

### Vidro por CSS — medido, e com CONTROLE POSITIVO

Intervalo entre quadros (`requestAnimationFrame`), 5 s por estado, aba visível e janela em foco.
☠️ **A grandeza NÃO é `renderCost`**: ele é timer de GPU do `three`, e `backdrop-filter` roda no
COMPOSITOR, fora do laço de render. Confirmado — 3,763 ms sem o vidro contra 3,772 com ele, ruído.

| estado | p50 | p95 | máx | quadros perdidos (>12 ms) |
|---|---|---|---|---|
| sem vidro | 8,3 | 10,0 | 11,3 | **0** de 597 |
| vidro do launcher (428×326, `blur(12px) saturate(1.4)`) | 8,3 | 10,0 | 10,9 | **0** de 597 |
| **CONTROLE: tela cheia, `blur(40px)`** | 8,3 | 9,8 | 11,1 | **0** de 597 |
| volta ao sem vidro | 8,3 | 10,1 | 10,6 | **0** de 598 |

⚠️ **O CONTROLE POSITIVO também não moveu, e é ele que torna o resultado lível.** Sem um estado
propositalmente caro, «não custa nada» é indistinguível de «a sonda não discrimina». Um blur de
tela cheia a 40 px não derruba um quadro — o compositor acompanha.
⚠️ **O que esta medida NÃO dá é um NÚMERO para o blur.** Cadência de `rAF` só enxerga o que estoura
o vsync; abaixo disso ela devolve o teto do monitor. O que fica provado é o TETO: *menos do que
derrubar um quadro em 5 s*, com o blur mais caro que faz sentido desenhar.

### Vidro 3D — recusado por ARITMÉTICA, sem medida nova

Vidro real por transmissão/FBO exige a cena renderizada para uma textura que o vidro amostra: **um
segundo render da cena**. Ele custa `semCadeia`, que é **1,97 ms no AGENTE** — sobre um quadro que
já usa **8,47 de 8,33 ms**.

⭑ **A decisão sai daqui e não precisa de espécime:** o launcher leva vidro de CSS. A refutação do
canvas para os 46 widgets (`hud-e-canvas.md` §7) continua sendo sobre outra coisa — 521 `el()`, 17
corpos de fonte, 26 `aria-*` — e não é ela que decide isto; quem decide é o orçamento.

---

## O ORÇAMENTO DE ALTURA POR FENDA — as 10 rotas, carga fria (fixture, 1426×742)

`spatia.hud().fendas[].orcamento`. Três grandezas, e elas respondem coisas diferentes:

| grandeza | pergunta | o que ela acusa |
|---|---|---|
| `pisoPx` | o que os abertos exigem para todos continuarem AFIRMANDO — uma linha e o rótulo, cada | `cabe: false` → alguém VAI parar de afirmar. **Defeito** |
| `pedidoPx` | o que o conteúdo deles PEDE (`scrollHeight`) | `pressao > 1` → há rolagem ou poda. **Não é defeito** |
| `espremidos` | quem já está desenhando menos que uma linha | montado, aberto, e sem pixel. **Defeito** |

⭑ **31 fendas com aberto nas 10 rotas: `espremidos` 0 e `cabe: false` 0.** O acordeão está
segurando — a régua não achou defeito vivo, e agora isso é uma medida em vez de uma suposição.

⚠️ **DUAS fendas pedem mais do que recebem**, e as duas são o palco:

| rota · fenda | abertos | altura | pedido | pressão |
|---|---|---|---|---|
| **`journal` · stage** | 2 | 441,5 px | 682 px | **1,54** |
| `storage` · stage | 2 | 441,5 px | 528 px | 1,20 |
| `storage` · right | 2 | 441,5 px | 398 px | 0,90 |
| `security` · strip | 1 | **42,2 px** | 33,5 px | 0,79 |

☠️ **`journal` é a rota mais pressionada, e é a MESMA que o inventário da HUD já apontava como a
mais pesada** (24,7% de glifo · 60,2% de céu). Duas grandezas independentes — fração de glifo e
pressão de altura — nomeando a mesma tela. É a ordem por ganho que T-71 precisa, agora com dois
apoios em vez de um.

⚠️ **`security` · `strip` é a fenda mais APERTADA em termos absolutos:** 42,2 px de altura contra
um piso de 31,7 px para UM widget. Ela comporta um aberto e nada mais — um segundo residente ali
derruba `cabe` na hora.

---

## O DOCUMENTO ANCORADO NO CORPO — a composição que faltava, medida no APP (09/08)

☠️ **A linha acima dizia que esta composição não tinha número.** Ela tem: o app foi levado à mão
até *documento aberto sobre corpo TRAVADO* — `#/files/…/remanescente.md`, pele `pulsar`, raio
aparente **173 px**, janela **1426×742**, `spatia.hud()` com passo 16 px e **4 230 pontos**, aba
visível e em foco. Não é a bancada: é o app, dirigido.

**Antes (o palco no lugar do flex):** `painelDePalco.widget` `fs-content` · caixa **13,49%** da
janela · **574 pontos** ao ponteiro · céu ao canvas **64,4%** · reivindicado **32,4%**.
Custo do quadro no UNIVERSO: `comCadeia` **6,693 ms**, `semCadeia` 1,972, `custoDoPos` 4,721.

**A/B da âncora, MESMA cena e mesmo quadro** — o `transform` neutralizado por uma regra `!important`
e depois removida, com a leitura voltando ao valor exato:

| grandeza | sem âncora | com âncora | volta |
|---|---|---|---|
| céu ao canvas | 64,92% | **70,45%** | 70,45% |
| reivindicado | 31,87% | **26,34%** | 26,34% |
| palco AO PONTEIRO | **533 pontos** | **533 pontos** | 533 |
| fenda `right` | 432 | 198 | 198 |
| `conservacao.bate` · `desconhecidos` | ✓ · 0 | ✓ · 0 | ✓ · 0 |

⭑ **`palcoAoPonteiro` NÃO MUDA — 533 dos dois lados, e é esse o número que fecha T-51.** Ancorar
MOVE a caixa que já pintava; não cria superfície nova sobre o céu. A regra continua *quem pinta
reivindica, quem só posiciona cede*, e a moldura segue em `pointer-events: none`.

⚠️ **Os 5,5 pontos de céu a mais NÃO são área devolvida — são sobreposição.** O documento passa a
cobrir o painel de CONTEXTO (fenda `right` 432 → 198), e pontos antes contados na direita passam a
ser do palco. Isso está na ORDEM que a REGRA DO FOCO pede (② conteúdo do objeto acima de ④ contexto),
mas é consequência, não desenho: quem for mexer no trilho direito começa por aqui.

☠️ **A OCLUSÃO NÃO CUSTA, e `renderCost` NUNCA responderia isso** — ela é timer de GPU, e a âncora é
CPU. Medida pelo que ela FAZ por quadro (achar o painel, ler a caixa, escrever duas variáveis),
2 000 repetições: **0,9 µs por quadro**, contra os **8 333 µs** do orçamento a 120 Hz — **0,011%**.
FPS travado em 120,0 antes e 120,5 depois, o que não discrimina nada e por isso não é a medida.

⚠️ **E o limite geométrico está medido, não escondido:** com o pulsar em 173 px de raio (346 px de
disco) e o painel com 662 px de largura numa janela de 1426, não cabe corpo + folga + painel. O
painel encosta na borda (`ancora().noTeto: true`) e SOBREPÕE a metade direita do astro. A caixa
continua inteira dentro da janela — `[752, 257, 1414, 472]` —, que é a invariante que `lei-ancora.mjs`
§6 guarda.

☠️ **Teto sobre o DESLOCAMENTO é PROXY e passa verde com o defeito na tela:** `dx = −484,8` cabe num
teto de 34% da janela e põe a borda esquerda do painel em **−102 px**. Quem responde é a caixa
pintada contra a janela.

### O que a LUZ custa — o gradiente que dá profundidade e paralaxe

Mesmo enquadramento; `spatia.ancora().luz.repinturas` contra `requestAnimationFrame` contado à mão.
A grandeza é REPINTURA, e não FPS: o quadro está travado no teto do monitor (120 Hz) nos quatro
estados, então FPS não discrimina — o que se gasta sai do orçamento, que nesta cena não tem folga.

| estado | quadros | repinturas | por quadro |
|---|---|---|---|
| em repouso | 601 | **0** | 0 |
| roda (zoom, raio aparente 173 → 241 px) | 480 | **0** | 0 |
| arraste de órbita, painel PRESO na borda | 292 | 3 | **0,01** |
| voo de chegada ao corpo (a luz atravessa o painel) | — | 28 | — |

⭑ **Zero em repouso e zero no zoom, e as duas por motivos DIFERENTES.** Em repouso nada se move.
No zoom a luz não anda porque o painel acompanha o corpo, e a força já está SATURADA (o pulsar passa
de `LUZ_PLENA_PX`), então crescer o raio aparente não muda a superfície iluminada. Saturar é o que
transforma metade dos gestos de câmera em custo zero.

⚠️ **O paralaxe só existe com o painel PRESO na borda** — enquanto ele acompanha o corpo, a luz fica
parada sobre a caixa e não há profundidade a revelar. É o mesmo mecanismo, não um segundo.

---
