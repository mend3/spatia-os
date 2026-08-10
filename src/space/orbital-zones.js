/**
 * ZONAS ORBITAIS — onde a massa de um corpo age sobre o que orbita ele.
 *
 * Este módulo existe para tornar VERDADEIRA uma frase que o `modelo-de-renderizacao.md`
 * afirmava sem ter implementação: *"massa age para BAIXO — sobre o que orbita você"*. Até aqui a
 * massa governava só o TAMANHO do corpo; alcance do anel e esfera de Hill estavam declarados no
 * `catalogo-celeste.md` e não existiam em lugar nenhum.
 *
 * Duas fronteiras, e elas são as duas pontas da mesma faixa:
 *
 * | Fronteira | Depende de | O que decide |
 * |---|---|---|
 * | **limite de Roche** | densidade do corpo | abaixo dela o satélite se despedaça → é ANEL |
 * | **esfera de Hill** | massa E raio orbital | acima dela o pai não segura → o corpo escapa |
 *
 * Entre as duas, e só entre as duas, um satélite sobrevive. É a mesma fronteira dos dois lados:
 * o que está dentro do Roche é material de anel, o que está fora é lua. O céu já desenhava anéis
 * terminando em ~2,45 raios (`ring-profiles.js`, família Saturno) — que é o coeficiente de Roche
 * fluido, 2,44. Reaproveitá-lo aqui não é reuso de constante: é a mesma fronteira física, e ter
 * dois números para ela seria a contradição que este arquivo veio fechar.
 *
 * ## A armadilha que quase matou a feature — leia antes de mexer nas constantes
 *
 * A primeira montagem comparava o Roche (que sai do RAIO DO CORPO) com o Hill (que sai do RAIO
 * ORBITAL) e a janela vinha degenerada: com o fator de estabilidade progrado real, **0 de 136**
 * arquivos com seções conseguiam segurar uma lua; sem ele, 20, e com a faixa entre as duas
 * fronteiras medindo no máximo 21% de largura.
 *
 * A causa não era a física, era **mistura de escalas**. O raio DESENHADO de um corpo é
 * `0.55 + log2(1+chunks)*0.42` — uma escala log, comprimida de propósito para que um arquivo de
 * 1 chunk continue visível. O raio ORBITAL não é comprimido. Medido: um corpo desta cena tem
 * `R/a ≈ 0,022…0,087`, contra `4,2e-5` da Terra — os corpos são ~1500× maiores que as órbitas
 * deles. Derivar uma fronteira do raio desenhado e outra do raio orbital é comparar duas réguas
 * diferentes, e o resultado não significa nada.
 *
 * A correção: **órbita usa o raio FÍSICO implicado pela massa a uma densidade comum**, não o raio
 * desenhado. São grandezas distintas e continuam distintas — `raioDeCorpo` para mecânica,
 * `0.55 + log2(...)` para pixel.
 *
 * E aí cai um resultado que paga o trabalho sozinho: como o Roche fica `∝ m^(1/3)` e o Hill
 * também, **o `m^(1/3)` cancela na razão entre as duas** e a existência da janela passa a
 * depender só de `a`, o raio orbital. É a física certa — Mercúrio não tem lua por estar perto do
 * Sol, não por ser leve — e nesta cena `a` é a RECÊNCIA. Ou seja: **arquivo antigo segura suas
 * seções em órbita; arquivo recente, não.** Era exatamente o que o `catalogo-celeste.md` previa
 * ("um arquivo antigo (periferia) seguraria suas seções em órbitas mais largas que um arquivo
 * novo e pesado — sai de graça e é fisicamente correto").
 *
 * ## A única liberdade tomada, e ela está declarada
 *
 * Satélite progrado só é estável até ~0,5 da esfera de Hill. Medido neste corpus: aplicando o
 * fator, **nenhum** corpo segura lua. A cena usa a esfera de Hill CHEIA como zona estável — uma
 * compressão, do mesmo tipo que a escala log dos tamanhos, e declarada aqui em vez de escondida
 * num fator mágico. É a única.
 */
import { MOTION, meanMotion as keplerMeanMotion } from './motion-catalog.js';

/** Compressão do relógio das luas — declarada em `motion-catalog.js`, entrada `moonOrbit`. */
const MOON_TIME_SCALE = MOTION.moonOrbit.timeScale;

