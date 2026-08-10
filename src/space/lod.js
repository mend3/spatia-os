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
import { LOD_FAR_PX as PLANET_FAR, LOD_NEAR_PX as PLANET_NEAR, BODY_SPAN as PLANET_BODY } from './planet.js';
import {
  LOD_FAR_PX as PHOTO_FAR,
  LOD_NEAR_PX as PHOTO_NEAR,
  BODY_SPAN as PHOTO_BODY,
} from './photosphere.js';
import {
  LOD_FAR_PX as STATION_FAR,
  LOD_NEAR_PX as STATION_NEAR,
  BODY_SPAN as STATION_BODY,
} from './station.js';
import { LOD_FAR_PX as COMET_FAR, LOD_NEAR_PX as COMET_NEAR, BODY_SPAN as COMET_BODY } from './comet.js';
import { LOD_FAR_PX as PULSAR_FAR, LOD_NEAR_PX as PULSAR_NEAR, BODY_SPAN as PULSAR_BODY } from './pulsar.js';
import { LOD_FAR_PX as NEBULA_FAR, LOD_NEAR_PX as NEBULA_NEAR, BODY_SPAN as NEBULA_BODY } from './nebula.js';
import { SUPERFICIE } from './superficies.js';

/**
 * ZOOM SCOPED TO THE FOCUSED BODY — and why a distance in world units could never work.
 *
 * Free flight is clamped to `ZOOM_RANGE`, which is right for a camera orbiting the whole sky.
 * Locked onto a body it was wrong in a way that silently disabled a feature: the floor (12) sat
 * FARTHER than the distance focus itself flies to (7), so the first notch of the wheel pushed the
 * camera away from the very thing it had just locked onto.
 *
 * Measured on this machine before the change, with `window.spatia.planet()`:
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
 * ⚠️ **E o pulsar foi de 2,6 a 1,2 em 2026-08-07, porque 2,6 aplicava a lição pela metade.**
 *
 * 2,6 era o pior caso do VENTO com margem (`pulsar.js`: vento 1,23–2,28 raios de âncora) — ou seja,
 * ainda enquadrava a extensão, não a figura. O preço estava no corpo: `corpo = FOCUS_FIT_PX/extent`
 * punha o pulsar em 100 px na chegada contra os 260 de uma fotosfera, e a 100 ele não se LÊ.
 * Medido na bancada em 2026-08-07, descendo o `px` degrau a degrau com `nível 1,000` em todos:
 * 164 vira um ponto · 181 mostra só o toro · 199 mostra o toro com as pontas difusas · 241 é a
 * estrela de pontas cheia. A cena entregava 87 (medido) — abaixo do degrau em que há o que ver.
 *
 * **O que autoriza descer: o círculo de enquadramento NÃO é a borda do quadro.** `FOCUS_FIT_PX`
 * mira 260 px, e a meia-altura do framebuffer desta tela é 798 — 3,07× de folga. A 1,2 o vento do
 * corpo mais pesado cai em 495 px, 62% da meia-altura: fora do círculo de ajuste, dentro do quadro.
 * O corpo sobe para 217 na chegada (189 medido, com o atraso de âncora de 0,87 desta cena), que é
 * a faixa em que o toro e as pontas existem.
 *
 * O custo, para quem for reverter saber o que se comprou: a folga de zoom cai de 2,80× para 1,29×
 * (`pxNoChao` 280 ÷ chegada 217), então "chegar mostra, zoom inspeciona" quase encosta neste corpo.
 *
 * O teto de cada pele está em `budget()`, e ele é obrigado na carga deste módulo. O teto do pulsar
 * é 10 (`260/26`) e o de detalhe pleno é 2,6 (`260/100`) — 1,2 passa nos dois com folga.
 */
