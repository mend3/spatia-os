/**
 * Barramento de eventos — o único acoplamento entre as camadas.
 *
 * A cena 3D, a HUD e o áudio nunca se conhecem: cada uma assina o que sabe desenhar. O
 * efeito prático é que um evento novo do backend acende a estrela, escreve na timeline e
 * muda o drone sem que nenhum desses três arquivos precise saber dos outros.
 *
 * O protocolo é o `t` de cada evento, e está documentado em docs/EVENTS.md.
 */

const listeners = new Map();
const ANY = '*';

export function on(type, handler) {
  const key = type || ANY;
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(handler);
  return () => off(key, handler);
}

export function off(type, handler) {
  listeners.get(type || ANY)?.delete(handler);
}

export function emit(event) {
  if (!event?.t) return;
  dispatch(listeners.get(event.t), event);
  dispatch(listeners.get(ANY), event);
}

function dispatch(set, event) {
  if (!set) return;
  // Cópia antes de iterar: um handler que se desinscreve durante o próprio despacho
  // mutaria o Set em iteração (acontece no boot, quando a cena troca de estado).
  for (const handler of [...set]) {
    try {
      handler(event);
    } catch (error) {
      console.error(`[bus] handler de "${event.t}" falhou`, error);
    }
  }
}

/** Evento local, nascido na UI (clique, tecla) e não no backend. */
export function ui(type, payload = {}) {
  emit({ t: `ui.${type}`, ...payload });
}
