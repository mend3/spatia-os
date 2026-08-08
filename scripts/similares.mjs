#!/usr/bin/env node
/**
 * SIMILAR_TO — materializa a vizinhança semântica do Qdrant no Neo4j. É o P4 de
 * `docs/integracao-neo4j.md`, e desde a medida do P2 ele é **pré-requisito** da centralidade em vez
 * de sucessor dela: `CO_EDITED` só alcança 7,2% do céu, e uma dimensão que nasce vazia não degrada
 * com elegância — ela não existe.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/similares.mjs --derivar   # só deriva o k
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/similares.mjs             # deriva, mede e escreve
 *
 * ## Por que o `k` tem de ser DERIVADO
 *
 * `k` alto conecta tudo com tudo e a centralidade vira ruído; `k` baixo deixa nós isolados e ela
 * nasce vazia. A dimensão se autodestrói dos dois lados, e escolher o número a olho é escolher qual
 * das duas mortes.
 *
 * A derivação sai de um fato do desenho: **com `k` fixo, o grau de SAÍDA é constante para todo
 * mundo.** Quem carrega sinal é o grau de ENTRADA — ser vizinho de muitos é o que significa
 * influência. Então o `k` certo é o que **maximiza a discriminação da entrada**: o céu tem de
 * conseguir separar quem é referência de quem é periferia.
 *
 * A régua usada é o **Gini do grau de entrada**. Gini 0 = todos iguais (a dimensão não diz nada);
 * Gini alto = poucos concentram (a dimensão separa). Ele é medido para vários `k` na mesma
 * varredura, porque a busca é feita uma vez com o `k` máximo e truncada depois.
 *
 * ⚠️ **Fora de banda, e `as_of` em toda aresta.** Similaridade envelhece com a reindexação — sem a
 * data, ninguém sabe se a aresta descreve o corpus de hoje ou o de junho.
 */
const QDRANT = process.env.QDRANT_URL || 'http://localhost:6333';
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SO_DERIVAR = process.argv.includes('--derivar');

const ROTULO = 'Astro';
const GRUPO = 'spatia';
/** Busca uma vez com o teto e trunca: `k` menor é sempre um prefixo de `k` maior. */
const K_TETO = 20;
const K_CANDIDATOS = [3, 5, 8, 12, 20];

if (!USER || !PASS) {
  console.error('NEO4J_USER e NEO4J_PASSWORD são obrigatórios.');
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

// ───────────────────────────────────────────────────────── 1. um ponto por nó
const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json());
const fontes = new Set(graph.nodes.filter((n) => n.type === 'file').map((n) => n.source));

/*
 * ⚠️ **QUEM é o corpus vem do SERVIDOR, não de um default deste arquivo.**
 *
 * Estas duas linhas eram `QDRANT_COLLECTION || 'workspace_embedding'` e `CORPUS_PREFIX ?? 'vault/'`,
 * e as duas falham CALADAS: `||` troca de coleção sem avisar, e `??` só cai no default quando a
 * variável é AUSENTE — esquecer de exportar `CORPUS_PREFIX=""` casava ZERO representantes, e a
 * leitura que sobrava era "a vizinhança semântica não cobre o corpus". Foi o que mordeu no P4.
 *
 * O `.env` só é lido pelo servidor, e o servidor já publica o corpus junto da topologia que este
 * script acabou de buscar. Uma fonte, e ela é a mesma que montou o céu contra o qual se mede.
 */
if (!graph.corpus) {
  console.error('o /api/graph não publicou `corpus` — servidor velho? Sem ele este script adivinharia a coleção.');
  process.exit(1);
}
const COLECAO = process.env.QDRANT_COLLECTION || graph.corpus.collection;
/*
 * O `source` do Qdrant NÃO é o do céu: ele traz o `CORPUS_PREFIX` que o `graph.py` remove ao montar
 * os nós (`vault/devshell-one/x.md` vira `devshell-one/x.md`). O servidor tem `qdrant.restore_prefix`
 * para o caminho inverso; aqui a conversão é a mesma, em uma linha.
 */
const PREFIXO = process.env.CORPUS_PREFIX ?? graph.corpus.prefix;
const doCeu = (s) => (PREFIXO && s.startsWith(PREFIXO) ? s.slice(PREFIXO.length) : s);
console.log(`\x1b[1mcorpus\x1b[0m  ${COLECAO} · prefixo "${PREFIXO}" · ${graph.corpus.cwd}`);

/*
 * Um REPRESENTANTE por arquivo, e não todos os chunks.
 *
 * Um arquivo de 289 chunks teria 289 votos e dominaria a vizinhança de todo mundo — a centralidade
 * viraria uma função da massa, que já é outra dimensão. Um voto por arquivo mantém os dois eixos
 * separados, que é o ponto inteiro do §11.1.
 */
