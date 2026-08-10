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
 *
 * ⚠️ Os `@param` nomeavam as chaves como se fossem quatro parâmetros; a função recebe UM objeto
 * desestruturado, e a inferência lia o primeiro nome como o tipo do parâmetro — `String` — o que
 * fazia toda chamada acusar. Chave desestruturada é `@param {{…}}`, nunca um `@param` por chave.
 *
 * @param {{id: string, title: string, hint?: string, slot: 'left'|'right'|'stage'|'strip',
 *          grow?: number, selector: string}} contrato  `selector` é o nó que o módulo antigo criou
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
    // DECIDIDO que não: a resposta é prosa sobre o céu, e a moldura a transformaria numa janela
    // opaca no centro do palco. `surface` ausente seria "ninguém decidiu", que a fenda recusa.
    surface: false,
    mount(host) {
      const nodes = ['[data-answer-dismiss]', '[data-answer]', '[data-answer-meta]', '[data-sources]']
        .map((selector) => document.querySelector(selector) || stow().querySelector(selector))
        .filter(Boolean);
      for (const node of nodes) host.append(node);
      return { destroy: () => nodes.forEach((node) => stow().append(node)) };
    },
  });
}

/**
 * Helper para os apps novos: lista simples com cabeçalho e linhas, no estilo hairline.
 *
 * ☠️ **`surface` não tem padrão, e isso é o contrato — não descuido.** O palco EXIGE `surface`
 * declarado (`FENDAS.stage.exige`, `kernel/registry.js`), e um padrão aqui FABRICA a decisão que
 * o app nunca tomou: o registro recebia `false` sem ter como saber que ninguém disse nada, e o
 * portão que recusa palco sem fundo passava a nunca alcançar quem usa este invólucro. Foi assim
 * que `br-deliveries` nasceu no palco sem moldura e o disco de acreção atravessou o texto.
 * Sem padrão, a ausência chega inteira ao registro e estoura no boot, com o nome do culpado.
 * `scripts/lei-catalogo.mjs` §4 acusa qualquer padrão para chave que alguma fenda exija.
 * 
 * ⚠️ **O tipo diz o que a FENDA diz, e não "obrigatória sempre".** Sem `surface` na desestruturação
 * ter padrão — que é o contrato acima —, a inferência a lê como exigida em toda fenda e acusa os
 * ~20 widgets de `left`/`right` que legitimamente não a declaram. A união discriminada põe a
 * exigência onde `FENDAS.stage.exige` a põe, e passa a acusar no editor o widget de palco que a
 * omitir, em vez de só no boot.
 *
 * @typedef {{id: string, title: string, hint?: string, grow?: number,
 *            collapsed?: boolean, render: (view: any, ctx?: any) => any}} BaseDoWidget
 * @param {(BaseDoWidget & {slot: 'stage', surface: boolean})
 *       | (BaseDoWidget & {slot: 'left'|'right'|'strip', surface?: boolean})} contrato
 */
export function listWidget({ id, title, hint = '', slot, grow = 0, surface, collapsed = false, render }) {
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
