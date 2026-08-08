#!/usr/bin/env node
/**
 * USO — o P5 de `docs/integracao-neo4j.md`. Influência por USO, e não por semelhança.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/uso.mjs           # mede, escreve e materializa
 *     node scripts/uso.mjs --medir                                 # só mede (não precisa de Neo4j)
 *     node scripts/uso.mjs --semear 300                            # diário SINTÉTICO p/ a bancada
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/uso.mjs --diario .cache/journal-semeado
 *
 * O que ele materializa:
 *
 *     (:Agent {id})-[:RAN]->(:Run {run_id})-[:TOUCHED {n}]->(:Astro {source})
 *
 * e depois o snapshot `.cache/uso.json`, que é o que o servidor lê. O renderer nunca fala com o
 * banco — lei nº 2.
 *
 * ## ⚠️ Ele foi escrito com a população INSUFICIENTE, de propósito
 *
 * A medida de 2026-08-08 é conhecida e está na spec (§3.2.3): 11 execuções, 70 arestas, 3,12% do
 * céu, **grau máximo 2**. Isso não sustenta influência classificatória e ninguém aqui finge que
 * sustenta. A decisão de construir assim mesmo é do usuário e tem um motivo que a medida não
 * alcança: **o encaixe custa menos agora do que depois de milhares de runs**, e o diário é um
 * ledger durável — a evidência cresce sozinha dentro do contrato que já estiver de pé.
 *
 * O que separa isto de autoengano é a distinção que o código carrega em vez de prometer:
 *
 * | pergunta | onde ela é respondida |
 * |---|---|
 * | a dimensão EXISTE? | `usage` no `EntityPhysics`, `number \| null` |
 * | ela tem PODER estatístico? | `evidenciaDeUso()`, e o snapshot publica o veredito |
 * | ela pode decidir CLASSE? | **nunca** — `scripts/lei-neo4j.mjs` prova por perturbação |
 *
 * ## ⚠️ `Agent` só existe quando há FATO, e o fato passou a ser gravado hoje
 *
 * O `origin` do diário é CANAL (`console`, `files`, `github`), não identidade — materializar
 * `(:Agent {id:"console"})` batizaria uma porta de entrada de entidade. A identidade real é o
 * `brain` que rodou, e ela existia no runtime (`recorder.run.model`) sendo descartada. Desde
 * 2026-08-08 o `journal.begin` a grava.
 *
 * Execuções anteriores a essa data não têm a chave e **não ganham `Agent`** — elas viram `Run`
 * órfão, que é a verdade: rodaram num tempo em que ninguém registrou quem rodava.
 */
import fs from 'node:fs';
import path from 'node:path';
import { USO_CHEIO, EVIDENCIA_USO_MINIMA, evidenciaDeUso } from '../src/space/entity-physics.js';

const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';

const SAIDA = '.cache/uso.json';
const DIARIO_REAL = '.cache/journal';
const DIARIO_SEMEADO = '.cache/journal-semeado';

/** Rótulos e grupo — têm de bater com `server/graphdb.py`, que é quem os publica no health. */
const ROTULO = 'Astro';
const AGENTE = 'Agent';
const EXECUCAO = 'Run';
const GRUPO = 'spatia';

const argv = process.argv.slice(2);
const flag = (nome) => {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : null;
};
const SO_MEDIR = argv.includes('--medir');
const SEMEAR = argv.includes('--semear') ? Number(flag('--semear') || 300) : 0;
const DIARIO = flag('--diario') || (SEMEAR ? DIARIO_SEMEADO : DIARIO_REAL);

// ═══════════════════════════════════════════════════════════════ leitura do diário

/**
 * As EXECUÇÕES de um diário. `boot`/`shutdown`/`denial` carregam `kind` e não são execução —
 * no diário real elas são 103 de 114, e contá-las infla a base de qualquer razão que se calcule.
 */
function execucoes(dir) {
  if (!fs.existsSync(dir)) return [];
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const saida = [];
  for (const f of arquivos) {
    for (const linha of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!linha.trim()) continue;
      try {
        const r = JSON.parse(linha);
        if (!r.kind) saida.push(r);
      } catch {
        // Linha truncada por queda no meio de um write. Some da contagem, como em `journal.read`.
      }
    }
  }
  return saida;
}

