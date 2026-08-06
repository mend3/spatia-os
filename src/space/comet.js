/**
 * COMETA — o corpo de um SCRIPT, e o único do céu que aponta para algum lado.
 *
 * ## A feição que o define não é o núcleo, é a direção
 *
 * Todo outro corpo desta cena é isotrópico: gire a câmera e a silhueta é a mesma. O cometa não —
 * a cauda aponta para LONGE da fonte de radiação, sempre, e é por isso que ela não segue o
 * movimento do corpo. Um cometa indo embora do Sol viaja com a cauda na frente. Essa é a
 * assinatura, e é o que o separa das outras peles à primeira vista.
 *
 * Aqui a fonte é o NÚCLEO da cena — o buraco negro é o único corpo emissivo, e `planet.js` já
 * ilumina os planetas a partir dele. A cauda sai radialmente para fora, e como o raio orbital é o
 * eixo do tempo, ela aponta para o passado do corpus. Sai de graça e é fiel.
 *
 * ## As três partes, e por que três
 *
 * | parte | o que é | de onde vem |
 * |---|---|---|
 * | **núcleo** | corpo sólido pequeno e escuro | `chunks` |
 * | **coma** | a atmosfera de gás que ele solta | `churn` — script mexido está ativo |
 * | **cauda** | o gás varrido para longe da fonte | comprimento por `churn`, direção pela órbita |
 *
 * E a cauda ESCOA: as partículas saem do núcleo, aceleram e esgarçam na ponta, num ciclo em que o
 * íon corre o dobro da poeira (`MOTION.cometOutflow`). Sem isso ela era uma forma parada com uma
 * ondulação por cima — e o que faz um cometa parecer vivo não é a onda, é a perda de massa.
 *
 * Núcleo real de cometa tem albedo ~0,04 (mais escuro que carvão): o que se vê da Terra é a coma,
 * não o corpo. Por isso o núcleo aqui é pequeno e opaco e o brilho todo está no gás.
 *
 * ⚠️ Nada aqui é geometria de volume: a coma é billboard aditivo e a cauda é `THREE.Points`. Cauda
 * real é rarefeita a ponto de ser transparente em qualquer direção; uma malha sólida daria a ela
 * uma borda, e borda é o que o `envelope()` do remanescente foi reescrito duas vezes para não ter.
 */
import * as THREE from 'three';
import { MOTION } from './motion-catalog.js';

/** Onde o cometa começa a aparecer e onde satura, em pixels de raio. */
export const LOD_FAR_PX = 30;
export const LOD_NEAR_PX = 110;

/**
 * Comprimento máximo da cauda, em raios do núcleo.
 *
 * Caudas reais chegam a 1 UA — dezenas de milhões de raios do núcleo. Aqui o limite é a tela: 9
 * raios já sai do quadro no enquadramento em que o corpo tem 110px, e mais que isso só empurraria
 * a cauda inteira para fora sem acrescentar leitura.
 */
const TAIL_MAX = 9;

const hash01 = (text, salt) => {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
};

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Quantas partículas por cauda.
 *
 * 260 é onde o rastro deixa de ler como pontilhado e ainda não custa nada — são 520 vértices no
 * total das duas caudas, contra os 468 nós que o céu inteiro já move por quadro.
 */
const TAIL_PARTICLES = 260;

