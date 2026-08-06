/**
 * O PULSO — a energia que o quasar solta, e ela ACELERA até estourar.
 *
 * ## O que estava errado antes
 *
 * A primeira versão desenhou as ALÇAS DE CAMPO da ilustração clássica, como linhas. Era uma
 * leitura literal da imagem errada: naquele diagrama as curvas são a *representação* da emissão,
 * um esquema didático — não uma estrutura que se veja. Desenhar o esquema é desenhar a legenda.
 * O que se observa é a EMISSÃO, e emissão de quasar não é geometria parada: é energia que sai.
 *
 * ## A lei do pulso: dobra até explodir
 *
 * `r = (2^(n·f) − 1) / (2^n − 1)`, com `f` a fração do ciclo. Ela sai de zero devagar e a
 * velocidade DOBRA a cada `1/n` do ciclo — a última fração percorre metade de todo o caminho, que
 * é o estouro. Uma rampa linear daria uma onda de velocidade constante, que lê como anel que
 * cresce; uma potência daria aceleração sem a explosão no fim. Exponencial é a única das três em
 * que a coisa toda parece se soltar do corpo.
 *
 * Normalizada de propósito: com qualquer `n`, `f=0` cai em 0 e `f=1` cai em 1. Mudar a violência
 * do estouro não muda o alcance, e as duas coisas ficam independentes.
 *
 * ## A textura é a da nebulosa, e isso não é economia
 *
 * `1 − |simplex3|` — a mesma crista que faz o filamento da nebulosa. Plasma emitido e nuvem de
 * emissão são o mesmo material em regimes diferentes, então usar a mesma assinatura visual é o
 * que diz isso na tela. O que muda é a geometria: lá o campo preenche um volume parado, aqui ele
 * viaja numa casca.
 */
import * as THREE from 'three';
import { GLSL_SIMPLEX3 } from './planet-noise.js';

/**
 * Segundos por ciclo. Pedido em 10 — e o número tem de ser longo: um pulso que se repete depressa
 * lê como piscar de LED, e o que se quer é um evento com começo, aceleração e fim.
 */
const PERIOD = 10;

/**
 * Quantas vezes a velocidade dobra ao longo do ciclo.
 *
 * Com 5, a última décima parte do tempo cobre 44% do caminho. Menos que isso e a saída não é
 * "lenta"; muito mais e o pulso fica invisível parado no centro por 9 s e cruza a tela num quadro.
 */
const DOUBLINGS = 5;

const VERTEX = /* glsl */ `
  varying vec2 vPc;
  void main(){
    vPc = (uv - 0.5) * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  ${GLSL_SIMPLEX3}
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uTime;
  uniform float uSeed;
  uniform float uPhase;
  varying vec2 vPc;

  void main(){
    float d = length(vPc);
    if (d > 1.0) discard;

    // Raio da casca neste instante. uPhase ja vem com a lei exponencial aplicada (ver o modulo):
    // o shader so posiciona, quem acelera e o JS — assim a lei fica legivel num lugar so.
    float r = uPhase;

    /*
     * A CASCA ENGROSSA conforme viaja: o material se dispersa, entao a frente deixa de ser fina.
     * Sem isto o pulso e um anel de espessura constante, que le como onda de agua.
     */
    float grossura = 0.06 + r * 0.34;
    float casca = exp(-pow((d - r) / grossura, 2.0));

    /*
     * FILAMENTO, a mesma crista da nebulosa (1 - |ruido|). O campo e amostrado em POLAR e nao em
     * cartesiano: preso ao angulo, o padrao viaja PARA FORA junto com a casca em vez de a casca
     * deslizar por cima de uma textura parada. E a diferenca entre energia emitida e um anel
     * passando na frente de um papel de parede.
     */
    float ang = atan(vPc.y, vPc.x);
    vec3 q = vec3(cos(ang) * 2.6, sin(ang) * 2.6, uSeed * 5.0 + r * 3.0);
    float grande = 1.0 - abs(simplex3(q));
    float fino = 1.0 - abs(simplex3(q * 2.9 + vec3(0.0, 0.0, uTime * 0.35)));
    float fio = pow(grande * mix(1.0, fino, 0.55), 2.0);

    /*
     * O BRILHO CAI COM O RAIO porque a mesma energia cobre uma casca maior — em 2D, 1/r. E some
     * na borda do quad para o retangulo nao aparecer. Perto do corpo o pulso satura, que e o
     * clarao do momento em que ele nasce.
     */
    float queda = 1.0 / max(r, 0.08);
    float fill = casca * fio * queda * uAmount * 0.32;
    fill *= smoothstep(1.0, 0.82, d);
    if (fill < 0.004) discard;

    // Branco na frente da onda, cor do corpo na esteira: o que acabou de ser emitido esta mais
    // quente que o que ja se espalhou.
    float frente = smoothstep(r - grossura * 0.4, r + grossura * 0.2, d);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), frente * 0.55) * fill, fill);
  }
`;

/**
 * O pulso de emissão do quasar. Um por cena, como as outras peles.
 *
 * @returns {{object: THREE.Object3D, update: Function, dispose: Function}}
 */
export function createPulse() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uPhase: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // Emissão: aditiva e sem teste de profundidade, como o feixe, a coma e o remanescente. A
    // metade de trás da casca continua visível atrás do corpo, que é o que faz dela uma esfera
    // de energia e não um disco na frente.
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.visible = false;

  return {
    object: mesh,

    /**
     * @param {number} scale    alcance do pulso, em raios do corpo
     * @param {number} level    nível de detalhe, 0…1
     * @param {number} elapsed  relógio da cena
     * @param {number} seed
     * @param {THREE.Color|number} color
     * @param {THREE.Camera} camera
     * @param {boolean} reduced
     */
    update(scale, level, elapsed, seed, color, camera, reduced = false) {
      mesh.visible = level > 0.002;
      if (!mesh.visible) return;

      material.uniforms.uColor.value.set(color);
      material.uniforms.uAmount.value = level;
      material.uniforms.uSeed.value = seed;
      material.uniforms.uTime.value = reduced ? 0 : elapsed;

      /*
       * A fase é `f(relógio)`, sem estado acumulado — a lei do `motion-catalog.js`. O deslocamento
       * por `seed` existe para que dois quasares na mesma cena não estourem no mesmo instante;
       * sincronizados, o céu inteiro pisca junto e lê como falha de render.
       */
      const f = reduced ? 0.42 : ((elapsed / PERIOD) + seed) % 1;
      material.uniforms.uPhase.value =
        (2 ** (DOUBLINGS * f) - 1) / (2 ** DOUBLINGS - 1);

      mesh.scale.setScalar(scale);
      if (camera) mesh.quaternion.copy(camera.quaternion);
    },

    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