// ═══════════════════════════════════════════════════════════════ semeadura (bancada)

/**
 * Diário SINTÉTICO, para exercitar a dimensão antes de o uso real existir.
 *
 * ⚠️ **Nunca escreve em `.cache/journal/`, e a recusa é dura.** O diário real é um ledger
 * encadeado por hash cuja função é ser auditável (`journal.verify()`); injetar execução forjada
 * nele não é semear dado, é falsificar registro — e quebraria a própria cadeia que prova que
 * ninguém editou o meio. O sintético mora em diretório próprio e o snapshot sai carimbado com
 * `origem: "semeado"`, para nenhum consumidor confundir capacidade com comportamento.
 *
 * É a mesma doutrina do `cobertura.md`: **fixture = CAPACIDADE, corpus real = COMPORTAMENTO.**
 */
function semear(n, fontes) {
  if (path.resolve(DIARIO) === path.resolve(DIARIO_REAL)) {
    console.error('\x1b[31mRECUSADO\x1b[0m  o diário real é um ledger encadeado — semear nele é forjar registro.');
    process.exit(1);
  }
  fs.mkdirSync(DIARIO, { recursive: true });
  /*
   * Distribuição em lei de potência, e não uniforme: uso real é concentrado (poucos arquivos
   * abertos muitas vezes, cauda longa aberta uma). Uniforme daria grau parecido para todo mundo e
   * a dimensão pareceria funcionar por ter variância nenhuma para separar.
   */
  const sorteia = () => fontes[Math.floor(Math.pow(Math.random(), 2.2) * fontes.length)];
  const linhas = [];
  for (let i = 0; i < n; i++) {
    const quantos = 3 + Math.floor(Math.random() * 5);
    const tocados = [...new Set(Array.from({ length: quantos }, sorteia))];
    linhas.push(JSON.stringify({
      id: `s-${String(i + 1).padStart(4, '0')}`,
      started: new Date(Date.now() - (n - i) * 60000).toISOString(),
      origin: 'semeado',
      agent: { brain: 'claude', model: 'claude-opus-5', session: `sem-${i}` },
      question: `execução sintética ${i + 1}`,
      sources: tocados.map((label, k) => ({ n: k + 1, kind: 'memory', label, section: '' })),
      outcome: 'success',
    }));
  }
  const arquivo = path.join(DIARIO, 'semeado.jsonl');
  fs.writeFileSync(arquivo, linhas.join('\n') + '\n');
  console.log(`\x1b[1msemeado\x1b[0m  ${n} execuções sintéticas em ${arquivo}`);
  console.log(`  materialize com: node scripts/uso.mjs --diario ${DIARIO}`);
}

// ═══════════════════════════════════════════════════════════════ o céu

const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json()).catch(() => null);
if (!graph) {
  console.error(`sem resposta de ${SPATIA}/api/graph — suba o ./serve.py primeiro.`);
  process.exit(1);
}

/**
 * O CORPUS que este grafo descreve, carimbado em todo nó e toda aresta.
 *
 * ⚠️ **Sem ele os dois céus se somam em silêncio.** O `Astro` é chaveado por `source`, e sources de
 * corpora diferentes não colidem — materializar o fixture por cima do vivo não sobrescreve nada:
 * ACRESCENTA. O `/api/health` passaria a anunciar 259 corpos sobre um céu de 71.
 *
 * `group_id` separa do GRAPHITI (auditoria do P0); `corpus` separa os NOSSOS céus entre si.
 */
const CORPUS = graph?.corpus?.collection;
const fontes = graph.nodes.filter((n) => n.type === 'file' && n.source).map((n) => n.source);
const noCeu = new Set(fontes);

