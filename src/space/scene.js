/**
 * A cena: renderer, cadeia de pós-processamento, câmera, e a tradução de eventos em imagem.
 *
 * Ordem da cadeia importa e não é arbitrária:
 *
 *   render → lente → bloom → output
 *
 * A lente vem **antes** do bloom porque o brilho tem que florescer a partir da imagem já
 * deformada — florescer antes e deformar depois arrastaria o halo junto com a distorção, o
 * que denuncia o truque na hora. O `OutputPass` fecha com tone mapping e conversão de
 * espaço de cor; sem ele o aditivo estoura em branco chapado.
 */
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/jsm/postprocessing/OutputPass.js';

import { on, ui } from '../core/bus.js';
import * as tuning from '../core/tuning.js';
import * as prefs from '../core/prefs.js';
import { createBlackHole } from './blackhole.js';
import { createLensingPass } from './lensing.js';
import { createStars } from './stars.js';
import { createGraph, hash01 } from './graph.js';
import * as motion from '../core/motion.js';
import { createParticles } from './particles.js';
import { createSatellites, createWormholes, TOOL_COLORS } from './satellites.js';
import { createBodies } from './bodies.js';
import { createBackdrop } from './backdrop.js';
import { createPlanet, planetParams } from './planet.js';
import { createLinks } from './links.js';
import { classify, allows } from './catalog.js';
import { createPhotosphere, photosphereParams } from './photosphere.js';

/*
 * `start.z` acompanha `graphSpread`: a casca de nós foi de 46–110 para 68–160 unidades, e uma
 * câmera parada em 54 ficaria DENTRO dela — olhando o grafo de dentro para fora.
 */
const CAMERA = { fov: 46, near: 0.1, far: 900, start: new THREE.Vector3(0, 12, 88) };

/**
 * Suavização exponencial independente de frame rate.
 *
 * `x += (alvo - x) * k` é a forma tentadora e está errada: `k` é fração POR QUADRO, então a
 * 120fps a câmera converge duas vezes mais rápido que a 60fps, e num quadro longo ela dá um
 * salto. Como o quadro longo acontece exatamente quando se arrasta o mouse (raycast + upload
 * de buffers no mesmo frame), o defeito aparece no pior momento possível.
 *
 * Com `1 - exp(-rate * delta)` o resultado depende só do tempo decorrido: mesma trajetória a
 * qualquer FPS, e quadro perdido não vira tranco. `rate` é em unidades de 1/segundo.
 */
const smooth = (current, target, rate, delta) =>
  current + (target - current) * (1 - Math.exp(-rate * delta));

// Taxas de convergência, em 1/s. Câmera responde rápido, regime cognitivo respira devagar.
const RATE = { orbit: 9, zoom: 6, focus: 1.4, portal: 5 };
const PICK_INTERVAL_MS = 60;
const DRIFT_BASE = 0.014;
const LONG_FRAME_MS = 50;
const MAX_PIXEL_RATIO = 2;
/*
 * Salvamento periódico da órbita. Não é "a cada quadro": o que se guarda é ONDE O OPERADOR
 * DEIXOU a câmera, e entre dois gestos não há nada de novo para gravar.
 */
const ORBIT_SAVE_MS = 5_000;
/*
 * Enquadramento de um astro do céu. Mais perto que o de um corpo de app (30) porque um nó é um
 * ponto, não uma malha: à distância do app ele seria um pixel no meio da tela.
 */
/*
 * Distância da câmera ao astro focado.
 *
 * Era 16, e nunca tinha sido conferida contra o tamanho do que se olha. Medido no maior arquivo
 * do corpus (226 chunks): raio visível de 0,64 no mundo, o que a 16 unidades dá ~70px de raio
 * aparente — abaixo do limiar de 90 em que a superfície procedural entra. O astro travava e
 * continuava sendo um ponto.
 *
 * A 7, o mesmo astro passa de 160px e vira planeta. Corpos menores continuam pontos, e isso é o
 * nível de detalhe funcionando: quem é pequeno de verdade não ganha crosta por ter sido clicado.
 */
const NODE_FOCUS_DISTANCE = 7;
const NODE_FOCUS_POLAR = 1.18;

/**
 * ZOOM SCOPED TO THE FOCUSED BODY — and why a distance in world units could never work.
 *
 * Free flight is clamped to `ZOOM_RANGE`, which is right for a camera orbiting the whole sky.
 * Locked onto a body it was wrong in a way that silently disabled a feature: the floor (12) sat
 * FARTHER than the distance focus itself flies to (7), so the first notch of the wheel pushed the
 * camera away from the very thing it had just locked onto.
 *
 * Measured on this machine before the change, with `window.espatial.planet()`:
 *
 * | body | distance | apparent radius | detail level |
 * |---|---|---|---|
 * | heaviest file, 103 chunks | 6.86 | 153px | 0.61 |
 * | median file, 4 chunks | 6.86 | 92px | 0.00 |
 *
 * `planet.js` fades the surface in from `LOD_FAR_PX` (90) and reaches full detail at
 * `LOD_NEAR_PX` (200). So the median body sat ON the threshold and showed nothing, the heaviest
 * never got past 61% of the ramp — and one wheel notch dropped the median to ~88px, under the
 * threshold entirely. The procedural surface was not hidden; it was unreachable.
 *
 * A fixed world distance cannot fix that, and this is the crux: apparent size is what decides
 * detail, and it depends on the body's RADIUS, which varies with `log2(chunks)`. The same 7 units
 * gave 92px to one body and 153px to another. So focus stops targeting a distance and starts
 * targeting an apparent size, and the floor becomes a multiple of the body's own radius.
 */
/** Apparent radius, in CSS-independent device px, the camera aims for when focus lands. */
const FOCUS_FIT_PX = 260;
/**
 * Closest approach, in multiples of the body's visible radius.
 *
 * The number clears the RING, not the core. `catalog.js` caps the drawn span at `min(reach, 2.4)`
 * radii, and at 2.2 the camera ended up inside that shell — seen on screen: not a dramatic
 * close-up, just the ring plane cutting the frame in half.
 *
 * 3.4 nominal, and the distance actually reached is ~2.96 radii (measured): the anchor eases
 * toward a body that is orbiting, so it trails it slightly, and at close range that lag is a real
 * fraction of the distance. Still outside the 2.4 shell, with margin for the lag.
 *
 * There the core projects around 590px of apparent radius (measured), roughly 3x `LOD_NEAR_PX` —
 * full detail with room to spare. Framing the entire ring system instead would take ~5.7 radii,
 * and that is the arrival view's job (`FOCUS_FIT_PX`), not the floor's: arriving shows the body,
 * zooming in inspects it.
 */
const FOCUS_FLOOR_RADII = 3.4;
/** Free-flight range, when nothing is locked. */
const ZOOM_RANGE = { min: 12, max: 260 };
/**
 * Amplitude da paralaxe, em fração da distância da câmera.
 *
 * 0,015 a 88 unidades dá ~1,3 de mundo — deslocamento suficiente para o grafo se soltar do
 * fundo e pequeno demais para alguém apontar. Paralaxe que se percebe conscientemente deixou
 * de ser profundidade e virou movimento da câmera.
 */
