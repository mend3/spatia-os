/**
 * CENSO DAS MORFOLOGIAS — o que o céu está desenhando agora, medido no corpus vivo.
 *
 * Três eixos, porque eles NÃO são a mesma pergunta:
 *   1. CLASSE   (`catalog.classify`)  — o que o corpo É.
 *   2. PELE     (`solver.resolveBody`) — o que ele DESENHA de perto.
 *   3. `MORPHOLOGY_BY_KIND`           — a morfologia declarada por tipo de arquivo.
 * Mais os MODIFICADORES (anel, envoltório, disco de detritos), que se anexam a qualquer corpo.
 *
 * Roda contra o servidor no ar: `node scripts/censo-morfologias.mjs`.
 *
 * ## ⚠️ Este censo mede COBERTURA DE TIPO. A de PARÂMETRO só roda no browser.
 *
 * A diferença está em `docs/cobertura.md`, e ela decide o que a leitura autoriza concluir: um tipo
 * presente prova que o caminho DESENHA, não que o shader foi exercitado. Medido em 2026-08-07, o
 * fixture cobria todos os tipos com quase todos os parâmetros colados no piso.
 *
 * A metade paramétrica precisa das funções `*Params` de cada pele, que importam `three` — o Node
 * deste projeto não resolve o import (ele vem do `importmap` da página). Cole no console da cena:
 *
 *     const [sis, sup, cm] = await Promise.all(['sistemas', 'superficies', 'comet']
 *       .map(m => import(`/src/space/${m}.js`)));
 *     const g = await (await fetch('/api/graph')).json();
 *     const ix = sis.indexar(g);
 *     const v = g.nodes.filter(n => ix.identidadeDe(n)?.pele === sup.SUPERFICIE.COMETA)
 *                      .map(n => cm.cometParams(n).tail);
 *     [Math.min(...v), Math.max(...v)];   // piso 1,98 · teto 9,0
 *
 * Trocando o módulo e o campo, a mesma forma serve para as outras peles. O que interessa é a
 * pergunta: o valor MEDIDO varre a faixa que o código permite, ou mora num extremo dela?
 *
 * ⚠️ **NÃO meça luas assim.** `moonsOf` precisa do RAIO ORBITAL, que nasce em `graph.js:load` a
 * partir da recência e NÃO existe no payload do servidor — chamá-lo no nó cru devolve zero lua em
 * qualquer corpus, e em 2026-08-07 isso me fez declarar morto um sistema que tinha 197 luas no ar.
 * Quem responde é a cena: `window.espatial.moons()`.
 */
import { classify, MORPHOLOGY_BY_KIND, RING_BY_STATE } from '../src/space/catalog.js';
import { resolveBody, MODIFIER } from '../src/space/solver.js';
import { SUPERFICIE } from '../src/space/superficies.js';
import { indexar } from '../src/space/sistemas.js';
import { ceuServido } from './lib/ceu-servido.mjs';

const BASE = 'http://127.0.0.1:8787';
const graph = await ceuServido(BASE, { porque: 'as classes, peles e morfologias' });
const dirty = await (await fetch(`${BASE}/api/dirty`)).json();
const sujos = new Map(Object.entries(dirty.files || {}));
// O `source` do céu tem a raiz do repo na frente; o `git status` não.
const estadoDe = (source) =>
  sujos.get(
    String(source ?? '')
      .split('/')
      .slice(1)
      .join('/')
  );

const conta = (mapa, chave) => mapa.set(chave, (mapa.get(chave) || 0) + 1);
const tabela = (titulo, mapa, total) => {
  console.log(`\n${titulo}`);
  const linhas = [...mapa].sort((a, b) => b[1] - a[1]);
  for (const [chave, n] of linhas) {
    const pct = ((n / total) * 100).toFixed(1).padStart(5);
    console.log(
      `  ${String(chave).padEnd(16)} ${String(n).padStart(5)}  ${pct}%  ${'█'.repeat(Math.round((n / total) * 40))}`
    );
  }
};

const classes = new Map();
const peles = new Map();
const kinds = new Map();
const modificadores = new Map();
const aneisPorFamilia = new Map();
const recusas = new Map();
let comCoroaPossivel = 0;

/*
 * ⚠️ **A PELE sai da ONTOLOGIA; o MODIFICADOR sai do solver.** São duas perguntas com dois donos, e
 * elas moravam na mesma chamada. Convergidas as cenas (T-39), `resolveBody().surface` não tem
 * leitor no `src/`: contá-la aqui descreveria um céu que ninguém desenha.
 */
const indice = indexar(graph);

for (const node of graph.nodes) {
  const estado = estadoDe(node.source);
  const klass = classify(node, { dirty: estado });
  const decisao = resolveBody(node, { dirty: estado });
  const pele = indice.identidadeDe(node)?.pele ?? SUPERFICIE.NENHUMA;
  conta(classes, klass?.id ?? '(nenhuma)');
  conta(peles, pele);
  if (node.type === 'file')
    conta(kinds, `${node.kind ?? 'other'} → ${MORPHOLOGY_BY_KIND[node.kind]?.body ?? 'estrela'}`);
  for (const m of decisao?.modifiers ?? []) {
    conta(modificadores, m);
    if (m === MODIFIER.RING) conta(aneisPorFamilia, `${estado} → ${RING_BY_STATE[estado]?.family ?? '?'}`);
  }
  for (const r of decisao?.rejected ?? []) conta(recusas, `${r.feature}`);
  if (pele !== SUPERFICIE.NENHUMA) comCoroaPossivel += 1;
}

const total = graph.nodes.length;
console.log(
  `corpus: ${total} nós · ${graph.stats?.files ?? '?'} arquivos · ${graph.stats?.chunks ?? '?'} chunks`
);
console.log(`sujos no git (raiz ${dirty.root}): ${sujos.size}`);
tabela('CLASSE — o que o corpo É (catalog.classify)', classes, total);
tabela('PELE — o que ele desenha de perto (sistemas.identidadeDe)', peles, total);
tabela('MORFOLOGIA POR KIND — a declaração por tipo de arquivo', kinds, total);
tabela('MODIFICADORES — anexáveis a qualquer corpo', modificadores, total);
if (aneisPorFamilia.size) tabela('ANEL por estado do git → família', aneisPorFamilia, total);
tabela('RECUSAS do solver — o que foi pedido e negado', recusas, total);
console.log(`\ncorpos com pele desenhável: ${comCoroaPossivel} de ${total}`);
