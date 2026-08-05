/**
 * Campo estelar de fundo — a matéria-prima que a lente dobra.
 *
 * Sem estrelas atrás do núcleo a lente gravitacional não teria o que deformar, e o efeito
 * mais caro do sistema ficaria invisível. Por isso as estrelas são distribuídas numa casca
 * esférica **grande e completa**, inclusive atrás da câmera: o que aparece dobrado ao redor
 * do horizonte é justamente o que está do outro lado dele.
 *
 * Um único `Points` com atributos por vértice: 2600 estrelas em um draw call. Cintilação e
 * paralaxe acontecem no shader, não em JavaScript — mexer em 2600 posições por quadro na
 * CPU derrubaria o frame budget que o resto da cena precisa.
 */
import * as THREE from 'three';

const COUNT = 2600;
const SHELL_MIN = 90;
const SHELL_MAX = 340;

const VERTEX = /* glsl */ `
  uniform float uTime, uSize, uTwinkle, uBrightness, uScale;
  attribute float aSeed;
  attribute float aScale;
  attribute vec3 aTint;
  varying float vAlpha;
  varying vec3 vTint;

  void main(){
    vTint = aTint;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);

    // Cintilacao: fase propria por estrela, senao o ceu inteiro pisca junto.
    float flicker = 0.72 + 0.28 * sin(uTime * (0.5 + aSeed * 2.4) + aSeed * 42.0);
    vAlpha = mix(1.0, flicker, uTwinkle) * aScale * uBrightness;

    gl_Position = projectionMatrix * viewPosition;

    /*
     * Atenuacao por distancia. uScale e metade da altura do canvas em pixel FISICO — a mesma
     * constante que o three usa em sizeAttenuation, nao uma escolha estetica.
     *
     * Aqui havia 200.0 fixo. Com a casca em z de 90 a 340 isso dava 0,3px de ponto, e o piso
     * engolia: TODAS as 2600 estrelas saiam clampadas no mesmo valor. Multiplicador antes de
     * um max() que sempre vence nao multiplica nada — era por isso que o slider de TAMANHO
     * nao movia um pixel, e nao por falta de fiacao.
     *
     * NAO use crase em comentario aqui: ela fecha este template literal e o modulo inteiro
     * vira SyntaxError. Ja aconteceu duas vezes neste arquivo.
     */
    gl_PointSize = max(uSize * aScale * (uScale / -viewPosition.z), 1.4);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying vec3 vTint;
  void main(){
    // Ponto redondo com queda suave; quadrado aparece imediatamente em tela grande.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.0, 1.0, d);
    // Expoente 2.8 e fator 0.3 vinham de quando o ponto tinha varios pixels para espalhar
    // luz. Num ponto de 1,4px eles somam abaixo do discard e o ceu fica preto.
    float intensity = pow(core, 1.5) * vAlpha;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(vTint * intensity, intensity);
  }
`;

// Classes espectrais, enviesadas para o frio: céu com muita estrela quente parece falso.
const TINTS = [
  [0.62, 0.72, 1.0],
  [0.78, 0.86, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.93, 0.78],
  [1.0, 0.78, 0.6],
];

export function createStars() {
  const positions = new Float32Array(COUNT * 3);
  const tints = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const scales = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    // Distribuição uniforme na esfera: sortear θ e φ direto acumula estrelas nos polos.
    const u = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const planar = Math.sqrt(1 - u * u);
    const radius = SHELL_MIN + Math.random() * (SHELL_MAX - SHELL_MIN);

    positions[i * 3] = Math.cos(angle) * planar * radius;
    positions[i * 3 + 1] = u * radius;
    positions[i * 3 + 2] = Math.sin(angle) * planar * radius;

    /*
     * Expoente < 1 empurra para o FIM da lista (o frio), que é o que o comentário sempre pediu.
     *
     * Com 1.7 acontecia o contrário: `P(índice 0) = 0.2^(1/1.7) ≈ 0.40`, ou seja **40% do campo
     * estelar era azul** — classe O/B, que na população real é ~0.7%. Mesmo o céu a olho nu, já
     * enviesado por luminosidade, não passa de ~30% de azul-branco. Um céu 40% azul lê como
     * protetor de tela, não como céu.
     */
    const tint = TINTS[Math.floor(Math.pow(Math.random(), 0.45) * TINTS.length)];
    tints.set(tint, i * 3);
    seeds[i] = Math.random();
    // Potência alta = poucas estrelas brilhantes, muitas fracas. É o que dá profundidade.
    scales[i] = 0.3 + Math.pow(Math.random(), 3.6) * 0.95;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 1.05 },
      // Preenchido no primeiro quadro; o valor inicial só evita um NaN se algo ler antes.
      uScale: { value: 500 },
      uTwinkle: { value: 1 },
      uBrightness: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const tune = { drift: 1 };

  return {
    object: points,
    update(delta, elapsed) {
      material.uniforms.uTime.value = elapsed;
      /*
       * Lido do viewport a cada quadro em vez de por listener de resize.
       *
       * Deliberado: o canvas é a tela inteira, a leitura é de duas propriedades já em cache no
       * browser, e evita que este módulo precise conhecer o renderer — que é justamente o
       * arquivo que outra mão está editando agora.
       */
      material.uniforms.uScale.value = (window.innerHeight * (window.devicePixelRatio || 1)) / 2;
      // Deriva lentíssima: dá vida ao fundo sem competir com o disco por atenção.
      points.rotation.y += delta * 0.004 * tune.drift;
      points.rotation.x += delta * 0.0015 * tune.drift;
    },

    /**
     * Afinação. O espaçamento é escala do objeto inteiro, não regeneração das posições:
     * reconstruir 2600 vértices a cada movimento de slider engasgaria exatamente no gesto
     * em que a resposta tem que ser imediata.
     */
    tune(values) {
      points.scale.setScalar(values.starSpread);
      material.uniforms.uSize.value = 1.05 * values.starSize;
      material.uniforms.uBrightness.value = values.starBrightness;
      tune.drift = values.starDrift;
    },
    /** Erro faz o céu tremer: as estrelas piscam fora de fase, como interferência. */
    setUnstable(on) {
      material.uniforms.uTwinkle.value = on ? 2.4 : 1;
    },
  };
}
