/**
 * Painel de afinação — construído a partir do SPEC, nunca escrito à mão.
 *
 * Fica escondido; alterna com ⌘G (ou a crase, ou o botão AFINAR). Não é um painel
 * de debug: usa a mesma tipografia hairline da HUD e some no modo cinematográfico, porque o
 * operador vai usá-lo para achar o visual que ele quer — não para inspecionar variáveis.
 *
 * Os defaults do SPEC são a afinação que o operador chegou usando este painel, capturada do
 * navegador dele. Não são números de fábrica: RESTAURAR volta para o visual escolhido, não
 * para um estado que ninguém queria ver.
 *
 * O slider escreve direto no store, e o store notifica a cena. Não existe botão "aplicar":
 * afinação visual só funciona com resposta no mesmo quadro.
 */
import * as tuning from '../core/tuning.js';
import { el, set } from './dom.js';
import * as prefs from '../core/prefs.js';
import { bind } from '../core/keys.js';
import * as motion from '../core/motion.js';
import * as surface from './surface.js';

/**
 * Alias em crase, convenção de painel de afinação e ausente em pergunta em português.
 *
 * O atalho principal é ⌘G — ver o raciocínio no `bind` abaixo. Letra SOLTA como atalho global
 * é incompatível com um campo de texto sempre focado, e foi por isso que `G` puro saiu.
 */
const TOGGLE_KEY = 'Backquote';

export function createControls(root) {
  const panel = el('div', 'controls');
  const header = el('div', 'controls-head');
  header.append(el('span', 'controls-title', 'AFINAÇÃO'));
  const resetButton = el('button', 'controls-reset', 'RESTAURAR');
  header.append(resetButton);
  panel.append(header);

  /*
   * Aviso de movimento reduzido.
   *
   * Com `prefers-reduced-motion` ativo, a cena zera GRÃO e RESPIRAÇÃO e amortece as derivas —
   * então esses sliders exibem um número que não está em vigor. Um controle que não controla, em
   * silêncio, é o defeito que o painel de permissões existe para não cometer; aqui vale a mesma
   * régua. O aviso só aparece quando a preferência está ligada.
   */
  const motionNote = el('div', 'controls-note', '');
  panel.append(motionNote);
  motion.subscribe((reduced) => {
    motionNote.hidden = !reduced;
    set(
      motionNote,
      reduced ? 'MOVIMENTO REDUZIDO (preferência do sistema) · GRÃO e RESPIRAÇÃO em 0 · DERIVAS a 25%' : ''
    );
  });

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

  panel.append(el('div', 'controls-hint', '⌘G ALTERNA · VALORES PERSISTEM NESTE NAVEGADOR'));
  root.append(panel);

  resetButton.addEventListener('click', () => tuning.reset());

  // O store é a fonte da verdade: `reset()` e qualquer mudança externa reescrevem os sliders.
  tuning.subscribe((values) => {
    for (const [key, slider] of inputs) {
      if (slider.value !== String(values[key])) slider.value = values[key];
      set(readouts.get(key), format(values[key]));
    }
  });

  /*
   * Um atalho, as duas direções.
   *
   * Houve uma versão em que a crase abria e `G` fechava. Estava errado: atalho que entra por
   * uma tecla e sai por outra obriga a decorar duas coisas para um gesto só.
   *
   * O modificador é o que torna a simetria possível. `G` puro não pode ser toggle global
   * porque o prompt tem foco quase sempre — ou o atalho engole a letra ao digitar "grafo", ou
   * o campo engole o atalho, e não há terceira opção. Com ⌘/Ctrl não existe caractere em
   * disputa, então o mesmo atalho vale com o cursor no prompt e com ele fora: `whileTyping`.
   *
   * `meta` casa ⌘ OU Ctrl (ver `matches` em keys.js), então serve mac e linux sem ramificar.
   */
  const alterna = () => setOpen(!panel.classList.contains('open'));
  bind({ code: 'KeyG', meta: true, whileTyping: true, label: 'AFINAÇÃO', group: 'PAINÉIS' }, alterna);
  /*
   * A crase continua valendo e também ALTERNA — nunca só uma das direções.
   *
   * Sem `whileTyping`, ao contrário do ⌘G: crase é caractere, e num OS de desenvolvedor ela é
   * digitada de verdade. Marcá-la como válida durante a digitação transformaria cada crase
   * escrita no prompt em abertura de painel, trocando um atalho conveniente por um campo de
   * texto que engole caractere.
   */
  bind({ code: TOGGLE_KEY, alias: true }, alterna);

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

  surface.attach(panel, { name: 'afinacao', onClose: () => setOpen(false) });

  function setOpen(open) {
    panel.classList.toggle('open', open);
    document.body.classList.toggle('tuning', open);
    prefs.set('panel.tuning', open);
    // A superfície é CENTRADA agora, não mais a coluna esquerda — apagar a coluna deixaria de
    // fazer sentido (ela nem está mais embaixo) e cobraria um espaço que ninguém ocupou.
    if (trigger) trigger.dataset.on = String(open);
    surface.track(panel, open, () => setOpen(false));
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
