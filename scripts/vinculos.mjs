#!/usr/bin/env node
/**
 * VÍNCULOS — deriva as arestas laterais e as escreve no Neo4j. É o P2 de `docs/integracao-neo4j.md`.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/vinculos.mjs          # mede e escreve
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/vinculos.mjs --medir  # só mede
 *
 * ⚠️ **Fora de banda, sempre.** Nada aqui roda no caminho de uma pergunta nem de um quadro. O céu
 * monta sem grafo; o grafo só acrescenta influência. É a lei nº 2 do documento.
 *
 * ⚠️ **Só toca em rótulos NOSSOS** (`Astro`, `Sistema`) e nos tipos de `RELACOES`. O mesmo banco
 * hospeda o graphiti (`Entity`, `Episodic`, `Community`, `Saga`) e o Community não tem
 * multi-database — o isolamento é por rótulo, e escrever fora dele mistura dois grafos que ninguém
 * separa depois.
 *
 * ## O que ele NÃO consegue derivar, e o número está aqui
 *
 * A aresta **teste ↔ alvo** foi medida em 627 pares no `medicoes-2026-08-07` §4.4 e parecia a mais
 * densa das baratas. Ela foi medida **no disco**. Exigindo que os DOIS lados estejam indexados,
 * sobram **4** — porque o indexador não ingere código, e o alvo de um teste é código. A fase P2b
 * cai por falta de população, não por dificuldade.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import fs from 'node:fs';

const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const SO_MEDIR = process.argv.includes('--medir');

/**
 * A raiz do disco, com a precedência CONFERIDA em vez de suposta.
 *
 * ⚠️ **`AGENT_CWD` exportado no PERFIL DO SHELL vence tudo — e nesta máquina ele aponta para
 * `devshell-one`, que não existe desde a reorganização do workspace.** Dar precedência cega ao
 * ambiente devolvia ZERO com cara de resultado: 0 arquivos lidos, 0 arestas, e um relatório
 * completo descrevendo um corpus que ninguém tem. É a mesma família do default de máquina que o
 * `ee302fa` matou; o que faltava era conferir que o caminho EXISTE antes de obedecê-lo.
 *
 * A variável continua vencendo — para apontar um script a outra árvore de propósito —, só que
 * agora ela precisa ser verdade.
 */
function raizDoDisco(doServidor) {
  const doAmbiente = process.env.AGENT_CWD;
  // ⚠️ E ele só vence se APONTAR PARA O MESMO LUGAR que o servidor, ou se o servidor não souber.
  // Uma árvore diferente da que montou o céu não mede outro corpus: mede o vazio, porque nenhum
  // caminho casa. Medido: com `AGENT_CWD=devshell-one` exportado no perfil, 0 de 188 arquivos.
  if (doAmbiente && fs.existsSync(doAmbiente) && (!doServidor || doAmbiente === doServidor))
    return doAmbiente;
  if (doAmbiente) {
    console.warn(
      `\x1b[33m⚠ AGENT_CWD=${doAmbiente} não existe no disco — usando a raiz que o servidor publica\x1b[0m`
    );
  }
  return doServidor;
}

/** Rótulos e grupo — têm de bater com `server/graphdb.py`, que é quem os publica no health. */
const ROTULO = 'Astro';
const GRUPO = 'spatia';
/** Commit maior que isto não afirma vínculo: é refactor em massa, não trabalho conjunto. */
const COMMIT_MAX = 12;
const JANELA = 4000;

if (!USER || !PASS) {
  console.error('NEO4J_USER e NEO4J_PASSWORD são obrigatórios — o script não adivinha credencial.');
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

// ─────────────────────────────────────────────────────────────── derivação
const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json());
const files = graph.nodes.filter((n) => n.type === 'file');

/**
 * Os `source` do céu, para casar o que o `git log` devolve.
 *
 * ☠️ **A chave é o source INTEIRO, e não ele sem o primeiro segmento.** Cortar o primeiro segmento
 * fazia dois `README.md` de repos diferentes colidirem na mesma chave — inofensivo enquanto a raiz
 * era UM repo, e errado no instante em que ela passou a CONTER repos. Quem prefixa é o laço do git,
 * que sabe de qual repo aquele caminho veio.
 */
