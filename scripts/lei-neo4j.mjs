#!/usr/bin/env node
/**
 * LEI Nº 1 — o Neo4j muda o BRILHO, nunca a CLASSE **e nunca o LUGAR**. Provado por perturbação.
 *
 * | § | a pergunta |
 * |---|---|
 * | 1 | o grafo pode trocar família, tipo, porte, fenômeno ou escala de um corpo? |
 * | 2 | o grafo pode mover um corpo? (`posicao-canonica.js`, as seis grandezas) |
 * | 3 | `graph.js` delega a posição, ou recalculou por fora? |
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
import { readFile } from 'node:fs/promises';
import { entityPhysics, classificar, fenomenos, dominanteDe } from '../src/space/entity-physics.js';
import { posicaoCanonica } from '../src/space/posicao-canonica.js';

const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';

/** Os valores que uma dimensão vinda do grafo pode assumir, incluindo a ausência. */
const VALORES = [null, 0, 0.001, 0.5, 0.999, 1];
/** As dimensões que o Neo4j alimenta. Nenhuma delas pode aparecer numa decisão de classe. */
const DO_GRAFO = ['centrality', 'usage', 'connectivity'];

const graph = await fetch(`${SPATIA}/api/graph`)
  .then((r) => r.json())
  .catch(() => null);
if (!graph) {
  console.error(`sem resposta de ${SPATIA}/api/graph — suba o ./serve.py primeiro.`);
  process.exit(1);
}

/** A assinatura de identidade de um corpo: o que NÃO pode mudar. */
const assinatura = (node, extra) => {
  const fisica = entityPhysics({ ...node, ...extra }, { dominante: node.__dominante === true });
  const c = classificar(fisica, node);
  const fen = fenomenos(fisica, node)
    .map((f) => f.tipo)
    .sort()
    .join(',');
  return `${c.familia}|${c.tipo}|${c.porte || ''}|${fen}|${fisica.scale}|${fisica.chunks}`;
};

/*
 * A dominância é contexto, e ela vem da contenção — não do grafo.
 *
 * ⚠️ Era transcrita aqui com um `>` estrito, que diverge da cena no EMPATE (ela desempata pelo
 * menor `id`). Um teste de fidelidade que recalcula a regra por conta própria testa a sua cópia,
 * não o céu — e no fixture isso já trocava o dominante de um sistema. `dominanteDe` é importada.
 */
const porSistema = new Map();
for (const n of graph.nodes) {
  if (n.type !== 'file') continue;
  const dir = n.dir || '';
  if (!porSistema.has(dir)) porSistema.set(dir, []);
  porSistema.get(dir).push(n);
}
for (const v of porSistema.values()) dominanteDe(v).__dominante = true;

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
  console.log(
    `\n\x1b[31m✗ ${violacoes.length} VIOLAÇÕES — uma dimensão do grafo está decidindo identidade\x1b[0m`
  );
  for (const v of violacoes.slice(0, 8)) {
    console.log(`  ${v.source}`);
    console.log(`    ${v.dim} = ${v.valor}:  ${v.base}  →  \x1b[31m${v.perturbada}\x1b[0m`);
  }
  if (violacoes.length > 8) console.log(`  … e mais ${violacoes.length - 8}`);
  console.log(`\n  \x1b[33mUm container caindo faria estes corpos trocarem de identidade.\x1b[0m`);
  process.exit(1);
}

console.log(
  `\n\x1b[32m✓ a lei vale\x1b[0m  nenhuma dimensão do grafo altera família, tipo, porte, fenômeno ou escala.`
);
console.log(`  \x1b[2mo grafo pode cair entre dois quadros: o céu não se reclassifica.\x1b[0m`);

