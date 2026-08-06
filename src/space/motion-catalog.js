/**
 * MOTION CATALOG — stage 6 of `docs/modelo-de-renderizacao.md`, as data.
 *
 * `catalog.js` declares what a body IS and which features it may carry. This declares how a body
 * MOVES and which motions it may carry — and, exactly like there, the field that matters most is
 * the one saying what it may NOT.
 *
 * ## Why motion needs its own forbids
 *
 * The same argument that produced `catalog.js` applies to movement, and it has already cost this
 * project real work: a spiral arm drawn as a MATERIAL structure winds up, because the inner
 * material orbits faster (Lin-Shu). The link field died of exactly that, and the galaxy shader was
 * written around it. If motion is a bag of tunables that anything can opt into, that lesson lives
 * in one module's memory instead of in the model, and the next body to grow arms re-learns it.
 *
 * ## Everything here is f(time)
 *
 * No integration, no accumulated velocity, no internal state. `graph.js` computes
 * `angle = phase + elapsed * speed` and that is what makes a body's position reproducible — the
 * README's promise that "o mesmo conhecimento cai sempre no mesmo lugar". A motion that cannot be
 * written as a closed function of the scene clock does not belong in this catalog.
 *
 * ## O que já LÊ deste catálogo, e o que só está declarado
 *
 * A honestidade que `catalog.js` exige das classes vale aqui: `status: 'applied'` significa que o
 * renderizador consome ESTA entrada; `'own'` que o movimento existe na cena mas com a constante
 * dentro do próprio módulo, ainda não centralizada; `'declared'` que só o modelo existe.
 *
 * Hoje só `expansion` continua `declared` — nada expande na cena. Todo o resto é `applied`, e a
 * mudança não foi a substituição mecânica que este parágrafo prometia: centralizar revelou TRÊS
 * constantes que já viviam em dois lugares, livres para divergir em silêncio.
 *
 * | duplicata | onde estava | o que a divergência quebrava |
 * |---|---|---|
 * | `GM` do núcleo | `graph.js:makeOrbit` e `orbital-zones.js:MU_CORE` | lua e pai em sistemas diferentes |
 * | taxa do pulso | vertex shader e o espelho JS de `starRadius` | anel respirando fora de fase com a estrela |
 * | taxa da granulação | três oitavas soltas no GLSL | — (só ilegível) |
 * | velocidade de padrão | `galaxy.js:OMEGA_P` (0,06) contra os 0,1396 que a cena roda | a bancada checando enrolamento 2,33× mais devagar que a cena |
 *
 * A segunda é a mais instrutiva: o comentário do espelho JÁ afirmava "a MESMA expressão do
 * shader, nenhum caminho separado para manter em dia", e três literais depois isso era falso.
 *
 * ⚠️ `applied` também compromete o campo `reduced`. Declarar `freeze` e continuar animando é a
 * mesma mentira com outra roupa — `boil` e `spin` só puderam virar `applied` depois de obedecer.
 *
 * ## Reduced motion
 *
 * The project's rule is already written in the point shader: with `prefers-reduced-motion` the
 * pulse freezes but the highlight stays — "menos movimento, não menos informação". Each entry
 * declares its own `reduced` behaviour rather than every renderer re-deciding: `freeze` keeps the
 * final look and stops the animation, `keep` means the motion carries information that its
 * absence would delete.
 */

/**
 * Frame-rate independent smoothing, and the ONE law the whole scene uses.
 *
 * `x += (target - x) * k` is the tempting form and it is wrong: `k` is a fraction PER FRAME, so at
 * 120fps it converges twice as fast as at 60, and a long frame becomes a jump. The long frame
 * happens exactly while dragging the mouse (raycast plus buffer uploads in one frame), so the
 * defect shows up at the worst possible moment.
 *
 * `rate` is in 1/s.
 */
export const smooth = (current, target, rate, delta) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));

/**
 * Convergence rates, 1/s. Gathered here because they were scattered across four modules with no
 * way to see them side by side — and their RELATIVE order is the actual design: the camera has to
 * answer faster than the thing it is looking at settles, or the two read as fighting.
 */
