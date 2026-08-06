# Catálogo celeste — proposta de taxonomia

É a proposta que saiu da pesquisa encomendada depois de o usuário notar, corretamente, que **anel é
de planeta, não de estrela** — e que o problema é mais fundo que nomenclatura: o céu chamava todo
arquivo indexado de "estrela", o que não deixava vocabulário para dizer que uma coisa é feita de
outra, que uma orbita outra, ou que uma esfriou.

O documento existe porque a pesquisa é cara e o raciocínio se perde. O que for implementado sai
daqui e vira comentário no código.

## Como este documento está organizado

| parte | o que é | data |
|---|---|---|
| **A taxonomia** (daqui até "Ordem de adoção") | que corpo existe, de que fato ele nasce, que regra física o rege — a pesquisa que saiu da pergunta sobre anéis | 2026-08-05 |
| **Os três corpos definidos por comportamento** | galáxia, quasar e pulsar: o que cada um É, em que escala, e como se encaixam | 2026-08-06 |
| **Reestruturação da morfologia** | o que a cena faz de errado com esses três, e em que ordem consertar | 2026-08-06 |

A segunda parte é a FONTE da terceira. Se as duas discordarem um dia, a segunda é a física e a
terceira é a decisão — muda a terceira.

**Estado em 2026-08-06:** planeta anelado e supernova estão no céu; cometa extinto passou a
classificar (segunda janela de churn), com superfície mas ainda sem cauda; **lua entrou** (40 corpos,
106 luas, órbita elíptica e sem colisão — a regra e as medidas em `src/space/orbital-zones.js`; a
contagem caiu de 278 quando o piso de legibilidade passou a medir contra a órbita externa, que é
quem fixa a distância da câmera); zonas por razão de massa continuam só aqui, mas `μ ≥ 5` já é
usado como o corte que separa lua de sistema duplo. **A galáxia passou a poder ser rotacionada**
(`e40373c`): em foco o disco vira MUNDO e responde à órbita, fora de foco continua billboard. O
`status` de cada entrada em `src/space/catalog.js` é a fonte da verdade — nenhuma mente sobre
estar pronta.

⚠️ **Duas coisas que o olho apontou em 2026-08-06 e que este documento ainda não resolve:** as
galáxias estão **flat** (girar já revela a pose; volume não existe — o disco é uma folha de
espessura zero) e **há galáxias que também são quasares**, que é o item da "Reestruturação da
morfologia" abaixo, agora com a metade de ESCALA junto.

> **Este documento é a TAXONOMIA** — que corpo existe, de que fato ele nasce, que regra física o
> rege. Como isso vira pixel (forma, escala, modificadores, composição e animação) é o
> [modelo de renderização](modelo-de-renderizacao.md), em seis estágios. A separação é recente e
> deliberada: quando semântica, física e estado disputam a mesma dimensão visual, nenhuma das três
> informa mais nada.

---

## A regra que reorganiza tudo

> **Massa decide a classe. Composição decide o tipo.**

A anã marrom tem composição **idêntica** à de uma estrela e não é uma — falha só por massa
(13 M_J acendem deutério; 80 M_J acendem hidrogênio). A cena hoje faz o contrário: decide tudo
por `kind`, que é composição. Por isso um `.md` de 2 chunks e um `.md` de 226 chunks são a mesma
coisa no céu.

## Sobre anéis, que originou a pergunta

O instinto estava certo, e a razão é melhor que "anel é de planeta":

- **Corpos pequenos TÊM anéis** — Chariklo (ocultação em 03/06/2013), Haumea (2017), Quaoar
  (2022), Chiron (em formação). Quaoar é a anomalia: anel a **7 raios** do corpo, mais que o
  dobro do limite de Roche, onde o material já deveria ter acretado.
- **O que não tem anel planetário é ESTRELA.** Estrela tem *disco de detritos*, varrido por
  pressão de radiação e arrasto de Poynting-Robertson.

Ou seja: a correção não é "só planeta tem anel" — é que **estrela não tem**, e hoje é
exatamente nelas que penduramos anéis.

