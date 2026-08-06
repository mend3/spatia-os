/**
 * O grafo de conhecimento como céu: cada arquivo indexado é uma estrela em órbita.
 *
 * Os nós são reais — vêm de `/api/graph`, que agrega a coleção vetorial. A *posição* é
 * derivada determinísticamente do id (hash → raio, inclinação, fase), então o mesmo
 * conhecimento cai sempre no mesmo lugar do céu: o operador aprende a geografia do próprio
 * repositório. Layout aleatório por sessão jogaria isso fora.
 *
 * As órbitas seguem a mesma lei do disco de acreção (ω ∝ r^-1.5): o que está perto do
 * núcleo gira rápido. O céu e o buraco negro obedecem à mesma física, e é isso que faz a
 * cena parecer um sistema em vez de duas animações sobrepostas.
 *
 * Posições são calculadas na CPU, não no vertex shader. Custa ~468 sin/cos por quadro
 * (irrelevante) e mantém o raycast do three funcionando — sem isso, clicar num nó exigiria
 * reimplementar picking à mão.
 */
import * as THREE from 'three';
import { isSkyNode } from '../core/corpus.js';
import * as motion from '../core/motion.js';
import { createRings, VISIBLE_CORE } from './rings.js';
import { classify } from './catalog.js';
import { moonsOf } from './orbital-zones.js';
import { MOTION, meanMotion, rateOf } from './motion-catalog.js';
import { glslFloat } from './glsl.js';

const PULSE = MOTION.pulse;
const BOB = MOTION.bob;

/*
 * Extensão do sistema de anéis, em raios do disco visível — espelha o teto de `rings.js`. Aqui
 * ela só dimensiona o furo que a HUD abre, então um espelho basta; ligar os dois módulos por
 * import só para isto acoplaria a geometria do anel à régua da interface.
 */
const SPAN_HINT = 2.4;

// Cor por natureza do conhecimento. A escala de "idade" do briefing (nova branca, antiga
// azulada, muito usada amarela, esquecida vermelha) entra como *modulação* da ignição:
// aqui é o tipo, ali é o uso.
// Exportado porque o histograma "forma do corpus" pinta as barras com a MESMA cor que o céu
// dá a cada tipo. Duas paletas para o mesmo dado fariam a barra e a estrela parecerem falar de
// assuntos diferentes.
export const KIND_COLORS = {
  memory: 0xffffff,
  decision: 0xffc169,
  doc: 0xa8d8ff,
  agent: 0xc9a6ff,
  infra: 0x7ee0c0,
  compose: 0x6fb8ff,
  schema: 0xffe08a,
  script: 0x9fe870,
  config: 0x8a97ad,
  lock: 0x3d4453,
  other: 0x6f7b8f,
  dir: 0x5a6478,
  repo: 0xffab54,
};

const SHELLS = { repo: [11, 17], dir: [19, 33], file: [26, 62] };
const IGNITION_DECAY = 0.55;

/*
 * Janela temporal (o scrubber do céu).
 *
 * `uReveal` é uma posição no MESMO espaço de `node.recency` que já define o raio orbital — não
 * um segundo eixo de tempo. É a propriedade que o Starmap do hermes-agent enuncia no próprio
 * código ("so a node's ring distance and its ignite time agree") e que aqui é obrigatória: se o
 * scrubber tivesse modelo próprio, o rótulo diria uma data e a geometria mostraria outra.
 *
 * Como `recency` cresce para o mais NOVO e o raio decresce com ela, a frente de revelação é um
 * anel que se fecha em direção ao núcleo. Não é escolha estética: é consequência de o raio já
 * ser a recência.
 *
 * `uRevealBand` é a largura da frente em unidades de recência: sem ela o corte seria um degrau
 * de um quadro, e um degrau lê como bug de render, não como frente do tempo.
 */
const REVEAL_BAND = 0.05;
// Nó fora da janela ATENUA, não desaparece: sumir afirmaria que ele não existe, e ele existe —
// só não é do período que o operador está olhando.
const REVEAL_DIM = 0.09;
// Taxa da suavização por tempo (`1 - exp(-rate*delta)`). Alta o suficiente para o arraste
// parecer direto, baixa o suficiente para a frente ser legível como movimento.
const REVEAL_RATE = 16;

// O `300.0 / -viewPosition.z` do vertex shader. Vive aqui porque duas contas dependem dele.
const POINT_SCALE = 300;
/*
 * Teto de `gl_PointSize` da GPU, em pixels.
 *
 * Medido nesta máquina: `ALIASED_POINT_SIZE_RANGE` = [1, 511]. **A estrela satura nesse valor e
 * a geometria do anel não** — sem espelhar o teto aqui, uma estrela perto da câmera para de
 * crescer enquanto o anel continua, e ele descola exatamente no caso em que mais aparece.
 * 511 é o piso comum entre GPUs; usar o valor real exigiria o contexto GL aqui dentro, e errar
 * para MENOS só torna o anel conservador.
 */
const POINT_SIZE_CAP = 511;

const VERTEX = /* glsl */ `
  uniform float uSize, uTime, uReveal, uRevealBand, uRevealDim, uPulse;
  attribute float aSize;
  attribute float aIgnition;
  attribute float aRecency;
  attribute float aSupernova;
  attribute float aSeed;
  attribute float aHalo;
  attribute vec3 aColor;
  attribute float aHidden;
  varying vec3 vColor;
  varying float vIgnition;
  varying float vReveal;
  varying float vSupernova;
  varying float vSeed;
  varying float vHalo;

  // Do catálogo de movimento, e o espelho em JS de starRadius() lê os MESMOS três valores. Eram
  // literais nos dois lugares. (Sem backtick neste comentário: ele fecha o template do shader.)
  const float PULSE_RATE = ${glslFloat(PULSE.rate)};
  const float PULSE_INFLATE = ${glslFloat(PULSE.inflate)};
  const float PULSE_AMPLITUDE = ${glslFloat(PULSE.amplitude)};

  void main(){
    /*
     * FILTRO POR TIPO — descartado no clipe, nao encolhido.
     *
     * Zerar gl_PointSize NAO esconde nada: o tamanho tem piso de 1.0 logo abaixo, e um ponto de
     * 1px continua clicavel e continua acendendo. Jogar o vertice para fora do volume de clipe
     * faz a GPU descartar o ponto inteiro, que e a unica forma de ele deixar de existir.
     */
    if (aHidden > 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vIgnition = aIgnition;
    vSupernova = aSupernova;
    vSeed = aSeed;
    vHalo = aHalo;
    // 1 = dentro da janela, 0 = ainda no futuro em relação ao playhead.
    float within = 1.0 - smoothstep(0.0, uRevealBand, aRecency - uReveal);
    vReveal = mix(uRevealDim, 1.0, within);
    // Nó aceso puxa para o branco quente: é a leitura de "esta memória está sendo usada".
    vColor = mix(aColor, vec3(1.0, 0.95, 0.85), aIgnition * 0.75);

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    // uPulse a 0 congela a oscilação sem apagar o realce: o nó aceso continua maior e mais
    // quente, só não bate. É o que prefers-reduced-motion pede — menos movimento, não menos
    // informação. (Sem backtick neste comentário: ele fecha o template literal do shader.)
    float pulse = 1.0 + aIgnition * (PULSE_INFLATE + sin(uTime * PULSE_RATE) * PULSE_AMPLITUDE * uPulse);
    // O tamanho encolhe menos que o brilho: um ponto de 1px atenuado desapareceria por
    // aliasing, e aí a atenuação viraria remoção sem ninguém pedir.
    float shrink = mix(0.62, 1.0, within);
    gl_PointSize = max(uSize * aSize * pulse * shrink * (300.0 / -viewPosition.z), 1.0);
  }
`;

