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
  rail.append(el('div', 'sub', 'um objeto por vez · tempo manual · sem pós-processamento'));

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
  const randomizable = spec.controls.filter((control) => control.type !== 'action' && control.roll !== false);
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

// ---------------------------------------------------------------- sonda de pixel

/**
 * `window.bancada` — a superfície que `scripts/lei-pixel.mjs` mede.
 *
 * ☠️ **Ela NÃO desenha no canvas da bancada, e essa é a decisão que a torna medível.** O quadro
 * visível carrega `devicePixelRatio`, o tamanho da janela e o antialias do driver — três grandezas
 * que mudam de máquina para máquina e fariam o mesmo espécime render números diferentes sem nada
 * ter mudado no shader. A sonda desenha num alvo FORA da tela, de lado fixo, e lê os pixels de lá.
 *
 * ⚠️ **O que ela mede é o material, nunca a soma.** É a mesma razão de a bancada não ter
 * pós-processamento: bloom e lente reescrevem o pixel depois que o material terminou, e um
 * oráculo que os incluísse acusaria a parcela errada quando o número saísse do lugar.
 *
 * ☠️ **Ela PERTURBA a bancada de propósito, e devolve o espécime anterior no fim.** Medir exige
 * montar — não há como interrogar um espécime que não está montado. O que não pode é a perturbação
 * ficar: quem estiver com a bancada aberta vê o painel piscar e volta para onde estava.
 */
const SONDA_LADO = 384;
/** Acima do fundo, em 0–255. Abaixo disso é ruído de quantização do próprio fundo liso. */
const SONDA_PISO = 6;
let alvoDaSonda = null;
const camDaSonda = new THREE.PerspectiveCamera(NEUTRAL.fov, 1, 0.1, 2000);

/** Luminância Rec.709 de um pixel RGBA já em bytes. */
const lumDe = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];

/**
 * As grandezas que um quadro sustenta. Todas ADIMENSIONAIS ou em 0–255 — nenhuma carrega pixel,
 * porque o lado do alvo é escolha da sonda e um número em pixel viraria função dela.
 */
function medirQuadro(buf, lado) {
  // O fundo sai da BORDA do quadro, medido, nunca da constante de `globals.js`: o mapeamento de
  // tom reescreve o valor entre a cor pedida e o byte lido, e conferir contra a cor pedida
  // acusaria toda pele por um deslocamento que é do renderer.
  const borda = [];
  for (let x = 0; x < lado; x += 1) {
    borda.push(lumDe(buf, 4 * x), lumDe(buf, 4 * ((lado - 1) * lado + x)));
  }
  borda.sort((a, b) => a - b);
  const fundo = borda[borda.length >> 1];

  let acesos = 0;
  let claros = 0;
  let saturados = 0;
  let pico = 0;
  let soma = 0;
  let somaX = 0;
  let somaY = 0;
  let peso = 0;
  let hash = 2166136261;
  for (let i = 0, p = 0; p < lado * lado; p += 1, i += 4) {
    const lum = lumDe(buf, i);
    soma += lum;
    if (lum > pico) pico = lum;
    if (lum - fundo > SONDA_PISO) {
      acesos += 1;
      const excesso = lum - fundo;
      somaX += (p % lado) * excesso;
      somaY += ((p / lado) | 0) * excesso;
      peso += excesso;
    }
    /*
     * ☠️ **`claros` é a grandeza do quadro LAVADO; `saturados` não é, e a medida refutou o
     * contrário.** Multiplicando a saída do planeta por 50 no fragmento, a saturação nos três
     * canais ficou em ZERO — o mapeamento de tom ACES comprime o topo, então "estourado" quase
     * nunca chega a 250 em R, G e B ao mesmo tempo. O que a mancha branca de fato faz é encher o
     * quadro de luminância ALTA, e é isso que `claros` conta.
     */
    if (lum > 200) claros += 1;
    if (buf[i] >= 250 && buf[i + 1] >= 250 && buf[i + 2] >= 250) saturados += 1;
    hash = Math.imul(hash ^ buf[i], 16777619) ^ buf[i + 1] ^ buf[i + 2];
  }

  const total = lado * lado;
  return {
    fundo: Number(fundo.toFixed(2)),
    cobertura: acesos / total,
    claros: claros / total,
    saturacao: saturados / total,
    pico: Number(pico.toFixed(2)),
    media: Number((soma / total).toFixed(3)),
    // Em fração do lado, com a origem no centro: sobrevive à troca do lado do alvo.
    centro: peso
      ? { x: Number((somaX / peso / lado - 0.5).toFixed(4)), y: Number((somaY / peso / lado - 0.5).toFixed(4)) }
      : null,
    hash: hash >>> 0,
  };
}

