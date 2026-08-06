/**
 * O ORÇAMENTO DE PIXEL DO FOCO — o recuo de cada pele e o piso de LOD dela, no MESMO lugar.
 *
 * Este módulo existe por um defeito que já aconteceu: `SKIN_EXTENT.pulsar` foi a 4 para enquadrar
 * o jato, e a 4 o corpo chegava com `px` abaixo do próprio `LOD_FAR_PX` — o pulsar não era
 * desenhado em distância alcançável nenhuma. Os dois números que colidiram moravam em arquivos
 * diferentes e ninguém os tinha pensado juntos. Enquanto a regra for local, ela volta na pele
 * seguinte; por isso ela está aqui, e por isso `budget()` a CHECA na carga em vez de descrevê-la.
 *
 * ## A aritmética, que é mais simples do que parece
 *
 * O tamanho aparente de um corpo é `px = k · raio / distância`, com `k = H / (2·tan(fov/2))` em
 * pixels de FRAMEBUFFER. O foco não mira uma distância: ele mira um TAMANHO, resolvendo essa
 * mesma equação para `px = FOCUS_FIT_PX` e recuando por `SKIN_EXTENT` (`scene.js`, no `fitPending`).
 * Substituindo uma na outra, o raio e o `k` se cancelam:
 *
 *     px_na_chegada = FOCUS_FIT_PX / SKIN_EXTENT
 *
 * Não depende do raio do corpo, do corpus, do monitor nem do zoom. É por isso que a colisão dá
 * para conferir por conta, sem abrir a cena — e é por isso que ela dá para OBRIGAR aqui.
 *
 * O chão do zoom é a outra ponta, e essa NÃO é livre de tela:
 *
 *     px_no_chão = k / FOCUS_FLOOR_RADII        (o piso não conhece `SKIN_EXTENT` — ver abaixo)
 *
 * ## Medido em 2026-08-06, com a cena viva (canvas 3024×1416, DPR 2, fov 80 → k = 843,8)
 *
 * | pele | extent | px na chegada | LOD_FAR | LOD_NEAR | nível na chegada |
 * |---|---|---|---|---|---|
 * | photosphere | 1 | 220 (o piso morde antes) | 90 | 200 | 1,00 |
 * | planet | 1 | 221 (idem) | 90 | 200 | 1,00 |
 * | station | 1,15 | 203 | 34 | 120 | 1,00 |
 * | pulsar | 2,6 | 97 | 26 | 100 | 0,97 |
 * | comet | 3 | 94 | 30 | 110 | 0,80 |
 * | nebula | 3,4 | 79 | 22 | 95 | 0,78 |
 *
 * ⚠️ **O medido fica ~8% do previsto porque a ÂNCORA ATRASA.** Ela persegue um corpo em órbita a
 * 2,6/s (`scene.js`), então a câmera orbita um ponto que fica ~1,2 de mundo atrás dele. De longe
 * isso é ruído; no chão do zoom é 0,75 raio sobre 3,4, e o `px` do mesmo corpo oscilou entre 202 e
 * 317 (57%) só com o corpo andando na órbita. Todo limiar a menos de ~25% de distância do `px` de
 * trabalho pisca — foi assim que a superfície do planeta piscou uma vez, por outra causa
 * (`graph.js`, a régua do sprite).
 */
import { LOD_FAR_PX as PLANET_FAR, LOD_NEAR_PX as PLANET_NEAR } from './planet.js';
import { LOD_FAR_PX as PHOTO_FAR, LOD_NEAR_PX as PHOTO_NEAR } from './photosphere.js';
import { LOD_FAR_PX as STATION_FAR, LOD_NEAR_PX as STATION_NEAR } from './station.js';
import { LOD_FAR_PX as COMET_FAR, LOD_NEAR_PX as COMET_NEAR } from './comet.js';
import { LOD_FAR_PX as PULSAR_FAR, LOD_NEAR_PX as PULSAR_NEAR } from './pulsar.js';
import { LOD_FAR_PX as NEBULA_FAR, LOD_NEAR_PX as NEBULA_NEAR } from './nebula.js';
import { SURFACE } from './solver.js';