/*
 * A SUPERNOVA é uma CASCA, e a forma é o que a distingue.
 *
 * "Muito reescrito nos últimos 30 dias" e "citado pela busca agora" são dois fatos diferentes
 * sobre o mesmo arquivo, e disputam o mesmo pixel. Se os dois virassem brilho, o céu diria uma
 * coisa só e mais forte — não duas coisas.
 *
 * A divisão é por GEOMETRIA, não por cor: `aIgnition` acende e INFLA o núcleo (evento, passa),
 * `aSupernova` desenha uma CASCA à volta dele (estado durável do repositório). A ignição nunca
 * produz casca — e a casca fica na cor do próprio nó, porque a cor já carrega o TIPO de
 * conhecimento e roubá-la custaria essa leitura.
 *
 * ⚠️ Esta separação já falhou uma vez, contra um terceiro sinal que não existia quando ela foi
 * escrita. A casca era um ANEL CONCÊNTRICO LISO em 0,78 do sprite; o anel planetário (arquivo
 * sujo no git) nasceu depois e ocupa de 0,60 a 1,44 — ou seja, a casca caía dentro do vão dele.
 * O usuário olhou a cena e perguntou "o que é esse segundo anel?", que é a pergunta que prova a
 * colisão. A casca então virou FILAMENTAR e ROMPIDA, e a distinção voltou a ser de forma: anel
 * é liso, contínuo e elíptico; remanescente é irregular, quebrado em arcos e sempre circular.
 *
 * ⚠️ A casca cabe DENTRO do sprite que já existe (o núcleo apaga em d≈0.6; ela mora em 0.78).
 * Inflar `gl_PointSize` para abrir espaço teria um efeito colateral silencioso: o anel de
 * Saturno se ancora no tamanho do ponto (`starRadius`), então toda supernova ganharia também um
 * anel planetário maior, misturando dois sinais que não têm relação.
 *
 * Estático de propósito: um anel que pulsa seria movimento sem evento por trás, e a cena já tem
 * uma regra sobre isso (`prefers-reduced-motion`). A supernova é um estado, não um piscar.
 */
const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vIgnition;
  varying float vReveal;
  varying float vSupernova;
  varying float vSeed;
  varying float vHalo;

  const float TAU = 6.28318530718;
  // Envoltorio: onde comeca, ate onde vai, quanto rende e quanto o contorno ondula.
  const float ENV_INNER = 0.34;
  const float ENV_OUTER = 1.0;
  const float ENV_GAIN = 0.55;
  const float ENV_LOBES = 0.22;

  /*
   * O envoltorio do remanescente: NEBULOSIDADE, nao casca.
   *
   * Duas tentativas falharam antes, e pelo mesmo motivo: um anel concentrico liso, depois uma
   * casca filamentar rompida em arcos. As duas tinham BORDA — e qualquer coisa com borda
   * definida a volta do nucleo le como anel, por mais irregular que seja o contorno. Anel ja e
   * outra classe do catalogo, entao o defeito nao era o desenho, era a categoria.
   *
   * Remanescente de verdade preenche uma regiao e some SEM borda. E o preenchimento que o torna
   * inconfundivel com uma elipse nitida — e as harmonicas baixas no contorno externo sao o que
   * o separa da corona da ignicao, que e circular e perfeita.
   */
  float envelope(vec2 pc, float seed){
    float a = atan(pc.y, pc.x) + seed * TAU;
    float warp = cos(2.0 * a) * 0.50 + cos(3.0 * a + 1.7) * 0.30 + cos(5.0 * a + 4.1) * 0.20;
    float outer = ENV_OUTER * (1.0 + ENV_LOBES * warp);
    // smoothstep com as bordas INVERTIDAS: 1 no interior, 0 no contorno, sem degrau em lugar
    // nenhum. Ao quadrado para a queda ficar mais rapida no meio e mais macia no fim.
    float fill = smoothstep(outer, ENV_INNER, length(pc));
    return fill * fill;
  }

  void main(){
    vec2 pc = (gl_PointCoord - 0.5) * 2.0;
    float d = length(pc);
    float core = pow(1.0 - smoothstep(0.0, 1.0, d), 2.2);
    /*
     * O NUCLEO SE ABRE quando um planeta assume este astro.
     *
     * O disco visivel do sprite tem raio VISIBLE_CORE (0,6) e e exatamente onde a esfera do
     * planeta e desenhada. Sem esvaziar o miolo, o ponto ADITIVO continuaria somando brilho por
     * cima da superficie: o terminador — a parte mais legivel do planeta — sumiria num borrao.
     * Esvaziado, sobra a coroa, que e o que uma atmosfera iluminada por tras faz de verdade.
     */
    core *= mix(1.0, smoothstep(0.0, 0.62, d), vHalo);
    // Corona só em nó aceso: dá o "volta a brilhar" sem inflar o céu inteiro.
    float corona = (1.0 - smoothstep(0.0, 1.3, d)) * vIgnition * 0.55;
    float shell = envelope(pc, vSeed) * vSupernova * ENV_GAIN;
    float intensity = (core + corona + shell) * vReveal;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(vColor * intensity, intensity);
  }
