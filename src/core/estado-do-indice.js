/**
 * Turns "the topology failed" into something the operator can ACT on.
 *
 * ☠️ **An empty panel that reports an upstream error teaches nothing.** With the index absent every
 * corpus-dependent surface said `indisponível: qdrant: Not found: Collection ... (404)` — a
 * sentence about a database the operator never named, in a panel that should be saying what to do
 * next. And the most common cause is not a defect at all: nobody has indexed yet, or the indexing
 * is running RIGHT NOW and the alias only moves at the end.
 *
 * ⚠️ **The upstream reason is not thrown away** — it is demoted. It stays after the instruction,
 * where whoever can read it still finds it, instead of occupying the line alone.
 *
 * ⭑ **The indexing probe is cached.** Every panel asks on every redraw; without the cache a single
 * screen would fire one request per widget per frame at a route that walks server state.
 */
import * as api from './api.js';

/** How long a progress reading stays fresh. Short: it is progress, and it moves. */
const VALIDADE_MS = 2000;

let cache = { em: 0, valor: null };
let voando = null;

/**
 * The indexing run in progress, or `null`. Never throws — a failing probe means "I do not know",
 * and "I do not know" must not turn into "it is not running".
 */
export async function indexacaoEmCurso() {
  const agora = Date.now();
  if (agora - cache.em < VALIDADE_MS) return cache.valor;
  // Uma requisição por vez: dez painéis redesenhando juntos são dez chamadas para a mesma verdade.
  voando ??= api
    .indexacao()
    .then((p) => (p?.estado === 'correndo' ? p : null))
    .catch(() => null)
    .then((valor) => {
      cache = { em: Date.now(), valor };
      voando = null;
      return valor;
    });
  return voando;
}

/** `true` quando a falha é a coleção ausente — o caso que se resolve indexando, não depurando. */
export function eIndiceAusente(erro) {
  return /doesn't exist|does not exist|not found: collection|sem índice/i.test(String(erro || ''));
}

/**
 * The sentence a corpus-dependent panel should show when it has nothing.
 *
 * @param {string|null} erro  what the fetch reported, if anything
 * @returns {Promise<string>} instruction first, upstream reason second
 */
export async function explicarVazio(erro) {
  if (!erro) return 'lendo…';

  const correndo = await indexacaoEmCurso();
  if (correndo) {
    const { feitos = 0, total = 0 } = correndo;
    const pc = total ? ` (${Math.round((100 * feitos) / total)}%)` : '';
    // Com a corrida em curso o motivo do upstream é RUÍDO: ele descreve a ausência que a própria
    // corrida está resolvendo.
    return `INDEXANDO · ${feitos}/${total || '?'}${pc} — o céu aparece quando ela terminar`;
  }

  if (eIndiceAusente(erro)) return `SEM ÍNDICE · indexe em #/storage — ${erro}`;
  return `indisponível: ${erro}`;
}
