#!/usr/bin/env node
/**
 * VIZINHANÇA — materializa, por corpo, os vínculos LATERAIS que a seleção vai desenhar.
 *
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/vizinhanca.mjs          # mede e escreve
 *     NEO4J_USER=… NEO4J_PASSWORD=… node scripts/vizinhanca.mjs --medir  # só mede
 *
 * É a população do §5 de `docs/integracao-neo4j.md` — *"a teia só existe na seleção"* — colocada
 * onde o renderer possa lê-la sem falar com o banco. Ele escreve `.cache/vizinhanca.json`, o
 * servidor anexa aos nós ao servir a topologia, e o céu recebe a lista pronta: é a **lei nº 2**, a
 * mesma que já vale para `centrality` e `usage`.
 *
 * ## O que ele NÃO faz: comparar tipos entre si
 *
 * `SIMILAR_TO` tem `score` (0,51–0,97) e `CO_EDITED` tem `peso` (1–21 commits). Ordenar os dois na
 * mesma lista seria comparar cosseno com contagem — o tipo de número composto que esta base já
 * refutou ("tamanho com ofuscação", `medicoes-2026-08-07` §3.2). Aqui cada tipo é ordenado DENTRO
 * dele mesmo, e o corte final é um **rodízio**: um de cada tipo por vez, do mais forte para o mais
 * fraco. Nenhum tipo é comparado com outro, e nenhum tipo é silenciado pelo teto.
 *
 * ## O teto, e por que ele é 28
 *
 * `src/space/links.js` já mediu quantos arcos cabem na tela antes de o desenho *"virar teia de novo,
 * em miniatura"*: **28**. É a mesma tela e o mesmo olho, então o número é herdado em vez de
 * reinventado — e é o SCRIPT que corta, não o renderer, para que a legenda e o desenho saiam da
 * mesma lista. Duas listas divergiriam no dia em que o teto mordesse, sem erro nenhum.
 *
 * ⚠️ **E o que foi cortado viaja junto.** `total` traz o grau REAL por tipo. Sem ele, um corpo com
 * 113 vizinhos mostraria 28 e a tela afirmaria que são todos — truncamento silencioso lê como
 * "isto é tudo o que existe".
 *
 * ## ⚠️ `TOUCHED` fica de fora, e não é por estar vazio
 *
 * A legenda do §3.2.2 lista cinco vínculos, e `TOUCHED` é um deles — mas ele liga `Run → Astro`:
 * **as duas pontas não são corpos.** Desenhá-lo como linha entre dois astros afirmaria um fato que
 * ninguém mediu (dois arquivos abertos pela mesma execução não são "usados um pelo outro"). Ele
 * entra nesta cena quando houver decisão sobre o que a outra ponta É — e a população dele hoje é 0
 * de qualquer forma, então nada se perde além da ilusão de completude.
 *
 * `REFERENCES` e `IMPORTS` (o P6) já são consultados aqui: quando existirem, aparecem sozinhos.
 */
import fs from 'node:fs';

const BASE = process.env.NEO4J_HTTP || 'http://127.0.0.1:7474';
const USER = process.env.NEO4J_USER;
const PASS = process.env.NEO4J_PASSWORD;
const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const SO_MEDIR = process.argv.includes('--medir');
const SAIDA = '.cache/vizinhanca.json';

/** Herdado de `links.js` (`MAX_LINKS`), que o mediu olhando a tela. Ver o cabeçalho. */
const TETO = 28;

/**
 * Os tipos que ligam CORPO a CORPO, com a unidade de força de cada um.
 *
 * `simetrica` não é detalhe de modelagem: o `CO_EDITED` é gravado numa direção só porque o par foi
 * ordenado alfabeticamente (`vinculos.mjs`), então a seta dele não significa nada. Já a do
 * `SIMILAR_TO` significa — "estou entre os k mais parecidos de quem" é diferente de o inverso —, e
 * um desenho que apagasse essa distinção afirmaria reciprocidade onde não há.
 */
const TIPOS = {
  SIMILAR_TO: { propriedade: 'score', unidade: 'score', simetrica: false },
  CO_EDITED: { propriedade: 'peso', unidade: 'commits', simetrica: true },
  REFERENCES: { propriedade: 'peso', unidade: 'citações', simetrica: false },
  IMPORTS: { propriedade: 'peso', unidade: 'imports', simetrica: false },
};

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

