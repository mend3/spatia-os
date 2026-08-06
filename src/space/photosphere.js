/**
 * FOTOSFERA — a superfície de uma ESTRELA, que é a classe padrão do céu.
 *
 * ## Por que ela existe, e por que não é o planeta com outra cor
 *
 * O catálogo proíbe crosta na estrela ("estrela tem FOTOSFERA, não crosta: relevo e mar
 * afirmariam corpo sólido"), e a proibição está certa. Só que ela deixava 371 dos 459 corpos
 * sem nada a revelar no zoom: aproximar de um arquivo comum continuava mostrando um ponto. A
 * resposta fiel não é afrouxar o catálogo — é dar à estrela a superfície QUE ELA TEM.
 *
 * ## As quatro diferenças que importam, e todas mudam o shader
 *
 * 1. **Não há terminador.** Estrela é emissiva; ela não é iluminada de fora. O planeta calcula
 *    `dot(normal, luz)` e é isso que faz uma esfera parecer esfera — aqui esse termo não
 *    existe, e o volume vem do ESCURECIMENTO DE LIMBO.
 * 2. **Escurecimento de limbo é lei, não gosto.** `I(μ)/I₀ = 1 − u(1 − μ)`, com `u ≈ 0.6` no
 *    visível para o Sol. Olhando o centro do disco enxerga-se fundo, onde é mais quente;
 *    olhando a borda, a mesma profundidade óptica é atingida mais alto e mais frio. É a feição
 *    mais reconhecível de uma estrela e ela sozinha já dá o volume.
 * 3. **Granulação são células de convecção**, com centro claro (plasma subindo, quente) e
 *    fronteira escura (descendo, frio). No Sol têm ~1.000 km — 0,15% do raio — e vivem 8 a 20
 *    minutos. Elas FERVEM: a textura tem de mudar, ao contrário do relevo de um planeta.
 * 4. **Manchas são frias, não pretas.** A umbra fica ~2.000 K abaixo dos 5.772 K da fotosfera,
 *    o que pela lei de Stefan–Boltzmann dá cerca de (3800/5772)⁴ ≈ 19% do brilho. Pretas
 *    afirmariam ausência de emissão, que não é o caso.
 *
 * E as fáculas, que aparecem por último e só perto da BORDA: são as paredes quentes dos
 * grânulos, visíveis de viés. Por isso o brilho delas cresce com `1 − μ`, exatamente ao
 * contrário do escurecimento de limbo.
 *
 * ## Custo
 *
 * NÃO MEDIDO em cena ainda. A aritmética: ~14 avaliações de ruído por pixel coberto (duas
 * oitavas de granulação em duas escalas, mais o campo de manchas), contra ~27 do planeta. É
 * mais barata porque não recalcula normal por diferença finita — sem terminador, não há normal
 * a recalcular.
 */
import * as THREE from 'three';
import { GLSL_SIMPLEX3 } from './planet-noise.js';
import * as motion from '../core/motion.js';
import { MOTION } from './motion-catalog.js';
import { glslFloat } from './glsl.js';

const BOIL = MOTION.boil.rates;
const SPIN = MOTION.spin;

/**
 * A casca de arquivo, de `graph.js:SHELLS`. Aqui ela serve como eixo de IDADE para a rotação.
 *
 * Espelhada e não importada porque `graph.js` importa este módulo por outro caminho — e o que se
 * usa é a FAIXA, não o valor: mover a casca muda onde os corpos ficam, não o que "velho" quer
 * dizer. Se as duas divergirem, o pior caso é a rotação saturar num extremo, não quebrar.
 */
const SHELL_INNER = 26;
const SHELL_OUTER = 62;
const SHELL_MID = (SHELL_INNER + SHELL_OUTER) / 2;

/**
 * Período de rotação, em segundos, do corpo mais recente ao mais antigo.
 *
 * Girocronologia: `P ∝ t^0.5` (Skumanich) — o Sol leva 25 dias, uma estrela jovem de tipo solar
 * leva poucos dias. A faixa aqui é de tela: 22 s dá uma volta que se percebe num olhar sem virar
 * pião, e 78 s ainda muda visivelmente entre duas visitas. Fora dessa faixa o eixo deixa de
 * informar — rápido demais vira animação, lento demais vira corpo parado.
 */
const SPIN_PERIOD = { young: 22, old: 78 };

/** Onde a fotosfera começa e onde satura, em pixels de raio na tela. Igual à do planeta. */
export const LOD_FAR_PX = 90;
export const LOD_NEAR_PX = 200;

