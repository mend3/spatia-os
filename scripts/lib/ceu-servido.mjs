/**
 * The served sky, or a legible refusal. Shared by every guard and census that measures the corpus.
 *
 * ☠️ **A guard that CRASHES on an empty corpus is indistinguishable from a guard that found a
 * defect.** Measured with the index cleared: five scripts died with `TypeError: graph.nodes is not
 * iterable` and a stack trace, while three refused by name. A fresh clone that runs `make leis`
 * before indexing sees the stack traces and concludes the code is broken — the gate accusing the
 * operator of a bug that is really an empty database.
 *
 * ⚠️ **Refusing NEVER exits 0, and that is deliberate.** "I could not verify" is not "the law
 * holds": a guard that exits 0 without measuring anything is the green test this base spends its
 * time removing.
 *
 * ⭑ **It exits 2, not 1, and the distinction is the point.** `1` means a law was checked and
 * BROKE — a defect in the code. `2` means the law could not be checked at all, and the usual
 * cause is banal: nobody has indexed yet. `leis.mjs` puts the two in different buckets, so a
 * fresh clone reads "8 could not measure — no corpus" instead of "8 LAWS BROKE".
 *
 * ⭑ **It lives in `scripts/lib/` on purpose.** `leis.mjs` scans `scripts/` non-recursively and
 * filters by extension, so a helper sitting next to the guards would be run AS a guard — passing
 * green while proving nothing.
 */

/** Exit code for "could not measure" — `leis.mjs` keeps it in a bucket apart from "law broke". */
export const SEM_MEDIDA = 2;

/**
 * Fetches `/api/graph` and refuses, by name, when the sky cannot sustain a claim.
 *
 * @param {string} base  the SpatIA address, e.g. `http://127.0.0.1:8787`
 * @param {{ porque?: string }} [opcoes]  `porque` names what this caller would have measured
 * @returns {Promise<object>} the topology, guaranteed to carry `corpus.collection` and `nodes`
 */
export async function ceuServido(base, { porque = 'os corpos abaixo' } = {}) {
  const graph = await fetch(`${base}/api/graph`)
    .then((r) => r.json())
    .catch(() => null);

  if (!graph) {
    console.error(`sem resposta de ${base}/api/graph — suba o \`make serve\` primeiro.`);
    process.exit(SEM_MEDIDA);
  }

  // ⚠️ O ERRO DO SERVIDOR É REPASSADO, nunca engolido: com a coleção ausente ele diz exatamente
  // isso, e trocar a frase dele por uma nossa esconde a única pista de qual corpus faltou.
  if (graph.error) {
    console.error(
      `${base}/api/graph não entregou topologia: ${graph.error}\n` +
        `  sem ela, ${porque} não sustentam afirmação nenhuma.\n` +
        '  se a indexação ainda não correu, é isso — indexe em #/storage e rode de novo.'
    );
    process.exit(SEM_MEDIDA);
  }

  if (!graph.corpus?.collection) {
    console.error(
      `${base}/api/graph respondeu sem \`corpus\` — sem saber de que céu vieram, ${porque}\n` +
        '  não sustentam afirmação nenhuma. Carimbo ausente não é carimbo neutro.'
    );
    process.exit(SEM_MEDIDA);
  }

  // ☠️ `nodes` ausente é o que produzia `graph.nodes is not iterable` cinco vezes. Um céu SEM
  // corpos é fato legítimo (corpus vazio); um céu sem a CHAVE é resposta que não é topologia.
  if (!Array.isArray(graph.nodes)) {
    console.error(
      `${base}/api/graph respondeu sem \`nodes\` — isto não é uma topologia.\n` +
        `  ${porque} não têm de onde sair.`
    );
    process.exit(SEM_MEDIDA);
  }

  return graph;
}