const sources = new Set(files.map((n) => n.source || '').filter(Boolean));

/*
 * ⚠️ **A árvore vem do SERVIDOR.** Isto era `AGENT_CWD || '/Users/victor/workspace/devshell-one'` —
 * caminho absoluto de uma máquina, apontando para o vazio desde que o workspace foi reorganizado. E
 * o sintoma não era mensagem: era um dump binário de `spawnSync`, que não liga o erro à causa.
 *
 * O `.env` não alcança este script (só o servidor o lê), mas o servidor publica o corpus junto da
 * topologia que já foi buscada acima. Sem `corpus` o script PARA — adivinhar a árvore é derivar
 * co-edição do repositório errado, e isso não falha, só mente.
 */
if (!graph.corpus) {
  console.error(
    'o /api/graph não publicou `corpus` — servidor velho? Sem ele este script adivinharia a árvore git.'
  );
  process.exit(1);
}
const ARVORE = raizDoDisco(graph.corpus.cwd);
/**
 * O CORPUS que este grafo descreve, carimbado em todo nó e toda aresta.
 *
 * ⚠️ **Sem ele os dois céus se somam em silêncio.** O `Astro` é chaveado por `source`, e sources de
 * corpora diferentes não colidem — materializar o fixture por cima do vivo não sobrescreve nada:
 * ACRESCENTA. O `/api/health` passaria a anunciar 259 corpos sobre um céu de 71, e a centralidade
 * sairia de dois universos empilhados.
 *
 * `group_id` separa do GRAPHITI (auditoria do P0); `corpus` separa os NOSSOS céus entre si.
 */
const CORPUS = graph.corpus.collection;

/**
 * As árvores git sob a raiz — e são VÁRIAS, ou uma, ou nenhuma.
 *
 * ☠️ **A raiz do corpus não é mais necessariamente um repositório.** Ela é a pasta que o operador
 * escolheu, e pode CONTER repos em vez de ser um. `git -C <raiz> log` ali morre com
 * *"not a git repository"* — visto, com a cadeia inteira parando na primeira etapa.
 *
 * ⭑ Cada repo é varrido no próprio diretório, e o caminho que o git devolve é prefixado com o
 * caminho do repo RELATIVO à raiz — que é exatamente a forma do `source`. Isso serve os dois
 * casos sem ramo especial: raiz que É repo tem prefixo vazio.
 *
 * ⚠️ Co-edição ENTRE repos não existe por construção: commits não são compartilhados. Varrer por
 * repo não perde par nenhum — só deixa de inventar um.
 */
function arvores(raiz) {
  const eRepo = (dir) => existsSync(join(dir, '.git'));
  if (eRepo(raiz)) return [{ prefixo: '', dir: raiz }];
  const achados = [];
  for (const nome of readdirSync(raiz, { withFileTypes: true })) {
    if (!nome.isDirectory()) continue;
    const dir = join(raiz, nome.name);
    if (eRepo(dir)) achados.push({ prefixo: nome.name, dir });
  }
  return achados;
}

const repos = arvores(ARVORE);
console.log(`\x1b[1márvore\x1b[0m  ${ARVORE}  ${repos.length} repositório(s)`);
if (!repos.length) {
  console.error('nenhum repositório git sob a raiz — sem histórico não há co-edição a derivar.');
  process.exit(1);
}

const blocos = [];
const ilegiveis = [];
for (const { prefixo, dir } of repos) {
  let bruto;
  try {
    bruto = execSync(`git -C ${JSON.stringify(dir)} log --format=%H --name-only -n ${JANELA}`, {
      maxBuffer: 1 << 28,
    }).toString();
  } catch (e) {
    // ⚠️ CONTADO e dito. Repo ilegível não derruba os outros, mas sumir com ele em silêncio faz
    // "poucos pares" e "metade dos repos não abriu" ficarem indistinguíveis.
    ilegiveis.push(`${prefixo || '.'}: ${String(e.message || e).slice(0, 60)}`);
    continue;
  }
  for (const b of bruto.split(/\n(?=[0-9a-f]{40}\n)/)) blocos.push({ prefixo, bloco: b });
}