if (SEMEAR) {
  semear(SEMEAR, fontes);
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════ derivação

const runs = execucoes(DIARIO);
const toques = new Map();       // source → nº de execuções DISTINTAS que o tocaram
const arestas = [];             // {run, source}
const agentes = new Map();      // id → {id, brain}
let semAgente = 0;
let foraDoCeu = 0;

for (const r of runs) {
  const rotulos = new Set();
  for (const s of r.sources || []) {
    if (!s || typeof s !== 'object' || !s.label) continue;
    // ⚠️ `kind: 'web'` são páginas, não corpos. Casar por label sem filtrar criaria `Astro` para
    // "Google Notícias" — 6 deles no diário real de 08/08.
    if (s.kind && s.kind !== 'memory') continue;
    if (!noCeu.has(s.label)) { foraDoCeu++; continue; }
    rotulos.add(s.label);
  }
  for (const label of rotulos) {
    toques.set(label, (toques.get(label) || 0) + 1);
    arestas.push({ run: r.id, source: label });
  }
  const a = r.agent;
  if (a && a.brain) agentes.set(a.brain, { id: a.brain, brain: a.brain });
  else semAgente++;
}

const graus = [...toques.values()].sort((x, y) => x - y);
const grauMax = graus.at(-1) ?? 0;
const cobertura = toques.size / Math.max(fontes.length, 1);
const q = (p) => graus[Math.floor(p * graus.length)] ?? 0;

const meta = {
  runs: runs.length,
  corpos_tocados: toques.size,
  arestas: arestas.length,
  cobertura: Number(cobertura.toFixed(4)),
  grau_max: grauMax,
  grau_med: q(0.5),
  grau_p90: q(0.9),
  agentes: agentes.size,
  runs_sem_agente: semAgente,
};
const evidencia = evidenciaDeUso(meta);

console.log(`\x1b[1mUSO — derivação\x1b[0m  (diário: ${DIARIO})`);
console.log(`  execuções: ${runs.length} · com agente identificado: ${runs.length - semAgente} · agentes distintos: ${agentes.size}`);
console.log(`  corpos tocados: ${toques.size} (${(cobertura * 100).toFixed(2)}% do céu) · arestas TOUCHED: ${arestas.length}`);
console.log(`  grau: MED ${q(0.5)} · P90 ${q(0.9)} · máx ${grauMax}`);
if (foraDoCeu) console.log(`  \x1b[2m${foraDoCeu} citações fora do céu (web ou caminho não indexado) — descartadas\x1b[0m`);

const cor = evidencia.suficiente ? '\x1b[32m' : '\x1b[33m';
console.log(`\n${cor}EVIDÊNCIA\x1b[0m  disponível: ${evidencia.disponivel} · suficiente: \x1b[1m${evidencia.suficiente}\x1b[0m — ${evidencia.motivo}`);
console.log(`  \x1b[2mpiso: grau máx ≥ ${EVIDENCIA_USO_MINIMA.grauMax} e cobertura > ${(EVIDENCIA_USO_MINIMA.cobertura * 100).toFixed(1)}%\x1b[0m`);
if (!evidencia.suficiente) {
  console.log(`  \x1b[2ma dimensão EXISTE e é publicada; ela só não exerce influência enquanto a evidência for rala.\x1b[0m`);
}

if (SO_MEDIR) process.exit(0);

// ═══════════════════════════════════════════════════════════════ escrita no Neo4j

if (!USER || !PASS) {
  console.error('\nNEO4J_USER e NEO4J_PASSWORD são obrigatórios para materializar — use --medir para só medir.');
  process.exit(1);
}
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
async function cypher(statement, parameters = {}) {
  const r = await fetch(`${BASE}/db/neo4j/query/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ statement, parameters }),
  });
  if (!r.ok) throw new Error(`neo4j ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

await cypher(`CREATE CONSTRAINT astro_source IF NOT EXISTS FOR (a:${ROTULO}) REQUIRE a.source IS UNIQUE`);
await cypher(`CREATE CONSTRAINT run_id IF NOT EXISTS FOR (r:${EXECUCAO}) REQUIRE r.run_id IS UNIQUE`);
await cypher(`CREATE CONSTRAINT agent_id IF NOT EXISTS FOR (a:${AGENTE}) REQUIRE a.id IS UNIQUE`);

/*
 * O `Astro` é MERGE e não CREATE: o corpo já existe se o `vinculos.mjs` ou o `similares.mjs`
 * rodaram antes. Tocar um corpo não o cria — ele nasce do corpus, não do uso.
 */
await cypher(
  `UNWIND $fontes AS s MERGE (a:${ROTULO} {source: s}) SET a.group_id = $grupo, a.corpus = $corpus`,
  { fontes: [...toques.keys()], grupo: GRUPO, corpus: CORPUS }
);

if (agentes.size) {
  await cypher(
    `UNWIND $agentes AS a MERGE (x:${AGENTE} {id: a.id}) SET x.brain = a.brain, x.group_id = $grupo`,
    { agentes: [...agentes.values()], grupo: GRUPO, corpus: CORPUS }
  );
}

/*
 * `model` fica no RUN e não no AGENT, de propósito: um agente roda modelos diferentes ao longo do
 * tempo, então modelo é propriedade da EXECUÇÃO. Pendurá-lo no agente faria a última execução
 * reescrever a história de todas as anteriores.
 */
const execs = runs.map((r) => ({
  run_id: r.id,
  started: r.started || '',
  origin: r.origin || '',
  outcome: r.outcome || '',
  model: (r.agent && r.agent.model) || null,
  brain: (r.agent && r.agent.brain) || null,
}));
await cypher(
  `UNWIND $execs AS e
   MERGE (r:${EXECUCAO} {run_id: e.run_id})
   SET r.started = e.started, r.origin = e.origin, r.outcome = e.outcome,
       r.model = e.model, r.group_id = $grupo, r.corpus = $corpus
   WITH r, e WHERE e.brain IS NOT NULL
   MATCH (a:${AGENTE} {id: e.brain}) MERGE (a)-[:RAN]->(r)`,
  { execs, grupo: GRUPO, corpus: CORPUS }
);

await cypher(
  `UNWIND $arestas AS t
   MATCH (r:${EXECUCAO} {run_id: t.run}), (a:${ROTULO} {source: t.source})
   MERGE (r)-[e:TOUCHED]->(a) SET e.group_id = $grupo`,
  { arestas, grupo: GRUPO, corpus: CORPUS }
);

const conf = await cypher(
  `MATCH (r:${EXECUCAO}) WITH count(r) AS execucoes
   OPTIONAL MATCH (:${EXECUCAO})-[t:TOUCHED]->() WITH execucoes, count(t) AS tocados
   OPTIONAL MATCH (a:${AGENTE}) RETURN execucoes, tocados, count(a) AS agentes`
);
const [nExec, nToc, nAg] = conf.data.values[0];
console.log(`\n\x1b[1mmaterializado\x1b[0m  ${nExec} :${EXECUCAO} · ${nToc} TOUCHED · ${nAg} :${AGENTE} · group_id=${GRUPO}`);

// ═══════════════════════════════════════════════════════════════ o snapshot

/*
 * Saturação declarada (`USO_CHEIO`), não normalização por posto. O porquê está no
 * `entity-physics.js`: com grau máximo 2, o posto daria 1,0 ao corpo mais tocado e o céu afirmaria
 * "o mais usado que existe" sobre um arquivo que duas execuções abriram.
 *
 * O efeito colateral é a propriedade que se queria: o valor SOBE sozinho conforme o diário cresce,
 * sem reescalar nada e sem migração — a mesma escala serve para 11 e para 10 000 execuções.
 */
const uso = {};
for (const [source, n] of toques) {
  uso[source] = Number(Math.min(n / USO_CHEIO, 1).toFixed(4));
}

const snapshot = {
  as_of: new Date().toISOString(),
  // ⚠️ Quem lê precisa saber se olha CAPACIDADE ou COMPORTAMENTO. Sem este carimbo, um snapshot
  // semeado é indistinguível de uso real, e a bancada contaminaria a leitura do céu.
  origem: path.resolve(DIARIO) === path.resolve(DIARIO_REAL) ? 'diario' : 'semeado',
  diario: DIARIO,
  saturacao: USO_CHEIO,
  ...meta,
  evidencia,
  uso,
};
fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(snapshot));
console.log(`\x1b[1mescrito\x1b[0m  ${SAIDA} · ${toques.size} corpos · origem "${snapshot.origem}" · saturação ${USO_CHEIO}`);

const topo = [...toques.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([s, n]) => `${s.split('/').slice(-2).join('/')} (${n})`);
if (topo.length) console.log(`  mais usados: ${topo.join(' · ')}`);
