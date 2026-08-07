// GUARDA DE REGRESSÃO do buraco negro — réplica em JS do `tracarGeodesica`, para medir o CAMPO
// DE DEFLEXÃO
// |dirFinal - dir| em função do parâmetro de impacto. Só diagnóstico — a fonte é o GLSL.
//
// ⚠️ Ela tem de acompanhar o shader. Duas coisas não podem mudar de resultado (ver o handoff,
// "O QUE NÃO PODE REGREDIR"): a deflexão em b = 0,4R fica em ~222px (se cair para ~83px, o `uRs`
// sumiu da aceleração) e o perfil é MONÓTONO — se aparecer um salto entre 1,00R e 1,01R, a cauda
// sumiu e a "segunda lente" voltou.
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// coreScale 2.05 (padrão do tuning), HORIZON_RADIUS 3.0, DISK_OUTER = 7·HORIZON
const escala = 2.05;
const rs = ((3.0 * escala) / Math.sqrt(27)) * 2;
const outer = 3.0 * 7.0 * escala;
const R = outer * 1.25;
const passos = 64;
const stepScale = Math.log(Math.max(R / rs, Math.E)) / (passos * 0.62);

function tracar(origem, direcao) {
  let p = origem.slice();
  const b = dot(p, direcao);
  const c = dot(p, p) - R * R;
  const delta = b * b - c;
  const entrada = -b - Math.sqrt(Math.max(delta, 0));

  if (delta <= 0 || (entrada < 0 && c > 0)) {
    const ateOMaisPerto = -dot(p, direcao);
    if (ateOMaisPerto > 0) {
      const perp = add(p, mul(direcao, ateOMaisPerto));
      const impacto = len(perp);
      if (impacto > 1e-4) {
        return { dir: norm(sub(direcao, mul(perp, (2 * rs) / (impacto * impacto)))), ramo: 'fraco', impacto };
      }
    }
    return { dir: direcao, ramo: 'fraco', impacto: Infinity };
  }

  p = add(p, mul(direcao, Math.max(entrada, 0)));
  let v = direcao.slice();
  const h2 = dot(cross(p, v), cross(p, v));
  const impacto = Math.sqrt(h2);
  let capturado = h2 < Math.pow(2.598076 * rs, 2);
  for (let i = 0; i < passos; i++) {
    const r2 = dot(p, p);
    const r = Math.sqrt(r2);
    if (r < rs) break;
    if (r > R && i > 0) break;
    const passo = Math.min(r * stepScale, R * 0.08);
    v = add(v, mul(p, ((-1.5 * h2 * rs) / (r2 * r2 * r)) * passo));
    p = add(p, mul(v, passo));
  }
  // A CAUDA: a deflexão acumulada FORA da esfera, que a marcha não vê.
  let vf = norm(v);
  const x0 = Math.sqrt(Math.max(R * R - h2, 0));
  const fracaoDentro = Math.min((x0 * (3 * h2 + 2 * x0 * x0)) / (2 * R * R * R), 1);
  const alfaCauda = ((2 * rs) / impacto) * (1 - fracaoDentro);
  const perpSaida = add(p, mul(vf, -dot(p, vf)));
  const impSaida = len(perpSaida);
  if (impSaida > 1e-4) vf = norm(sub(vf, mul(perpSaida, alfaCauda / impSaida)));
  return { dir: vf, ramo: 'marcha', impacto, capturado };
}

const D = 150;                       // distância da câmera ao núcleo
const k = 1416 / (2 * Math.tan((80 * Math.PI) / 360));   // px de framebuffer por radiano
const origem = [0, 0, D];

console.log(`rs=${rs.toFixed(3)}  outer=${outer.toFixed(1)}  R=${R.toFixed(1)} (${(R / rs).toFixed(1)} rs)  passo=${stepScale.toFixed(4)}`);
console.log('  b(mundo)   b/R    ramo      deflexão(rad)   na tela(px)   raio na tela(px)');

const amostras = [];
for (let i = 1; i <= 260; i++) {
  const bAlvo = (i / 100) * R;                    // varre 0,01R … 2,6R
  const theta = Math.asin(Math.min(bAlvo / D, 0.999));
  const dir = norm([Math.sin(theta), 0, -Math.cos(theta)]);
  const t = tracar(origem, dir);
  const desvio = Math.acos(Math.max(-1, Math.min(1, dot(dir, t.dir))));
  amostras.push({ b: bAlvo, razao: bAlvo / R, ramo: t.ramo, desvio, px: desvio * k, raioTela: (k * bAlvo) / D, capturado: t.capturado });
}

const perto = amostras.filter((a) => a.razao > 0.88 && a.razao < 1.14);
for (const a of perto) {
  console.log(
    `  ${a.b.toFixed(2).padStart(7)}  ${a.razao.toFixed(3)}  ${a.ramo.padEnd(8)}  ${a.desvio.toFixed(5).padStart(10)}  ${a.px.toFixed(1).padStart(10)}  ${a.raioTela.toFixed(0).padStart(12)}`
  );
}

const dentro = amostras.filter((a) => a.ramo === 'marcha').at(-1);
const fora = amostras.find((a) => a.ramo === 'fraco');
console.log(`\nDEGRAU NA FRONTEIRA: ${dentro.px.toFixed(1)}px (último de dentro) → ${fora.px.toFixed(1)}px (primeiro de fora)`);
console.log(`salto = ${(fora.px - dentro.px).toFixed(1)}px, na altura de ${fora.raioTela.toFixed(0)}px do centro na tela`);
console.log('\nperfil largo (a cada 0,2R):');
for (const a of amostras.filter((_, i) => (i + 1) % 20 === 0)) {
  console.log(`  b/R=${a.razao.toFixed(2)}  ${a.ramo.padEnd(8)}  ${a.px.toFixed(1).padStart(7)}px de deflexão   @ ${a.raioTela.toFixed(0)}px do centro`);
}