// ─────────────────────────────────────────────────────── 1. o céu, para não desenhar fantasma
const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json());
if (!graph.corpus) {
  console.error('o /api/graph não publicou `corpus` — servidor velho?');
  process.exit(1);
}
const doCeu = new Set(graph.nodes.filter((n) => n.type === 'file').map((n) => n.source));
console.log(`\x1b[1mcorpus\x1b[0m  ${graph.corpus.collection} · ${doCeu.size} corpos no céu`);

// ─────────────────────────────────────────────────────── 2. as arestas, nas DUAS pontas
/*
 * O padrão não-direcionado devolve cada aresta DUAS vezes, uma por ponta — e é exatamente o que se
 * quer: a vizinhança é por corpo, e o vizinho de b é a. `sentido` preserva a seta de quem a tem.
 */
const tipos = Object.keys(TIPOS).join('|');
const dados = await cypher(
  `MATCH (a:Astro)-[r:${tipos}]-(b:Astro)
   RETURN a.source AS de, b.source AS para, type(r) AS tipo,
          CASE WHEN startNode(r) = a THEN 'saida' ELSE 'entrada' END AS sentido,
          coalesce(r.score, r.peso) AS valor`
);
const linhas = dados.data.values;
console.log(`\x1b[1marestas\x1b[0m   ${linhas.length} pontas lidas (cada aresta aparece nas duas)`);

// ─────────────────────────────────────────────────────── 3. vizinhança por corpo
/** `de → tipo → para → {valor, sentido}`. O mapa aninhado é o que funde a ida e a volta. */
const porCorpo = new Map();
let foraDoCeu = 0;
for (const [de, para, tipo, sentido, valor] of linhas) {
  if (!doCeu.has(de) || !doCeu.has(para)) { foraDoCeu++; continue; }
  if (!porCorpo.has(de)) porCorpo.set(de, new Map());
  const porTipo = porCorpo.get(de);
  if (!porTipo.has(tipo)) porTipo.set(tipo, new Map());
  const alvos = porTipo.get(tipo);
  const antes = alvos.get(para);
  if (!antes) {
    alvos.set(para, { valor, sentido });
  } else {
    // A mesma dupla nos dois sentidos é RECIPROCIDADE, e ela é um fato — não uma duplicata a
    // descartar. O valor que fica é o maior: é o que o corpo afirma sobre o vizinho.
    alvos.set(para, {
      valor: Math.max(antes.valor, valor),
      sentido: antes.sentido === sentido ? sentido : 'mutuo',
    });
  }
}
if (foraDoCeu) console.log(`  ${foraDoCeu} pontas descartadas: o Neo4j conhece um corpo que este céu não tem`);

// ─────────────────────────────────────────────────────── 4. o corte, por RODÍZIO
/*
 * Um de cada tipo por vez, do mais forte para o mais fraco DENTRO do tipo. Ordenar tudo junto
 * compararia cosseno com contagem de commits; o rodízio nunca compara dois tipos entre si, e é o
 * que impede o teto de silenciar o tipo menos numeroso.
 */
function cortar(porTipo) {
  const filas = [...porTipo.entries()].map(([tipo, alvos]) => ({
    tipo,
    fila: [...alvos.entries()]
      .map(([para, v]) => ({ para, tipo, valor: v.valor, sentido: v.sentido }))
      .sort((x, y) => y.valor - x.valor),
  })).sort((a, b) => a.tipo.localeCompare(b.tipo));
  const saida = [];
  for (let volta = 0; saida.length < TETO; volta++) {
    let acrescentou = false;
    for (const f of filas) {
      if (volta >= f.fila.length) continue;
      saida.push(f.fila[volta]);
      acrescentou = true;
      if (saida.length >= TETO) break;
    }
    if (!acrescentou) break;
  }
  return saida;
}

/*
 * A força normalizada em [0,1] DENTRO do tipo, pelos extremos daquele tipo no grafo inteiro.
 *
 * ⚠️ O renderer precisa de um número comparável para modular opacidade, e ele não pode conhecer a
 * faixa de cada tipo — isso seria a faixa escrita em dois lugares, livre para divergir. Então quem
 * normaliza é quem mediu. O valor BRUTO viaja junto (`valor`), porque a legenda tem de dizer
 * "3 commits" e não "0,10".
 */
