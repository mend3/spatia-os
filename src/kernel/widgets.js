/**
 * Host de widgets: monta e desmonta o conjunto declarado pelo app ativo.
 *
 * A troca não é "apaga e desenha". Widget que o app novo também usa **permanece montado** —
 * a timeline não pode perder o histórico e o terminal não pode perder o foco só porque o
 * operador foi de um app a outro. Só o que sai é destruído, só o que entra é montado, e o que
 * fica não é tocado. É diff, não repaint.
 *
 * Isso é o que faz a transição parecer o espaço se reorganizando em vez de a página recarregar.
 */
import { getWidget } from './registry.js';
import { el, set } from '../hud/dom.js';

export function createWidgetHost(root) {
  const slots = {
    left: root.querySelector('[data-slot="left"]'),
    right: root.querySelector('[data-slot="right"]'),
    stage: root.querySelector('[data-slot="stage"]'),
    strip: root.querySelector('[data-slot="strip"]'),
  };

  // id -> { frame, instance, contract }
  const live = new Map();

  function build(contract, ctx) {
    const frame = el('section', `widget widget-${contract.slot}`);
    frame.dataset.widget = contract.id;
    if (contract.grow) frame.style.flex = String(contract.grow);

    // `stage` é o centro da tela e não leva moldura: a resposta tem que nascer do espaço,
    // não de dentro de um quadro rotulado.
    if (contract.slot !== 'stage') {
      const label = el('div', 'label');
      label.append(el('span', 'widget-title', contract.title));
      label.append(el('i', 'widget-hint', contract.hint || ''));
      frame.append(label);
    }

    const body = el('div', 'widget-body');
    frame.append(body);
    slots[contract.slot]?.append(frame);

    let instance = null;
    try {
      instance = contract.mount(body, ctx) || null;
    } catch (error) {
      // Widget que explode na montagem não pode derrubar o app inteiro: ele mostra o próprio
      // erro na própria moldura, e o resto da vista continua utilizável.
      console.error(`[widgets] ${contract.id} falhou ao montar`, error);
      body.replaceChildren(el('div', 'widget-error', `falha: ${error.message}`));
    }
    return { frame, instance, contract };
  }

  function destroy(entry) {
    try {
      entry.instance?.destroy?.();
    } catch (error) {
      console.error(`[widgets] ${entry.contract.id} falhou ao destruir`, error);
    }
    entry.frame.remove();
  }

  return {
    /** Aplica o conjunto do app: destrói o que saiu, monta o que entrou, preserva o resto. */
    apply(ids, ctx) {
      const wanted = new Set(ids);

      for (const [id, entry] of [...live]) {
        if (wanted.has(id)) continue;
        destroy(entry);
        live.delete(id);
      }

      for (const id of ids) {
        if (live.has(id)) continue;
        const contract = getWidget(id);
        if (!contract) {
          console.warn(`[widgets] ${id} não registrado`);
          continue;
        }
        live.set(id, build(contract, ctx));
      }

      // Ordem visual = ordem declarada pelo app. Reanexar o nó já montado não o remonta,
      // então preservar instância e respeitar a ordem não são objetivos em conflito.
      for (const id of ids) {
        const entry = live.get(id);
        if (entry) slots[entry.contract.slot]?.append(entry.frame);
      }
    },

    /** Atualiza o texto auxiliar de um widget já montado (contagens, estado). */
    setHint(id, text) {
      const entry = live.get(id);
      if (entry) set(entry.frame.querySelector('.widget-hint'), text);
    },

    mounted: () => [...live.keys()],
    instance: (id) => live.get(id)?.instance ?? null,
  };
}
