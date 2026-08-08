#!/usr/bin/env node
/**
 * CONECTIVIDADE — a última dimensão do `EntityPhysics` sem fato, e a única que precisou ser
 * REDEFINIDA antes de existir.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/conectividade.mjs --medir  # compara as candidatas
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/conectividade.mjs          # mede e escreve
 *
 * ## O problema que a medida existe para pegar
 *
 * O §4 do `integracao-neo4j.md` define `connectivity` como *"grau ponderado das laterais"* e
 * `centrality` como *"PageRank ou grau sobre as laterais"* — **o mesmo substrato, duas vezes.** E
 * como o `SIMILAR_TO` tem `k` fixo, todo corpo já nasce com 8 arestas de saída: o grau bruto é uma
 * constante somada ao grau de ENTRADA, que é exatamente o que a centralidade normaliza.
 *
 * Duas dimensões que são o mesmo número com dois nomes é o defeito que esta base já refutou com
 * medida ("o score composto é tamanho com ofuscação"). Então este script **não assume** a definição
 * da spec: ele mede três candidatas contra a centralidade já materializada e deixa o Spearman
 * decidir qual delas acrescenta informação.
 *
 * | candidata | o que afirma | independe do grau? |
 * |---|---|---|
 * | `grau` | quantos vínculos laterais o corpo tem, saturado | **não** — é o substrato da centralidade |
 * | `agrupamento` | meus vizinhos se conhecem? (coeficiente de agrupamento local) | **sim** — é topologia, não contagem |
 * | `alcance` | que fração dos meus vínculos SAI do meu sistema | **sim** — é destino, não contagem |
 *
 * ⚠️ **`agrupamento` e `alcance` respondem perguntas diferentes com a mesma matéria-prima**, e as
 * duas são o que a posição NÃO comunica: a cena já diz por contenção quem mora junto; nenhuma delas
 * diz se o vizinho semântico de um corpo está dentro ou fora da pasta dele.
 */
import fs from 'node:fs';

const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const SO_MEDIR = process.argv.includes('--medir');
const SAIDA = '.cache/conectividade.json';
const INFLUENCIA = '.cache/influencia.json';

if (!USER || !PASS) {
  console.error('NEO4J_USER e NEO4J_PASSWORD são obrigatórios — o script não adivinha credencial.');
  process.exit(1);
}
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
async function cypher(statement) {
  const r = await fetch(`${BASE}/db/neo4j/query/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ statement }),
  });
  if (!r.ok) throw new Error(`neo4j ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ─────────────────────────────────────────────────────── 1. substrato
const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json());
if (!graph.corpus) {
  console.error('o /api/graph não publicou `corpus` — servidor velho?');
  process.exit(1);
}
/** `source` → o sistema dele (a pasta, ou o repo para quem pendura na raiz). Ver `graph.py`. */
const sistemaDe = new Map();
for (const n of graph.nodes) {
  if (n.type === 'file') sistemaDe.set(n.source, n.dir || n.repo || '');
}
console.log(`\x1b[1mcorpus\x1b[0m  ${graph.corpus.collection} · ${sistemaDe.size} corpos no céu`);

const dados = await cypher(
  `MATCH (a:Astro)-[r:SIMILAR_TO|CO_EDITED|REFERENCES|IMPORTS]-(b:Astro)
   RETURN a.source AS de, b.source AS para, type(r) AS tipo`
);
/** `source` → Set de vizinhos (não-direcionado, sem repetir por tipo). */
const vizinhos = new Map();
const porTipo = new Map();
for (const [de, para, tipo] of dados.data.values) {
  if (!sistemaDe.has(de) || !sistemaDe.has(para)) continue;
  if (!vizinhos.has(de)) vizinhos.set(de, new Set());
  vizinhos.get(de).add(para);
  if (!porTipo.has(de)) porTipo.set(de, new Map());
  const t = porTipo.get(de);
  t.set(tipo, (t.get(tipo) || 0) + 1);
}
const fontes = [...sistemaDe.keys()].filter((s) => vizinhos.has(s));
console.log(`\x1b[1msubstrato\x1b[0m  ${fontes.length} corpos com vínculo lateral`);

// ─────────────────────────────────────────────────────── 2. as três candidatas
/**
 * Coeficiente de agrupamento local: das duplas de vizinhos meus, quantas estão ligadas entre si.
 *
 * É a medida clássica de Watts–Strogatz, e o que a torna interessante aqui é ser **normalizada pelo
 * próprio grau**: um corpo com 100 vizinhos e um com 8 podem ter o mesmo valor. Por construção ela
 * não pode ser "grau com outro nome".
 */
function agrupamento(s) {
  const vs = [...(vizinhos.get(s) || [])];
  if (vs.length < 2) return 0;
  let ligados = 0;
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      if (vizinhos.get(vs[i])?.has(vs[j])) ligados++;
    }
  }
  return ligados / ((vs.length * (vs.length - 1)) / 2);
}

