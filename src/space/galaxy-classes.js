/**
 * The Hubble ladder, as DATA — four classes, and the rule that maps a folder onto one of them.
 *
 * It lives in its own file, and away from the shader, for the reason `ring-profiles.js:1-11` already
 * states for the ring profiles: structure that belongs to the data has to be legible and
 * checkable against the real measurement, not scattered across shader constants. Everything a
 * reviewer needs to argue with is a table here.
 *
 * ## The corpus this ladder was cut for (measured 2026-08-05 against `GET /api/graph`)
 *
 * 459 sky nodes (`kind !== 'lock'`, `corpus.js:19`) · 69 dir · 2 repo · 388 file. Direct FILE
 * children per directory, n = 69:
 *
 *     min 2 · Q1 2 · median 4 · Q3 6 · max 24
 *     2x23  3x10  4x9  5x9  6x3  7x6  8x3  10  11  12  16  20  24
 *
 * `repo:devshell-one` = 54 files, `repo:agent-memory` = 0. Both fall outside the directory
 * clamp [2, 24] and are absorbed by the open-ended end bands rather than by a special case.
 *
 * The distribution is severely bottom-heavy, and that is what forced equal-POPULATION bands:
 * equal-width bands over [2, 24] would put ~93% of the folders in band 1. The cuts below give
 * 23 / 19 / 21 / 6, which sums to 69 (re-measured, not copied). The top band is deliberately
 * rare — it is exactly `.k8s` (24), `runbooks/quick-actions` (20), `.claude/agents` (16),
 * `oracle/cli` (12), `daimon/scripts` (11) and `terraform/environments/beta` (10). Those six
 * SHOULD be the striking objects in the sky.
 *
 * ## Where each number comes from — measured, arithmetic, or pick
 *
 * This distinction is the point of the table. Nothing here is presented as a measurement that
 * was not taken.
 *
 * - `pitchDeg` — PICK, inside the observed per-class ranges (Sa 4-25 deg, Sb 8-35, Sc 10-50;
 *   Perez-Villegas et al. 2013). Chosen so total wrap stays under one turn: past ~1 turn a
 *   spiral merges into a smooth annulus at the sizes this object is drawn at. V3's 22 deg is
 *   ABOVE the ~20 deg dynamical ceiling for a long-lived pattern — accepted and labelled, V3 is
 *   the transient multi-armed class and 22 deg is what keeps 6 arms from colliding.
 * - `invTanPitch`, `wrap`, `turns` — ARITHMETIC from `pitchDeg` and `rIn`, not measurements:
 *   `wrap = ln(1/rIn) / tan(i)` and `turns = wrap / 2pi`. Cross-check against the reference's
 *   winding table (0.82 turns for 15 deg over an outer/inner ratio of 4): V1 gives 0.813 at
 *   14 deg over 3.57. Consistent.
 * - `bulgeFraction` (B/T) — V1's 0.25 and V3's 0.05 bracket Graham & Worley 2008
 *   (`log(B/D) = -0.49` -> B/T 0.24 for Sa; `-1.40` -> 0.038 for Scd; that conversion is
 *   arithmetic). V2's 0.15 and V0's 0.75 are PICKS. V0 is 0.75 and not 1.0 because a pure
 *   bulge is a fuzzy ball, and 0.75 leaves the lens that makes it an S0.
 * - `barLen`, in units of the disk outer radius — Erwin 2005's measured bar-length means in
 *   R25 (early type 0.2-0.8, mean 0.38; late type 0.05-0.35, mean 0.14; the S4G re-measure
 *   gives 0.23), used directly with R25 identified with the disk outer radius.
 * - `cosIncBase`/`cosIncSpread` — DELIBERATE FABRICATION, and it must not be read as physics.
 *   Real inclination is random and uniform in cos(i). Here V0 is flatter than V1-V3 on purpose,
 *   because flatness is the cheapest class cue that survives to 8 px. Labelled, not laundered.
 * - `split` (k) — ART DIRECTION. It encodes only the ORDERING of integrated B-V (E/S0 0.9-1.0,
 *   Sa/Sb 0.65, Sc 0.53, Sd 0.3-0.4). No source hands out RGB triplets, and this one does not
 *   pretend to.
 *
 * ## The deviation from the brief, stated plainly: V0 has ZERO arms
 *
 * The brief asked for 3 to 6 arms. 23 of the 69 directories — a third of the sky's folders —
 * have exactly 2 files. Three arms for two files means at least one arm branches nothing, and
 * the MOST COMMON object in the sky would assert a group that does not exist. `catalog.js:247`
 * already rules on this exact failure mode for a different feature: "dar crosta a um diretorio
 * afirmaria um objeto que nao ha."
 *
 * Drawing the empty arm dim instead does not survive the sizes: a hub is 4-16 px of anchor
 * radius in the default pose, so ~11-46 px of disk, and under `UnrealBloomPass(0.58, 0.32,
 * 0.72)` "two bright and one dim" is not a reading an operator can make.
 *
 * So 3-6 arms is honored for every folder with >= 3 files, and below that the body is a
 * lenticular with zero arms — which the Hubble reference supplies for free, since S0 is BY
 * DEFINITION a disk without spiral structure.
 *
 * `MIN_ARMS` is the escape hatch. Setting it to 3 restores literal compliance with the brief in
 * one line and with no other change. The owner gets the switch; the default is the argued
 * position.
 */

