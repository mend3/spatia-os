#!/usr/bin/env node
/**
 * CONCEITOS — o P7 de `docs/integracao-neo4j.md`, e a única fase que custa INFERÊNCIA.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/conceitos.mjs --medir   # extrai e mede, não escreve
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/conceitos.mjs           # extrai, mede e escreve
 *     … --limite 8                                                       # só os N maiores, para ensaiar
 *
 * ## A condição que a spec impunha, e ela está cumprida
 *
 * > *"P7 — só depois de o grafo provar valor SEM LLM."*
 *
 * Quatro relações medidas (`SIMILAR_TO` 100%, `REFERENCES` 88,8%, `CO_EDITED` 85,1%, `IMPORTS`
 * 59,6%) e a rede desenhando na seleção. A prova existe, então o custo se justifica.
 *
 * ## ⚠️ O que sai daqui NÃO é fato, e o grafo tem de saber disso
 *
 * As outras quatro relações saem de disco, de git ou de vetor: qualquer pessoa recalcula e chega ao
 * mesmo número. Esta sai de um MODELO — ela é interpretação, e duas execuções podem discordar. Três
 * consequências, todas em código:
 *
 * - o rótulo é **`Concept`** e a relação é **`ABOUT`** (a auditoria do P0 renomeou `MENTIONS`, que
 *   já é do graphiti). Tipo próprio significa que apagar tudo o que veio de inferência é uma
 *   consulta só;
 * - toda aresta carrega **`modelo` e `as_of`**: sem eles ninguém sabe quem afirmou, nem quando;
 * - `temperature: 0` e formato fechado. Não elimina a variação, reduz.
 *
 * ## E a medida que DECIDE se ela vale
 *
 * Um conceito que só um corpo exerce não liga nada — é rótulo, não relação. O valor está nos
 * conceitos **COMPARTILHADOS**: são eles que fazem dois arquivos distantes se tocarem por assunto.
 * Por isso o relatório separa `compartilhados` de `solitários`, e o modo `--medir` existe para essa
 * conta ser vista antes de qualquer escrita.
 *
 * ⚠️ Só PROSA entra. Extrair "assunto" de código devolveria os nomes das funções, que já são o
 * `IMPORTS` com outro nome — e a spec é explícita: `MENTIONS` alimenta COMPOSIÇÃO, não estrutura.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODELO = process.env.OLLAMA_MODEL || 'qwen3:8b';
const SO_MEDIR = process.argv.includes('--medir');
const LIMITE = Number(process.argv[process.argv.indexOf('--limite') + 1]) || Infinity;
const ROTULO = 'Astro';
const GRUPO = 'spatia';
/** Quantos conceitos por arquivo. Acima disso a lista vira índice remissivo, não assunto. */
const POR_ARQUIVO = 6;
/** Quanto texto vai ao modelo. O começo de um documento é onde o assunto dele se declara. */
const JANELA_CHARS = 6000;

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

/** Ver `citacoes.mjs`: `AGENT_CWD` do perfil aponta para uma árvore que não existe mais. */
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

// ─────────────────────────────────────────────────────── 1. a prosa
const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json());
if (!graph.corpus) {
  console.error('o /api/graph não publicou `corpus` — servidor velho?');
  process.exit(1);
}
const RAIZ = raizDoDisco(graph.corpus.cwd);
/**
 * O CORPUS que este grafo descreve — ver o mesmo bloco em `vinculos.mjs`. Sem ele, dois céus se
 * somam no mesmo grafo e o `/api/health` conta os dois como um.
 */
const CORPUS = graph.corpus.collection;
const semRepo = (source) => source.slice(source.indexOf('/') + 1);
const prosa = graph.nodes
  .filter((n) => n.type === 'file' && /\.(md|mdc|txt)$/i.test(n.source))
  .sort((a, b) => (b.chunks || 0) - (a.chunks || 0))
  .slice(0, LIMITE);

