/**
 * TRACE — `console.debug` com portão e vazão limitada, para acompanhar a cena enquanto ela roda.
 *
 * A cena é contínua: quase todo defeito dela é sobre o que muda entre um quadro e outro, e isso
 * não aparece em screenshot nem em teste de um instante. "A galáxia não gira" levou uma rodada de
 * dedução até uma sonda mostrar o número; o traço existe para essa rodada não se repetir.
 *
 * ## Por que com portão
 *
 * O padrão do workspace proíbe `console.log` em produção, e com razão — 60 linhas por segundo por
 * módulo tornam o console inútil justo quando alguém precisa dele. Aqui o traço nasce DESLIGADO e
 * liga em dois lugares onde ele é a ferramenta, não ruído:
 *
 * - a **bancada** (`canvas.html`), que existe para observar um objeto por vez;
 * - qualquer página com `localStorage.setItem('espatial.trace', '1')`, para depurar a cena viva.
 *
 * ## Por que com vazão limitada
 *
 * Um traço por quadro é 60 linhas por segundo e o console vira um borrão — pior que não ter. Cada
 * canal sai no máximo uma vez por `MIN_MS`, e o registro diz quantos quadros ele representa: sem
 * isso, "1 linha por segundo" esconderia uma queda de 60fps para 3.
 */

const MIN_MS = 1000;

const ligado = (() => {
  try {
    if (location.pathname.endsWith('canvas.html')) return true;
    return localStorage.getItem('espatial.trace') === '1';
  } catch {
    // Modo privado: sem traço, e nada quebra por isso.
    return false;
  }
})();

const ultimo = new Map();
const quadros = new Map();

/**
 * Um registro por canal, no máximo um por segundo.
 *
 * @param {string} canal   'galaxy', 'solver', 'camera'… aparece como prefixo
 * @param {object|Function} dados  o objeto a registrar, ou uma função que o produz — a FUNÇÃO é o
 *   caminho barato: com o traço desligado ela nunca roda, então montar o objeto de diagnóstico não
 *   custa nada nos 99% dos quadros em que ninguém está olhando.
 */
export function trace(canal, dados) {
  quadros.set(canal, (quadros.get(canal) ?? 0) + 1);
  if (!ligado) return;
  const agora = performance.now();
  if (agora - (ultimo.get(canal) ?? -Infinity) < MIN_MS) return;
  ultimo.set(canal, agora);
  const n = quadros.get(canal);
  quadros.set(canal, 0);
  const carga = typeof dados === 'function' ? dados() : dados;
  console.debug(`[${canal}] ${n} quadros`, carga);
}

/** O traço está ligado? Para quem quiser evitar até a chamada. */
export const tracing = () => ligado;