/**
 * ZOOM SCOPED TO THE FOCUSED BODY — and why a distance in world units could never work.
 *
 * Free flight is clamped to `ZOOM_RANGE`, which is right for a camera orbiting the whole sky.
 * Locked onto a body it was wrong in a way that silently disabled a feature: the floor (12) sat
 * FARTHER than the distance focus itself flies to (7), so the first notch of the wheel pushed the
 * camera away from the very thing it had just locked onto.
 *
 * Measured on this machine before the change, with `window.espatial.planet()`:
 *
 * | body | distance | apparent radius | detail level |
 * |---|---|---|---|
 * | heaviest file, 103 chunks | 6.86 | 153px | 0.61 |
 * | median file, 4 chunks | 6.86 | 92px | 0.00 |
 *
 * `planet.js` fades the surface in from `LOD_FAR_PX` (90) and reaches full detail at
 * `LOD_NEAR_PX` (200). So the median body sat ON the threshold and showed nothing, the heaviest
 * never got past 61% of the ramp — and one wheel notch dropped the median to ~88px, under the
 * threshold entirely. The procedural surface was not hidden; it was unreachable.
 *
 * A fixed world distance cannot fix that, and this is the crux: apparent size is what decides
 * detail, and it depends on the body's RADIUS, which varies with `log2(chunks)`. The same 7 units
 * gave 92px to one body and 153px to another. So focus stops targeting a distance and starts
 * targeting an apparent size, and the floor becomes a multiple of the body's own radius.
 */
/** Apparent radius, in CSS-independent device px, the camera aims for when focus lands. */
export const FOCUS_FIT_PX = 260;
/**
 * Closest approach, in multiples of the body's visible radius.
 *
 * The number clears the RING, not the core. `catalog.js` caps the drawn span at `min(reach, 2.4)`
 * radii, and at 2.2 the camera ended up inside that shell — seen on screen: not a dramatic
 * close-up, just the ring plane cutting the frame in half.
 *
 * 3.4 nominal, and the distance actually reached is ~2.96 radii (measured): the anchor eases
 * toward a body that is orbiting, so it trails it slightly, and at close range that lag is a real
 * fraction of the distance. Still outside the 2.4 shell, with margin for the lag.
 *
 * There the core projects around 590px of apparent radius (measured), roughly 3x `LOD_NEAR_PX` —
 * full detail with room to spare. Framing the entire ring system instead would take ~5.7 radii,
 * and that is the arrival view's job (`FOCUS_FIT_PX`), not the floor's: arriving shows the body,
 * zooming in inspects it.
 *
 * ⚠️ **O piso NÃO conhece `SKIN_EXTENT`, e isso é deliberado agora que foi conferido.** Ele
 * enquadra o CORPO, então o operador que der zoom até o fim entra dentro da nebulosa (4,2 raios) e
 * atravessa a cauda do cometa (9 raios) — que é o que "inspecionar" quer dizer. Quem mudar isso
 * para `3,4 × extent` afasta o chão do zoom de toda pele grande e some com o corpo do quadro.
 */
export const FOCUS_FLOOR_RADII = 3.4;

/**
 * Quanto cada pele ocupa ALÉM do raio do corpo, em raios — o fator que o foco usa para recuar.
 *
 * Fotosfera e planeta são o corpo e valem 1 por omissão. As outras não: a nebulosa é a nuvem, não
 * o arquivo, e o cometa é a cauda tanto quanto o núcleo. O cometa recua 3 e não 9 (o comprimento
 * máximo do rastro) de propósito — a ponta da cauda é a parte que já esgarçou, e enquadrá-la
 * inteira encolheria a cabeça, que é onde está a leitura.
 *
 * ⚠️ **O pulsar foi a 4 e voltou a 2,6, e o erro foi MEDIDO.** A ideia era enquadrar o jato inteiro
 * (`SCALE.jet` chega a 16 raios) e o vento (35). Só que o recuo entra na distância de foco: a 4 o
 * corpo chegava perto do próprio `LOD_FAR_PX` e ficava com `level ≈ 0` — simplesmente não desenhado.
 *
 * A lição é a do cometa, e agora ela tem duas ocorrências: **enquadra-se a figura, não a extensão.**
 * O vento é ambiente e o jato é agulha — os dois podem (e devem) sair do quadro. Quem tem de caber
 * é o corpo com a magnetosfera, que é onde a leitura mora.
 *
 * O teto de cada pele está em `budget()`, e ele é obrigado na carga deste módulo. 2,6 no pulsar não
 * é folclore: é o MAIOR recuo que ainda chega em detalhe pleno (`260/100 = 2,6` exato).
 */
export const SKIN_EXTENT = Object.freeze({ nebula: 3.4, comet: 3, pulsar: 2.6, station: 1.15 });

/**
 * O piso e o teto de detalhe de cada pele, ao lado do recuo que a leva até lá.
 *
 * A tabela IMPORTA os números de cada módulo em vez de repeti-los. Cópia envelhece sem avisar, e
 * uma cópia aqui reproduziria exatamente o defeito que este arquivo existe para impedir.
 *
 * ⚠️ `rings.js` também exporta `LOD_FAR_PX`/`LOD_NEAR_PX` e está FORA daqui, mas não por régua —
 * ele mede a mesma grandeza desde que a régua do sprite saiu (ver o cabeçalho de `rings.js`). Está
 * fora porque o anel NÃO é pele de foco: ele existe em todo astro sujo do céu, sem `SKIN_EXTENT`,
 * então não há recuo para conferir contra o piso dele. Os números seguem comparáveis com estes.
 */
