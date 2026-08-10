#!/usr/bin/env node
/**
 * CITAÇÕES — o P6 de `docs/integracao-neo4j.md`: `REFERENCES` e `IMPORTS`.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/citacoes.mjs --medir   # só mede
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/citacoes.mjs           # mede e escreve
 *
 * ## Por que elas valem mais que as duas que já existem
 *
 * `SIMILAR_TO` afirma *"estes dois se parecem"* e `CO_EDITED` afirma *"foram tocados juntos"*. As
 * duas são estatísticas: nenhuma sabe se um corpo **aponta** para o outro. Uma citação sabe — ela é
 * uma afirmação que alguém escreveu, e é dirigida. É por isso que a spec as chama de semanticamente
 * mais fortes, e é por isso que elas entram com SETA enquanto a co-edição entra simétrica.
 *
 * | relação | o fato | lê-se como |
 * |---|---|---|
 * | `REFERENCES` | um caminho do céu citado dentro de outro arquivo | dependência **documental** |
 * | `IMPORTS` | `import`/`require`/`from` resolvido para um arquivo do céu | dependência **estrutural** |
 *
 * ## ⚠️ O que este script lê, e por que isso importa
 *
 * Ele lê o **DISCO** (`AGENT_CWD`), não o índice — e os dois discordam por construção: o indexador
 * escolhe extensões, então há arquivo no disco que não é corpo do céu. Toda ponta é conferida
 * contra a topologia antes de virar aresta, porque desenhar vínculo para quem não tem corpo é
 * afirmar uma relação com o vazio. O `P2b` caiu exatamente por essa diferença: 627 arestas no
 * disco viraram 4 exigindo os dois lados indexados.
 *
 * ⚠️ **E `IMPORTS` é uma capacidade DESTE corpus, não do real.** O corpus real tem zero código
 * (`espatial_vivo` inclui `.js/.mjs/.py` de propósito, 163 dos 191 arquivos). `REFERENCES`
 * transfere — prosa cita caminho em qualquer corpus —, `IMPORTS` só existe onde houver código
 * indexado. Os dois números saem separados no relatório justamente para isso não se perder.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const SO_MEDIR = process.argv.includes('--medir');
const ROTULO = 'Astro';
const GRUPO = 'spatia';

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

// ─────────────────────────────────────────────────────── 1. o céu, e a raiz do disco
const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json());
if (!graph.corpus) {
  console.error('o /api/graph não publicou `corpus` — servidor velho?');
  process.exit(1);
}
const RAIZ = raizDoDisco(graph.corpus.cwd);
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

const arquivos = graph.nodes.filter((n) => n.type === 'file');
console.log(
  `\x1b[1mcorpus\x1b[0m  ${graph.corpus.collection} · ${arquivos.length} corpos · disco em ${RAIZ}`
);

/*
 * O `source` do céu é `<repo>/<caminho>`; o disco só conhece o caminho. O primeiro segmento é o
 * repo virtual (`graph.py`), então ele sai para virar caminho e volta para virar aresta.
 */
const semRepo = (source) => source.slice(source.indexOf('/') + 1);
/** caminho relativo à raiz → `source` do céu. É a chave de resolução das duas relações. */
const porCaminho = new Map(arquivos.map((n) => [semRepo(n.source), n.source]));
/** nome do arquivo → sources que o têm. Para resolver citação que não traz o caminho inteiro. */
const porNome = new Map();
for (const n of arquivos) {
  const nome = n.source.split('/').pop();
  if (!porNome.has(nome)) porNome.set(nome, []);
  porNome.get(nome).push(n.source);
}

// ─────────────────────────────────────────────────────── 2. os dois extratores
/**
 * Caminhos citados em PROSA. Aceita `docs/x.md`, `./src/y.js`, `` `server/z.py` `` e links de
 * markdown — tudo o que pareça caminho com barra e extensão conhecida.
 */
