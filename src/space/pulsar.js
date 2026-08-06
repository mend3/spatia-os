/**
 * PULSAR — o corpo de um arquivo de INFRAESTRUTURA.
 *
 * ## O que o distingue não é o corpo, são os feixes
 *
 * Uma estrela de nêutrons tem ~10 km de raio: em qualquer escala em que o resto da cena caiba,
 * ela é um ponto. O que se observa de um pulsar não é a superfície — é a EMISSÃO polar, dois
 * cones de rádio saindo dos polos magnéticos, e o pulso existe porque o eixo magnético não bate
 * com o de rotação. O feixe varre o observador uma vez por volta, como um farol.
 *
 * Essa desalinhação é obrigatória: com os dois eixos alinhados o feixe apontaria sempre para o
 * mesmo lugar e não haveria pulso nenhum. Aqui ela é `obliquity`, e é o único parâmetro sem o
 * qual o corpo deixa de ser um pulsar.
 *
 * ## Por que infraestrutura
 *
 * Infra é o que bate em ritmo fixo e sustenta o resto: healthcheck, cron, deploy. O corpo que
 * carrega essa leitura é o que emite em período rigoroso — pulsares são os relógios mais estáveis
 * conhecidos. A frequência sai da MASSA, e ao contrário do resto do céu ela é INVERSA: pulsar
 * jovem e massivo gira devagar e desacelera, milissegundo é o velho reciclado. Arquivo pequeno
 * de infra pisca rápido; arquivo grande, devagar.
 *
 * ⚠️ Os feixes são cones aditivos e SEM teste de profundidade, como o remanescente e a coma: são
 * emissão, não sólido. Com teste, o cone que aponta para trás sumiria atrás do corpo, e um pulsar
 * com um feixe só lê como defeito de desenho.
 */
import * as THREE from 'three';

/** Onde o pulsar começa a aparecer e onde satura, em pixels de raio. */
export const LOD_FAR_PX = 26;
export const LOD_NEAR_PX = 100;

/** Comprimento do feixe, em raios do corpo. Curto demais não lê como feixe; longo demais some da tela. */
const BEAM_LENGTH = 6.5;
/** Período de rotação, em segundos: rápido para o corpo leve, lento para o pesado. */
const SPIN_PERIOD = { fast: 0.9, slow: 4.2 };

const hash01 = (text, salt) => {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
};

const VERTEX = /* glsl */ `
  varying float vAlong;
  varying float vRadial;
  void main(){
    // A geometria poe o APICE em y=0 (no corpo) e a base em y=1 (ver createPulsar). vAlong e a
    // fracao percorrida; vRadial e a distancia ao eixo em fracao do raio DAQUELA altura, e sem
    // ele o feixe fica com borda lateral reta e le como faixa chapada em vez de luz.
    vAlong = position.y;
    vRadial = length(position.xz) / max(position.y, 1e-4);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAmount;
  varying float vAlong;
  varying float vRadial;
  void main(){
    // A emissao cai ao longo do feixe: o cone se abre e a mesma energia cobre mais area. Sem esta
    // queda o feixe termina numa borda reta, que le como cone SOLIDO e nao como luz.
    float aoLongo = pow(clamp(1.0 - vAlong, 0.0, 1.0), 1.6);
    // E cai TAMBEM do eixo para a borda: feixe de radio nao tem parede. Ao quadrado para o miolo
    // concentrar, que e o que da a leitura de facho e nao de fatia.
    float doEixo = pow(clamp(1.0 - vRadial, 0.0, 1.0), 2.0);
    float fill = aoLongo * doEixo * uAmount;
    if (fill < 0.004) discard;
    gl_FragColor = vec4(uColor * fill, fill);
  }
`;

/**
 * Parâmetros do pulsar de um nó. Puro e congelado.
 *
 * @param {{source?: string, id?: string, chunks?: number, massRank?: number}} node
 * @param {number} color
 */