/*
 * ═══════════════════════════════════════════════════════════ §2 — e nunca a COORDENADA
 *
 * A lei nº 1 tem uma segunda metade, e ela custa mais caro que a primeira quando falha em silêncio:
 * o grafo muda o brilho, nunca a classe **e nunca o lugar**. Classe errada é uma forma estranha;
 * coordenada movida é o `README.md` deixando de valer — *"o mesmo conhecimento cai sempre no mesmo
 * lugar"* — e o operador perdendo a capacidade de achar um arquivo onde o deixou.
 *
 * ⚠️ **Isto é perturbação, não leitura**: `posicaoCanonica` é chamada com a física real e depois com
 * cada dimensão do grafo varrida de `null` a 1, e a saída INTEIRA (as seis grandezas, com as chaves)
 * tem de sair idêntica. Pega o caminho indireto — uma dimensão entrando numa terceira grandeza que
 * o raio leia — que uma varredura por nome não pegaria.
 *
 * ⭑ **O `hash` de mentira é legítimo AQUI, e o motivo é o que se está provando.** A lei é sobre
 * INVARIÂNCIA, não sobre os valores do hash: qualquer hash determinístico serve, e um que dependa
 * de tudo o que recebe ainda acusa se alguém enfiar uma dimensão do grafo na ENTRADA dele. O hash
 * real mora em `graph.js` porque a semente de toda feição por nó tem de sair do mesmo lugar, e
 * importá-lo aqui arrastaria o `three` para dentro do oráculo.
 */
const hashDeProva = (texto, sal = 0) => {
  let v = 2166136261 ^ sal;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) {
    v ^= s.charCodeAt(i);
    v = Math.imul(v, 16777619);
  }
  return ((v >>> 0) % 100000) / 100000;
};

/** A saída inteira, chaves incluídas: campo novo no retorno também é divergência. */
const lugar = (node, extra) =>
  JSON.stringify(
    Object.entries(posicaoCanonica({ ...node, ...extra }, hashDeProva)).sort(([a], [b]) => (a < b ? -1 : 1))
  );

const desvios = [];
let provasDeLugar = 0;
for (const node of corpos) {
  const base = lugar(node, {});
  for (const dim of DO_GRAFO) {
    for (const valor of VALORES) {
      provasDeLugar++;
      if (lugar(node, { [dim]: valor }) !== base) {
        desvios.push({ source: node.source, dim, valor });
      }
    }
  }
}

console.log(`\n\x1b[1m§2 — o grafo nunca move um corpo\x1b[0m`);
console.log(`  perturbações testadas: ${provasDeLugar}`);

if (desvios.length) {
  console.log(
    `\n\x1b[31m✗ ${desvios.length} VIOLAÇÕES — uma dimensão do grafo está decidindo POSIÇÃO\x1b[0m`
  );
  for (const d of desvios.slice(0, 8)) console.log(`  ${d.source}  ${d.dim} = ${d.valor}`);
  if (desvios.length > 8) console.log(`  … e mais ${desvios.length - 8}`);
  console.log(
    `\n  \x1b[33mO mesmo arquivo estaria em X às 10h e em Y às 15h. A cena deixa de ser mapa.\x1b[0m`
  );
  process.exit(1);
}
console.log(
  `\x1b[32m✓ a coordenada é surda ao grafo\x1b[0m  as seis grandezas saem idênticas nas ${VALORES.length} varreduras.`
);

/*
 * ═══════════════════════════════════════════════════════════ §3 — e a fuga por FORA do módulo
 *
 * A §2 prova a derivação; ela não prova que a cena a USA. `graph.js` podia recalcular a posição
 * por conta própria e a perturbação continuaria verde sobre um módulo que ninguém chama — é a
 * mesma fuga que `lei-residentes.mjs` fecha (a rota que alcança o registro do kernel por fora).
 *
 * São três perguntas, e as três falham para o lado seguro.
 *
 * ☠️ **A régua é a CHAMADA, nunca a menção.** A linha de `import` cita `posicaoCanonica` mesmo com
 * o `makeOrbit` trocado por seis literais, então as importações saem antes da varredura.
 *
 * ⚠️ **A segunda é o outro lado da mesma fuga:** delegar E recalcular ao lado. As cinco grandezas
 * DERIVADAS não podem ser escritas como chave de objeto no dono. `recency` fica fora da lista de
 * propósito — ela é campo do servidor, e o dono legitimamente a repassa para a lua, que herda a
 * data do pai por não ter uma própria.
 */