/** Fração dos vizinhos que mora FORA do sistema deste corpo. Destino, não contagem. */
function alcance(s) {
  const vs = [...(vizinhos.get(s) || [])];
  if (!vs.length) return 0;
  const meu = sistemaDe.get(s);
  return vs.filter((v) => sistemaDe.get(v) !== meu).length / vs.length;
}

const grauBruto = new Map(fontes.map((s) => [s, vizinhos.get(s).size]));

// ─────────────────────────────────────────────────────── 3. elas dizem o mesmo?
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

let influencia = null;
try {
  influencia = JSON.parse(fs.readFileSync(INFLUENCIA, 'utf-8')).influencia;
} catch {
  console.error(`\x1b[33m⚠ sem ${INFLUENCIA} — sem centralidade não há com o que comparar.\x1b[0m`);
  console.error('  rode scripts/centralidade.mjs antes: a pergunta deste script é se a nova dimensão REPETE a velha.');
  process.exit(1);
}
/** Só os corpos que as DUAS mediram — comparar com ausente inventaria concordância. */
const comuns = fontes.filter((s) => typeof influencia[s] === 'number');
const vCent = comuns.map((s) => influencia[s]);
const candidatas = {
  grau: comuns.map((s) => grauBruto.get(s)),
  agrupamento: comuns.map((s) => agrupamento(s)),
  alcance: comuns.map((s) => alcance(s)),
};

const q = (v, p) => [...v].sort((a, b) => a - b)[Math.floor(p * v.length)] ?? 0;
console.log(`\n\x1b[1mAS TRÊS CANDIDATAS, contra a centralidade já materializada (${comuns.length} corpos)\x1b[0m`);
console.log('  Spearman alto = a dimensão nova é a velha com outro nome.\n');
const rho = {};
for (const [nome, v] of Object.entries(candidatas)) {
  rho[nome] = spearman(v, vCent);
  const marca = Math.abs(rho[nome]) >= 0.7 ? '\x1b[31m' : '\x1b[32m';
  console.log(
    `  \x1b[1m${nome.padEnd(12)}\x1b[0m ρ(centralidade) = ${marca}${rho[nome].toFixed(3)}\x1b[0m` +
    `  · MED ${q(v, 0.5).toFixed(3)} · P90 ${q(v, 0.9).toFixed(3)} · máx ${Math.max(...v).toFixed(3)}` +
    ` · zeros ${v.filter((x) => x === 0).length}`
  );
}
console.log(`\n  \x1b[2mρ ≥ 0,7 (vermelho) = repete a centralidade; ρ baixo (verde) = acrescenta informação.\x1b[0m`);

// E elas discordam ENTRE SI? Duas candidatas idênticas não são duas dimensões.
console.log(`\n  agrupamento × alcance: ρ = ${spearman(candidatas.agrupamento, candidatas.alcance).toFixed(3)}`);
console.log(`  agrupamento × grau:    ρ = ${spearman(candidatas.agrupamento, candidatas.grau).toFixed(3)}`);
console.log(`  alcance × grau:        ρ = ${spearman(candidatas.alcance, candidatas.grau).toFixed(3)}`);

/*
 * ⚠️ **O teste que o `alcance` pode reprovar, e que a centralidade não faz.**
 *
 * Ele é uma FRAÇÃO sobre o sistema do corpo — então um arquivo sozinho numa pasta tem alcance 1,0
 * por construção, e a dimensão viraria "tamanho do sistema com ofuscação". É a mesma família do
 * score composto que esta base refutou, e ela não aparece na comparação com a centralidade.
 */
