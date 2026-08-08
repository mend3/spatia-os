#!/usr/bin/env node
/**
 * LEI Nº 1 — o Neo4j muda o BRILHO, nunca a CLASSE. Este script PROVA isso, por perturbação.
 *
 *     node scripts/lei-neo4j.mjs        # sai 0 se a lei vale para os 1 636 corpos
 *
 * ## Por que ele existe
 *
 * `docs/integracao-neo4j.md` §1 declara a lei, e o `entity-physics.js` a repete em comentário. Mas
 * **esta base já pagou CINCO vezes por invariante declarada e não implementada** — a lua sem
 * superfície, a força do vínculo, a expressão do pulso, o `chegaPleno`, o motivo de upstream. Em
 * todos, a frase estava escrita e ninguém a lia.
 *
 * A lei do Neo4j é a que tem a pior consequência de todas se falhar em silêncio: um container
 * caindo faria **corpos trocarem de identidade**, e o usuário aprenderia que a forma não significa
 * nada. Ela não pode depender de alguém lembrar.
 *
 * ## O método: perturbar, e exigir classe idêntica
 *
 * Para cada corpo do céu, `classificar()` é chamada com a física real e depois com a física
 * perturbada nas dimensões que vêm do grafo (`centrality`, `usage`, `connectivity`), varridas de
 * `null` a 1. **Qualquer divergência de família, tipo ou porte é uma violação.**
 *
 * ⚠️ Isto é mais forte que ler o código à procura de `fisica.usage`: um leitor humano precisa
 * lembrar de olhar de novo depois de cada edição, e a perturbação não precisa — ela testa o
 * COMPORTAMENTO, e pega inclusive o caminho indireto (uma dimensão do grafo entrando numa terceira
 * grandeza que a classificação lê). Foi assim que a §"varra o COMPORTAMENTO, não a string" do
 * handoff descreveu o mesmo erro na galáxia.
 */
import { entityPhysics, classificar, fenomenos } from '../src/space/entity-physics.js';

const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';

/** Os valores que uma dimensão vinda do grafo pode assumir, incluindo a ausência. */
const VALORES = [null, 0, 0.001, 0.5, 0.999, 1];
/** As dimensões que o Neo4j alimenta. Nenhuma delas pode aparecer numa decisão de classe. */
const DO_GRAFO = ['centrality', 'usage', 'connectivity'];

const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json()).catch(() => null);
if (!graph) {
  console.error(`sem resposta de ${SPATIA}/api/graph — suba o ./serve.py primeiro.`);
  process.exit(1);
}

/** A assinatura de identidade de um corpo: o que NÃO pode mudar. */
const assinatura = (node, extra) => {
  const fisica = entityPhysics({ ...node, ...extra }, { dominante: node.__dominante === true });
  const c = classificar(fisica, node);
  const fen = fenomenos(fisica, node).map((f) => f.tipo).sort().join(',');
  return `${c.familia}|${c.tipo}|${c.porte || ''}|${fen}|${fisica.scale}|${fisica.mass}`;
};

// A dominância é contexto, e ela vem da contenção — não do grafo. Recalculá-la aqui mantém o
// teste fiel ao que o céu faz, em vez de testar uma física sem sistema.
const porSistema = new Map();
for (const n of graph.nodes) {
  if (n.type !== 'file') continue;
  const dir = n.dir || '';
  const atual = porSistema.get(dir);
  if (!atual || (n.chunks || 0) > (atual.chunks || 0)) porSistema.set(dir, n);
}
for (const n of porSistema.values()) n.__dominante = true;

const corpos = graph.nodes.filter((n) => n.type === 'file');
const violacoes = [];
let provas = 0;

for (const node of corpos) {
  const base = assinatura(node, {});
  for (const dim of DO_GRAFO) {
    for (const valor of VALORES) {
      provas++;
      const perturbada = assinatura(node, { [dim]: valor });
      if (perturbada !== base) {
        violacoes.push({ source: node.source, dim, valor, base, perturbada });
      }
    }
  }
}

console.log(`\x1b[1mLEI Nº 1 — o grafo muda o brilho, nunca a classe\x1b[0m`);
console.log(`  corpos: ${corpos.length} · dimensões do grafo: ${DO_GRAFO.join(', ')}`);
console.log(`  perturbações testadas: ${provas}`);

if (violacoes.length) {
  console.log(`\n\x1b[31m✗ ${violacoes.length} VIOLAÇÕES — uma dimensão do grafo está decidindo identidade\x1b[0m`);
  for (const v of violacoes.slice(0, 8)) {
    console.log(`  ${v.source}`);
    console.log(`    ${v.dim} = ${v.valor}:  ${v.base}  →  \x1b[31m${v.perturbada}\x1b[0m`);
  }
  if (violacoes.length > 8) console.log(`  … e mais ${violacoes.length - 8}`);
  console.log(`\n  \x1b[33mUm container caindo faria estes corpos trocarem de identidade.\x1b[0m`);
  process.exit(1);
}

console.log(`\n\x1b[32m✓ a lei vale\x1b[0m  nenhuma dimensão do grafo altera família, tipo, porte, fenômeno ou escala.`);
console.log(`  \x1b[2mo grafo pode cair entre dois quadros: o céu não se reclassifica.\x1b[0m`);
