/**
 * A paleta do planeta: cinco camadas por altitude, derivadas da COR DO TIPO, cozidas numa rampa.
 *
 * ## Por que a cor não é livre
 *
 * O catálogo é explícito: *composição decide o TIPO*, e no céu a composição é `node.kind` — é
 * dela que sai `KIND_COLORS`, a cor do ponto. O planeta procedural é o mesmo corpo visto de
 * perto; se ele escolhesse a própria paleta, o operador veria um ponto verde virar um mundo azul
 * ao aproximar a câmera, e a cor deixaria de significar alguma coisa. Então as cinco camadas
 * são DERIVADAS da cor do tipo: mesma matiz, luminâncias e saturações diferentes.
 *
 * O que sobra para a semente é um desvio pequeno de matiz (±0,02): dois `.md` continuam sendo
 * azuis e ainda assim não são o mesmo azul.
 *
 * ## Por que uma textura e não cinco `mix` no shader
 *
 * A referência (`index.html:313-331`) encadeia quatro `smoothstep` + `mix` por fragmento, com
 * `transition` e `blend` separados para cada par — treze uniformes só de cor. Aqui a mesma
 * curva é cozida uma vez em 128 téxeis e vira uma leitura de textura. É o padrão que
 * `ring-profiles.js` já usa neste projeto pelo mesmo motivo: a estrutura fica nos DADOS, onde é
 * legível e conferível, em vez de espalhada em constantes de shader.
 *
 * ⚠️ Base acromática (`memory` é branco puro) não tem matiz: `getHSL` devolve h=0, que é
 * VERMELHO, e o planeta sairia rosado sem que ninguém tivesse pedido. Abaixo de s=0,05 a matiz
 * é substituída por um azul neutro e a saturação recebe um piso — a alternativa (planeta cinza)
 * apaga a leitura de altitude junto.
 */
import * as THREE from 'three';
import { KIND_COLORS } from './graph.js';

/** Téxeis da rampa. 128 sobra: a faixa mais estreita (o pico) ocupa ~18 deles. */
const RAMP_TEXELS = 128;
/** Abaixo disto a cor do tipo não tem matiz utilizável (branco, cinza). */
const ACHROMATIC = 0.05;
/** Matiz de reserva para as bases acromáticas — azul frio, que lê como oceano. */
const NEUTRAL_HUE = 0.58;
const SATURATION_FLOOR = 0.22;

/**
 * Onde cada camada fica, em altura NORMALIZADA (0 = fundo do mar, 1 = pico mais alto).
 *
 * Normalizada de propósito: o relevo bruto varia com a massa do corpo (um arquivo pequeno é
 * cristado, um grande é liso), e com posições absolutas a linha de costa subiria e desceria
 * conforme o tamanho do arquivo. Em altura relativa, todo planeta tem praia no mesmo lugar da
 * própria escala.
 */
const BANDS = [0.0, 0.16, 0.3, 0.55, 0.86];
/** Largura da transição entre camadas, na mesma escala. Uma só — a referência tem quatro. */
const BLEND = 0.09;

/**
 * Até onde a superfície ainda é MOLHADA — usado pelo especular do shader.
 *
 * Coincide com a banda da costa: acima dela é rocha e rocha não espelha. É o par visual do
 * mar, e é o que distingue "azul porque é fundo" de "azul porque é água".
 */
export const WET_EDGE = BANDS[2];

/**
 * A cor do CREPÚSCULO, e ela é fixa de propósito — não sai do tipo do nó.
 *
 * O céu de um planeta é azul porque o espalhamento Rayleigh vai com λ⁻⁴; o pôr do sol é
 * alaranjado porque, rasante, a linha de visada atravessa tanto ar que o azul já foi todo
 * espalhado para fora dela. As duas cores são consequências do MESMO mecanismo em caminhos
 * ópticos diferentes, e o lado quente é o que sobra depois da subtração — ele não é livre para
 * seguir a paleta do corpo.
 *
 * Valor tirado do exemplo oficial `webgpu_tsl_earth` do three.js (`atmosphereTwilightColor`).
 */
