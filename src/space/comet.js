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
 * Quanto do raio de referência o CORPO ocupa — e aqui ele é um caroço perdido dentro do gás.
 *
 * É o teto de `params.nucleus` (0,14 + até 0,16), e o valor está baixo de propósito: albedo de
 * núcleo cometário é ~0,04 e o que se vê da Terra é a coma. Quem lê é `lod.js` (`BODY_SPAN`),
 * para saber que a coroa do sprite — que vive entre 1,03 e 1,67 raios — não envolve corpo nenhum
 * aqui, e sim pinta um disco por cima da coma.
 */
const NUCLEUS_FLOOR = 0.14;
const NUCLEUS_GAIN = 0.16;
export const BODY_SPAN = NUCLEUS_FLOOR + NUCLEUS_GAIN;

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
    // ⚠️ Teto pelo mesmo motivo do vento do pulsar (pulsar-wind.js): tamanho/z nao tem limite
    // superior, e de perto 260 particulas viram 260 quads de tela cheia. 90 px e maior que o do
    // vento porque aqui sao 3x menos particulas e elas SAO a figura, nao o ambiente.
    gl_PointSize = clamp(aSize * (1.0 - t * 0.82) * uPixel / max(-mv.z, 0.001), 1.0, 90.0);
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

/**
 * O NÚCLEO é irregular, e não é enfeite — é o que ser pequeno OBRIGA.
 *
 * Abaixo de ~400 km de diâmetro a autogravidade não vence a resistência do material, então o corpo
 * nunca chega ao equilíbrio hidrostático e não arredonda. Núcleo cometário tem quilômetros: 67P tem
 * 4 km e é um amendoim de dois lobos, Halley é um batata alongado. A esfera é que seria a mentira —
 * ela afirmaria um corpo grande o bastante para se arredondar, que é exatamente a fronteira que o
 * catálogo já usa para decidir quais luas são redondas.
 *
 * ⚠️ Sem `simplex3` aqui de propósito, e a razão é diferente da estação: harmônicas baixas são o
 * que descreve ESTA forma. Ruído fractal daria uma superfície rugosa em toda escala — um asteroide
 * texturizado. O que caracteriza um núcleo é a silhueta de poucos lobos, e isso são três termos.
 */
function esculpirNucleo(seed) {
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const pos = geometry.attributes.position;
  // Cinco fases independentes a partir de uma semente só. `x - floor(x)` e não `% 1`: o resto de
  // um negativo é negativo, e uma fase fora de [0,1) faria dois cometas coincidirem por acaso.
  const fase = (n) => {
    const x = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
    return (x - Math.floor(x)) * Math.PI * 2;
  };
  const [a, b, c, d, e] = [fase(1), fase(2), fase(3), fase(4), fase(5)];
  /*
   * CONTATO BINÁRIO em cerca de metade dos corpos, e essa proporção é observada.
   *
   * 67P, Arrokoth, Halley: a fusão de dois corpos a baixa velocidade é comum o bastante para ser
   * a forma típica, não a exceção. `cintura` estrangula o meio ao longo de um eixo; quando o
   * sorteio a desliga, sobra o irregular de lobo único, que também existe.
   */
  const bilobado = seed > 0.5;
  const eixo = new THREE.Vector3(Math.cos(a), Math.sin(b), Math.sin(a) * Math.cos(b)).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    // Três harmônicas de frequência crescente: os lobos, o degrau grande, a quina. A função é da
    // DIREÇÃO, então os vértices duplicados da malha não-indexada caem no mesmo lugar — sem isso
    // a casca abriria fenda em cada aresta compartilhada.
    let r = 1
      + 0.20 * Math.sin(2.3 * v.x + a) * Math.cos(2.7 * v.y + b)
      + 0.11 * Math.sin(4.1 * v.z + c) * Math.cos(3.7 * v.x + d)
      + 0.06 * Math.sin(6.9 * v.y + e);
    if (bilobado) {
      // A cintura: uma gaussiana estreita em torno do plano perpendicular ao eixo. Estrangula em
      // vez de cortar — os dois lobos continuam ligados por um pescoço, que é o que se vê.
      const ao = v.dot(eixo);
      r -= 0.30 * Math.exp(-(ao * ao) / 0.045);
    }
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  // Malha não-indexada + normais recalculadas = sombreamento FACETADO, e é o que se quer: corpo
  // abaixo do limite hidrostático tem quina de verdade, e faceta lê como rocha, não como esfera.
  geometry.computeVertexNormals();
  return geometry;
}

