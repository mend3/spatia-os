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
import { createPulse } from './pulsar-pulse.js';
import { createWind } from './pulsar-wind.js';
import { GLSL_SIMPLEX3 } from './planet-noise.js';

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
  uniform float uCone;
  varying float vAlong;
  varying float vRadial;
  void main(){
    // A geometria poe a base em y=0 (no corpo) e a ponta em y=1. vAlong e a fracao percorrida.
    vAlong = position.y;
    /*
     * vRadial e a distancia ao eixo em fracao do raio LOCAL, e o denominador muda com a peca.
     *
     * No CONE (uCone = 1) o raio cresce com a altura, entao a fracao e xz/y. No CILINDRO
     * (uCone = 0) o raio e constante e igual a 1. Sem esta troca o cilindro herdaria a conta do
     * cone e ficaria com o miolo aceso so na ponta — a divisao por y apagaria a base inteira.
     */
    vRadial = length(position.xz) / max(mix(1.0, position.y, uCone), 1e-4);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uFall;
  uniform float uEdge;
  uniform float uSpine;
  uniform float uSharp;
  uniform float uAlign;
  varying float vAlong;
  varying float vRadial;
  void main(){
    // A emissao cai ao longo do feixe. uFall separa as duas pecas: o LOBO difuso morre depressa
    // (expoente alto) e o JATO colimado quase nao perde brilho no comprimento (expoente ~1), que
    // e o que faz dele uma agulha que atravessa a imagem em vez de um cone que termina.
    float aoLongo = pow(clamp(1.0 - vAlong, 0.0, 1.0), uFall);
    // E cai TAMBEM do eixo para a borda: feixe de radio nao tem parede.
    float doEixo = pow(clamp(1.0 - vRadial, 0.0, 1.0), uEdge);
    /*
     * A ESPINHA — o fio branco no meio do feixe, e e ela que faltava.
     *
     * Nas referencias (o quasar com o jato atravessando o disco, o Crab) o feixe nao e um facho
     * de cor uniforme: e um nucleo BRANCO estourado com um halo colorido em volta. O olho le
     * isso como energia; um cone de uma cor so le como geometria pintada.
     *
     * ⚠️ O expoente e uniform porque a primeira tentativa (40, fixo) reproduziu EXATAMENTE o
     * defeito que ela dizia evitar. Com o cone abrindo 11% e a espinha a 4% do raio dele, o fio
     * aceso ficava em 0,4% do comprimento — menos de um pixel, invisivel. Contas, com o jato a
     * ~200 px na tela: a meia-largura do cone no meio do jato e abertura·100 px, e o fio e a
     * fracao r onde (1-r)^n = 0,5. Para um fio de ~4 px com halo de ~20 px sai abertura 0,2 e
     * n = 17. Regra: a espinha e uma fracao do RAIO DO CONE, entao estreitar o cone estreita o
     * fio junto — os dois numeros nao sao independentes.
     */
    float espinha = pow(clamp(1.0 - vRadial, 0.0, 1.0), uSharp) * uSpine;
    /*
     * BEAMING RELATIVISTICO: o feixe estoura quando aponta para o observador.
     *
     * Nao e so perspectiva. O plasma sobe pelo eixo a uma fracao alta de c, e a radiacao de uma
     * fonte que se aproxima e concentrada para a frente e deslocada para cima em energia — o
     * fator de Doppler entra na intensidade com uma potencia alta (3 a 4 para um jato continuo).
     * E por isso que um blazar, que e o mesmo objeto visto de frente, e ordens de grandeza mais
     * brilhante que a mesma fonte de perfil.
     *
     * uAlign e o cosseno entre o eixo do feixe e a linha de visada, calculado no JS. A potencia 3
     * e o expoente do caso continuo; o piso impede que o feixe de perfil desapareca de vez, que
     * apagaria a informacao em vez de so escurece-la.
     */
    float doppler = 0.35 + 2.4 * pow(clamp(uAlign, 0.0, 1.0), 3.0);
    float fill = (doEixo + espinha) * aoLongo * uAmount * doppler;
    if (fill < 0.004) discard;
    // Branco no fio, cor do corpo no halo.
    gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(espinha, 0.0, 1.0)) * fill, fill);
  }
