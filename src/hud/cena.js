/**
 * O switcher de cena: AGENTE ⇄ UNIVERSO.
 *
 * Duas leituras do MESMO corpus, e o briefing `multi-scene.md` é explícito sobre por que são duas
 * cenas e não duas câmeras:
 *
 * - **AGENTE** — o buraco negro no centro, tudo convergindo. Responde *como a IA está pensando*, e
 *   ali o centro único está CERTO: gravidade é prioridade.
 * - **UNIVERSO** — gravidade local, sem centro. Responde *onde o conhecimento vive*.
 *
 * ⚠️ O buraco negro não desaparece do produto; ele **muda de cena**. Era esse o ponto do §9.1 do
 * replanejamento — ele deixa de ser cinco coisas ao mesmo tempo.
 */
import { on } from '../core/bus.js';
import { reserve } from '../core/keys.js';

const TECLA = 'KeyU';

export function createCenaSwitch(root, { scene, onChange } = {}) {
  const caixa = root.querySelector('[data-cena]');
  if (!caixa) return { set: () => {} };
  const botoes = [...caixa.querySelectorAll('[data-cena-btn]')];

  function pintar(modo) {
    for (const b of botoes) b.setAttribute('aria-pressed', String(b.dataset.cenaBtn === modo));
  }

  function ir(modo) {
    const efetivo = scene?.setMode?.(modo) ?? modo;
    pintar(efetivo);
    onChange?.(efetivo);
    return efetivo;
  }

  for (const b of botoes) b.addEventListener('click', () => ir(b.dataset.cenaBtn));

  /*
   * A tecla alterna em vez de escolher: é o gesto de comparar, e comparar é o que se faz com duas
   * leituras do mesmo dado. Ela respeita a supressão durante digitação do `core/keys.js` por não
   * disparar quando o alvo é um campo de texto.
   *
   * ⚠️ **O despacho é PRÓPRIO, e a reserva é o que o torna visível ao catálogo** — sem ela, `U`
   * não aparecia na lista de atalhos e um `bind({ code: 'KeyU' })` era aceito para nunca disparar.
   * Passar o despacho para o `bind` muda três coisas na tela, e por isso não foi feito aqui:
   * segurar `U` deixaria de alternar a cena na taxa de auto-repeat, `U` passaria a valer com um
   * slider em foco (`isTyping` trata `range` como controle, não como campo), e entraria um
   * `preventDefault`. As duas primeiras são as regras que o `keys.js` existe para impor — quem
   * decide se elas valem para esta tecla é quem opera a cena.
   */
  reserve({ code: TECLA, label: 'TROCAR CENA', group: 'CENA' });

  window.addEventListener('keydown', (e) => {
    if (e.code !== TECLA || e.metaKey || e.ctrlKey || e.altKey) return;
    const alvo = e.target;
    if (alvo instanceof HTMLElement && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
    ir(scene?.mode?.() === 'universo' ? 'agente' : 'universo');
  });

  /*
   * ⚠️ **O botão segue a CENA, não o clique.** Antes ele só se repintava dentro do `ir()` acima,
   * ou seja, só quando a troca nascia AQUI. `spatia.cena('universo')` trocava a cena de verdade e
   * deixava o botão aceso em AGENTE — a tela afirmando uma coisa e o mundo sendo outra, que é o
   * tipo de discordância que faz duvidar da sonda certa antes de duvidar do HUD.
   *
   * Agora `setMode` anuncia (`ui.scene-mode`) e quem desenha escuta. Vale para toda porta, também
   * as que ainda não existem — inclusive o próprio clique, que passa por aqui pelo mesmo caminho.
   */
  on('ui.scene-mode', ({ modo }) => pintar(modo));

  pintar(scene?.mode?.() ?? 'agente');
  return { set: ir };
}
