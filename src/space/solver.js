/**
 * STAGE 5 — the compatibility solver.
 *
 * Every body arrives here with a list of things it COULD carry, and leaves with the list of what
 * it actually gets, plus the list of what was refused and why. See `docs/modelo-de-renderizacao.md`
 * for the six stages this is the fifth of.
 *
 * ## O que ele resolve, e o que ele DEIXOU de resolver
 *
 * Ele resolve os MODIFICADORES — anel, disco de detritos e envoltório. São três objetos que a
 * ontologia não produz, e o conflito entre eles é a razão de este estágio existir.
 *
 * ☠️ **Ele decidia também a PELE, e essa decisão não tinha leitor nenhum em `src/`.** A pele saía
 * daqui pelo `kind` — a taxonomia que a Fase B refutou, aquela em que um `config` de 2 chunks
 * desenha ESTRELA ao lado de um `doc` de 200 desenhado como PLANETA. Convergidas as duas cenas
 * (T-39), quem decide pele é `superficies.js` via `sistemas.identidadeDe`, nas duas. O ramo antigo
 * continuou aqui **calculando em silêncio**, e o preço dele era medido: religá-lo trocava a pele
 * de **32 dos 72 corpos** do fixture (09/08).
 *
 * ⚠️ **Código que calcula e ninguém lê não é neutro** — ele é a próxima fonte da verdade a ser
 * lida por engano, e um `resolveBody(node).surface` que ainda respondesse é um convite escrito.
 * Hoje ele não responde: a chave não existe, e `lei-cena.mjs` §5 falha se ela voltar.
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
import { classify, SUPERNOVA_FLOOR, morphologyOf, orbitingOf } from './catalog.js';

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
 * Que material ORBITAL este corpo carrega, e o que ele recusou.
 *
 * ⚠️ **O vocabulário de PELE não mora mais aqui** — ele é `SUPERFICIE`, em `superficies.js`, e é
 * um só no `src/` inteiro. Este estágio responde por anel, disco de detritos e envoltório.
 *
 * @param {object} node   topology node
 * @param {{dirty?: string|null}} [facts]
 * @returns {{modifiers: ReadonlyArray<string>, rejected: ReadonlyArray<{feature: string, reason: string}>}}
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

  /*
   * ☠️ **AQUI SAÍAM QUATRO RAMOS DE PELE, e o primeiro deles é a armadilha que dá nome à REGRA DO
   * CATÁLOGO.** O teste do agregado era `type !== 'file'`, que varria a LUA junto: uma lua em foco
   * resolvia como GALÁXIA, o corpo do continente. Classificar por EXCLUSÃO faz a próxima categoria
   * de nó nascer dentro do ramo errado, em silêncio.
   *
   * ⭑ **A classificação por exclusão continua proibida, e quem a impede hoje é `TIPOS_DE_NO`**
   * (`entity-physics.js`): contêiner → ESTRUTURA, folha → CORPO, e tipo desconhecido cai em
   * ESTRUTURA **dizendo que não foi reconhecido**. Estrutura não tem pele, então `superficieDe`
   * devolve `NENHUMA` para o agregado — e a galáxia da cena AGENTE nunca precisou deste ramo: ela
   * é um campo INSTANCIADO sobre os hubs (`scene.js` filtra `type === 'dir' || 'repo'` e chama
   * `galaxyParams`). `SURFACE.GALAXY` tinha produtor e **zero leitores**.
   *
   * As recusas de `surface`/`photosphere` saíram junto: quem sabe que não há pele é quem a decide,
   * e `decisaoOntologica` (`scene.js`) já escreve a própria, com a frase da CLASSE que a negou.
   * Duas vozes sobre a mesma ausência é como a lista de recusas deixaria de ser confiável.
   */
  return Object.freeze({
    modifiers: Object.freeze(modifiers),
    rejected: Object.freeze(rejected),
  });
}
