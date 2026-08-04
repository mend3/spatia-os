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
import * as tuning from './core/tuning.js';

const hud = document.getElementById('hud');
const canvas = document.getElementById('space');
const bootRoot = document.getElementById('boot');
const hover = document.querySelector('[data-hover]');

async function main() {
  if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) {
    api.reportClient({ boot: 'no_webgl' });
    bootRoot.querySelector('[data-boot-status]').textContent =
      'WebGL indisponível — o observatório precisa de aceleração gráfica';
    return;
  }

  state.install();

  const audio = createAudio();
  const scene = createScene(canvas);
  const frame = createFrame(hud);
  const streams = createStreams(hud, { toolColor: scene.toolColor });
  const answer = createAnswer(hud);
  const terminal = createTerminal(hud, { audio });
  createControls(hud);
  createPermissions(hud);
  // A onda da HUD passa a ser desenhada com a amplitude real do áudio que o motor toca.
  const voice = createVoice(hud, { onLevel: (level) => terminal.setLevel(level) });
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

  installShortcuts(scene, audio, answer, terminal);

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

  await boot.report(health, nodeCount);
  api.startTelemetry(() => ({ ...scene.sampleTelemetry(), audio: audio.isEnabled() }));
  await boot.engage();
}

function installShortcuts(scene, audio, answer, terminal) {
  let cinematic = false;
  let muted = false;

  /**
   * `Esc` tem uma cadeia, e ela vive só aqui.
   *
   * Antes, dois módulos escutavam a tecla — o terminal para abortar, o inspetor para fechar,
   * um deles com `stopPropagation` — e o resultado era que nem o inspetor fechava nem a
   * resposta saía da tela: só F5 resolvia. A ordem é do gesto mais recente para o mais
   * antigo, que é a expectativa de qualquer interface: desfaz-se o último passo primeiro.
   */
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (answer.isInspecting()) {
        answer.close();
      } else if (api.isStreaming()) {
        api.abort();
        emit({ t: 'state', state: 'idle', label: 'ABORTADO' });
        emit({ t: 'done' });
      } else if (answer.hasAnswer()) {
        voice.stop();
        answer.dismiss();
        terminal.focus();
      } else {
        terminal.clearInput();
      }
      audio.click({ frequency: 520, gain: 0.05, decay: 0.12 });
      return;
    }

    if (event.code === 'Tab') {
      event.preventDefault();
      cinematic = !cinematic;
      document.body.classList.toggle('cinematic', cinematic);
      ui('cinematic', { on: cinematic });
      audio.click({ frequency: cinematic ? 700 : 1400, gain: 0.06, decay: 0.3 });
      return;
    }
    if (event.key === 'm' && event.metaKey) {
      event.preventDefault();
      muted = !muted;
      // Volta para o volume afinado, não para uma constante: mudo é toggle, não reset.
      audio.setVolume(muted ? 0 : tuning.get('volume'));
      return;
    }
    if (event.key === 'r' && event.altKey) {
      // Devolve a câmera à deriva automática depois de o operador tê-la movido.
      scene.release();
    }
  });
}

main().catch((error) => {
  console.error('[espatial] falha na inicialização', error);
  api.reportClient({ boot: 'error' });
});