console.log(
  `\x1b[1mP7 — conceitos\x1b[0m  ${prosa.length} arquivos de prosa · modelo ${MODELO} · raiz ${RAIZ}`
);
if (!prosa.length) {
  console.error('nenhum arquivo de prosa no céu — nada a extrair.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────── 2. o modelo está no ar?
const tags = await fetch(`${OLLAMA}/api/tags`)
  .then((r) => r.json())
  .catch(() => null);
if (!tags) {
  console.error(
    `\x1b[31mollama não responde em ${OLLAMA}.\x1b[0m O P7 é a única fase que depende de inferência — sem ele, nada a fazer.`
  );
  process.exit(1);
}
const disponiveis = (tags.models || []).map((m) => m.name);
if (!disponiveis.includes(MODELO)) {
  console.error(`\x1b[31mmodelo ${MODELO} não está no ollama.\x1b[0m Disponíveis: ${disponiveis.join(', ')}`);
  process.exit(1);
}

/**
 * A instrução. Fechada de propósito: lista de substantivos curtos, em português, sem explicação.
 *
 * ⚠️ Pedir "temas" solta o modelo em prosa; pedir JSON com um teto força uma resposta comparável
 * entre arquivos, que é o que permite dois documentos compartilharem o mesmo conceito. E o pedido
 * de MINÚSCULAS não é estética: é o que faz "Buraco Negro" e "buraco negro" virarem o mesmo nó.
 */
const INSTRUCAO = `Você extrai ASSUNTOS de documentos técnicos. Responda APENAS com um array JSON de
no máximo ${POR_ARQUIVO} strings, em português, minúsculas, cada uma com 1 a 3 palavras, nomeando o
que o documento TRATA — não o que ele é. Nada de explicação, nada de markdown, só o array.`;

const slugificar = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

async function extrair(texto) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      stream: false,
      // `think: false` corta o raciocínio do qwen3, que senão volta dentro da resposta e quebra o
      // JSON. Temperatura 0 não torna a extração determinística, só reduz a variação.
      think: false,
      options: { temperature: 0, num_predict: 200 },
      messages: [
        { role: 'system', content: INSTRUCAO },
        { role: 'user', content: texto },
      ],
    }),
  })
    .then((x) => x.json())
    .catch(() => null);
  const bruto = r?.message?.content ?? '';
  const inicio = bruto.indexOf('[');
  const fim = bruto.lastIndexOf(']');
  if (inicio < 0 || fim < inicio) return [];
  try {
    const lista = JSON.parse(bruto.slice(inicio, fim + 1));
    return Array.isArray(lista)
      ? lista
          .filter((x) => typeof x === 'string')
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, POR_ARQUIVO)
      : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────── 3. a extração
/*
 * ⚠️ **A extração é CACHEADA em disco, e a consolidação não.** Elas custam coisas diferentes: a
 * primeira é inferência (minutos, e varia entre execuções), a segunda é aritmética sobre vetores.
 * Sem o cache, todo ajuste no limiar de consolidação pagaria a extração inteira de novo — e, pior,
 * pagaria com uma extração DIFERENTE, tornando impossível saber se o número mudou por causa do
 * limiar ou do modelo. `--reextrair` força a primeira etapa.
 */
const CACHE = '.cache/conceitos-brutos.json';
const REEXTRAIR = process.argv.includes('--reextrair');

/** `slug` → { label, corpos: Set } */
const conceitos = new Map();
const porCorpo = new Map();
let semResposta = 0;

let doCache = null;
if (!REEXTRAIR) {
  try {
    const bruto = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
    if (bruto.modelo === MODELO) doCache = bruto;
  } catch {
    /* sem cache: extrai */
  }
}

if (doCache) {
  console.log(
    `  \x1b[2mextração lida do cache (${doCache.as_of}, modelo ${doCache.modelo}) — use --reextrair para refazer\x1b[0m`
  );
  for (const [source, lista] of Object.entries(doCache.porCorpo)) porCorpo.set(source, lista);
} else {
  for (const [i, node] of prosa.entries()) {
    let texto;
    try {
      texto = fs.readFileSync(path.join(RAIZ, semRepo(node.source)), 'utf-8').slice(0, JANELA_CHARS);
    } catch {
      continue;
    }
    const lista = await extrair(texto);
    if (!lista.length) semResposta++;
    porCorpo.set(node.source, lista);
    process.stdout.write(`\r  extraindo: ${i + 1}/${prosa.length}`);
  }
  console.log('');
  fs.mkdirSync('.cache', { recursive: true });
  fs.writeFileSync(
    CACHE,
    JSON.stringify({
      as_of: new Date().toISOString(),
      modelo: MODELO,
      porCorpo: Object.fromEntries(porCorpo),
    })
  );
}