`;

/** `smoothstep` do GLSL em JS — a atenuação da janela precisa bater com a do shader. */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Hash determinístico string → [0,1). Mesmo id, mesma órbita, em qualquer máquina.
 *
 * Exportado porque a semente de qualquer feição por nó tem de sair do MESMO lugar: o caminho do
 * arquivo. Duas implementações de hash dariam a um mesmo arquivo uma órbita e um planeta que
 * não conversam entre si, e ninguém notaria — os dois pareceriam certos isoladamente.
 */
export function hash01(text, salt = 0) {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
}

// Vetor de rascunho: a distância do nó à câmera é calculada por anel, por quadro.
const TEMP = new THREE.Vector3();

/**
 * O material do sprite de astro — o MESMO da cena, para quem precisar desenhar um.
 *
 * Existe exportado por causa da bancada: um espécime que reimplementasse este shader passaria a
 * mentir na primeira divergência, que é justamente o instante em que ele seria útil. A regra é do
 * `sandbox/specs.js` ("todo espécime IMPORTA o módulo real"), e ela obriga uma porta.
 *
 * Cada chamada devolve material NOVO: `uSize`, `uReveal` e `uPulse` são estado, e compartilhar um
 * material entre a cena e a bancada faria o slider de uma mexer no céu da outra.
 */
export function createPointMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 4.6 },
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uRevealBand: { value: REVEAL_BAND },
      uRevealDim: { value: REVEAL_DIM },
      uPulse: { value: motion.isReduced() ? 0 : 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createGraph() {
  const group = new THREE.Group();
  let nodes = [];
  // Quantas das entradas de `nodes` são luas. Elas ficam no fim do vetor, então isto também é a
  // fronteira entre "corpo do corpus" e "corpo derivado" — a sonda reporta os dois separados.
  let moonCount = 0;
  /*
   * Seções que NÃO couberam na órbita e não viraram lua.
   *
   * Existe pela mesma regra que faz `rings.set` devolver `dropped`: corte silencioso lê como "é só
   * isso que existe". Quem chama reporta — ver `moonReport`.
   */
  let moonsDropped = 0;
  let index = new Map();
  let positions = null;
  let ignition = null;
  /** 1 = descartado no clipe. Espelho em JS do atributo `aHidden`, ver o vertex shader. */
  let hidden = null;
  /**
   * Tipos VISÍVEIS, ou `null` para "todos".
   *
   * `null` e "o conjunto de todos os tipos" não são a mesma coisa e a diferença importa: com
   * `null` um tipo que aparecer numa recarga futura nasce visível, que é o comportamento certo
   * para quem nunca tocou no filtro. Com um conjunto explícito, ele nasceria escondido — o
   * corpus teria crescido e a tela não diria.
   */
  let visibleKinds = null;
  /** Última lista passada a `rings.set`, para o filtro poder reconstruir sem esperar a varredura. */
  let ringEntries = [];
  /*
   * Intensidade da casca por nó. Hoisted para fora do `load` porque a RESOLUÇÃO de
   * compatibilidade acontece depois — quando o estado do disco chega — e ela precisa reescrever
   * este atributo. Ver `markDirty`.
   */
  let supernovae = null;
  let sizes = null;
  let points = null;
  let edgePairs = [];
  /** índice do nó → lista de pares [ele, vizinho]. Ver `linksOf`. */
  let neighbours = new Map();
  // Caminho relativo à raiz do workspace → índice do nó. É a chave com que o `/api/dirty`
  // fala, e existe para que casar "arquivo sujo" com "estrela" não custe uma varredura.
  let byPath = new Map();
  // source → estado local, para quem pergunta (o rótulo de hover). Separado do `rings`
  // porque texto e geometria têm ciclos de vida diferentes.
  let dirtyState = new Map();
  // Índices dos nós que ganharam anel neste `markDirty` — a HUD cede em volta deles.
  let ringed = [];
  /** Por nó: quanto o sprite virou halo (0 = disco cheio, 1 = só a coroa). */
  let halo = null;
  let haloIndex = -1;
  let haloAmount = 0;
  const rings = createRings();
  group.add(rings.group);
  const tune = { speed: 1 };
  // Alvo e valor corrente da janela: 1 = tudo revelado, que é como o céu nasce.
  const window = { target: 1, current: 1 };

  const material = createPointMaterial();

  /**
   * A MESMA atenuação da janela temporal que o vertex shader calcula em `vReveal`, em JS.
   *
   * Está duplicada de propósito e não dá para evitar: o anel é geometria com material próprio,
   * não um ponto daquele buffer. O que não pode é divergir — se uma das duas mudar, a estrela
   * apaga e o anel fica aceso em volta do vazio.
   */
  const dimOf = (recency) =>
    REVEAL_DIM + (1 - REVEAL_DIM) * (1 - smoothstep(0, REVEAL_BAND, recency - window.current));

  /**
   * Raio APARENTE da estrela `i`, nas unidades locais deste grupo — o que o anel precisa saber.
   *
   * Isto era uma constante (`0.39 * aSize`) em `rings.js`, e a constante estava errada de três
   * jeitos ao mesmo tempo, todos medidos:
   *
   * | O que muda o tamanho da estrela | Efeito na razão anel/estrela |
   * |---|---|
   * | `graphSpread` (0.3 a 2.5) | escala a GEOMETRIA e não o ponto → oscilação de 8× |
   * | `aIgnition` (até 1.6) | o pulso infla o ponto até ~4× → a estrela acesa engolia o anel |
   * | altura do framebuffer × DPR | `gl_PointSize` é pixel; o mundo, não → ~4× entre monitores |
   *
   * A conta é a inversão exata do vertex shader. `gl_PointSize` é DIÂMETRO em pixels do
   * framebuffer e vale `uSize·aSize·pulse·shrink·(300/z)`; um raio de mundo `R` à distância `z`
   * ocupa `R·(H/2)/(z·tan(fov/2))` pixels. Igualando os dois, `z` cancela — é por isso que uma
   * constante quase funcionava — e sobra tudo que a constante ignorava.
   *
   * Devolve o raio do SPRITE (metade do `gl_PointSize`), com o teto da GPU já aplicado. Onde o
   * anel cai a partir daí é decisão de `rings.js` — por rodapé de tela, não pelo limbo.
   */
  function starRadius(i, elapsed, viewportHeight, camera) {
    const spread = group.scale.x || 1;
    // Distância de VISTA do nó — a mesma que o shader usa em `-viewPosition.z`. Ela entra e sai
    // da conta (o ponto encolhe com 1/z e o mundo também), mas precisa estar nas duas pontas
    // para que o teto de `gl_PointSize` seja aplicado em pixels, que é onde ele existe.
    const distance = Math.max(
      camera.position.distanceTo(
        TEMP.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).multiplyScalar(spread)
      ),
      0.001
    );
    const pulseAmount = material.uniforms.uPulse.value;
    /*
     * A MESMA expressão do shader, inclusive o termo oscilante: se o ponto respira, o anel
     * respira junto. Com `prefers-reduced-motion` o `uPulse` é 0 nos dois lugares pelo mesmo
     * uniform.
     *
     * ⚠️ As três constantes agora vêm do `motion-catalog.js`, então elas não podem mais divergir —
     * eram literais aqui E no shader, e este comentário já afirmava que não havia "caminho
     * separado para manter em dia" enquanto havia três. O que continua duplicado é a FORMA da
     * expressão, que nenhuma constante resolve: mexeu num lado, mexa no outro (`VERTEX`, acima).
     */
    const pulse =
      1 + ignition[i] * (PULSE.inflate + Math.sin(elapsed * PULSE.rate) * PULSE.amplitude * pulseAmount);
    const within = 1 - smoothstep(0, REVEAL_BAND, nodes[i].recency - window.current);
    const shrink = 0.62 + (1 - 0.62) * within;
    const tangent = Math.tan((camera.fov * Math.PI) / 360);
    /*
     * THE SPRITE'S SIZE AND THE BODY'S SIZE ARE NOT THE SAME NUMBER, and conflating them is what
     * made the procedural surface unreachable.
     *
     * `POINT_SIZE_CAP` is a DRIVER limit on `gl_PointSize`: past 511px the GPU simply refuses to
     * draw the sprite any larger. That ceiling is true about pixels and false about geometry — a
     * body does not stop having size because the rasterizer stopped growing its point.
     *
     * Deriving `world` from the capped value imported that lie into the world: once the cap was
     * hit, `world` became proportional to the camera distance, so the body shrank in world units
     * at exactly the rate the camera approached. Apparent size then pinned at
     * `CAP × VISIBLE_CORE / 2 = 511 × 0.6 / 2 = 153.3px`, forever, for every body — measured with
     * `window.espatial.planet()` on three bodies spanning 1 to 103 chunks: all three reported
     * px 153 and detail level 0.61, at any distance.
     *
     * `planet.js` reaches full detail at `LOD_NEAR_PX = 200`. Above 153.3. So no camera move could
     * ever show a finished surface — the feature was not hidden, it was arithmetically impossible.
     *
     * The split below is the fix: the cap stays where it is true (the pixels the GPU will draw)
     * and the geometry keeps the uncapped size (what the body actually measures). They agree
     * everywhere except very close, which is exactly where the sprite hands the body over to the
     * surface mesh and `haloOf` opens its core.
     */
    const pointWanted = material.uniforms.uSize.value * sizes[i] * pulse * shrink * (POINT_SCALE / distance);
    const point = Math.min(pointWanted, POINT_SIZE_CAP);
    // De pixels de volta para unidades locais: um raio `R` a distância `z` ocupa
    // `R·H/(2·tan(fov/2)·z)` pixels. O `/spread` desfaz a escala que o grupo pai vai reaplicar.
    return {
      // Unidades locais do grupo — é nisso que a malha do anel é escalada. Do tamanho SEM teto:
      // ver o bloco acima. Com o teto aqui, o corpo encolhia no mundo na mesma taxa em que a
      // câmera se aproximava, e o tamanho aparente ficava preso em 153,3px.
      world: (pointWanted * tangent * distance) / (viewportHeight * spread),
      // E o tamanho APARENTE, em pixels. É ele que decide o nível de detalhe: distância de
      // mundo não serve, porque um astro grande e longe ocupa mais tela que um pequeno e
      // perto — e quem decide se vale carregar textura de rocha é a tela, não o mundo.
      px: point * 0.5,
    };
  }

  function load(payload) {
    dispose();
    nodes = (payload.nodes || []).filter(isSkyNode).map((node, i) => makeOrbit(node, i));

    /*
     * LUAS — as seções de um arquivo, quando a massa dele consegue segurá-las.
     *
     * Elas são sintetizadas AQUI e não vêm do servidor: `sections` já chega no payload (era ~23%
     * dele sem consumidor) e a decisão de quem vira lua é geometria da cena, não fato do corpus.
     * A regra inteira — limite de Roche por dentro, esfera de Hill por fora, razão de massas
     * mínima — está em `orbital-zones.js`, com a medida que escolheu cada constante.
     *
     * Entram no MESMO buffer de pontos que as estrelas: uma chamada de desenho, o picking do
     * three continua funcionando e a janela temporal as atinge junto com o pai. Medido antes de
     * escrever (`advance()` a 5 000 nós custa 0,109 ms de CPU por quadro, contra os 0,45 ms de GPU
     * da cena inteira) — as 182 luas deste corpus não chegam a aparecer no orçamento.
     *
     * ⚠️ Vão para o FIM do vetor de propósito: `advance()` posiciona a lua a partir da posição já
     * escrita do pai, e o laço é uma passada só. Inserir lua antes do pai a deixaria um quadro
     * atrasada — o mesmo defeito que a extinção do anel já pagou.
     */
    const centralMass = payload.stats?.chunks || nodes.reduce((sum, n) => sum + (n.chunks || 0), 0);
    const moons = [];
    moonsDropped = 0;
    nodes.forEach((node, parentIndex) => {
      if (node.type !== 'file') return;
      const held = moonsOf(node, centralMass, hash01);
      moonsDropped += held.dropped;
      for (const moon of held.moons) {
        moons.push({
          ...moon,
          type: 'moon',
          kind: node.kind,
          chunks: moon.mass,
          // A lua herda a recência do pai: ela não tem data própria, e atenuá-la por uma data
          // inventada afirmaria idade que não existe — a mesma regra que já vale para diretório.
          recency: node.recency,
          parentIndex,
          i: nodes.length + moons.length,
        });
      }
    });
    nodes = nodes.concat(moons);
    moonCount = moons.length;

    index = new Map(nodes.map((node, i) => [node.id, i]));

    const count = nodes.length;
    positions = new Float32Array(count * 3);
    ignition = new Float32Array(count);
    sizes = new Float32Array(count);
    const recencies = new Float32Array(count);
    supernovae = new Float32Array(count);
    const seeds = new Float32Array(count);
    halo = new Float32Array(count);
    haloIndex = -1;
    haloAmount = 0;
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    nodes.forEach((node, i) => {
      // Só ARQUIVO participa da janela temporal. Diretório e repo são agregados: não têm uma
      // data, têm as datas dos filhos. Atenuá-los por uma data inventada afirmaria idade que
      // não existe, então eles ficam sempre revelados (recência 0 = antes de qualquer corte).
      // A lua acompanha o pai na janela: some junto com ele, e não sozinha nem depois.
      recencies[i] = node.type === 'file' || node.type === 'moon' ? node.recency : 0;
      // Log no peso: um arquivo de 226 chunks não pode ser 226× maior que um de 1.
      //
      // A lua é a exceção, e por física: ela e o pai têm a mesma densidade, então a razão de
      // raios é a raiz cúbica da razão de massas — `orbital-zones.js` já resolveu isso. Reaplicar
      // a lei log aqui daria luas do tamanho do pai (medido: 0,46 a 1,00 do raio dele).
      sizes[i] = node.type === 'moon'
        ? node.drawRadius
        : node.type === 'file'
          ? 0.55 + Math.log2(1 + node.chunks) * 0.42
          : 1.5 + Math.log2(1 + node.chunks) * 0.3;
      // `supernova` é 0…1 e vem do servidor (`recency._annotate_supernova`), normalizado pelo
      // pico DESTE corpus. Nó que não é arquivo nunca é supernova: agregado não tem história
      // própria, tem a dos filhos.
      supernovae[i] = node.type === 'file' ? node.supernova || 0 : 0;
      // Semente da forma da casca. Sai do CAMINHO, não do índice: o índice muda quando o corpus
      // ganha ou perde um arquivo, e a supernova de um arquivo trocaria de silhueta sem que
      // nada tivesse acontecido com ele.
      seeds[i] = hash01(node.source ?? String(i), 7);
      color.setHex(KIND_COLORS[node.kind] ?? KIND_COLORS.other);
      colors.set([color.r, color.g, color.b], i * 3);
      registerPath(node, i);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aIgnition', new THREE.BufferAttribute(ignition, 1));
    geometry.setAttribute('aRecency', new THREE.BufferAttribute(recencies, 1));
    geometry.setAttribute('aSupernova', new THREE.BufferAttribute(supernovae, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aHalo', new THREE.BufferAttribute(halo, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    hidden = new Float32Array(count);
    geometry.setAttribute('aHidden', new THREE.BufferAttribute(hidden, 1));
    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);
    // Depois de `points` existir, senão o `needsUpdate` não tem em quem pegar. O filtro sobrevive
    // à recarga da topologia: quem desligou `config` não quer que ele volte sozinho porque o
    // disco mudou.
    applyKindFilter();

    edgePairs = (payload.edges || [])
      .map(([child, parent]) => [index.get(child), index.get(parent)])
      .filter(([a, b]) => a !== undefined && b !== undefined);

    /*
     * ADJACÊNCIA, não geometria. O grafo guarda QUEM se liga a quem; desenhar é de quem
     * pergunta.
     *
     * Bidirecional de propósito: hoje os pares são filho→pai, mas as relações do Graphiti que
     * vão entrar aqui incluem folha↔folha entre grupos distantes — e quem passa o cursor num
     * nó quer ver o vínculo independentemente de qual ponta ele é.
     */
    neighbours = new Map();
    const ligar = (a, b) => {
      if (!neighbours.has(a)) neighbours.set(a, []);
      neighbours.get(a).push([a, b]);
    };
    for (const [a, b] of edgePairs) { ligar(a, b); ligar(b, a); }

    advance(0);
    return count;
  }

  /**
   * Indexa o nó pelo caminho com que o `/api/dirty` fala.
   *
   * ⚠️ Esta regra é a INVERSA de `dirty.state_of` no servidor, e as duas têm que continuar
   * concordando: lá o primeiro segmento do `source` (o repo) é descartado para consultar a
   * tabela do `git status`, que é relativa à raiz do workspace. Aqui ele é descartado para
   * construir a mesma chave. Mudar o formato de `source` de um lado sem o outro não quebra
   * nada visivelmente — só apaga todos os anéis, em silêncio.
   *
   * `source` absoluto fica de fora pelo mesmo motivo que lá: são as memórias do agente, que
   * não moram em git nenhum e portanto não têm alteração local a reportar.
   */
  function registerPath(node, i) {
    if (node.type !== 'file') return;
    const source = node.source || '';
    if (!source || source.startsWith('/')) return;
    const slash = source.indexOf('/');
    if (slash < 0) return;
    byPath.set(source.slice(slash + 1), i);
  }

  function makeOrbit(node, i) {
    const [min, max] = SHELLS[node.type] || SHELLS.file;

    /*
     * O RAIO É A RECÊNCIA. Recente perto do núcleo, antigo na periferia.
     *
     * Era hash do id: estável, e arbitrário — a geometria não dizia nada. Agora o servidor
     * manda `recency` (posição no ranking da data do último commit) e a distância ao centro
     * passa a informar quanto conhecimento é mais novo que aquele.
     *
     * A direção não é escolha estética: o briefing define que memória nova CAI em direção ao
     * buraco negro. Recente junto ao fogo, antigo à deriva.
     *
     * O hash continua governando ângulo e inclinação, que é o que mantém a posição estável
     * entre sessões e espalhada no anel.
     */
    const recency = typeof node.recency === 'number' ? node.recency : 0.5;
    const radius = min + (1 - recency) * (max - min);
    return {
      ...node,
      // Grava a recência RESOLVIDA (com o fallback já aplicado) no nó, e é ela que alimenta o
      // atributo do shader. Recalcular o fallback num segundo lugar é como raio e janela
      // passariam a discordar sem que nada acusasse.
      recency,
      radius,
      // Inclinação enviesada para o plano do disco: céu esférico perfeito perde a leitura
      // de "galáxia", que é o que a referência mostra.
      inclination: (hash01(node.id, 2) - 0.5) * Math.PI * 0.55,
      phase: hash01(node.id, 3) * Math.PI * 2,
      // `sqrt(GM/r³)` — a mesma função que dá o movimento médio das luas, com o mesmo `GM`. Era
      // `(r/26)^-1.5 · 0.16` aqui e `0.16² · 26³` lá, duas escritas da mesma constante.
      speed: meanMotion(radius),
      wobble: hash01(node.id, 4),
      i,
    };
  }

  function advance(elapsed) {
    if (!positions) return;
    /*
     * O balanço CONGELA com movimento reduzido, e é o único movimento daqui que congela.
     *
     * A órbita é amortecida e não parada (`respectMotion`, em `scene.js`) porque órbita parada
     * afirma que o sistema morreu. O balanço não afirma nada — ele é decorativo, e o
     * `motion-catalog.js` agora diz isso na cara. Movimento sem evento por trás é a categoria que
     * a regra deste projeto zera, junto com o grão e a respiração.
     *
     * Congelar a FASE, e não a amplitude: cada corpo guarda o deslocamento vertical que o hash lhe
     * deu e para ali. Zerar a amplitude alinharia o céu inteiro no plano, que é justamente a
     * leitura de lâminas rígidas que o balanço existe para desfazer.
     */
    const bobPhase = motion.isReduced() ? 0 : elapsed * rateOf(BOB);
    for (const node of nodes) {
      const offset = node.i * 3;

      /*
       * A LUA ORBITA O PAI, não o núcleo — e é o único corpo da cena assim.
       *
       * A posição do pai já está escrita: as luas vivem no fim do vetor (ver `load`). Somar o
       * deslocamento à posição dele em vez de recalcular a órbita do pai é o que garante que as
       * duas não possam divergir.
       *
       * Sem rotação própria: as 19 luas arredondadas do Sistema Solar estão travadas por maré, e
       * `catalog.js` proíbe `spin` em `lua` por isso. Aqui sai de graça — a lua é ponto, e ponto
       * não tem eixo. `bob` também não se aplica: ele é a oscilação vertical da órbita em torno do
       * núcleo, e a lua não orbita o núcleo.
       */
      if (node.type === 'moon') {
        const parent = node.parentIndex * 3;
        const e = node.eccentricity;
        // Anomalia MÉDIA: cresce linear no tempo. É a única grandeza da elipse que faz isso.
        const mean = node.meanAnomaly + elapsed * node.meanMotion * tune.speed;
        /*
         * EQUAÇÃO DO CENTRO — a elipse sem resolver Kepler por iteração.
         *
         * `M = E − e·sen E` é transcendental e o caminho normal é Newton. Aqui a série truncada
         * em `e²` basta e é melhor: o erro é O(e³), e a excentricidade máxima que a zona permite
         * é 0,23 (medido), então o desvio fica abaixo de 1,2% do semieixo — invisível num corpo de
         * poucos pixels. E ela é FUNÇÃO FECHADA do relógio, que é a lei do `motion-catalog.js`:
         * sem iteração não há estado acumulado, e a lua cai sempre no mesmo lugar no mesmo
         * instante, em qualquer sessão e a qualquer taxa de quadros.
         */
        const trueAnomaly =
          mean + 2 * e * Math.sin(mean) + 1.25 * e * e * Math.sin(2 * mean);
        // Equação do cônico. É o que faz a lua acelerar no periastro — a segunda lei de Kepler
        // aparece sozinha, sem ninguém animar velocidade.
        const r = (node.semiMajor * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
        // Periastro girado: a elipse aponta para um lado próprio deste corpo.
        const theta = trueAnomaly + node.periapsis;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        /*
         * Sem rotação própria: as 19 luas arredondadas do Sistema Solar estão travadas por maré, e
         * `catalog.js` proíbe `spin` em `lua`. Aqui sai de graça — lua é ponto, e ponto não tem
         * eixo. `bob` também não se aplica: ele é a oscilação da órbita em torno do NÚCLEO.
         */
        positions[offset] = positions[parent] + x;
        positions[offset + 1] = positions[parent + 1] + z * Math.sin(node.inclination);
        positions[offset + 2] = positions[parent + 2] + z * Math.cos(node.inclination);
        continue;
      }

      const angle = node.phase + elapsed * node.speed * tune.speed;
      const bob = Math.sin(bobPhase + node.wobble * BOB.phaseSpread) * node.radius * BOB.amplitude;
      /*
       * Rotação REAL em torno de X — a versão anterior não era uma órbita inclinada.
       *
       * Era `y = sin(inclinação) · raio`, CONSTANTE no ângulo: cada nó percorria uma
       * circunferência horizontal a altura fixa, paralela ao disco, sem nunca cruzar o plano. O
       * céu inteiro se movia em lâminas empilhadas, e o cabeçalho deste arquivo prometia que o
       * céu e o buraco negro obedecem à mesma física.
       *
       * Órbita inclinada de verdade cruza o plano de referência DUAS vezes por revolução — é a
       * definição de nó ascendente e descendente. Aqui o círculo é traçado no plano e depois
       * tombado: `y` passa a depender do ângulo, e o raio orbital deixa de encolher com a
       * inclinação (antes, `cos(inclinação)` achatava a órbita além de levantá-la).
       */
      const x = Math.cos(angle) * node.radius;
      const z = Math.sin(angle) * node.radius;
      positions[offset] = x;
      positions[offset + 1] = z * Math.sin(node.inclination) + bob;
      positions[offset + 2] = z * Math.cos(node.inclination);
    }
    points.geometry.attributes.position.needsUpdate = true;

    /*
     * A TEIA PERMANENTE SAIU DAQUI, e não por custo — por significado.
     *
     * Eram ~800 segmentos retos reposicionados todo quadro entre corpos com ω diferente
     * (`speed ∝ r^-1.5`). Isso é o problema do enrolamento: braço espiral não pode ser
     * estrutura material porque o material interno orbita mais rápido, e qualquer estrutura
     * rígida se enrola em poucas rotações. As linhas cisalhavam a 60 Hz e o resultado era
     * ruído, não topologia. Quem desenha vínculo agora é `space/links.js`, sob demanda e
     * como arco recalculado — padrão, não estrutura.
     */
  }

  /**
   * Este nó está escondido pelo filtro de tipo?
   *
   * Só ARQUIVO e LUA têm tipo. Repo e pasta são agregados — esconder a galáxia porque o operador
   * desligou `config` apagaria o continente junto com a cidade, e o histograma que comanda o
   * filtro nem conta agregados. A lua herda o `kind` do pai (ver `load`), então ela some junto com
   * ele de graça, que é o único comportamento coerente: lua de arquivo escondido órbita o nada.
   */
  const isFiltered = (node) =>
    Boolean(visibleKinds) &&
    (node.type === 'file' || node.type === 'moon') &&
    !visibleKinds.has(node.kind || 'other');

  function applyKindFilter() {
    if (!hidden || !points) return;
    for (let i = 0; i < nodes.length; i++) hidden[i] = isFiltered(nodes[i]) ? 1 : 0;
    points.geometry.getAttribute('aHidden').needsUpdate = true;
    /*
     * O anel é reconstruído AQUI, e não deixado para a próxima varredura do disco.
     *
     * A varredura roda por temporizador; esperar por ela deixaria um anel órfão girando em volta
     * de uma estrela que já saiu da tela, por segundos. O gesto do filtro é imediato e o que ele
     * remove tem de sair junto — `ringEntries` guarda a última lista exatamente para isto.
     */
    rings.set(ringEntries.filter((entry) => !hidden[entry.index]));
  }

  function dispose() {
    ringEntries = [];
    rings.set([]);
    moonCount = 0;
    moonsDropped = 0;
    byPath = new Map();
    dirtyState = new Map();
    for (const object of [points]) {
      if (!object) continue;
      group.remove(object);
      object.geometry.dispose();
    }
    points = null;
    neighbours = new Map();
  }

  return {
    group,
    load,
    count: () => nodes.length,

    /**
     * Quantas luas foram desenhadas e quantas seções não couberam.
     *
     * O corte é geométrico (ver `orbital-zones.moonsOf`), mas quem corta tem de dizer: uma seção
     * que some sem aviso lê como "este documento não tem essa parte". Mesmo contrato do
     * `rings.set`.
     */
    moonReport: () => ({ shown: moonCount, dropped: moonsDropped }),

    /** Acende os nós citados. `sources` são os mesmos ids que a busca devolve. */
    ignite(sources, amount = 1) {
      if (!ignition) return [];
      const lit = [];
      for (const source of sources) {
        const i = index.get(source);
        if (i === undefined) continue;
        ignition[i] = Math.min(1.6, ignition[i] + amount);
        lit.push({ node: nodes[i], position: positionOf(i) });
      }
      points.geometry.attributes.aIgnition.needsUpdate = true;
      return lit;
    },

    /**
     * Move a janela temporal. `value` está em espaço de recência (0 mais antigo … 1 mais novo),
     * o MESMO que define o raio — quem chama já sabe onde o anel vai parar.
     */
    reveal(value) {
      window.target = Math.max(0, Math.min(1, value));
    },

    /**
     * Põe anel nas estrelas cujo arquivo está alterado no disco.
     *
     * `table` é o `{caminho: estado}` do `/api/dirty`, cru. Caminho que não corresponde a
     * nenhum nó do céu é ignorado em silêncio aqui — mas contado no retorno, porque "editei um
     * arquivo e não apareceu anel" tem duas causas muito diferentes (não está indexado × está
     * quebrado) e quem chama precisa poder dizer qual foi.
     *
     * Devolve `{ shown, dropped, total }`.
     */
    markDirty(table) {
      const files = table || {};
      const entries = [];
      dirtyState = new Map();
      ringed = [];

      for (const [path, state] of Object.entries(files)) {
        const i = byPath.get(path);
        if (i === undefined) continue;
        dirtyState.set(nodes[i].source, state);
        /*
         * O CATÁLOGO decide se este corpo pode ter anel — não este laço.
         *
         * Antes, sujo bastava, e um arquivo que também era supernova saía com anel E casca: duas
         * classes no mesmo objeto. `classify` devolve UMA classe, e só a de planeta anelado
         * desenha anel. Regra em `space/catalog.js`, com o porquê da prioridade.
         */
        if (classify(nodes[i], { dirty: state }).id !== 'planeta-anelado') continue;
        // Corpo escondido não deixa o anel dele para trás: um anel sem estrela no meio lê como
        // defeito de render, e o filtro é justamente o gesto de tirar aquele tipo da tela.
        if (hidden?.[i]) continue;
        entries.push({ index: i, size: sizes[i], state, recency: nodes[i].recency });
        ringed.push(i);
      }

      /*
       * O ENVOLTÓRIO CEDE AO ANEL — e até aqui essa regra era só declarada.
       *
       * `catalog.js` proíbe `envelope` em `planeta-anelado` desde que existe ("anel e envoltório
       * à volta do mesmo núcleo é o empilhamento que criou o catálogo"), mas nada aplicava: o
       * anel nasce de `classify` e a casca vem direto deste atributo, sem consultar classe. Um
       * arquivo sujo E muito reescrito — o caso mais comum, porque o que você edita hoje costuma
       * ser o que mais editou no mês — desenhava os dois ao mesmo tempo.
       *
       * A resolução é reescrita a cada varredura do disco porque o fato que a decide é
       * perecível: some no commit, e a casca volta sozinha.
       */
      const comAnel = new Set(ringed);
      let mudouCasca = false;
      for (let i = 0; i < nodes.length; i++) {
        const alvo = comAnel.has(i) || nodes[i].type !== 'file' ? 0 : nodes[i].supernova || 0;
        if (supernovae[i] !== alvo) {
          supernovae[i] = alvo;
          mudouCasca = true;
        }
      }
      if (mudouCasca) points.geometry.getAttribute('aSupernova').needsUpdate = true;

      ringEntries = entries;
      return { ...rings.set(entries), total: Object.keys(files).length };
    },

    /** Estado local do arquivo daquele nó, ou `null` se limpo/desconhecido. */
    dirtyOf: (source) => dirtyState.get(source) ?? null,

    /** Teto de anéis do perfil de qualidade — repassado para quem os desenha. */
    setMaxRings: (value) => rings.setMaxRings(value),

    /** Apaga os anéis sem afirmar árvore limpa — para quando o disco deixa de ser verificável. */
    forgetDirty() {
      dirtyState = new Map();
      ringed = [];
      rings.set([]);
    },

    update(delta, elapsed, camera, viewportHeight) {
      if (!positions) return;
      material.uniforms.uTime.value = elapsed;
      // Suavização por TEMPO, nunca fração por quadro: fração por quadro produz travadinha em
      // qualquer queda de FPS e o arraste passaria a parecer o render engasgando.
      if (Math.abs(window.target - window.current) > 0.0002) {
        window.current += (window.target - window.current) * (1 - Math.exp(-REVEAL_RATE * delta));
        material.uniforms.uReveal.value = window.current;
      }
      advance(elapsed);
      // Depois de `advance`, nunca antes: o anel lê a posição QUE ACABOU de ser escrita. Um
      // quadro de atraso aqui aparece como o anel arrastando atrás da estrela.
      if (camera && viewportHeight) {
        rings.follow(
          positions,
          camera,
          dimOf,
          (i) => starRadius(i, elapsed, viewportHeight, camera),
          elapsed
        );
      }
      // Decaimento: memória usada volta a brilhar e depois apaga de novo. Sem o decaimento
      // o céu vira um acúmulo permanente de tudo que já foi consultado.
      let dirty = false;
      for (let i = 0; i < ignition.length; i++) {
        if (ignition[i] <= 0.001) continue;
        ignition[i] = Math.max(0, ignition[i] - delta * IGNITION_DECAY);
        dirty = true;
      }
      if (dirty) points.geometry.attributes.aIgnition.needsUpdate = true;
    },

    /** Nó sob o cursor, para hover e clique. */
    pick(raycaster) {
      if (!points) return null;
      raycaster.params.Points.threshold = 0.9;
      /*
       * ⚠️ TODOS os acertos, não o primeiro: o raycast do three não sabe do filtro.
       *
       * Ele trabalha sobre as POSIÇÕES, e um nó escondido continua tendo posição — o descarte
       * acontece no clipe, na GPU, onde o raycast não olha. Pegar `[0]` devolveria um corpo
       * invisível, e o gesto morreria em silêncio: a câmera voaria para o nada e o leitor abriria
       * um arquivo que o operador acabou de tirar da tela.
       */
      for (const hit of raycaster.intersectObject(points, false)) {
        if (hit.distanceToRay > 1.4) return null;
        if (hidden?.[hit.index]) continue;
        return { node: nodes[hit.index], position: positionOf(hit.index) };
      }
      return null;
    },

    /**
     * Que tipos ficam visíveis. `null` devolve o céu inteiro.
     *
     * @param {Iterable<string>|null} kinds
     */
    setKindFilter(kinds) {
      visibleKinds = kinds ? new Set(kinds) : null;
      applyKindFilter();
    },

    /** Afinação: espaçamento escala o grupo, então nós e arestas seguem juntos. */
    tune(values) {
      material.uniforms.uPulse.value = motion.isReduced() ? 0 : 1;
      group.scale.setScalar(values.graphSpread);
      material.uniforms.uSize.value = 4.6 * values.nodeSize;
      tune.speed = values.graphSpeed;
    },

    positionOf,

    /**
     * Onde aquele nó está AGORA, em coordenadas de mundo.
     *
     * ⚠️ `positionOf` devolve coordenada LOCAL deste grupo, e o grupo é escalado por
     * `graphSpread` (0.3 a 2.5). Quem for apontar a câmera precisa da posição de mundo — usar a
     * local faria a câmera mirar num ponto que não é o do astro, e o erro cresceria com o
     * slider até o objeto sair do quadro.
     *
     * Devolve `null` quando o nó não está no céu: o corpus muda, e mirar num nó que já não
     * existe deixaria a câmera presa apontando para o vazio.
     */
    /**
     * Onde, NA TELA, estão os corpos que carregam sinal acionável — e com que raio.
     *
     * Existe para a HUD poder sair da frente deles. O raio é o do sistema de anéis, não o do
     * astro: o que disputa contraste com o texto é o anel, que é bem maior que o núcleo.
     *
     * @returns {Array<{x: number, y: number, r: number}>} em pixels de CSS
     */
    signalPoints(camera, width, height, elapsed) {
      const out = [];
      if (!positions || !ringed.length || !camera) return out;
      for (const i of ringed) {
        const at = positionOf(i).multiplyScalar(group.scale.x || 1).project(camera);
        // Atrás da câmera: `project` devolve coordenadas espelhadas e o furo apareceria do lado
        // oposto da tela, seguindo um astro que ninguém está vendo.
        if (at.z > 1) continue;
        const size = starRadius(i, elapsed, height, camera);
        out.push({
          x: (at.x * 0.5 + 0.5) * width,
          y: (-at.y * 0.5 + 0.5) * height,
          r: size.px * VISIBLE_CORE * SPAN_HINT,
        });
      }
      return out;
    },

    /**
     * Tudo que a cena precisa para pousar um PLANETA sobre um astro, num só lugar.
     *
     * Existe como método daqui, e não como três getters, porque os três números têm de vir do
     * MESMO quadro e da MESMA conta que já escala a estrela: posição, raio do disco visível e
     * tamanho aparente. Espalhados, bastaria um deles atrasar um quadro para o planeta descolar
     * do halo — que é exatamente o defeito que a extinção do anel teve.
     *
     * @returns {{position: THREE.Vector3, radius: number, px: number, node: object}|null}
     *   em unidades de MUNDO. `radius` é o disco VISÍVEL do astro, não o do sprite.
     */
    planetAnchor(source, camera, viewportHeight, elapsed) {
      const i = index.get(source);
      if (i === undefined || !positions || !camera || !viewportHeight) return null;
      const size = starRadius(i, elapsed, viewportHeight, camera);
      const escala = group.scale.x || 1;
      const position = positionOf(i).multiplyScalar(escala);
      const radius = size.world * VISIBLE_CORE * escala;
      /*
       * O tamanho aparente sai da GEOMETRIA, não do sprite — e a diferença foi medida.
       *
       * `starRadius().px` é metade do `gl_PointSize`, que satura no teto de 511 do driver e
       * ainda oscila com o pulso da ignição. Na mesma pose ele deu 75 e 153, atravessando o
       * limiar de 90 do planeta nos dois sentidos: a superfície piscava. Aqui é a projeção
       * exata do raio no plano da tela — monótona na distância, imune ao teto e ao pulso.
       */
      const meiaAltura = Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(position);
      return {
        position,
        radius,
        px: (radius * viewportHeight) / (2 * Math.max(meiaAltura, 1e-4)),
        node: nodes[i],
      };
    },

    /**
     * O sprite deste astro vira HALO: o núcleo sólido se abre e sobra a coroa em volta.
     *
     * É o que impede o ponto aditivo e o planeta de desenharem a mesma coisa no mesmo lugar. O
     * ponto não escreve profundidade e o planeta escreve, então sem isto o sprite ficaria
     * somando brilho por cima da superfície e apagando o terminador — justo o que o planeta tem
     * de mais legível.
     *
     * @param {string|null} source  o astro que virou planeta, ou `null` para devolver todos
     * @param {number} amount       0…1, acompanha o nível de detalhe para a troca não ser seca
     */
    haloOf(source, amount = 1) {
      if (!halo) return;
      const alvo = source === null ? -1 : (index.get(source) ?? -1);
      // Só escreve quando MUDA: `needsUpdate` num atributo de 468 floats por quadro é upload de
      // buffer por quadro, e o valor é o mesmo em 99% deles.
      if (alvo === haloIndex && Math.abs(amount - haloAmount) < 0.004) return;
      if (haloIndex >= 0) halo[haloIndex] = 0;
      if (alvo >= 0) halo[alvo] = amount;
      haloIndex = alvo;
      haloAmount = amount;
      points.geometry.getAttribute('aHalo').needsUpdate = true;
    },

    /**
     * Os vínculos deste astro, como pares de índices prontos para desenhar.
     *
     * @returns {Array<[number, number]>} vazio se o astro não existe ou não tem vínculo
     */
    /**
     * O buffer VIVO de posições, para quem desenha por cima do céu.
     *
     * Devolve a referência, não uma cópia: quem recebe lê no mesmo quadro e copiar 468 vec3 por
     * quadro seria pagar por uma garantia que ninguém precisa aqui. Contrato: só leitura.
     */
    positions: () => positions,

    linksOf(source) {
      const i = index.get(source);
      if (i === undefined) return [];
      return neighbours.get(i) || [];
    },

    /**
     * Os NÓS vizinhos deste, na mesma ordem em que `linksOf` devolve os pares.
     *
     * Existe para que a legenda do vínculo possa nomear o destino do arco sem que a HUD conheça
     * o grafo — ela recebe nó pronto pelo barramento. A ordem ser a mesma não é detalhe: o teto
     * de arcos corta o FIM da lista, e duas ordens diferentes fariam a legenda nomear justamente
     * o vínculo que ficou de fora do desenho.
     */
    neighborsOf(source) {
      const i = index.get(source);
      if (i === undefined) return [];
      return (neighbours.get(i) || []).map(([, other]) => nodes[other]).filter(Boolean);
    },

    worldPositionOf(source) {
      const i = index.get(source);
      if (i === undefined || !positions) return null;
      return positionOf(i).multiplyScalar(group.scale.x || 1);
    },

    nodeAt: (source) => nodes[index.get(source)] ?? null,
    kindColor: (kind) => KIND_COLORS[kind] ?? KIND_COLORS.other,
  };

  function positionOf(i) {
    return new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  }
}
