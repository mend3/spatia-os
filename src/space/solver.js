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
import { classify, allows, SUPERNOVA_FLOOR, morphologyOf, orbitingOf } from './catalog.js';

/**
 * STATE MODIFIERS — stage 4's candidates, resolved here.
 *
 * `envelope` is the first one to arrive by this road rather than by being a class, and it brings
 * the conflict that created the catalog: a body cannot wear a ring AND a shell. Until now that
 * rule was declared and never enforced — the ring comes from `classify`, the shell comes straight
 * from the `aSupernova` attribute without consulting any class, so a file that is both dirty and
 * hot drew both at once. Exactly the stacking `catalog.js` opens by describing.
 */
export const MODIFIER = Object.freeze({ ENVELOPE: 'envelope', RING: 'ring', DEBRIS: 'debris' });

/**
 * The near-view skins. Exactly one per body, and that is structural rather than a rule to enforce:
 * they all occupy the same place — the surface of the same sphere.
 */
export const SURFACE = Object.freeze({
  NONE: 'none',
  PHOTOSPHERE: 'photosphere',
  PLANET: 'planet',
  GALAXY: 'galaxy',
  COMET: 'comet',
  STATION: 'station',
  PULSAR: 'pulsar',
  NEBULA: 'nebula',
});

/**
 * De MORFOLOGIA declarada para a pele que a cena desenha.
 *
 * O `modelo-de-renderizacao.md` separa o estágio 2 (morfologia, vem do `kind`, nunca muda) do
 * estágio 4 (estado, vem dos fatos, muda a qualquer momento). Até aqui só o estágio 4 chegava ao
 * desenho: `kind` governava a COR e mais nada, e por isso quase todo o céu caía na classe padrão
 * ESTRELA e desenhava a MESMA fotosfera — o defeito que o usuário reportou como "muitas estrelas
 * com as mesmas formas". Esta tabela é o estágio 2 virando imagem.
 */