// ─────────────────────────────────────────── 3.5 CONSOLIDAÇÃO por significado
/*
 * ⚠️ **Extração livre NUNCA colide como string, e a medida foi brutal: 138 conceitos, ZERO
 * compartilhados.** "replanejamento celeste" e "cosmologia do céu" são o mesmo assunto e dois nós
 * diferentes; cada corpo ficava com uma etiqueta particular, e uma relação em que ninguém se
 * encontra não liga nada — é rótulo com custo de inferência.
 *
 * O conserto não é pedir ao modelo que "use termos padronizados" (ele não conhece os dos outros
 * arquivos): é consolidar DEPOIS, por SIGNIFICADO. Os rótulos são embutidos com `nomic-embed-text`
 * — o mesmo vetorizador que o workspace já usa — e agrupados por cosseno. Dois nomes diferentes do
 * mesmo assunto caem no mesmo grupo, e o grupo vira UM `Concept`.
 *
 * ⚠️ **O limiar é DERIVADO, não escolhido** — a mesma régua do `k` do `SIMILAR_TO`. Frouxo demais
 * funde tudo num conceito só ("o céu inteiro é sobre software"); apertado demais devolve os 138
 * solitários. O critério tem os dois lados: MAXIMIZAR conceitos compartilhados, com o teto de que
 * nenhum grupo pode engolir mais da metade dos corpos — porque um conceito que todo mundo exerce
 * não distingue ninguém, que é a armadilha da classe vazia pelo avesso.
 */
const EMBED_MODELO = process.env.OLLAMA_EMBED || 'nomic-embed-text:latest';
const LIMIARES = [0.62, 0.68, 0.72, 0.76, 0.8, 0.85, 0.9];