const pares = new Map();
let commitsUteis = 0;
for (const { prefixo, bloco } of blocos) {
  const tocados = [
    ...new Set(
      bloco
        .trim()
        .split('\n')
        .slice(1)
        .filter(Boolean)
        .map((l) => (prefixo ? `${prefixo}/${l}` : l))
        .filter((s) => sources.has(s))
    ),
  ];
  if (tocados.length < 2 || tocados.length > COMMIT_MAX) continue;
  commitsUteis++;
  for (let i = 0; i < tocados.length; i++) {
    for (let j = i + 1; j < tocados.length; j++) {
      const [a, b] = [tocados[i], tocados[j]].sort();
      const k = `${a} ${b}`;
      pares.set(k, (pares.get(k) || 0) + 1);
    }
  }
}

const grau = new Map();
for (const k of pares.keys()) {
  for (const s of k.split(' ')) grau.set(s, (grau.get(s) || 0) + 1);
}
const graus = [...grau.values()].sort((a, b) => a - b);
const q = (p) => graus[Math.floor(p * graus.length)] ?? 0;

if (ilegiveis.length) console.log(`  \x1b[33m⚠ ${ilegiveis.length} repositório(s) ilegíveis: ${ilegiveis.join(' · ')}\x1b[0m`);
console.log(`\x1b[1mCO_EDITED — derivação\x1b[0m`);
console.log(`  janela ${JANELA} commits · úteis (2 a ${COMMIT_MAX} arquivos indexados): ${commitsUteis}`);
console.log(
  `  pares: ${pares.size} · nós com grau>0: ${grau.size} (${((grau.size / files.length) * 100).toFixed(1)}% do céu)`
);
console.log(`  grau: min ${q(0)} · MED ${q(0.5)} · P90 ${q(0.9)} · máx ${graus.at(-1) ?? 0}`);
console.log(
  `  \x1b[33m⚠ ${(100 - (grau.size / files.length) * 100).toFixed(1)}% do céu ficaria com centrality = null por FALTA DE ARESTA\x1b[0m`
);

if (SO_MEDIR) process.exit(0);

// ─────────────────────────────────────────────────────────────── escrita
/*
 * Constraint própria, no rótulo próprio. O graphiti não tem nenhuma constraint, então isto não
 * conflita — e sem ela dois `MERGE` concorrentes criariam dois `Astro` com o mesmo `source`.
 */
await cypher(`CREATE CONSTRAINT astro_source IF NOT EXISTS FOR (a:${ROTULO}) REQUIRE a.source IS UNIQUE`);

const fontes = [...new Set([...pares.keys()].flatMap((k) => k.split(' ')))];
await cypher(
  `UNWIND $fontes AS s MERGE (a:${ROTULO} {source: s}) SET a.group_id = $grupo, a.corpus = $corpus`,
  { fontes, grupo: GRUPO, corpus: CORPUS }
);

const arestas = [...pares.entries()].map(([k, peso]) => {
  const [a, b] = k.split(' ');
  return { a, b, peso };
});
/*
 * Direção arbitrária mas ESTÁVEL (ordem alfabética): co-edição é simétrica, e gravar os dois
 * sentidos dobraria o grau de todo mundo pelo mesmo fato. Quem consultar usa `-[r]-`, sem seta.
 */
await cypher(
  `UNWIND $arestas AS e
   MATCH (x:${ROTULO} {source: e.a}), (y:${ROTULO} {source: e.b})
   MERGE (x)-[r:CO_EDITED]->(y)
   SET r.peso = e.peso, r.group_id = $grupo, r.janela = $janela, r.corpus = $corpus`,
  { arestas, grupo: GRUPO, janela: JANELA, corpus: CORPUS }
);

// ⚠️ Filtrada pelo CORPUS: sem isso ela conta o céu vivo que continua no banco ao lado.
const conf = await cypher(
  `MATCH (a:${ROTULO} {corpus: $c}) WITH count(a) AS corpos
   OPTIONAL MATCH ()-[r:CO_EDITED {corpus: $c}]->() RETURN corpos, count(r) AS vinculos`,
  { c: CORPUS }
);
const [corpos, vinculos] = conf.data.values[0];
console.log(`\n\x1b[1mescrito\x1b[0m  ${corpos} :${ROTULO} · ${vinculos} CO_EDITED · group_id=${GRUPO}`);