/**
 * Coeficiente de Roche para satélite FLUIDO, em raios físicos do primário.
 *
 * 2,44 é o caso de densidades iguais, que é o desta cena: uma seção é feita do mesmo material que
 * o documento de onde ela sai. O valor rígido (1,26) descreveria um satélite mantido inteiro por
 * resistência do material, que não é o que uma seção é — e, medido, ele levava 135 dos 136
 * arquivos a ter lua, o que apaga a informação: "tem lua" viraria sinônimo de "tem seções".
 */
const ROCHE_FLUID = 2.44;

/**
 * Densidade comum a todos os corpos, na forma em que ela é usada: `R_físico = k · massa^(1/3)`.
 *
 * O número não é escolhido por gosto — ele é o que decide ONDE a janela de luas abre. Como a
 * razão Hill/Roche não depende da massa, existe um `a` de corte e ele sai fechado:
 *
 *     a_corte = ROCHE_FLUID · k · (3·M_total)^(1/3)
 *
 * Com `k = 0,70` e o corpus medido em 2026-08-05 (M = 3644 chunks), `a_corte = 37,9`: **38% dos
 * arquivos com seções suficientes seguram lua** — os mais antigos. O corte precisa continuar
 * separando (se todos tivessem lua, "tem lua" viraria sinônimo de "tem seções" e não informaria
 * nada), e é por isso que ele não desce mais.
 *
 * ⚠️ **`k` foi 0,813 por algumas horas, e a razão de ter mudado importa.** Aquele valor punha o
 * corte em 44,0 — o meio exato da casca — e dava a divisão mais limpa possível da população. Só
 * que ele também deixava metade dos corpos passando RASPANDO pelo limiar, e um corpo que passa
 * raspando não tem folga entre Roche e Hill: a excentricidade possível ali media 0,001 a 0,039,
 * que é indistinguível de um círculo. A órbita elíptica existiria no código e não na tela.
 *
 * O que o valor compra, então, não é só quantos corpos têm lua — é **quanta elipse cabe**. E daí
 * cai a leitura que paga a troca: como `e_max = (slack−1)/(slack+1)` e `slack = a/a_corte`, a
 * **excentricidade é o gradiente da idade**. Arquivo recém-passado do limiar tem lua em órbita
 * quase circular colada no Roche; o mais antigo do céu (a = 62) chega a `e = 0,23`. Medido com
 * `k = 0,70`: `e` de 0,050 a 0,231, mediana 0,078.
 *
 * ⚠️ `a_corte` depende de `M_total`. Um corpus muito maior empurra o corte para fora e as luas
 * somem; é comportamento correto (mais massa central = Hill menor), mas quem dobrar o corpus tem
 * de conferir que ainda sobra alguém. `moonZone` devolve a folga para isso ser mensurável.
 */
/*
 * ⚠️ **0,70 → 0,50 em 2026-08-07, e a advertência acima é que disparou: o céu estava SEM NENHUMA
 * LUA.** Não é ajuste de gosto — é a correção de uma regressão silenciosa.
 *
 * O corpus passou de **3 644 para 20 308 chunks (5,6×)** desde que `k = 0,70` foi derivado. Como
 * `a_corte = ROCHE_FLUID · k · (3·M)^(1/3)`, ele subiu de **37,9 para 67,2** — acima do raio
 * orbital MÁXIMO do céu, que é 62. Medido na cena viva: `spatia.moons()` devolvia
 * `{shown: 0, dropped: 0}`, com 527 arquivos de 5+ seções elegíveis e nenhum servido. `dropped`
 * também zero, porque a recusa acontece antes de qualquer lua ser considerada.
 *
 * 0,50 devolve `a_corte = 48,0` e reproduz o critério que escolheu o 0,70: **39% dos elegíveis
 * seguram lua** (o alvo declarado era 38%), com `e_max = 0,127` no corpo mais antigo — dentro da
 * faixa 0,050–0,231 que a nota acima exige para a elipse ser distinguível de um círculo.
 *
 * A derivação assume raio orbital ~uniforme em [26, 62], e isso não é chute: o raio É a recência,
 * que `recency.py` define como POSIÇÃO NO RANKING justamente para ficar uniforme.
 *
 * **Este número expira de novo.** Ele é função de `M_total`, e o corpus cresce. A conta está
 * fechada logo acima — quem reindexar um corpus muito maior refaz `a_corte` e confere contra 62,
 * ou as luas somem outra vez sem erro nenhum.
 */
