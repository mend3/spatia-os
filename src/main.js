/**
 * Ponto de entrada: liga as quatro camadas ao mesmo barramento e sai da frente.
 *
 *   cena 3D  ·  HUD  ·  áudio  ·  métricas
 *
 * Nenhuma delas conhece as outras. Este arquivo é o único lugar que conhece todas, e o que
 * ele faz é só ordem de inicialização — não lógica.
 */
import { on, ui, emit } from './core/bus.js';
import * as state from './core/state.js';
import * as api from './core/api.js';
import { createScene } from './space/scene.js';
import { createAudio } from './audio/engine.js';
import { createFrame } from './hud/frame.js';
import { createStreams } from './hud/streams.js';
import { createAnswer } from './hud/answer.js';
import { createTerminal } from './hud/terminal.js';
import { createBoot } from './hud/boot.js';
import { createControls } from './hud/controls.js';
import { createPermissions } from './hud/permissions.js';
import { createVoice } from './hud/voice.js';
import { createSpeechPanel } from './hud/speech-panel.js';
import { createWidgetHost } from './kernel/widgets.js';
import { createRouter, ROUTE_ROOT } from './kernel/router.js';
import { listApps } from './kernel/registry.js';
import { registerApps, SYSTEM_VIEW } from './apps/index.js';
import * as tuning from './core/tuning.js';
import * as prefs from './core/prefs.js';
import * as keys from './core/keys.js';

const hud = document.getElementById('hud');
const canvas = document.getElementById('space');
const bootRoot = document.getElementById('boot');
const hover = document.querySelector('[data-hover]');
const bodyLayer = document.getElementById('bodies');