const DONO = new URL('../src/space/graph.js', import.meta.url);
const bruto = await readFile(DONO, 'utf8');
const fonte = bruto
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/^\s*import\b.*$/gm, '');

/** dimensão → o motivo pelo qual ela pode aparecer no dono da posição. Vazio é o estado correto. */
const MOTIVO_NO_DONO = Object.freeze({});
/** As grandezas que o módulo DERIVA. Quem as escreve por literal aqui está recalculando por fora. */
const DERIVADAS = ['radius', 'inclination', 'phase', 'speed', 'wobble'];

/*
 * ☠️ **O HOMÔNIMO, e ele é o motivo de esta tabela existir em vez de um `speed` na lista de exceção.**
 *
 * `tune.speed` é o multiplicador GLOBAL do painel de afinação — o mesmo nome, outra grandeza, e a
 * regra desta base é separar homônimo à mão em vez de varrer o nome. Uma exceção larga (*"`speed`
 * pode"*) devolveria a fuga inteira: `speed: p.speed * 2` passaria.
 *
 * O recorte é por LINHA EXATA, e a linha declarada tem de continuar existindo — tabela que aponta
 * para código que saiu é acusada, senão a exceção sobrevive ao motivo dela.
 */
const HOMONIMOS = Object.freeze({
  'const tune = { speed: 1, moonSize: 1, moonSpeed: 1 };':
    'multiplicador global da afinação, não a grandeza do corpo — `advance` o lê por quadro',
});

const infiltradas = DO_GRAFO.filter((d) => !MOTIVO_NO_DONO[d] && new RegExp(`\\b${d}\\b`).test(fonte));
const orfas = Object.keys(MOTIVO_NO_DONO).filter((d) => !new RegExp(`\\b${d}\\b`).test(fonte));
const homonimosSumidos = Object.keys(HOMONIMOS).filter((linha) => !fonte.includes(linha));
const semHomonimos = Object.keys(HOMONIMOS).reduce((s, linha) => s.split(linha).join(''), fonte);
const recalculadas = DERIVADAS.filter((k) => new RegExp(`(^|[{,;\\s])${k}\\s*:`, 'm').test(semHomonimos));

console.log(`\n\x1b[1m§3 — o dono da posição não conhece o grafo\x1b[0m`);
if (!/posicaoCanonica\s*\(/.test(fonte)) {
  console.log(`\n\x1b[31m✗ graph.js não CHAMA posicaoCanonica — a §2 está provando um módulo morto\x1b[0m`);
  console.log(`  \x1b[33mCitar o nome numa importação não é delegar.\x1b[0m`);
  process.exit(1);
}
if (homonimosSumidos.length) {
  console.log(`\n\x1b[31m✗ HOMONIMOS é tabela velha — a linha declarada não está mais em graph.js:\x1b[0m`);
  for (const l of homonimosSumidos) console.log(`  ${l}`);
  process.exit(1);
}
if (recalculadas.length) {
  console.log(
    `\n\x1b[31m✗ graph.js escreve ${recalculadas.join(', ')} por literal — recalculou por fora\x1b[0m`
  );
  console.log(
    `  \x1b[33mDelegar e recalcular ao lado deixa as duas livres para divergir em silêncio.\x1b[0m`
  );
  process.exit(1);
}
if (infiltradas.length) {
  console.log(`\n\x1b[31m✗ ${infiltradas.join(', ')} aparece(m) em src/space/graph.js\x1b[0m`);
  console.log(`  \x1b[33mProve à mão que não alcança a coordenada, e declare em MOTIVO_NO_DONO.\x1b[0m`);
  process.exit(1);
}
if (orfas.length) {
  console.log(`\n\x1b[31m✗ MOTIVO_NO_DONO é tabela velha: ${orfas.join(', ')} não está mais lá\x1b[0m`);
  process.exit(1);
}
console.log(
  `\x1b[32m✓ graph.js delega\x1b[0m  chama posicaoCanonica, não recalcula ${DERIVADAS.length} grandezas e não cita ${DO_GRAFO.join(' · ')}.`
);