/**
 * Floor on the arm count. 0 lets V0 be a true lenticular; 3 turns it into an Sa-like disk and
 * restores the letter of the brief. Nothing else in the codebase needs to change either way —
 * `galaxyParams` borrows V1's winding geometry when a class with no arms of its own is forced
 * to grow some.
 */
export const MIN_ARMS = 0;

const DEG = Math.PI / 180;

/** `wrap` and `turns` are arithmetic, never typed by hand — the table cannot drift from them. */
function spiral(pitchDeg, rIn) {
  const invTanPitch = 1 / Math.tan(pitchDeg * DEG);
  const wrap = Math.log(1 / rIn) * invTanPitch;
  return { pitchDeg, rIn, invTanPitch, wrap, turns: wrap / (2 * Math.PI) };
}

const NO_SPIRAL = { pitchDeg: 0, rIn: 1, invTanPitch: 0, wrap: 0, turns: 0 };

export const GALAXY_CLASSES = Object.freeze([
  Object.freeze({
    label: 'V0',
    id: 'LENTICULAR',
    hubble: 'S0',
    band: 'files <= 2',
    dirs: 23,
    arms: 0,
    ...NO_SPIRAL,
    bulgeFraction: 0.75,
    // Flatter than every other class, and that IS the cue: at 8 px the ellipse axis ratio is
    // the last thing still readable after knot count and bar have dissolved.
    cosIncBase: 0.38,
    cosIncSpread: 0.1,
    barLen: 0,
    split: 0.15,
  }),
  Object.freeze({
    label: 'V1',
    id: 'SPIRAL',
    hubble: 'Sa',
    band: 'files 3-4',
    dirs: 19,
    arms: 3,
    ...spiral(14, 0.28),
    bulgeFraction: 0.25,
    cosIncBase: 0.62,
    cosIncSpread: 0.34,
    barLen: 0,
    split: 0.28,
  }),
  Object.freeze({
    label: 'V2',
    id: 'BARRED',
    hubble: 'SBb',
    band: 'files 5-8',
    dirs: 21,
    arms: 4,
    ...spiral(17, 0.38),
    bulgeFraction: 0.15,
    cosIncBase: 0.62,
    cosIncSpread: 0.34,
    // Arms launch from the bar ends, so the inner radius of the spiral IS the bar length.
    barLen: 0.38,
    split: 0.38,
  }),
  Object.freeze({
    label: 'V3',
    id: 'MULTI-ARM',
    hubble: 'SBc',
    band: 'files >= 9',
    dirs: 6,
    arms: 6,
    ...spiral(22, 0.2),
    bulgeFraction: 0.05,
    cosIncBase: 0.62,
    cosIncSpread: 0.34,
    barLen: 0.2,
    split: 0.45,
  }),
]);

/*
 * Strictly increasing, and the loop below is TOTAL on all of R — there is no `else` branch and
 * no clamp, so nothing can fall through and produce a blank object.
 *
 * The two repos land where they should without a special case: `repo:agent-memory` (0 files)
 * becomes V0, which is honest — a hub whose only child is a directory has no file group to
 * branch. `repo:devshell-one` (54) becomes V3. Repos keep their identity through HUE, not
 * morphology: `KIND_COLORS.repo = 0xffab54` against `KIND_COLORS.dir = 0x5a6478`.
 *
 * The CLASS is open-ended; the SIZE is not, and it never comes from here — size stays on
 * `chunks` through the existing sprite radius, which is the one aggregate `catalog.js:243`
 * sanctions. One quantity, one job: a folder that grows in bytes must not change class.
 */