const K_RAIO = 0.5;

/**
 * Largura de uma banda orbital, em RAIOS de lua. Substituiu o antigo `SPACING_SAFETY`.
 *
 * 4 é o orçamento da banda: metade dela é a lua (diâmetro `2·r`), um quarto é a excursão que a
 * elipse pode usar, e o quarto restante é folga vazia — `B/8` de cada lado. Baixar este número
 * engorda a lua e aperta a folga; subir afina tudo. **É o ajuste barato de aparência do sistema de
 * luas**, o mesmo papel que o `SPACING_SAFETY` tinha, e não o `K_RAIO`.
 */
const BAND_MOONS = 4;

/**
 * Piso do raio desenhado de uma lua, em raios do PAI. É ele que decide quantas luas cabem.
 *
 * 1% é onde satélites reais vivem: Amalteia tem 0,12% do raio de Júpiter, Io 2,6%, Titã 4,4% do de
 * Saturno. Abaixo disso a lua deixa de ser corpo e vira poeira — e o corte tem de existir porque a
 * janela Roche→Hill é estreita (folga medida: 1,10 a 1,60), então sem piso um documento de 40
 * seções pediria 40 bandas de espessura nula.
 *
 * ⚠️ Ele NÃO é o piso que decide se a lua aparece — ver `MOON_MIN_OVER_OUTER`, que mede contra a
 * grandeza certa e é, na prática, sempre o mais apertado dos dois. Este continua aqui porque
 * protege de outra degeneração (lua do tamanho do pai), e não porque ainda esteja mandando.
 */
const MOON_MIN_FRACTION = 0.01;

/**
 * O piso que DECIDE SE A LUA APARECE: raio da lua por raio da órbita externa.
 *
 * ## Por que a régua é a órbita, e não o pai
 *
 * `MOON_MIN_FRACTION` compara a lua com o raio do PAI, e medido na cena viva isso não prevê nada:
 * quem fixa a distância da câmera é a ÓRBITA EXTERNA, porque é ela que tem de caber na tela para o
 * sistema ser visto como sistema. A lua tem ~1,8% do raio da estrela e orbita a ~7,4 raios dela —
 * proporção fiel (Io: 2,6% e 5,9 raios de Júpiter) — e o preço é uma razão órbita/lua de ~410:
 * aproximar para ver a lua tira o sistema da tela, enquadrar o sistema apaga a lua. **Existe um
 * enquadramento só**, e é nele que o piso tem de valer.
 *
 * ## O número, e de onde ele sai
 *
 * Escolhido na bancada (`sandbox/moon-rig.js`, espécime SISTEMA DE LUAS), vendo, com o
 * enquadramento canônico imposto. Antes dele, o disco visível da lua media **1,42 px** no corpo do
 * handoff e 1,27 px de mediana nos 40 sistemas do corpus — o piso do shader, indistinguível do
 * campo de fundo.
 *
 * `0,0154` é `4,5 px CSS` convertido pela inversão do vertex shader:
 * `gl_PointSize = uSize · aSize · 300/z`, e o enquadramento fixa `z = outer/tan(fov/2)`, então o
 * `outer` cancela e sobra `px = uSize · 300 · tan(fov/2) · (r/outer)`. Com `uSize = 4,6`,
 * `fov = 46` e DPR 2: `4,5 · 2 / (4,6 · 300 · tan 23°) = 0,0154`.
 *
 * O que ele compra, medido: a lua sai de 2,05% para **4,62% do raio do pai** — que é Titã (4,4% de
 * Saturno), e isso não foi procurado, caiu da conta.
 *
 * ⚠️ **O preço é o número de luas**, e não há terceira saída: `raio = W/(N·BAND_MOONS)`, e
 * `BAND_MOONS` já está quase no mínimo que a prova de não-colisão aceita. Subir este piso encolhe
 * `N`; o que sobra vira `dropped`, que a HUD anuncia.
 *
 * ⚠️ Em DPR 1 a lua ocupa o DOBRO de pixels CSS — `gl_PointSize` é framebuffer e não escala com a
 * resolução. É o comportamento que todo o campo de estrelas já tem; corrigir aqui só para a lua
 * criaria a segunda régua que este arquivo inteiro existe para não ter.
 */
const MOON_MIN_OVER_OUTER = 0.0154;