const tamanhoDoSistema = new Map();
for (const [, sis] of sistemaDe) tamanhoDoSistema.set(sis, (tamanhoDoSistema.get(sis) || 0) + 1);
const vTam = comuns.map((s) => tamanhoDoSistema.get(sistemaDe.get(s)) || 1);
const rhoTam = spearman(candidatas.alcance, vTam);
console.log(`\n\x1b[1m  alcance × TAMANHO DO SISTEMA: ρ = ${Math.abs(rhoTam) >= 0.7 ? '\x1b[31m' : '\x1b[32m'}${rhoTam.toFixed(3)}\x1b[0m`);
console.log(`  \x1b[2m(um arquivo sozinho na pasta tem alcance 1,0 por construção — se ρ for alto, a dimensão é tamanho de pasta)\x1b[0m`);
const emUm = candidatas.alcance.filter((x) => x >= 0.999).length;
const sozinhos = comuns.filter((s) => (tamanhoDoSistema.get(sistemaDe.get(s)) || 1) === 1).length;
console.log(`  alcance = 1,0 em ${emUm} corpos (${((emUm / comuns.length) * 100).toFixed(1)}%), dos quais ${sozinhos} são filho único do sistema`);
const dist = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((p) => q(candidatas.alcance, p).toFixed(2));
console.log(`  distribuição do alcance — min ${dist[0]} · P10 ${dist[1]} · P25 ${dist[2]} · MED ${dist[3]} · P75 ${dist[4]} · P90 ${dist[5]}`);

/*
 * E contra as dimensões que o céu JÁ TEM. Uma dimensão nova que repete a massa não é nova — e a
 * massa é a que mais contamina, porque ela decide escala e escala contamina tudo o que se olha.
 */
const massaDe = new Map(graph.nodes.filter((n) => n.type === 'file').map((n) => [n.source, n.chunks || 0]));
const churnDe = new Map(graph.nodes.filter((n) => n.type === 'file').map((n) => [n.source, n.churn || 0]));
const vMassa = comuns.map((s) => massaDe.get(s) || 0);
const vChurn = comuns.map((s) => churnDe.get(s) || 0);
console.log('\n\x1b[1m  contra as dimensões que já existem\x1b[0m');
for (const [nome, v] of Object.entries(candidatas)) {
  console.log(`  ${nome.padEnd(12)} × massa ρ = ${spearman(v, vMassa).toFixed(3)} · × atividade ρ = ${spearman(v, vChurn).toFixed(3)}`);
}

if (SO_MEDIR) process.exit(0);

// ─────────────────────────────────────────────────────── 4. o snapshot
/*
 * A ESCOLHA está no `docs/integracao-neo4j.md` §4.1 e é derivada da medida acima, não do gosto:
 * fica a candidata que NÃO repete a centralidade. O snapshot publica o ρ junto, para quem ler o
 * número saber contra o que ele foi conferido — e para a escolha poder ser refeita se o corpus
 * mudar, que é a mesma regra das constantes calibradas do `CLAUDE.md`.
 */
const ESCOLHA = 'alcance';
const conectividade = {};
for (const s of fontes) conectividade[s] = Number(alcance(s).toFixed(4));

const valores = Object.values(conectividade);
const snapshot = {
  as_of: new Date().toISOString(),
  metrica: ESCOLHA,
  definicao: 'fração dos vínculos laterais cujo destino está FORA do sistema (pasta) do corpo',
  spearman_centralidade: Number(rho[ESCOLHA].toFixed(4)),
  // As candidatas recusadas ficam registradas com o motivo: sem isto, a próxima sessão remede as
  // três para descobrir o que esta já sabia.
  recusadas: {
    grau: `ρ ${rho.grau.toFixed(3)} com a centralidade — é o substrato dela, não uma dimensão nova`,
    agrupamento: `ρ ${rho.agrupamento.toFixed(3)}`,
  },
  corpos: fontes.length,
  cobertura: Number((fontes.length / sistemaDe.size).toFixed(4)),
  med: Number(q(valores, 0.5).toFixed(4)),
  p90: Number(q(valores, 0.9).toFixed(4)),
  conectividade,
};
fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(snapshot));
console.log(`\n\x1b[1mescrito\x1b[0m  ${SAIDA} · métrica "${ESCOLHA}" · ${fontes.length} corpos · MED ${snapshot.med}`);
