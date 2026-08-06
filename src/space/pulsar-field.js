/**
 * LINHAS DE CAMPO MAGNÉTICO — o que torna um pulsar reconhecível sem legenda.
 *
 * ## Por que isto existe
 *
 * O corpo era "um círculo com cones", e a queixa é justa: cone saindo de esfera é a silhueta de
 * uma lanterna, não a de uma estrela de nêutrons. Em toda ilustração de pulsar — a do diagrama
 * clássico com o eixo de rotação em verde, a do PSR B1257+12 com os filamentos azuis — o que
 * carrega a leitura são as ALÇAS DE CAMPO fechando de polo a polo. Elas são a razão de o feixe
 * existir: a emissão é colimada porque o campo dipolar canaliza o plasma pelos polos magnéticos.
 * Desenhar o feixe sem o campo é mostrar o efeito e esconder a causa.
 *
 * ## A curva é a do dipolo, não uma elipse bonita
 *
 * Numa linha de campo de um dipolo, `r = L · sen²θ`, com θ medido do eixo magnético e `L` o raio
 * máximo da alça (no equador). É uma família de um parâmetro só: mude `L` e a alça inteira escala.
 * A consequência que se vê na tela e que uma elipse não daria: as linhas saem dos polos APERTADAS
 * e paralelas ao eixo — que é exatamente por onde o feixe sai — e abrem no equador. As alças
 * aninhadas do diagrama são a mesma curva com `L` diferente, e é assim que elas são geradas aqui.
 *
 * ⚠️ Elas penduram no EIXO MAGNÉTICO, junto com os feixes — não no de rotação. Se ficassem no de
 * rotação, o feixe varreria por fora do próprio campo que o produz, e a obliquidade (que é a única
 * razão de haver pulso) deixaria de ter sentido visual.
 */
import * as THREE from 'three';

/**
 * Quantas alças, e em quantos tamanhos.
 *
 * 8 azimutes é o que o diagrama clássico mostra e o que basta para a gaiola ler como volume em vez
 * de como duas curvas cruzadas. Dois tamanhos dão o aninhamento — uma família de um parâmetro só é
 * invisível quando se desenha um membro dela.
 */
const AZIMUTHS = 8;
const SIZES = Object.freeze([1.0, 0.62]);

/**
 * Amostras por alça.
 *
 * A curvatura toda está perto dos polos, onde `sen²θ` sai de zero. 40 põe o maior erro de corda
 * abaixo de 1% do raio da alça, e a linha tem 1 px de espessura — abaixo disso nada muda na tela.
 */
const SAMPLES = 40;

/**
 * θ não vai de 0 a π: nos extremos a linha converge para o corpo e sobreporia o núcleo com 8
 * traços chegando ao mesmo pixel, o que lê como estrela de sarjeta. A margem começa a alça já
 * fora da superfície.
 */
const THETA_MARGIN = 0.16;

/**
 * A gaiola de campo de um pulsar. Uma por cena, como o resto das peles.
 *
 * @returns {{object: THREE.Object3D, update: Function, dispose: Function}}
 */
export function createFieldCage() {
  const group = new THREE.Group();

  const material = new THREE.LineBasicMaterial({
    color: 0xbcd8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // Emissão, como o feixe e a coma: a alça de trás continua visível atrás do corpo. Com teste
    // de profundidade a gaiola viraria meia gaiola, que lê como recorte.
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  for (let a = 0; a < AZIMUTHS; a += 1) {
    const phi = (a / AZIMUTHS) * Math.PI * 2;
    for (const L of SIZES) {
      const pontos = new Float32Array(SAMPLES * 3);
      for (let s = 0; s < SAMPLES; s += 1) {
        const theta = THETA_MARGIN + (s / (SAMPLES - 1)) * (Math.PI - 2 * THETA_MARGIN);
        const sin = Math.sin(theta);
        // r = L·sen²θ. O eixo magnético é o Y local, que é onde os feixes também penduram.
        const r = L * sin * sin;
        const rho = r * sin;
        pontos.set([rho * Math.cos(phi), r * Math.cos(theta), rho * Math.sin(phi)], s * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pontos, 3));
      const linha = new THREE.Line(geometry, material);
      linha.frustumCulled = false;
      linha.renderOrder = 8;
      group.add(linha);
    }
  }

  return {
    object: group,

    /**
     * @param {number} scale  raio da maior alça, em raios do corpo
     * @param {number} level  nível de detalhe, 0…1
     */
    update(scale, level) {
      /*
       * A gaiola entra TARDE, e é de propósito.
       *
       * A `level³` ela é invisível na metade de baixo da faixa de LOD e só aparece quando o corpo
       * já enche a tela. São 16 linhas de 1 px: à distância em que o pulsar tem 30 px de raio elas
       * se somam num borrão que compete com o feixe, que é a figura principal. Perto, elas viram
       * a estrutura que explica de onde o feixe sai.
       */
      material.opacity = 0.3 * level * level * level;
      group.visible = material.opacity > 0.004;
      group.scale.setScalar(scale);
    },

    dispose() {
      for (const linha of group.children) linha.geometry.dispose();
      material.dispose();
    },
  };
}