const NUCLEUS_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main(){
    // Normal em MUNDO: a luz vem do nucleo da cena e o corpo gira, entao a conta tem de acontecer
    // num referencial que nenhum dos dois arrasta junto.
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NUCLEUS_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uLight;
  uniform vec3 uRock;
  varying vec3 vNormal;
  void main(){
    /*
     * ALBEDO 0,04 — mais escuro que carvao, e e o dado que manda no desenho.
     *
     * Sem termo ambiente o corpo sumiria no preto; com ambiente demais ele vira pedra cinza e
     * perde o terminador, que e o unico sinal de que aquilo e SOLIDO. O piso baixo deixa a face
     * escura quase preta e o limbo iluminado aparece como um crescente fino — a imagem que a
     * Giotto trouxe do Halley e a Rosetta do 67P.
     */
    float lambert = max(dot(vNormal, uLight), 0.0);
    gl_FragColor = vec4(uRock * (0.05 + 0.95 * lambert), 1.0);
  }
`;

const COMA_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uCore;
  uniform vec2 uSun;
  varying vec2 vUv;
  void main(){
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);

    /*
     * A COMA CAI COM 1/rho, e nao como um polinomio macio. E a lei, nao um ajuste de gosto.
     *
     * O nucleo sopra gas radialmente a velocidade quase constante, entao a densidade cai com
     * 1/r^2 (mesma massa por segundo espalhada numa casca que cresce com r^2). O que a camera ve
     * e a INTEGRAL disso ao longo da linha de visada, e essa integral da 1/rho — rho sendo a
     * distancia ao centro na tela. Uma lei em 1/rho tem nucleo estourado e halo extenso: e o
     * perfil de toda foto de cometa.
     *
     * A lei antiga, pow(1 - d, 1.4), nao tem nada disso. Ela e chata no meio e cai a zero numa
     * borda, entao
     * lia como bola de gude fosca pintada por tras do corpo — o "glow sem sensacao realista". A
     * diferenca nao e sutil: em d = 0,3 a lei antiga da 0,60 e a nova da 0,50; em d = 0,05 a
     * antiga da 0,93 e a nova SATURA. O contraste todo mora perto do nucleo, e era ele que
     * faltava.
     */
    vec2 dir = d > 1e-4 ? p / d : vec2(1.0, 0.0);
    /*
     * E ela NAO e esferica: comprimida do lado da fonte, alongada no rumo da cauda.
     *
     * O gas sublima na face iluminada e o vento estelar o varre para tras na hora. O resultado e
     * uma parabola com o nucleo no foco, nao um circulo — e e o que LIGA a coma a cauda. Sem
     * isso ficava uma bola do lado de um risco, duas figuras em vez de um corpo.
     */
    float rho = d * (1.0 + 0.42 * dot(dir, uSun));
    // O piso e o raio do proprio corpo: dentro dele nao ha coluna de gas para integrar, e sem o
    // piso a lei diverge e o centro vira um pixel branco cravado.
    float fill = (uCore / max(rho, uCore)) * uAmount * 0.55;
    // Corte macio na borda do quad. A lei em 1/rho nunca chega a zero sozinha, e sem isto o
    // retangulo apareceria como uma quina no ceu.
    fill *= smoothstep(1.0, 0.42, d);
    /*
     * O CORPO OCULTA A COMA ATRAS DELE — e sem isto o nucleo nao existe na tela.
     *
     * A coma e aditiva e desenhada sem teste de profundidade (ela e emissao, nao solido), entao
     * ela soma por cima do nucleo e apaga qualquer relevo que ele tenha. Uma esfera lisa nao fazia
     * falta ali; um corpo esculpido faz.
     *
     * A saida nao e ligar o teste de profundidade — isso cortaria a metade de tras da coma, que
     * existe de verdade. E descontar a coluna de gas que o corpo SOLIDO bloqueia, que e o que
     * acontece de fato: no centro so chega a metade da frente. O resultado e o nucleo em
     * silhueta escura contra o gas, com o limbo aceso — a imagem que a Giotto trouxe do Halley.
     */
    fill *= smoothstep(uCore * 0.9, uCore * 1.7, d);
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
    nucleus: NUCLEUS_FLOOR + Math.min(Math.log2(1 + chunks) * 0.028, NUCLEUS_GAIN),
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

  /*
   * O núcleo é o único opaco desta pele, e o único que escreve profundidade.
   *
   * Coma e caudas são emissão: aditivas, sem `depthWrite`, sem `depthTest`. O corpo é matéria —
   * ele tem de ocluir o que passa atrás. `renderOrder` baixo para ele entrar antes do gás.
   */
  const nucleoMat = new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: new THREE.Vector3(1, 0, 0) },
      // Cinza-escuro neutro, e ele NÃO é a cor do `kind`: o núcleo é rocha, e pintá-lo da cor do
      // conhecimento diria que a matéria dele muda com o tipo do arquivo. O gás é que carrega a cor.
      uRock: { value: new THREE.Color(0x6b6a72) },
    },
    vertexShader: NUCLEUS_VERTEX,
    fragmentShader: NUCLEUS_FRAGMENT,
  });
  const nucleo = new THREE.Mesh(esculpirNucleo(0.5), nucleoMat);
  nucleo.renderOrder = 7;
  group.add(nucleo);
  /** Semente da malha corrente — a geometria é reesculpida quando o foco troca de cometa. */
  let nucleoSeed = null;

  const comaMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uAmount: { value: 0 },
      uCore: { value: 0.15 },
      /** Direção da FONTE, projetada no plano do billboard — é o que assimetriza a coma. */
      uSun: { value: new THREE.Vector2(1, 0) },
    },
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

  const DIREITA = new THREE.Vector3();
  const CIMA_CAM = new THREE.Vector3();
  const PARA_FONTE = new THREE.Vector3();
  /** A fonte padrão: a ORIGEM. Ver a nota de `fonte` no `update`. */
  const ORIGEM = new THREE.Vector3();
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
    /**
     * @param {THREE.Vector3} [fonte]  DE ONDE VEM A LUZ que empurra as caudas. Padrão: a origem.
     *
     * ⚠️ **Ele era implícito, e implícito só funcionava numa das duas cenas.** Na AGENTE a origem é
     * o buraco negro — um corpo emissivo real —, então `−normalize(position)` acertava. Na cena
     * UNIVERSO **não há nada na origem**: toda cauda apontaria para longe do vazio, reafirmando o
     * centro único que essa cena existe para negar. É a mesma correção que o `CORPO_VS` já fez para
     * a luz (*"cada planeta é iluminado pela ESTRELA DELE"*) e que a câmera fez para a âncora.
     *
     * O padrão `ORIGEM` reproduz o comportamento anterior EXATAMENTE: `normalize(0 − position)` é
     * `−normalize(position)`. Nenhum chamador antigo muda de imagem.
     */
    update(params, position, camera, px, elapsed, reduced = false, fonte = ORIGEM) {
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
      // Reesculpe só quando o foco troca de cometa — mesmo ciclo de vida das outras peles.
      if (params.seed !== nucleoSeed) {
        nucleo.geometry.dispose();
        nucleo.geometry = esculpirNucleo(params.seed);
        nucleoSeed = params.seed;
      }
      nucleo.scale.setScalar(params.nucleus);
      nucleo.rotation.set(params.seed * 6.28, relogio * params.spin, 0);
      /*
       * A LUZ VEM DO NÚCLEO DA CENA, que é o único corpo emissivo — a mesma fonte que ilumina o
       * planeta em `scene.js` e a mesma que empurra as caudas. Direção do corpo PARA a origem.
       *
       * Cai de graça uma coisa certa: a face acesa do núcleo aponta para onde as caudas NÃO
       * apontam. O crescente iluminado e o rastro ficam em lados opostos, que é a geometria real
       * de um cometa e o que amarra as três partes numa leitura só.
       */
      // A direção da fonte, calculada UMA vez: o núcleo aceso, a coma e as caudas leem a mesma.
      PARA_FONTE.copy(fonte).sub(position).normalize();
      if (PARA_FONTE.lengthSq() < 1e-6) PARA_FONTE.set(1, 0, 0);
      nucleoMat.uniforms.uLight.value.copy(PARA_FONTE);

      comaMat.uniforms.uColor.value.set(params.color);
      comaMat.uniforms.uAmount.value = params.amount * level;
      // Raio do corpo em unidades da coma: é onde o gás para de ser somado (ver COMA_FRAGMENT).
      comaMat.uniforms.uCore.value = params.nucleus / Math.max(params.coma, 1e-4);
      coma.scale.setScalar(params.coma);
      coma.quaternion.copy(camera.quaternion);
      /*
       * A direção da fonte, PROJETADA no plano do billboard.
       *
       * O quad copia a orientação da câmera, então o eixo local X é a direita da câmera e o Y é o
       * cima — as duas colunas da matriz de mundo dela. Projetar nelas leva uma direção de mundo
       * para o mesmo espaço em que o shader lê `vUv`, e é a única conversão que faz a assimetria
       * apontar para onde a fonte de fato está em vez de para um lado fixo da tela.
       */
      DIREITA.setFromMatrixColumn(camera.matrixWorld, 0);
      CIMA_CAM.setFromMatrixColumn(camera.matrixWorld, 1);
      comaMat.uniforms.uSun.value.set(PARA_FONTE.dot(DIREITA), PARA_FONTE.dot(CIMA_CAM)).normalize();

      /*
       * AS DUAS CAUDAS APONTAM PARA LONGE DA FONTE — e é isto que faz delas caudas.
       *
       * Direção radial para fora da origem, porque o buraco negro é o único corpo emissivo da
       * cena (é a mesma fonte que ilumina o planeta em `scene.js`). A base é recalculada todo
       * quadro: um cometa que se afasta viaja com a cauda NA FRENTE, e é esse detalhe que torna o
       * movimento reconhecível. O terceiro eixo é a linha de visada, então a curvatura da poeira
       * arqueia no plano da tela em vez de sumir em profundidade.
       */
      PARA_FORA.copy(PARA_FONTE).negate();
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