`;


/**
 * O NÚCLEO não é um círculo — é massa de energia.
 *
 * A queixa foi literal: "simplesmente um círculo com cones". E `MeshBasicMaterial` é exatamente
 * isso: uma cor chapada dentro de uma silhueta perfeita, sem estrutura, sem variação, sem borda
 * viva. Nenhum corpo desta cena que EMITE se parece com isso — a fotosfera ferve, a nebulosa
 * escoa, a coma tem lei de queda. O núcleo do pulsar era o único emissor desenhado como adesivo.
 *
 * O que entra no lugar, e cada termo responde por uma coisa que se vê nas referências:
 *
 * | termo | o que é | o que ele conserta |
 * |---|---|---|
 * | `fervura` | ruído 3D avançado no tempo, duas oitavas | superfície uniforme |
 * | `erupcao` | picos raros e agudos do mesmo campo | massa inerte, sem eventos |
 * | `borda` | o ruído também modula o ALFA no limbo | a silhueta de círculo perfeito |
 * | alfa < 1 | aditivo e translúcido | "as superfícies não devem ser opacas" |
 *
 * ⚠️ Ele é ADITIVO como o resto da emissão desta pele. Um emissor opaco tapa o feixe que sai de
 * trás dele, e o pulsar volta a ter um feixe só — que foi o defeito que pôs os cones sem teste de
 * profundidade em primeiro lugar.
 */
const CORE_VERTEX = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main(){
    vPos = position;
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  precision highp float;
  ${GLSL_SIMPLEX3}
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uCam;
  uniform vec3 uMag;
  uniform float uBeat;
  varying vec3 vPos;
  varying vec3 vNormal;

  /*
   * SINCROTRON: a cor sai da ENERGIA, e a rampa e a mesma que se ve nas fotos.
   *
   * Eletron relativistico em campo magnetico emite num espectro largo, e o que a imagem mostra e
   * a energia caindo do centro para fora: branco onde estoura, azul, ciano, roxo e vermelho
   * escuro na cauda. Uma cor so com brilho variavel nao produz isso — o que muda com a energia e
   * o MATIZ, nao a luminancia.
   */
  vec3 sincrotron(float e){
    vec3 c = mix(vec3(0.32, 0.02, 0.10), vec3(0.45, 0.10, 0.72), smoothstep(0.0, 0.28, e));
    c = mix(c, vec3(0.16, 0.62, 0.95), smoothstep(0.24, 0.55, e));
    c = mix(c, vec3(0.42, 0.78, 1.0), smoothstep(0.5, 0.78, e));
    return mix(c, vec3(1.0), smoothstep(0.74, 1.0, e));
  }

  void main(){
    vec3 q = vPos * 3.4 + uSeed;
    /*
     * FERVURA: duas oitavas avancando no tempo, a fina mais rapida que a grossa.
     *
     * E a mesma ordem que a granulacao da fotosfera usa, e pelo mesmo motivo: celula grande e
     * lenta com celula pequena e rapida dentro dela le como conveccao. Igualadas, le como
     * textura rolando.
     */
    float grossa = simplex3(q + vec3(0.0, uTime * 0.35, 0.0));
    float fina = simplex3(q * 2.7 - vec3(uTime * 0.8, 0.0, uTime * 0.5));
    float fervura = grossa * 0.62 + fina * 0.38;

    /*
     * ERUPCAO: o mesmo campo, so que so a CRISTA dele.
     *
     * Elevar a potencia alta mata tudo menos os picos mais altos do ruido, entao a superficie
     * fica calma quase toda e estoura em pontos isolados que nascem e morrem. Erupcao nao e
     * ruido mais forte, e ruido RARO — sem o corte, o corpo inteiro pisca junto.
     */
    float erupcao = pow(max(fervura, 0.0), 6.0) * 3.2;

    // Angulo de visada: 1 no meio do disco, 0 no limbo.
    float mu = clamp(dot(normalize(vNormal), normalize(uCam - vPos)), 0.0, 1.0);

    /*
     * A BORDA E IRREGULAR, e e isto que tira o "circulo".
     *
     * O alfa cai no limbo (mu -> 0) como qualquer corpo translucido — a linha de visada atravessa
     * menos plasma la. Somando a fervura ao limiar, a queda acontece mais cedo em umas direcoes e
     * mais tarde em outras: a silhueta ganha lingua e reentrancia, e muda com o tempo.
     */
    float limiar = 0.16 + fervura * 0.22;
    float borda = smoothstep(0.0, max(limiar, 0.02), mu);

    /*
     * Faixa dinamica ALTA de proposito: massa de energia nao e uma cor com textura por cima.
     *
     * Com 0,55 de piso o corpo ficava chapado — um planeta mosqueado. Piso baixo e ganho alto
     * poem as calhas quase apagadas e as cristas estourando, que e o contraste que o olho le como
     * plasma. A erupcao entra por cima disso, nao no lugar dele.
     */
    /*
     * HOTSPOTS POLARES — e a superficie inteira era tratada igual, que era o defeito principal.
     *
     * O que aquece a crosta de uma estrela de neutrons nao e ela mesma: e o plasma acelerado
     * DESCENDO pelas linhas de campo abertas e batendo nas calotas polares magneticas. So ali. O
     * resto da superficie e frio em comparacao, e por isso quase nunca se ve um disco luminoso —
     * ve-se emissao quase pontual que aparece e some conforme a calota entra e sai de vista.
     *
     * uMag e o eixo magnetico em espaco LOCAL. O cosseno ao expoente alto recorta a calota; o
     * valor absoluto acende os DOIS polos, que e o certo — o dipolo e simetrico, e e por isso que
     * um pulsar pisca duas vezes por volta quando a geometria ajuda.
     */
    vec3 n = normalize(vNormal);
    float calota = pow(abs(dot(n, normalize(uMag))), 26.0);
    // A mancha quente nao tem borda limpa: o mesmo campo que ferve a deforma.
    float hotspot = calota * (0.72 + fervura * 0.55);

    /*
     * A ESFERA RECUA. Antes ela era ~90% do que se via; agora e a base fria sobre a qual as
     * calotas estouram — a proporcao que o corpo real tem. O termo de borda continua fazendo a silhueta
     * ser irregular, mas o que chama o olho passa a ser o polo, nao o disco.
     */
    float superficie = (0.08 + fervura * 0.34 + erupcao * 0.9);
    float energia = clamp(superficie * 0.5 + hotspot * 1.35 + erupcao * 0.6, 0.0, 1.0);
    float brilho = (superficie + hotspot * 2.6) * borda * uAmount * uBeat;
    if (brilho < 0.004) discard;
    // A cor vem da ENERGIA pela rampa sincrotron, e uColor do tipo entra so como tingimento:
    // o corpo tem de continuar dizendo "infra" sem que isso apague a fisica da emissao.
    vec3 cor = mix(sincrotron(energia), uColor, 0.28);
    gl_FragColor = vec4(cor * brilho, brilho);
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
    /*
     * Corpo PEQUENO — e a primeira versão ainda era grande demais.
     *
     * A 0,22–0,36 raios ele enchia o centro da tela como uma bola pálida, e a queixa foi literal:
     * "simplesmente um círculo com cones". Estrela de nêutrons tem ~10 km: em qualquer escala em
     * que o feixe caiba, ela é um PONTO. 0,10–0,16 devolve a proporção das referências, em que o
     * corpo é o brilho de onde tudo sai e não a figura principal.
     */
    core: 0.10 + massa * 0.06,
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
const OLHO = new THREE.Vector3();
const EIXO = new THREE.Vector3();
const VISADA = new THREE.Vector3();
const QUAT = new THREE.Quaternion();

/**
 * Alcance de cada camada, em múltiplos de `beam`. Ver a tabela em `update`.
 *
 * `beam` (6,5 · 0,7…1,3 raios) continua sendo o parâmetro por corpo; estas razões constroem a
 * hierarquia espacial em cima dele. Mexer numa camada aqui não move as outras, que era exatamente
 * o problema de tudo sair do mesmo número.
 */
const SCALE = Object.freeze({ lobe: 0.42, jet: 1.9, wind: 4.2 });

export function createPulsar() {
  /** Leitura do último quadro. Ver `beat()`. */
  const ultimo = { batimento: 0, nivel: 0, alinhamento: 0 };
  const group = new THREE.Group();
  group.visible = false;

  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uMag: { value: new THREE.Vector3(0, 1, 0) },
      uBeat: { value: 1 },
    },
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // 32×24: a esfera não tem deslocamento — a estrutura toda mora no fragmento, e a malha só
  // precisa de silhueta lisa o bastante para o ruído deformá-la.
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), coreMat);
  group.add(core);

  /*
   * DUAS PEÇAS POR POLO, e é a diferença entre "cone" e "pulsar".
   *
   * As referências mostram duas coisas que um cone só não faz ao mesmo tempo. O Crab é um par de
   * LOBOS difusos, largos e curtos, com borda macia — a emissão perto da estrela. O quasar é uma
   * AGULHA colimada, fina e longa, que atravessa a imagem inteira sem perder brilho. As duas são
   * o mesmo fenômeno em escalas diferentes (o plasma sai largo e é colimado pelo campo), e é por
   * isso que elas dividem o eixo e o shader: o que muda são três expoentes e o comprimento.
   */
  function criarMaterial({ fall, edge, spine, sharp, gain, cone }) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uAmount: { value: 0 },
        uFall: { value: fall },
        uEdge: { value: edge },
        uSpine: { value: spine },
        uSharp: { value: sharp },
        uCone: { value: cone },
        uAlign: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      // O ganho vive NO material: ele apareceu duas vezes na primeira escrita (aqui e no laço do
      // `update`), que é a duplicata que esta cena já pagou quatro vezes. Uma cópia só.
      userData: { gain },
    });
  }
  // Jato: quase não perde brilho no comprimento, miolo apertado, espinha branca acesa.
  const jatoMat = criarMaterial({ fall: 0.9, edge: 3.2, spine: 1, sharp: 17, gain: 1.5, cone: 0 });
  // Lobo: morre depressa, borda larga e macia, sem espinha — ele é o halo, não o fio.
  const loboMat = criarMaterial({ fall: 2.2, edge: 1.8, spine: 0, sharp: 1, gain: 0.85, cone: 1 });

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

  const jatos = [];
  const lobos = [];
  for (const lado of [1, -1]) {
    /*
     * ÁPICE NO CORPO, base longe — e a primeira versão fez o contrário.
     *
     * `ConeGeometry` nasce com o ápice em +y e a base em −y. Assim o feixe saía LARGO no corpo e
     * fechava numa ponta ao longe, que é a silhueta de um funil e não de um farol: a luz sai de
     * um ponto e se abre. `rotateX(π)` inverte, e o `translate` põe o ápice na origem para
     * `position.y` valer direto como fração percorrida no shader.
     */
    for (const [mat, lista] of [[jatoMat, jatos], [loboMat, lobos]]) {
      /*
       * O JATO É UM CILINDRO e o LOBO é um cone, e a diferença é a colimação.
       *
       * Jato de núcleo ativo é colimado: ele mantém a largura por distâncias absurdas — é essa
       * propriedade que o torna um jato e não um jorro. Desenhado como cone, ele lia como CUNHA
       * TRIANGULAR, que foi a primeira coisa que apareceu na tela. O feixe de rádio do pulsar, ao
       * contrário, abre mesmo — o cone está certo lá.
       *
       * ⚠️ **E o jato é um QUAD, não um cilindro** — a primeira tentativa foi cilindro e ele
       * simplesmente não apareceu, sem erro nenhum. `CylinderGeometry(…, true)` é aberto: só
       * existe a PAREDE, e nela `length(xz)` vale 1 em todo vértice. Com `uCone = 0` o shader
       * dividia por 1 e obtinha `vRadial = 1` em cada fragmento, o que zera tanto o halo quanto a
       * espinha. Um tubo é uma casca; o feixe precisa do INTERIOR, e cone só funciona porque a
       * parede dele varre raios de 0 (no ápice) a 1.
       *
       * O quad tem largura constante — que é o que colimação significa — e é girado a cada quadro
       * para encarar a câmera (ver `update`), como qualquer rastro. `PlaneGeometry(2, 1)` dá
       * x ∈ [−1, 1] e y ∈ [0, 1], então `length(position.xz)` já é |x| e `position.y` já é a
       * fração percorrida: o mesmo shader serve às duas peças sem um `if`.
       *
       * `ConeGeometry` nasce com o ápice em +y; `rotateX(π)` põe o ápice embaixo, no corpo, para
       * a luz sair de um ponto e abrir. O `translate` põe a base em y=0 nos dois.
       */
      const geo = mat === jatoMat
        ? new THREE.PlaneGeometry(2, 1)
        : new THREE.ConeGeometry(1, 1, 16, 1, true);
      if (mat !== jatoMat) geo.rotateX(Math.PI);
      geo.translate(0, 0.5, 0);
      const feixe = new THREE.Mesh(geo, mat);
      feixe.frustumCulled = false;
      feixe.renderOrder = 9;
      if (lado < 0) feixe.rotation.z = Math.PI;
      lista.push(feixe);
      eixoMagnetico.add(feixe);
    }
  }

  /*
   * O PULSO DE EMISSÃO fica no grupo EXTERNO, não no eixo magnético.
   *
   * A energia que o quasar solta não é canalizada pelos polos como o feixe é: ela sai para todo
   * lado. Pendurada no eixo magnético, a casca giraria com a varredura — uma esfera girando é
   * indistinguível de uma parada, mas o padrão de filamento não é, e ele denunciaria o giro.
   */
  const pulso = createPulse();
  group.add(pulso.object);

  /*
   * O VENTO pendura no eixo magnético: a cintura equatorial dele é definida pelas linhas de campo
   * fechadas, não pelo eixo de rotação. Ele gira com a varredura, e é o certo — a magnetosfera
   * inteira é solidária ao dipolo.
   */
  const vento = createWind();
  eixoMagnetico.add(vento.object);

  return {
    object: group,

    /**
     * @param {object} params  de `pulsarParams`
     * @param {number} px      raio aparente do corpo
     * @param {number} elapsed relógio da cena
     * @param {boolean} reduced  `prefers-reduced-motion` — congela a varredura e a fervura
     * @param {THREE.Camera} camera  para o ângulo de visada do núcleo
     * @returns {number} nível de detalhe aplicado, 0…1
     */
    /**
     * O último quadro, para a bancada e para a sonda — `galaxy.pose()` com outro nome.
     *
     * ⚠️ Existe porque a afirmação central desta arquitetura é INVISÍVEL numa foto: "um batimento
     * só para tudo, como um coração". Várias animações independentes e uma pulsação única
     * produzem imagens parecidas em qualquer instante e só divergem ao longo do tempo — que é
     * exatamente o que screenshot não julga. Com o número na mão, o operador confere que brilho,
     * calota, halo e vento sobem e descem JUNTOS, em vez de precisar acreditar.
     */
    beat: () => ({ ...ultimo }),

    update(params, px, elapsed, reduced = false, camera = null) {
      const level = THREE.MathUtils.clamp((px - LOD_FAR_PX) / (LOD_NEAR_PX - LOD_FAR_PX), 0, 1);
      group.visible = level > 0.002;
      if (!group.visible) return 0;

      /*
       * UM BATIMENTO SÓ para tudo — "como um coração", e é o que faltava.
       *
       * O período já governava a varredura e nada mais: brilho, hotspot, halo e vento corriam em
       * relógios independentes, então o corpo tinha várias animações em vez de uma pulsação. Agora
       * sai daqui um número 0…1 por quadro e todas as camadas o leem.
       *
       * `sin⁴` e não `sin`: o batimento fica quase todo o ciclo baixo e sobe rápido, que é a forma
       * de um pulso e não de uma respiração.
       */
      const batimento = reduced ? 0.5 : Math.sin((elapsed / params.period) * Math.PI) ** 4;
      ultimo.batimento = batimento;
      ultimo.nivel = level;

      core.scale.setScalar(params.core);
      coreMat.uniforms.uColor.value.set(params.color);
      coreMat.uniforms.uAmount.value = level;
      coreMat.uniforms.uSeed.value = params.seed * 37;
      // A fervura CONGELA com movimento reduzido, como o `boil` da fotosfera: o campo parado é um
      // instante legítimo da convecção, e a estrutura continua lá.
      coreMat.uniforms.uTime.value = reduced ? 0 : elapsed;
      // O batimento entra no núcleo como GANHO, não substituindo a fervura: a superfície continua
      // viva entre as batidas, ela só não estoura.
      coreMat.uniforms.uBeat.value = 0.55 + batimento * 0.9;
      // `uCam` em espaço LOCAL do núcleo: o grupo tem rotação e escala próprias, e a conta de
      // ângulo de visada tem de acontecer no mesmo referencial em que `vPos` vive.
      if (camera) core.worldToLocal(coreMat.uniforms.uCam.value.copy(camera.position));

      /*
       * O raio da base é a ABERTURA e a altura é o ALCANCE, e as duas peças usam razões opostas.
       *
       * O JATO abre 20% e o comprimento vem de `SCALE.jet` — jato relativístico colima em poucos
       * graus, e o que se vê nas referências é uma agulha. (Os 20% são de MALHA; o brilho visível
       * é bem mais fino, feito pela espinha no shader — agulha geométrica fina ficaria sub-pixel
       * e cintilaria, ver o cálculo em FRAGMENT.)
       *
       * O LOBO é curto (38%) e largo (48%): é a emissão perto da estrela, a parte que o Crab
       * mostra como duas asas difusas. Sem ele o jato sai do nada; sem o jato o corpo vira um
       * borrão. A razão entre os dois é o que dá a silhueta de ampulheta das referências.
       */
      for (const mat of [jatoMat, loboMat]) {
        mat.uniforms.uColor.value.set(params.color);
        mat.uniforms.uAmount.value = 0.55 * level * mat.userData.gain;
      }
      /*
       * ESCALAS DESACOPLADAS — e antes tudo saía do mesmo `beam`, o que prendia o corpo inteiro
       * numa casca só e fazia o pulsar parecer um efeito colado no astro.
       *
       * | camada | alcance | por quê |
       * |---|---|---|
       * | magnetosfera (lobo) | ~2–4 raios | onde as linhas fechadas seguram o plasma |
       * | cone de emissão (jato) | ~8–15 raios | a região colimada |
       * | vento relativístico | ~20–40 raios | expansão livre, e é o que dá o TAMANHO do corpo |
       *
       * A hierarquia é o ponto: três alcances em razão ~4 entre si constroem profundidade que
       * uma casca só nunca dá. `SCALE` guarda as razões contra `beam`, que continua sendo o
       * parâmetro por corpo.
       */
      for (const jato of jatos) jato.scale.set(params.beam * 0.2, params.beam * SCALE.jet, 1);
      for (const lobo of lobos) lobo.scale.set(params.beam * 0.5, params.beam * SCALE.lobe, params.beam * 0.5);
      // O pulso alcança a ponta do LOBO, não a do jato: ele é emissão isotrópica, e ir tão longe
      // quanto a agulha colimada afirmaria que ela não colima nada. Ver `pulsar-pulse.js`.
      pulso.update(params.beam * SCALE.wind, level, elapsed, params.seed, params.color, camera, reduced);
      vento.update(params.beam * SCALE.wind, level, elapsed, batimento, reduced);

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

      /*
       * O QUAD DO JATO ENCARA A CÂMERA, e a rotação acontece DEPOIS de todas as outras.
       *
       * Ele é plano: visto de perfil desapareceria, e um pulsar que perde um jato conforme a
       * varredura gira lê como defeito. O único grau de liberdade que não muda a direção do jato
       * é o giro em torno do próprio eixo — então é esse que se usa. `worldToLocal` no eixo
       * magnético leva a câmera para o referencial em que esse giro é simplesmente `rotation.y`,
       * e a conta tem de vir depois de `eixoRotacao`/`eixoMagnetico` já estarem postos, senão ela
       * usa a pose do quadro anterior.
       */
      if (camera) {
        eixoMagnetico.updateWorldMatrix(true, false);
        eixoMagnetico.worldToLocal(OLHO.copy(camera.position));
        const giro = Math.atan2(OLHO.x, OLHO.z);
        for (const jato of jatos) jato.rotation.y = giro;

        /*
         * O eixo magnético em MUNDO, e daí duas coisas que precisam dele.
         *
         * O núcleo recebe o eixo em espaço LOCAL dele para recortar as calotas quentes; os feixes
         * recebem o cosseno contra a linha de visada para o beaming relativístico. É a mesma
         * direção lida em dois referenciais, e é por isso que ela é calculada uma vez só.
         */
        EIXO.set(0, 1, 0).applyQuaternion(eixoMagnetico.getWorldQuaternion(QUAT)).normalize();
        VISADA.copy(camera.position).sub(group.position).normalize();
        const alinhamento = Math.abs(EIXO.dot(VISADA));
        ultimo.alinhamento = alinhamento;
        for (const mat of [jatoMat, loboMat]) mat.uniforms.uAlign.value = alinhamento;
        core.updateWorldMatrix(true, false);
        core.worldToLocal(coreMat.uniforms.uMag.value.copy(group.position).addScaledVector(EIXO, 1));
      }
      return level;
    },

    dispose() {
      core.geometry.dispose();
      coreMat.dispose();
      for (const feixe of [...jatos, ...lobos]) feixe.geometry.dispose();
      jatoMat.dispose();
      loboMat.dispose();
      pulso.dispose();
      vento.dispose();
    },
  };
}
