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
 * Hoje só `patternSpin` é `applied`. Os `own` são movimento real na tela — trazê-los para cá é
 * mudança mecânica e sem risco, mas não foi feita, e escrever `applied` neles seria a mesma
 * mentira que este arquivo existe para impedir.
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
    status: 'own',
    law: 'omega proportional to r^-1.5, with r the orbital radius',
    allowed: ['file', 'ring', 'moon'],
    forbids: Object.freeze({
      arm: 'braço com órbita kepleriana É o problema do enrolamento — foi assim que o campo de arestas morreu',
    }),
    reduced: 'keep',
  }),

  /**
   * Convective boiling of a stellar surface. Cells that appear, grow and dissolve in place.
   */
  boil: Object.freeze({
    id: 'boil',
    status: 'own',
    law: 'noise field advanced in time; no net transport',
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
    status: 'own',
    law: 'constant angular rate about the body axis, sign hashed from the path',
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
    status: 'own',
    law: 'amplitude decays from the moment of ignition',
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