/*
 * ⚠️ **E o COMETA foi de 3 a 1,6 em 2026-08-07, pela mesma lição, com a escada medida.**
 *
 * A 3 ele chegava com `260/3 = 87` px de corpo (medido: 82–91) — e a bancada responde o que isso
 * custa, descendo o `px` degrau a degrau no espécime `COROA SOB A PELE`: em 259 e 175 a cauda tem
 * GRÃO e a coma se separa dela; em 131 o grão some e a cauda vira um borrão liso; em 99, 87 e 76 a
 * cabeça inteira é um ponto com um risco. O cometa arrivava abaixo do degrau em que ele se lê.
 *
 * A figura aqui é a CABEÇA — núcleo (0,14–0,30) mais coma (0,9–2,4), média 1,65. A cauda vai a 9
 * raios e é ambiente: ela pode e deve sair do quadro, exatamente como o vento do pulsar. 1,6
 * enquadra a coma média e põe o corpo em 162 px, dentro da faixa que a escada aprova.
 *
 * O que se compra e o que se paga: `chegaPleno` passa (teto 2,36 = 260/110) e a cauda de um corpo
 * ativo cai em `9/1,6 × 260` = 1.463 px, muito além da meia-altura (742) — ou seja, ela sai do
 * quadro inteira nos cometas mais ativos. Era isso ou continuar enquadrando a extensão.
 */
export const SKIN_EXTENT = Object.freeze({ nebula: 3.4, comet: 1.6, pulsar: 1.2, station: 1.15 });

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
  [SUPERFICIE.FOTOSFERA]: { far: PHOTO_FAR, near: PHOTO_NEAR },
  [SUPERFICIE.PLANETA]: { far: PLANET_FAR, near: PLANET_NEAR },
  [SUPERFICIE.ESTACAO]: { far: STATION_FAR, near: STATION_NEAR },
  [SUPERFICIE.COMETA]: { far: COMET_FAR, near: COMET_NEAR },
  [SUPERFICIE.PULSAR]: { far: PULSAR_FAR, near: PULSAR_NEAR },
  [SUPERFICIE.NEBULOSA]: { far: NEBULA_FAR, near: NEBULA_NEAR },
});

/**
 * Quanto do raio de referência cada pele preenche com CORPO — importado, nunca copiado.
 *
 * ⚠️ **Não confunda com `SKIN_EXTENT`, e a confusão custaria a coroa aprovada.** `SKIN_EXTENT` é o
 * RECUO do enquadramento; este número é o TAMANHO do que a pele desenha. Eles discordam em quase
 * toda pele: estação recua 1,15 e desenha 0,92 (menor que o corpo); pulsar recua 1,2 e o vento
 * vai a 2,28; cometa recua 3 e a cauda vai a 9. Decidir pela coroa por `SKIN_EXTENT > 1` tiraria
 * a coroa da ESTAÇÃO, que é justamente a pose aprovada no olho em 2026-08-07.
 */
export const BODY_SPAN = Object.freeze({
  [SUPERFICIE.FOTOSFERA]: PHOTO_BODY,
  [SUPERFICIE.PLANETA]: PLANET_BODY,
  [SUPERFICIE.ESTACAO]: STATION_BODY,
  [SUPERFICIE.COMETA]: COMET_BODY,
  [SUPERFICIE.PULSAR]: PULSAR_BODY,
  [SUPERFICIE.NEBULOSA]: NEBULA_BODY,
});

/**
 * O PISO DA COROA — abaixo dele o sprite cede inteiro sob a pele.
 *
 * ## A medida que o escolheu (2026-08-07, cena viva, fb 3024×1484, driver `[1, 511]`)
 *
 * O sprite do astro em foco tem o miolo esvaziado até `d = 0,62` e morre em `d = 1,0`, o que põe a
 * coroa entre **1,03 e 1,67 raios do corpo** — mas só enquanto o ponto não bate no teto do driver.
 * Passado ele (`px > 153`), a coroa externa vira `255,5/px` raios, e na chegada isso é
 * `0,98 × SKIN_EXTENT`. Medido em cada pele: fotosfera `px` 263 → 0,97 (a coroa nem sai de dentro
 * do corpo: o perfil radial cai de 187 para 10 na silhueta e não há NADA além dela), estação 209
 * → 1,10–1,22 (a atmosfera aprovada), cometa 82–91 e nebulosa 73–81 → 1,67 cheios.
 *
 * A coroa é atmosfera quando há SUPERFÍCIE logo abaixo dela e disputa a leitura quando não há.
 * `0,8` separa os dois grupos com folga de 3× para os dois lados — estação 0,92 de um lado,
 * cometa 0,30 do outro — então ele não é um limiar afinado, é um vão.
 *
 * ⚠️ **Crescer o sprite não era saída.** Para a coroa cair FORA da pele o raio pedido seria
 * `SKIN_EXTENT × px/0,6` = `FOCUS_FIT_PX/0,6` = **433 px de framebuffer em qualquer pele** (o
 * `extent` cancela, pela mesma aritmética do topo deste arquivo), contra os 255,5 que o driver
 * entrega. Falta 1,70×, e não há botão: o teto é do rasterizador. Crescer por `aSize`/`uSize`
 * tampouco serve — `starRadius` lê os dois e o CORPO cresceria junto (medido: `px` 191 → 30 ao
 * mexer no `nodeSize`).
 */
