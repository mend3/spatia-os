/**
 * Os widgets que existiam como painéis fixos, agora registrados no contrato.
 *
 * Eles **envolvem** os módulos que já funcionam (`streams`, `answer`, `frame`) em vez de
 * reescrevê-los. Reescrever cada painel para caber no contrato jogaria fora código verificado
 * para chegar ao mesmo comportamento — o contrato existe para compor, não para justificar
 * reescrita.
 *
 * A técnica: cada widget move o nó DOM que o módulo antigo já criou para dentro da fenda. O
 * módulo continua dono do conteúdo e das assinaturas de evento; o widget só decide onde ele
 * aparece e em qual app. `destroy` devolve o nó a um depósito fora de tela, então desmontar
 * não perde o histórico da timeline nem o texto da resposta.
 */
import { registerWidget } from '../kernel/registry.js';
import { el, set } from '../hud/dom.js';

// Depósito dos nós desmontados. Fora de tela, mas ainda no documento: um nó removido do
// documento perde `getBoundingClientRect`, e o inspetor e o waveform dependem disso.
let attic = null;

function stow() {
  if (!attic) {
    attic = el('div', 'attic');
    document.body.append(attic);
  }
  return attic;
}

/**
 * Registra um widget que adota um nó já existente na página.
 * @param {string} id
 * @param {string} title
 * @param {string} slot
 * @param {string} selector  o nó que o módulo antigo criou
 */
function adopt({ id, title, hint = '', slot, grow = 0, selector }) {
  return registerWidget({
    id,
    title,
    hint,
    slot,
    grow,
    mount(host) {
      const node = document.querySelector(selector) || stow().querySelector(selector);
      if (!node) {
        host.append(el('div', 'widget-error', `nó ausente: ${selector}`));
        return null;
      }
      host.append(node);
      return { destroy: () => stow().append(node) };
    },
  });
}

export function registerCoreWidgets() {
  adopt({ id: 'vitals', title: 'SINAIS VITAIS', hint: 'SESSÃO', slot: 'left', selector: '[data-vitals]' });
  adopt({ id: 'plan', title: 'PLANO', hint: 'CICLO ATUAL', slot: 'left', selector: '[data-plan]' });
  adopt({ id: 'timeline', title: 'TIMELINE', hint: 'PERFIL REAL', slot: 'left', grow: 1, selector: '[data-timeline]' });
  adopt({ id: 'memory', title: 'MEMÓRIA RECUPERADA', hint: 'VETORIAL', slot: 'right', grow: 1, selector: '[data-memory]' });
  adopt({ id: 'tools', title: 'FERRAMENTAS', hint: 'CHAMADAS REAIS', slot: 'right', selector: '[data-tools]' });
  adopt({ id: 'web-results', title: 'SATÉLITES DE BUSCA', hint: 'WEB', slot: 'right', selector: '[data-web]' });

  // O palco: resposta + fontes + meta. Um widget só, porque as três partes são uma leitura.
  registerWidget({
    id: 'answer',
    title: 'RESPOSTA',
    slot: 'stage',
    mount(host) {
      const nodes = ['[data-answer-dismiss]', '[data-answer]', '[data-answer-meta]', '[data-sources]']
        .map((selector) => document.querySelector(selector) || stow().querySelector(selector))
        .filter(Boolean);
      for (const node of nodes) host.append(node);
      return { destroy: () => nodes.forEach((node) => stow().append(node)) };
    },
  });
}

/** Helper para os apps novos: lista simples com cabeçalho e linhas, no estilo hairline. */
export function listWidget({ id, title, hint = '', slot, grow = 0, surface = false, collapsed = false, render }) {
  return registerWidget({
    id,
    title,
    hint,
    slot,
    grow,
    surface,
    collapsed,
    mount(host, ctx) {
      const body = el('div', 'scroll');
      host.append(body);
      const api = {
        clear: () => body.replaceChildren(),
        push: (node) => body.append(node),
        set: (nodes) => body.replaceChildren(...nodes),
        empty: (text) => body.replaceChildren(el('div', 'widget-empty', text)),
      };
      const instance = render(api, ctx) || {};
      return instance;
    },
  });
}

export { el, set };
