#!/usr/bin/env node
/**
 * CENSO DA ONTOLOGIA — as fases B e C do `docs/replanejamento-celeste.md` §12.
 *
 * Ele responde a métrica que decide se a reforma valeu:
 *
 *     Quantas entidades continuam recebendo uma classe cosmologicamente grande sem merecê-la?
 *
 * O número de partida é brutal e está medido: **hoje TODO agregado é galáxia — 228 de 228.**
 *
 *     node scripts/censo-ontologia.mjs                    # http://127.0.0.1:8787
 *     node scripts/censo-ontologia.mjs .cache/graph.json  # offline
 *
 * ⚠️ Ele **importa** `src/space/entity-physics.js` em vez de transcrevê-lo. O módulo é puro (não
 * importa `three`), e é essa pureza que permite medida e céu usarem a MESMA derivação — duas cópias
 * divergiriam na primeira edição, que é o modo de falha que este repo mais registra.
 *
 * ⚠️ E ele mede o ÍNDICE, nunca o disco. A diferença já produziu uma recomendação errada.
 */
import fs from 'node:fs';
import {
  entityPhysics, classificar, fenomenos, degrau, ESCADA, AUSENTES, FAMILIA,
} from '../src/space/entity-physics.js';

const BASE = 'http://127.0.0.1:8787';
const arg = process.argv[2];
const graph = arg
  ? JSON.parse(fs.readFileSync(arg, 'utf8'))
  : await (await fetch(`${BASE}/api/graph`)).json();

const nodes = graph.nodes || [];
const files = nodes.filter((n) => n.type === 'file');
const aggs = nodes.filter((n) => n.type !== 'file');
const byId = new Map(nodes.map((n) => [n.id, n]));

// A aresta é `[filho, pai]` — conferido no payload, e a direção importa.
const filhos = new Map();
for (const [filho, pai] of graph.edges || []) {
  if (!filhos.has(pai)) filhos.set(pai, []);
  filhos.get(pai).push(byId.get(filho));
}

const bold = (t) => `\x1b[1m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const pc = (n, t) => `${((n / Math.max(t, 1)) * 100).toFixed(1)}%`;
const titulo = (t) => console.log(`\n${bold(t)}`);

// ──────────────────────────────────────────────── 1. sistemas e dominância
titulo('1. SISTEMAS — quem é a estrela de cada um');

/**
 * O contexto que a física precisa: em cada sistema (pasta), qual arquivo é o mais massivo.
 * Empate resolve pelo id, para o censo ser reprodutível — dois arquivos de mesma massa não podem
 * trocar de papel entre execuções.
 */
const contexto = new Map();
let semDominante = 0;
for (const agg of aggs) {
  const meus = (filhos.get(agg.id) || []).filter((c) => c?.type === 'file');
  if (!meus.length) { semDominante++; continue; }
  const dono = meus.reduce((a, b) => {
    const ma = a.chunks || 0, mb = b.chunks || 0;
    if (mb > ma) return b;
    if (mb < ma) return a;
    return a.id < b.id ? a : b;
  });
  for (const f of meus) contexto.set(f.id, { dominante: f.id === dono.id, sistema: agg.id });
}

const orfaos = files.filter((f) => !contexto.has(f.id));
console.log(`  agregados ${aggs.length} · arquivos ${files.length}`);
console.log(`  sistemas com pelo menos um arquivo: ${aggs.length - semDominante}`);
console.log(`  ${yellow(`ÓRFÃOS (sem sistema): ${orfaos.length} (${pc(orfaos.length, files.length)})`)}`);

// ──────────────────────────────────────────────── 2. a física
titulo('2. FÍSICA — as dimensões, e as que não têm fato');

const fisicas = files.map((f) => ({ node: f, p: entityPhysics(f, contexto.get(f.id) || {}) }));
const num = (sel) => fisicas.map(({ p }) => sel(p)).filter((v) => typeof v === 'number');
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * a.length)] ?? 0;
const linha = (nome, vals, casas = 2) => {
  console.log(`  ${nome.padEnd(12)} min ${q(vals, 0).toFixed(casas).padStart(7)} · MED ${q(vals, 0.5).toFixed(casas).padStart(7)} · P90 ${q(vals, 0.9).toFixed(casas).padStart(7)} · máx ${q(vals, 0.999).toFixed(casas).padStart(7)}`);
};
linha('mass', num((p) => p.mass), 0);
linha('activity', num((p) => p.activity));
linha('age', num((p) => p.age));
linha('volatility', num((p) => p.volatility));

console.log(`  ${red('sem fato (null, nunca zero):')}`);
for (const [k, v] of Object.entries(AUSENTES)) console.log(`    ${k.padEnd(13)} ${v}`);

// ──────────────────────────────────────────────── 3. a classificação
titulo('3. CLASSIFICAÇÃO — as três famílias');

const conta = {};
const porTipo = {};
for (const { node, p } of fisicas) {
  const c = classificar(p, node);
  conta[c.familia] = (conta[c.familia] || 0) + 1;
  porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1;
}
// Agregados são estrutura por definição, e entram na conta da família.
conta[FAMILIA.ESTRUTURA] = (conta[FAMILIA.ESTRUTURA] || 0) + aggs.length;

console.log(`  ${FAMILIA.ESTRUTURA.padEnd(10)} ${String(conta[FAMILIA.ESTRUTURA] || 0).padStart(5)}`);
console.log(`  ${FAMILIA.CORPO.padEnd(10)} ${String(conta[FAMILIA.CORPO] || 0).padStart(5)}`);
console.log('  corpos por degrau:');
for (const t of ['estrela', 'planeta', 'lua', 'asteroide']) {
  const n = porTipo[t] || 0;
  const marca = n === 0 ? red('  ← VAZIO') : '';
  console.log(`    ${t.padEnd(10)} ${String(n).padStart(5)}  ${pc(n, files.length).padStart(6)}${marca}`);
}
const portes = {};
for (const { node, p } of fisicas) {
  const c = classificar(p, node);
  if (c.porte) portes[c.porte] = (portes[c.porte] || 0) + 1;
}
console.log(`  porte das estrelas: ${Object.entries(portes).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  limiares (chunks): lua ≥ ${ESCADA.LUA} · planeta ≥ ${ESCADA.PLANETA} · estrela ≥ ${ESCADA.ESTRELA}`);

// ──────────────────────────────────────────────── 4. fenômenos
titulo('4. FENÔMENOS — o que ACONTECE, sem trocar a classe');

const fen = {};
let comAlgum = 0;
for (const { node, p } of fisicas) {
  const lista = fenomenos(p, node);
  if (lista.length) comAlgum++;
  for (const f of lista) fen[f.tipo] = (fen[f.tipo] || 0) + 1;
}
for (const [k, v] of Object.entries(fen).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${String(v).padStart(5)}  ${pc(v, files.length).padStart(6)}`);
}
console.log(`  corpos com ao menos um: ${comAlgum} (${pc(comAlgum, files.length)})`);