const faixa = new Map();
for (const [, porTipo] of porCorpo) {
  for (const [tipo, alvos] of porTipo) {
    for (const [, v] of alvos) {
      const f = faixa.get(tipo) || { min: Infinity, max: -Infinity };
      f.min = Math.min(f.min, v.valor);
      f.max = Math.max(f.max, v.valor);
      faixa.set(tipo, f);
    }
  }
}

const vizinhanca = {};
const graus = [];
let truncados = 0;
for (const [fonte, porTipo] of porCorpo) {
  const total = {};
  for (const [tipo, alvos] of porTipo) total[tipo] = alvos.size;
  const grau = Object.values(total).reduce((a, b) => a + b, 0);
  graus.push(grau);
  if (grau > TETO) truncados++;
  vizinhanca[fonte] = {
    v: cortar(porTipo).map((x) => {
      const f = faixa.get(x.tipo);
      const largura = f.max - f.min;
      return {
        para: x.para,
        tipo: x.tipo,
        valor: Number(x.valor.toFixed(4)),
        forca: Number((largura > 0 ? (x.valor - f.min) / largura : 1).toFixed(3)),
        sentido: x.sentido,
      };
    }),
    total,
  };
}

// ─────────────────────────────────────────────────────── 5. a medida
const q = (v, p) => [...v].sort((a, b) => a - b)[Math.floor(p * v.length)] ?? 0;
const isolados = doCeu.size - graus.length;
console.log(`\n\x1b[1mGRAU (vínculos laterais por corpo, todos os tipos)\x1b[0m`);
console.log(`  com vizinho: ${graus.length}/${doCeu.size} (${((graus.length / doCeu.size) * 100).toFixed(1)}%) · isolados ${isolados}`);
console.log(`  min ${q(graus, 0)} · MED ${q(graus, 0.5)} · P90 ${q(graus, 0.9)} · máx ${Math.max(...graus, 0)}`);
console.log(`  acima do teto de ${TETO}: \x1b[1m${truncados}\x1b[0m corpos (${((truncados / doCeu.size) * 100).toFixed(1)}%) — e o corte viaja publicado em \`total\``);
for (const [tipo, f] of [...faixa].sort()) {
  const quantos = Object.values(vizinhanca).filter((x) => x.total[tipo]).length;
  console.log(`  \x1b[1m${tipo.padEnd(11)}\x1b[0m ${String(quantos).padStart(4)} corpos · ${TIPOS[tipo].unidade} de ${f.min.toFixed(2)} a ${f.max.toFixed(2)}`);
}
const desenhados = Object.values(vizinhanca).reduce((a, x) => a + x.v.length, 0);
console.log(`\n  desenháveis: ${desenhados} vínculos em ${Object.keys(vizinhanca).length} corpos · MED ${q(Object.values(vizinhanca).map((x) => x.v.length), 0.5)} por corpo`);

if (SO_MEDIR) process.exit(0);

// ─────────────────────────────────────────────────────── 6. o snapshot
const snapshot = {
  as_of: new Date().toISOString(),
  teto: TETO,
  corpos: Object.keys(vizinhanca).length,
  vinculos: desenhados,
  // A legenda do §3.2.2 viaja com o dado: quem desenha não tem de saber que `CO_EDITED` se lê como
  // "afinidade de trabalho". Tipo novo (o P6) chega com a própria legenda, sem tocar no renderer.
  tipos: Object.fromEntries(
    [...faixa].map(([tipo, f]) => [tipo, { ...TIPOS[tipo], min: f.min, max: f.max }])
  ),
  // Por que `TOUCHED` não está aqui. Sem esta linha, a ausência dele lê como esquecimento.
  fora: { TOUCHED: 'liga Run→Astro: as duas pontas não são corpos, e desenhá-la entre astros afirmaria um fato não medido' },
  vizinhanca,
};
fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(snapshot));
const kb = (fs.statSync(SAIDA).size / 1024).toFixed(0);
console.log(`\n\x1b[1mescrito\x1b[0m  ${SAIDA} · ${snapshot.corpos} corpos · ${desenhados} vínculos · ${kb} kB`);
