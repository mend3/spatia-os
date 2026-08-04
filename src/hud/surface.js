/**
 * A superfície de painel — e a pilha de painéis abertos.
 *
 * Uma "janela" aqui é o leitor de arquivo e são os painéis de configuração. O leitor resolveu
 * primeiro, à força, os quatro problemas que qualquer painel central tem (ponteiro morto,
 * contexto de empilhamento, encolhimento de flex, barra de rolagem), e as soluções ficaram
 * presas ao seletor dele. Este módulo é o outro lado do primitivo: o CSS `.surface` cuida da
 * moldura, e aqui vive o COMPORTAMENTO que a moldura sozinha não dá — o botão de fechar e a
 * ordem em que os painéis se fecham.
 *
 * ## A pilha é LIFO, e isso não é detalhe
 *
 * Painel abre sobre painel. Esc fecha **o de cima**, um por vez — a mesma expectativa de
 * qualquer interface e a mesma regra que a cadeia de Esc do `main.js` já enuncia: desfaz-se o
 * último passo primeiro. Fechar todos de uma vez transformaria um gesto de "voltar" num gesto
 * de "perder o contexto inteiro", e fechar o de baixo deixaria um painel órfão por cima.
 *
 * O z-index sai da PROFUNDIDADE na pilha, não de constante por painel. Com número fixo, dois
 * painéis empilhados aparecem sempre na mesma ordem, independentemente de qual foi aberto
 * depois — e aí o que está por cima não é o que o operador acabou de pedir.
 *
 * ⚠️ Esc NÃO é escutado aqui. A cadeia vive inteira no `main.js`; quando dois módulos escutavam
 * a tecla por conta própria, com `stopPropagation` no meio, nem o inspetor fechava nem a
 * resposta saía da tela. Este módulo expõe `closeTop()` para entrar naquela cadeia.
 */
import { button } from './button.js';
import * as session from '../core/session.js';

// Base do empilhamento. 8 é o valor que o leitor já usava para passar na frente do `.inspector`
// e dos slots; cada painel acima do primeiro sobe a partir daí.
const BASE_Z = 8;

/** Painéis abertos, do mais antigo ao mais recente. O topo é sempre o último. */
const stack = [];

function restack() {
  stack.forEach((entry, depth) => {
    entry.panel.style.zIndex = String(BASE_Z + depth);
  });
  // O contexto da sessão é quem responde "o que está aberto". A pilha vive aqui porque é aqui
  // que a ordem se decide; publicá-la é o que impede um segundo registro de painéis abertos.
  session.panelChanged(stack.map((entry) => entry.panel.dataset.panel || entry.panel.className.split(' ')[0]));
}

/**
 * Prepara um painel já construído para viver como superfície.
 *
 * Não constrói o conteúdo: cada painel continua dono do que mostra. O que entra aqui é a
 * moldura (as classes que ligam o CSS `.surface`) e o botão de fechar, que é acrescentado em
 * UM lugar só — três painéis com três `×` desenhados à mão divergem no primeiro ajuste.
 *
 * @param {HTMLElement} panel  a raiz do painel
 * @param {object} spec
 * @param {Function} spec.onClose  o que fechar significa para ESTE painel (o `setOpen(false)` dele)
 * @param {string} [spec.name]     nome legível, para o contexto da sessão
 */
export function attach(panel, { onClose, name }) {
  panel.classList.add('surface');
  panel.dataset.surface = 'overlay';
  // Nome legível para o contexto da sessão: `panels: ['afinacao','permissoes']` responde a
  // pergunta; `panels: ['controls','perms']` obriga a traduzir classe de CSS de cabeça.
  if (name) panel.dataset.panel = name;

  const close = button({ variant: 'bare', size: 'xs', title: 'fechar (Esc)' });
  close.classList.add('surface-close');
  close.textContent = '×';
  close.addEventListener('click', () => onClose());
  // Primeiro filho e `position: sticky`: o × fica pregado no topo enquanto o conteúdo rola.
  // Um botão de fechar que sai de vista ao rolar obriga a rolar de volta para poder sair.
  panel.prepend(close);

  return { onClose };
}

/**
 * Registra a abertura/fechamento na pilha. Chamado pelo `setOpen` de cada painel, que continua
 * sendo o dono do estado — aqui só se registra a ORDEM.
 */
export function track(panel, open, onClose) {
  const at = stack.findIndex((entry) => entry.panel === panel);
  if (open) {
    // Reabrir um painel que já está aberto o traz para o topo: foi o último pedido.
    if (at >= 0) stack.splice(at, 1);
    stack.push({ panel, onClose });
  } else if (at >= 0) {
    stack.splice(at, 1);
  }
  restack();
}

/** Fecha o painel do topo. Devolve se havia algum. É o que a cadeia de Esc chama. */
export function closeTop() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.onClose();
  return true;
}

export const isOpen = () => stack.length > 0;
export const depth = () => stack.length;