async function main() {
  if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) {
    api.reportClient({ boot: 'no_webgl' });
    bootRoot.querySelector('[data-boot-status]').textContent =
      'WebGL indisponível — o observatório precisa de aceleração gráfica';
    return;
  }

  state.install();
  keys.install();

  const audio = createAudio();
  const scene = createScene(canvas, { labelLayer: bodyLayer });
  /*
   * `document`, não `hud`, para os módulos que ADOTAM nós.
   *
   * Os nós de conteúdo nascem no depósito, que vive fora do `#hud` — buscar só dentro do hud
   * devolvia null e o boot morria em `frame.js`. Quem APPENDA (terminal, painéis) continua
   * recebendo `hud`, porque aí o pai importa.
   */
  const frame = createFrame(document);

  /*
   * Registro antes do router: o registro VALIDA que todo widget pedido por um app existe, e
   * falhar aqui é falhar no boot com o nome do culpado — não numa fenda vazia meia hora
   * depois, quando alguém abrir o app.
   */
  registerApps();
  const apps = listApps();
  const host = createWidgetHost(hud);
  const chrome = createDock(hud, apps);
  const router = createRouter({ host, scene, chrome });
  const streams = createStreams(document, { toolColor: scene.toolColor });
  const answer = createAnswer(document);
  const terminal = createTerminal(hud, { audio });
  const controls = createControls(hud);
  const perms = createPermissions(hud);
  const speechPanel = createSpeechPanel(hud);
  const panels = { tuning: controls, permissions: perms, speech: speechPanel };
  // A onda da HUD passa a ser desenhada com a amplitude real do áudio que o motor toca.
  const voice = createVoice(document, { onLevel: (level) => terminal.setLevel(level) });

  /*
   * Os interruptores do sistema também são astros.
   *
   * Eles existiam só como botões no canto do rodapé — descobríveis por quem já sabia que
   * estavam lá. Num ambiente onde tudo é corpo em órbita, um interruptor escondido num canto é
   * a única coisa que não obedece à própria metáfora. Os botões continuam (são o caminho
   * rápido), mas agora têm corpo.
   */
  const CONTROLS = [
    { id: 'ctl-voice', name: 'VOZ', key: 'V', color: 0xc59bff, action: () => voice.setEnabled(!voice.isEnabled()) },
    { id: 'ctl-speech', name: 'CONFIG VOZ', color: 0x9b7fff, action: () => speechPanel.toggle() },
    { id: 'ctl-perms', name: 'PERMISSÕES', key: 'P', color: 0xffd257, action: () => perms.toggle() },
    { id: 'ctl-tune', name: 'AFINAR', key: '`', color: 0xffb35c, action: () => controls.toggle() },
  ];
  const controlBodies = CONTROLS.map((control, index) => ({
    ...control,
    type: 'control',
    // Fases distribuídas no anel interno; inclinação alternada para não colidirem na projeção.
    orbit: { phase: (index / CONTROLS.length) * Math.PI * 2, inclination: index % 2 ? 0.5 : -0.34 },
  }));
  scene.installApps([...apps, ...controlBodies]);

  on('ui.toggle-control', ({ id }) => {
    const control = CONTROLS.find((entry) => entry.id === id);
    control?.action();
    audio.click({ frequency: 275, gain: 0.045, decay: 0.4 });
  });
  terminal.resize();
  window.addEventListener('resize', () => terminal.resize());

  const boot = createBoot(bootRoot, {
    onEngage: async () => {
      // Único ponto em que o áudio pode iniciar: dentro do gesto do usuário.
      const started = await audio.enable();
      api.reportClient({ boot: 'success', audio: started });
      emit({ t: 'state', state: 'idle', label: 'OCIOSO' });
      terminal.focus();
    },
  });

  // Áudio e cena assinam o mesmo estado, então som e imagem nunca divergem.
  on('ui.state-changed', ({ state: next }) => audio.setRegime(next));

  // O volume é afinação como qualquer outra — mesmo painel, mesma persistência.
  tuning.subscribe((values, key) => {
    if (key === null || key === 'volume') audio.setVolume(values.volume);
    if (key === null || key === 'ambient' || key === 'brightness') audio.tune(values);
  });

  on('ui.hover', ({ node }) => {
    if (!node) {
      hover.classList.remove('on');
      return;
    }
    hover.classList.add('on');
    hover.querySelector('[data-hover-label]').textContent = node.label;
    hover.querySelector('[data-hover-meta]').textContent =
      `${node.kind} · ${node.chunks} chunk(s)${node.type === 'file' ? '' : ' · agregado'}`;
  });

  installShortcuts(scene, audio, answer, terminal, router);

  // Clicar num corpo no espaço abre o app dele — o mesmo caminho do clique na dock.
  on('ui.open-app', ({ id }) => router.navigate(id));

  let health = null;
  try {
    health = await api.health();
    frame.applyHealth(health);
    voice.applyHealth(health);
    streams.showProviders(health.providers);
    scene.installProviders(health.providers);
  } catch (error) {
    boot.fail(`servidor não respondeu: ${error.message}`);
    return;
  }

  let nodeCount = 0;
  try {
    const graph = await api.graph();
    nodeCount = scene.loadGraph(graph);
    frame.applyGraph(nodeCount);
    streams.note(`TOPOLOGIA CARREGADA · ${nodeCount} CORPOS`, 'good');
  } catch (error) {
    streams.note(`TOPOLOGIA INDISPONÍVEL: ${error.message}`, 'bad');
  }

  // O router entra em cena depois de saúde e topologia: um app que carrega dados no onEnter
  // não deve fazê-lo antes de o sistema saber o que está no ar.
  router.start(SYSTEM_VIEW);
  // Eventos que ninguém pediu (webhooks) começam a chegar aqui.
  api.watchSystem();

  restorePrefs(panels, audio);

  await boot.report(health, nodeCount);
  api.startTelemetry(() => ({ ...scene.sampleTelemetry(), audio: audio.isEnabled() }));
  await boot.engage();
}