// ──────────────────────────────────────────────── 5. a métrica da Fase C
titulo('5. A MÉTRICA — quantos ainda recebem classe grande sem merecer');

const ANTES = aggs.length;
/*
 * "Grande" = o que o céu de hoje chama de GALÁXIA. A conta antiga é trivial e devastadora: todo
 * agregado é galáxia. A nova só chama de galáxia quem tem massa de galáxia — e aqui isso é
 * contenção, não tamanho de arquivo: repo é galáxia, diretório é sistema.
 */
const galaxiasNovas = aggs.filter((a) => a.type === 'repo').length;
const sistemas = aggs.filter((a) => a.type === 'dir').length;

console.log(`  ANTES   ${'█'.repeat(40)}  ${ANTES} galáxias  (100% dos agregados)`);
const bar = (n) => '█'.repeat(Math.max(1, Math.round((n / ANTES) * 40)));
console.log(`  DEPOIS  ${bar(galaxiasNovas)}  ${galaxiasNovas} galáxias (repo)`);
console.log(`          ${bar(sistemas)}  ${sistemas} sistemas (diretório)`);
const reducao = ((ANTES - galaxiasNovas) / ANTES) * 100;
console.log(`\n  ${bold(`classe grande indevida: ${ANTES} → ${galaxiasNovas}  (−${reducao.toFixed(1)}%)`)}`);

// ──────────────────────────────────────────────── 6. o que ainda não fecha
titulo('6. O QUE AINDA NÃO FECHA');
const problemas = [];
if (orfaos.length) {
  problemas.push(`${orfaos.length} órfãos sem sistema — planeta sem estrela (replanejamento §3.1)`);
}
for (const t of ['estrela', 'planeta', 'lua', 'asteroide']) {
  if (!porTipo[t]) problemas.push(`degrau "${t}" com população ZERO — limiar precisa ser refeito`);
}
const estrelas = porTipo.estrela || 0;
if (Math.abs(estrelas - sistemas) > sistemas * 0.15) {
  problemas.push(`${estrelas} estrelas para ${sistemas} sistemas — a âncora do limiar não bate`);
}
if (!problemas.length) console.log('  (nada — mas as quatro dimensões sem fato continuam sem fato)');
for (const p of problemas) console.log(`  ${yellow('⚠')} ${p}`);

console.log(`\n  ⚠️ ${AUSENTES.centrality.split('.')[0]} — a Fase A não fecha sem decisão sobre isto.`);
