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
 * desenhado. São grandezas distintas e continuam distintas — `physicalRadius` para mecânica,
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
 * Com `k = 0,813` e o corpus medido em 2026-08-05 (M = 3644 chunks), `a_corte = 44,0` — o meio
 * exato da casca dos arquivos (`SHELLS.file = [26, 62]`). Ou seja: **a metade mais antiga do céu
 * segura luas, a metade mais nova não.** Cortar na mediana é o que faz a distinção informar; um
 * corte que deixasse todos ou nenhum dentro não diria nada.
 *
 * Confirmação de que o valor não é arbitrário em outra frente: a 43 chunks ele devolve raio
 * físico 2,85 contra 2,84 do raio desenhado. No meio da distribuição as duas réguas coincidem, e
 * elas só divergem nos extremos — que é exatamente o que uma compressão log deve fazer.
 *
 * ⚠️ `a_corte` depende de `M_total`. Um corpus muito maior empurra o corte para fora e as luas
 * somem; é comportamento correto (mais massa central = Hill menor), mas quem dobrar o corpus tem
 * de conferir que ainda sobra alguém. `moonZone` devolve a folga para isso ser mensurável.
 */
const DENSITY_K = 0.813;

/**
 * Razão de massas mínima entre pai e satélite para a leitura "lua" valer.
 *
 * Não é limiar inventado: é a fronteira que o `catalogo-celeste.md` já mediu neste corpus, na
 * tabela de zonas por razão de massa — `μ ≥ 5` é *sistema com primária* (Sol–Júpiter), e abaixo
 * disso é *sistema duplo* (Plutão–Caronte, μ = 0,12 invertido), que é outro corpo e não está
 * implementado.
 *
 * Aqui `μ` é o número de seções, porque a massa do documento se divide entre elas. A consequência
 * medida: com `μ ≥ 5` o raio da lua fica em 0,44–0,58 do raio do pai; sem o corte, um documento de
 * uma seção só produziria uma "lua" do MESMO tamanho do pai, que é um binário e não uma lua.
 */
const MU_MIN = 5;

/**
 * Parâmetro gravitacional do núcleo, `G·M`, na mesma unidade que o resto da cena.
 *
 * Extraído da lei que as órbitas já obedecem em `graph.js`: `speed = (r/26)^-1.5 · 0.16`. Igualando
 * a `ω = sqrt(GM/r³)` em `r = 26` sai `GM = 0.16² · 26³`. Derivar em vez de escolher é o que faz a
 * lua girar em ritmo COERENTE com a órbita do pai — uma constante nova aqui deixaria os dois
 * movimentos falando de sistemas diferentes, que é o defeito que a cena já pagou uma vez com os
 * arcos a 38% da distância real.
 */
const MU_CORE = 0.16 ** 2 * 26 ** 3;

/** Raio físico implicado pela massa, a densidade comum. NÃO é o raio desenhado. */
export const physicalRadius = (mass) => DENSITY_K * Math.cbrt(Math.max(mass, 0));

/** Limite de Roche: abaixo dele o satélite vira anel. Em unidades de mundo. */
export const rocheLimit = (mass) => ROCHE_FLUID * physicalRadius(mass);

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
  const inner = rocheLimit(mass);
  const outer = hillRadius(orbitalRadius, mass, centralMass);
  return { inner, outer, ok: outer > inner, slack: inner > 0 ? outer / inner : 0 };
}

/**
 * As luas de um corpo, ou lista vazia se ele não pode ter nenhuma.
 *
 * Três recusas, e cada uma tem um motivo físico em vez de um teto de desempenho: seções de menos
 * (é binário, não lua), janela fechada (o corpo está perto demais do núcleo) e massa zero.
 *
 * @param {{sections?: string[], chunks?: number, radius: number, id: string}} node  nó de arquivo
 *   já com órbita resolvida (`radius` é o raio orbital dele, não o desenhado).
 * @param {number} centralMass  massa do corpus inteiro, em chunks.
 * @param {(text: string, salt: number) => number} hash  o MESMO hash do céu — a lua tem de cair
 *   sempre no mesmo lugar, pela mesma promessa que vale para a estrela.
 */
export function moonsOf(node, centralMass, hash) {
  const sections = node.sections || [];
  const mass = node.chunks || 0;
  if (sections.length < MU_MIN || mass <= 0) return [];

  const zone = moonZone(mass, node.radius, centralMass);
  if (!zone.ok) return [];

  // A massa do documento se divide entre as seções. É o único modelo que o payload permite —
  // `sections` são títulos, sem contagem própria de chunks.
  const moonMass = mass / sections.length;
  // Densidade comum entre pai e filha: a razão de raios é a raiz cúbica da razão de massas. Não é
  // a lei log dos tamanhos desenhados — aplicá-la aqui daria luas do tamanho do pai, medido.
  const moonRadius = physicalRadius(moonMass);
  // `G·m` do PAI, herdado do núcleo pela fração de massa. É o que faz a lua interna girar mais
  // rápido que a externa dentro do mesmo sistema, pela terceira lei de Kepler.
  const mu = MU_CORE * (mass / Math.max(centralMass, 1));

  return sections.map((label, order) => {
    /*
     * ORDEM DA SEÇÃO → RAIO. A primeira seção orbita mais perto.
     *
     * A faixa entre Roche e Hill é estreita (medido: 1,00–1,38 de razão, mediana 1,08), então o
     * espalhamento radial é pequeno de propósito e quem separa as luas na tela é a FASE. Usar a
     * ordem em vez de um hash é de graça e informa: o sistema de luas lê como a estrutura do
     * documento, de cima para baixo, do centro para fora.
     */
    const t = sections.length > 1 ? order / (sections.length - 1) : 0;
    const radius = zone.inner + (zone.outer - zone.inner) * t;
    return {
      id: `${node.id}#${order}`,
      label,
      mass: moonMass,
      radius,
      drawRadius: moonRadius,
      // Kepler dentro do sistema do pai. Medido no corpus: ~50 s por volta nos corpos maiores —
      // mais rápido que a órbita do pai em torno do núcleo, como um sistema de luas real.
      speed: Math.sqrt(mu / radius ** 3),
      phase: hash(`${node.id}#${order}`, 11) * Math.PI * 2,
      // Inclinação própria, pequena: luas regulares são quase coplanares com o equador do pai.
      inclination: (hash(`${node.id}#${order}`, 12) - 0.5) * 0.5,
    };
  });
}

export const ZONE_CONSTANTS = Object.freeze({ ROCHE_FLUID, DENSITY_K, MU_MIN, MU_CORE });
