/**
 * A bancada — renderer mínimo, tempo manual, um espécime por vez.
 *
 * O que ela deliberadamente NÃO tem, e por quê:
 *
 * - **Sem pós-processamento.** Bloom, lente e grão são camadas que reescrevem o pixel depois
 *   que o material terminou. Revisar um shader através delas é revisar a soma, não a parcela.
 * - **Sem loop livre de tempo.** O relógio é um slider. Comparar duas versões de um material
 *   exige o MESMO instante nas duas, e "mesmo instante" não existe quando o tempo corre — foi
 *   exatamente o que impediu de validar a extinção do anel dentro da cena.
 * - **Sem HUD, sem dados reais, sem servidor.** A bancada abre offline e nunca depende de haver
 *   corpus indexado; um objeto que só dá para revisar com o Qdrant no ar não dá para revisar.
 *
 * O que ela tem que ter e é fácil esquecer: os MESMOS módulos da cena, por `import`.
 */
import * as THREE from 'three';
import { SPECS, NEUTRAL } from './specs.js';

const canvas = document.getElementById('stage');
const rail = document.getElementById('rail');
const readout = document.getElementById('readout');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(NEUTRAL.fov, 1, 0.1, 2000);

/*
 * Grade de referência no plano do disco.
 *
 * Não é enfeite: metade dos defeitos desta sessão foram sobre ALTURA — órbita que nunca cruza o
 * plano, anel que devia tombar, corpo que devia passar atrás. Sem um plano visível, "está no
 * plano?" vira opinião.
 */
const grid = new THREE.GridHelper(200, 40, 0x2d3648, 0x151b25);
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);

/** Órbita manual — o mesmo gesto da cena, sem deriva automática. */
const orbit = { azimuth: 0.6, polar: 1.15, distance: 10 };
let dragging = false;

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', (event) => {
  dragging = false;
  canvas.releasePointerCapture?.(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  orbit.azimuth -= event.movementX * 0.006;
  orbit.polar = THREE.MathUtils.clamp(orbit.polar - event.movementY * 0.005, 0.05, 3.09);
});
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    orbit.distance = THREE.MathUtils.clamp(orbit.distance * (1 + Math.sign(event.deltaY) * 0.1), 0.6, 900);
  },
  { passive: false }
);

// ---------------------------------------------------------------- estado da bancada

let spec = null;
let live = null;
const values = {};
/*
 * O relógio é DADO, não consequência do rAF.
 *
 * `delta` é fixo e `elapsed` só anda quando o operador manda. Um espécime que integra estado
 * (partículas, portais) continua funcionando; a diferença é que o instante é reproduzível.
 */
const clock = { elapsed: 0, delta: 1 / 60, playing: false };

const ctx = {
  report(fields) {
    readout.innerHTML = Object.entries(fields)
      .map(([key, value]) => `${key} <b>${value}</b>`)
      .join('<br>');
  },
};

function mount(next) {
  if (live?.dispose) live.dispose();
  if (live?.object) scene.remove(live.object);
  spec = next;
  clock.elapsed = 0;

  for (const control of spec.controls) {
    if (control.type !== 'action') values[control.key] = control.value;
  }
  live = spec.build(ctx);
  scene.add(live.object);
  orbit.distance = spec.distance;
  drawRail();
}