⚠️ **A idade dos anéis de Saturno está em disputa aberta**: 10–100 Myr pela Cassini (2019) contra
~4,5 Gyr por Hyodo et al. (*Nature Geoscience*, 16/12/2024). Se algum texto da UI afirmar idade
de anel, tem que ser em condicional.

## Três conceitos que se confundem — e nós usamos o errado

| Conceito | Depende de | O que rege |
|---|---|---|
| **Limite de Roche** | razão de **densidades** | despedaça o satélite → rege o **anel** |
| **Lóbulo de Roche** | razão de **massas** | transferência de massa em binário |
| **Esfera de Hill** | `m/3M` **e o semieixo** | captura e estabilidade → rege a **lua** |

`r_H = a(1−e)·∛(m/3M)`. O detalhe que importa: a esfera de Hill de **Netuno** (115 milhões de km)
é **maior** que a de Júpiter (50,6 milhões), apesar de muito menos massa — porque a dependência
no raio orbital é linear e a da massa é raiz cúbica.

**Consequência para a cena:** se `sections` virarem luas, o raio da órbita delas tem de crescer
com o **raio orbital do corpo**, não só com `chunks`. Como raio já é recência, um arquivo antigo
(periferia) seguraria suas seções em órbitas mais largas que um arquivo novo e pesado. Sai de
graça e é fisicamente correto. E: **todas as 19 luas arredondadas do Sistema Solar estão travadas
por maré** — luas não devem ter rotação própria.

## Zonas por razão de massa, não classes por tamanho

Corpos não orbitam uns aos outros — ambos orbitam o **baricentro**. Se ele cai dentro do
primário, o primário oscila; se cai fora, é sistema duplo. Sol–Júpiter põe o baricentro a
1,07 R☉, logo **acima da fotosfera**. Plutão–Caronte tem razão de massas 0,1218 (a maior do
Sistema Solar) e baricentro a 1,78 raio plutoniano, **fora do corpo**.

Daí saem três zonas com regra física, medidas neste corpus:

| Zona | Regra (μ do corpo mais pesado) | Análogo | Contagem |
|---|---|---|---|
| **Sistema com primária** | μ ≫ 1 | Sol–Júpiter | 8 zonas com μ≥5 |
| **Sistema duplo** | μ ≈ 1 | Plutão–Caronte | 32 zonas com 1≤μ<5 |
| **Família colisional** | μ ≪ 1 | família Vesta | 30 zonas |

Isso substitui classes de corpo por classes de **zona**, que é onde a informação está. Resolve o
problema de "planeta anão" abocanhar 180 dos 388 corpos.

⚠️ **IAU 2006, texto literal: a resolução 5B foi derrotada.** Planeta anão **não** é subtipo de
planeta. Se o catálogo usar o termo, ele não pode ler como "planeta menor".

## O melhor sinal do lote: cometa extinto

> **Cometa extinto = churn ALTO numa janela ANTIGA + recência BAIXA.**
> Um arquivo que foi muito trabalhado e depois esfriou.

O análogo é real e documentado: 107P/Wilson–Harrington foi descoberto **como cometa com cauda**
em 19/11/1949, redescoberto **como asteroide** em 1979, e só em **1992** confirmou-se que eram o
mesmo objeto. Cometas da família de Júpiter ficam ativos ~10.000 anos e depois selam a superfície
com uma crosta refratária.

**Custo: um `if` a mais na mesma passada de `git log`.** `CHURN_WINDOW_DAYS` já existe em
`server/recency.py` e a passada já itera o histórico inteiro — uma segunda janela (ex.: 30–180
dias) sai igual ao churn atual saiu: de graça.

É o sinal de maior valor operacional do catálogo: identifica **ponto quente abandonado**.

## Um defeito real que a pesquisa diagnosticou

**As arestas do grafo são o problema do enrolamento, literalmente.**

A teoria de ondas de densidade (Lin–Shu) existe porque braços espirais **não podem ser estruturas
materiais**: o material interno orbita mais rápido e qualquer estrutura material se enrolaria em
poucas rotações. O `LineSegments` de `space/graph.js` liga cada arquivo (r≈26–62) ao seu hub
(r≈19–33), e os dois têm ω diferente por `speed = (r/r₀)^-1.5`.

