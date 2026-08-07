/**
 * Router: navegação como movimento de câmera.
 *
 * A rota é endereçável (`#/files`) de propósito. Não é enfeite de web: é o que faz o botão
 * voltar do browser funcionar, um link levar direto a um app, e um recarregamento cair de novo
 * onde o operador estava. Um "OS" onde F5 te joga na tela inicial não é um ambiente, é uma demo.
 *
 * Duas transições acontecem juntas e propositalmente **desalinhadas**:
 *
 *   câmera  ├────────── voo (≈900ms) ──────────┤
 *   widgets ├─ sai ─┤          ├─ entra ─┤
 *
 * O grid antigo sai no começo do voo, o novo entra perto do fim. Trocar no mesmo instante
 * faria o texto pular junto com a câmera, e o olho leria como corte. Escalonado, lê como
 * chegada.
 *
 * `ROUTE_ROOT` é o sistema — a vista sem app, com o núcleo centrado.
 */
import * as bus from '../core/bus.js';
import * as api from '../core/api.js';
import { ROUTE_ROOT, getApp, hasApp, listApps, appClaiming } from './registry.js';
import { bind } from '../core/keys.js';
import * as motion from '../core/motion.js';

export { ROUTE_ROOT };
const FLIGHT_MS = 900;
// Widgets entram com o voo já quase concluído; é o atraso que separa "chegar" de "cortar".
const WIDGETS_IN_MS = 520;

/*
 * Com movimento reduzido, "cortar" é o comportamento CORRETO e não uma degradação: sem voo de
 * câmera não há chegada para escalonar, e um atraso de 520ms sem movimento nenhum na tela seria
 * só a interface travada. Os dois instantes colapsam em zero.
 */
const flightMs = () => (motion.isReduced() ? 0 : FLIGHT_MS);
const widgetsInMs = () => (motion.isReduced() ? 0 : WIDGETS_IN_MS);

// A slash in the arg is structure (it is a path) and has to survive; everything else is escaped,
// or a name with a space comes back out of the hash different from how it went in.
const encodeArg = (arg) => arg.split('/').map(encodeURIComponent).join('/');

// A malformed escape (`%zz`) throws instead of decoding, and it can only come from an address bar
// edited by hand. Routing to the literal text loses less than dropping the navigation.
const decodeArg = (arg) =>
  arg
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join('/');

export function createRouter({ host, scene, chrome }) {
  let current = null;
  let currentArg = '';
  let flying = null;

  /**
   * The address carries the app AND what the app is showing: `#/files/docs/EVENTS.md`.
   *
   * Everything after the first slash belongs to the app; the kernel hands it over in the ctx and
   * never reads it.
   */
  function parse() {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    const cut = hash.indexOf('/');
    const id = cut === -1 ? hash : hash.slice(0, cut);
    if (!hasApp(id)) return { app: ROUTE_ROOT, arg: '' };
    return { app: id, arg: cut === -1 ? '' : decodeArg(hash.slice(cut + 1)) };
  }

  /*
   * `api` and `bus` travel in the ctx instead of being imported by the widget: a widget that
   * reaches into this module graph on its own is welded to this tree and cannot ship as a
   * package (§2.3 de OS-SCREENS).
   */
  function ctxFor(id, arg) {
    return { app: id === ROUTE_ROOT ? null : getApp(id), route: id, arg, navigate, api, bus };
  }

  async function activate({ app: id, arg = '' }) {
    if (id === current) {
      if (arg === currentArg) return;
      /*
       * Same app, new sub-route: no flight, no remount. The arg addresses state INSIDE a mounted
       * widget, so rebuilding would destroy what the address exists to bring back. Whoever cares
       * reads it off `ui.route`.
       */
      currentArg = arg;
      bus.emit({ t: 'ui.route', route: id, app: id === ROUTE_ROOT ? null : id, arg });
      return;
    }
    const previous = current;
    const previousArg = currentArg;
    const app = id === ROUTE_ROOT ? null : getApp(id);

    // Cancela um voo em andamento: navegar duas vezes rápido não pode montar dois grids.
    if (flying) clearTimeout(flying);

    document.body.dataset.route = id;
    chrome?.setActive(id);

    if (previous && previous !== ROUTE_ROOT) {
      try {
        getApp(previous)?.onLeave?.(ctxFor(previous, previousArg));
      } catch (error) {
        console.error(`[router] onLeave de ${previous} falhou`, error);
      }
    }

    // O espaço reage primeiro. É ele que comunica "estamos indo para outro lugar".
    scene?.focusBody(app ? app.id : null);
    document.body.classList.add('in-flight');

    current = id;
    currentArg = arg;
    bus.emit({ t: 'ui.route', route: id, app: app?.id ?? null, arg });

    flying = setTimeout(() => {
      host.apply(app ? app.widgets : rootWidgets(), ctxFor(id, arg));
      try {
        app?.onEnter?.(ctxFor(id, arg));
      } catch (error) {
        console.error(`[router] onEnter de ${id} falhou`, error);
      }
      setTimeout(() => document.body.classList.remove('in-flight'), flightMs() - widgetsInMs());
    }, widgetsInMs());
  }

  /** Widgets da vista de sistema. Declarado aqui porque o sistema não é um app do registro. */
  let rootWidgets = () => [];

  // The root takes no arg: it is the view without an app, so there is no app state to address.
  function navigate(id, arg = '') {
    const target = id && hasApp(id) ? id : ROUTE_ROOT;
    // Escreve no hash e deixa o `hashchange` ativar: um caminho só para entrar num app, seja
    // por clique, por tecla, por link ou pelo botão voltar.
    const suffix = target === ROUTE_ROOT || !arg ? '' : `/${encodeArg(arg)}`;
    const next = target === ROUTE_ROOT ? '#/' : `#/${target}${suffix}`;
    // Re-reads through `parse` instead of rebuilding the pair: one decoder, so what the address
    // means never depends on which door the navigation came through.
    if (window.location.hash === next) activate(parse());
    else window.location.hash = next;
  }

  window.addEventListener('hashchange', () => activate(parse()));

  // Dígito entra no app da posição; Home volta ao sistema. A supressão durante digitação é do
  // `keys`, não daqui — era `1` na busca de arquivos navegando em vez de escrever.
  bind({ pattern: /^[1-9]$/, keys: '1–4', label: 'IR AO APP', group: 'NAVEGAÇÃO' }, (event) => {
    const app = listApps()[Number(event.key) - 1];
    if (app) navigate(app.id);
  });
  bind({ key: 'Home', label: 'RAIZ', group: 'NAVEGAÇÃO' }, () => navigate(ROUTE_ROOT));

  /**
   * Clicar num corpo do céu leva ao app que reivindica aquele gesto, no nó clicado.
   *
   * The destination is not named here on purpose: a route written into the kernel is one app's
   * policy inside the mechanism that dispatches for every app. The manifest declares
   * `claims: ['ui.select:file']` and the router only resolves it.
   *
   * The node's `source` rides along as the sub-route; an app that claims the gesture and ignores
   * the arg lands on its own root.
   */
  bus.on('ui.select', ({ node }) => {
    if (!node?.type) return;
    const target = appClaiming(`ui.select:${node.type}`);
    if (target && target !== current) navigate(target, node.source);
  });

  return {
    navigate,
    route: () => current,
    /** Chamado uma vez no boot, depois do registro de tudo. */
    start(systemWidgets) {
      rootWidgets = () => systemWidgets;
      activate(parse());
    },
  };
}