const SURFACE_BY_MORPHOLOGY = Object.freeze({
  fotosfera: SURFACE.PHOTOSPHERE,
  planeta: SURFACE.PLANET,
  cometa: SURFACE.COMET,
  estação: SURFACE.STATION,
  pulsar: SURFACE.PULSAR,
  nebulosa: SURFACE.NEBULA,
  estrela: SURFACE.PHOTOSPHERE,
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
   * O ANEL — e ele é MODIFICADOR, não classe. Ver o bloco que o tirou de `CELESTIAL`.
   *
   * A ordem aqui importa e é a do catálogo: o anel é resolvido ANTES do envoltório porque, quando
   * os dois cabem no mesmo corpo, quem ganha é o sinal PERECÍVEL. A edição em aberto é acionável
   * agora e some sozinha no commit; o churn continua lá amanhã.
   *
   * ⚠️ E ele agora PERGUNTA se o corpo aceita, em dois níveis — o que era impossível enquanto ele
   * substituía o corpo por um planeta:
   *   1. a CLASSE pode proibir (`cometa-extinto`: cauda e anel juntos não descrevem nada);
   *   2. o CORPO decide QUAL objeto ele hospeda (`orbitingOf`).
   * As duas recusas viajam com a frase que as causou, senão "por que este arquivo sujo não tem
   * anel?" não teria resposta em lugar nenhum.
   *
   * ⚠️ E o corpo pode hospedar OUTRA COISA em vez de recusar. A estrela não ganha um anel — ela
   * ganha um DISCO DE DETRITOS, que é o objeto certo para ela e é a frase que abre o catálogo.
   * São dois modificadores distintos porque são dois objetos distintos: cavidade dominante e
   * cinturão estreito de um lado, faixas coladas no corpo do outro.
   */
  /*
   * ⚠️ O CORPO QUE VAI SER DESENHADO, não o da morfologia — e a diferença é real desde que a
   * classe passou a poder declarar `features.body`.
   *
   * Pegando só a morfologia, um arquivo `doc` com ritmo regular e sujo perguntava "planeta aceita
   * anel?" (sim) enquanto a tela desenhava um PULSAR, que não aceita. A pergunta tem de ser feita
   * sobre o corpo que o olho vai ver, senão a recusa protege o objeto errado.
   */
  const corpo =
    node?.type === 'file' ? klass.features?.body ?? morphologyOf(node?.kind).body : null;
  let temAnel = false;
  // Só ARQUIVO usa anel. Agregado não tem corpo — é o continente, e a mesma frase que o catálogo
  // usa para negar crosta a um diretório nega material orbital a ele. Na prática o `graph.js` nem
  // indexa hub na tabela de sujos, mas o solver é chamado de mais lugares que aquele laço.
  if (facts.dirty && node?.type === 'file') {
    const proibidoPelaClasse = klass.forbids?.ring;
    const emOrbita = corpo ? orbitingOf(corpo) : 'anel';
    if (proibidoPelaClasse) refuse(MODIFIER.RING, proibidoPelaClasse);
    else if (typeof emOrbita !== 'string') refuse(MODIFIER.RING, emOrbita.reason);
    else {
      modifiers.push(emOrbita === 'disco-de-detritos' ? MODIFIER.DEBRIS : MODIFIER.RING);
      temAnel = true;
    }
  }

  /*
   * The shell is a candidate, not a fact of the body. Ele perde para o ANEL, e a frase é a do
   * catálogo: anel e envoltório à volta do mesmo núcleo é o empilhamento que criou o catálogo.
   */
  if (node?.type === 'file' && (node.supernova || 0) > SUPERNOVA_FLOOR) {
    if (temAnel) {
      refuse(MODIFIER.ENVELOPE, 'anel e envoltório à volta do mesmo núcleo é o empilhamento que criou o catálogo');
    } else {
      const proibido = klass.forbids?.envelope;
      if (proibido) refuse(MODIFIER.ENVELOPE, proibido);
      else modifiers.push(MODIFIER.ENVELOPE);
    }
  }

  const done = (surface) =>
    Object.freeze({
      klass,
      surface,
      modifiers: Object.freeze(modifiers),
      rejected: Object.freeze(rejected),
    });

  /*
   * ⚠️ AGREGADO é repo ou diretório — e este teste era `type !== 'file'`, que varre a LUA junto.
   *
   * O `moon` não existia quando esta linha foi escrita, e ela o classificou por exclusão: uma lua
   * em foco resolvia como GALÁXIA, que é o corpo do continente. Encontrado auditando o `kind`, não
   * pela tela — a lua raramente é clicada, e quando for o defeito aparece inteiro.
   *
   * Nomear os dois tipos em vez de excluir um: a próxima categoria de nó nasce fora deste ramo por
   * padrão, que é o comportamento certo. Por exclusão, ela nasceria dentro dele em silêncio.
   */
  if (node?.type === 'repo' || node?.type === 'dir') {
    /*
     * ⚠️ O solver DECIDE galáxia e a cena ainda não a desenha — `space/galaxy.js` existe e só
     * roda na bancada. A sonda separa `tipo` (o que foi decidido) de `desenhado` (o que a tela
     * fez) justamente para que essa diferença apareça como pendência, e não como uma sonda
     * afirmando uma imagem que não está lá.
     */
    return done(SURFACE.GALAXY);
  }

  /*
   * A CLASSE MANDA QUANDO O ESTADO PRODUZ UM CORPO PRÓPRIO — e até aqui isso era só uma frase.
   *
   * `catalog.js` já dizia que "a classe ainda manda quando o estado produz um corpo próprio", mas
   * não havia caminho: os dois ramos abaixo perguntam à MORFOLOGIA, que sai de `kind`, que é
   * composição. Serve para os cinco corpos que são composição mesmo (fotosfera, planeta, cometa,
   * estação, nebulosa) e não serve para o PULSAR, cuja definição é temporal: um scheduler pode
   * ser `.sh`, `.yaml` ou `.ts`, e o que o torna pulsar é o RITMO, não a extensão.
   *
   * Por isso a classe pode declarar `features.body`, e ele vence a morfologia. Genérico de
   * propósito: a próxima classe definida por COMPORTAMENTO nasce com caminho até o desenho em vez
   * de precisar de um ramo com o id dela escrito dentro.
   */
  const corpoDaClasse = klass.features?.body;
  if (corpoDaClasse) {
    const pele = SURFACE_BY_MORPHOLOGY[corpoDaClasse];
    if (pele) return done(pele);
  }

  if (allows(klass, 'surface')) {
    return done(SURFACE.PLANET);
  }
  refuse('surface', klass.forbids?.surface ?? `a classe ${klass.id} não permite superfície`);

  if (klass.features?.photosphere) {
    /*
     * A CLASSE diz que há corpo gasoso; a MORFOLOGIA diz qual corpo é.
     *
     * Antes esta linha devolvia fotosfera para todo mundo, e como a classe padrão do céu é
     * ESTRELA isso significava ~400 dos 410 arquivos desenhando exatamente a mesma superfície.
     * A morfologia já estava declarada no `catalog.js` desde o histograma do corpus — só não
     * tinha caminho até o desenho. `estrela` continua sendo o padrão da tabela, então tipo
     * desconhecido não perde corpo.
     */
    const morfologia = morphologyOf(node?.kind);
    return done(SURFACE_BY_MORPHOLOGY[morfologia.body] ?? SURFACE.PHOTOSPHERE);
  }
  refuse(
    'photosphere',
    `a classe ${klass.id} não declara fotosfera — o corpo fica sem nada ao aproximar`
  );

  return done(SURFACE.NONE);
}
