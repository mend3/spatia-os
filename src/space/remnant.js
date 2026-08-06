/**
 * REMANESCENTE — a nebulosidade da supernova, em geometria própria.
 *
 * Ela já existe dentro do sprite do astro (`graph.js`, `envelope()` sobre `gl_PointCoord`), e de
 * longe é lá que ela deve continuar: um quad por corpo quente custaria 27 desenhos para uma coisa
 * que ocupa poucos pixels. Este módulo existe pelo outro extremo.
 *
 * ## O defeito que ele conserta
 *
 * `gl_PointSize` satura no teto de 511 do driver. O raio de MUNDO do corpo não satura — foi essa
 * separação que tornou o planeta procedural alcançável (`graph.js:starRadius`). Só que a
 * nebulosidade continuou morando dentro do sprite: ao aproximar, a fotosfera crescia e a casca
 * parava em 511 px. Um corpo quente no zoom máximo ficava com a estrela transbordando o próprio
 * remanescente, que é a leitura oposta da que o objeto tem de dar.
 *
 * A correção é a mesma que o anel já usa: quem vive em pixel fica em pixel, quem vive em mundo
 * ganha geometria. Aqui o quad é escalado pelo raio VISÍVEL do astro, e o `gl_PointSize` deixa de
 * participar.
 *
 * ## Uma forma só, nos dois lugares
 *
 * O GLSL do envoltório vem de `graph.js` (`ENVELOPE_GLSL`) em vez de ser reescrito aqui — duas
 * cópias dariam duas nebulosas para o mesmo astro, iguais até o dia em que alguém mexesse num
 * lado. E o sprite apaga a dele por `vHalo`, o MESMO fator que já abre o núcleo para a superfície:
 * a troca acontece de uma vez só, e nunca há as duas somadas.
 *
 * ⚠️ É billboard, não casca esférica. Remanescente real é uma concha oca e vista de fora ela lê
 * como um disco preenchido de qualquer ângulo — o que o `envelope()` desenha. Uma esfera de
 * verdade custaria transparência ordenada por profundidade para ganhar nada visível.
 */
import * as THREE from 'three';
import { ENVELOPE_GLSL } from './graph.js';
import { VISIBLE_CORE } from './rings.js';

/**
 * Meia-extensão do quad, em raios do disco visível do astro.
 *
 * `ENV_OUTER` é 1,0 em unidades de `gl_PointCoord`, onde 1 é a borda do sprite e `VISIBLE_CORE`
 * (0,6) é o disco do corpo. Logo o envoltório chega a `1/0,6 = 1,67` raios do corpo — e os lobos
 * (`ENV_LOBES = 0,22`) o empurram a 2,03. O quad precisa cobrir o pior caso, senão o contorno
 * ondulado seria CORTADO em reta, que é a única borda que este efeito não pode ter.
 */
const SPAN = 2.1 / VISIBLE_CORE / 2;

const VERTEX = /* glsl */ `
  varying vec2 vPc;
  void main(){
    // O quad vai de -1 a 1 em XY, entao a posicao JA e a coordenada do envoltorio: nao ha
    // conversao para errar, e ela e a mesma que o sprite entrega em gl_PointCoord.
    vPc = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uSeed;
  uniform float uAmount;
  uniform float uSpan;
  varying vec2 vPc;

${ENVELOPE_GLSL}

  void main(){
    // Desfaz a folga do quad: o envoltorio tem de ver a MESMA escala de pc que ve no sprite,
    // senao a nebulosa mudaria de tamanho ao trocar de desenho.
    vec2 pc = vPc * uSpan;
    float fill = envelope(pc, uSeed) * uAmount * ENV_GAIN;
    if (fill < 0.004) discard;
    gl_FragColor = vec4(uColor * fill, fill);
  }
`;

/**
 * O remanescente do astro em foco. Um só existe por cena — como a fotosfera e o planeta.
 *
 * @returns {{object: THREE.Mesh, update: Function, dispose: Function}}
 */
export function createRemnant() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uSeed: { value: 0 },
      uAmount: { value: 0 },
      // `SPAN` é meia-extensão em raios do corpo; o shader quer o fator que devolve `pc` à régua
      // do sprite, que é `SPAN · VISIBLE_CORE`.
      uSpan: { value: SPAN * VISIBLE_CORE },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    /*
     * SEM TESTE DE PROFUNDIDADE, e isso não é preguiça de ordenar — é o que o objeto é.
     *
     * O envoltório é uma concha OCA: material dela está na frente do astro e atrás dele, e a
     * parte da frente some se um teste de profundidade a comparar com a esfera da fotosfera.
     * Medido: com teste ligado, todo o miolo brilhante (`pc < 0,6`, que é onde `envelope()` vale
     * de 1 a 0,43) ficava atrás da esfera e sobrava só um aro fino no limbo — a nebulosidade
     * virava contorno, que é exatamente a leitura de ANEL que o `envelope()` foi reescrito duas
     * vezes para não dar.
     *
     * No sprite isso nunca apareceu porque lá casca e núcleo são o MESMO fragmento, somados antes
     * de virar cor. Trazer a casca para geometria trouxe junto uma pergunta que o sprite não
     * tinha de responder.
     */
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const object = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  object.visible = false;
  // Depois de tudo, já que não testa profundidade: aditivo desenhado cedo seria coberto pelo
  // que vier a escrever profundidade por cima.
  object.renderOrder = 10;
  // A nebulosa é maior que o corpo e o envolve: sem isto o frustum a descartaria justamente
  // quando o corpo enche a tela e o centro do quad sai do volume.
  object.frustumCulled = false;

  return {
    object,

    /**
     * Põe o remanescente sobre o astro, ou o apaga com `amount = 0`.
     *
     * @param {THREE.Vector3} position  posição do astro, em MUNDO
     * @param {number} radius           raio do disco VISÍVEL do astro, em mundo (o mesmo que a
     *   fotosfera recebe — é o que garante que os dois não descolem)
     * @param {number} amount           `supernova` do nó × o quanto a geometria já assumiu
     * @param {number} seed             `graph.starSeed(node)` — a MESMA que o sprite usa
     * @param {number} color            cor do `kind`, em hex
     * @param {THREE.Camera} camera     para o billboard encarar a câmera
     */
    update(position, radius, amount, seed, color, camera) {
      material.uniforms.uAmount.value = amount;
      object.visible = amount > 0.004;
      if (!object.visible) return;
      material.uniforms.uSeed.value = seed;
      material.uniforms.uColor.value.set(color);
      object.position.copy(position);
      object.scale.setScalar(radius * SPAN);
      // Billboard pela orientação da câmera, não por `lookAt`: `lookAt` daria roll diferente a
      // cada pose e o contorno ondulado giraria sozinho — movimento sem evento por trás.
      object.quaternion.copy(camera.quaternion);
    },

    dispose() {
      object.geometry.dispose();
      material.dispose();
    },
  };
}
