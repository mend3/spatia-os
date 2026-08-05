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
import { createRings } from './rings.js';

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
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vIgnition;
  varying float vReveal;
  varying float vSupernova;

  void main(){
    vIgnition = aIgnition;
    vSupernova = aSupernova;
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
    float pulse = 1.0 + aIgnition * (1.6 + sin(uTime * 9.0) * 0.35 * uPulse);
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
 * `aSupernova` desenha um anel concêntrico à volta dele (estado durável do repositório). A
 * ignição nunca produz anel, então não há como confundir os dois — e a casca fica na cor do
 * próprio nó, porque a cor já carrega o TIPO de conhecimento e roubá-la custaria essa leitura.
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

  const float SHELL_RADIUS = 0.78;
  const float SHELL_WIDTH = 0.085;

  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = pow(1.0 - smoothstep(0.0, 1.0, d), 2.2);
    // Corona só em nó aceso: dá o "volta a brilhar" sem inflar o céu inteiro.
    float corona = (1.0 - smoothstep(0.0, 1.3, d)) * vIgnition * 0.55;
    float t = (d - SHELL_RADIUS) / SHELL_WIDTH;
    float shell = exp(-t * t) * vSupernova * 0.9;
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

/** Hash determinístico string → [0,1). Mesmo id, mesma órbita, em qualquer máquina. */
function hash01(text, salt = 0) {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
}

// Vetor de rascunho: a distância do nó à câmera é calculada por anel, por quadro.
const TEMP = new THREE.Vector3();

export function createGraph() {
  const group = new THREE.Group();
  let nodes = [];
  let index = new Map();
  let positions = null;
  let ignition = null;
  let sizes = null;
  let points = null;
  let lines = null;
  let linePositions = null;
  let edgePairs = [];
  // Caminho relativo à raiz do workspace → índice do nó. É a chave com que o `/api/dirty`
  // fala, e existe para que casar "arquivo sujo" com "estrela" não custe uma varredura.
  let byPath = new Map();
  // source → estado local, para quem pergunta (o rótulo de hover). Separado do `rings`
  // porque texto e geometria têm ciclos de vida diferentes.
  let dirtyState = new Map();
  const rings = createRings();
  group.add(rings.group);
  const tune = { speed: 1 };
  // Alvo e valor corrente da janela: 1 = tudo revelado, que é como o céu nasce.
  const window = { target: 1, current: 1 };

  const material = new THREE.ShaderMaterial({
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

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x2d3648,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

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
    // A MESMA expressão do shader, inclusive o termo oscilante: se o ponto respira, o anel
    // respira junto. Com `prefers-reduced-motion` o `uPulse` é 0 nos dois lugares pelo mesmo
    // uniform — nenhum caminho separado para manter em dia.
    const pulse = 1 + ignition[i] * (1.6 + Math.sin(elapsed * 9) * 0.35 * pulseAmount);
    const within = 1 - smoothstep(0, REVEAL_BAND, nodes[i].recency - window.current);
    const shrink = 0.62 + (1 - 0.62) * within;
    const tangent = Math.tan((camera.fov * Math.PI) / 360);
    // A MESMA expressão do `gl_PointSize`, com o MESMO teto que a GPU aplica.
    const point = Math.min(
      material.uniforms.uSize.value * sizes[i] * pulse * shrink * (POINT_SCALE / distance),
      POINT_SIZE_CAP
    );
    // De pixels de volta para unidades locais: um raio `R` a distância `z` ocupa
    // `R·H/(2·tan(fov/2)·z)` pixels. O `/spread` desfaz a escala que o grupo pai vai reaplicar.
    return (point * tangent * distance) / (viewportHeight * spread);
  }

  function load(payload) {
    dispose();
    nodes = (payload.nodes || []).filter(isSkyNode).map((node, i) => makeOrbit(node, i));
    index = new Map(nodes.map((node, i) => [node.id, i]));

    const count = nodes.length;
    positions = new Float32Array(count * 3);
    ignition = new Float32Array(count);
    sizes = new Float32Array(count);
    const recencies = new Float32Array(count);
    const supernovae = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    nodes.forEach((node, i) => {
      // Só ARQUIVO participa da janela temporal. Diretório e repo são agregados: não têm uma
      // data, têm as datas dos filhos. Atenuá-los por uma data inventada afirmaria idade que
      // não existe, então eles ficam sempre revelados (recência 0 = antes de qualquer corte).
      recencies[i] = node.type === 'file' ? node.recency : 0;
      // Log no peso: um arquivo de 226 chunks não pode ser 226× maior que um de 1.
      sizes[i] = node.type === 'file'
        ? 0.55 + Math.log2(1 + node.chunks) * 0.42
        : 1.5 + Math.log2(1 + node.chunks) * 0.3;
      // `supernova` é 0…1 e vem do servidor (`recency._annotate_supernova`), normalizado pelo
      // pico DESTE corpus. Nó que não é arquivo nunca é supernova: agregado não tem história
      // própria, tem a dos filhos.
      supernovae[i] = node.type === 'file' ? node.supernova || 0 : 0;
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
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);

    edgePairs = (payload.edges || [])
      .map(([child, parent]) => [index.get(child), index.get(parent)])
      .filter(([a, b]) => a !== undefined && b !== undefined);

    linePositions = new Float32Array(edgePairs.length * 6);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.frustumCulled = false;
    group.add(lines);

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
      speed: Math.pow(radius / SHELLS.file[0], -1.5) * 0.16,
      wobble: hash01(node.id, 4),
      i,
    };
  }

  function advance(elapsed) {
    if (!positions) return;
    for (const node of nodes) {
      const angle = node.phase + elapsed * node.speed * tune.speed;
      const bob = Math.sin(elapsed * 0.35 + node.wobble * 6.28) * node.radius * 0.045;
      const offset = node.i * 3;
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

    for (let e = 0; e < edgePairs.length; e++) {
      const [a, b] = edgePairs[e];
      linePositions[e * 6] = positions[a * 3];
      linePositions[e * 6 + 1] = positions[a * 3 + 1];
      linePositions[e * 6 + 2] = positions[a * 3 + 2];
      linePositions[e * 6 + 3] = positions[b * 3];
      linePositions[e * 6 + 4] = positions[b * 3 + 1];
      linePositions[e * 6 + 5] = positions[b * 3 + 2];
    }
    lines.geometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    rings.set([]);
    byPath = new Map();
    dirtyState = new Map();
    for (const object of [points, lines]) {
      if (!object) continue;
      group.remove(object);
      object.geometry.dispose();
    }
    points = lines = null;
  }

  return {
    group,
    load,
    count: () => nodes.length,

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

      for (const [path, state] of Object.entries(files)) {
        const i = byPath.get(path);
        if (i === undefined) continue;
        dirtyState.set(nodes[i].source, state);
        entries.push({ index: i, size: sizes[i], state, recency: nodes[i].recency });
      }

      return { ...rings.set(entries), total: Object.keys(files).length };
    },

    /** Estado local do arquivo daquele nó, ou `null` se limpo/desconhecido. */
    dirtyOf: (source) => dirtyState.get(source) ?? null,

    /** Teto de anéis do perfil de qualidade — repassado para quem os desenha. */
    setMaxRings: (value) => rings.setMaxRings(value),

    /** Apaga os anéis sem afirmar árvore limpa — para quando o disco deixa de ser verificável. */
    forgetDirty() {
      dirtyState = new Map();
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
        rings.follow(positions, camera, dimOf, (i) =>
          starRadius(i, elapsed, viewportHeight, camera)
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
      const hit = raycaster.intersectObject(points, false)[0];
      if (!hit || hit.distanceToRay > 1.4) return null;
      return { node: nodes[hit.index], position: positionOf(hit.index) };
    },

    /** Afinação: espaçamento escala o grupo, então nós e arestas seguem juntos. */
    tune(values) {
      material.uniforms.uPulse.value = motion.isReduced() ? 0 : 1;
      group.scale.setScalar(values.graphSpread);
      material.uniforms.uSize.value = 4.6 * values.nodeSize;
      lineMaterial.opacity = values.edgeOpacity;
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
