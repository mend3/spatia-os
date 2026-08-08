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
import { createGlobals } from './globals.js';

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
 * Os controles da CENA — grade, esfera de raio 1, fundo e o multiplicador do relógio.
 *
 * Eles são declarados em `globals.js` na MESMA forma de `spec.controls`, e desenhados pelo mesmo
 * `buildControl` — não há interface escrita à mão para um controle global.
 *
 * A grade não é enfeite: boa parte do que se revisa aqui é ALTURA — órbita que tem de cruzar o
 * plano, anel que tem de tombar, corpo que tem de passar atrás. Sem um plano visível, "está no
 * plano?" vira opinião.
 */
const globals = createGlobals(scene, renderer);
const globalValues = Object.fromEntries(globals.controls.map(({ key, value }) => [key, value]));
globals.apply(globalValues);

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
 *
 * ⚠️ `delta` é o passo BASE; o passo em vigor é ele vezes VELOCIDADE (controle da cena), e é o
 * segundo que os espécimes recebem. Multiplicar aqui, num lugar só, é o que faz o controle
 * alcançar espécime nenhum saber que ele existe — o mesmo desenho de `timeScale` na cena de
 * verdade (`core/tuning.js`, grupo GLOBAL).
 */
const BASE_DELTA = 1 / 60;
const clock = { elapsed: 0, delta: BASE_DELTA, playing: false };

/** Reaplica a velocidade ao passo. Chamada antes de cada avanço, e ao mover o slider. */
const passo = () => {
  clock.delta = BASE_DELTA * globals.timeScale(globalValues);
  return clock.delta;
};

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
    clock.elapsed += passo();
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
  /*
   * SORTEAR mexe em APARÊNCIA, nunca em ENQUADRAMENTO.
   *
   * ⚠️ Ele já produziu um planeta invisível: sorteando `raio` (0,2–1,6) o astro caía abaixo do
   * piso de LOD e o readout dizia `nível AUSENTE` — correto, e lido como forma quebrada. As
   * réguas de tamanho existem para VARRER o LOD à mão, que é metade do trabalho da bancada;
   * sortear em cima delas esconde o eixo em vez de exercitá-lo.
   *
   * O conserto é declarativo (`roll: false` no controle) e não uma lista de chaves aqui: um
   * espécime novo com régua de tamanho própria seria um bug esperando, e quem escreve o espécime
   * é quem sabe qual eixo é enquadramento.
   *
   * `action` fica de fora pelo mesmo espírito, e por um motivo mais duro: sortear um botão seria
   * disparar o efeito dele. Espécime sem nada a sortear não ganha botão — botão inerte ensina a
   * duvidar dos que funcionam.
   */
  const randomizable = spec.controls.filter(
    (control) => control.type !== 'action' && control.roll !== false
  );
  if (randomizable.length) {
    const dice = el('button', null, `⚄ SORTEAR ${randomizable.length}`);
    dice.addEventListener('click', () => {
      for (const control of randomizable) values[control.key] = randomValue(control);
      onSpecChange();
      // Redesenha porque o store deixou de ser o que os inputs mostram — mesmo motivo do `enum`.
      drawRail();
    });
    rail.append(dice);
    rail.append(el('div', 'note', '· clicar no espécime de novo devolve os valores declarados'));
  }
  for (const control of spec.controls) rail.append(buildControl(control, values, onSpecChange));

  rail.append(el('div', 'group', 'O QUE OLHAR'));
  for (const line of spec.watch) rail.append(el('div', 'note', `· ${line}`));

  /*
   * A CENA vem por último e é montada do mesmo jeito que o espécime — mesma lista declarativa,
   * mesmo `buildControl`. A única diferença é o destino do valor e o que acontece depois dele.
   */
  rail.append(el('div', 'group', 'CENA'));
  for (const control of globals.controls) {
    rail.append(buildControl(control, globalValues, onGlobalChange));
  }
  rail.append(el('div', 'note', 'arraste para orbitar · roda para aproximar'));
}

/** Um controle do espécime mudou. O espécime lê `values` no próximo quadro — nada a fazer. */
function onSpecChange() {}

/** Um controle da cena mudou: os objetos globais reagem na hora, e o passo do relógio também. */
function onGlobalChange() {
  globals.apply(globalValues);
  passo();
}

/**
 * Sorteia um valor DENTRO da faixa que o próprio controle declara.
 *
 * A faixa declarada é a régua, e sortear fora dela produziria um espécime que o slider não
 * consegue reproduzir — a bancada existe justamente para que o que se vê tenha um número ao lado.
 * Por isso o sorteio não tem faixa própria: ele lê a mesma que o dedo lê.
 *
 * ⚠️ `action` fica de fora, e não é economia: sortear um botão seria DISPARAR o efeito dele.
 * Quem chama já filtrou — este `throw` existe para o caso de alguém passar a chamar direto.
 */
function randomValue(control) {
  if (control.type === 'action') throw new Error(`action não tem valor a sortear: ${control.key}`);
  if (control.type === 'bool') return Math.random() < 0.5;
  if (control.type === 'enum') {
    return control.options[Math.floor(Math.random() * control.options.length)];
  }
  /*
   * Quantizado no `step` declarado. O slider snapa para o passo; um valor entre dois passos faria
   * o readout e a posição do polegar discordarem no primeiro arraste — divergência pequena, do
   * tipo que só aparece quando alguém tenta reproduzir o que viu.
   */
  const steps = Math.round((control.max - control.min) / control.step);
  const value = control.min + Math.round(Math.random() * steps) * control.step;
  // O passo em ponto flutuante acumula (0,1 × 3 = 0,30000000000000004) e vazaria para o readout.
  return Number(value.toFixed(6));
}

/**
 * Desenha um controle declarado.
 *
 * `store` e `onChange` são parâmetros porque a mesma função serve ao espécime e à cena. Um controle
 * que custasse um `<label>` a mais aqui é um controle que não se escreve.
 */
function buildControl(control, store, onChange) {
  if (control.type === 'action') {
    const button = el('button', null, `⟳ ${control.label}`);
    button.addEventListener('click', () => live?.onAction?.(control.key, store));
    return button;
  }

  const row = el('label');
  row.append(el('span', null, control.label));

  if (control.type === 'bool') {
    const input = el('input');
    input.type = 'checkbox';
    input.checked = store[control.key];
    input.addEventListener('change', () => {
      store[control.key] = input.checked;
      onChange();
    });
    row.append(input);
    return row;
  }

  if (control.type === 'enum') {
    row.append(el('b', null, String(store[control.key])));
    const strip = el('div');
    strip.style.cssText = 'grid-column:1/-1;display:flex;flex-wrap:wrap;gap:3px;padding-top:3px';
    for (const option of control.options) {
      const button = el('button', null, option);
      button.setAttribute('aria-pressed', String(option === store[control.key]));
      button.addEventListener('click', () => {
        store[control.key] = option;
        onChange();
        drawRail();
      });
      strip.append(button);
    }
    row.append(strip);
    return row;
  }

  const value = el('b', null, Number(store[control.key]).toFixed(2));
  row.append(value);
  const input = el('input');
  input.type = 'range';
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step);
  input.value = String(store[control.key]);
  input.addEventListener('input', () => {
    store[control.key] = Number(input.value);
    value.textContent = Number(input.value).toFixed(2);
    onChange();
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
  // Todo quadro, e não só ao mover o slider: espécimes que integram estado (partículas, o
  // desvanecimento dos vínculos) leem `clock.delta` mesmo com o tempo congelado, e um passo
  // desatualizado os faria andar no ritmo da velocidade anterior.
  passo();
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