export const TWILIGHT = 0xbc490b;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * As cinco camadas, do fundo do mar ao pico, a partir do tipo e da semente.
 *
 * @param {string} kind   `node.kind` — a composição, que no catálogo decide o TIPO
 * @param {number} seed   0…1 determinístico, tirado do caminho do arquivo
 * @returns {THREE.Color[]}
 */
export function planetPalette(kind, seed) {
  const base = new THREE.Color(KIND_COLORS[kind] ?? KIND_COLORS.other);
  const hsl = base.getHSL({ h: 0, s: 0, l: 0 });
  const chromatic = hsl.s > ACHROMATIC;
  const hue = chromatic ? hsl.h : NEUTRAL_HUE;
  const sat = Math.max(hsl.s, SATURATION_FLOOR);
  // Desvio pequeno o bastante para não trocar a família de cor, grande o bastante para dois
  // arquivos do mesmo tipo não saírem idênticos.
  const drift = (seed - 0.5) * 0.04;

  const layer = (dh, ds, l) =>
    new THREE.Color().setHSL((hue + drift + dh + 1) % 1, clamp01(sat * ds), clamp01(l));

  return [
    // Mar profundo: mais saturado e quase sem luz — é o que dá o contraste com a terra.
    layer(-0.03, 1.3, 0.09),
    // Plataforma: a mesma água, rasa.
    layer(-0.015, 1.15, 0.26),
    // Costa: dessaturada e clara, o análogo de areia/sedimento.
    layer(0.035, 0.5, 0.5),
    // Terra alta: matiz do tipo, escura. É aqui que a cor do nó fica mais reconhecível.
    layer(0.0, 0.85, 0.31),
    // Pico: quase acromático. Serve de referência de brilho para o olho calibrar o resto.
    layer(0.0, 0.16, 0.8),
  ];
}

/**
 * A cor do CÉU daquele planeta: a água rasa, clareada.
 *
 * Não é arbitrário que as duas se pareçam — num planeta com atmosfera, o mar é azul em boa
 * parte porque reflete o céu. Amarrá-las mantém a leitura do tipo também no limbo, que é onde
 * a atmosfera aparece.
 */
export function skyColor(colors) {
  return colors[1].clone().lerp(new THREE.Color(0xffffff), 0.45);
}

/**
 * A paleta cozida numa rampa 1D — `t` de 0 (fundo do mar) a 1 (pico).
 *
 * 256 bytes por planeta. Reconstruída só quando tipo ou semente mudam; quem chama guarda a
 * chave, porque no céu o nó focado troca com o clique e não com o quadro.
 *
 * @param {THREE.Color[]} colors  as cinco camadas de `planetPalette`
 * @returns {THREE.DataTexture}
 */
export function rampTexture(colors) {
  const data = new Uint8Array(RAMP_TEXELS * 4);
  const mixed = new THREE.Color();

  for (let i = 0; i < RAMP_TEXELS; i++) {
    const t = (i + 0.5) / RAMP_TEXELS;
    mixed.copy(colors[0]);
    // A mesma cadeia de `mix` da referência, só que na CPU e uma vez — o shader não paga nada.
    for (let band = 1; band < colors.length; band++) {
      const edge = BANDS[band];
      const x = clamp01((t - (edge - BLEND)) / (2 * BLEND));
      mixed.lerp(colors[band], x * x * (3 - 2 * x));
    }
    data[i * 4] = Math.round(clamp01(mixed.r) * 255);
    data[i * 4 + 1] = Math.round(clamp01(mixed.g) * 255);
    data[i * 4 + 2] = Math.round(clamp01(mixed.b) * 255);
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, RAMP_TEXELS, 1, THREE.RGBAFormat);
  // Sem repetição: `t` já vem preso a [0,1] e um wrap aqui faria o pico encostar no fundo do
  // mar num téxel — uma linha branca no meio do oceano, que é como esse defeito aparece.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