/**
 * Dispersão da inclinação entre as luas de um mesmo sistema, em radianos (~±10°).
 *
 * Sem ela o sistema vira colar de pérolas num plano só; com ela demais, deixa de ler como sistema.
 * Saturno tem os satélites regulares a menos de 1,5° do equador e os irregulares espalhados por
 * dezenas de graus — esta cena fica no meio, porque precisa mostrar a estrutura em poucos pixels.
 */
const INCLINATION_SPREAD = 0.35;

/**
 * Partes mínimas para a leitura "lua" valer — o corte que separa lua de sistema DUPLO.
 *
 * ☠️ **Ele NÃO herda a tabela de zonas por razão de massa, e herdar era o defeito.** Lá `μ` era a
 * razão entre a massa de DOIS CORPOS de um sistema (Sol–Júpiter contra Plutão–Caronte); aqui é o
 * número de seções de UM arquivo. Mesmo símbolo, mesmo número, grandezas diferentes — e a tabela
 * saiu do `catalogo-celeste.md` porque descrevia céu que ninguém desenha, deixando esta citação
 * apontando para o vazio. **A zona está REFUTADA por medida** (fixture 09/08, 22 sistemas): a
 * terceira zona, *família colisional* (`μ ≪ 1`), é vazia por aritmética — `μ` é a maior massa
 * sobre a segunda e nunca desce abaixo de 1 —, *sistema duplo* (`1 ≤ μ < 5`) leva **18 dos 22
 * sistemas (81,8%)** e *sistema com primária* leva 4, dos quais 2 são de um corpo só. A cena
 * desenha UMA estrela por sistema nos 22, então a zona graduada não muda um pixel e o que tem
 * leitor é o fato BINÁRIO, `dominanteDe`.
 *
 * O que sustenta o corte aqui é o caso degenerado, e ele é aritmética deste arquivo: o teto do raio
 * da lua é `raioDeCorpo(massa/N)/raioDeCorpo(massa) = N^(-1/3)` do raio do pai — **1,000 com
 * uma seção**, 0,794 com duas, 0,585 com cinco. Uma "lua" do tamanho do pai é um binário.
 *
 * ⚠️ **O valor 5 em si não está medido NESTA grandeza** — ele veio da tabela apagada. Ele custa 9
 * dos 72 corpos do fixture (12,5%) e é o único portão da faixa: os 63 corpos com `μ ≥ 5` têm TODOS
 * a janela Roche→Hill aberta (0 janelas fechadas nos dois corpora), então nada mais recusa depois
 * dele. Quem for remedi-lo mede o raio DESENHADO (`min(raioDeCorpo(m/N), band/4)`), que é quem
 * de fato limita — o teto `N^(-1/3)` quase nunca morde.
 */
const MU_MIN = 5;

/**
 * Parâmetro gravitacional do núcleo, `G·M`, na mesma unidade que o resto da cena.
 *
 * Vem do `motion-catalog.js`, que é onde a lei orbital mora. Aqui ele era RECONSTRUÍDO a partir da
 * calibração do `graph.js` (`0.16² · 26³`), com um comentário explicando a derivação justamente
 * porque o código não a expressava — e as duas cópias podiam divergir sem que nada acusasse.
 * Divergindo, a lua giraria num ritmo INCOERENTE com a órbita do pai: dois movimentos falando de
 * sistemas solares diferentes, que é o defeito que a cena já pagou uma vez com os arcos a 38% da
 * distância real.
 */
const MU_CORE = MOTION.keplerOrbit.gravitationalParameter;

/*
 * ─────────────────────────── O QUE AQUI É FÍSICA, E O QUE SÓ USA A FORMA DELA
 *
 * A entrada destas funções é `chunks` — contagem de conhecimento, não quilograma. Pela FRONTEIRA
 * FÍSICA × COGNITIVA, nenhuma grandeza física pode ser derivada daí sem unidade e constante
 * explícitas, e a saída legítima é RAZÃO ADIMENSIONAL. Isso divide os nomes deste módulo em dois:
 *
 * | nome | veredito |
 * |---|---|
 * | `ROCHE_FLUID` = 2,44 | ⭑ **é física** — razão adimensional com fonte (para densidades iguais o limite de Roche fica em ~2,5 raios). Atravessa qualquer escala, como o `R_s/R` do pulsar |
 * | `hillRadius` | ⭑ **é física** — `∛(m/3M)` é razão de MASSAS, e o quilograma se cancela |
 * | `K_RAIO` | coeficiente de cena CALIBRADO, não densidade. **Expira**: com corpus 5,6× maior, 297 luas viraram 0 |
 * | `raioDeCorpo` | raio em unidades de MUNDO implicado pelos chunks. Não afirma raio físico de nada |
 * | `orbitaMinima` | a borda interna da faixa. A aritmética é a de Roche; a afirmação de maré, não |
 *
 * ⚠️ **Nada de comportamento mudou** — a aritmética é idêntica. O que sai é a afirmação embutida no
 * nome, que é o caminho curto e calado que a FRONTEIRA existe para fechar.
 */