export const RATE = Object.freeze({
  /** Camera orbit follows the pointer. */
  cameraOrbit: 9,
  /** Camera distance. Slower than orbit: zoom that snaps reads as a cut. */
  cameraZoom: 6,
  /** Flight to a focused body. */
  cameraFocus: 1.4,
  /** The anchor easing toward a body that is itself orbiting. */
  anchor: 2.6,
  /** Link arcs fading in and out. Instant appearance reads as a render glitch. */
  linkFade: 1 / 0.22,
});

/**
 * The motions, with who may carry them and — the field that earns its keep — who may not.
 *
 * `period` is in seconds per full turn where the motion is periodic. It is the readable unit: rad/s
 * hides how long a viewer has to wait to see anything happen.
 */
export const MOTION = Object.freeze({
  /**
   * A pattern that ROTATES without transporting material. The arms of a spiral.
   */
  patternSpin: Object.freeze({
    id: 'patternSpin',
    status: 'applied',
    law: 'phase advances with time at a single angular rate; curvature never changes',
    /*
     * ~45 s per turn, and the number comes from a perception threshold rather than taste.
     *
     * MEASURED before changing it: at 0.06 rad/s (105 s per turn) a point on the arm at 0.6 of the
     * disc radius travels 9 px/s with the camera locked on the body, and 1.2 px/s in the whole-sky
     * view where a galaxy is ~20 px across. The second number is under what an eye reads as
     * movement at all, which is why the field looked frozen.
     *
     * At 45 s the same point moves ~21 px/s locked and ~2.8 px/s in the sky. Slow enough to stay
     * majestic, fast enough that a few seconds of looking shows it turning.
     *
     * ⚠️ The rate is a property of the WAVE, not of the folder: every galaxy shares it. Only the
     * SIGN is hashed per body, because a sky where everything turns the same way reads as a stamp.
     */
    period: 45,
    allowed: ['galaxy'],
    forbids: Object.freeze({
      planet: 'superfície é material; padrão que gira sem transportar matéria não descreve crosta',
      photosphere: 'a fotosfera ferve, não gira como padrão — granulação é convecção, não onda',
    }),
    reduced: 'freeze',
  }),

  /**
   * Keplerian orbit: what is close turns fast. The law the whole sky already obeys.
   */
  keplerOrbit: Object.freeze({
    id: 'keplerOrbit',
    status: 'applied',
    law: 'mean motion proportional to a^-1.5, with a the semi-major axis',
    /*
     * `G·M` DO NÚCLEO — a ÚNICA constante da lei, e tudo o mais é derivado dela.
     *
     * Estava escrita duas vezes, com as duas cópias em formas diferentes: `graph.js` calibrava por
     * `(r/26)^-1.5 · 0.16` e `orbital-zones.js` reconstruía `0.16² · 26³` a partir dela — num
     * comentário que explicava a derivação exatamente porque o código não a expressava. Mudar o
     * `0.16` de um lado deixaria a lua girando num sistema solar diferente do pai dela, sem erro
     * em lugar nenhum: o defeito dos arcos a 38% da distância real, de novo.
     *
     * Os dois números abaixo são a CALIBRAÇÃO que produziu `GM`, não uma dependência viva. `26`
     * era a casca interna dos arquivos e `0.16` a velocidade angular que se quis lá. Mover a
     * casca hoje não muda `GM`, e é o comportamento certo — a massa do núcleo não depende de onde
     * o disco começa. Só que, escrito como estava, parecia depender.
     */
    gravitationalParameter: 0.16 ** 2 * 26 ** 3,
    /*
     * A LUA É O ÚNICO CORPO ELÍPTICO DA CENA, e a distinção pertence aqui.
     *
     * Arquivo, anel e o resto do céu correm em círculo (`e = 0`), e não por simplificação: o raio
     * orbital ali É o eixo do tempo, então uma elipse atravessaria cascas de idade — a decisão
     * está aberta em `modelo-de-renderizacao.md` §6. No sistema de luas o raio não é tempo, é
     * distância ao próprio pai, então a elipse não colide com invariante nenhum.
     *
     * A excentricidade continua fora daqui, e não por descuido: ela não é constante nem parâmetro
     * — é o que a BANDA de cada lua deixa sobrar, lua a lua (`orbital-zones.js`). O que este
     * catálogo pode ser dono é da LEI e do `GM` que a escala; a forma da elipse é do lugar que
     * mede a banda.
     */
    allowed: ['file', 'ring', 'moon'],
    forbids: Object.freeze({
      arm: 'braço com órbita kepleriana É o problema do enrolamento — foi assim que o campo de arestas morreu',
    }),
    reduced: 'keep',
  }),

  /**
   * A slow vertical sway added on top of an orbit.
   *
   * ## This one is not physics, and saying so is the point
   *
   * Every other entry here describes something a real body does. This one does not: a circular
   * orbit has no vertical oscillation, and a body that bobs is a body whose orbit is not closed.
   * It was found unnamed inside `advance()` while centralising the rest, which is exactly how a
   * decorative motion survives — nothing in the model claims it, so nothing questions it.
   *
   * It earns its place anyway, and the honest reason is legibility rather than fidelity: without
   * it the shells read as rigid laminae, the same defect the inclination fix (`z·sin(i)`) was
   * written to cure, and the eye picks up depth from relative motion before it picks it up from
   * perspective. Amplitude is 4.5% of the orbital radius — under the shell spacing, so a body
   * never sways into the age band next door. The radius is the time axis of this scene; a bob
   * wide enough to cross shells would make a file read as older than it is.
   */
  bob: Object.freeze({
    id: 'bob',
    status: 'applied',
    law: 'sine of the scene clock, phase hashed per body, amplitude a fraction of the orbital radius',
    period: (Math.PI * 2) / 0.35,
    /** Fraction of the ORBITAL radius. Must stay under the shell gap — see the header above. */
    amplitude: 0.045,
    /*
     * A truncated 2π, kept truncated on purpose.
     *
     * It only spreads the per-body phase, so the 0.0032 rad it loses against a real 2π is a
     * rounding of a random offset — invisible. Fixing it would move every body in the sky by a
     * hair, and this scene promises that the same knowledge falls in the same place. Buying
     * nothing at the price of breaking that is a bad trade, so the number stays wrong and named.
     */
    phaseSpread: 6.28,
    /*
     * `galaxy` está aqui porque ela JÁ balança, não porque se decidiu que deve: a pasta é
     * desenhada na posição do ponto (`planetAnchor` → `galaxy.set`), então ela herda o balanço do
     * corpo em que mora. Declarar o contrário seria o catálogo discordando da tela.
     */
    allowed: ['file', 'galaxy'],
    forbids: Object.freeze({
      moon: 'a lua orbita o PAI, não o núcleo — balanço em torno do plano do disco não é movimento dela',
    }),
    reduced: 'freeze',
  }),

  /**
   * Convective boiling of a stellar surface. Cells that appear, grow and dissolve in place.
   */
  boil: Object.freeze({
    id: 'boil',
    status: 'applied',
    law: 'noise field advanced in time; no net transport',
    /*
     * Advection rates, in noise-units per second, and their ORDER is the physics.
     *
     * Supergranulation is the big slow cell and granulation the small fast one that lives inside
     * it — a real photosphere has both, and getting the two rates the same way round is what makes
     * the surface read as convection instead of as a texture scrolling. There is no `period` here
     * because boiling is not periodic: the field never returns to a previous state.
     *
     * `spots` is three orders of magnitude below the rest ON PURPOSE — sunspots migrate too slowly
     * to notice in one look, and the term exists so that two visits days apart are not identical.
     */
    rates: Object.freeze({
      supergranulation: 0.014,
      granulation: 0.09,
      fine: 0.16,
      spots: 0.004,
    }),
    allowed: ['photosphere'],
    forbids: Object.freeze({
      planet: 'crosta não ferve — relevo que se mexe afirma um corpo que não é sólido',
    }),
    reduced: 'freeze',
  }),

  /**
   * A body turning on its own axis.
   */
  spin: Object.freeze({
    id: 'spin',
    status: 'applied',
    law: 'constant angular rate about the body axis, sign hashed from the path',
    /*
     * `rate = (hash − retrograde) · span`, and the asymmetry is deliberate.
     *
     * `span` is the WIDTH of the rate range, not a peak: with the hash uniform on [0,1) the rate
     * lands in [−0.056, +0.104] rad/s. So retrograde bodies exist but turn slower than prograde
     * ones, which is the Solar System's own shape — Venus and Uranus turn backwards, and Venus is
     * the slowest rotator of the eight. A symmetric split would have been the tidier number and
     * the less true one.
     */
    span: 0.16,
    retrograde: 0.35,
    /*
     * Clouds turn ~3× the crust. It is what separates a weather layer from a texture painted on
     * the planet: the two decouple visibly within a few seconds of looking, and nothing else in
     * the frame says the atmosphere is a different body of matter.
     */
    cloudFactor: 3,
    allowed: ['planet', 'comet'],
    forbids: Object.freeze({
      moon: 'todas as 19 luas arredondadas do Sistema Solar estão travadas por maré',
      envelope: 'gás em expansão não tem eixo para girar em volta',
    }),
    reduced: 'freeze',
  }),

  /**
   * The brightening of a body cited by a search. An EVENT: it happens and it passes.
   */
  pulse: Object.freeze({
    id: 'pulse',
    status: 'applied',
    law: 'amplitude decays from the moment of ignition',
    /*
     * THREE CONSTANTS THAT HAD TO BE WRITTEN TWICE, and that is why they are here.
     *
     * The point size is computed in the vertex shader and computed AGAIN in JS — `starRadius()`
     * inverts the shader's arithmetic so the ring can be placed against the star's real size on
     * screen. Both copies must include the oscillation, or the ring stops breathing with the body
     * it belongs to. The JS side even said so: "a MESMA expressão do shader, nenhum caminho
     * separado para manter em dia" — while `9.0`, `1.6` and `0.35` sat in both files as literals.
     *
     * The shader now reads these through interpolation, so the two copies are one value. What
     * cannot be centralised is the STRUCTURE of the expression; that still has to be mirrored by
     * hand, and it is why the mirror carries a comment pointing at its twin.
     */
    rate: 9,
    /** How much a fully lit node inflates before it starts oscillating at all. */
    inflate: 1.6,
    /** Oscillation depth around the inflated size. Scaled by `uPulse`, which reduced motion zeroes. */
    amplitude: 0.35,
    allowed: ['ignition'],
    forbids: Object.freeze({
      envelope: 'supernova aqui é ESTADO, não evento; piscar seria movimento sem nada por trás',
      galaxy: 'agregado não tem evento próprio, tem os dos filhos',
    }),
    /*
     * `keep`, and it is the only one. The pulse IS the information — it is how the scene says "this
     * memory is being used right now". Freezing it would delete the fact, not just its movement,
     * which is the line the point shader already draws: the frozen node stays bigger and warmer.
     */
    reduced: 'keep',
  }),

  /**
   * Expansion of a remnant. Bounded, and it ends.
   */
  expansion: Object.freeze({
    id: 'expansion',
    status: 'declared',
    law: 'radius grows and opacity falls over a fixed duration, then the body is itself again',
    allowed: ['event'],
    forbids: Object.freeze({
      state: 'estado durável não expande para sempre — expansão infinita é um estado fingindo ser evento',
    }),
    reduced: 'freeze',
  }),
});

