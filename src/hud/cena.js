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
   */
  window.addEventListener('keydown', (e) => {
    if (e.code !== TECLA || e.metaKey || e.ctrlKey || e.altKey) return;
    const alvo = e.target;
    if (alvo instanceof HTMLElement && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
    ir(scene?.mode?.() === 'universo' ? 'agente' : 'universo');
  });

  pintar(scene?.mode?.() ?? 'agente');
  return { set: ir };
}
