#!/usr/bin/env node
/**
 * CENTRALIDADE — o P3 de `docs/integracao-neo4j.md`. Influência, que vira BRILHO e nunca classe.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/centralidade.mjs
 *
 * ## Ela não é consultada no quadro — ela é MATERIALIZADA
 *
 * A lei nº 2 do documento: o renderer nunca fala com o Neo4j. Este script escreve
 * `.cache/influencia.json`, o servidor anexa aos nós ao montar a topologia, e o céu recebe o número
 * pronto. Neo4j cair entre duas materializações não muda nada na tela até a próxima — e a mudança,
 * quando vier, é um número de brilho, jamais uma reclassificação.
 *
 * ## Grau ou PageRank? A resposta é medida, não escolhida
 *
 * **Não há GDS neste Neo4j** (0 procedures `gds.*`), então PageRank não vem pronto — o que é bom,
 * porque o plano mandava não supor que seria ele. As duas são computadas aqui e COMPARADAS por
 * Spearman: se concordarem, vale a mais barata e explicável; se discordarem, PageRank acrescenta
 * informação e o custo se justifica.
 *
 * ⚠️ **O grau de ENTRADA é o sinal, não o total.** Com `k` fixo no `SIMILAR_TO`, todo nó tem a mesma
 * saída — contar o total mistura uma constante com o dado e dilui justamente o que discrimina.
 *
 * ## ⚠️ O viés que esta medida TEM, e que a primeira execução expôs
 *
 * O topo da influência traz `migration.sql` **duas vezes**, de diretórios diferentes. Não é acaso:
 * vizinhança semântica premia **quem se parece com muita gente**, e arquivo quase duplicado se
 * parece com todos os irmãos dele. O que a medida chama de central pode ser **genérico**.
 *
 * É o mesmo defeito de família do score composto que as medições já refutaram ("tamanho com
 * ofuscação"): um número que parece dizer importância e diz outra coisa. Fica registrado em vez de
 * consertado porque o conserto é uma decisão — penalizar aresta de score quase 1 (duplicata) muda o
 * que a dimensão significa, e isso precisa de medida própria antes de virar código.
 */
import fs from 'node:fs';

const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SAIDA = '.cache/influencia.json';
const AMORTECIMENTO = 0.85;
const ITERACOES = 40;