const TAIL_VERTEX = /* glsl */ `
  attribute float aPhase;
  attribute vec3 aJitter;
  attribute float aSize;
  uniform float uLength;
  uniform float uSpread;
  uniform float uCurve;
  uniform float uTime;
  uniform float uFlow;
  uniform float uPixel;
  varying float vT;
  varying float vBorn;

  void main(){
    /*
     * A particula e colocada AQUI, e nao num buffer reescrito por quadro.
     *
     * O caminho e funcao fechada da fase da particula e do relogio — a mesma lei do
     * motion-catalog.js. Sem estado acumulado, a cauda cai sempre igual no mesmo instante e
     * nenhuma atualizacao de buffer acontece por quadro: o escoamento inteiro e UMA uniform.
     */

    // ESCOAMENTO. s e a fracao do ciclo desde que esta particula deixou o nucleo; fract() faz quem
    // sai pela ponta reaparecer no corpo. As fases nascem uniformes, entao fract() as mantem
    // uniformes: a cauda escoa sem mudar de forma nem de densidade (ver MOTION.cometOutflow).
    float s = fract(aPhase + uTime * uFlow);

    /*
     * Distancia ao QUADRADO do tempo desde a soltura, que e aceleracao constante — e e o que a
     * pressao de radiacao faz com o gas: ele sai devagar do nucleo e ganha velocidade indo embora.
     *
     * De quebra devolve a densidade que a versao estatica ja tinha (perto do nucleo denso, ponta
     * esgarcada), porque com uTime = 0 isto e exatamente o aT = ((i+0.5)/N)^2 de antes.
     */
    float t = s * s;

    // Nasce no nucleo em vez de PISCAR ali. Sem esta rampa, a particula que morreu na ponta
    // (opacidade ~0) reaparece com brilho maximo no quadro seguinte.
    vBorn = smoothstep(0.0, 0.05, s);

    // Ao longo do eixo. A poeira fica para tras (uCurve > 0 encurva), o ion vai reto.
    vec3 p = vec3(t * uLength, 0.0, 0.0);

    // A cauda ABRE: o gas se dispersa, entao o espalhamento cresce com a distancia. Sem isto ela
    // le como fio, e cauda de cometa nao e fio.
    float abre = uSpread * t;
    p += aJitter * abre;

    /*
     * TURBULENCIA: nunca perfeitamente reta. Duas frequencias, e agora um campo FIXO no espaco que
     * a particula ATRAVESSA, em vez de uma onda que desliza sozinha.
     *
     * Deslizar era o unico movimento que a cauda tinha antes do escoamento existir, e por isso ela
     * ondulava como bandeira presa ao mastro: o gas nao ia a lugar nenhum. Com a particula andando,
     * o termo de tempo aqui viraria um tremor por cima do transporte — duas leituras de movimento
     * competindo. Sem ele, o rastro serpenteia porque o gas percorre um canal torto, que e o que
     * turbulencia de jato parece vista de fora.
     */
    float onda = sin(t * 7.0 + aJitter.y * 6.28) * 0.5
               + sin(t * 17.0 + aJitter.z * 6.28) * 0.22;
    p.y += onda * abre * 0.55;
    p.z += cos(t * 9.0 + aJitter.x * 6.28) * abre * 0.4;

    // A cauda de POEIRA fica para tras da de ions: as particulas sao pesadas e conservam parte do
    // momento orbital, entao ela ARQUEIA. E a diferenca visivel entre as duas.
    p.z += uCurve * t * t;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // A particula encolhe ao longo do rastro E com a distancia da camera, como qualquer ponto.
    gl_PointSize = max(aSize * (1.0 - t * 0.82) * uPixel / max(-mv.z, 0.001), 1.0);
    vT = t;
  }
`;

const TAIL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAmount;
  varying float vT;
  varying float vBorn;
  void main(){
    // Disco macio: particula com borda dura le como confete.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float disco = pow(max(1.0 - d, 0.0), 1.8);
    // Densidade cai ao longo do rastro. Quadratica, nao linear — cauda que termina reta lia como
    // faixa desenhada. E a mesma queda APAGA a particula antes de ela reciclar: quem chega na ponta
    // ja esta invisivel, entao o salto de volta ao nucleo nao tem o que mostrar.
    float fill = disco * pow(1.0 - vT, 1.7) * vBorn * uAmount;
    if (fill < 0.004) discard;
    gl_FragColor = vec4(uColor * fill, fill);
  }
`;

const COMA_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAmount;
  varying vec2 vUv;
  void main(){
    /*
     * Coma e NEBLINA, nao bola.
     *
     * Ela envolve o nucleo e o esconde parcialmente — e o que faz a transicao do corpo para a
     * cauda ser gradual em vez de abrupta. Com expoente alto (2,4) ela virava um disco solido de
     * borda quase definida, e o cometa lia como esfera brilhante com pontos ao lado. 1,4 espalha
     * o mesmo total por uma area maior, que e o que neblina faz.
     */
    float d = length((vUv - 0.5) * 2.0);
    float fill = pow(max(1.0 - d, 0.0), 1.4) * uAmount * 0.55;
    if (fill < 0.004) discard;
    gl_FragColor = vec4(uColor * fill, fill);
  }
`;