/** O raio de um corpo em unidades de mundo, implicado pelos chunks. NÃO é o raio desenhado. */
export const raioDeCorpo = (chunks) => K_RAIO * Math.cbrt(Math.max(chunks, 0));

/** A borda INTERNA da faixa de luas: abaixo dela o satélite vira anel. Em unidades de mundo. */
export const orbitaMinima = (chunks) => ROCHE_FLUID * raioDeCorpo(chunks);

/**
 * Esfera de Hill: acima dela o pai não segura mais o satélite. Em unidades de mundo.
 *
 * `r_H = a(1−e)·∛(m/3M)`. A cena não tem excentricidade (as órbitas de `advance()` são círculos),
 * então `e = 0` e o termo some — mas ele fica nomeado aqui porque o dia em que a excentricidade
 * entrar (está em aberto no `modelo-de-renderizacao.md` §6) este é o lugar onde ela age.
 */
export const hillRadius = (orbitalRadius, mass, centralMass) =>
  orbitalRadius * Math.cbrt(Math.max(mass, 0) / (3 * Math.max(centralMass, 1)));

/**
 * A faixa onde um satélite deste corpo sobrevive.
 *
 * @returns {{inner: number, outer: number, ok: boolean, slack: number}} `slack` é `outer/inner` —
 *   quanto a janela é larga. É o número a conferir quando o corpus mudar de tamanho: `slack ≤ 1`
 *   significa que a janela fechou e o corpo perdeu as luas sem nada mais ter acontecido com ele.
 */
export function moonZone(mass, orbitalRadius, centralMass) {
  const inner = orbitaMinima(mass);
  const outer = hillRadius(orbitalRadius, mass, centralMass);
  return { inner, outer, ok: outer > inner, slack: inner > 0 ? outer / inner : 0 };
}

/**
 * As PARTES NOMEADAS de um arquivo — o que vira lua.
 *
 * Duas fontes respondem à mesma pergunta e nunca coexistem no mesmo nó: `sections` são os
 * cabeçalhos de um documento e chegam do Qdrant; `services` são os serviços de um compose e
 * chegam de `server/services.py`, que lê o arquivo. Um `.md` não tem serviço e um compose não
 * tem seção indexada — a alternativa é exclusiva no dado, não uma precedência arbitrária.
 *
 * ⚠️ A ORDEM é a de declaração nos dois casos, e ela é consumida como DISTÂNCIA orbital lá
 * embaixo. Ordenar aqui embaralharia o sistema sem que o arquivo tivesse mudado.
 */
const partsOf = (node) => (node.sections?.length ? node.sections : node.services || []);

/**
 * As luas de um corpo, ou lista vazia se ele não pode ter nenhuma.
 *
 * Três recusas, e cada uma tem um motivo físico em vez de um teto de desempenho: partes de menos
 * (é binário, não lua), janela fechada (o corpo está perto demais do núcleo) e massa zero.
 *
 * @param {{sections?: string[], services?: string[], chunks?: number, radius: number, id: string}} node  nó de arquivo
 *   já com órbita resolvida (`radius` é o raio orbital dele, não o desenhado).
 * @param {number} centralMass  massa do corpus inteiro, em chunks.
 * @param {(text: string, salt: number) => number} hash  o MESMO hash do céu — a lua tem de cair
 *   sempre no mesmo lugar, pela mesma promessa que vale para a estrela.
 * @param {{minRadiusOverOuter?: number}} [options]  sobrepõe o piso de legibilidade
 *   (`MOON_MIN_OVER_OUTER`). Existe para a bancada varrer o parâmetro sem tocar na cena; zero
 *   desliga o piso e devolve o modelo anterior, que é o controle do experimento.
 */
