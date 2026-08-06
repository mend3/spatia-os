/**
 * VENTO RELATIVÍSTICO — a nuvem de partículas em volta, e ela nunca fica parada.
 *
 * ## O que ela é
 *
 * Um pulsar despeja um vento de pares elétron-pósitron a velocidade próxima à da luz. Ele não é
 * colimado como o jato de um núcleo ativo: sai por toda a magnetosfera, mais denso perto do plano
 * equatorial (onde as linhas de campo fecham) e mais rápido nos polos. É a estrutura que faz um
 * remanescente como o Caranguejo brilhar — e visualmente é o que separa "esfera com cones" de um
 * corpo que ocupa uma região do espaço.
 *
 * ## Por que partículas e não mais um billboard
 *
 * A cena já tem três billboards de emissão (coma, nebulosa, pulso). Mais um seria outra mancha
 * macia, e o que falta aqui é justamente GRANULARIDADE — o vento é feito de coisas discretas, e o
 * olho lê partícula como matéria e mancha como luz. É a mesma decisão que a cauda do cometa tomou
 * quando deixou de ser malha.
 *
 * ## Tudo é `f(relógio)`, como o resto
 *
 * Cada partícula tem uma fase e uma direção fixas no buffer; o raio sai de uma função fechada do
 * tempo. Nenhum buffer é reescrito por quadro — a mesma lei do `motion-catalog.js` que o
 * escoamento da cauda segue.
 */
import * as THREE from 'three';

/**
 * Quantas partículas.
 *
 * 900 é onde a nuvem deixa de ler como punhado de pontos e ainda é irrisório: o céu já move 468
 * nós e as duas caudas do cometa somam 520. Um corpo por cena paga isso sem aparecer no quadro.
 */
const COUNT = 900;

const VERTEX = /* glsl */ `
  attribute vec3 aDir;
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  uniform float uReach;
  uniform float uBeat;
  uniform float uPixel;
  varying float vT;

  void main(){
    // Fracao do ciclo desta particula. fract() a recicla no corpo quando ela chega ao fim, e como
    // as fases nascem uniformes o ensemble e estacionario — a nuvem nao incha nem esvazia.
    float s = fract(aPhase + uTime * 0.11);
    /*
     * O vento SAI acelerando e depois coasta: sqrt poe muita particula longe e pouca perto, que e
     * o contrario do que se quer numa nuvem ligada ao corpo. Expoente 1.6 mantem a densidade alta
     * perto da magnetosfera e rarefaz para fora, que e o perfil de um vento em expansao livre.
     */
    float r = pow(s, 1.6) * uReach;

    /*
     * ANISOTROPIA: mais rapido nos polos, mais denso no equador.
     *
     * O vento de um pulsar nao e esferico — as linhas de campo fechadas seguram o plasma perto do
     * plano equatorial e as abertas o soltam pelos polos. Alongar o raio ao longo do eixo Y (o
     * eixo magnetico, no referencial deste grupo) e a aproximacao barata dessa forma, e e o que
     * da a cintura que se ve nas imagens.
     */
    vec3 p = aDir * r;
    p.y *= 1.0 + 0.55 * (1.0 - abs(aDir.y));

    // A nuvem RESPIRA junto com o resto: uBeat e o mesmo batimento que pulsa o nucleo e o halo.
    p *= mix(0.94, 1.06, uBeat);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    /*
     * ⚠️ TETO NO TAMANHO DO PONTO, e sem ele o navegador TRAVA.
     *
     * gl_PointSize = tamanho/z nao tem limite superior: a camera chega perto, -mv.z vai a
     * decimos, e cada um dos 900 pontos vira um quad de milhares de pixels. Sao 900 quads
     * aditivos de tela cheia por quadro — overdraw de centenas de vezes a resolucao, e a GPU para.
     *
     * 48 px e generoso para uma particula de vento (o corpo inteiro tem ~260 px de raio no zoom
     * maximo) e limita o pior caso a 900 x 48^2 = 2,1 M fragmentos, cerca de duas telas. O piso de
     * 1 px continua do outro lado, pelo motivo oposto: ponto sub-pixel cintila.
     */
    gl_PointSize = clamp(aSize * (1.0 - s * 0.7) * uPixel / max(-mv.z, 0.001), 1.0, 48.0);
    vT = s;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uNear;
  uniform vec3 uFar;
  uniform float uAmount;
  varying float vT;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float disco = pow(max(1.0 - d, 0.0), 1.6);
    // Densidade cai para fora: a mesma massa numa casca maior. E a particula ESFRIA indo embora —
    // do azul eletrico perto do corpo ao roxo apagado na borda, que e a rampa sincrotron em
    // miniatura.
    float fill = disco * pow(1.0 - vT, 1.6) * uAmount;
    if (fill < 0.003) discard;
    gl_FragColor = vec4(mix(uNear, uFar, vT) * fill, fill);
  }
`;

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * O vento do pulsar em foco. Um por cena.
 *
 * @returns {{object: THREE.Object3D, update: Function, dispose: Function}}
 */
export function createWind() {
  const geometry = new THREE.BufferGeometry();
  const dir = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);
  const posicoes = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i += 1) {
    /*
     * Direção uniforme na ESFERA, e a amostragem importa.
     *
     * `z = 2u − 1` seguido de `ρ = √(1 − z²)` distribui igual por área; sortear os três eixos
     * independentes concentraria nos vértices de um cubo, e a nuvem ganharia oito bicos que
     * nenhuma física explica. É o mesmo cuidado que o jitter da cauda do cometa tomou.
     */
    const z = hash(i * 3 + 1) * 2 - 1;
    const fi = hash(i * 3 + 2) * Math.PI * 2;
    const rho = Math.sqrt(Math.max(1 - z * z, 0));
    dir.set([rho * Math.cos(fi), z, rho * Math.sin(fi)], i * 3);
    phase[i] = (i + 0.5) / COUNT;
    size[i] = 0.4 + hash(i * 3 + 3) * 0.9;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNear: { value: new THREE.Color(0x6fd0ff) },
      uFar: { value: new THREE.Color(0x5a2b8a) },
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uReach: { value: 1 },
      uBeat: { value: 0.5 },
      // Pixel de FRAMEBUFFER sobre z, a mesma régua do sprite de astro e da cauda do cometa. É a
      // quinta vez que este projeto escreve esta linha, e a quinta vez que ela é a mesma conta.
      uPixel: { value: 300 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const pontos = new THREE.Points(geometry, material);
  pontos.frustumCulled = false;
  pontos.renderOrder = 6;
  pontos.visible = false;

  return {
    object: pontos,

    /**
     * @param {number} reach   alcance do vento, em raios do corpo
     * @param {number} level   nível de detalhe, 0…1
     * @param {number} elapsed
     * @param {number} beat    batimento 0…1, compartilhado com o núcleo e o halo
     * @param {boolean} reduced
     */
    update(reach, level, elapsed, beat, reduced = false) {
      /*
       * O vento entra a `level²`: de longe são 900 pontos de 1 px somando um borrão uniforme em
       * volta do corpo, o que apaga o feixe em vez de acrescentar. Perto, ele é a região que o
       * corpo ocupa.
       */
      const forca = level * level;
      pontos.visible = forca > 0.004;
      if (!pontos.visible) return;
      material.uniforms.uAmount.value = 0.5 * forca;
      material.uniforms.uTime.value = reduced ? 0 : elapsed;
      material.uniforms.uReach.value = reach;
      material.uniforms.uBeat.value = reduced ? 0.5 : beat;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
