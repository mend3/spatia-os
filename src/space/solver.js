/**
 * STAGE 5 — the compatibility solver.
 *
 * Every body arrives here with a list of things it COULD carry, and leaves with the list of what
 * it actually gets, plus the list of what was refused and why. See `docs/modelo-de-renderizacao.md`
 * for the six stages this is the fifth of.
 *
 * ## Why this is a stage and not a property
 *
 * Today mutual exclusion comes for free from class uniqueness: `catalog.js` resolves a body to
 * exactly one class, and the class declares `forbids`. That works only while classes carry
 * everything. The moment a durable fact like "high churn" stops being a class and becomes a
 * modifier — which is where the model is going, because as a class it strips the body of every
 * surface it could have had — the guarantee evaporates and the risk multiplies: ring, accretion
 * disc and corona are three concentric things around one core and nothing would stop a body from
 * getting all three. That is the exact stacking that made `catalog.js` exist.
 *
 * So the rule moves from "each class knows what it refuses" to "everything passes through one
 * place that decides". A rule that lives in the objects disappears with the objects.
 *
 * ## The three things it inherits from the catalog, deliberately
 *
 * **The reason, as a sentence.** `forbids` never stored a boolean — it stores *"anel e envoltório
 * à volta do mesmo núcleo é o empilhamento que criou o catálogo"*. Executable documentation: the
 * reader learns why, not only that.
 *
 * **The priority, with its justification.** The resolution is not arbitrary. A dirty file beats a
 * hot one because the open edit *"é acionável agora e some sozinho no commit, enquanto o churn
 * continua lá amanhã"*.
 *
 * **Observability.** A refusal that leaves no trace is indistinguishable from an absent fact:
 * "why does this dirty file have no ring?" would have no answer on screen or in the console. The
 * probe already writes even the negative case, because *"diagnóstico que só existe no caminho
 * feliz não é diagnóstico"*. Every rejection here travels with the sentence that caused it.
 */
import { classify, allows, SUPERNOVA_FLOOR } from './catalog.js';

/**
 * STATE MODIFIERS — stage 4's candidates, resolved here.
 *
 * `envelope` is the first one to arrive by this road rather than by being a class, and it brings
 * the conflict that created the catalog: a body cannot wear a ring AND a shell. Until now that
 * rule was declared and never enforced — the ring comes from `classify`, the shell comes straight
 * from the `aSupernova` attribute without consulting any class, so a file that is both dirty and
 * hot drew both at once. Exactly the stacking `catalog.js` opens by describing.
 */
export const MODIFIER = Object.freeze({ ENVELOPE: 'envelope' });

/**
 * The near-view skins. Exactly one per body, and that is structural rather than a rule to enforce:
 * they all occupy the same place — the surface of the same sphere.
 */
export const SURFACE = Object.freeze({
  NONE: 'none',
  PHOTOSPHERE: 'photosphere',
  PLANET: 'planet',
  GALAXY: 'galaxy',
});

/**
 * What this body renders when the camera arrives, and what it does not.
 *
 * The order below IS the priority, and each branch states the fact that wins:
 *
 * 1. **aggregate → galaxy.** A directory has no body of its own; it is the container. `catalog.js`
 *    puts it plainly — *"agregado não tem corpo; dar crosta a um diretório afirmaria um objeto que
 *    não há"*. So the aggregate skips the whole solid/gaseous question.
 * 2. **solid → planet.** The class allows `surface`, so crust, sea and atmosphere are legal.
 * 3. **gaseous → photosphere.** The class declares one. A star has no crust; it has opaque gas.
 * 4. **nothing** — and this is the branch that has to be loud, because it is where 27 bodies of
 *    this corpus currently live: `supernova` declares no photosphere AND forbids surface, so the
 *    camera arrives at a sprite. The rejection list is what makes that legible instead of
 *    mysterious.
 *
 * @param {object} node   topology node
 * @param {{dirty?: string|null}} [facts]
 * @returns {{klass: object, surface: string, rejected: ReadonlyArray<{feature: string, reason: string}>}}
 */
export function resolveBody(node, facts = {}) {
  const klass = classify(node, facts);
  const rejected = [];
  const modifiers = [];
  const refuse = (feature, reason) => rejected.push(Object.freeze({ feature, reason }));

  /*
   * The shell is a candidate, not a fact of the body. It loses to the ring, and the sentence is
   * the catalog's own — the priority behind it is written there too: the open edit is actionable
   * now and clears itself on commit, while the churn is still there tomorrow.
   */
  if (node?.type === 'file' && (node.supernova || 0) > SUPERNOVA_FLOOR) {
    const ringed = klass.forbids?.envelope;
    if (ringed) refuse(MODIFIER.ENVELOPE, ringed);
    else modifiers.push(MODIFIER.ENVELOPE);
  }

  const done = (surface) =>
    Object.freeze({
      klass,
      surface,
      modifiers: Object.freeze(modifiers),
      rejected: Object.freeze(rejected),
    });

  if (node?.type && node.type !== 'file') {
    /*
     * ⚠️ O solver DECIDE galáxia e a cena ainda não a desenha — `space/galaxy.js` existe e só
     * roda na bancada. A sonda separa `tipo` (o que foi decidido) de `desenhado` (o que a tela
     * fez) justamente para que essa diferença apareça como pendência, e não como uma sonda
     * afirmando uma imagem que não está lá.
     */
    return done(SURFACE.GALAXY);
  }

  if (allows(klass, 'surface')) {
    return done(SURFACE.PLANET);
  }
  refuse('surface', klass.forbids?.surface ?? `a classe ${klass.id} não permite superfície`);

  if (klass.features?.photosphere) {
    return done(SURFACE.PHOTOSPHERE);
  }
  refuse(
    'photosphere',
    `a classe ${klass.id} não declara fotosfera — o corpo fica sem nada ao aproximar`
  );

  return done(SURFACE.NONE);
}
