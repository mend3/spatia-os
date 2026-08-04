/**
 * `prefers-reduced-motion` — a preferência do sistema operacional, obedecida.
 *
 * Não é detalhe de acessibilidade a ser feito depois. Esta interface tem voo de câmera, bloom
 * pulsante, grão animado e partículas em espiral: para parte das pessoas isso é a diferença
 * entre usável e nauseante. Quem marcou "reduzir movimento" no sistema já disse o que precisa.
 *
 * ## O que a redução NÃO faz
 *
 * Não desliga a informação. A regra deste projeto é que todo movimento corresponde a um evento
 * real; então o evento continua sendo mostrado, só sem deslocamento contínuo:
 *
 * | Cheio | Reduzido | O evento continua visível por |
 * |---|---|---|
 * | voo de câmera até o app | corte direto | a cena já estar no destino |
 * | bloom/escala pulsando no regime | intensidade estável por regime | o brilho e a cor do regime |
 * | grão de filme animado | sem grão | — (era textura, não informação) |
 * | 26 partículas em espiral | 6 partículas | o clarão no ponto do evento |
 * | nó aceso pulsando | nó aceso estável | a corona e a cor quente |
 *
 * ## Dois consumidores, um sinal
 *
 * O CSS usa a media query direto (funciona mesmo se o JS falhar). O JS usa este módulo, para os
 * parâmetros de shader e de câmera, que CSS não alcança. O atributo `data-motion` no `<html>`
 * existe para o painel de afinação poder DIZER que está reduzido — um slider de grão em 0,03 que
 * não produz grão é um controle mentindo, e a tela tem que admitir em vez de fingir.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

const listeners = new Set();
const media = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;

let reduced = Boolean(media?.matches);

function apply() {
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
}

apply();

// A preferência muda em runtime (o usuário liga no sistema com a página aberta) e a cena tem que
// obedecer sem reload — o `subscribe` existe para os módulos que guardam o valor em cache.
media?.addEventListener?.('change', (event) => {
  reduced = event.matches;
  apply();
  for (const handler of [...listeners]) {
    try {
      handler(reduced);
    } catch (error) {
      console.error('[motion] assinante falhou', error);
    }
  }
});

export const isReduced = () => reduced;

export function subscribe(handler) {
  listeners.add(handler);
  handler(reduced);
  return () => listeners.delete(handler);
}

/**
 * Escolhe entre o valor cheio e o reduzido. Existe para o call site declarar a intenção numa
 * linha em vez de espalhar `if (isReduced())` por toda a cena.
 */
export const pick = (full, quiet) => (reduced ? quiet : full);