// ---------------------------------------------------------------- painel

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawRail() {
  rail.replaceChildren();
  rail.append(el('h1', null, 'BANCADA 3D'));
  rail.append(
    el('div', 'sub', 'um objeto por vez · tempo manual · sem pós-processamento')
  );

  rail.append(el('div', 'group', 'ESPÉCIME'));
  for (const entry of SPECS) {
    const button = el('button', null, entry.name);
    button.setAttribute('aria-pressed', String(entry.id === spec.id));
    button.addEventListener('click', () => mount(entry));
    rail.append(button);
  }

  rail.append(el('div', 'group', 'TEMPO'));
  const play = el('button', null, clock.playing ? '⏸ CONGELAR' : '▶ CORRER');
  play.addEventListener('click', () => {
    clock.playing = !clock.playing;
    drawRail();
  });
  rail.append(play);

  const step = el('button', null, '→ UM QUADRO');
  step.addEventListener('click', () => {
    clock.elapsed += clock.delta;
  });
  rail.append(step);

  const timeRow = el('label');
  timeRow.append(el('span', null, 'INSTANTE'), el('b', null, `${clock.elapsed.toFixed(2)}s`));
  const time = el('input');
  time.type = 'range';
  time.min = '0';
  time.max = '30';
  time.step = '0.01';
  time.value = String(clock.elapsed);
  time.addEventListener('input', () => {
    clock.elapsed = Number(time.value);
    timeRow.querySelector('b').textContent = `${clock.elapsed.toFixed(2)}s`;
  });
  timeRow.append(time);
  rail.append(timeRow);

  rail.append(el('div', 'group', 'CONTROLES'));
  for (const control of spec.controls) rail.append(buildControl(control));

  rail.append(el('div', 'group', 'O QUE OLHAR'));
  for (const line of spec.watch) rail.append(el('div', 'note', `· ${line}`));

  rail.append(el('div', 'group', 'CENA'));
  const gridRow = el('label');
  gridRow.append(el('span', null, 'GRADE DO PLANO'));
  const gridToggle = el('input');
  gridToggle.type = 'checkbox';
  gridToggle.checked = grid.visible;
  gridToggle.addEventListener('change', () => {
    grid.visible = gridToggle.checked;
  });
  gridRow.append(gridToggle);
  rail.append(gridRow);
  rail.append(el('div', 'note', 'arraste para orbitar · roda para aproximar'));
}

function buildControl(control) {
  if (control.type === 'action') {
    const button = el('button', null, `⟳ ${control.label}`);
    button.addEventListener('click', () => live?.onAction?.(control.key, values));
    return button;
  }

  const row = el('label');
  row.append(el('span', null, control.label));

  if (control.type === 'bool') {
    const input = el('input');
    input.type = 'checkbox';
    input.checked = values[control.key];
    input.addEventListener('change', () => {
      values[control.key] = input.checked;
    });
    row.append(input);
    return row;
  }

  if (control.type === 'enum') {
    row.append(el('b', null, String(values[control.key])));
    const strip = el('div');
    strip.style.cssText = 'grid-column:1/-1;display:flex;flex-wrap:wrap;gap:3px;padding-top:3px';
    for (const option of control.options) {
      const button = el('button', null, option);
      button.setAttribute('aria-pressed', String(option === values[control.key]));
      button.addEventListener('click', () => {
        values[control.key] = option;
        drawRail();
      });
      strip.append(button);
    }
    row.append(strip);
    return row;
  }

  const value = el('b', null, Number(values[control.key]).toFixed(2));
  row.append(value);
  const input = el('input');
  input.type = 'range';
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step);
  input.value = String(values[control.key]);
  input.addEventListener('input', () => {
    values[control.key] = Number(input.value);
    value.textContent = Number(input.value).toFixed(2);
  });
  row.append(input);
  return row;
}

// ---------------------------------------------------------------- laço

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function frame() {
  if (clock.playing) clock.elapsed += clock.delta;

  camera.position.set(
    Math.sin(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance,
    Math.cos(orbit.polar) * orbit.distance,
    Math.cos(orbit.azimuth) * Math.sin(orbit.polar) * orbit.distance
  );
  camera.lookAt(0, 0, 0);

  try {
    live?.update(values, camera, clock);
  } catch (error) {
    // Espécime que explode não derruba a bancada: ele mostra o próprio erro e o resto continua
    // navegável — a mesma disciplina do host de widgets da cena.
    readout.innerHTML = `<b style="color:var(--bad)">${error.message}</b>`;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
mount(SPECS[0]);
requestAnimationFrame(frame);
