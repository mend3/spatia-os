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
import { MOTION, meanMotion as keplerMeanMotion } from './motion-catalog.js';

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
const DENSITY_K = 0.70;

/**
 * Folga mínima entre as superfícies de duas luas vizinhas, em raios de lua.
 *
 * 1,5 = meia lua de espaço vazio entre uma e outra. Não é margem de segurança numérica (a
 * separação é exata, ver `moonsOf`): é legibilidade. Duas luas que se tangenciam lêem como um
 * corpo alongado, não como duas.
 */
const SPACING_SAFETY = 1.5;

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
 * Vem do `motion-catalog.js`, que é onde a lei orbital mora. Aqui ele era RECONSTRUÍDO a partir da
 * calibração do `graph.js` (`0.16² · 26³`), com um comentário explicando a derivação justamente
 * porque o código não a expressava — e as duas cópias podiam divergir sem que nada acusasse.
 * Divergindo, a lua giraria num ritmo INCOERENTE com a órbita do pai: dois movimentos falando de
 * sistemas solares diferentes, que é o defeito que a cena já pagou uma vez com os arcos a 38% da
 * distância real.
 */
const MU_CORE = MOTION.keplerOrbit.gravitationalParameter;

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
  if (sections.length < MU_MIN || mass <= 0) return { moons: [], dropped: 0 };

  const zone = moonZone(mass, node.radius, centralMass);
  if (!zone.ok) return { moons: [], dropped: 0 };

  /*
   * UMA ELIPSE POR CORPO, e todas as luas dele correm nela. É o que torna a ausência de colisão
   * DEMONSTRÁVEL em vez de provável.
   *
   * A alternativa óbvia — uma órbita por lua, espalhadas em raio — não fecha aqui, e a conta diz
   * por quê: luas em raios diferentes têm ω diferente (Kepler), então mais cedo ou mais tarde elas
   * se alinham em fase, e evitar o encontro exige separar as FAIXAS radiais por 2 raios de lua. A
   * janela entre Roche e Hill não tem esse espaço: com a largura medida, `N ≤ (W/2P)^(3/2)` dá
   * menos de 1 — nem uma lua caberia.
   *
   * Co-orbital resolve por construção. Duas luas na MESMA elipse, com o mesmo período, mantêm a
   * separação para sempre: elas percorrem a mesma curva defasadas no tempo, e nunca se alcançam.
   * Não é truque — é a configuração de Jano e Epimeteu, e a dos troianos de Tétis.
   *
   * ⚠️ Por isso inclinação e argumento do periastro são do CORPO, não da lua. Hasheá-los por lua
   * cruzaria as elipses e devolveria o problema que esta escolha resolve.
   */
  const semiMajor = (zone.inner + zone.outer) / 2;
  /*
   * A EXCENTRICIDADE NÃO É ESCOLHIDA — ela é o que sobra.
   *
   * O periastro não pode entrar no limite de Roche (a lua se despedaça) nem o apoastro sair da
   * esfera de Hill (a lua escapa). Com o semieixo no meio da janela, isso fixa
   * `e = (outer − inner)/(outer + inner)`: a maior elipse que a zona comporta, sem constante
   * nenhuma. Corpo com pouca folga ganha órbita quase circular, e é a resposta correta — ele
   * realmente não tem espaço para mais que isso.
   */
  const eccentricity = (zone.outer - zone.inner) / (zone.outer + zone.inner);
  // `G·m` do PAI, herdado do núcleo pela fração de massa — mesma origem que a órbita do pai em
  // torno do núcleo, para os dois movimentos falarem do mesmo sistema.
  const mu = MU_CORE * (mass / Math.max(centralMass, 1));
  // Movimento médio: uma volta a cada `2π/n`. Constante na elipse — a lua acelera no periastro e
  // desacelera no apoastro (segunda lei de Kepler), mas o período não muda.
  const meanMotion = Math.sqrt(mu / semiMajor ** 3);

  /*
   * QUANTAS LUAS CABEM — o clamp, e ele é geométrico, não um teto arbitrário.
   *
   * Luas igualmente espaçadas em anomalia média se aproximam mais perto do APOASTRO, onde a
   * velocidade é mínima e o mesmo intervalo de tempo cobre menos arco. A separação lá vale
   * `2π·a·√((1−e)/(1+e))/N`, e ela tem de passar de `2·r_lua·SPACING_SAFETY`.
   *
   * O ponto fixo existe porque `r_lua` DEPENDE de N: cortar luas engorda as que sobram
   * (`massa/N`), o que reduz a capacidade de novo. Resolver por iteração descendente converge em
   * poucos passos e nunca sobe — o contrário poderia oscilar para sempre.
   */
  const parentPhysical = physicalRadius(mass);
  const apoapsisFactor = Math.sqrt((1 - eccentricity) / (1 + eccentricity));
  let count = sections.length;
  for (let guard = 0; guard < 8; guard++) {
    const moonRadius = parentPhysical * Math.cbrt(1 / count);
    const capacity =
      (Math.PI * semiMajor * apoapsisFactor) / (moonRadius * SPACING_SAFETY);
    if (count <= capacity) break;
    const next = Math.max(1, Math.floor(capacity));
    if (next >= count) break;
    count = next;
  }

  // Densidade comum entre pai e filha: a razão de raios é a raiz cúbica da razão de massas. NÃO é
  // a lei log dos tamanhos desenhados — aplicá-la aqui daria luas do tamanho do pai, medido.
  const moonMass = mass / count;
  const moonRadius = physicalRadius(moonMass);
  // Pose do sistema, sorteada uma vez por CORPO: sem isso todo sistema de luas nasceria no mesmo
  // plano e com o periastro apontando para o mesmo lado — o céu leria como carimbo.
  const inclination = (hash(node.id, 12) - 0.5) * 0.9;
  const periapsis = hash(node.id, 13) * Math.PI * 2;
  const phase0 = hash(node.id, 11) * Math.PI * 2;

  const moons = sections.slice(0, count).map((label, order) => ({
    id: `${node.id}#${order}`,
    label,
    mass: moonMass,
    drawRadius: moonRadius,
    semiMajor,
    eccentricity,
    periapsis,
    inclination,
    meanMotion,
    /*
     * ORDEM DA SEÇÃO → FASE, e o espaçamento é EXATAMENTE uniforme.
     *
     * Uniforme é o que a demonstração acima exige — um hash aqui agruparia luas por acaso e o
     * clamp deixaria de garantir coisa alguma. E sai informação de graça: o sistema de luas lê
     * como a estrutura do documento, na ordem, em volta do corpo.
     */
    meanAnomaly: phase0 + (Math.PI * 2 * order) / count,
  }));

  return { moons, dropped: sections.length - count };
}

export const ZONE_CONSTANTS = Object.freeze({ ROCHE_FLUID, DENSITY_K, MU_MIN, MU_CORE });
