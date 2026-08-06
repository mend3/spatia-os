# Catálogo celeste — proposta de taxonomia, 2026-08-05

É a proposta que saiu da pesquisa encomendada depois de o usuário notar, corretamente, que **anel é
de planeta, não de estrela** — e que o problema é mais fundo que nomenclatura: o céu chamava todo
arquivo indexado de "estrela", o que não deixava vocabulário para dizer que uma coisa é feita de
outra, que uma orbita outra, ou que uma esfriou.

O documento existe porque a pesquisa é cara e o raciocínio se perde. O que for implementado sai
daqui e vira comentário no código.

**Estado em 2026-08-05:** planeta anelado e supernova estão no céu; cometa extinto passou a
classificar (segunda janela de churn), com superfície mas ainda sem cauda; **lua entrou** (40 corpos,
106 luas, órbita elíptica e sem colisão — a regra e as medidas em `src/space/orbital-zones.js`; a
contagem caiu de 278 quando o piso de legibilidade passou a medir contra a órbita externa, que é
quem fixa a distância da câmera); zonas por razão de massa continuam
só aqui, mas `μ ≥ 5` já é usado como o corte que separa lua de sistema duplo. O `status` de cada entrada em `src/space/catalog.js` é a fonte da verdade —
nenhuma mente sobre estar pronta.

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
