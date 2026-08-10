/**
 * ATTENTION — the one body the operator is looking at right now.
 *
 * ## Why a store, when `ui.links` already says it
 *
 * `ui.links` is a NOTIFICATION: it fires at the instant the cursor moves or the camera lock
 * changes, and whoever was not subscribed at that instant never learns of it. That is harmless for
 * the scene, which is mounted for the whole session. It is wrong for a widget: the host mounts and
 * destroys widgets on every route change (`kernel/widgets.js` applies the app's set as a diff), so
 * a panel that renders only from the event comes back EMPTY after a navigation while the star is
 * still locked — the interface forgetting something the system never stopped knowing.
 *
 * That was a real bug, reported from the screen: focus a star, move the camera, and the panels
 * stopped naming a body that was still in focus.
 *
 * So the event remains the notification and this module is the readable state — the same split
 * `state.js` and `session.js` already make. Nothing here computes: it observes the very emission
 * that paints the arcs, which is what keeps the panel and the drawing from ever disagreeing about
 * who is under attention.
 */
import { on } from './bus.js';

/**
 * The empty record, not `null`.
 *
 * A caller reading "nothing under attention" and a caller reading a subject take the same shape,
 * so no read site needs a guard — and a missing guard is how the previous version of this idea
 * would have thrown on the very first mount before any hover.
 */
const EMPTY = Object.freeze({
  subject: null,
  dirty: null,
  origin: null,
  links: Object.freeze([]),
  rede: null,
  conceitos: null,
});

let current = EMPTY;
const ouvintes = new Set();

/** What is under attention now. Never `null`. */
export const snapshot = () => current;

/**
 * Assina a mudança de atenção. Devolve o cancelamento.
 *
 * ☠️ **É por aqui que um painel escuta, nunca pelo `ui.links` cru** — e a diferença não é de estilo.
 * Quem pinta do PAYLOAD do evento e quem lê o STORE são duas fontes para o mesmo fato, e a ordem de
 * registro no barramento decide qual está adiantada. Um painel adiantado em relação ao store
 * mostraria um corpo e a tecla de marcar agiria sobre outro — sem erro, e por um quadro só.
 *
 * Aqui a ordem não pode discordar: `current` já está trocado quando os ouvintes correm.
 *
 * ⚠️ Quem assina numa montagem SOLTA na destruição: ouvinte de painel destruído pinta um DOM fora
 * da árvore, sem erro e sem sintoma.
 */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** Wired once at boot, next to `state.install()` and `session.install()`. */
export function install() {
  on('ui.links', ({ subject, dirty, origin, nodes, rede, conceitos }) => {
    current = subject
      ? Object.freeze({
          subject,
          dirty: dirty ?? null,
          origin: origin ?? null,
          links: Object.freeze([...(nodes || [])]),
          // A rede da cena UNIVERSO viaja junto pelo mesmo motivo que os vínculos: ela é parte do
          // que o painel afirma, e um remonte sem ela devolveria a lista de arcos sem o que foi
          // CORTADO — a legenda passaria a dizer "são estes" sobre um corpo truncado.
          rede: rede ?? null,
          conceitos: conceitos ?? null,
        })
      : EMPTY;
    // Depois de trocar `current`, nunca antes: é isso que impede um ouvinte de ler o estado velho.
    for (const fn of [...ouvintes]) fn(current);
  });
}