**Aquelas linhas cisalham e enrolam a cada quadro.** É o winding problem desenhado — e explica
por que o campo de arestas nunca leu como estrutura. Se a leitura pretendida é "grupo co-móvel",
a aresta deveria ser um **padrão** (mesma fase, mesma cor, realce sob demanda), não um segmento
material permanente.

## O que a cena já acertou — não "consertar"

**Meteoro é fenômeno, não corpo.** Definição IAU 2017: *meteoroide* é o corpo (30 μm a 1 m),
*meteoro* é o fenômeno luminoso da entrada, *meteorito* é o que chega ao solo. `particles.js` já
chama `infall` de rastro e `satellites.js` fala em "rastro de meteoro". É a única parte do
vocabulário atual que está correta e não precisa mudar.

## Descartado como decorativo

Aglomerado aberto vs globular (a distinção real acopla idade, densidade e metalicidade — nenhum
fato no grafo), classes espectrais O–M, troianos/ferradura/quase-satélite (±60°, 180°, 0° — nenhum
fato), lua-de-lua (**nenhum submoon foi observado em lugar nenhum**), teste do lítio, relação M–σ.

E **`first_seen` foi descartado com medida**: vida mediana de 0 dias, 62% dos arquivos com vida
< 1 dia. O eixo é degenerado neste corpus.

---

## Ordem de adoção

1. **Segunda janela de churn** → cometa extinto. Um `if` em `recency._last_commits`, mesma
   passada. Maior valor por linha do documento.
2. **`git_root` como galáxia satélite** (submódulo). Barato, vem junto.
3. **Zonas por razão de massa** — substitui as classes de corpo.
4. ~~**Luas dimensionadas pela esfera de Hill**~~ — FEITO em 2026-08-05. O gate foi cumprido antes:
   `advance()` medido a **0,0098 ms/quadro com 468 nós, 0,109 ms com 5 000 e 0,78 ms com 20 000** —
   cabe folgado, e o que custa continua sendo o pós-processamento (87–90% do quadro).

   Duas coisas que a implementação descobriu e que valem para o resto do documento: a previsão de
   que o `a` (recência) importaria mais que a massa está **certa e é mais forte que o previsto** — na
   razão Hill/Roche o `m^(1/3)` cancela e só o `a` decide. E comparar Roche (raio do corpo) com Hill
   (raio orbital) usando o raio DESENHADO não funciona: as duas réguas têm escalas diferentes nesta
   cena, o que fechava a janela em silêncio. Detalhe em `modelo-de-renderizacao.md`.

---

## Os três corpos que se distinguem pelo COMPORTAMENTO

> Pesquisa acrescentada em **2026-08-06**. Ela é a FONTE da "Reestruturação da morfologia", logo
> abaixo: esta seção diz o que os três **são**; aquela diz o que a cena faz de errado com eles e
> em que ordem consertar.

A frase que reorganiza os três é o corolário da regra que abre este documento (*massa decide a
classe, composição decide o tipo*): **nenhum dos três é uma composição.** Galáxia é uma
**estrutura** de organização, quasar é **atividade**, pulsar é **ritmo**. São os únicos corpos do
catálogo definidos por comportamento, e é por isso que ganharam seção própria.

| | Galáxia | Quasar | Pulsar |
|---|---|---|---|
| **O que é** | Um sistema gigantesco de estrelas, gás, poeira e matéria escura | O núcleo extremamente ativo de uma galáxia | Uma estrela de nêutrons em rápida rotação |
| **Tamanho** | Dezenas a centenas de milhares de anos-luz | Região central de poucos anos-luz ou menos, mas extremamente brilhante | ~20 km de diâmetro |
| **Massa** | Bilhões a trilhões de massas solares | Dominado por um buraco negro supermassivo (milhões a bilhões de M☉) | ~1,4–2 M☉ |
| **Fonte de energia** | Estrelas | Disco de acreção em volta de um buraco negro | Rotação e campo magnético |
| **Aparência** | Espirais, elipses, formas irregulares | Núcleo extremamente brilhante, com possíveis jatos | Ponto pequeno emitindo pulsos periódicos |