export function pulsarParams(node = {}, color = 0xffffff) {
  const path = node.source ?? node.id ?? 'sem-caminho';
  const seed = hash01(path, 43);
  const seedB = hash01(path, 47);
  const massa = Number.isFinite(node.massRank)
    ? node.massRank
    : THREE.MathUtils.clamp(Math.log2(1 + (node.chunks || 1)) / 8, 0, 1);

  return Object.freeze({
    seed,
    /** Corpo pequeno: o que se vê de um pulsar é o feixe, não a superfície. */
    core: 0.22 + massa * 0.14,
    /**
     * Período em segundos. INVERSO da massa, ao contrário do resto do céu — e é a física: pulsar
     * jovem e massivo é lento, o de milissegundo é o velho reciclado por acreção.
     */
    period: THREE.MathUtils.lerp(SPIN_PERIOD.fast, SPIN_PERIOD.slow, massa),
    /**
     * ÂNGULO ENTRE O EIXO MAGNÉTICO E O DE ROTAÇÃO. Sem ele não há pulso.
     *
     * Alinhados, o feixe aponta sempre para o mesmo lugar e o corpo vira uma lâmpada acesa. A
     * faixa (18° a 78°) evita os dois degenerados: quase alinhado quase não pulsa, e a 90° os
     * dois feixes passam juntos e o ritmo dobra sem querer.
     */
    obliquity: THREE.MathUtils.lerp(0.32, 1.36, seed),
    /** Inclinação do eixo de rotação no espaço — senão todo pulsar giraria no mesmo plano. */
    tilt: (seedB - 0.5) * 1.4,
    yaw: seed * Math.PI * 2,
    beam: BEAM_LENGTH * (0.7 + seedB * 0.6),
    color,
  });
}

/**
 * O pulsar do astro em foco. Um por cena, como as outras peles.
 */
export function createPulsar() {
  const group = new THREE.Group();
  group.visible = false;

  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), coreMat);
  group.add(core);

  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uAmount: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  /*
   * O EIXO MAGNÉTICO é um grupo próprio, inclinado dentro do eixo de ROTAÇÃO.
   *
   * Os dois feixes penduram nele, opostos. Girar o grupo externo (rotação) faz o interno
   * (magnético) varrer um cone — que é exatamente o mecanismo do farol, e sai da hierarquia sem
   * nenhuma trigonometria escrita à mão.
   */
  const eixoRotacao = new THREE.Group();
  const eixoMagnetico = new THREE.Group();
  eixoRotacao.add(eixoMagnetico);
  group.add(eixoRotacao);

  const feixes = [];
  for (const lado of [1, -1]) {
    /*
     * ÁPICE NO CORPO, base longe — e a primeira versão fez o contrário.
     *
     * `ConeGeometry` nasce com o ápice em +y e a base em −y. Assim o feixe saía LARGO no corpo e
     * fechava numa ponta ao longe, que é a silhueta de um funil e não de um farol: a luz sai de
     * um ponto e se abre. `rotateX(π)` inverte, e o `translate` põe o ápice na origem para
     * `position.y` valer direto como fração percorrida no shader.
     */
    const geo = new THREE.ConeGeometry(1, 1, 16, 1, true);
    geo.rotateX(Math.PI);
    geo.translate(0, 0.5, 0);
    const feixe = new THREE.Mesh(geo, beamMat);
    feixe.frustumCulled = false;
    feixe.renderOrder = 9;
    if (lado < 0) feixe.rotation.z = Math.PI;
    feixes.push(feixe);
    eixoMagnetico.add(feixe);
  }

  return {
    object: group,

    /**
     * @param {object} params  de `pulsarParams`
     * @param {number} px      raio aparente do corpo
     * @param {number} elapsed relógio da cena
     * @param {boolean} reduced  `prefers-reduced-motion` — congela a varredura
     * @returns {number} nível de detalhe aplicado, 0…1
     */
    update(params, px, elapsed, reduced = false) {
      const level = THREE.MathUtils.clamp((px - LOD_FAR_PX) / (LOD_NEAR_PX - LOD_FAR_PX), 0, 1);
      group.visible = level > 0.002;
      if (!group.visible) return 0;

      core.scale.setScalar(params.core);
      coreMat.color.set(params.color);
      coreMat.opacity = level;

      beamMat.uniforms.uColor.value.set(params.color);
      beamMat.uniforms.uAmount.value = 0.55 * level;
      // O raio da base é a ABERTURA do feixe; a altura é o alcance. Separados porque um facho
      // estreito e longo e um curto e aberto são pulsares diferentes.
      const abertura = params.beam * 0.17;
      for (const feixe of feixes) feixe.scale.set(abertura, params.beam, abertura);

      group.rotation.set(params.tilt, params.yaw, 0);
      eixoMagnetico.rotation.z = params.obliquity;
      /*
       * A rotação CONGELA com movimento reduzido, e não é o parâmetro que congela: é o RELÓGIO.
       *
       * Zerar a obliquidade alinharia os feixes ao eixo e o corpo deixaria de ser um pulsar —
       * a mesma regra que o `bob` e o `spin` seguem no `motion-catalog.js`. Parado, ele fica
       * apontando para um lado, que é um instante legítimo da varredura.
       */
      eixoRotacao.rotation.y = reduced ? 0 : (elapsed / params.period) * Math.PI * 2;
      return level;
    },

    dispose() {
      core.geometry.dispose();
      coreMat.dispose();
      for (const feixe of feixes) feixe.geometry.dispose();
      beamMat.dispose();
    },
  };
}