export function moonsOf(node, centralMass, hash, { minRadiusOverOuter = MOON_MIN_OVER_OUTER } = {}) {
  const sections = partsOf(node);
  const mass = node.chunks || 0;
  if (sections.length < MU_MIN || mass <= 0) return { moons: [], dropped: 0 };

  const zone = moonZone(mass, node.radius, centralMass);
  if (!zone.ok) return { moons: [], dropped: 0 };

  /*
   * UMA BANDA RADIAL POR LUA — cada uma com órbita própria, e a não-colisão continua DEMONSTRADA.
   *
   * ## O que estava errado antes, e por quê
   *
   * Todas as luas de um corpo corriam na MESMA elipse, defasadas em anomalia média (Jano/Epimeteu).
   * Isso torna o encontro impossível por construção, e a prova era sólida — mas generalizava uma
   * EXCEÇÃO: no Sistema Solar os co-orbitais são dois casos conhecidos, e todo o resto tem órbita
   * própria. Na tela o modelo lê exatamente como o que ele é: uma fila de contas no mesmo fio.
   *
   * A conta que fechava a porta era esta, e ela estava certa no que mediu: separar N luas em raio
   * exige `W ≥ 2·r_lua·N`, e medido no corpus `W/r_lua` vai de 0,44 a 3,05 — **0 de 40 corpos**
   * comportavam sequer DUAS faixas. O que ela não questionou foi o `r_lua`: ele vinha da densidade
   * comum (`r = P·∛(1/N)`), o que dá luas de 0,44 a 0,58 do raio do pai. Um satélite com metade do
   * raio do primário não é lua, é binário — Titã tem 4,4% de Saturno e Io 2,6% de Júpiter. O
   * gargalo não era a janela: era a lua estar desenhada grande demais para caber nela.
   *
   * ## A prova, agora
   *
   * A janela é cortada em N bandas disjuntas e cada lua vive dentro da SUA. O que fecha a prova é
   * uma propriedade do `advance()`: a posição da lua é `(r·cosθ, r·senθ·sen i, r·senθ·cos i)`, cuja
   * distância ao pai é `r` EXATAMENTE, seja qual for a inclinação. Então basta o intervalo radial
   * `[a(1−e) − r_lua, a(1+e) + r_lua]` caber na banda: duas luas de bandas distintas nunca estão à
   * mesma distância do pai, logo nunca se encontram — com inclinação, periastro, fase, período e
   * excentricidade todos próprios. O orçamento de cada banda de largura `B`:
   *
   * | fatia | quanto |
   * |---|---|
   * | diâmetro da lua | `B/2` (`r_lua = B/4`) |
   * | excursão da elipse (`2·a·e`) | `B/4` |
   * | folga vazia, `B/8` de cada lado | `B/4` |
   *
   * ⚠️ O que se perdeu: a excentricidade era `(outer−inner)/(outer+inner)` e portanto MEDIA a folga
   * da janela — era o gradiente de idade do corpo, 0,050 a 0,231. Agora ela é hasheada por lua
   * dentro do que a banda paga, o que é bem menor. A idade não sumiu da cena (ela é o raio orbital
   * do PAI, que continua sendo o eixo do tempo), mas deixou de aparecer duas vezes.
   */
  const mu = MU_CORE * (mass / Math.max(centralMass, 1));
  const parentPhysical = raioDeCorpo(mass);
  const window = zone.outer - zone.inner;

  /*
   * QUANTAS LUAS CABEM — agora o corte é de LEGIBILIDADE, não de colisão.
   *
   * Uma banda mais estreita do que `4·r_min` produziria uma lua menor que o piso, e o piso existe
   * porque abaixo dele a lua deixa de ser um corpo e vira poeira: `MOON_MIN_FRACTION` do raio do
   * pai. O valor é físico — 1% põe a menor lua desta cena entre Amalteia (0,12% de Júpiter) e Io
   * (2,6%), que é a faixa em que satélites reais efetivamente vivem.
   */
  const minBand = BAND_MOONS * MOON_MIN_FRACTION * parentPhysical;
  // O piso que decide se a lua aparece — ver `MOON_MIN_OVER_OUTER`. Zero desliga (é o que a
  // bancada passa para reproduzir o modelo anterior).
  const legibilityCap =
    minRadiusOverOuter > 0
      ? Math.floor(window / (BAND_MOONS * minRadiusOverOuter * zone.outer))
      : Number.POSITIVE_INFINITY;
  const count = Math.max(1, Math.min(sections.length, Math.floor(window / minBand), legibilityCap));

  const band = window / count;
  /*
   * O raio DESENHADO é o que a banda paga, limitado pelo que a massa permite.
   *
   * `raioDeCorpo(massa/N)` continua sendo o teto: uma lua não pode ser desenhada maior do que a
   * massa dela implica. Mas ela pode ser menor, e quase sempre é — essa é a compressão declarada
   * desta cena, do mesmo tipo que a escala log dos tamanhos do céu. Sem ela, órbita própria não
   * cabe em corpo nenhum.
   */
  const moonMass = mass / count;
  const moonRadius = Math.min(raioDeCorpo(moonMass), band / BAND_MOONS);
  // Excursão radial que sobra depois da lua: metade para cada lado do semieixo.
  const wiggle = band / 2 - moonRadius - band / 8;
  // Plano médio do sistema. Cada lua se afasta dele, mas não tanto que o sistema deixe de ler
  // como um sistema — Saturno tem os regulares a menos de 1,5° e os irregulares espalhados.
  const systemTilt = (hash(node.id, 12) - 0.5) * 0.9;

  const moons = sections.slice(0, count).map((label, order) => {
    // Banda `order`: da mais interna para a mais externa, na ordem das seções do documento. A
    // estrutura do texto continua legível no sistema, agora como distância em vez de fase.
    const semiMajor = zone.inner + band * (order + 0.5);
    return {
      id: `${node.id}#${order}`,
      label,
      mass: moonMass,
      drawRadius: moonRadius,
      semiMajor,
      /*
       * A EXCENTRICIDADE NÃO É ESCOLHIDA — ela é o que a banda deixa sobrar. E por isso ela volta
       * a MEDIR A IDADE, que é o que o modelo co-orbital tinha e a primeira versão em bandas
       * perdeu ao sortear `e` por hash.
       *
       * A cadeia é direta: `wiggle ∝ band = W/N`, e `W = inner·(slack − 1)` com
       * `slack = a_pai/a_corte`. Logo `e ≈ (slack − 1)/(8N)` — proporcional à folga da janela, que
       * é exatamente a grandeza que o modelo antigo usava (`e = (outer−inner)/(outer+inner)`).
       * Corpo recém-passado do limiar ganha órbita quase circular; o mais antigo do céu, a maior
       * elipse que a banda comporta. Sortear aqui apagava isso e não comprava nada: as luas já se
       * distinguem por raio, período, fase, periastro e inclinação.
       *
       * E ela continua VARIANDO ENTRE AS LUAS do mesmo corpo, sem hash nenhum: a excursão radial
       * `wiggle` é a mesma em todas as bandas, então a lua interna, com `a` menor, fica mais
       * excêntrica que a externa. É a razão física, não decoração.
       *
       * ⚠️ Um confundidor que o modelo antigo não tinha: o `N` no denominador. Documento com mais
       * seções tem bandas mais estreitas e portanto luas menos excêntricas na mesma idade. O
       * modelo co-orbital escapava disso só porque colapsava todas as luas numa órbita só.
       */
      eccentricity: Math.max(wiggle, 0) / semiMajor,
      periapsis: hash(`${node.id}#${order}`, 13) * Math.PI * 2,
      inclination: systemTilt + (hash(`${node.id}#${order}`, 15) - 0.5) * INCLINATION_SPREAD,
      // Terceira lei: a lua interna corre mais rápido. É isto que impede o alinhamento permanente
      // — com períodos distintos, qualquer configuração se desfaz sozinha.
      // A terceira lei INTEIRA, vezes a escala de tempo declarada: a interna continua correndo
      // mais que a externa na razão certa, e o sistema todo passa a andar num relógio visível.
      // Ver `motion-catalog.js`, entrada `moonOrbit`.
      meanMotion: keplerMeanMotion(semiMajor, mu) * MOON_TIME_SCALE,
      meanAnomaly: hash(`${node.id}#${order}`, 11) * Math.PI * 2,
    };
  });

  return { moons, dropped: sections.length - count };
}

export const ZONE_CONSTANTS = Object.freeze({
  ROCHE_FLUID,
  K_RAIO,
  MU_MIN,
  MU_CORE,
  MOON_MIN_OVER_OUTER,
});