const rotulos = [...new Set([...porCorpo.values()].flat())];
const vetores = new Map();
for (let i = 0; i < rotulos.length; i += 16) {
  const lote = rotulos.slice(i, i + 16);
  const respostas = await Promise.all(
    lote.map((texto) =>
      fetch(`${OLLAMA}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODELO, prompt: texto }),
      })
        .then((x) => x.json())
        .catch(() => null)
    )
  );
  lote.forEach((texto, j) => {
    const v = respostas[j]?.embedding;
    if (Array.isArray(v)) {
      const norma = Math.hypot(...v) || 1;
      vetores.set(
        texto,
        v.map((x) => x / norma)
      );
    }
  });
  process.stdout.write(`\r  embutindo rótulos: ${Math.min(i + 16, rotulos.length)}/${rotulos.length}`);
}
console.log('');
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/**
 * Agrupa por ligação simples: dois rótulos no mesmo grupo se o cosseno passa do limiar.
 *
 * O REPRESENTANTE é o rótulo mais frequente do grupo — o nome que mais gente usou, que é a escolha
 * honesta quando não há vocabulário canônico.
 */
function agrupar(limiar) {
  const pai = new Map(rotulos.map((r) => [r, r]));
  const raiz = (x) => (pai.get(x) === x ? x : (pai.set(x, raiz(pai.get(x))), pai.get(x)));
  for (let i = 0; i < rotulos.length; i++) {
    const a = vetores.get(rotulos[i]);
    if (!a) continue;
    for (let j = i + 1; j < rotulos.length; j++) {
      const b = vetores.get(rotulos[j]);
      if (b && cos(a, b) >= limiar) pai.set(raiz(rotulos[i]), raiz(rotulos[j]));
    }
  }
  const grupos = new Map();
  for (const r of rotulos) {
    const k = raiz(r);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  // grupo → corpos que exercem qualquer rótulo dele
  const corposDoGrupo = new Map();
  for (const [source, lista] of porCorpo) {
    for (const r of lista) {
      const k = raiz(r);
      if (!corposDoGrupo.has(k)) corposDoGrupo.set(k, new Set());
      corposDoGrupo.get(k).add(source);
    }
  }
  return { grupos, corposDoGrupo };
}

console.log(`\n\x1b[1mDERIVAÇÃO DO LIMIAR — o que faz dois documentos se tocarem por assunto\x1b[0m`);
const corposTotal = porCorpo.size;
let melhor = null;
for (const limiar of LIMIARES) {
  const { grupos, corposDoGrupo } = agrupar(limiar);
  const compart = [...corposDoGrupo.values()].filter((c) => c.size >= 2).length;
  const maior = Math.max(...[...corposDoGrupo.values()].map((c) => c.size), 0);
  const domina = maior > corposTotal / 2;
  console.log(
    `  ≥${limiar.toFixed(2)}  ${String(grupos.size).padStart(4)} conceitos · ` +
      `compartilhados \x1b[1m${String(compart).padStart(3)}\x1b[0m · maior grupo toca ${maior} corpos` +
      (domina ? ' \x1b[31m← engole mais da metade do céu\x1b[0m' : '')
  );
  if (!domina && (!melhor || compart > melhor.compart)) melhor = { limiar, compart, grupos, corposDoGrupo };
}
if (!melhor) {
  console.error('\n\x1b[31mnenhum limiar liga corpos sem colapsar o céu num assunto só.\x1b[0m');
  process.exit(1);
}
console.log(
  `\n  \x1b[1mlimiar = ${melhor.limiar.toFixed(2)}\x1b[0m  (${melhor.compart} conceitos compartilhados)`
);

for (const [chave, membros] of melhor.grupos) {
  const corpos = melhor.corposDoGrupo.get(chave) || new Set();
  // Representante: o rótulo mais usado do grupo; empate resolve pelo mais curto, que costuma ser
  // o termo e não a paráfrase.
  const freq = new Map();
  for (const lista of porCorpo.values())
    for (const r of lista) if (membros.includes(r)) freq.set(r, (freq.get(r) || 0) + 1);
  const label = [...membros].sort(
    (a, b) => (freq.get(b) || 0) - (freq.get(a) || 0) || a.length - b.length
  )[0];
  const slug = slugificar(label);
  if (!slug) continue;
  conceitos.set(slug, { label, corpos, sinonimos: membros });
}

// ─────────────────────────────────────────────────────── 4. a medida que decide
const compartilhados = [...conceitos.entries()].filter(([, c]) => c.corpos.size >= 2);
const solitarios = conceitos.size - compartilhados.length;
const arestas = [...conceitos.values()].reduce((a, c) => a + c.corpos.size, 0);
const corposCobertos = new Set([...conceitos.values()].flatMap((c) => [...c.corpos])).size;

console.log(`\n\x1b[1mEXTRAÍDO\x1b[0m`);
console.log(
  `  ${conceitos.size} conceitos distintos · ${arestas} arestas ABOUT · ${corposCobertos}/${prosa.length} arquivos cobertos`
);
if (semResposta) console.log(`  \x1b[33m${semResposta} arquivos não devolveram JSON utilizável\x1b[0m`);
console.log(`\n\x1b[1mO QUE DECIDE: quantos conceitos LIGAM dois corpos\x1b[0m`);
console.log(
  `  compartilhados (≥2 corpos): \x1b[1m${compartilhados.length}\x1b[0m · solitários: ${solitarios} (${((solitarios / Math.max(conceitos.size, 1)) * 100).toFixed(0)}%)`
);
if (compartilhados.length) {
  const topo = compartilhados.sort((a, b) => b[1].corpos.size - a[1].corpos.size).slice(0, 8);
  for (const [slug, c] of topo)
    console.log(`    ${String(c.corpos.size).padStart(2)} corpos · ${c.label} \x1b[2m(${slug})\x1b[0m`);
}
console.log(
  compartilhados.length
    ? `\n\x1b[32m✓ a relação liga corpos\x1b[0m — ${compartilhados.length} conceitos são exercidos por mais de um.`
    : `\n\x1b[31m✗ nenhum conceito é compartilhado.\x1b[0m Cada um pertence a um corpo só: isso é RÓTULO, não relação, e não paga o custo da inferência.`
);

if (SO_MEDIR) process.exit(0);
if (!compartilhados.length) {
  console.error('recusando escrever: uma relação em que ninguém se encontra não liga nada.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────── 5. escrita
const asOf = new Date().toISOString().slice(0, 10);
await cypher('CREATE CONSTRAINT conceito_slug IF NOT EXISTS FOR (c:Concept) REQUIRE c.slug IS UNIQUE');
/*
 * ⚠️ Apaga o que ESTE grupo escreveu antes. Inferência é revisável por natureza — modelo novo,
 * documento editado, prompt melhor — e acumular camadas de opinião diferentes no mesmo grafo faria
 * ninguém saber qual delas está sendo lida.
 */
await cypher(`MATCH ()-[r:ABOUT {group_id: $g}]->() DELETE r`, { g: GRUPO });
await cypher(`MATCH (c:Concept {group_id: $g}) WHERE NOT (c)--() DELETE c`, { g: GRUPO });

const lista = [];
for (const [slug, c] of conceitos) {
  for (const corpo of c.corpos) lista.push({ slug, label: c.label, corpo });
}
for (let i = 0; i < lista.length; i += 1000) {
  await cypher(
    `UNWIND $e AS x
     MERGE (c:Concept {slug: x.slug}) SET c.label = x.label, c.group_id = $g
     MERGE (a:${ROTULO} {source: x.corpo}) ON CREATE SET a.group_id = $g, a.corpus = $c
     MERGE (a)-[r:ABOUT]->(c)
     SET r.modelo = $modelo, r.as_of = $asOf, r.group_id = $g, r.corpus = $c`,
    { e: lista.slice(i, i + 1000), g: GRUPO, c: CORPUS, modelo: MODELO, asOf }
  );
}

/*
 * ⚠️ **O SNAPSHOT existe para o conceito ter LEITOR.** Escrever no Neo4j e parar ali seria a REGRA
 * DO CATÁLOGO ao contrário — fato materializado que nenhuma tela consulta. Ele segue a lei nº 2
 * como todos os outros: arquivo em disco, servido pelo `/api/vizinhanca`, lido pelo painel.
 *
 * Só o que é COMPARTILHADO viaja marcado: um assunto que só este corpo exerce descreve o
 * documento; um que dois exercem LIGA os dois, e é essa a diferença que a tela precisa mostrar.
 */
const snapshot = {
  as_of: new Date().toISOString(),
  // ⚠️ DE QUE CÉU — e aqui vale duplamente, porque esta é a única dimensão que não é FATO: quem lê
  // o assunto já precisa saber quem o afirmou (`modelo`) e quando (`as_of`); saber sobre QUAL
  // corpus fecha a terna. O servidor recusa snapshot alheio (`graphdb._recusa_de_corpus`).
  corpus: CORPUS,
  modelo: MODELO,
  modelo_embed: EMBED_MODELO,
  limiar: melhor.limiar,
  conceitos: conceitos.size,
  compartilhados: compartilhados.length,
  porCorpo: Object.fromEntries(
    [...porCorpo.keys()]
      .map((source) => [
        source,
        [...conceitos.entries()]
          .filter(([, c]) => c.corpos.has(source))
          .map(([slug, c]) => ({ slug, label: c.label, corpos: c.corpos.size })),
      ])
      .filter(([, lista]) => lista.length)
  ),
};
fs.writeFileSync('.cache/conceitos.json', JSON.stringify(snapshot));
console.log(
  `\x1b[1mescrito\x1b[0m  .cache/conceitos.json · ${Object.keys(snapshot.porCorpo).length} corpos com assunto`
);

const conf = await cypher(
  `MATCH (c:Concept {group_id: $g}) WITH count(c) AS conceitos
   OPTIONAL MATCH ()-[r:ABOUT {group_id: $g}]->() RETURN conceitos, count(r) AS arestas`,
  { g: GRUPO }
);
const [nConceitos, nArestas] = conf.data.values[0];
console.log(
  `\n\x1b[1mescrito\x1b[0m  ${nConceitos} :Concept · ${nArestas} ABOUT (modelo=${MODELO}, as_of=${asOf})`
);
console.log(`  ⚠️ ABOUT liga Astro→Concept: as duas pontas NÃO são corpos, então ela não entra na`);
console.log(`     rede da seleção — pela mesma razão que o TOUCHED ficou de fora (§5.1).`);