window.bancada = Object.freeze({
  /** O catálogo, para o oráculo não manter uma lista à mão que envelhece sozinha. */
  especimes: () => SPECS.map((s) => ({ id: s.id, name: s.name, distance: s.distance })),

  /**
   * Monta um espécime, enquadra, desenha UM quadro fora da tela e devolve as grandezas dele.
   *
   * @param {object} pedido
   * @param {string} pedido.id        espécime do catálogo
   * @param {number} [pedido.azimuth] em radianos — o mesmo eixo do arraste
   * @param {number} [pedido.polar]   em radianos
   * @param {number} [pedido.distance] default: a distância declarada pelo espécime
   * @param {number} [pedido.elapsed] o instante do relógio, em segundos
   * @param {number} [pedido.lado]    lado do alvo, em pixels de buffer
   */
  async medir(pedido) {
    const anterior = spec;
    const alvoSpec = SPECS.find((s) => s.id === pedido.id);
    if (!alvoSpec) throw new Error(`espécime desconhecido: ${pedido.id}`);

    const lado = pedido.lado ?? SONDA_LADO;
    if (!alvoDaSonda || alvoDaSonda.width !== lado) {
      alvoDaSonda?.dispose();
      alvoDaSonda = new THREE.WebGLRenderTarget(lado, lado);
      alvoDaSonda.texture.colorSpace = THREE.SRGBColorSpace;
    }

    /*
     * ☠️ **A GRADE E A ESFERA SAEM, e sem isso a sonda mede a coisa errada.** As duas desenham
     * independentemente do espécime montado: medido, `sonda`, `asteroide`, `particulas` e
     * `planeta` devolviam cobertura IDÊNTICA (1,890% · pico 19,59) a uma distância em que só a
     * grade aparecia. Um espécime que parasse de desenhar continuaria acusando cobertura, que é
     * exatamente a afirmação que este oráculo existe para impedir.
     */
    const grade = globalValues.grade;
    const referencia = globalValues.referencia;
    globalValues.grade = false;
    globalValues.referencia = false;
    globals.apply(globalValues);

    mount(alvoSpec);
    clock.elapsed = pedido.elapsed ?? 0;

    const azimuth = pedido.azimuth ?? 0.6;
    const polar = pedido.polar ?? 1.15;

    /** Põe a câmera a `distance` de `alvo`, no mesmo par de ângulos que o arraste usa. */
    const enquadrar = (distance, alvo) => {
      camDaSonda.position.set(
        alvo.x + Math.sin(azimuth) * Math.sin(polar) * distance,
        alvo.y + Math.cos(polar) * distance,
        alvo.z + Math.cos(azimuth) * Math.sin(polar) * distance
      );
      camDaSonda.lookAt(alvo.x, alvo.y, alvo.z);
      camDaSonda.updateMatrixWorld(true);
      return distance;
    };

    let distance = enquadrar(pedido.distance ?? alvoSpec.distance, new THREE.Vector3());

    /*
     * ☠️ **UM quadro não basta, e medir num só chamava de "não desenha" o que ainda não tinha
     * chegado.** Dois motivos, e são de naturezas diferentes: o ASTEROIDE carrega a malha de um
     * arquivo (`.stl`), então antes da resposta o grupo está vazio; e as PARTÍCULAS integram
     * estado, então no passo zero o ensemble ainda não saiu da origem. Os dois desenhariam
     * cobertura NULA num quadro só, que é indistinguível de feição apagada — a confusão exata que
     * este oráculo existe para não cometer.
     *
     * ⚠️ O número de quadros é DADO, nunca "até parecer pronto": espécime que integra estado
     * responde diferente a 6 e a 60 passos, e um laço que parasse quando a imagem "acalmasse"
     * mediria um instante distinto a cada corrida.
     */
    const quadros = pedido.quadros ?? 1;
    for (let i = 0; i < quadros; i += 1) {
      live?.update(values, camDaSonda, clock);
      await new Promise((r) => requestAnimationFrame(r));
    }
    live?.update(values, camDaSonda, clock);

    /*
     * ⚠️ **Cobertura zero tem DUAS causas, e elas pedem consertos opostos.** Ou o espécime não
     * submeteu geometria nenhuma (feição apagada), ou submeteu e ela caiu fora do enquadramento
     * (corpo longe da origem). Sem separá-las, quem lê o zero conserta a metade errada — então a
     * sonda conta os objetos VISÍVEIS e mede a esfera envolvente em mundo.
     */
    let visiveis = 0;
    const caixa = new THREE.Box3();
    live?.object?.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
      visiveis += 1;
      if (o.geometry) {
        o.geometry.computeBoundingBox?.();
        if (o.geometry.boundingBox) caixa.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
    });
    const esfera = caixa.isEmpty() ? null : caixa.getBoundingSphere(new THREE.Sphere());

    /*
     * ☠️ **ENQUADRAR PELO CORPO É OPÇÃO, e o default é a distância DECLARADA — a medida refutou o
     * contrário.** Enquadrando pela esfera envolvente, `planeta` caiu de 48,2% de cobertura para
     * ZERO: a esfera dá raio 1,906 e a conta põe a câmera a ~5,6, onde o corpo está abaixo do piso
     * de LOD e legitimamente não desenha (o mesmo "nível AUSENTE" que o sorteio de raio já
     * produziu). `fotosfera` deixou de ser determinístico junto.
     *
     * ⭑ A `distance` de cada espécime não é enfeite: é a pose em que o autor dele quis que fosse
     * revisado, e para corpo com nível de detalhe ela É parte do que se revisa. Um oráculo que a
     * sobrepõe mede um enquadramento que ninguém escolheu.
     *
     * Serve para o caso oposto — o corpo que a pose declarada não alcança (`satelites` desenha a
     * 75,4 da origem no instante 0) —, e aí quem chama pede.
     */
    let auto = false;
    if (pedido.enquadrar === 'corpo' && pedido.distance === undefined && esfera && esfera.radius > 0) {
      const meio = THREE.MathUtils.degToRad(camDaSonda.fov) / 2;
      distance = enquadrar((esfera.radius / Math.sin(meio)) * 1.15, esfera.center);
      auto = true;
      live?.update(values, camDaSonda, clock);
    }

    renderer.setRenderTarget(alvoDaSonda);
    renderer.render(scene, camDaSonda);
    const buf = new Uint8Array(lado * lado * 4);
    renderer.readRenderTargetPixels(alvoDaSonda, 0, 0, lado, lado, buf);
    renderer.setRenderTarget(null);

    const medida = medirQuadro(buf, lado);
    medida.enquadramento = auto ? 'corpo' : 'declarado';
    medida.visiveis = visiveis;
    medida.raio = esfera ? Number(esfera.radius.toFixed(3)) : null;
    medida.centroMundo = esfera
      ? [esfera.center.x, esfera.center.y, esfera.center.z].map((n) => Number(n.toFixed(2)))
      : null;

    globalValues.grade = grade;
    globalValues.referencia = referencia;
    globals.apply(globalValues);
    if (anterior && anterior !== alvoSpec) mount(anterior);

    return { id: pedido.id, lado, azimuth, polar, distance, elapsed: clock.elapsed, ...medida };
  },
});

window.addEventListener('resize', resize);
resize();
mount(SPECS[0]);
requestAnimationFrame(frame);