/**
 * May this actor carry this motion?
 *
 * Mirrors `catalog.js:allows`, deliberately: same shape, same reading, and the refusal carries the
 * sentence. A renderer that asks and is told no gets the reason, and the reason is what stops the
 * rule from being re-litigated in the next module.
 *
 * @param {typeof MOTION[keyof typeof MOTION]} motion
 * @param {string} actor  'galaxy', 'planet', 'photosphere', 'moon', 'ring', 'file', 'ignition'…
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function mayMove(motion, actor) {
  if (motion.forbids?.[actor]) return { ok: false, reason: motion.forbids[actor] };
  if (motion.allowed.includes(actor)) return { ok: true };
  return { ok: false, reason: `${motion.id} não é declarado para ${actor}` };
}

/** Angular rate in rad/s for a periodic motion, from the readable `period`. */
export const rateOf = (motion) => (motion.period ? (Math.PI * 2) / motion.period : 0);

/**
 * Mean motion in rad/s: `n = sqrt(GM/a³)`, Kepler's third law with the constant left in.
 *
 * The one entry point for every orbit in the scene — the sky around the core and the moons around
 * their parent. They differ ONLY in `mu`, and that is the whole reason this is one function: a
 * moon whose `mu` came from somewhere else would be orbiting a different solar system than the
 * body it is attached to, and nothing on screen would say so.
 *
 * @param {number} semiMajorAxis  in world units.
 * @param {number} [mu]  `G·M` of what is being orbited. Defaults to the core's.
 */
export const meanMotion = (semiMajorAxis, mu = MOTION.keplerOrbit.gravitationalParameter) =>
  Math.sqrt(mu / semiMajorAxis ** 3);
