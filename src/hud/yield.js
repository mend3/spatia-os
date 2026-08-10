/**
 * A HUD CEDE onde há sinal acionável no céu.
 *
 * ## O problema, medido
 *
 * O usuário reportou que "os astros com anel ficam atrás do painel". A medição contradisse a
 * leitura e foi o que apontou a causa certa: varrendo a tela em 45 pontos, 37 chegam ao canvas —
 * a HUD não bloqueia o mouse. E de todos os elementos do corpo, só DOIS têm fundo não
 * transparente, ambos botões de 30px. **A HUD não tapa nada.**
 *
 * O que acontece é contraste. A interface é âmbar (`#ffb35c`) e o anel de arquivo ALTERADO é
 * âmbar (`#ffc169`) — mesma família, mesmo peso, sobrepostos. O astro não fica atrás do painel;
 * ele se camufla nele. Escurecer o painel inteiro trocaria um problema por outro, porque a HUD
 * hairline vive de pouco contraste e perderia legibilidade em toda a tela para resolver um
 * conflito que existe em ~40px.
 *
 * ## A solução: furo local, e só enquanto o conflito existe
 *
 * Uma máscara com um degradê radial por astro sinalizado. Onde o anel está, o texto da HUD some;
 * um pixel adiante ele está inteiro. Quem cede é a interface, porque o sinal é perecível (some
 * no commit) e o texto não — ele continua ali quando o astro passar.
 *
 * ## Por que não é caro
 *
 * A máscara só é escrita quando algum astro sinalizado está DENTRO do retângulo de um trilho, e
 * mesmo aí só quando algum ponto andou mais que `MOVED_PX`. Na esmagadora maioria dos quadros
 * (nenhum arquivo sujo, ou os sujos longe das bordas) o custo é um laço sobre ≤10 pontos e
 * nenhuma escrita de estilo. Quando não há mais nada a ceder, a máscara é REMOVIDA — deixá-la
 * com zero furos manteria a camada de composição viva de graça.
 */

/** Quanto um ponto precisa andar para valer reescrever a máscara. Menos que isto, ninguém vê. */
const MOVED_PX = 4;
/**
 * Onde o furo começa a abrir, em fração do raio. Abaixo disso é opaco de verdade; daí até a
 * borda é degradê. Furo de borda dura seria mais visível que o problema que resolve.
 */
const CORE = 0.42;
/** Folga sobre o raio do anel: o brilho do astro passa da geometria dele. */
const HALO = 1.25;

/**
 * @param {Element[]} rails  os elementos que devem ceder (os trilhos laterais da HUD)
 */
export function createYield(rails) {
  const targets = rails.filter(Boolean);
  /** Último conjunto aplicado por trilho, para não reescrever estilo igual. */
  const applied = new Map(targets.map((rail) => [rail, null]));

  const same = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i].x - b[i].x) > MOVED_PX || Math.abs(a[i].y - b[i].y) > MOVED_PX) return false;
      if (Math.abs(a[i].r - b[i].r) > MOVED_PX) return false;
    }
    return true;
  };

  function paint(rail, points) {
    if (same(applied.get(rail), points)) return;
    applied.set(
      rail,
      points.map((p) => ({ ...p }))
    );

    if (!points.length) {
      // Sem nada a ceder, a máscara SAI. Uma máscara sem furos continua sendo uma camada de
      // composição, e pagar por ela para não recortar nada é custo por hipótese.
      rail.style.removeProperty('mask-image');
      rail.style.removeProperty('mask-composite');
      rail.style.removeProperty('mask-repeat');
      return;
    }

    const box = rail.getBoundingClientRect();
    const layers = points.map((p) => {
      // Coordenadas RELATIVAS ao trilho: a máscara é do elemento, não da janela.
      const x = (p.x - box.left).toFixed(1);
      const y = (p.y - box.top).toFixed(1);
      const r = Math.max(12, p.r * HALO).toFixed(1);
      return `radial-gradient(circle ${r}px at ${x}px ${y}px, transparent 0, transparent ${(
        CORE * 100
      ).toFixed(0)}%, #000 100%)`;
    });

    rail.style.maskImage = layers.join(', ');
    // `intersect`: cada camada come um pedaço da anterior, então os furos se SOMAM. No modo
    // padrão (`add`) o segundo furo devolveria o que o primeiro tirou.
    rail.style.maskComposite = 'intersect';
    rail.style.maskRepeat = 'no-repeat';
  }

  return {
    /**
     * Recebe os pontos de sinal da cena, em pixels de CSS, uma vez por quadro.
     *
     * @param {Array<{x: number, y: number, r: number}>} points
     */
    update(points) {
      for (const rail of targets) {
        if (!points.length) {
          paint(rail, []);
          continue;
        }
        const box = rail.getBoundingClientRect();
        // Só interessam os pontos que TOCAM este trilho. Um astro no meio da tela não deve
        // fazer a HUD reescrever máscara nenhuma.
        const dentro = points.filter((p) => {
          const raio = p.r * HALO;
          return (
            p.x + raio > box.left && p.x - raio < box.right && p.y + raio > box.top && p.y - raio < box.bottom
          );
        });
        paint(rail, dentro);
      }
    },

    /** Devolve os trilhos ao estado normal — usado ao desligar ou desmontar. */
    clear() {
      for (const rail of targets) paint(rail, []);
    },
  };
}