/*
 * ## As três referências SOLARES — e por que elas deixaram de ser constantes
 *
 * Eram fixas, e com elas os 136 corpos com fotosfera tinham o MESMO tamanho de grânulo, o mesmo
 * escurecimento de limbo e o mesmo contraste de mancha: mudava só o deslocamento do ruído e a
 * quantidade de manchas. O resultado é o que se vê no céu — muitas estrelas com a mesma cara, e
 * a variação lendo como uma textura repetida em vez de corpos diferentes.
 *
 * Estrelas reais diferem por TEMPERATURA, e ela move as três de uma vez. Os valores abaixo
 * continuam sendo os do Sol; agora são o PONTO MÉDIO de uma faixa, não o céu inteiro.
 */

/** Escurecimento de limbo do Sol no visível. Faixa real: ~0,3 (quente) a ~0,9 (frio). */
const LIMB_U = 0.6;
/** Quantos grânulos cabem na volta, no corpo mediano. O Sol tem ~2 milhões; aqui, o que sobrevive a 200px. */
const CELLS = 26.0;
/** Fração do brilho que resta na umbra: `(3800/5772)^4`, Stefan-Boltzmann, para o Sol. */
const UMBRA = 0.19;

/**
 * `chunks` que saturam a escala de massa. 226 é o maior arquivo do corpus medido em 2026-08-05.
 *
 * Log, não linear: um arquivo de 226 chunks não é 226 vezes mais quente que um de 1 — a mesma
 * compressão que o raio do sprite já usa, e pelo mesmo motivo.
 */
const MASS_LOG_FULL = Math.log2(1 + 226);

/**
 * `churn` que satura a escala de atividade. 27 é o máximo do corpus (mediana 1).
 *
 * ⚠️ Depende do corpus: um repo com muito mais reescrita empurra todo mundo para baixo na escala
 * e o céu perde manchas sem nada ter acontecido com cada arquivo. Se isso aparecer, o valor tem
 * de virar percentil e não máximo.
 */
const CHURN_FULL = 27;

