/*
 * Oráculo da COSTURA do disco do buraco negro — roda sem navegador, sem GPU.
 *
 * A pergunta: o campo de filamentos do disco é CONTÍNUO ao dar uma volta completa?
 *
 * `emissaoDoDisco` monta a coordenada de ruído a partir de `theta = atan(hit.z, hit.x)`, que salta
 * de +pi para -pi numa linha radial. Se o ruído não for periódico naquele intervalo, os dois lados
 * da linha amostram lugares sem relação nenhuma — e o disco ganha uma cicatriz parada no espaço
 * enquanto o filamento escoa por cima dela.
 *
 * O método: amostra `estria` dos dois lados do corte, no MESMO ponto físico, e compara o salto com
 * a variação típica do campo no mesmo passo angular. Salto >> variação típica = costura.
 *
 *   node scripts/costura-disco.mjs
 */

// ---- transcrição do shader (`blackhole-geodesic.js`) --------------------------------

const LACUNARIDADE = 2.0; // era 2.17 — ver PERIODO
const ESCALA_AZIMUTAL = 15 / (2 * Math.PI); // era 2.4 — ver PERIODO
const PERIODO = 15; // células por volta, na oitava base. 0 = sem periodicidade (o de antes)

const fract = (x) => x - Math.floor(x);

function hash2(x, y) {
  const a = x * 127.1 + y * 311.7;
  const b = x * 269.5 + y * 183.3;
  return [fract(Math.sin(a) * 43758.5453) * 2 - 1, fract(Math.sin(b) * 43758.5453) * 2 - 1];
}

function ruido(x, y, periodo) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  // O EMBRULHO é só em X (o raio não é cíclico) e só nas DUAS colunas da célula, não nos quatro
  // cantos — é essa a forma barata dele.
  const envolve = (v) => (periodo > 0 ? v - periodo * Math.floor(v / periodo) : v);
  const x0 = envolve(ix);
  const x1 = envolve(ix + 1);
  const g = (dx, dy) => {
    const [hx, hy] = hash2(dx === 0 ? x0 : x1, iy + dy);
    return hx * (fx - dx) + hy * (fy - dy);
  };
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(mix(g(0, 0), g(1, 0), ux), mix(g(0, 1), g(1, 1), ux), uy);
}

function fbm(x, y, periodo) {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < 3; i++) {
    s += a * ruido(x, y, periodo);
    x *= LACUNARIDADE;
    y *= LACUNARIDADE;
    periodo *= LACUNARIDADE;
    a *= 0.5;
  }
  return s;
}

/** `estriaA` de `emissaoDoDisco`, no ramo em que uDiskDetail = 1. */
function estria(theta, span, { escala, periodo, tempo = 3.7, spin = 1 }) {
  const r = 1 + span * 3; // só entra pela keplerian; o valor exato não muda a conclusão
  const keplerian = Math.pow(Math.max(r, 0.35), -1.5);
  const giro = theta + tempo * spin * 6;
  const taxa = (keplerian - 1) * spin * 6 * 0.18;
  const fase = fract(tempo / 2.8);
  const localA = (fase - 0.5) * 2.8;
  const radial = span * 9 - tempo * spin * 0.35;
  return fbm((giro + taxa * localA) * escala, radial * 2.6, periodo) * 0.5 + 0.5;
}

// ---- a medida -----------------------------------------------------------------------

/*
 * O passo de referência é UM PIXEL de arco no corpo em foco. Sem uma régua assim, "o salto é
 * grande" não quer dizer nada: o campo é ruído e ele varia em toda parte. O que faz uma cicatriz é
 * o salto acontecer numa distância em que o campo normalmente não anda quase nada.
 *
 * Com o disco ocupando ~700 px de diâmetro na foto do usuário, um pixel na borda externa vale
 * ~2/350 rad. É esse o passo comparado dos dois lados.
 */
const PASSO_PX = 2 / 350;

function varredura(rotulo, escala, periodo) {
  let piorSalto = 0;
  let piorTipica = 0;
  for (let i = 0; i < 400; i++) {
    const span = i / 399;
    // Os dois lados do corte: +pi e -pi são o MESMO ponto físico, não um passo pequeno.
    const a = estria(Math.PI, span, { escala, periodo });
    const b = estria(-Math.PI, span, { escala, periodo });
    piorSalto = Math.max(piorSalto, Math.abs(a - b));
    // A referência, medida do mesmo jeito: o PIOR que o campo anda em um pixel, longe do corte.
    for (let k = 0; k < 16; k++) {
      const th = -3 + k * 0.375;
      piorTipica = Math.max(
        piorTipica,
        Math.abs(estria(th, span, { escala, periodo }) - estria(th + PASSO_PX, span, { escala, periodo }))
      );
    }
  }
  console.log(
    `${rotulo.padEnd(22)} salto no corte ${piorSalto.toExponential(3)} · pior passo de 1px ${piorTipica.toExponential(3)} · razão ${(piorSalto / Math.max(piorTipica, 1e-12)).toFixed(1)}x`
  );
  return piorSalto;
}

console.log('estria em [0,1]; o salto é a descontinuidade que o olho lê como cicatriz radial.\n');
const antes = varredura('ANTES (2,4 · sem P)', 2.4, 0);
const depois = varredura('DEPOIS (15 células)', ESCALA_AZIMUTAL, PERIODO);

console.log();
const ok = depois < 1e-6;
console.log(
  ok
    ? `ok — a volta fecha. O corte deixou de existir (${depois.toExponential(2)}).`
    : `FALHOU — ainda há ${depois.toFixed(5)} de degrau no corte.`
);
process.exit(ok ? 0 : 1);