⚠️ As imagens de referência abaixo são links externos e voláteis (CDN de conversa). Se um dia
pararem de abrir, o texto continua de pé sozinho — nenhuma afirmação deste documento depende delas.

### 1 · Galáxia — a ESTRUTURA

Uma galáxia é uma enorme estrutura gravitacional: de centenas de milhões a trilhões de estrelas,
mais planetas, nebulosas, gás, poeira, matéria escura e, normalmente, um buraco negro supermassivo
no centro. Pense nela como uma **cidade cósmica** — o Sistema Solar está dentro da Via Láctea.

- **Composição:** 85%+ matéria escura (estimativa), gás interestelar, poeira, estrelas,
  aglomerados, buraco negro central.
- **Comportamento:** tudo orbita o centro gravitacional; uma estrela leva centenas de milhões de
  anos para completar uma volta.
- **Visual:** espiral, elíptica, irregular ou lenticular. Ocupa praticamente toda a paisagem do
  céu profundo.

[fig 1](https://images.openai.com/static-rsc-4/BRENJMHzVosRqHq6RNWQHWwz2CIRp6DxGZOdcw_7gVIKgmEZEMORtUsJBbpueGvU87nVXIFdKk8TYFyWMkfR7ETCC0VaRW5GVoxIjgJnIpLv1aETj4aExvcM-4UH-j64dpAaCHSmjO_8PrKMpuUWQ9iTuIT_o1Jdo-Izn8Nhsf7oLXnL5JDE1h_ufahHQi6-?purpose=fullsize) ·
[fig 2](https://images.openai.com/static-rsc-4/dkuKvXyFnkfdudfFipNgqLyq3vQYO5EOCtu60vMDvW2vcw8y161GoKrierE5pJlNGV7ZI2GXAAl2y1WO4VzAm2gshYOdA9pcHHjv0QWzXdnskM0V4sghOhpGcavtIQjTQKh-ocD7xvcCH1IYi5Rp2cuTzrghYbRUpuoUSiOWwgk9M4LcCSfUZ34a7qUSLXC1?purpose=fullsize) ·
[fig 3](https://images.openai.com/static-rsc-4/BPoCRotETPjX-k8ame3paSHtBxp5eozn10Okdt1JeUOmxkdqdzsw3GWueJqEZClkNY6KX8YSj4t34u1TvvxvGKWVq5epZZW9mwdawML7nVv6pH8LIa7YyqqjI2iEdZSQ-UICaN-kdpX1pCnfdMu_wgU5l5x1RaSDhDjde2nTRkJlvwmVzyFRWRbrjupF0_L_?purpose=fullsize)

### 2 · Quasar — a ATIVIDADE

O quasar **não é um objeto separado da galáxia**: é um tipo de núcleo galáctico ativo. Toda galáxia
tem um buraco negro supermassivo no centro; quando muito gás cai nele, o disco de acreção libera
energia gigantesca e aquilo vira um quasar.

```
galáxia → buraco negro → disco de acreção → energia gigantesca → QUASAR
```

> **Todo quasar está dentro de uma galáxia. Mas nem toda galáxia possui um quasar ativo.**

Essa é a frase mais consequente do documento inteiro para o código — ver "2. O quasar tem de acender
por ACREÇÃO, não por massa", logo abaixo.

- **Composição:** não é matéria sólida — buraco negro supermassivo, disco de acreção a milhões de
  graus, plasma, campos magnéticos e, em muitos casos, jatos relativísticos.
- **Comportamento:** absorve matéria, aquece o disco, emite radiação intensa e pode lançar jatos a
  quase a velocidade da luz. É um dos objetos mais luminosos do Universo — **alguns brilham mais
  que toda a galáxia onde estão.**
- **Visual:** núcleo branco/azulado extremamente brilhante, disco muito energético, possíveis jatos
  opostos.

[fig 1](https://images.openai.com/static-rsc-4/MEx5L6Wu7W0VtUITr4QjWtexGTSmOoNtNxze9zM61w3OMhyykQrnJqDXV3qRxtI19T9KGmgEIY_E2dLSe6NecaIIH8NJOJAJKBDrvp1iyDZj-qAKcTnXFRnWkXWW2fumBaGgySZLmW6ZRcaaLCsUYZ9o_g4_tvhDgBnTzsUMXL2YN64F44WlHgHjTR7ybF6k?purpose=fullsize) ·
[fig 2](https://images.openai.com/static-rsc-4/tvm1XzojHYdelUHrxX0Bf2k5NCKGwtW26IO6cGnrK9IU-1zggs2blINZzwz1tQJ-7L6Ug10pT8auh0P2nlwEuwrKSVSiV2QvZDQ2YM-Cerfe3ae8Hxhm5lE_1AV1ewFXoDjohLm7W6wlMKYyonGgJ9ixi1ncfsrcxXVsrIR-_ym33A9oujWPjHz9t-Q92U_b?purpose=fullsize) ·
[fig 3](https://images.openai.com/static-rsc-4/AZEwBUP_YKriGTlHCaZO-O_N4FOUDHHTQZkkkXeekfW9ijrWGVq0XqhShOJYQ9ZNSHwwFc805UM5Bsv7S1B9olAsnkX9fTwDUQ0ZON93dkljorg19gImqNIK3YRFdznikBUdPHeyPt8qdOipe5LRsTcfCfwTDbEwevuK45C41DDWyfCxFRlrEXL8EFVjeoPg?purpose=fullsize) ·
[fig 4](https://images.openai.com/static-rsc-4/axKED6NeDOBDo-87u6q5jvSefJSDCPqhC4_E-hqmoMKERRFXRBiPJX8N4nZUF6z18_bJKSbqD1liY9r8D6TcctQBUGAu2F08LCeWfYKjohmBDDKf9-nC_tP3eWJdztHeGOw-dOyE4dY8p8Pf9G8wlMOlkONVJ0FuvqDhXjh0zac4AW4TqcOwwh0JVijM5FxX?purpose=fullsize) ·
[fig 5](https://images.openai.com/static-rsc-4/ueMoIcj8yB5W76PifTugZIcUPapdfPFOxJrlnBiwNzx1nd1BiV6AXpwSTFfIWUeXykzeIe_-AM8L4qY4kagP523aLqLH2KgWmJGiv_CMSH0U2Nz-C8CvjLW_8vZiPCixY0Y-QBa4EsZl-yHvcqhLaJaTRtYM7yLiDyicyW7Q9T3BP9uuzeHSLl1utOMXvVTq?purpose=fullsize)

### 3 · Pulsar — o RITMO

O pulsar é completamente diferente, e **não tem relação direta com galáxias ativas**. É o que sobra
da explosão de uma estrela muito massiva:

```
estrela gigante → supernova → estrela de nêutrons → PULSAR
```

Ele é absurdamente pequeno — cerca de **20 km de diâmetro** — e ainda assim tem mais massa que o
Sol. Uma colher de chá dessa matéria pesaria bilhões de toneladas na Terra.

- **Composição:** nêutrons extremamente comprimidos, densidade gigantesca, campo magnético colossal.
- **Comportamento:** gira muito rápido — dezenas, centenas, até mais de **mil vezes por segundo**.
  Os polos magnéticos emitem feixes estreitos de radiação; quando um deles cruza a nossa linha de
  visão, detectamos um pulso. Funciona como um farol, e o que o define é que os flashes chegam em
  intervalo **extremamente regular** — é daí que vem o nome.
- **Visual:** ponto pequeno, pulsos periódicos.

[fig 1](https://images.openai.com/static-rsc-4/ikVgQCZOrEHR_GU13Ik5f4LveUl2SGfcf2Xa1FuaVsZ5y0g5AqEZxhXOjlaFwm41g3QJQV4BFqMAuqPhpbbrzbhNAQeaHeONIwhnmJRf_K26kGwvIbNtIAkZe0KPkgsSO3zDk0cynsTO8znTbOH15ULVQDnK0d-431y0KAl1iIKtezlMX_J5SiqWnf_Kb52g?purpose=fullsize) ·
[fig 2](https://images.openai.com/static-rsc-4/5CzBRdlGrgxCFYl1uHRbCWRunQ7iR3H68NlM_VYM9E2AAOPOVRAg0qPs_rsEDHbEMxHn3MIL_C6fipwnJ5pfub35tvCBTKIrEOO4S5IdmiNZ2kbOEHVXl46_5hL608hSAfm4BMv73iZmmw2oBsVG8ZT2cEt3nB4Moz2v1vEg8-_Mzy0zDGcezRWpXJ7udDLb?purpose=fullsize) ·
[fig 3](https://images.openai.com/static-rsc-4/F85dlaJnQ40NLVkHEm0_gU2xMVIcOgyu4eBB25-deBGYvjK9TUFKMU4J6xiTOc3jHqU0TdtTdHNP2k2Ux-2mPGq8SIrBzkYunPcFUC1xZl53RNjK1jXe0VOG4DShBWJLx_I88BW1tmliIwNYeM-mZyHcFPKlR5aO2x0V5vEkMUXTLmJwDtcXbWJal7oNT_S5?purpose=fullsize) ·
[fig 4](https://images.openai.com/static-rsc-4/RbRh3xSes8UXOR6YkHCui6_EPHYkStqDxyzW8eJ53lQgEvXIgFbyBLC-_gJxvNl3WiGvxw1uWZ8eB0XroBZjSfGUY8ig9V-0BsEtMJkXuXfNd9uoOzD3tvj9DbS3iiwFaFPWt4ldCnWqZd3gQ6SO0d6VkLXp7xpClEh7NrojWH6G1AYVVPUwR4gsXqxC2ASO?purpose=fullsize) ·
[fig 5](https://images.openai.com/static-rsc-4/ygsSpu9shY0rhAZEHpc8HXQDr3k5FOJc6WnoeFy2147raTJw9rOQsKXq8uDpwPgNR4geeiXMA6s8n1ey6LYnnmAqBmgo8wvGzKOa8H5izO9Vog2nxs-W2k8c96rdOJku37vhJF66hSeFA_6OVC3Z6ARd992GJiekH7hCmtWW9hoMXf3u2bqJ3F9keryJdvAV?purpose=fullsize)

### A escala — e é ela que a cena erra hoje

```
Galáxia            100.000 anos-luz
  ↓
Quasar             ~1 ano-luz (região emissora)
  ↓
Sistema Solar      0,002 anos-luz
  ↓
Pulsar             20 km
```

Uma galáxia é **bilhões de bilhões de vezes maior** que um pulsar. E entre galáxia e quasar a razão
é de ~10⁵: o quasar é um PONTO no centro de uma cidade.

⚠️ **Observado na cena em 2026-08-06:** no corpo em foco o clarão do núcleo cobre boa parte do
disco, então a galáxia não *hospeda* um quasar — ela *é* um. É a mesma queixa que a tabela de
escala acima já responde, e ela é de **proporção**, não de contagem: mesmo com o gate de acreção
certo, um quasar desenhado do tamanho do disco continua sendo o objeto errado.

### Como os três se encaixam

```
GALÁXIA
├── bilhões de estrelas
├── nebulosas
├── planetas
├── matéria escura
│
├── centro
│     └── buraco negro supermassivo
│              └── QUASAR (quando ativo)
│
└── uma estrela massiva explode
          └── PULSAR
```

Os três coexistem na mesma galáxia com papéis diferentes — um pulsar pode existir numa galáxia cujo
centro também abriga um quasar. **Quasar e pulsar não são alternativas um do outro**, e nada no
catálogo deve tratá-los como se fossem.

### O que cada um significa no Espatial OS

A tradução da metáfora, e é ela que a "Reestruturação da morfologia" cobra do código:

| corpo | papel na cena | leitura |
|---|---|---|
| **Galáxia** | um grande domínio de conhecimento (Pesquisa, Código, Empresa, Memória) | estrutura que ORGANIZA o espaço, contendo estrelas, sistemas e planetas |
| **Quasar** | um centro de altíssima atividade e processamento | núcleo brilhante com disco de acreção e jatos: roteamento intenso, busca massiva, processamento do agente |
| **Pulsar** | um emissor periódico de sinais | eventos recorrentes, monitoramento, heartbeat, scheduler, sincronização, notificações |

Galáxias organizam o espaço, quasares concentram energia e processamento, pulsares marcam o ritmo
e os eventos do sistema. A diferenciação enriquece a física e a leitura visual ao mesmo tempo — é
o mesmo argumento que a regra de abertura faz, aplicado a três corpos em vez de a um.


## Reestruturação da morfologia — proposta de 2026-08-06

A pesquisa acima bate de frente com o mapa que está no ar, e o conflito tem uma frase só:

> **Galáxia, quasar e pulsar se distinguem pelo que FAZEM, não pelo que são feitos.**

É o corolário da regra que abre este documento (*massa decide a classe, composição decide o tipo*)
aplicado aos três: nenhum dos três é uma composição. Galáxia é uma ESTRUTURA de organização, quasar
é ATIVIDADE, pulsar é RITMO. E hoje dois dos três saem de `kind`, que é composição.

| corpo | o que a pesquisa diz que ele é | de onde ele sai HOJE | veredito |
|---|---|---|---|
| galáxia | estrutura que organiza (um domínio) | `type` = `dir`/`repo` | ✅ certo |
| quasar | centro de altíssima ATIVIDADE | `chunks × concentração` (massa de bojo) | ❌ estrutura, não atividade |
| pulsar | emissor PERIÓDICO de sinais | `kind === 'infra'` | ❌ composição, e nada nela pulsa |

### 1. O pulsar tem de sair do RITMO — e o fato não existe ainda

É o erro mais claro do lote: um `.tf` de Terraform não pulsa. Ele é infraestrutura, que é o oposto
de um evento periódico — é o que fica parado para que outra coisa aconteça.

E o pulsar é o ÚNICO corpo deste céu cuja definição é temporal: *"eventos recorrentes, monitoramento,
heartbeat, scheduler, sincronização"*. O que faz um pulsar ser reconhecível não é do que ele é feito
— é que os pulsos chegam **em intervalo regular**.

O fato correspondente é a **regularidade dos intervalos entre commits**: baixa variância = pulsar;
alta variância = qualquer outra coisa. Ele **não existe** no grafo hoje (os nós têm `chunks`,
`recency`, `churn`, `dormant`, `supernova`, `sections`) — mas o custo é o mesmo do cometa extinto,
que este documento já registrou: **um acumulador a mais na passada de `git log` que
`server/recency.py` já faz**. Não é varredura nova.

⚠️ E `infra` precisa de destino. Ele não vira pulsar; o candidato natural é **estação** — a mesma
leitura pré-verbal que `agent` já usa (*aresta reta = alguém construiu*), e é exatamente o que
Terraform e k8s são.

### 2. O quasar tem de acender por ACREÇÃO, não por massa

A pesquisa diz a frase inteira sem querer:

> *"Todo quasar está dentro de uma galáxia. Mas nem toda galáxia possui um quasar ativo."*

O que separa uma galáxia massiva de um quasar **não é o buraco negro** — toda galáxia massiva tem
um. É **gás caindo AGORA**. Um buraco negro supermassivo sem acreção não é um quasar; é um buraco
negro supermassivo quieto, e a Via Láctea é o exemplo.

Hoje o gate é `bulgeMass = chunks × concentração ≥ 50`: puramente estrutural. Um diretório grande e
concentrado acende mesmo estando **congelado há um ano**, o que é o oposto do que o objeto significa.

**A correção mantém a relação M–σ onde ela vale e acrescenta a que faltava:**

    bojo alto        → o buraco negro EXISTE (pré-requisito, é a M–σ, e ela está certa)
    churn dos filhos → há gás caindo AGORA (o que ACENDE)

Isso também conserta um defeito já medido: o limiar de 50 foi calibrado num corpus de 72 hubs e hoje
dá **35 de 213 — 16,4%**, contra os 9,7% (7 de 72) do desenho original. Reconferido em 2026-08-06
contra o `buildHubs` do `scene.js`, com os filhos vindos das **arestas** do payload (uma contagem
que os tirou do campo `dir` deu 31, e estava errada — `dir` não reproduz a árvore, a mesma
armadilha que a contagem de arquivos descendentes já tinha pago).

⚠️ **E o limiar está no lugar mais frágil da distribuição.** Os bojos em volta do corte de 50 são
`51 · 51 · 49 · 45`: dois hubs entram por uma unidade e dois ficam de fora por outra. Um número
calibrado à mão pousado na parte densa da distribuição muda de resposta a cada commit no corpus —
o que é mais um argumento para o gate não ser um limiar de massa.

Com a acreção no gate, a fração deixa de ser um número calibrado à mão e passa a ser **quanto do
corpus está quente agora**, que é precisamente o que os ~10% de núcleos ativos significam na
natureza.

⚠️ **E há uma segunda metade, que é de ESCALA e não some com o gate certo.** Pela tabela de escala
acima, o quasar é a região central de **poucos anos-luz** dentro de uma galáxia de **centenas de
milhares** — um ponto, não o objeto. Hoje o clarão do núcleo cobre boa parte do disco em foco, então
mesmo os hubs que MERECEM acender continuam desenhando "uma galáxia que é um quasar" em vez de "uma
galáxia que hospeda um". Acertar o gate reduz a contagem; só acertar a proporção conserta a leitura.

### O que isso NÃO muda

`fotosfera`, `planeta`, `cometa`, `estação` e `nebulosa` continuam saindo de `kind`, e está certo:
esses cinco são tipos de CORPO, e corpo é composição. A reestruturação é só dos três que a pesquisa
separou — e ela vale porque os três são os únicos do catálogo definidos por comportamento.

### Ordem sugerida, e o gate de cada passo

1. **Quasar por acreção.** Não precisa de fato novo — `churn` já está em cada nó, e o hub só precisa
   agregar o dos filhos, que é a mesma varredura que já monta `galaxyParams`. É o passo de maior
   valor por linha, e conserta o limiar de quebra.
   ⚠️ **A proporção é um passo separado e independente deste** — ver o aviso de ESCALA acima. Dá
   para fazer os dois no mesmo commit, mas não são o mesmo conserto: um decide QUEM acende, o outro
   decide QUANTO da imagem o aceso ocupa.
2. **`infra` → estação.** Uma linha em `MORPHOLOGY_BY_KIND`. Libera o nome `pulsar`.
3. **Regularidade no servidor** → pulsar de verdade. Precisa de `server/recency.py` e de bump do
   `SCHEMA_VERSION` (campo novo em nó nasce morto em qualquer clone com cache — o próprio
   `server/graph.py` avisa).

⚠️ Nada disto foi implementado: os três mudam o que o céu inteiro desenha, e o passo 3 exige
reindexar. Está aqui como proposta porque é decisão, não diff.

## Fontes

[IAU definition of planet](https://en.wikipedia.org/wiki/IAU_definition_of_planet) ·
[Clearing the neighbourhood](https://en.wikipedia.org/wiki/Clearing_the_neighbourhood) ·
[Hill sphere](https://en.wikipedia.org/wiki/Hill_sphere) ·
[Roche limit](https://en.wikipedia.org/wiki/Roche_limit) ·
[Barycenter](https://en.wikipedia.org/wiki/Barycenter_(astronomy)) ·
[Rings of Quaoar](https://en.wikipedia.org/wiki/Rings_of_Quaoar) ·
[Density wave theory](https://en.wikipedia.org/wiki/Density_wave_theory) ·
[107P/Wilson–Harrington](https://en.wikipedia.org/wiki/107P/Wilson%E2%80%93Harrington) ·
[Asteroid family](https://en.wikipedia.org/wiki/Asteroid_family) ·
[Brown dwarf](https://en.wikipedia.org/wiki/Brown_dwarf) ·
[Meteoroid (IAU 2017)](https://en.wikipedia.org/wiki/Meteoroid) ·
[Hyodo et al. 2024, *Nature Geoscience*](https://www.nature.com/articles/s41561-024-01598-9)
