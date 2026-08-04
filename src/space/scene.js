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
import { createBlackHole } from './blackhole.js';
import { createLensingPass } from './lensing.js';
import { createStars } from './stars.js';
import { createGraph } from './graph.js';
import { createParticles } from './particles.js';
import { createSatellites, createWormholes, TOOL_COLORS } from './satellites.js';

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

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // o bloom e o grão já suavizam; MSAA aqui só custaria fill rate
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
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

  scene.add(stars.object, blackHole.group, graph.group, particles.object, satellites.group, wormholes.group);

  const composer = new EffectComposer(renderer);
  const lensing = createLensingPass();
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.58, 0.32, 0.72);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(lensing.pass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const orbit = {
    azimuth: 0, polar: 1.33, distance: 54,
    targetAzimuth: 0, targetPolar: 1.33, targetDistance: 54,
  };
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
  const frames = { count: 0, long: 0, since: performance.now() };
  // Espelho local do store: o loop lê daqui em vez de chamar getters por quadro.
  let tune = tuning.values();

  /**
   * Uma assinatura só distribui a afinação para todos os módulos.
   *
   * Nenhum deles conhece o painel: cada um expõe `tune(values)` e recebe o objeto inteiro.
   * Parâmetro novo no SPEC vira uma linha no módulo que o consome — e nada mais.
   */
  tuning.subscribe((values) => {
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
  });

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
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointerup', (event) => {
    dragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    if (!dragging) return;
    // O mouse move o ALVO, não a câmera. Delta de ponteiro é ruidoso e não vem alinhado com
    // o quadro; aplicá-lo direto na câmera transporta esse ruído para a imagem.
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
      orbit.targetDistance = THREE.MathUtils.clamp(
        orbit.targetDistance * (1 + Math.sign(event.deltaY) * 0.08),
        12,
        260
      );
    },
    { passive: false }
  );

  canvas.addEventListener('click', () => {
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

  function focusOn(points) {
    if (!points.length) return;
    focusTarget.set(0, 0, 0);
    for (const point of points) focusTarget.add(point);
    focusTarget.divideScalar(points.length);
    focusWeight = 1;
  }

  function frame() {
    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;
    const started = performance.now();

    const drift = DRIFT_BASE * tune.cameraDrift;
    if (!dragging && !userControlled) orbit.targetAzimuth += delta * drift;
    if (cinematic) orbit.targetAzimuth += delta * drift * 1.6;

    orbit.azimuth = smooth(orbit.azimuth, orbit.targetAzimuth, tune.cameraEase, delta);
    orbit.polar = smooth(orbit.polar, orbit.targetPolar, tune.cameraEase, delta);
    orbit.distance = smooth(orbit.distance, orbit.targetDistance, RATE.zoom, delta);

    // A câmera olha para o núcleo, mas se inclina na direção do que foi recuperado: o
    // sistema aponta a atenção para onde a memória acendeu, e depois relaxa de volta.
    focusWeight = smooth(focusWeight, 0, RATE.focus, delta);
    const lookAt = focusTarget.clone().multiplyScalar(focusWeight * 0.28);

    camera.position.set(
      Math.sin(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance,
      Math.cos(orbit.polar) * orbit.distance,
      Math.cos(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance
    );
    camera.lookAt(lookAt);

    blackHole.update(delta, elapsed);
    stars.update(delta, elapsed);
    graph.update(delta, elapsed);
    particles.update(delta);
    satellites.update(delta, elapsed);
    satellites.faceCamera(camera);
    wormholes.update(delta, elapsed, camera);

    // Picking limitado a ~16Hz e suspenso durante o arrasto: era ele que roubava o
    // orçamento de quadro justamente enquanto a câmera se movia. Arrastando, ninguém está
    // mirando num nó.
    if (!dragging && performance.now() - lastPick > PICK_INTERVAL_MS) {
      lastPick = performance.now();
      raycaster.setFromCamera(pointer, camera);
      const picked = graph.pick(raycaster);
      if (picked?.node?.id !== hovered?.node?.id) {
        hovered = picked;
        ui('hover', { node: picked?.node ?? null });
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
    loadGraph: (payload) => graph.load(payload),
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

    /** Devolve o controle da câmera à deriva automática. */
    release() {
      userControlled = false;
    },
  };
}