/**
 * Parâmetros do cometa de um nó. Puro e congelado.
 *
 * @param {{source?: string, id?: string, chunks?: number, churn?: number}} node
 * @param {number} color  a cor que o céu já usa para este tipo de conhecimento
 */
export function cometParams(node = {}, color = 0xffffff) {
  const path = node.source ?? node.id ?? 'sem-caminho';
  const seed = hash01(path, 37);
  const chunks = Number.isFinite(node.chunks) ? node.chunks : 1;
  const churn = Number.isFinite(node.churn) ? node.churn : 0;

  /*
   * ATIVIDADE é o que faz um cometa ser um cometa.
   *
   * Cometa só tem coma e cauda quando está perto do Sol o bastante para sublimar; longe, ele é
   * um bloco escuro indistinguível de um asteroide. O análogo aqui é `churn`: script mexido está
   * volatilizando, script parado é rocha. E isso não é metáfora solta — é o mesmo campo que
   * decide a mancha da fotosfera, usado para a mesma coisa (atividade), o que mantém a leitura
   * coerente entre as peles.
   */
  const atividade = THREE.MathUtils.clamp(Math.log2(1 + churn) / Math.log2(1 + 27), 0, 1);

  return Object.freeze({
    seed,
    /*
     * Núcleo PEQUENO, e a primeira versão errou nisso.
     *
     * Albedo real de núcleo cometário é ~0,04 — mais escuro que carvão. O que se vê da Terra é a
     * coma; o corpo em si é invisível a olho nu mesmo em passagens próximas. Desenhado a 0,34–0,64
     * raios ele dominava a imagem e o cometa lia como pedra com um facho saindo, em vez de gás com
     * um caroço dentro. 0,14–0,3 devolve a proporção: a coma é 3 a 8 vezes o núcleo.
     */
    nucleus: 0.14 + Math.min(Math.log2(1 + chunks) * 0.028, 0.16),
    coma: 0.9 + atividade * 1.5,
    tail: TAIL_MAX * (0.22 + atividade * 0.78),
    amount: 0.25 + atividade * 0.75,
    /*
     * DUAS CAUDAS, e elas não são decoração — são feitas de coisas diferentes.
     *
     * A de ÍONS é gás ionizado, leve: o vento estelar a empurra direto para longe da fonte, então
     * ela é reta e estreita, e a cor vem do CO⁺ (azul-ciano). A de POEIRA é grão sólido, pesado:
     * conserva parte do momento orbital e fica para trás, o que a arqueia, e ela só reflete a luz
     * da estrela — branca-amarelada. Ver as duas ao mesmo tempo é o que torna um cometa
     * inconfundível, e é por isso que uma cauda só nunca ia bastar.
     *
     * ⚠️ A diferença mais visível entre elas agora é a VELOCIDADE, não a curvatura: o íon escoa em
     * 2,2 s e a poeira em 4,6 s (`MOTION.cometOutflow.periods`), porque uma é empurrada pelo vento
     * estelar e a outra só pela pressão de radiação sobre grão pesado. Ver as duas correndo em
     * ritmos diferentes é o que finalmente as separa a olho — parada, a curvatura sozinha lia como
     * uma cauda grossa e torta.
     */
    ion: Object.freeze({
      color: 0x74d8ff, spread: 0.12, curve: 0, size: 260,
      flow: 1 / MOTION.cometOutflow.periods.ion,
    }),
    dust: Object.freeze({
      color: 0xffe9b8, spread: 0.3, curve: 1.5 + seed * 1.6, size: 340,
      flow: 1 / MOTION.cometOutflow.periods.dust,
    }),
    /*
     * Rotação do núcleo pela LEI do catálogo, e ela estava escrita à mão aqui (`elapsed · 0,07`).
     *
     * `MOTION.spin` já lista `comet` entre quem pode girar e já define a lei — `(hash − retrógrado)
     * · span`, que põe a taxa em [−0,056, +0,104] rad/s e faz retrógrado existir mas devagar. Um
     * literal solto ao lado disso é a duplicata de sempre: o catálogo dizia uma coisa e a tela
     * fazia outra, com todo cometa girando na mesma velocidade e no mesmo sentido.
     */
    spin: (hash01(path, 79) - MOTION.spin.retrograde) * MOTION.spin.span,
    color,
  });
}