if (!USER || !PASS) {
  console.error('NEO4J_USER e NEO4J_PASSWORD são obrigatórios.');
  process.exit(1);
}
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const cypher = async (statement) => {
  const r = await fetch(`${BASE}/db/neo4j/query/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ statement }),
  });
  if (!r.ok) throw new Error(`neo4j ${r.status}`);
  return r.json();
};

// ─────────────────────────────────────────────────────── 1. as arestas
const dados = await cypher(
  'MATCH (a:Astro)-[r:SIMILAR_TO|CO_EDITED]->(b:Astro) RETURN a.source, b.source, type(r)'
);
const arestas = dados.data.values.map(([a, b, t]) => ({ a, b, t }));
const todos = await cypher('MATCH (a:Astro) RETURN a.source');
const fontes = todos.data.values.map((v) => v[0]);
console.log(`\x1b[1msubstrato\x1b[0m  ${fontes.length} corpos · ${arestas.length} arestas`);

// ─────────────────────────────────────────────────────── 2. grau de entrada
const entrada = new Map(fontes.map((s) => [s, 0]));
for (const e of arestas) entrada.set(e.b, (entrada.get(e.b) || 0) + 1);

// ─────────────────────────────────────────────────────── 3. PageRank à mão
const idx = new Map(fontes.map((s, i) => [s, i]));
const n = fontes.length;
const saidaDe = new Array(n).fill(0);
const chegam = Array.from({ length: n }, () => []);
for (const e of arestas) {
  const i = idx.get(e.a); const j = idx.get(e.b);
  if (i === undefined || j === undefined) continue;
  saidaDe[i]++;
  chegam[j].push(i);
}
let pr = new Array(n).fill(1 / n);
for (let it = 0; it < ITERACOES; it++) {
  const novo = new Array(n).fill((1 - AMORTECIMENTO) / n);
  // Nó sem saída redistribui para TODOS, senão a massa dele evapora e o vetor deixa de somar 1.
  let vazamento = 0;
  for (let i = 0; i < n; i++) if (saidaDe[i] === 0) vazamento += pr[i];
  const porTodos = (AMORTECIMENTO * vazamento) / n;
  for (let j = 0; j < n; j++) {
    let soma = 0;
    for (const i of chegam[j]) soma += pr[i] / saidaDe[i];
    novo[j] += AMORTECIMENTO * soma + porTodos;
  }
  pr = novo;
}

// ─────────────────────────────────────────────────────── 4. eles concordam?
function spearman(a, b) {
  const posto = (v) => {
    const ord = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    ord.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const ra = posto(a); const rb = posto(b);
  const m = a.length;
  const md = (m * m - 1) / 12;
  const mA = (m - 1) / 2;
  let cov = 0;
  for (let i = 0; i < m; i++) cov += (ra[i] - mA) * (rb[i] - mA);
  return cov / m / md;
}
const vGrau = fontes.map((s) => entrada.get(s) || 0);
const vPR = fontes.map((s) => pr[idx.get(s)]);
const rho = spearman(vGrau, vPR);

const q = (v, p) => [...v].sort((a, b) => a - b)[Math.floor(p * v.length)];
console.log(`\n\x1b[1mGRAU DE ENTRADA\x1b[0m  min ${q(vGrau, 0)} · MED ${q(vGrau, 0.5)} · P90 ${q(vGrau, 0.9)} · máx ${Math.max(...vGrau)}`);
console.log(`\x1b[1mPAGERANK\x1b[0m        MED ${q(vPR, 0.5).toExponential(2)} · P90 ${q(vPR, 0.9).toExponential(2)} · máx ${Math.max(...vPR).toExponential(2)}`);
console.log(`\n  Spearman(grau, pagerank) = \x1b[1m${rho.toFixed(3)}\x1b[0m`);
const escolha = rho >= 0.9 ? 'grau' : 'pagerank';
console.log(rho >= 0.9
  ? `  → concordam. Vale o GRAU: mais barato e explicável ("quantos me têm como vizinho").`
  : `  → DISCORDAM. PageRank acrescenta informação que o grau não tem, e o custo se justifica.`);

// ─────────────────────────────────────────────────────── 5. o snapshot
/*
 * Normalizado em [0,1] pelo POSTO, não pelo valor.
 *
 * O valor bruto do PageRank é de cauda longa: normalizar por `x/max` põe 90% dos corpos abaixo de
 * 0,1 e o brilho vira binário — um aceso e o resto apagado. O posto distribui a atenção pela ordem,
 * que é o que a leitura usa.
 *
 * ⚠️ E isto é INFLUÊNCIA, que governa brilho. Nunca escala, nunca classe. Ver a lei nº 1.
 */
const bruto = escolha === 'grau' ? vGrau : vPR;
const ordenado = fontes.map((s, i) => [s, bruto[i]]).sort((a, b) => a[1] - b[1]);
const influencia = {};
ordenado.forEach(([s], i) => { influencia[s] = Number((i / (ordenado.length - 1)).toFixed(4)); });

const snapshot = {
  as_of: new Date().toISOString(),
  metrica: escolha,
  spearman_grau_pagerank: Number(rho.toFixed(4)),
  corpos: fontes.length,
  arestas: arestas.length,
  influencia,
};
fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(snapshot));
console.log(`\n\x1b[1mescrito\x1b[0m  ${SAIDA} · ${fontes.length} corpos · métrica "${escolha}" · normalizada por POSTO`);

const topo = ordenado.slice(-5).reverse().map(([s]) => s.split('/').slice(-2).join('/'));
console.log(`  mais influentes: ${topo.join(' · ')}`);
