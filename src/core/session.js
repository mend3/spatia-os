/**
 * Contexto da SESSÃO — o que o operador está fazendo, agora.
 *
 * Irmão do `state.js`, e a divisão entre os dois não é arbitrária:
 *
 * | Store | Derivado de | Responde |
 * |---|---|---|
 * | `state.js` | o stream de eventos do servidor | "o que o núcleo está fazendo" |
 * | `session.js` (aqui) | os gestos do operador e as aberturas de UI | "o que está aberto e o que acabou de acontecer" |
 *
 * Juntar os dois faria o estado da interface ser reescrito a cada token que chega do modelo, e
 * separá-los em três faria "o que está aberto" morar em lugar nenhum — que é o problema que
 * este arquivo existe para resolver: painel sabia de si, systray sabia de si, rota sabia de si,
 * e ninguém sabia do conjunto.
 *
 * ## Por que NÃO é um service worker
 *
 * A pergunta apareceu e a resposta é técnica, não de gosto: um service worker roda fora da
 * página, num contexto próprio, **sem DOM**. Ele não enxerga clique, foco, painel aberto nem
 * última interação — as cinco coisas que este módulo rastreia. Service worker serve para
 * interceptar rede, cachear e responder offline. Colocar estado de interface nele significaria
 * a página mandar mensagens para um processo que não pode observar nada por conta própria: toda
 * a instrumentação continuaria aqui, só que com um salto de `postMessage` no meio.
 *
 * ## A regra de escrita
 *
 * Ninguém escreve um campo direto: cada mudança entra por uma função nomeada, e toda transição
 * produz um objeto NOVO e congelado. É o mesmo contrato do `state.js` — estado mutável
 * compartilhado é exatamente como "o que está aberto" e "o que a tela mostra" divergem sem que
 * nada acuse.
 */
import { emit, on } from './bus.js';

const INITIAL = Object.freeze({
  /** Rota ativa (o app aberto), ou `''` na raiz. */
  route: '',
  /** Corpo orbital em foco, quando dentro de um app. */
  focusedBody: null,
  /** Painéis abertos, do mais antigo ao mais recente — a MESMA ordem LIFO do `hud/surface.js`. */
  panels: [],
  /** Item da systray com popover aberto, ou `null`. */
  tray: null,
  /** Último gesto do operador, qualquer que seja. */
  lastInteraction: null,
  /** Último clique, com o que foi clicado — para reconstruir o caminho até um estado. */
  lastClick: null,
});

let current = INITIAL;

export const snapshot = () => current;

function commit(patch) {
  const next = Object.freeze({ ...current, ...patch });
  // Só anuncia se algo mudou de verdade: um `emit` por quadro de mousemove afogaria qualquer
  // assinante, e o barramento é o mesmo que a cena usa.
  if (Object.keys(patch).every((key) => current[key] === next[key])) return;
  current = next;
  emit({ t: 'ui.session', session: next });
}

/** Painel abriu ou fechou. Chamado pelo `hud/surface.js`, que é quem conhece a pilha. */
export function panelChanged(names) {
  commit({ panels: Object.freeze([...names]) });
}

/** Popover da systray. `null` quando nenhum está aberto. */
export function trayChanged(name) {
  commit({ tray: name });
}

/**
 * Liga o rastreamento. Chamado uma vez no boot, depois do `state.install()`.
 *
 * Os gestos são escutados em `window` com `capture: true` pelo mesmo motivo do `keys.js`: um
 * handler que chame `stopPropagation` no meio do caminho não pode apagar o registro de que a
 * interação existiu. Rastrear é observar, e observador que pode ser silenciado não observa.
 */
export function install() {
  const mark = (kind, event) => {
    const patch = { lastInteraction: Object.freeze({ kind, at: Date.now() }) };
    if (kind === 'click') {
      patch.lastClick = Object.freeze({
        at: Date.now(),
        // O rótulo legível, não o elemento: guardar o nó manteria vivo um pedaço de DOM já
        // removido, e o que se quer saber depois é "o que foi clicado", não "qual nó era".
        label: describe(event.target),
      });
    }
    commit(patch);
  };

  for (const kind of ['pointerdown', 'keydown', 'wheel']) {
    window.addEventListener(kind, (event) => mark(kind === 'pointerdown' ? 'click' : kind, event), true);
  }

  on('ui.open-app', ({ id }) => commit({ route: id, focusedBody: id }));
  /*
   * A rota também muda pelo HASH — dock, atalho numérico, link colado, botão de voltar. Escutar
   * só o `ui.open-app` (que é o clique num corpo) deixava o contexto afirmando rota vazia
   * enquanto um app estava aberto na tela.
   */
  const readHash = () => commit({ route: (location.hash || '').replace(/^#\/?/, '') });
  window.addEventListener('hashchange', readHash);
  readHash();
  on('ui.state-changed', () => commit({}));
}

/** Um nome curto e estável para o que foi clicado. */
function describe(target) {
  if (!(target instanceof Element)) return 'canvas';
  const named = target.closest('[data-tray],[data-app],[data-widget],[data-slot]');
  if (named) {
    const set = named.dataset;
    return set.tray ? `tray:${set.tray}` : set.app ? `app:${set.app}` : set.widget ? `widget:${set.widget}` : `slot:${set.slot}`;
  }
  const text = (target.textContent || '').trim().slice(0, 24);
  return text || target.tagName.toLowerCase();
}
