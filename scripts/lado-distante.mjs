/**
 * ORÁCULO DO LADO DISTANTE — item #7 do brief do buraco negro.
 *
 * "A parte de trás deveria aparecer muito mais comprimida. Hoje ela parece apenas outro anel."
 *
 * Compressão é uma DERIVADA, não uma impressão: quantos raios de disco a imagem empacota em cada
 * unidade de tela, dr/dy.
 *
 * ⚠️ DUAS GRANDEZAS ERRADAS ANTES DA CERTA, e as duas ficam aqui porque a segunda é sutil:
 *
 *   1. `hits[ordem]` — a ordem do cruzamento NÃO é o lado. De perfil, o raio mirado acima do
 *      buraco desce e cruza o plano ATRÁS, e esse é o primeiro cruzamento dele. Frente e trás
 *      caíam no mesmo balde.
 *
 *   2. A RAZÃO entre a compressão do lado de trás e a do lado da frente. Medida, ela dá 1,1–1,3x —
 *      e não se move com a largura do disco (7x, 5x, 3,5x e 2,5x a sombra dão 1,16 · 1,13 · 1,12 ·
 *      1,28 a 75°). A hipótese "o disco é largo demais e por isso o lado de trás vive na zona de
 *      deflexão fraca" foi REFUTADA por essa varredura.
 *
 * O que o brief desenha é OUTRA coisa, e o ASCII dele diz qual: `=========` virando `=====`. Não é
 * o arco de trás ser mais fino que a frente — é ele AFUNILAR dentro de si mesmo. A imagem direta é
 * plana (dr/dy ≈ 1/sen(i), constante); a imagem que passa por cima diverge conforme o parâmetro de
 * impacto se aproxima do crítico. O número é PICO/MEDIANA dentro de cada lado.
 *
 * Este arquivo reimplementa EXATAMENTE o laço de `blackhole-geodesic.js` (leapfrog, aceleração
 * -1,5 h² p / r⁵, passo min(r·uStepScale, R·0,08), captura analítica por b < √27/2·Rs). Se a
 * medida aqui e a tela discordarem, um dos dois está errado — e é para isso que ele existe.
 *
 * Uso: node scripts/lado-distante.mjs [inclinacao_graus]
 * Sai 0 quando o lado de trás afunila (pico/mediana ≥ 2) e o da frente NÃO (≤ 1,5). Os dois lados
 * importam: se a frente também afunilasse, o afunilamento seria artefato de amostragem, não lente.
 */

const RS = 1;
const SOMBRA = (Math.sqrt(27) / 2) * RS; // 2,598 Rs — o raio aparente da sombra
// Do `blackhole.js`: DISK_INNER = HORIZON_RADIUS·1,41 e DISK_OUTER = HORIZON_RADIUS·7,0, com
// HORIZON_RADIUS = √27/2·Rs. A geometria do disco vive em múltiplos da SOMBRA, não do Rs.
const INNER = SOMBRA * 1.41;
// A borda externa é varrível: `LD_OUTER=4 node scripts/lado-distante.mjs 75` responde
// "e se o disco fosse mais estreito?" sem tocar no shader.
const OUTER = SOMBRA * Number(process.env.LD_OUTER ?? 7.0);
const R_INFLUENCIA = OUTER * 1.25;
const STEP_SCALE = 0.12;
const STEPS = 64;

// ⚠️ ACIMA DE ~80° A COLUNA CENTRAL NÃO VÊ A FRENTE, e isso é geometria, não falha: de perfil o
// lado de cá do disco aparece à ESQUERDA e à DIREITA da sombra, nunca acima nem abaixo dela. Um
// raio que corre dentro do plano nunca troca o sinal de y. O padrão fica onde os dois lados
// coexistem na mesma coluna.
const inclinacaoGraus = Number(process.argv[2] ?? 72);
const inc = (inclinacaoGraus * Math.PI) / 180; // 90° = de perfil

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / len(a));

/**
 * Traça um raio e devolve o raio do disco em CADA cruzamento do plano, em ordem.
 * `imagem[0]` é a imagem direta (a de menor desvio), `imagem[1]` a de primeira ordem, etc.
 */
function cruzamentos(origem, direcao, eixo) {
  let p = [...origem];
  let v = [...direcao];
  const h2 = dot(cross(p, v), cross(p, v));
  const bImp = Math.sqrt(h2) / len(v);
  if (bImp < SOMBRA) return { capturado: true, hits: [] };

  const R = R_INFLUENCIA;
  const b = dot(p, direcao);
  const c = dot(p, p) - R * R;
  const delta = b * b - c;
  if (delta <= 0) return { capturado: false, hits: [] };
  const entrada = -b - Math.sqrt(delta);
  if (entrada > 0) p = add(p, mul(direcao, entrada));

  const hits = [];
  for (let i = 0; i < STEPS; i++) {
    const r = len(p);
    if (r < RS) break;
    if (r > R * 1.05 && dot(p, v) > 0) break;
    const passo = Math.min(r * STEP_SCALE, R * 0.08);
    const anterior = [...p];
    const r2 = r * r;
    v = add(v, mul(p, (-1.5 * h2 * RS) / (r2 * r2 * r) * passo));
    p = add(p, mul(v, passo));
    if (anterior[1] * p[1] < 0) {
      const t = -anterior[1] / (p[1] - anterior[1]);
      const hit = add(anterior, mul(sub(p, anterior), t));
      // ⚠️ O LADO É O SINAL DA PROJEÇÃO, não a ordem do cruzamento — e confundir os dois foi o
      // primeiro resultado errado deste oráculo. De perfil, o raio mirado ACIMA do buraco desce e
      // cruza o plano ATRÁS: é o primeiro cruzamento dele, mas é o lado distante. Medindo por
      // ordem, frente e trás caíam no mesmo balde e a razão dava 1,0 sem nenhuma imagem faltar.
      hits.push({ r: Math.hypot(hit[0], hit[2]), perto: hit[0] * eixo[0] + hit[2] * eixo[2] > 0 });
    }
  }
  return { capturado: false, hits };
}

