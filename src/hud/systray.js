/**
 * A systray do topo — os itens de estado do sistema, ao lado do relógio.
 *
 * Este módulo é só o COMPORTAMENTO DE MENU. Ele não conhece voz, web, permissões nem afinação:
 * os botões que fazem essas coisas moram no `index.html`, dentro dos popovers, e continuam
 * sendo encontrados por `querySelector` pelos módulos donos de cada assunto. Duplicar aqui a
 * construção daqueles controles garantiria divergência na primeira alteração — é a mesma razão
 * pela qual a futura página de configuração deve reaproveitar `createControls` /
 * `createSpeechPanel` / `createPermissions` em vez de recriá-los.
 *
 * O estado exibido no glifo vem do `prefs`, que é onde `voice.js` e `terminal.js` já gravam a
 * verdade. Ler o `data-on` dos botões seria espelhar um espelho: a mesma informação, uma cópia
 * mais longe da origem, com um caminho a mais para dessincronizar.
 *
 * ## Contrato do popover
 *
 * Ancorado sob o item, **um aberto por vez**, fecha por: Esc, clique fora, ou segundo clique no
 * próprio item. Popover ancorado e modal centrado são contratos distintos — este não escurece o
 * fundo, não prende o foco e não bloqueia a cena atrás.
 *
 * ⚠️ O Esc NÃO é escutado aqui. A cadeia de Esc vive inteira no `main.js`, e o motivo está
 * escrito lá: quando dois módulos escutavam a tecla por conta própria, com `stopPropagation` no
 * meio, nem o inspetor fechava nem a resposta saía da tela. Este módulo só expõe `isOpen()` e
 * `close()` para entrar naquela cadeia na posição certa.
 */
import * as prefs from '../core/prefs.js';
import * as session from '../core/session.js';

export function createSystray(root) {
  const tray = root.querySelector('[data-systray]');
  if (!tray) return null;

  const items = new Map();
  for (const button of tray.querySelectorAll('[data-tray]')) {
    const name = button.dataset.tray;
    const menu = tray.querySelector(`[data-tray-menu="${name}"]`);
    if (!menu) continue;
    items.set(name, { button, menu });
    button.addEventListener('click', (event) => {
      // O clique não pode subir: o mesmo gesto que abre chegaria ao ouvinte de "clique fora"
      // e fecharia o menu no mesmo instante, que na tela lê como o botão não funcionar.
      event.stopPropagation();
      toggle(name);
    });
  }

  let open = null;

  function show(name) {
    for (const [key, item] of items) {
      const on = key === name;
      item.menu.hidden = !on;
      item.button.setAttribute('aria-expanded', String(on));
    }
    open = name;
    session.trayChanged(name);
  }

  function close() {
    if (!open) return false;
    show(null);
    open = null;
    return true;
  }

  function toggle(name) {
    if (open === name) close();
    else show(name);
  }

  /*
   * Clique fora fecha — em `document`, na fase de CAPTURA.
   *
   * Captura porque um clique num painel que chame `stopPropagation` nunca borbulharia até aqui,
   * e o menu ficaria aberto por cima de uma interface que já mudou de assunto. A checagem é por
   * `contains` na árvore da systray, então clicar dentro do próprio menu não o fecha.
   */
  document.addEventListener(
    'click',
    (event) => {
      if (!open) return;
      if (!tray.contains(event.target)) close();
    },
    true
  );

  /** Espelha no glifo o que o `prefs` já sabe. Uma origem, duas superfícies. */
  function paint() {
    const voice = items.get('voice');
    if (voice) voice.button.dataset.on = String(Boolean(prefs.get('voice.enabled')));
    const web = items.get('web');
    if (web) web.button.dataset.mode = prefs.get('web.mode') ?? 'auto';
  }

  prefs.subscribe(paint);
  paint();

  return {
    close,
    isOpen: () => open !== null,
    /** Abre um item pelo nome — é o caminho de um atalho de teclado para a systray. */
    open: (name) => (items.has(name) ? show(name) : undefined),
  };
}