/*
 * MORPHOLOGY COMES FROM MASS CONCENTRATION, NOT FROM FILE COUNT — and the two axes it beat were
 * both measured on the live corpus (70 hubs with direct file children) before this was chosen.
 *
 * The rule of the scene is that mass is `chunks`. Concentration is how that mass is DISTRIBUTED
 * among the direct children — the share held by the largest one — and it is the honest analogue of
 * bulge-to-total: light concentrated at the centre is an early type, light spread through a disc is
 * a late type. Astrophysics hands us the mapping for free.
 *
 * | axis | spread | `devshell-one` (54 files) | arm ceiling bites |
 * |---|---|---|---|
 * | file count | 27x, Q1 == min == 2 | V3 | — |
 * | mean density (chunks/file) | 66x | **V0, zero arms** | 33 of 70 |
 * | concentration (this one) | 0.06 to 0.93 | **V3** | 18 of 70 |
 *
 * File count was rejected because half the folders hold 2 to 4 files: almost every galaxy would
 * get the same silhouette, with the variations existing in the code and not on screen.
 *
 * Mean density was rejected by the case it gets wrong: it reads FILE SIZE, not concentration, so
 * the richest folder in the sky — 54 files, 3551 chunks — came out a featureless lens with no
 * arms, while a 4-file folder of large documents came out a grand-design spiral. Concentration
 * puts both where they belong: `devshell-one` spreads its mass (largest child holds 23%) and is a
 * multi-armed disc; `proxy` has one file holding 93% and is a lenticular.
 *
 * The cuts ARE the measured quartiles of the corpus (0.375 / 0.500 / 0.669), so the four classes
 * are populated 17 / 24 / 13 / 16 by construction instead of by a guess. They are descending
 * because concentration runs opposite to the Hubble sequence: more concentrated is earlier.
 */
const CUTS = Object.freeze([0.669, 0.5, 0.375]);

/**
 * Below this many direct files a folder has no groups to branch, so it gets no arms.
 *
 * ⚠️ **3 → 9 em 2026-08-07. É o ÚNICO lever semântico da espiral, e o único que devia mudar.**
 *
 * `galaxyParams` já limita `arms <= nº de arquivos` com o argumento certo — *mais braços que
 * arquivos afirmaria grupos que não existem*. Mas **um arquivo por braço também não é grupo**, e
 * era isso que 3 permitia: uma pasta de 3 arquivos ganhava 3 braços de um arquivo cada, afirmando
 * três agrupamentos onde não há nenhum.
 *
 * 9 é aritmética do próprio modelo: **3 arquivos por braço** (o menor grupo que ainda é grupo) em
 * **3 braços** (a menor contagem de uma classe que tem braços, a V1/Sa). Medido no corpus, o
 * efeito é o que a cena precisava e nenhum outro lever entrega:
 *
 *     MIN_FILES 3 → 129 dos 228 hubs espiralam (57%)
 *     MIN_FILES 9 →  43 dos 228 hubs espiralam (19%)
 *
 * ⚠️ E é aqui, não no `SPAN` nem no `LOD_ARM_PX`. Medido: com `SPAN` 1,5 e `LOD` 14, mexer só na
 * geometria deixa 122 hubs espiralando — a tinta cai e as espirais continuam lá. Os três levers
 * têm donos distintos: `SPAN` governa TINTA, `LOD_ARM_PX` governa se o braço é RESOLVÍVEL, e
 * este governa se há GRUPO a afirmar. Trocar um pelo outro é o erro que
 * `modelo-de-renderizacao.md:127-149` chama de escada por escala.
 *
 * `MIN_ARMS` continua sendo a escotilha para o caminho oposto. Medição em
 * `docs/calibracao.md` §2.3.
 */
export const MIN_FILES_FOR_ARMS = 9;

/**
 * The one place the classification rule lives.
 *
 * @param {number} concentration  share of the hub's direct-child mass held by its largest child
 * @returns {typeof GALAXY_CLASSES[number]}
 */
export function classForConcentration(concentration) {
  // Unknown resolves to the MOST concentrated class, and that is the truthful default rather than
  // a middle one: a hub with no direct file children has nothing spread across a disc, and a hub
  // with exactly one holds 100% of its mass there. Both are lenticulars.
  const c = Number.isFinite(concentration) ? concentration : 1;
  let i = 0;
  while (i < CUTS.length && c < CUTS[i]) i++;
  return GALAXY_CLASSES[i];
}

/**
 * How many arms this body actually draws.
 *
 * The class proposes; the file count disposes. An arm IS a group of files — that is the whole
 * semantic — so drawing more arms than there are files asserts groups that do not exist, which is
 * the same failure the catalog rules against when it refuses to give a directory a crust. The
 * ceiling bites on 18 of the 70 real hubs, all of them small.
 *
 * @param {typeof GALAXY_CLASSES[number]} klass
 * @param {number} files  direct FILE children (subdirectories do not count)
 */
export function armsFor(klass, files) {
  const n = Number.isFinite(files) ? Math.max(0, Math.round(files)) : 0;
  if (n < MIN_FILES_FOR_ARMS) return 0;
  return Math.min(klass.arms, n);
}