// Câmera longe, na inclinação pedida. Longe o bastante para que o parâmetro de impacto seja
// linear no deslocamento vertical da tela — é o que torna dr/db comparável a "raios por pixel".
const D = OUTER * 6;
const cam = [0, D * Math.cos(inc), D * Math.sin(inc)];
const frente = norm(mul(cam, -1));
// "Para cima" na tela: perpendicular à visada, no plano que contém o eixo do disco.
const direita = norm(cross(frente, [0, 1, 0]));
const cima = cross(direita, frente);
// A projeção da câmera no plano do disco: o que estiver deste lado é o lado de CÁ.
const eixoDaCamera = norm([cam[0], 0, cam[2]]);

/** Varre a coluna central da tela e devolve, por deslocamento vertical, o que cada imagem viu. */
function varredura(passos = 2400, alcance = 0.32) {
  const linhas = [];
  for (let i = 0; i <= passos; i++) {
    const y = -alcance + (2 * alcance * i) / passos;
    const dir = norm(add(frente, mul(cima, y)));
    const { capturado, hits } = cruzamentos(sub(cam, [0, 0, 0]), dir, eixoDaCamera);
    linhas.push({ y, capturado, hits });
  }
  return linhas;
}

/**
 * A compressão de uma imagem: raios de disco por unidade de tela, medida como diferença finita
 * entre linhas VIZINHAS que enxergaram a mesma ordem de imagem dentro do disco.
 */
function compressao(linhas, perto) {
  const doLado = (linha) => {
    const h = linha.hits.filter((x) => x.perto === perto && x.r >= INNER && x.r <= OUTER);
    return h.length ? h[0].r : undefined;
  };
  const taxas = [];
  for (let i = 1; i < linhas.length; i++) {
    const a = doLado(linhas[i - 1]);
    const c = doLado(linhas[i]);
    if (a === undefined || c === undefined) continue;
    const dy = linhas[i].y - linhas[i - 1].y;
    taxas.push(Math.abs((c - a) / dy));
  }
  if (!taxas.length) return null;
  taxas.sort((x, z) => x - z);
  return {
    n: taxas.length,
    mediana: taxas[taxas.length >> 1],
    max: taxas[taxas.length - 1],
    // Extensão na tela que a imagem ocupa: o disco inteiro dividido pela taxa mediana.
    extensao: (OUTER - INNER) / taxas[taxas.length >> 1],
    // O AFUNILAMENTO. Uso o percentil 97 e não o máximo: perto do parâmetro de impacto crítico a
    // derivada diverge de verdade, e um único pixel de 31 416 diria "afunila" para qualquer coisa.
    afunila: taxas[Math.min(taxas.length - 1, Math.floor(taxas.length * 0.97))] / taxas[taxas.length >> 1],
  };
}

const linhas = varredura();
console.log(`inclinação ${inclinacaoGraus}°  ·  disco ${(INNER / RS).toFixed(2)}–${(OUTER / RS).toFixed(2)} Rs  ·  sombra ${SOMBRA.toFixed(2)} Rs`);

const lados = [];
for (const [nome, perto] of [['frente', true], ['trás  ', false]]) {
  const c = compressao(linhas, perto);
  if (!c) {
    console.log(`  lado ${nome}: NENHUMA amostra`);
    lados.push(null);
    continue;
  }
  lados.push(c);
  console.log(
    `  lado ${nome}: ${String(c.n).padStart(4)} amostras · ` +
      `dr/dy mediana ${c.mediana.toFixed(1)} · ` +
      `afunila ${c.afunila.toFixed(2)}x · ocupa ${c.extensao.toFixed(4)} de tela`
  );
}

if (!lados[0] || !lados[1]) {
  console.log('\n· um dos lados não cruza a coluna central nesta inclinação — sem comparação aqui');
  process.exit(0);
}

const [frenteC, trasC] = lados;
console.log(
  `\nafunilamento — trás ${trasC.afunila.toFixed(2)}x  ·  frente ${frenteC.afunila.toFixed(2)}x`
);
if (trasC.afunila < 2) {
  console.log('✗ o arco de trás não afunila: a lente não está comprimindo o lado distante (#7)');
  process.exit(1);
}
if (frenteC.afunila > 1.5) {
  console.log('✗ a imagem DIRETA também afunila — isso é artefato de amostragem, não lente');
  process.exit(1);
}
console.log('✓ o lado distante afunila e a imagem direta não — a compressão do #7 é da física');
