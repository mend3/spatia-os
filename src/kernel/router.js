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
import { emit, on } from '../core/bus.js';
import { ROUTE_ROOT, getApp, hasApp, listApps } from './registry.js';
import { bind } from '../core/keys.js';

export { ROUTE_ROOT };
const FLIGHT_MS = 900;
// Widgets entram com o voo já quase concluído; é o atraso que separa "chegar" de "cortar".
const WIDGETS_IN_MS = 520;

export function createRouter({ host, scene, chrome }) {
  let current = null;
  let flying = null;

  function parse() {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    return hash && hasApp(hash) ? hash : ROUTE_ROOT;
  }

  function ctxFor(id) {
    return { app: id === ROUTE_ROOT ? null : getApp(id), route: id, navigate };
  }

  async function activate(id) {
    if (id === current) return;
    const previous = current;
    const app = id === ROUTE_ROOT ? null : getApp(id);

    // Cancela um voo em andamento: navegar duas vezes rápido não pode montar dois grids.
    if (flying) clearTimeout(flying);

    document.body.dataset.route = id;
    chrome?.setActive(id);

    if (previous && previous !== ROUTE_ROOT) {
      try {
        getApp(previous)?.onLeave?.(ctxFor(previous));
      } catch (error) {
        console.error(`[router] onLeave de ${previous} falhou`, error);
      }
    }

    // O espaço reage primeiro. É ele que comunica "estamos indo para outro lugar".
    scene?.focusBody(app ? app.id : null);
    document.body.classList.add('in-flight');

    current = id;
    emit({ t: 'ui.route', route: id, app: app?.id ?? null });

    flying = setTimeout(() => {
      host.apply(app ? app.widgets : rootWidgets(), ctxFor(id));
      try {
        app?.onEnter?.(ctxFor(id));
      } catch (error) {
        console.error(`[router] onEnter de ${id} falhou`, error);
      }
      setTimeout(() => document.body.classList.remove('in-flight'), FLIGHT_MS - WIDGETS_IN_MS);
    }, WIDGETS_IN_MS);
  }

  /** Widgets da vista de sistema. Declarado aqui porque o sistema não é um app do registro. */
  let rootWidgets = () => [];

  function navigate(id) {
    const target = id && hasApp(id) ? id : ROUTE_ROOT;
    // Escreve no hash e deixa o `hashchange` ativar: um caminho só para entrar num app, seja
    // por clique, por tecla, por link ou pelo botão voltar.
    const next = target === ROUTE_ROOT ? '#/' : `#/${target}`;
    if (window.location.hash === next) activate(target);
    else window.location.hash = next;
  }

  window.addEventListener('hashchange', () => activate(parse()));

  // Dígito entra no app da posição; Home volta ao sistema. A supressão durante digitação é do
  // `keys`, não daqui — era `1` na busca de arquivos navegando em vez de escrever.
  bind({ pattern: /^[1-9]$/, label: '1-4 APPS' }, (event) => {
    const app = listApps()[Number(event.key) - 1];
    if (app) navigate(app.id);
  });
  bind({ key: 'Home' }, () => navigate(ROUTE_ROOT));

  /**
   * Clicar num corpo do céu leva ao app de arquivos, no nó clicado.
   *
   * O gesto já existia e só abria um inspetor. Num ambiente com apps ele precisa ter destino,
   * senão o céu e os apps são dois sistemas que não se falam. O app de arquivos escuta o
   * mesmo `ui.select` para navegar até o nó — aqui mora só a decisão de trocar de rota.
   */
  on('ui.select', ({ node }) => {
    if (!node || current === 'files') return;
    if (node.type === 'file' || node.type === 'dir') navigate('files');
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