const VERTEX = /* glsl */ `
  varying vec3 vObject;
  void main(){
    vObject = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uCam;
  uniform vec3 uHot;
  uniform vec3 uCool;
  uniform float uTime;
  uniform float uSpots;
  uniform float uSeed;
  uniform float uDetail;
  // As tres que a TEMPERATURA move. Eram constantes, e por isso todo corpo com fotosfera tinha
  // a mesma cara: mesmo grao, mesmo volume, mesmo contraste de mancha. Ver photosphereParams.
  uniform float uLimb;
  uniform float uCells;
  uniform float uUmbra;
  // Rotacao propria: angulo acumulado e eixo (inclinacao). Ver photosphereParams.
  uniform float uSpin;
  uniform float uTilt;
  varying vec3 vObject;

  // Taxas de fervura, do motion-catalog.js. A ORDEM entre elas e a fisica: supergranulacao
  // grande e lenta, granulacao pequena e rapida vivendo dentro dela. (Sem backtick aqui: ele
  // fecha o template do shader.)
  const float BOIL_SLOW = ${glslFloat(BOIL.supergranulation)};
  const float BOIL_FAST = ${glslFloat(BOIL.granulation)};
  const float BOIL_FINE = ${glslFloat(BOIL.fine)};
  const float SPOT_DRIFT = ${glslFloat(BOIL.spots)};

  ${GLSL_SIMPLEX3}

  /*
   * Granulacao: celulas de conveccao que FERVEM.
   *
   * O quarto argumento do simplex e o tempo, entao o campo evolui em vez de girar rigido — que
   * e o que uma textura rolando faria, e o olho reconhece na hora como textura e nao como
   * plasma. As duas escalas sao a supergranulacao (grande, lenta) e a granulacao (pequena,
   * rapida), que e a estrutura real: as celulas pequenas vivem dentro das grandes.
   */
  float granulation(vec3 p){
    float slow = simplex3(p * uCells * 0.22 + vec3(0.0, uTime * BOIL_SLOW, uSeed));
    float fast = simplex3(p * uCells + vec3(uSeed, uTime * BOIL_FAST, 0.0));
    // A oitava fina entra por rampa com o nivel de detalhe: a 90px ela oscila mais de uma vez
    // por pixel e so produz cintilacao.
    float fine = simplex3(p * uCells * 2.6 + vec3(0.0, uTime * BOIL_FINE, uSeed)) * uDetail;
    return slow * 0.42 + fast * 0.44 + fine * 0.14;
  }

  /*
   * A ESTRELA GIRA — e o que gira e a AMOSTRAGEM, nao a malha.
   *
   * Rodar o objeto no espaco moveria tambem o limbo e as faculas, que sao funcao da linha de
   * visada e nao do corpo: a borda escura passearia pelo disco, o que nenhuma estrela faz. O que
   * pertence ao corpo e o campo — granulacao e manchas. Entao o eixo gira as COORDENADAS de
   * amostragem e o resto do shader continua olhando para a camera.
   */
  vec3 rotacionar(vec3 p, float ang, float tilt){
    // Inclina o eixo no plano x-y, gira em torno dele, desinclina. Sem o tilt toda estrela do ceu
    // giraria com o polo para cima, que le como carimbo.
    float ct = cos(tilt), st = sin(tilt);
    vec3 q = vec3(p.x * ct + p.y * st, -p.x * st + p.y * ct, p.z);
    float c = cos(ang), s = sin(ang);
    q = vec3(q.x * c - q.z * s, q.y, q.x * s + q.z * c);
    return vec3(q.x * ct - q.y * st, q.x * st + q.y * ct, q.z);
  }

  void main(){
    vec3 normal = normalize(vObject);
    // mu = cosseno do angulo entre a normal e a linha de visada. 1 no centro do disco, 0 no
    // limbo. Tudo aqui e funcao dele.
    float mu = clamp(dot(normal, normalize(uCam - vObject)), 0.0, 1.0);

    vec3 corpo = rotacionar(normal, uSpin, uTilt);
    float cells = granulation(corpo);

    /*
     * MANCHAS. Campo separado, de escala muito maior, cortado por limiar alto — mancha e evento
     * raro e localizado, nao modulacao continua do brilho. Elas tambem migram, so que devagar
     * demais para se perceber num olhar; o termo de tempo existe para que duas visitas ao mesmo
     * astro em dias diferentes nao sejam identicas.
     */
    float field = simplex3(corpo * 2.3 + vec3(uSeed * 3.1, uTime * SPOT_DRIFT, 0.0));
    float spot = smoothstep(0.52, 0.78, field) * uSpots;
    // Penumbra: a borda da mancha e filamentar e menos fria que a umbra.
    float penumbra = smoothstep(0.42, 0.56, field) * uSpots;

    /*
     * ESCURECIMENTO DE LIMBO — a lei, nao um gradiente escolhido.
     *
     * Sem terminador para dar volume, e ELE que faz o disco parecer uma esfera. Olhando o
     * centro do disco a linha de visada penetra mais fundo, onde e mais quente; na borda, a
     * mesma profundidade optica e atingida mais alto e mais frio.
     */
    float limb = 1.0 - uLimb * (1.0 - mu);

    /*
     * FACULAS: as paredes quentes dos granulos, visiveis de VIES. Por isso crescem com (1-mu),
     * exatamente ao contrario do escurecimento de limbo — e e essa oposicao que da a textura
     * anelada caracteristica perto da borda.
     */
    float faculae = max(cells, 0.0) * (1.0 - mu) * 0.9;

    float brightness = limb * (0.74 + cells * 0.52) + faculae * 0.8;
    // A mancha multiplica o que sobrou: ela nao APAGA emissao, ela emite menos.
    brightness *= mix(1.0, uUmbra, spot) * mix(1.0, 0.62, penumbra - spot);

    /*
     * Cor por TEMPERATURA, e o padrao e QUENTE.
     *
     * A primeira versao interpolava pelo brilho ABSOLUTO — e como o brilho medio fica em
     * torno de 0,4 depois da exposicao, o disco inteiro caia no lado frio e a estrela saia
     * marrom, parecendo lua rochosa. O erro foi de referencial: brilho baixo na tela nao
     * significa plasma frio, significa exposicao.
     *
     * O desvio e que manda. Fotosfera e quente por definicao; o que esfria sao a mancha e as
     * calhas de descida entre granulos (ruido negativo). E por isso que mancha solar parece
     * alaranjada CONTRA o branco, e nao cinza.
     */
    float cold = clamp(spot * 0.85 + max(-cells, 0.0) * 0.45, 0.0, 1.0);
    vec3 color = mix(uHot, uCool, cold);

    /*
     * EXPOSICAO. A conta acima e fisica e passa de 1 com folga (limbo ~1 vezes granulacao
     * ~1,16 mais faculas); a tela nao. Sem este fator a fotosfera saia branca e chapada e o
     * bloom multiplicava o estouro — o disco virava um borrao azul e a granulacao, que e o
     * ponto do shader, nao aparecia em pixel nenhum.
     *
     * 0.52 e o que mantem o pico logo abaixo do limiar do bloom (0,8 por padrao) e deixa a
     * estrutura visivel. Escolhido na CENA, com a cadeia ligada — a licao que o τ do anel e o
     * ganho do fundo ja tinham dado duas vezes.
     */
    /*
     * EXPOSICAO. A conta acima e fisica e passa de 1; a tela nao. 0.72 mantem o pico logo
     * abaixo do limiar do bloom e deixa a granulacao visivel.
     *
     * ⚠️ O valor anterior (0,52) foi escolhido olhando a CENA — e nao valia nada, porque o
     * shader nem compilava: o que eu estava calibrando era o halo do sprite por baixo. Foi a
     * bancada que expos isso, que e exatamente para o que ela existe.
     */
    gl_FragColor = vec4(color * brightness * 0.72, 1.0);
  }
`;