const THRESHOLD = Object.freeze({
  [SURFACE.PHOTOSPHERE]: { far: PHOTO_FAR, near: PHOTO_NEAR },
  [SURFACE.PLANET]: { far: PLANET_FAR, near: PLANET_NEAR },
  [SURFACE.STATION]: { far: STATION_FAR, near: STATION_NEAR },
  [SURFACE.COMET]: { far: COMET_FAR, near: COMET_NEAR },
  [SURFACE.PULSAR]: { far: PULSAR_FAR, near: PULSAR_NEAR },
  [SURFACE.NEBULA]: { far: NEBULA_FAR, near: NEBULA_NEAR },
});

/** `k` da projeção: quantos pixels de framebuffer vale um raio de mundo a uma unidade de distância. */
const projectionK = (fov, framebufferHeight) =>
  framebufferHeight / (2 * Math.tan((fov * Math.PI) / 360));

/**
 * O orçamento de pixel de cada pele — o que ela recebe na chegada e o que ela exige para existir.
 *
 * @param {{fov?: number, framebufferHeight?: number}} tela  a tela de verdade, quando houver uma;
 *   sem ela as colunas que dependem de monitor (`pxNoChao`, `plenoAlcancavel`) saem `null`.
 * @returns {Array<object>} uma linha por pele, do recuo maior para o menor
 */
export function budget({ fov, framebufferHeight } = {}) {
  const k = fov && framebufferHeight ? projectionK(fov, framebufferHeight) : null;
  const pxNoChao = k === null ? null : k / FOCUS_FLOOR_RADII;
  return Object.entries(THRESHOLD)
    .map(([surface, { far, near }]) => {
      const extent = SKIN_EXTENT[surface] ?? 1;
      const chegada = Math.min(FOCUS_FIT_PX / extent, pxNoChao ?? Infinity);
      return {
        surface,
        extent,
        far,
        near,
        // O que a pele recebe ao travar nela. O piso do zoom morde quando `extent` é pequeno: a
        // chegada não pode ser mais perto do que o operador consegue chegar de roda.
        pxNaChegada: +chegada.toFixed(1),
        // O maior recuo que ainda DESENHA. Passar disto é o defeito do pulsar a 4.
        extentMax: +(FOCUS_FIT_PX / far).toFixed(2),
        // O maior recuo que ainda chega em detalhe PLENO. Passar disto não quebra nada — só
        // significa que o operador tem de dar zoom para ver a pele inteira.
        extentPleno: +(FOCUS_FIT_PX / near).toFixed(2),
        chegaPleno: extent <= FOCUS_FIT_PX / near,
        // Altura de framebuffer mínima para o detalhe pleno ser ALCANÇÁVEL, em qualquer pele: no
        // chão do zoom o corpo vale `k/3,4` px, e `k` sai da tela. Numa janela 1x de 800px o
        // planeta empaca em ~35% do detalhe e nenhum zoom resolve.
        alturaMinima: fov ? Math.ceil(2 * Math.tan((fov * Math.PI) / 360) * FOCUS_FLOOR_RADII * near) : null,
        plenoAlcancavel: pxNoChao === null ? null : pxNoChao >= near,
        pxNoChao: pxNoChao === null ? null : +pxNoChao.toFixed(1),
      };
    })
    .sort((a, b) => b.extent - a.extent);
}

/*
 * A INVARIANTE É OBRIGADA AQUI, na carga, e não descrita num comentário.
 *
 * Esta base já registrou três vezes o mesmo erro — `features.surface` dizendo "a lua é ponto" sem
 * ninguém ler, `edgeOpacity` órfã no painel, o pulso com três literais em dois arquivos. Declarar
 * uma invariante não a implementa. A condição abaixo só depende de constantes, então ela nunca
 * pode disparar para quem está usando a cena: quem a vê é quem acabou de editar um dos números.
 */
for (const linha of budget()) {
  if (linha.extent < linha.extentMax) continue;
  throw new RangeError(
    `SKIN_EXTENT.${linha.surface} = ${linha.extent} põe o corpo em ` +
      `${(FOCUS_FIT_PX / linha.extent).toFixed(1)}px na chegada, e ${linha.surface} só começa a ` +
      `desenhar em LOD_FAR_PX = ${linha.far}. O teto é ${linha.extentMax} ` +
      `(= FOCUS_FIT_PX/LOD_FAR_PX). Enquadra-se a figura, não a extensão.`
  );
}
