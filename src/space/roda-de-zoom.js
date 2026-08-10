/**
 * Quanto UM evento de roda vale em raio de órbita.
 *
 * A roda não entrega um gesto: entrega uma sequência de eventos cujo `deltaY` carrega **quanto** o
 * dedo andou. Ler só o SINAL desse número descarta a única grandeza que o dispositivo mediu, e o
 * resultado é um zoom que responde ao NÚMERO DE EVENTOS em vez de responder ao gesto — dois
 * dispositivos com a mesma intenção produzem velocidades que diferem por duas ordens de grandeza.
 *
 * Três coisas falham em silêncio aqui, e nenhuma delas dá erro na tela:
 *
 * 1. ☠️ **MAGNITUDE DESCARTADA.** Um entalhe de mouse chega como um evento de `deltaY ≈ 100`; um
 *    trackpad chega como ~60 eventos por segundo de `deltaY ≈ 2 a 10`. Um passo fixo por evento
 *    trata os dois igual, então o trackpad anda ~60 passos no tempo em que o mouse anda um.
 * 2. ☠️ **PASSO LINEAR NÃO VOLTA.** `× (1 + k)` e `× (1 − k)` não são inversos: com `k = 0,08` o
 *    par ida-e-volta devolve `1,08 × 0,92 = 0,9936`, e a câmera fica 0,64% mais perto a cada
 *    vaivém. Vinte vaivéns comem 12% da distância sem ninguém ter pedido zoom nenhum. Só a forma
 *    EXPONENCIAL é reversível, e é por isso que o fator é uma potência.
 * 3. ☠️ **`deltaMode` LIDO COMO PIXEL.** O Firefox reporta em LINHAS (`deltaY ≈ 3` por entalhe).
 *    Dividir esse 3 pela régua de pixel dá 0,12% de raio por entalhe — zoom que não anda, sem
 *    sintoma além de "não funciona no Firefox".
 *
 * ## De onde saem os números
 *
 * `FATOR_POR_ENTALHE` é a resposta do `OrbitControls` do three.js (r171, `_getZoomScale`:
 * `pow(0.95, zoomSpeed · |delta|/100)`) com o `zoomSpeed = 0,8` do app de referência — ou seja
 * `0,95^0,8 = 0,959796`, **−4,02% de raio por entalhe**. É a única constante aqui com procedência de fora;
 * as outras são as réguas do próprio `WheelEvent`.
 *
 * ⚠️ **Isto é o TAMANHO do passo, nunca a suavidade.** Quem amortece é a cena (`RATE.zoom` em
 * `scene.js`, convergência exponencial em 1/s); confundir os dois faz procurar em `smooth` um
 * defeito que mora aqui, e vice-versa.
 *
 * Módulo PURO: sem `three`, sem DOM, sem cena — recebe os dois campos do evento e devolve um
 * número. Exercitado por `scripts/lei-roda.mjs`.
 */

/** `WheelEvent.deltaMode` — a unidade em que o dispositivo reportou. */
export const MODO = Object.freeze({ PIXEL: 0, LINHA: 1, PAGINA: 2 });

/**
 * Teto de entalhes num ÚNICO evento.
 *
 * Um trackpad entrega frações de entalhe; um entalhe de mouse é 1. O que passa daqui não é gesto —
 * é pico de inércia, driver estranho ou `deltaMode` mal lido. Quatro entalhes já são −15,1% de raio
 * num quadro só, e o clamp da cena continua sendo a parede absoluta atrás deste.
 */
export const TETO_ENTALHES = 4;

/**
 * Quanto de cada unidade faz UM entalhe.
 *
 * `PIXEL` 100 é o entalhe de mouse do Chrome/Safari e é a mesma régua do three.js (`delta · 0,01`).
 * `LINHA` 3 é o padrão do Firefox por entalhe.
 * ⚠️ `PAGINA` não tem medida aqui — é modo raro. Uma página satura o teto, que é o mesmo que dizer
 * "o evento mais rápido que este módulo aceita": degrada anunciando, em vez de virar um número
 * inventado com cara de régua.
 */
const POR_ENTALHE = Object.freeze([100, 3, 1 / TETO_ENTALHES]);

/** −4,02% de raio por entalhe. Ver a procedência no cabeçalho. */
export const FATOR_POR_ENTALHE = Math.pow(0.95, 0.8);

/**
 * Quantos entalhes este evento vale, já normalizado pelo dispositivo e limitado pelo teto.
 *
 * @param {number} deltaY
 * @param {number} deltaMode
 * @returns {number} entalhes ≥ 0 — o sentido não mora aqui
 */
export function entalhesDe(deltaY, deltaMode) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  // Modo desconhecido cai em PIXEL: é o que 99% dos navegadores reportam, e o teto segura o resto.
  const regua = POR_ENTALHE[deltaMode] ?? POR_ENTALHE[MODO.PIXEL];
  return Math.min(Math.abs(deltaY) / regua, TETO_ENTALHES);
}

/**
 * Por quanto MULTIPLICAR o raio de órbita alvo por causa deste evento.
 *
 * Rolar para baixo (`deltaY > 0`) AFASTA — fator > 1. Para cima aproxima. Evento sem movimento é a
 * identidade, nunca um passo mínimo: gesto de zero pixels não é gesto.
 *
 * @param {{deltaY: number, deltaMode?: number}} evento
 * @returns {number} multiplicador do raio
 */
export function fatorDeZoom({ deltaY, deltaMode = MODO.PIXEL }) {
  const entalhes = entalhesDe(deltaY, deltaMode);
  if (entalhes === 0) return 1;
  const aproximar = Math.pow(FATOR_POR_ENTALHE, entalhes);
  return deltaY > 0 ? 1 / aproximar : aproximar;
}