/**
 * Parâmetros da fotosfera de um nó. Puro e congelado, como `planetParams`.
 *
 * @param {{source?: string, kind?: string, chunks?: number}} node
 * @param {(text: string, salt?: number) => number} hash01
 * @param {number} kindColor  a cor que o céu já usa para este tipo de conhecimento
 */
export function photosphereParams(node, hash01, kindColor) {
  const seed = hash01(node.source ?? 'sem-caminho', 17);
  const base = new THREE.Color(kindColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  const chunks = Number.isFinite(node.chunks) ? node.chunks : 1;

  /*
   * TEMPERATURA — o eixo que faltava, e o que faz duas estrelas serem duas estrelas.
   *
   * Sem ele o céu tinha 136 corpos com o mesmo grão, o mesmo volume e o mesmo contraste de
   * mancha; o hash mexia no deslocamento do ruído, que o olho lê como a MESMA textura em outra
   * posição — não como outro corpo. Estrela real difere por temperatura, e ela move quatro
   * coisas de uma vez: cor, tamanho do grânulo, escurecimento de limbo e contraste da mancha.
   *
   * O que a define aqui é a MASSA, e isso não é analogia solta: a relação massa-luminosidade da
   * sequência principal (`L ∝ M^3.5`) é justamente "mais massa, mais quente". Na cena, massa é
   * `chunks` — então um arquivo de configuração grande lê como estrela branco-azulada e um de
   * uma linha como anã laranja. A informação já estava no corpo; ela só não estava na superfície.
   *
   * ⚠️ Entra pelo RANK (`node.massRank`, escrito em `graph.js:load`), não pelo log da massa. Com o
   * log, a mediana de temperatura do corpus dava 0,22: `chunks` tem mediana 4 e máximo 226, então
   * quase todo o céu caía no mesmo canto frio da faixa e a variedade não aparecia. O rank
   * distribui uniformemente — é o mesmo motivo pelo qual `recency` é posição no ranking e não
   * data. O log continua certo para o TAMANHO do sprite; são duas perguntas sobre o mesmo número.
   *
   * O hash entra como DESVIO pequeno (±12%), não como fonte: sem ele, dois arquivos de mesmo
   * tamanho seriam gêmeos exatos; com ele mandando, a temperatura deixaria de informar.
   */
  const massa = Number.isFinite(node.massRank)
    ? node.massRank
    : THREE.MathUtils.clamp(Math.log2(1 + chunks) / MASS_LOG_FULL, 0, 1);
  const temp = THREE.MathUtils.clamp(massa * 0.88 + (seed - 0.5) * 0.24, 0, 1);

  /*
   * A cor do nó vira o par frio/quente de um corpo negro, não uma paleta arbitrária.
   *
   * `hot` é a mesma matiz dessaturada e clara — plasma a 5.800 K lê como quase branco, com só
   * um traço da cor. `cool` puxa para laranja-vermelho, que é para onde a lei de Wien leva
   * qualquer coisa que esfria. Assim o TIPO do conhecimento continua legível (a matiz) sem que
   * a estrela vire um disco chapado da cor do tipo.
   *
   * A TEMPERATURA desloca a matiz ao longo do lugar de Planck: quente puxa para o azul (0,58) e
   * frio para o laranja (0,07). O tipo continua governando o traço de cor; a temperatura governa
   * de que lado do branco ele cai — que é o que separa um corpo do outro à primeira vista.
   */
  const matizQuente = THREE.MathUtils.lerp(hsl.h, 0.58, temp * 0.55);
  const hot = new THREE.Color().setHSL(
    matizQuente,
    Math.min(hsl.s, 0.34) * (0.6 + temp * 0.7),
    THREE.MathUtils.lerp(0.88, 0.97, temp)
  );
  const cool = new THREE.Color().setHSL(
    THREE.MathUtils.lerp(0.045, 0.11, temp),
    0.72,
    THREE.MathUtils.lerp(0.34, 0.5, temp)
  );

  /*
   * Grânulo: quantos cabem na volta. Estrela FRIA tem grânulo GRANDE.
   *
   * A célula de convecção escala com a altura de escala de pressão, que cresce quando a
   * temperatura efetiva cai e a gravidade superficial diminui — por isso uma supergigante
   * vermelha tem poucas células enormes e uma anã quente tem um grão fino. 26 é a referência
   * solar e fica no meio da faixa.
   */
  const cells = THREE.MathUtils.lerp(CELLS * 0.42, CELLS * 1.85, temp);

  /*
   * Escurecimento de limbo: forte no frio, fraco no quente.
   *
   * Faixa medida em estrelas reais no visível: `u` vai de ~0,3 nas quentes a ~0,9 nas frias. É a
   * variação mais visível das três — ela muda o quanto o corpo lê como esfera contra disco.
   */
  const limb = THREE.MathUtils.lerp(0.86, 0.34, temp);

  /*
   * Contraste da umbra: `(T_mancha/T_fotosfera)^4`, com a mancha ~1.800 K abaixo.
   *
   * Em estrela quente essa diferença é uma fração menor da temperatura, então a mancha é MENOS
   * escura em termos relativos — o contraste de mancha é uma assinatura de estrela fria.
   */
  const tFot = THREE.MathUtils.lerp(3800, 9000, temp);
  const umbra = THREE.MathUtils.clamp(((tFot - 1800) / tFot) ** 4, 0.05, 0.72);

  /*
   * MANCHAS por ATIVIDADE, não por tamanho — e `churn` é a atividade que este corpus mede.
   *
   * Antes saía da massa ("mais massa, mais manchas"), que o próprio comentário admitia ser
   * palpite de legibilidade e não física. Estrela manchada é estrela ATIVA, e o análogo aqui é o
   * arquivo reescrito muitas vezes: `churn` vai de 0 a 27 no corpus, mediana 1. Agora a mancha
   * informa alguma coisa em vez de repetir o tamanho, que o raio do sprite já diz.
   */
  const churn = Number.isFinite(node.churn) ? node.churn : 0;
  const atividade = THREE.MathUtils.clamp(Math.log2(1 + churn) / Math.log2(1 + CHURN_FULL), 0, 1);
  const spots = atividade * (0.45 + seed * 0.6);

  /*
   * ROTAÇÃO PRÓPRIA — e o período sai da IDADE, o que aqui é o raio orbital.
   *
   * Não é analogia: é **girocronologia**. Estrela de tipo solar perde momento angular por vento
   * magnético e desacelera de forma tão regular que a rotação é usada para DATAR estrelas
   * (`P ∝ t^0.5`, Skumanich). Nesta cena o raio orbital é a recência — então "corpo na periferia
   * gira devagar" é a lei, não uma licença. Era o que faltava para a estrela ter tempo próprio: a
   * granulação já fervia, mas fervura não tem eixo, e um corpo sem eixo não lê como corpo.
   *
   * O SINAL vem do hash, pelo mesmo motivo do planeta: um céu inteiro girando para o mesmo lado
   * lê como carimbo. `span` e `retrograde` são do `motion-catalog.js`, compartilhados com ele —
   * duas leis de rotação seria a duplicata que este projeto já pagou três vezes.
   */
  const raioOrbital = Number.isFinite(node.radius) ? node.radius : SHELL_MID;
  const idade = THREE.MathUtils.clamp((raioOrbital - SHELL_INNER) / (SHELL_OUTER - SHELL_INNER), 0, 1);
  /*
   * ⚠️ O HASH DÁ O SINAL; a IDADE dá a MAGNITUDE. A primeira versão deu as duas ao hash e errou.
   *
   * Escrito como `(seed − retrograde) · span` — a forma que o planeta usa — o hash que cai em cima
   * de `retrograde` produz rotação ZERO, e o corpo fica parado sem que nada explique por quê.
   * Medido no corpus: períodos de 74 s a **21.348 s**, mediana 285 s. Nessa faixa a estrela não
   * gira, ela só não está parada o suficiente para alguém provar.
   *
   * Separando as duas, todo corpo gira e o período fica na faixa que a girocronologia pede: jovem
   * depressa, velho devagar, sem buraco no meio. O retrógrado continua mais lento que o progrado,
   * que é a assimetria que o `motion-catalog.js` declara e o Sistema Solar tem (Vênus é o mais
   * lento dos oito).
   */
  const retrogrado = seed < SPIN.retrograde;
  const spin =
    (retrogrado ? -1 : 1) *
    ((Math.PI * 2) / THREE.MathUtils.lerp(SPIN_PERIOD.young, SPIN_PERIOD.old, idade)) *
    (retrogrado ? 0.6 : 1);

  return Object.freeze({
    seed: seed * 10, hot, cool, spots, cells, limb, umbra, temp,
    spin,
    // Eixo inclinado: sem isto todo polo aponta para cima e a rotação vira um carrossel só.
    tilt: (hash01(node.source ?? 'sem-caminho', 19) - 0.5) * 1.1,
  });
}

export function createPhotosphere() {
  const group = new THREE.Group();
  group.visible = false;

  let mesh = null;
  const CAM = new THREE.Vector3();
  const INVERSE = new THREE.Matrix4();

  function build() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uHot: { value: new THREE.Color(0xffffff) },
        uCool: { value: new THREE.Color(0xff7a3c) },
        uTime: { value: 0 },
        uSpots: { value: 0 },
        uSeed: { value: 0 },
        uSpin: { value: 0 },
        uTilt: { value: 0 },
        uLimb: { value: 0.6 },
        uCells: { value: 26.0 },
        uUmbra: { value: 0.19 },
        uDetail: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    // 48×32 basta: a esfera não tem deslocamento, então a malha só precisa de silhueta lisa —
    // toda a estrutura mora no fragmento.
    mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
    group.add(mesh);
  }

  return {
    object: group,

    /**
     * @param {object} params  saída de `photosphereParams`
     * @param {THREE.Camera} camera
     * @param {number} px      raio aparente em pixels — decide o nível de detalhe
     * @param {number} elapsed
     * @returns {number} nível resolvido, 0 a 1
     */
    update(params, camera, px, elapsed = 0) {
      const near = THREE.MathUtils.smoothstep(px, LOD_FAR_PX, LOD_NEAR_PX);
      if (near <= 0.001) {
        group.visible = false;
        return 0;
      }
      if (!mesh) build();
      group.visible = true;

      group.updateWorldMatrix(true, false);
      INVERSE.copy(group.matrixWorld).invert();
      CAM.copy(camera.position).applyMatrix4(INVERSE);

      const u = mesh.material.uniforms;
      u.uCam.value.copy(CAM);
      u.uHot.value.copy(params.hot);
      u.uCool.value.copy(params.cool);
      u.uSpots.value = params.spots;
      u.uSeed.value = params.seed;
      // As três que a temperatura move — sem elas o corpo volta a ser o Sol de todo mundo.
      // A rotação usa o MESMO relógio congelável da fervura: `spin` declara `reduced: 'freeze'`,
      // e parar o relógio deixa a estrela virada para um lado, que é um instante legítimo.
      u.uSpin.value = (motion.isReduced() ? 0 : elapsed) * (params.spin ?? 0);
      u.uTilt.value = params.tilt ?? 0;
      u.uLimb.value = params.limb ?? 0.6;
      u.uCells.value = params.cells ?? 26;
      u.uUmbra.value = params.umbra ?? 0.19;
      /*
       * `boil` declara `reduced: 'freeze'` no catálogo, e agora obedece.
       *
       * Parar o relógio congela a granulação inteira num quadro — as células ficam onde estão, com
       * a mancha onde está. É o que `freeze` quer dizer: a superfície continua sendo a superfície
       * que aquela estrela tem, sem nada se mexendo. Zerar `uTime` em vez de guardar o último
       * valor é de propósito: assim o corpo tem a MESMA cara em toda sessão com movimento
       * reduzido, em vez de depender do instante em que a preferência foi lida.
       */
      u.uTime.value = motion.isReduced() ? 0 : elapsed;
      u.uDetail.value = near;
      return near;
    },

    dispose() {
      if (!mesh) return;
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    },
  };
}
