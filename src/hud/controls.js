/**
 * Painel de afinação — construído a partir do SPEC, nunca escrito à mão.
 *
 * Fica escondido e abre com `G` (ou o botão AFINAR). Não é um painel de debug: usa a mesma
 * tipografia hairline da HUD e some no modo cinematográfico, porque o operador vai usá-lo
 * para achar o visual que ele quer — não para inspecionar variáveis.
 *
 * O slider escreve direto no store, e o store notifica a cena. Não existe botão "aplicar":
 * afinação visual só funciona com resposta no mesmo quadro.
 */
import * as tuning from '../core/tuning.js';
import { el, set } from './dom.js';
import * as prefs from '../core/prefs.js';
import { bind } from '../core/keys.js';

/**
 * Backquote, não letra.
 *
 * O atalho era `G`, e o prompt recebe foco no boot — então o guarda "não sequestrar a tecla
 * enquanto se digita" descartava TODA tecla G, e o painel era inalcançável pelo teclado.
 * Letra solta como atalho global é incompatível com um campo de texto sempre focado: ou o
 * atalho engole o caractere, ou o campo engole o atalho.
 *
 * A crase é a convenção de painel de afinação e não aparece em pergunta em português. Ainda
 * assim, o botão visível é o caminho principal — atalho é atalho, não a única porta.
 */
const TOGGLE_KEY = 'Backquote';

export function createControls(root) {
  const panel = el('div', 'controls');
  const header = el('div', 'controls-head');
  header.append(el('span', 'controls-title', 'AFINAÇÃO'));
  const resetButton = el('button', 'controls-reset', 'RESTAURAR');
  header.append(resetButton);
  panel.append(header);

  const readouts = new Map();
  const inputs = new Map();
  let lastGroup = null;

  for (const [group, key, label, min, max, step] of tuning.SPEC) {
    if (group !== lastGroup) {
      panel.append(el('div', 'controls-group', group));
      lastGroup = group;
    }

    const row = el('label', 'control');
    const head = el('span', 'control-head');
    head.append(el('span', 'control-label', label));
    const readout = el('span', 'control-value', format(tuning.get(key)));
    head.append(readout);
    row.append(head);

    const slider = el('input', 'control-slider');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = tuning.get(key);
    // `input`, não `change`: o valor tem que chegar na cena enquanto o dedo arrasta.
    slider.addEventListener('input', () => tuning.set(key, slider.value));
    row.append(slider);

    panel.append(row);
    readouts.set(key, readout);
    inputs.set(key, slider);
  }

  panel.append(el('div', 'controls-hint', 'G FECHA · VALORES PERSISTEM NESTE NAVEGADOR'));
  root.append(panel);

  resetButton.addEventListener('click', () => tuning.reset());

  // O store é a fonte da verdade: `reset()` e qualquer mudança externa reescrevem os sliders.
  tuning.subscribe((values) => {
    for (const [key, slider] of inputs) {
      if (slider.value !== String(values[key])) slider.value = values[key];
      set(readouts.get(key), format(values[key]));
    }
  });

  bind({ code: TOGGLE_KEY, label: '` AFINAR' }, () => setOpen(!panel.classList.contains('open')));

  const trigger = root.querySelector('[data-tune-toggle]');
  trigger?.addEventListener('click', () => setOpen(!panel.classList.contains('open')));

  /**
   * O painel ocupa a coluna esquerda em vez de flutuar sobre ela.
   *
   * Sobrepor deixava os valores dos vitais aparecendo entre os sliders — duas leituras
   * disputando o mesmo espaço, e nenhuma legível. Afinar é um modo, não um overlay.
   */
  // A coluna é marcada pelo JS em vez de por seletor descendente. `body.tuning #hud >
  // aside:first-of-type` casava o elemento e ainda assim não aplicava opacidade — depurar
  // isso pelo CSSOM custa mais do que a classe explícita, que não tem como não funcionar.
  const leftColumn = root.querySelector('aside');

  function setOpen(open) {
    panel.classList.toggle('open', open);
    document.body.classList.toggle('tuning', open);
    prefs.set('panel.tuning', open);
    leftColumn?.classList.toggle('dimmed', open);
    if (trigger) trigger.dataset.on = String(open);
    // Tira o foco do prompt ao abrir: com ele focado, seta e Home/End iriam para o texto em
    // vez do slider, e ajustar com o teclado é metade do valor de um painel de afinação.
    if (open) document.activeElement?.blur?.();
  }

  return {
    toggle: () => setOpen(!panel.classList.contains('open')),
    isOpen: () => panel.classList.contains('open'),
  };
}

function format(value) {
  const number = Number(value);
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(Math.abs(number) < 0.1 ? 3 : 2);
}
