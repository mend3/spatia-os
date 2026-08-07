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

/*
 * Quais seções estão recolhidas. Um `Set` no localStorage, não um campo por widget nas prefs:
 * widget é registro aberto (qualquer app pode listar um novo) e uma chave por id em `DEFAULTS`
 * exigiria editar as prefs a cada widget novo — a lista seria sempre a de ontem.
 */
const COLLAPSED_KEY = 'espatial.collapsed.v1';

function readCollapsed() {
  try {
    const bruto = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}');
    // Aceita o formato antigo (lista pura) para não zerar a escolha de quem já tinha usado.
    if (Array.isArray(bruto)) return { fechadas: new Set(bruto), abertas: new Set() };
    return { fechadas: new Set(bruto.fechadas || []), abertas: new Set(bruto.abertas || []) };
  } catch {
    return new Set();
  }
}

const guardado = readCollapsed();
const collapsedState = guardado.fechadas;
/*
 * Quem foi ABERTO de propósito. Sem este segundo conjunto não dá para distinguir "nunca mexi"
 * de "abri e quero assim": as duas seriam ausência no `collapsedState`, e uma seção que nasce
 * recolhida voltaria a se fechar a cada reload por cima da escolha do operador.
 */
const expandedState = guardado.abertas;

function persistCollapsed() {
  try {
    localStorage.setItem(
      COLLAPSED_KEY,
      JSON.stringify({ fechadas: [...collapsedState], abertas: [...expandedState] })
    );
  } catch {
    // Modo privado: a sessão funciona, só não lembra. Mesma regra do `prefs`.
  }
}

export function createWidgetHost(root) {
  const slots = {
    left: root.querySelector('[data-slot="left"]'),
    right: root.querySelector('[data-slot="right"]'),
    stage: root.querySelector('[data-slot="stage"]'),
    strip: root.querySelector('[data-slot="strip"]'),
  };

  // id -> { frame, instance, contract }
  const live = new Map();

  /** Recolhe os irmãos de fenda, para que o que acabou de abrir tenha a altura do trilho. */
  function collapseSiblings(id, slot) {
    for (const [other, entry] of live) {
      if (other === id || entry.contract.slot !== slot || !entry.colapsar) continue;
      collapsedState.add(other);
      expandedState.delete(other);
      entry.colapsar(true);
    }
  }

  function build(contract, ctx) {
    let colapsar = null;
    const frame = el('section', `widget widget-${contract.slot}`);
    frame.dataset.widget = contract.id;
    /*
     * Superfície de painel — o contrato pede, o host marca, o CSS `.surface` faz o resto.
     *
     * Antes as regras do painel eram escritas em cima de `[data-widget="fs-content"]`, então
     * um widget novo no palco nascia SEM fundo: o disco de acreção atravessava o texto e a
     * página ficava ilegível. Foi o que aconteceu com a página de configuração.
     */
    if (contract.surface) frame.dataset.panelSurface = 'true';
    if (contract.grow) frame.style.flex = String(contract.grow);

    // `stage` é o centro da tela e não leva moldura: a resposta tem que nascer do espaço,
    // não de dentro de um quadro rotulado.
    /*
     * O rótulo é o botão de RECOLHER a seção.
     *
     * Cada trilho empilha quatro a seis seções e todas ficavam abertas o tempo todo. Não é
     * quantidade de tinta que pesa (medido: 8,4% dos pixels), é que o operador não tinha como
     * dizer o que lhe interessa AGORA — a hierarquia era imposta pelo layout, nunca por ele.
     *
     * O rótulo já ocupa a largura toda e já é a divisa visual da seção: virar o alvo do clique
     * não custa pixel nenhum e não inventa affordance nova. `<button>` de verdade, não `div` com
     * handler — teclado e leitor de tela vêm de graça, e o `#hud` é `pointer-events: none`, onde
     * `button` é justamente um dos seletores que reativam o ponteiro.
     *
     * O estado é por widget e sobrevive ao reload: recolher uma seção é uma decisão sobre o
     * espaço de trabalho, e refazê-la a cada abertura seria a interface esquecendo de propósito.
     */
    if (contract.slot !== 'stage') {
      const label = el('button', 'label');
      label.type = 'button';
      label.append(el('span', 'widget-title', contract.title));
      label.append(el('i', 'widget-hint', contract.hint || ''));
      const chave = `widget.collapsed.${contract.id}`;
      const aplicar = (recolhido) => {
        frame.dataset.collapsed = String(recolhido);
        label.setAttribute('aria-expanded', String(!recolhido));
        // `flex` some junto: uma seção recolhida que continua reivindicando espaço elástico
        // deixaria um vão no trilho, que é o oposto de recolher.
        frame.style.flex = recolhido ? '0 0 auto' : String(contract.grow || '');
      };
      const jaDecidiu = collapsedState.has(contract.id) || expandedState.has(contract.id);
      aplicar(jaDecidiu ? collapsedState.has(contract.id) : Boolean(contract.collapsed));
      // Publicado no host para que o acordeão do trilho possa recolher os irmãos: o estado é
      // por widget, mas a decisão de espaço é do trilho, e nenhum widget se alcança sozinho.
      colapsar = aplicar;
      label.addEventListener('click', () => {
        const recolhido = frame.dataset.collapsed !== 'true';
        if (recolhido) { collapsedState.add(contract.id); expandedState.delete(contract.id); }
        else { collapsedState.delete(contract.id); expandedState.add(contract.id); }
        /*
         * ABRIR UM RECOLHE OS OUTROS DO MESMO TRILHO — e só do mesmo trilho.
         *
         * Um trilho empilha quatro a seis seções numa coluna flex de altura fixa: com todas
         * abertas elas disputam a altura, e o que perde não fica menor, fica com ZERO. Um
         * gráfico de 14px sumia inteiro enquanto a legenda dele continuava na tela, sem erro
         * nenhum no console.
         *
         * O grupo é a FENDA, não a tela: abrir algo à direita não pode fechar o que se estava
         * lendo à esquerda. São duas colunas independentes, e tratá-las como uma faria o
         * operador perder contexto por um gesto que não falava daquele lado.
         */
        if (!recolhido) collapseSiblings(contract.id, contract.slot);
        persistCollapsed();
        aplicar(recolhido);
      });
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
    return { frame, instance, contract, colapsar };
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