const CROWN_FLOOR = 0.8;

/**
 * Esta pele mantém a coroa do sprite, ou o sprite cede inteiro sob ela?
 *
 * @param {string} surface  um valor de `SUPERFICIE`
 * @returns {boolean} `true` = sobra a coroa (a pele é o corpo); `false` = o sprite sai
 */
export const keepsCrown = (surface) => (BODY_SPAN[surface] ?? 0) >= CROWN_FLOOR;

/** `k` da projeção: quantos pixels de framebuffer vale um raio de mundo a uma unidade de distância. */
const projectionK = (fov, framebufferHeight) => framebufferHeight / (2 * Math.tan((fov * Math.PI) / 360));

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
for (const surface of Object.keys(THRESHOLD)) {
  if (Number.isFinite(BODY_SPAN[surface])) continue;
  throw new RangeError(
    `A pele ${surface} tem escada de LOD e não declara BODY_SPAN. Sem ele, keepsCrown() cairia no ` +
      `padrão silencioso e a coroa do sprite decidiria por omissão — que é o defeito que ` +
      `SKIN_EXTENT já cometeu ao ser usado como tamanho de pele. Exporte BODY_SPAN no módulo.`
  );
}

for (const linha of budget()) {
  if (linha.extent < linha.extentMax) continue;
  throw new RangeError(
    `SKIN_EXTENT.${linha.surface} = ${linha.extent} põe o corpo em ` +
      `${(FOCUS_FIT_PX / linha.extent).toFixed(1)}px na chegada, e ${linha.surface} só começa a ` +
      `desenhar em LOD_FAR_PX = ${linha.far}. O teto é ${linha.extentMax} ` +
      `(= FOCUS_FIT_PX/LOD_FAR_PX). Enquadra-se a figura, não a extensão.`
  );
}

/*
 * A SEGUNDA INVARIANTE, e ela estava CALCULADA aqui sem ninguém obrigá-la.
 *
 * `chegaPleno` existia como campo do `budget()` desde que este módulo nasceu — e "existe desenho"
 * (o laço acima) é um piso baixo demais: o cometa passava nele com folga de 2,9x e mesmo assim
 * chegava em `level` 0,80, a nebulosa em 0,74. Chegar num corpo e recebê-lo pela metade é o
 * defeito que o pulsar pagou em 2026-08-07, e ele não era detectável por este arquivo justamente
 * porque o número certo estava impresso e não lido. Declarar uma invariante não a implementa — a
 * quarta vez que esta base escreve isso.
 *
 * ⚠️ Quem for afrouxar: há DUAS saídas por pele e elas não são intercambiáveis. Baixar
 * `SKIN_EXTENT` quando a figura cabe mais perto (foi o cometa: a cauda é ambiente) ou baixar
 * `LOD_NEAR_PX` quando a régua do módulo pede mais corpo do que a figura precisa (foi a nebulosa:
 * a nuvem vale 3 a 5 raios do corpo, então 95 px de CORPO eram ~400 px de NUVEM). Escolher a
 * errada some com a figura do quadro ou entrega detalhe que ninguém vê.
 */
for (const linha of budget()) {
  if (linha.chegaPleno) continue;
  throw new RangeError(
    `SKIN_EXTENT.${linha.surface} = ${linha.extent} põe o corpo em ` +
      `${(FOCUS_FIT_PX / linha.extent).toFixed(1)}px na chegada, e ${linha.surface} só fecha o ` +
      `detalhe em LOD_NEAR_PX = ${linha.near}: a pele nasce em nível ` +
      `${((FOCUS_FIT_PX / linha.extent - linha.far) / (linha.near - linha.far)).toFixed(2)} e o ` +
      `chão do zoom não conserta (é o mesmo enquadramento). O teto é ${linha.extentPleno} ` +
      `(= FOCUS_FIT_PX/LOD_NEAR_PX) — ou baixe o recuo, ou baixe a régua do módulo.`
  );
}