const CITACAO =
  /(?:^|[\s(<`'"[])((?:\.{0,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.[a-z]{1,5})(?=[\s)>`'"\],:;!?]|$)/gim;
/**
 * `import`/`require`/`from` com caminho RELATIVO. Pacote instalado não é corpo deste céu, e
 * resolver `three` para `vendor/three.module.js` seria inventar a aresta que o importmap faz.
 */
const IMPORTACAO = /(?:from\s+|import\s+|require\(\s*)['"](\.[^'"]+)['"]/g;

/** Varre o disco a partir da raiz, só os arquivos que SÃO corpos do céu. */
function lerCorpos() {
  const textos = new Map();
  for (const [rel, source] of porCaminho) {
    try {
      const completo = path.join(RAIZ, rel);
      const st = fs.statSync(completo);
      // 2 MB é o teto: acima disso é dump gerado, e regex sobre dump não acha citação, acha ruído.
      if (!st.isFile() || st.size > 2 << 20) continue;
      textos.set(source, fs.readFileSync(completo, 'utf-8'));
    } catch {
      // Arquivo indexado que não está mais no disco. Some sem aresta, e a contagem abaixo o acusa.
    }
  }
  return textos;
}

const textos = lerCorpos();
console.log(
  `\x1b[1mlidos\x1b[0m   ${textos.size} de ${arquivos.length} corpos (o resto sumiu do disco ou é grande demais)`
);
/*
 * ⚠️ Zero lidos é ERRO, não resultado. Sem esta parada o script segue e imprime um relatório
 * inteiro de zeros — a forma mais convincente de mentir que existe, porque tudo nele está certo
 * menos a premissa.
 */
if (textos.size === 0) {
  console.error(`\x1b[31mnenhum corpo do céu existe em ${RAIZ} — raiz errada, não corpus vazio.\x1b[0m`);
  process.exit(1);
}

const arestas = { REFERENCES: new Map(), IMPORTS: new Map() };
let citacoesVistas = 0;
let importsVistos = 0;
let foraDoCeu = 0;

for (const [origem, texto] of textos) {
  const eu = semRepo(origem);
  const dir = eu.slice(0, eu.lastIndexOf('/') + 1);

  const registrar = (tipo, alvo) => {
    if (!alvo || alvo === origem) return;
    const chave = `${origem} ${alvo}`;
    const m = arestas[tipo];
    m.set(chave, (m.get(chave) || 0) + 1);
  };

  for (const m of texto.matchAll(CITACAO)) {
    citacoesVistas++;
    const bruto = m[1];
    // Resolve relativo ao arquivo que cita; depois tenta como caminho a partir da raiz.
    const tentativas = [
      path.posix.normalize(bruto.startsWith('.') ? dir + bruto : bruto),
      path.posix.normalize(dir + bruto),
    ];
    const achado = tentativas.map((t) => porCaminho.get(t)).find(Boolean);
    if (achado) registrar('REFERENCES', achado);
    else foraDoCeu++;
  }

  for (const m of texto.matchAll(IMPORTACAO)) {
    importsVistos++;
    let alvo = path.posix.normalize(dir + m[1]);
    /*
     * `import './x.js'` vem com extensão neste projeto (é ESM de navegador), mas `.py` e alguns
     * `.mjs` não — então a resolução tenta o caminho cru e depois os sufixos usuais, na ordem em
     * que um resolvedor tentaria.
     */
    const candidatos = [alvo, `${alvo}.js`, `${alvo}.mjs`, `${alvo}/index.js`, `${alvo}.py`];
    const achado = candidatos.map((c) => porCaminho.get(c)).find(Boolean);
    if (achado) registrar('IMPORTS', achado);
    else foraDoCeu++;
  }
}

// ─────────────────────────────────────────────────────── 3. a medida
function relatar(tipo) {
  const pares = arestas[tipo];
  const nos = new Set();
  let peso = 0;
  for (const [chave, n] of pares) {
    const [a, b] = chave.split(' ');
    nos.add(a);
    nos.add(b);
    peso += n;
  }
  const cobertura = (nos.size / arquivos.length) * 100;
  const graus = new Map();
  for (const chave of pares.keys()) {
    const [a, b] = chave.split(' ');
    graus.set(a, (graus.get(a) || 0) + 1);
    graus.set(b, (graus.get(b) || 0) + 1);
  }
  const v = [...graus.values()].sort((x, y) => x - y);
  const q = (p) => v[Math.floor(p * v.length)] ?? 0;
  console.log(
    `  \x1b[1m${tipo.padEnd(11)}\x1b[0m ${String(pares.size).padStart(5)} pares · ${peso} citações · ` +
      `${nos.size} corpos (${cobertura.toFixed(1)}% do céu) · grau MED ${q(0.5)} · P90 ${q(0.9)} · máx ${v.at(-1) ?? 0}`
  );
  return { pares: pares.size, nos: nos.size, cobertura };
}

console.log(`\n\x1b[1mP6 — as duas relações DIRIGIDAS\x1b[0m`);
console.log(
  `  varridos: ${citacoesVistas} caminhos citados · ${importsVistos} imports relativos · ${foraDoCeu} não resolveram para corpo do céu`
);
const medida = { REFERENCES: relatar('REFERENCES'), IMPORTS: relatar('IMPORTS') };

console.log(
  `\n  \x1b[2mcomparação: CO_EDITED cobre 85,1% do céu e SIMILAR_TO cobre 100% — mas nenhuma das duas tem SETA.\x1b[0m`
);
for (const tipo of ['REFERENCES', 'IMPORTS']) {
  if (medida[tipo].pares === 0) {
    console.log(
      `  \x1b[31m⚠ ${tipo} não produziu aresta nenhuma neste corpus — a relação nasceria vazia.\x1b[0m`
    );
  }
}

if (SO_MEDIR) process.exit(0);

// ─────────────────────────────────────────────────────── 4. escrita
const asOf = new Date().toISOString().slice(0, 10);
await cypher(`CREATE CONSTRAINT astro_source IF NOT EXISTS FOR (a:${ROTULO}) REQUIRE a.source IS UNIQUE`);

for (const tipo of ['REFERENCES', 'IMPORTS']) {
  const lista = [...arestas[tipo]].map(([chave, peso]) => {
    const [a, b] = chave.split(' ');
    return { a, b, peso };
  });
  if (!lista.length) {
    console.log(`  ${tipo}: nada a escrever`);
    continue;
  }
  /*
   * ⚠️ Apaga as do GRUPO antes de escrever. Citação some quando alguém edita o arquivo, e sem a
   * limpeza a aresta velha ficaria para sempre — um grafo que só cresce descreve o passado, não o
   * corpus. É a mesma razão pela qual o overlay do servidor REMOVE o campo antes de reaplicar.
   */
  await cypher(`MATCH ()-[r:${tipo} {group_id: $g, corpus: $c}]->() DELETE r`, { g: GRUPO, c: CORPUS });
  for (let i = 0; i < lista.length; i += 2000) {
    await cypher(
      `UNWIND $e AS x
       MERGE (a:${ROTULO} {source: x.a}) ON CREATE SET a.group_id = $g, a.corpus = $c
       MERGE (b:${ROTULO} {source: x.b}) ON CREATE SET b.group_id = $g, b.corpus = $c
       MERGE (a)-[r:${tipo}]->(b)
       SET r.peso = x.peso, r.as_of = $asOf, r.group_id = $g, r.corpus = $c`,
      { e: lista.slice(i, i + 2000), g: GRUPO, c: CORPUS, asOf }
    );
  }
  console.log(`\x1b[1mescrito\x1b[0m  ${lista.length} ${tipo} (as_of=${asOf})`);
}

/*
 * ⚠️ A conferência é FILTRADA PELO CORPUS. Sem o filtro ela devolvia 452 REFERENCES rodando contra
 * o fixture — os números do céu VIVO, que continua no banco ao lado. Um relatório que fecha com a
 * contagem do outro corpus é pior que nenhum: ele confirma o que não aconteceu.
 */
const conf = await cypher(
  `MATCH (a:${ROTULO} {corpus: $c}) WITH count(a) AS corpos
   OPTIONAL MATCH ()-[r:REFERENCES {corpus: $c}]->() WITH corpos, count(r) AS refs
   OPTIONAL MATCH ()-[i:IMPORTS {corpus: $c}]->() RETURN corpos, refs, count(i) AS imps`,
  { c: CORPUS }
);
const [corpos, refs, imps] = conf.data.values[0];
console.log(`\n  céu: ${corpos} :${ROTULO} · ${refs} REFERENCES · ${imps} IMPORTS`);
console.log(
  `  ⚠️ rode \x1b[1mscripts/vizinhanca.mjs\x1b[0m em seguida — a rede da seleção lê o snapshot, não o banco.`
);
