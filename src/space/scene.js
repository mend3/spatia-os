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
import { createGraph } from './graph.js';
import * as motion from '../core/motion.js';
import { createParticles } from './particles.js';
import { createSatellites, createWormholes, TOOL_COLORS } from './satellites.js';
import { createBodies } from './bodies.js';

const CAMERA = { fov: 46, near: 0.1, far: 900, start: new THREE.Vector3(0, 8, 54) };

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
const NODE_FOCUS_DISTANCE = 16;
const NODE_FOCUS_POLAR = 1.18;
// 3 casas ≈ 0.06° de azimute. Abaixo disso é ruído de float, e ruído de float faria a guarda
// de "só se mudou" do `prefs` disparar uma escrita a cada tique, para sempre.
const ORBIT_STEP = 1e3;
const ZERO = new THREE.Vector3();

export function createScene(canvas, { labelLayer } = {}) {
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

  scene.add(
    stars.object, blackHole.group, graph.group, particles.object,
    satellites.group, wormholes.group, bodies.group
  );

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
  on('ui.select', ({ node }) => focusNode(node?.source ?? null));

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
      orbit.targetDistance = THREE.MathUtils.clamp(
        orbit.targetDistance * (1 + Math.sign(event.deltaY) * 0.08),
        12,
        260
      );
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
    // O operador escolheu para onde olhar: a deriva automática pararia de fazer sentido
    // arrastando o quadro para longe do que ele acabou de pedir.
    userControlled = Boolean(source);
    orbit.targetDistance = source ? NODE_FOCUS_DISTANCE : HOME.distance;
    orbit.targetPolar = source ? NODE_FOCUS_POLAR : HOME.polar;
    if (motion.isReduced()) {
      orbit.distance = orbit.targetDistance;
      orbit.polar = orbit.targetPolar;
    }
    ui('node-focus', { source: source ?? null });
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
    markDirty: (table) => graph.markDirty(table),
    /** Apaga os anéis sem afirmar árvore limpa — quando o disco deixa de ser verificável. */
    forgetDirty: () => graph.forgetDirty(),
    dirtyOf: (source) => graph.dirtyOf(source),
    installProviders: (providers) => satellites.install(providers),
    nodeCount: () => graph.count(),
    toolColor: (kind) => TOOL_COLORS[kind] ?? TOOL_COLORS.other,

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

    /** Devolve o controle da câmera à deriva automática. */
    release() {
      userControlled = false;
    },
  };
}