/**
 * O cometa do astro em foco. Um por cena, como as outras peles.
 *
 * @returns {{object: THREE.Object3D, update: Function, dispose: Function}}
 */
export function createComet() {
  const group = new THREE.Group();
  group.visible = false;

  const nucleoMat = new THREE.MeshBasicMaterial({ color: 0x2b2b33 });
  const nucleo = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), nucleoMat);
  group.add(nucleo);

  const comaMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uAmount: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: COMA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const coma = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), comaMat);
  coma.frustumCulled = false;
  coma.renderOrder = 9;
  group.add(coma);

  /**
   * Uma cauda: `THREE.Points` com o caminho inteiro resolvido no vertex shader.
   *
   * Os atributos são gerados UMA vez e nunca reescritos — `aPhase` é onde a partícula está no
   * CICLO de escoamento, `aJitter` é a direção de espalhamento dela e `aSize` o tamanho. Tudo que
   * depende do tempo é função fechada do relógio lá dentro, que é a mesma lei do
   * `motion-catalog.js`: sem estado acumulado, o rastro cai igual no mesmo instante em qualquer
   * sessão e a qualquer taxa de quadros — e não há upload de buffer por quadro, nem com a cauda
   * escoando.
   */
  function criarCauda(ordem) {
    const geometry = new THREE.BufferGeometry();
    const fase = new Float32Array(TAIL_PARTICLES);
    const jitter = new Float32Array(TAIL_PARTICLES * 3);
    const size = new Float32Array(TAIL_PARTICLES);
    const posicoes = new Float32Array(TAIL_PARTICLES * 3);
    for (let i = 0; i < TAIL_PARTICLES; i += 1) {
      /*
       * FASE uniforme, e o quadrado que dá a densidade mudou de lugar: ele é aplicado no shader.
       *
       * A densidade tem de ser maior PERTO do núcleo, que é de onde o gás está saindo; ela rareia
       * conforme o material se dispersa. (Com raiz — a primeira versão — as partículas se
       * acumulavam longe, onde a queda de opacidade já as apaga: o rastro sumia e sobrava um punhado
       * de pontos soltos.) Aqui a fase é uniforme e o shader faz `t = fract(fase + tempo)²`: como
       * `fract` preserva a uniformidade, a distribuição em `t` é a MESMA em todo instante. É o que
       * deixa a cauda escoar sem inchar nem esvaziar — ver `MOTION.cometOutflow`.
       */
      fase[i] = (i + 0.5) / TAIL_PARTICLES;
      // Direção de espalhamento numa casca esférica: sem isso o jitter concentra no centro do cubo
      // e a cauda ganha um miolo denso que não existe.
      const u = hash01(`${ordem}-${i}`, 61) * 2 - 1;
      const fi = hash01(`${ordem}-${i}`, 67) * Math.PI * 2;
      const r = Math.sqrt(1 - u * u) * (0.35 + hash01(`${ordem}-${i}`, 71) * 0.65);
      jitter.set([u * 0.35, Math.cos(fi) * r, Math.sin(fi) * r], i * 3);
      size[i] = 0.55 + hash01(`${ordem}-${i}`, 73) * 0.9;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(fase, 1));
    geometry.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uAmount: { value: 0 },
        uLength: { value: 1 },
        uSpread: { value: 0.2 },
        uCurve: { value: 0 },
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uPixel: { value: 300 },
      },
      vertexShader: TAIL_VERTEX,
      fragmentShader: TAIL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const pontos = new THREE.Points(geometry, material);
    pontos.frustumCulled = false;
    pontos.renderOrder = 8;
    return { object: pontos, material, geometry };
  }

  const ion = criarCauda('ion');
  const dust = criarCauda('dust');
  /*
   * As duas caudas penduram num MESMO grupo orientado.
   *
   * A orientação é recalculada todo quadro a partir da direção da fonte — é a propriedade que
   * define um cometa: a cauda aponta para longe da estrela, não para trás do movimento. Um cometa
   * que se afasta viaja com a cauda na frente. Orientar cada cauda em separado abriria a chance de
   * as duas divergirem por um quadro, e a diferença entre elas tem de ser só a curvatura.
   */
  const leque = new THREE.Group();
  leque.add(ion.object, dust.object);
  group.add(leque);

  const PARA_FORA = new THREE.Vector3();
  const OLHAR = new THREE.Vector3();
  const CIMA = new THREE.Vector3();
  const BASE = new THREE.Matrix4();

  return {
    object: group,

    /**
     * @param {object} params    de `cometParams`
     * @param {THREE.Vector3} position  posição do corpo, em MUNDO — a direção da cauda sai dela
     * @param {THREE.Camera} camera
     * @param {number} px        raio aparente do corpo
     * @param {number} elapsed
     * @param {boolean} reduced  `prefers-reduced-motion` — congela escoamento e rotação
     * @returns {number} nível de detalhe aplicado, 0…1
     */
    update(params, position, camera, px, elapsed, reduced = false) {
      /*
       * O MESMO PORTÃO DA GERAÇÃO PROCEDURAL vale para o escoamento, e ele já está aqui.
       *
       * A pele só existe para o astro EM FOCO, e abaixo de `LOD_FAR_PX` a função devolve antes de
       * escrever uniform nenhuma. Então a cauda só escoa quando o zoom alcança — de longe não há
       * nem partícula desenhada nem relógio avançando, e mesmo perto o custo do movimento é uma
       * uniform por cauda, porque o caminho inteiro é resolvido no vertex shader.
       */
      const level = THREE.MathUtils.clamp((px - LOD_FAR_PX) / (LOD_NEAR_PX - LOD_FAR_PX), 0, 1);
      group.visible = level > 0.002;
      if (!group.visible) return 0;

      const relogio = reduced ? 0 : elapsed;
      nucleo.scale.setScalar(params.nucleus);
      nucleo.rotation.set(params.seed * 6.28, relogio * params.spin, 0);

      comaMat.uniforms.uColor.value.set(params.color);
      comaMat.uniforms.uAmount.value = params.amount * level;
      coma.scale.setScalar(params.coma);
      coma.quaternion.copy(camera.quaternion);

      /*
       * AS DUAS CAUDAS APONTAM PARA LONGE DA FONTE — e é isto que faz delas caudas.
       *
       * Direção radial para fora da origem, porque o buraco negro é o único corpo emissivo da
       * cena (é a mesma fonte que ilumina o planeta em `scene.js`). A base é recalculada todo
       * quadro: um cometa que se afasta viaja com a cauda NA FRENTE, e é esse detalhe que torna o
       * movimento reconhecível. O terceiro eixo é a linha de visada, então a curvatura da poeira
       * arqueia no plano da tela em vez de sumir em profundidade.
       */
      PARA_FORA.copy(position).normalize();
      if (PARA_FORA.lengthSq() < 1e-6) PARA_FORA.set(1, 0, 0);
      OLHAR.copy(camera.position).sub(position).normalize();
      CIMA.crossVectors(OLHAR, PARA_FORA).normalize();
      BASE.makeBasis(PARA_FORA, CIMA, OLHAR);
      leque.quaternion.setFromRotationMatrix(BASE);

      for (const [cauda, cfg] of [[ion, params.ion], [dust, params.dust]]) {
        const u = cauda.material.uniforms;
        u.uColor.value.set(cfg.color);
        u.uAmount.value = params.amount * level;
        u.uLength.value = params.tail * (cfg.curve > 0 ? 0.78 : 1);
        u.uSpread.value = cfg.spread * params.coma;
        u.uCurve.value = cfg.curve;
        u.uTime.value = relogio;
        u.uFlow.value = cfg.flow;
        /*
         * ⚠️ `gl_PointSize` é pixel de FRAMEBUFFER e a conta é `tamanho/z` — a mesma régua do
         * sprite de astro (`graph.js`, onde o fator é `uSize·300`). Na primeira versão este valor
         * era 26/34, o que a 25 unidades de distância dava partículas de 1,4 px: a cauda existia
         * no buffer e não na tela. É a quarta vez que a régua de pixel morde este projeto.
         */
        u.uPixel.value = cfg.size;
      }
      return level;
    },

    dispose() {
      nucleo.geometry.dispose();
      nucleoMat.dispose();
      coma.geometry.dispose();
      comaMat.dispose();
      for (const cauda of [ion, dust]) {
        cauda.geometry.dispose();
        cauda.material.dispose();
      }
    },
  };
}