const rep = new Map();
let proximo = null;
do {
  const r = await fetch(`${QDRANT}/collections/${COLECAO}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 4096, offset: proximo, with_payload: ['metadata.source'], with_vector: false }),
  }).then((x) => x.json());
  for (const p of r.result.points) {
    const bruto = p.payload?.metadata?.source;
    if (!bruto) continue;
    const s = doCeu(bruto);
    if (fontes.has(s) && !rep.has(s)) rep.set(s, p.id);
  }
  proximo = r.result.next_page_offset;
} while (proximo);

console.log(`\x1b[1mrepresentantes\x1b[0m  ${rep.size} de ${fontes.size} arquivos do céu`);

// ───────────────────────────────────────────────────────── 2. vizinhança
const vizinhos = new Map();
const alvos = [...rep.entries()];
for (let i = 0; i < alvos.length; i += 64) {
  const lote = alvos.slice(i, i + 64);
  const respostas = await Promise.all(lote.map(([, id]) =>
    fetch(`${QDRANT}/collections/${COLECAO}/points/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: id,
        using: 'fast-paraphrase-multilingual-minilm-l12-v2',
        limit: K_TETO * 4, // folga: vários chunks do mesmo arquivo colapsam num vizinho só
        with_payload: ['metadata.source'],
      }),
    }).then((x) => x.json()).catch(() => null)
  ));
  lote.forEach(([fonte], j) => {
    const pontos = respostas[j]?.result?.points || [];
    const vistos = new Set([fonte]);
    const lista = [];
    for (const p of pontos) {
      const s = doCeu(p.payload?.metadata?.source || '');
      if (!s || vistos.has(s) || !fontes.has(s)) continue;
      vistos.add(s);
      lista.push({ fonte: s, score: p.score });
      if (lista.length >= K_TETO) break;
    }
    vizinhos.set(fonte, lista);
  });
  process.stdout.write(`\r  vizinhança: ${Math.min(i + 64, alvos.length)}/${alvos.length}`);
}
console.log('');

// ───────────────────────────────────────────────────────── 3. a derivação do k
function gini(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const n = v.length;
  const soma = v.reduce((a, b) => a + b, 0);
  if (!soma) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (2 * (i + 1) - n - 1) * v[i];
  return acc / (n * soma);
}

console.log(`\n\x1b[1mDERIVAÇÃO DO k — discriminação do grau de ENTRADA\x1b[0m`);
console.log('  (saída é constante = k, por construção; quem separa é a entrada)');
let melhor = null;
for (const k of K_CANDIDATOS) {
  const entrada = new Map([...rep.keys()].map((s) => [s, 0]));
  for (const [, lista] of vizinhos) {
    for (const v of lista.slice(0, k)) entrada.set(v.fonte, (entrada.get(v.fonte) || 0) + 1);
  }
  const vals = [...entrada.values()];
  const g = gini(vals);
  const isolados = vals.filter((x) => x === 0).length;
  const ord = [...vals].sort((a, b) => a - b);
  const p90 = ord[Math.floor(0.9 * ord.length)];
  const med = ord[Math.floor(0.5 * ord.length)];
  console.log(`  k=${String(k).padStart(2)}  Gini ${g.toFixed(3)} · isolados ${String(isolados).padStart(4)} (${((isolados / vals.length) * 100).toFixed(1)}%) · MED ${String(med).padStart(3)} · P90 ${String(p90).padStart(3)} · máx ${ord.at(-1)}`);
  // Melhor = maior Gini entre os que deixam menos de 10% isolados. Discriminar não vale nada se
  // for discriminar um céu vazio.
  if (isolados / vals.length < 0.10 && (!melhor || g > melhor.g)) melhor = { k, g, isolados };
}
if (!melhor) {
  console.error('  nenhum k deixa menos de 10% isolados — a vizinhança semântica não cobre o corpus');
  process.exit(1);
}
console.log(`\n  \x1b[1mk = ${melhor.k}\x1b[0m  (Gini ${melhor.g.toFixed(3)}, ${melhor.isolados} isolados)`);

if (SO_DERIVAR) process.exit(0);

// ───────────────────────────────────────────────────────── 4. escrita
const K = melhor.k;
const asOf = new Date().toISOString().slice(0, 10);
const arestas = [];
for (const [fonte, lista] of vizinhos) {
  for (const v of lista.slice(0, K)) arestas.push({ a: fonte, b: v.fonte, score: v.score });
}

await cypher(`CREATE CONSTRAINT astro_source IF NOT EXISTS FOR (a:${ROTULO}) REQUIRE a.source IS UNIQUE`);
const todas = [...new Set(arestas.flatMap((e) => [e.a, e.b]))];
for (let i = 0; i < todas.length; i += 2000) {
  await cypher(`UNWIND $f AS s MERGE (a:${ROTULO} {source: s}) SET a.group_id = $g`,
    { f: todas.slice(i, i + 2000), g: GRUPO });
}
for (let i = 0; i < arestas.length; i += 2000) {
  await cypher(
    `UNWIND $e AS x
     MATCH (a:${ROTULO} {source: x.a}), (b:${ROTULO} {source: x.b})
     MERGE (a)-[r:SIMILAR_TO]->(b)
     SET r.score = x.score, r.k = $k, r.as_of = $asOf, r.group_id = $g`,
    { e: arestas.slice(i, i + 2000), k: K, asOf, g: GRUPO }
  );
  process.stdout.write(`\r  escrevendo: ${Math.min(i + 2000, arestas.length)}/${arestas.length}`);
}

const conf = await cypher(
  `MATCH (a:${ROTULO}) WITH count(a) AS corpos
   OPTIONAL MATCH ()-[s:SIMILAR_TO]->() WITH corpos, count(s) AS sim
   OPTIONAL MATCH ()-[c:CO_EDITED]->() RETURN corpos, sim, count(c) AS coed`
);
const [corpos, sim, coed] = conf.data.values[0];
console.log(`\n\n\x1b[1mescrito\x1b[0m  ${corpos} :${ROTULO} · ${sim} SIMILAR_TO (k=${K}, as_of=${asOf}) · ${coed} CO_EDITED`);