const PARALLAX_SCALE = 0.015;
// 3 casas ≈ 0.06° de azimute. Abaixo disso é ruído de float, e ruído de float faria a guarda
// de "só se mudou" do `prefs` disparar uma escrita a cada tique, para sempre.
const ORBIT_STEP = 1e3;
const ZERO = new THREE.Vector3();

/**
 * @param {object} [options]
 * @param {Element} [options.labelLayer]
 * @param {{update: Function}} [options.signals]  recebe, por quadro, onde na TELA estão os
 *   corpos com sinal acionável. A cena não sabe o que o consumidor faz com isso — hoje é a HUD
 *   abrindo furo para não competir com o anel, e o tipo do parâmetro é o que mantém isso
 *   verdadeiro: um objeto com `update`, não "a HUD".
 */
export function createScene(canvas, { labelLayer, signals } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // o bloom e o grão já suavizam; MSAA aqui só custaria fill rate
    powerPreference: 'high-performance',
  });
  /*
   * O `pixelRatio` é o parâmetro mais caro da cena e é QUADRÁTICO: DPR 2 desenha 4× os
   * fragmentos de DPR 1, em toda a cadeia de pós-processamento. Por isso ele é do PERFIL, e não
   * um slider entre os 22 — um controle contínuo aqui convidaria a ajustar em passos de 0.05
   * uma grandeza que só tem três respostas úteis.
   */
  let pixelCeiling = MAX_PIXEL_RATIO;
  const applyPixelRatio = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCeiling));
    // `setSize` de novo porque o buffer de desenho muda de tamanho junto com o ratio; sem isto
    // o composer continua no tamanho antigo e a imagem sai esticada.
    resize();
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCeiling));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  camera.position.copy(CAMERA.start);

  const blackHole = createBlackHole();
  const stars = createStars();
  const graph = createGraph();
  const particles = createParticles();
  const satellites = createSatellites();
  const wormholes = createWormholes();
  const bodies = createBodies(labelLayer || document.body);
  const backdrop = createBackdrop();
  /*
   * UM planeta, reaproveitado. Nunca 460.
   *
   * Só o astro em foco ganha superfície: o campo de pontos continua sendo o céu, e a esfera
   * procedural é o que o zoom revela. Reaproveitar a instância em vez de criar uma por nó é o
   * que mantém a promessa do módulo — geometria, materiais e rampa nascem no primeiro quadro em
   * que alguém chega perto, e a rampa só é recozida quando a semente ou a paleta mudam.
   */
  const links = createLinks();
  const planet = createPlanet();
  const photosphere = createPhotosphere();
  let starParamsCache = null;
  let starSource = null;
  let planetSource = null;

  scene.add(
    // O fundo entra PRIMEIRO na lista e com `renderOrder` mínimo: ele é o que tudo o mais tapa.
    backdrop.object,
    stars.object, blackHole.group, graph.group, planet.object, photosphere.object,
    particles.object,
    satellites.group, wormholes.group, bodies.group
  );

  /*
   * Arcs belong INSIDE the graph group, not beside it.
   *
   * `links.update` is fed `graph.positions()` — the raw buffer, which holds coordinates LOCAL to
   * that group. The group carries the `graphSpread` scale (0.3–3.5, default 2.6) and the stars
   * are children of it, so they render at `local × spread` while an arc parented to the scene
   * root rendered at `local`. Every endpoint landed at `1/spread ≈ 38%` of its star's distance
   * from the origin: arcs collapsed toward the cluster, worst for the bodies farthest out. The
   * shape looked right because the whole arc shrank uniformly — only its anchoring was wrong.
   *
   * Parenting is the fix rather than copying the scale onto `links.object`, and the difference
   * matters: `tune()` runs on every slider move, so a copied scale is a second source of truth
   * that must be re-synced forever, and it would break outright the day the group gains a
   * rotation or an offset. It is also free — no per-frame work. Same treatment `rings.group`
   * already gets (`graph.js`, `group.add(rings.group)`), and for the same reason.
   *
   * Scale-invariant by construction, so nothing else needs adjusting: the Bézier bulge is a
   * fraction of the chord, `aAlong` is normalized per arc, and the shader has no world-space
   * term. `renderOrder = 1` still sorts globally because the group's own renderOrder is 0.
   */
  graph.group.add(links.object);

  const composer = new EffectComposer(renderer);
  const lensing = createLensingPass();
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.58, 0.32, 0.72);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(lensing.pass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /*
   * Órbita restaurada da sessão anterior — corrente E alvo no mesmo valor.
   *
   * Só o alvo faria a câmera VOAR da posição inicial até a salva no primeiro segundo, o que lê
   * como a cena se ajeitando sozinha. Os limites são os mesmos do `wheel` e do `pointermove`
   * porque storage é entrada não confiável: um valor fora de faixa vindo de uma versão antiga
   * (ou editado à mão) põe a câmera dentro do disco ou a 10 mil unidades daqui.
   */
  const startOrbit = {
    azimuth: readOrbit('camera.azimuth', -Infinity, Infinity),
    polar: readOrbit('camera.polar', 0.22, 2.9),
    distance: readOrbit('camera.distance', 12, 260),
  };
  const orbit = {
    azimuth: startOrbit.azimuth, polar: startOrbit.polar, distance: startOrbit.distance,
    targetAzimuth: startOrbit.azimuth,
    targetPolar: startOrbit.polar,
    targetDistance: startOrbit.distance,
  };
  /*
   * Só o que o OPERADOR moveu é digno de gravar.
   *
   * A deriva automática muda o azimute continuamente; gravá-la escreveria no localStorage a
   * cada tique da sessão inteira e ainda restauraria uma posição que ninguém escolheu. A marca
   * é levantada nos gestos reais (arrasto, roda) e no foco de um app.
   */
  let orbitMoved = false;
  /*
   * O enquadramento "em casa" — para onde `focusBody(null)` volta.
   *
   * Era a constante 54/1.33 escrita dentro do `focusBody`, e isso ANULAVA a restauração: o
   * `router.start` chama `focusBody` no boot, então a órbita recém-lida do storage era
   * sobrescrita pelo default antes do primeiro quadro — e o salvamento periódico gravava o
   * default por cima do que o operador tinha deixado. Medido: a câmera voltava para 54 em toda
   * sessão. Sair de um app tem que devolver ao enquadramento DO OPERADOR, não ao de fábrica.
   */
  const HOME = { polar: startOrbit.polar, distance: startOrbit.distance };
  const pointer = new THREE.Vector2(-2, -2);
  const raycaster = new THREE.Raycaster();
  const clock = new THREE.Clock();
  const focusTarget = new THREE.Vector3();

  let dragging = false;
  let userControlled = false;
  let cinematic = false;
  let glitch = 0;
  let hovered = null;
  let focusWeight = 0;
  let lastPick = 0;
  let hoveredBody = null;
  let focusedBody = null;
  /*
   * Astro do céu em foco — o `source` do nó, não um índice.
   *
   * Índice é posição num buffer que se refaz a cada `load`; `source` é a identidade do arquivo.
   * Guardar o índice faria a câmera passar a seguir OUTRO astro depois de uma recarga da
   * topologia, sem nada acusar.
   */
  let focusedNode = null;
  /** Radius and projection constant of the focused body, refreshed by the frame loop. */
  let focusGeometry = null;
  /** A focus flight is waiting for the first resolved anchor to correct its distance. */
  let fitPending = false;
  /** Parâmetros do planeta em foco. Recalculados só na TROCA de astro — são puros e congelados. */
  let planetParamsCache = null;
  const LIGHT_DIR = new THREE.Vector3();
  const ORBIT_OFFSET = new THREE.Vector3();
  const RADIAL = new THREE.Vector3();
  /*
   * Estado da paralaxe. `AIM` persegue o ponteiro com suavizacao por TEMPO — ponteiro cru
   * transportaria o ruido do mouse direto para a imagem, que e a mesma razao pela qual o
   * arraste da camera ja move o ALVO e nao a camera.
   */
  const PARALLAX_AIM = new THREE.Vector2();
  const PARALLAX_FWD = new THREE.Vector3();
  const PARALLAX_RIGHT = new THREE.Vector3();
  const PARALLAX_UP = new THREE.Vector3();
  const PARALLAX_SHIFT = new THREE.Vector3();
  let probe = null;
  let lastFocusRequest = null;
  // Alvo de órbita quando dentro de um app: a câmera passa a orbitar O CORPO, com o núcleo
  // ao fundo. `anchor` interpola entre a origem (sistema) e a posição do corpo.
  const anchor = new THREE.Vector3();
  const anchorTarget = new THREE.Vector3();
  const frames = { count: 0, long: 0, since: performance.now() };
  // Espelho local do store: o loop lê daqui em vez de chamar getters por quadro.
  let tune = tuning.values();

  /**
   * Uma assinatura só distribui a afinação para todos os módulos.
   *
   * Nenhum deles conhece o painel: cada um expõe `tune(values)` e recebe o objeto inteiro.
   * Parâmetro novo no SPEC vira uma linha no módulo que o consome — e nada mais.
   */
  /**
   * A afinação depois de obedecer `prefers-reduced-motion`.
   *
   * O ajuste é aqui, no ÚNICO ponto por onde os valores passam para todos os módulos — não em
   * cada shader. `grain` e `breath` vão a zero porque são movimento sem evento por trás; a
   * deriva do céu e a velocidade orbital são AMORTECIDAS e não zeradas, porque órbita parada
   * afirmaria que o sistema morreu, e o pedido é reduzir movimento, não remover estado.
   *
   * ⚠️ Isto faz o painel de afinação exibir um valor que não está em vigor. O painel diz isso na
   * própria tela (`controls.js`); um slider que não controla nada, em silêncio, é pior que um
   * slider ausente.
   */
  const QUIET_FACTOR = 0.25;
  function respectMotion(values) {
    if (!motion.isReduced()) return values;
    return {
      ...values,
      grain: 0,
      breath: 0,
      cameraDrift: 0,
      starDrift: values.starDrift * QUIET_FACTOR,
      graphSpeed: values.graphSpeed * QUIET_FACTOR,
      diskSpin: values.diskSpin * QUIET_FACTOR,
    };
  }

  function fanOut(raw) {
    const values = respectMotion(raw);
    tune = values;
    blackHole.tune(values);
    stars.tune(values);
    graph.tune(values);
    lensing.tune(values);
    bloom.strength = values.bloomStrength;
    bloom.threshold = values.bloomThreshold;
    if (camera.fov !== values.fov) {
      camera.fov = values.fov;
      camera.updateProjectionMatrix();
    }
  }

  tuning.subscribe(fanOut);
  // A preferência muda em runtime: religar "reduzir movimento" no sistema tem que apagar o grão
  // sem reload, então a mudança reaplica a afinação inteira pelo mesmo caminho.
  motion.subscribe(() => fanOut(tuning.values()));

  // ---------------------------------------------------------------- eventos → imagem

  on('ui.state-changed', ({ state }) => {
    blackHole.setRegime(state);
    stars.setUnstable(state === 'error');
  });

  on('memory', ({ hits }) => {
    // Acender a estrela e derrubá-la no núcleo é a mesma informação em dois canais: onde o
    // conhecimento está no céu, e que ele foi absorvido agora.
    const lit = graph.ignite((hits || []).map((hit) => hit.source), 1.2);
    for (const { node, position } of lit) {
      particles.infall(position, graph.kindColor(node.kind), 16);
    }
    blackHole.surge(Math.min(lit.length * 0.25, 1.2));
    if (lit.length) focusOn(lit.map((entry) => entry.position));
  });

  on('token', () => particles.outflow(outflowTarget(), 0xffe6bd, 2));
  on('thought', () => particles.outflow(outflowTarget(0.5, 0.86), 0x6f8bb0, 1));

  on('tool', (event) => {
    if (event.phase === 'call') {
      wormholes.open(event.id || event.tool, event.kind);
      blackHole.surge(0.3);
    } else if (event.phase === 'result') {
      wormholes.close(event.id || event.tool);
      if (event.ok === false) glitch = Math.max(glitch, 0.5);
    }
  });

  on('web', (event) => {
    const position = satellites.activate(event.provider);
    if (!position) return;
    if (event.phase === 'start') {
      // Consulta subindo: do núcleo para o satélite.
      particles.outflow(position, 0xff9b4a, 8);
    } else if (event.phase === 'result') {
      // Resultado voltando como meteoro: do satélite para o núcleo.
      particles.infall(position, 0xffb066, 10 + (event.results?.length || 0) * 3);
    }
  });

  on('error', () => {
    glitch = 1;
    particles.burst(new THREE.Vector3(0, 0, 0), 0xff5b45, 40, 9);
  });

  on('answer', () => blackHole.surge(1.4));

  /*
   * Selecionar um astro é olhar para ele.
   *
   * A câmera reage ao EVENTO, não ao clique no canvas. São a mesma coisa hoje (só o clique
   * emite `ui.select`), e serão diferentes amanhã: um resultado de busca que aponta uma estrela
   * deve centralizá-la pelo mesmo caminho, e não por uma segunda cópia desta linha dentro do
   * módulo de busca. A cena responde a "isto foi selecionado", venha de onde vier.
   */
  /*
   * `id`, não só `source`: hub (repo, diretório) NÃO tem `source` — o campo só existe em
   * arquivo. Lendo apenas `source`, clicar ou passar o cursor num hub resolvia para `null` e o
   * gesto morria em silêncio: nenhum arco, nenhuma câmera, nenhum erro. O grafo é indexado por
   * `id` dos dois lados (`index.get`), e em arquivo `id === source`, então o `??` não muda nada
   * para eles.
   */
  const alvoDe = (node) => node?.source ?? node?.id ?? null;
  on('ui.select', ({ node }) => focusNode(alvoDe(node)));
  /*
   * Focar SEM abrir inspetor. `ui.select` faz as duas coisas porque nasceu do clique no céu, mas
   * quem já vai abrir o leitor central (árvore, busca) precisa só da câmera — e emitir
   * `ui.select` ali abriria um segundo painel com o mesmo arquivo.
   */
  on('ui.focus-node', ({ source }) => focusNode(source ?? null));

  /*
   * O vínculo responde ao GESTO, e o cursor vence o foco enquanto existe.
   *
   * São duas perguntas diferentes com a mesma resposta visual: "o que é aquilo ali?" (cursor,
   * passageiro) e "o que se liga ao que estou estudando?" (foco, durável). Se o foco vencesse,
   * passar o cursor por outro astro não responderia nada — e o hover é o gesto mais barato que
   * a interface tem.
   */
  let hoveredNode = null;
  const paintLinks = () => {
    const alvo = hoveredNode || focusedNode;
    const desenhados = links.show(
      alvo ? graph.linksOf(alvo) : null,
      alvo === focusedNode ? 0xffb35c : 0x7ee0c0
    );
    /*
     * A LEGENDA sai da mesma chamada que desenha.
     *
     * O arco responde "existe relação" e não responde "com quem" — a essa distância os dois
     * extremos são pixels iguais. Quem nomeia é um widget, e ele não conhece o grafo; então o
     * evento leva o nó pronto, já CORTADO no número de arcos que o desenho aceitou.
     *
     * Deixar o widget recalcular a partir do `/api/graph` daria uma segunda lista, e no dia em
     * que o teto de `MAX_LINKS` mordesse ela nomearia um vínculo que não está na tela — sem erro
     * nenhum, só divergência. É a mesma regra das métricas deste projeto: o que se lê sai do
     * mesmo lugar que o que se vê.
     */
    ui('links', {
      subject: alvo ? graph.nodeAt(alvo) : null,
      dirty: alvo ? graph.dirtyOf(alvo) : null,
      // Qual gesto trouxe este sujeito. O cursor vence o foco enquanto existe (ver acima), e a
      // legenda tem de dizer qual dos dois está falando: um é passageiro, o outro é a escolha.
      origin: hoveredNode ? 'hover' : 'focus',
      nodes: alvo ? graph.neighborsOf(alvo).slice(0, desenhados) : [],
    });
  };
  on('ui.hover', ({ node }) => {
    hoveredNode = alvoDe(node);
    paintLinks();
  });
  on('ui.node-focus', () => paintLinks());

  on('ui.cinematic', ({ on: enabled }) => {
    cinematic = enabled;
    // Offset sobre o valor afinado, não constante fixa: entrar e sair do modo cinema não
    // pode descartar o que o operador ajustou no painel.
    lensing.setCinematic(enabled, tune);
    bloom.strength = tune.bloomStrength * (enabled ? 1.45 : 1);
  });

  // ---------------------------------------------------------------- interação

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    userControlled = true;
    orbitMoved = true;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointerup', (event) => {
    dragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
  });

  /*
   * O ponteiro está sobre um painel da HUD, e não sobre o céu?
   *
   * O picking usa a ÚLTIMA coordenada que o canvas recebeu, e o canvas para de receber
   * `pointermove` no instante em que o cursor entra num painel interativo. O efeito medido: o
   * cursor está lendo o conteúdo de um arquivo e o rótulo de hover do céu continua acendendo,
   * porque um nó em órbita passa por baixo daquela coordenada congelada. O tooltip "atravessava"
   * o painel.
   *
   * A regra é do SISTEMA, não de cada painel — a mesma disciplina do `keys.js`, onde atalho
   * global não dispara enquanto há foco em texto. Aqui: não há hover no céu enquanto o ponteiro
   * está sobre a HUD. Escuta em `window` com `capture`, porque o evento pode ser consumido antes
   * de borbulhar.
   */
  let pointerOffSky = false;
  window.addEventListener(
    'pointermove',
    (event) => {
      const off = event.target !== canvas;
      if (off === pointerOffSky) return;
      pointerOffSky = off;
      // Sair do céu apaga o hover na hora. Esperar o próximo quadro de picking deixaria o
      // rótulo aceso sobre o painel pelo tempo do intervalo.
      if (off && (hovered || hoveredBody)) {
        hovered = null;
        hoveredBody = null;
        canvas.style.cursor = '';
        ui('hover', { node: null, dirty: null });
      }
    },
    true
  );

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    if (!dragging) return;
    // O mouse move o ALVO, não a câmera. Delta de ponteiro é ruidoso e não vem alinhado com
    // o quadro; aplicá-lo direto na câmera transporta esse ruído para a imagem.
    orbitMoved = true;
    orbit.targetAzimuth -= event.movementX * 0.0042;
    orbit.targetPolar = THREE.MathUtils.clamp(
      orbit.targetPolar - event.movementY * 0.0034, 0.22, 2.9
    );
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      userControlled = true;
      orbitMoved = true;
      orbit.targetDistance = clampDistance(orbit.targetDistance * (1 + Math.sign(event.deltaY) * 0.08));
    },
    { passive: false }
  );

  canvas.addEventListener('click', () => {
    if (hoveredBody) {
      // Corpo de app navega; corpo de controle alterna. A cena não sabe o que cada um faz —
      // ela emite a intenção e quem registrou o controle decide.
      ui(hoveredBody.type === 'control' ? 'toggle-control' : 'open-app', { id: hoveredBody.id });
      return;
    }
    if (!hovered) return;
    // Onda no espaço-tempo no ponto clicado, e o resto do sistema decide o que fazer.
    particles.burst(hovered.position, graph.kindColor(hovered.node.kind), 26, 4);
    ui('select', { node: hovered.node });
  });

  // ---------------------------------------------------------------- loop

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.resolution.set(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function outflowTarget(x = 0.78, y = 0.55) {
    // Ponto no mundo que corresponde a uma posição na tela: é assim que a corrente de
    // partículas termina exatamente onde o painel de texto começa.
    return new THREE.Vector3(x * 2 - 1, y * 2 - 1, 0.55).unproject(camera);
  }

  /**
   * Ancora a câmera num corpo de app, ou devolve ao núcleo com `null`.
   *
   * Não move a câmera direto: move o ALVO. O loop persegue com suavização por tempo, então a
   * chegada tem a mesma física do resto da cena e um segundo `focusBody` no meio do voo
   * redireciona em vez de teleportar.
   */
  function focusBody(id) {
    focusedBody = id;
    userControlled = false;
    // 15 punha a câmera DENTRO do disco (raio externo 39): o disco enchia o quadro e lavava
    // a coluna de texto. 30 mantém o núcleo presente e grande, com o corpo do app ancorando
    // o enquadramento, e devolve contraste para a HUD.
    orbit.targetDistance = id ? 30 : HOME.distance;
    orbit.targetPolar = id ? 1.06 : HOME.polar;
    // Movimento reduzido: corte, não voo. O alvo já está no destino e a câmera é posta lá no
    // mesmo quadro — a chegada continua acontecendo, só sem os 900ms de deslocamento.
    if (motion.isReduced()) {
      orbit.distance = orbit.targetDistance;
      orbit.polar = orbit.targetPolar;
      orbit.azimuth = orbit.targetAzimuth;
    }
  }

  /**
   * Trava a câmera num astro do céu — ela passa a orbitá-LO, com ele no centro.
   *
   * `null` solta e devolve o enquadramento de casa. Como no `focusBody`, o que se move é o
   * ALVO: o loop persegue com suavização por tempo, então um segundo clique no meio do voo
   * redireciona em vez de teleportar, e a chegada tem a mesma física do resto da cena.
   */
  function focusNode(source) {
    focusedNode = source;
    // Registra NO MOMENTO DO PEDIDO se o céu conhece este astro. Depois é tarde: o quadro solta
    // o foco de quem não tem posição, e aí "focado: null" já não diz se o pedido era inválido.
    lastFocusRequest = { source, conhecido: source ? Boolean(graph.nodeAt(source)) : null };
    // O operador escolheu para onde olhar: a deriva automática pararia de fazer sentido
    // arrastando o quadro para longe do que ele acabou de pedir.
    userControlled = Boolean(source);
    /*
     * `NODE_FOCUS_DISTANCE` is the FIRST GUESS, not the destination.
     *
     * The real distance depends on the body's radius, which is only known once the anchor resolves
     * in the frame loop — and asking the graph for it here would mean a second projection formula
     * living outside `planetAnchor`, free to drift from the one that actually sizes the body. So
     * the flight starts toward the old constant and the next resolved frame corrects it to the
     * distance that yields `FOCUS_FIT_PX`. The correction lands inside the camera's own easing,
     * so it reads as one flight, not as two.
     */
    orbit.targetDistance = source ? NODE_FOCUS_DISTANCE : HOME.distance;
    orbit.targetPolar = source ? NODE_FOCUS_POLAR : HOME.polar;
    fitPending = Boolean(source);
    if (!source) focusGeometry = null;
    if (motion.isReduced()) {
      orbit.distance = orbit.targetDistance;
      orbit.polar = orbit.targetPolar;
    }
    ui('node-focus', { source: source ?? null });
  }

  /**
   * The zoom range in force right now.
   *
   * One function because there were two clamps before — the wheel's literals and the focus flight
   * — and they disagreed: the floor was farther out than the place focus flew to. Two rules over
   * one number is how the wheel ended up undoing the gesture that preceded it.
   *
   * `focusGeometry` is written by the frame loop from the SAME anchor that sizes and places the
   * body, so the floor cannot drift from the geometry it is protecting.
   */
  function clampDistance(value) {
    const floor = focusGeometry
      ? Math.max(focusGeometry.radius * FOCUS_FLOOR_RADII, CAMERA.near * 4)
      : ZOOM_RANGE.min;
    return THREE.MathUtils.clamp(value, floor, ZOOM_RANGE.max);
  }

  function focusOn(points) {
    if (!points.length) return;
    focusTarget.set(0, 0, 0);
    for (const point of points) focusTarget.add(point);
    focusTarget.divideScalar(points.length);
    focusWeight = 1;
  }

  /** Lê um escalar da órbita do storage, preso à mesma faixa que a interação impõe. */
  function readOrbit(key, min, max) {
    const value = prefs.get(key);
    if (typeof value !== 'number' || !Number.isFinite(value)) return prefs.DEFAULTS[key];
    return THREE.MathUtils.clamp(value, min, max);
  }

  const quantize = (value) => Math.round(value * ORBIT_STEP) / ORBIT_STEP;

  /**
   * Grava a órbita. `force` é o ⌘S; sem ele, só grava se houve gesto do operador.
   *
   * Não escreve nada quando o valor não mudou — a guarda é do próprio `prefs.set`, e é por isso
   * que os três escalares são chaves separadas em vez de um objeto (dois objetos de conteúdo
   * igual nunca são `===`, e a guarda nunca dispararia).
   *
   * Devolve se havia algo a gravar, para quem quiser dar retorno na tela.
   */
  function saveOrbit(force = false) {
    if (!force && !orbitMoved) return false;
    orbitMoved = false;
    /*
     * Dentro de um app o enquadramento é DERIVADO (o `focusBody` escolhe distância e polar para
     * emoldurar o corpo), não escolhido — gravá-lo faria a próxima sessão nascer com a moldura
     * de um app que talvez nem esteja aberto. Só o azimute, que continua sendo do operador,
     * atravessa. `HOME` guarda o resto, e é ele que vai para o disco.
     */
    if (focusedBody) {
      prefs.set('camera.azimuth', quantize(orbit.targetAzimuth));
      return true;
    }
    HOME.polar = orbit.targetPolar;
    HOME.distance = orbit.targetDistance;
    prefs.set('camera.azimuth', quantize(orbit.targetAzimuth));
    prefs.set('camera.polar', quantize(orbit.targetPolar));
    prefs.set('camera.distance', quantize(orbit.targetDistance));
    return true;
  }

  setInterval(() => saveOrbit(), ORBIT_SAVE_MS);

  /*
   * `visibilitychange` e `pagehide` — nunca `beforeunload`.
   *
   * `beforeunload` não é confiável em nenhum browser moderno para gravar: ele não dispara no
   * descarte de aba em background nem em mobile, e ainda desliga o bfcache. `pagehide` cobre o
   * fechamento real e `visibilitychange` cobre trocar de aba, que é como a sessão termina de
   * fato na maior parte das vezes.
   */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveOrbit();
  });
  window.addEventListener('pagehide', () => saveOrbit());

  function frame() {
    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;
    const started = performance.now();

    // Deriva automática é movimento contínuo sem evento por trás — o primeiro a sair.
    const drift = motion.isReduced() ? 0 : DRIFT_BASE * tune.cameraDrift;
    if (!dragging && !userControlled) orbit.targetAzimuth += delta * drift;
    if (cinematic) orbit.targetAzimuth += delta * drift * 1.6;

    orbit.azimuth = smooth(orbit.azimuth, orbit.targetAzimuth, tune.cameraEase, delta);
    orbit.polar = smooth(orbit.polar, orbit.targetPolar, tune.cameraEase, delta);
    orbit.distance = smooth(orbit.distance, orbit.targetDistance, RATE.zoom, delta);

    // Âncora da órbita: origem no sistema, posição do corpo dentro de um app.
    /*
     * A âncora persegue o astro TODO QUADRO, não uma vez ao clicar.
     *
     * O nó está em órbita: fixar a âncora na posição do instante do clique deixaria o astro
     * escapando do centro em segundos. É o mesmo mecanismo do corpo de app, e por isso ele
     * está aqui e não num segundo caminho.
     */
    const nodeAt = focusedNode ? graph.worldPositionOf(focusedNode) : null;
    // Astro que saiu do céu (recarga da topologia) solta o foco em vez de prender a câmera
    // apontando para o vazio.
    if (focusedNode && !nodeAt) focusedNode = null;
    const bodyAt = nodeAt || (focusedBody ? bodies.positionOf(focusedBody) : null);
    anchorTarget.copy(bodyAt || ZERO);
    anchor.lerp(anchorTarget, 1 - Math.exp(-2.6 * delta));

    // A câmera olha para o núcleo, mas se inclina na direção do que foi recuperado: o
    // sistema aponta a atenção para onde a memória acendeu, e depois relaxa de volta.
    focusWeight = smooth(focusWeight, 0, RATE.focus, delta);
    const lookAt = focusTarget.clone().multiplyScalar(focusWeight * 0.28);

    camera.position.set(
      anchor.x + Math.sin(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance,
      anchor.y + Math.cos(orbit.polar) * orbit.distance,
      anchor.z + Math.cos(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance
    );

    /*
     * A CÂMERA NÃO ENTRA NO NÚCLEO. Guarda geométrica, e ela conserta um defeito antigo.
     *
     * A posição da câmera é `âncora + direção × distância`. Ao focar um astro a âncora vira o
     * astro, e a distância de foco é 16 — mas nada garante que o resultado fique FORA do buraco
     * negro. Um arquivo pesado orbita a ~46 unidades do centro e o disco vai a 45: com a órbita
     * apontando para o lado de dentro, a câmera parava em 30, dentro do disco, e a tela virava
     * um borrão de estrias. Reproduzido três vezes seguidas ao focar o arquivo de 226 chunks.
     *
     * Não era escala do núcleo — eu cheguei a mexer nela duas vezes atrás do sintoma errado. É
     * que `focusNode` escolhe uma distância ao ASTRO sem olhar onde isso põe a câmera em relação
     * à ORIGEM, e nenhum valor de `coreScale` conserta isso: basta o astro estar perto o
     * bastante do centro.
     *
     * O empurrão é radial e mantém a direção do olhar praticamente intacta, porque a âncora
     * continua sendo o alvo do `lookAt`.
     */
    /*
     * Ao focar um astro, a câmera fica do lado DE FORA dele — nunca entre ele e o núcleo.
     *
     * A guarda radial abaixo evita o desastre, mas empurrando a câmera para longe do próprio
     * astro que se pediu para ver: o planeta procedural, que só aparece acima de 90px de raio
     * aparente, nunca chegava lá. Aqui o que se corrige é a POSE, não a distância — se o
     * deslocamento da órbita aponta para dentro, ele é refletido na direção radial. O ângulo de
     * visada escolhido pelo operador é preservado em módulo; só o lado muda.
     */
    if (focusedNode && anchor.lengthSq() > 1e-6) {
      const offset = ORBIT_OFFSET.copy(camera.position).sub(anchor);
      const outward = RADIAL.copy(anchor).normalize();
      const along = offset.dot(outward);
      if (along < 0) {
        offset.addScaledVector(outward, -2 * along);
        camera.position.copy(anchor).add(offset);
      }
    }

    /*
     * A folga é do HORIZONTE, não da borda do disco — e a diferença decidia se o planeta podia
     * existir.
     *
     * Medido: o disco vai a 45 unidades e a órbita de arquivo mais interna começa em 46. Uma
     * folga baseada na borda do disco (48,6) põe os astros mais recentes DENTRO da zona
     * proibida — a câmera nunca conseguia se aproximar deles, parava a 30,5 do alvo, e o astro
     * ficava com 37px de raio aparente quando o planeta precisa de 90. Não é que o planeta
     * estivesse quebrado: ele nunca era pedido.
     *
     * O que precisa mesmo de folga é a esfera OPACA. O disco é aditivo e fino; atravessar a
     * borda dele custa umas estrias no quadro, não a cena. 3,5 raios de horizonte mantêm o
     * enquadramento inteiro fora do buraco e devolvem toda a casca de nós para a câmera.
     */
    const clearance = blackHole.horizonRadius * (tune.coreScale ?? 1) * 3.5;
    if (camera.position.lengthSq() < clearance * clearance) {
      // Câmera exatamente no centro não tem direção; a de partida da cena serve de desempate.
      if (camera.position.lengthSq() < 1e-6) camera.position.copy(CAMERA.start);
      camera.position.setLength(clearance);
    }
    /*
     * PARALAXE — a camera TRANSLADA com o ponteiro, e o alvo do olhar vai junto.
     *
     * Transladar os dois e o que produz paralaxe de verdade: numa translacao pura, o
     * deslocamento aparente cai com a distancia, entao o que esta perto anda muito e o que esta
     * longe quase nao anda. Se eu movesse so a posicao e mantivesse o alvo, seria uma ROTACAO em
     * torno da ancora — e aí o objeto focado ficaria parado e o fundo giraria, que e o oposto do
     * que o olho espera.
     *
     * ⚠️ Aqui os numeros do pedido foram INVERTIDOS, de proposito. A especificacao era estrelas
     * 20px, grafo 8px, HUD 2px — mas o campo estelar vive entre 150 e 400 unidades e o grafo
     * entre 68 e 160: o GRAFO e a camada mais proxima. Dar mais movimento ao que esta mais longe
     * produziria uma profundidade invertida, que o olho le como erro mesmo sem saber nomear. A
     * ordem correta sai de graca da translacao; nao precisei escolher valor por camada.
     */
    if (!motion.isReduced()) {
      PARALLAX_AIM.lerp(pointer, 1 - Math.exp(-3.4 * delta));
      camera.getWorldDirection(PARALLAX_FWD);
      PARALLAX_RIGHT.crossVectors(PARALLAX_FWD, camera.up).normalize();
      PARALLAX_UP.crossVectors(PARALLAX_RIGHT, PARALLAX_FWD).normalize();
      // A amplitude acompanha a distancia: a 88 unidades sao ~1,3 de mundo, e ao travar num
      // astro (distancia 7) cai para ~0,1 — sem isso, o mesmo deslocamento que e sutil de longe
      // sacudiria o planeta na tela.
      const amplitude = orbit.distance * PARALLAX_SCALE;
      PARALLAX_SHIFT.set(0, 0, 0)
        .addScaledVector(PARALLAX_RIGHT, PARALLAX_AIM.x * amplitude)
        .addScaledVector(PARALLAX_UP, PARALLAX_AIM.y * amplitude);
      camera.position.add(PARALLAX_SHIFT);
      lookAt.add(PARALLAX_SHIFT);
    }

    camera.lookAt(lookAt.add(anchor));

    blackHole.update(delta, elapsed);
    // Depois de a câmera ter sido posicionada neste quadro: o beaming é função de onde o
    // observador está, e usar a posição do quadro anterior faria o crescente arrastar atrás da
    // órbita da câmera.
    blackHole.syncView(camera);
    stars.update(delta, elapsed);
    // `canvas.height` é o framebuffer (CSS × devicePixelRatio), que é a unidade de
    // `gl_PointSize` — é ele, e não o tamanho CSS, que dimensiona o anel junto com a estrela.
    graph.update(delta, elapsed, camera, canvas.height);
    particles.update(delta);
    satellites.update(delta, elapsed);
    satellites.faceCamera(camera);
    wormholes.update(delta, elapsed, camera);
    bodies.update(delta, elapsed, camera, focusedBody, hoveredBody?.id ?? null, {
      radius: blackHole.horizonRadius,
    });

    // Picking limitado a ~16Hz e suspenso durante o arrasto: era ele que roubava o
    // orçamento de quadro justamente enquanto a câmera se movia. Arrastando, ninguém está
    // mirando num nó.
    if (!dragging && !pointerOffSky && performance.now() - lastPick > PICK_INTERVAL_MS) {
      lastPick = performance.now();
      raycaster.setFromCamera(pointer, camera);
      // Corpo de app tem prioridade: é destino de navegação, e um nó do grafo atrás dele não
      // pode roubar o clique.
      const body = bodies.pick(raycaster);
      if (body?.id !== hoveredBody?.id) {
        hoveredBody = body;
        canvas.style.cursor = body ? 'pointer' : '';
      }
      const picked = body ? null : graph.pick(raycaster);
      if (picked?.node?.id !== hovered?.node?.id) {
        hovered = picked;
        /*
         * O estado local vai JUNTO no evento, não anexado ao nó depois.
         *
         * Quem sabe se o arquivo está alterado é esta cena (`graph.dirtyOf`), e quem desenha o
         * rótulo é um widget que não a conhece. A alternativa seria o `main` escrever o campo
         * dentro do nó entre um assinante e outro — mutação de estado compartilhado dependendo
         * da ORDEM de registro dos ouvintes, que é a forma mais silenciosa de quebrar isto.
         */
        ui('hover', {
          node: picked?.node ?? null,
          dirty: picked?.node ? graph.dirtyOf(picked.node.source) : null,
        });
      }
    }

    /*
     * O PLANETA do astro em foco.
     *
     * Depois de `graph.update`, nunca antes: a âncora lê a posição que acabou de ser escrita.
     * É a mesma regra do anel, e pelo mesmo motivo — um quadro de atraso aqui aparece como a
     * esfera arrastando atrás do próprio halo.
     */
    const pouso = focusedNode
      ? graph.planetAnchor(focusedNode, camera, canvas.height, elapsed)
      : null;

    /*
     * The zoom floor and the fit are derived from the anchor, never from a second formula.
     *
     * `pouso.px * distance / radius` IS the projection constant (viewport height over twice the
     * tangent of half the fov) — recovered from the anchor's own output instead of rewritten here.
     * Rewriting it would be a copy free to disagree with what sizes the body, which is the class of
     * bug that already put the link arcs in the wrong coordinate space.
     */
    if (pouso) {
      const distancia = camera.position.distanceTo(pouso.position);
      focusGeometry = { radius: pouso.radius, k: (pouso.px * distancia) / pouso.radius };
      if (fitPending && pouso.px > 0) {
        orbit.targetDistance = clampDistance((focusGeometry.k * pouso.radius) / FOCUS_FIT_PX);
        fitPending = false;
      }
    } else if (!focusedNode) {
      focusGeometry = null;
    }
    /*
     * A sonda escreve SEMPRE, inclusive o caso negativo.
     *
     * Escrevendo só quando há planeta, "sonda ausente" confundia três causas diferentes: foco
     * nulo, âncora não resolvida e nível de detalhe zero. Custou várias rodadas de depuração às
     * cegas. Diagnóstico que só existe no caminho feliz não é diagnóstico.
     */
    probe = { focado: focusedNode, ancorou: Boolean(pouso), px: pouso?.px ?? 0, level: 0, pedido: lastFocusRequest };

    /*
     * O CATÁLOGO decide se este corpo pode ter superfície — não este bloco.
     *
     * Ligar o planeta sem consultá-lo pôs crosta num DIRETÓRIO, que é exatamente o
     * empilhamento que `catalog.js` existe para impedir: "agregado não tem corpo; dar crosta a
     * um diretório afirmaria um objeto que não há". A classe padrão, ESTRELA, também proíbe —
     * estrela tem fotosfera, não crosta — então a superfície é a exceção, e ela precisa de
     * permissão explícita.
     */
    const classe = pouso ? classify(pouso.node, { dirty: graph.dirtyOf(pouso.node.source) }) : null;
    const podeTerSuperficie = classe ? allows(classe, 'surface') : false;

    /*
     * Duas superfícies possíveis, e o CATÁLOGO escolhe — nunca este bloco.
     *
     * Crosta pertence a corpo sólido; fotosfera, a corpo emissivo. São classes diferentes de
     * objeto e desenhá-las com o mesmo shader seria dizer que um arquivo comum e um arquivo em
     * edição são a mesma coisa de tamanhos diferentes.
     */
    const temFotosfera = Boolean(classe?.features?.photosphere);
    if (pouso && temFotosfera && !podeTerSuperficie) {
      if (focusedNode !== starSource) {
        starParamsCache = photosphereParams(pouso.node, hash01, graph.kindColor(pouso.node.kind));
        starSource = focusedNode;
      }
      photosphere.object.position.copy(pouso.position);
      photosphere.object.scale.setScalar(pouso.radius);
      const level = photosphere.update(starParamsCache, camera, pouso.px, elapsed);
      graph.haloOf(level > 0.002 ? focusedNode : null, level);
      probe.level = level;
      probe.raio = pouso.radius;
      probe.dist = camera.position.distanceTo(pouso.position);
      probe.tipo = 'fotosfera';
    } else if (starSource) {
      photosphere.update(starParamsCache, camera, 0, elapsed);
      starSource = null;
    }

    if (pouso && podeTerSuperficie) {
      if (focusedNode !== planetSource) {
        planetParamsCache = planetParams(pouso.node);
        planetSource = focusedNode;
      }
      planet.object.position.copy(pouso.position);
      planet.object.scale.setScalar(pouso.radius);
      /*
       * A luz vem do NÚCLEO. É o único corpo emissivo da cena, então iluminar de qualquer outra
       * direção poria o terminador em desacordo com o que se vê — e o terminador é justamente o
       * que faz a esfera ler como esfera.
       */
      LIGHT_DIR.copy(pouso.position).negate().normalize();
      const level = planet.update(
        { ...planetParamsCache, light: [LIGHT_DIR.x, LIGHT_DIR.y, LIGHT_DIR.z] },
        camera,
        pouso.px,
        elapsed
      );
      // O sprite cede NA MESMA MEDIDA em que a superfície aparece: sem isso a troca seria seca
      // e o astro piscaria de ponto para planeta.
      graph.haloOf(level > 0.002 ? focusedNode : null, level);
      // Sonda de diagnóstico: o planeta é o único objeto cuja ausência não gera erro nenhum —
      // ele simplesmente não desenha. Sem isto, "não apareceu" não distingue LOD baixo de
      // âncora errada de shader mudo.
      probe.level = level;
      probe.raio = pouso.radius;
      probe.dist = camera.position.distanceTo(pouso.position);
    } else if (planetSource) {
      planet.update({ ...planetParamsCache, light: [0, 0, 1] }, camera, 0, elapsed);
      graph.haloOf(null, 0);
      planetSource = null;
    }

    links.update(graph.positions(), delta, elapsed);

    backdrop.update(delta, camera.aspect, camera);

    if (signals) {
      const size = renderer.getSize(new THREE.Vector2());
      // `getSize` devolve pixels de CSS (o `pixelRatio` é interno ao renderer), que é a mesma
      // régua do `getBoundingClientRect` do lado da HUD. Misturar as duas daria furo deslocado
      // pelo DPR — e só em monitor retina, que é a pior classe de bug para reproduzir.
      signals.update(graph.signalPoints(camera, size.x, size.y, elapsed));
    }

    glitch = smooth(glitch, 0, 3.2, delta);
    lensing.sync(camera, blackHole, renderer.getSize(new THREE.Vector2()), { glitch });
    lensing.setTime(elapsed);

    composer.render();

    frames.count += 1;
    if (performance.now() - started > LONG_FRAME_MS) frames.long += 1;
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    focusBody,
    installApps: (apps) => bodies.install(apps),
    focusedBody: () => focusedBody,
    loadGraph: (payload) => graph.load(payload),
    /** Janela temporal do céu, em espaço de recência — o mesmo eixo que já define o raio. */
    revealSky: (value) => graph.reveal(value),
    /** Anéis de Saturno nos arquivos alterados no disco. Recebe o `{caminho: estado}` cru. */
    /** Fundo do universo: liga/desliga, tempo de rotação, transição e qualidade. */
    applyBackdrop: (options) => backdrop.apply(options),
    /** Qual imagem está no ar — a tela de configuração precisa dela para creditar. */
    backdropPlate: () => backdrop.plate(),
    markDirty: (table) => graph.markDirty(table),
    /** Apaga os anéis sem afirmar árvore limpa — quando o disco deixa de ser verificável. */
    forgetDirty: () => graph.forgetDirty(),
    dirtyOf: (source) => graph.dirtyOf(source),
    installProviders: (providers) => satellites.install(providers),
    nodeCount: () => graph.count(),
    toolColor: (kind) => TOOL_COLORS[kind] ?? TOOL_COLORS.other,

    /**
     * Quanto custa a cadeia de pós-processamento, em ms de GPU por quadro.
     *
     * Existe porque a pergunta volta toda vez que a cena muda, e porque as duas medidas óbvias
     * NÃO respondem — as duas foram tentadas e falharam:
     *
     * | Tentativa | Por que não serve |
     * |---|---|
     * | comparar FPS | a 105 FPS o loop está preso no vsync: baixar o custo não aparece |
     * | zerar `bloomStrength` | o PASSE continua rodando, só com o parâmetro em zero |
     * | `gl.finish()` + relógio de parede | neste driver (ANGLE/Metal) não sincroniza: mediu 0.1ms para 4.5 megapixels, o que não é crível |
     *
     * `EXT_disjoint_timer_query_webgl2` é o instrumento certo: ele pergunta À GPU quanto tempo
     * ELA levou, sem depender de o driver honrar um ponto de sincronia. O resultado chega
     * assíncrono, por isso a assinatura é uma promessa.
     *
     * ⚠️ A comparação carrega uma diferença: `renderer.render` escreve no framebuffer padrão e
     * o composer escreve em alvos intermediários. Serve para ordem de grandeza — que é a
     * pergunta ("o pós vale metade do quadro ou 5%?"), não para benchmark.
     */
    async sampleRenderCost(samples = 30) {
      const gl = renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return { erro: 'EXT_disjoint_timer_query_webgl2 indisponível neste contexto' };

      const medir = (desenhar) =>
        new Promise((resolve) => {
          const query = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < samples; i++) desenhar();
          gl.endQuery(ext.TIME_ELAPSED_EXT);

          const colher = () => {
            // `GPU_DISJOINT` marca que o relógio da GPU foi perturbado (troca de contexto,
            // throttling): a amostra inteira vira lixo e não pode ser reportada como medida.
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              gl.deleteQuery(query);
              resolve(null);
              return;
            }
            if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
              requestAnimationFrame(colher);
              return;
            }
            const nanos = gl.getQueryParameter(query, gl.QUERY_RESULT);
            gl.deleteQuery(query);
            resolve(nanos / 1e6 / samples);
          };
          requestAnimationFrame(colher);
        });

      const comCadeia = await medir(() => composer.render());
      const semCadeia = await medir(() => renderer.render(scene, camera));
      if (comCadeia === null || semCadeia === null) {
        return { erro: 'relógio da GPU perturbado (GPU_DISJOINT) — amostra descartada' };
      }
      return {
        comCadeia: +comCadeia.toFixed(3),
        semCadeia: +semCadeia.toFixed(3),
        custoDoPos: +(comCadeia - semCadeia).toFixed(3),
        fracao: +((1 - semCadeia / comCadeia) * 100).toFixed(1),
        pixelRatio: renderer.getPixelRatio(),
        buffer: [canvas.width, canvas.height],
      };
    },

    /** Amostra de desempenho para o beacon; zera a janela a cada leitura. */
    sampleTelemetry() {
      const now = performance.now();
      const seconds = (now - frames.since) / 1000;
      const sample = {
        fps: seconds > 0 ? frames.count / seconds : 0,
        long_frames: frames.long,
        nodes: graph.count(),
      };
      frames.count = 0;
      frames.long = 0;
      frames.since = now;
      return sample;
    },

    /** Grava a órbita agora (o ⌘S). Devolve se havia gesto novo a registrar. */
    saveOrbit: () => saveOrbit(true),

    /**
     * Aplica a parte da cena que um perfil de qualidade decide.
     *
     * O `tuning` (os 22 parâmetros) é aplicado por quem chama, direto no store — ele já se
     * distribui sozinho pelo `subscribe`. O que passa por aqui é só o que NÃO é afinação:
     * resolução de desenho e teto de anéis.
     */
    applyProfile({ pixelRatio, maxRings }) {
      if (typeof maxRings === 'number') graph.setMaxRings(maxRings);
      if (typeof pixelRatio === 'number' && pixelRatio !== pixelCeiling) {
        pixelCeiling = pixelRatio;
        applyPixelRatio();
      }
    },

    /** Trava a câmera num astro do céu; `null` solta. */
    focusNode,
    focusedNode: () => focusedNode,
    /** Diagnóstico do planeta em foco — raio aparente, nível de detalhe e distância. */
    planetProbe: () => probe,

    /** Devolve o controle da câmera à deriva automática. */
    release() {
      userControlled = false;
    },
  };
}