function installShortcuts(scene, audio, answer, terminal, router) {
  // Estado restaurado do storage; o cinema é aplicado no boot por `restorePrefs`.
  let cinematic = prefs.get('view.cinematic');
  let muted = prefs.get('audio.muted');

  /**
   * `Esc` tem uma cadeia, e ela vive só aqui.
   *
   * Antes, dois módulos escutavam a tecla — o terminal para abortar, o inspetor para fechar,
   * um deles com `stopPropagation` — e o resultado era que nem o inspetor fechava nem a
   * resposta saía da tela: só F5 resolvia. A ordem é do gesto mais recente para o mais
   * antigo, que é a expectativa de qualquer interface: desfaz-se o último passo primeiro.
   */
  /*
   * `Esc` é o único atalho que vale COM foco em texto (`whileTyping`): ele é a saída, e exigir
   * desfocar antes de poder sair seria o oposto de uma saída.
   */
  keys.bind({ key: 'Escape', whileTyping: true, label: 'ESC SAIR' }, () => {
    if (answer.isInspecting()) {
      answer.close();
    } else if (api.isStreaming()) {
      api.abort();
      emit({ t: 'state', state: 'idle', label: 'ABORTADO' });
      emit({ t: 'done' });
    } else if (answer.hasAnswer()) {
      answer.dismiss();
      terminal.focus();
    } else if (router.route() !== ROUTE_ROOT) {
      router.navigate(ROUTE_ROOT);
    } else {
      terminal.clearInput();
    }
    audio.click({ frequency: 165, gain: 0.05, decay: 0.5 }); // 55×3 — saída, grave
  });

  keys.bind({ code: 'Tab', label: 'TAB CINEMA' }, () => {
    cinematic = !cinematic;
    prefs.set('view.cinematic', cinematic);
    document.body.classList.toggle('cinematic', cinematic);
    ui('cinematic', { on: cinematic });
    audio.click({ frequency: cinematic ? 165 : 440, gain: 0.05, decay: 0.9 });
  });

  keys.bind({ code: 'KeyM', meta: true, label: '⌘M MUDO' }, () => {
    muted = !muted;
    prefs.set('audio.muted', muted);
    // Volta ao volume afinado, não a uma constante: mudo é toggle, não reset.
    audio.setVolume(muted ? 0 : tuning.get('volume'));
  });

  keys.bind({ code: 'KeyR', alt: true, label: 'ALT+R CÂMERA' }, () => scene.release());
}

/**
 * Reaplica o que estava aberto/ligado na sessão anterior.
 *
 * Roda DEPOIS do registro dos painéis e ANTES do engate: no engate o operador já vê a tela
 * como deixou. O volume é o único que não se restaura aqui — quem manda nele é o `tuning`, e
 * o mudo apenas o zera temporariamente.
 */
function restorePrefs(panels, audio) {
  if (prefs.get('view.cinematic')) {
    document.body.classList.add('cinematic');
    ui('cinematic', { on: true });
  }
  if (prefs.get('audio.muted')) audio.setVolume(0);
  for (const [name, panel] of Object.entries(panels)) {
    if (prefs.get(`panel.${name}`)) panel?.toggle?.();
  }
}

/**
 * A dock: os apps como destinos, com o atalho numérico visível.
 *
 * É o equivalente da barra de tarefas — e como cada item também É um corpo no espaço, clicar
 * aqui e clicar no corpo levam ao mesmo lugar pelo mesmo caminho (`router.navigate`).
 */
function createDock(root, apps) {
  const dock = root.querySelector('[data-dock]');
  const items = new Map();

  const home = document.createElement('button');
  home.className = 'dock-item';
  home.dataset.app = ROUTE_ROOT;
  home.append(
    Object.assign(document.createElement('span'), { className: 'dock-key', textContent: '⌂' }),
    Object.assign(document.createElement('span'), { textContent: 'SISTEMA' })
  );
  home.addEventListener('click', () => (window.location.hash = '#/'));
  dock.append(home);
  items.set(ROUTE_ROOT, home);

  apps.forEach((app, index) => {
    const item = document.createElement('button');
    item.className = 'dock-item';
    item.dataset.app = app.id;
    item.title = app.tagline;
    item.style.setProperty('--dock-color', `#${app.color.toString(16).padStart(6, '0')}`);
    item.append(
      Object.assign(document.createElement('span'), { className: 'dock-dot' }),
      Object.assign(document.createElement('span'), { textContent: app.name }),
      Object.assign(document.createElement('span'), { className: 'dock-key', textContent: String(index + 1) })
    );
    item.addEventListener('click', () => (window.location.hash = `#/${app.id}`));
    dock.append(item);
    items.set(app.id, item);
  });

  return {
    setActive(id) {
      for (const [key, item] of items) item.dataset.active = String(key === id);
    },
  };
}

main().catch((error) => {
  console.error('[espatial] falha na inicialização', error);
  api.reportClient({ boot: 'error' });
});
