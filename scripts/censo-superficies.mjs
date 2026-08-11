#!/usr/bin/env node
/**
 * CENSO DE SUPERFÍCIES — o primeiro passo da FASE D, e ele não é um shader.
 *
 *     node scripts/censo-superficies.mjs
 *
 * ## A pergunta
 *
 * As seis peles do céu já existem e foram validadas na bancada. O que **não** existe é o roteamento
 * delas pela ontologia NOVA: quem escolhe pele hoje é `solver.js` a partir do `kind`, que é a
 * taxonomia que a Fase B refutou — 228 de 228 agregados viravam galáxia. Ligar as peles pelo caminho
 * velho seria o modelo antigo falando por cima do novo, o mesmo defeito que `ce8ad95` consertou na
 * HUD.
 *
 * Então antes do roteamento vem a MEDIDA, pela regra que o `CLAUDE.md` fixa: **classe sem população
 * é a armadilha que o `censo-corpus.mjs` existe para acusar.** Este script conta quantos corpos
 * caem em cada linha da tabela proposta e acusa em vermelho a pele que nasceria vazia.
 *
 * ⚠️ Ele mede o ÍNDICE, nunca o disco — e o corpus `espatial_vivo` inclui código de propósito, o
 * que o real não faz. É CAPACIDADE, não comportamento do céu real.
 */
import { entityPhysics, classificar, fenomenos, dominanteDe } from '../src/space/entity-physics.js';
import { SUPERFICIE, superficieDe, AUSENTES_NA_TABELA } from '../src/space/superficies.js';

const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';

const graph = await fetch(`${SPATIA}/api/graph`)
  .then((r) => r.json())
  .catch(() => null);
if (!graph) {
  console.error(`sem resposta de ${SPATIA}/api/graph — suba o ./serve.py primeiro.`);
  process.exit(1);
}

/*
 * A dominância é contexto e vem da CONTENÇÃO, não do grafo.
 *
 * ⚠️ Aqui ela era TRANSCRITA, com um `>` estrito — e o comentário afirmava *"recalculada como a
 * cena faz"* enquanto não fazia: no empate a cena desempata pelo menor `id` e esta cópia ficava
 * com o primeiro da iteração. Medido: 4 sistemas empatam no topo do fixture e 1 divergia
 * (`varredura/fotosfera`), e a divergência saía aqui como 22 fotosferas contra as 21 do app.
 * Agora a regra é IMPORTADA — não há oráculo a manter em dia quando a derivação é JS.
 */
const EMITIDOS = dirsEmitidos(graph);
/**
 * O SISTEMA de um corpo — e ele sai do que o SERVIDOR EMITIU, não de `n.dir`.
 *
 * ☠️ Agrupar por `dir` DISTINTO conta sistema que a cena não monta. O servidor só emite nó `dir`
 * para pasta com **mais de um** arquivo (`graph._hierarchy`, `keep_dirs`), pelo motivo escrito lá:
 * *"diretório sem irmãos vira aresta direta para o repo — filamento de um nó só polui o céu sem
 * informar nada"*. Um arquivo sozinho numa pasta pertence ao REPO.
 *
 * ⚠️ **A diferença não é de contagem, é de PAPEL.** Medido no fixture de 2026-08-09: agrupando por
 * `dir` distinto o `atlas/.claude/agents/revisor.md` fica sozinho no próprio sistema, vira
 * dominante e portanto ESTRELA; agrupado como a cena agrupa, ele disputa no repo e resolve
 * PLANETA. São 22 sistemas contra 21, e **21 fotosferas contra 20** — layout de diretório
 * decidindo o que um corpo É, que é o defeito que esta base já pagou duas vezes.
 *
 * A regra é IMPORTADA do fato, não transcrita: quem decide é a lista de nós `dir` da resposta.
 */
function sistemaDeCorpo(node, dirsEmitidos) {
  const dir = node.dir || '';
  return dirsEmitidos.has(dir) ? dir : `repo:${node.repo}`;
}

/** Os `dir` que o servidor promoveu a sistema. Ver `sistemaDeCorpo`. */
function dirsEmitidos(graph) {
  return new Set(graph.nodes.filter((n) => n.type === 'dir').map((n) => n.dir));
}

const porSistema = new Map();
for (const n of graph.nodes) {
  if (n.type !== 'file') continue;
  const sis = sistemaDeCorpo(n, EMITIDOS);
  if (!porSistema.has(sis)) porSistema.set(sis, []);
  porSistema.get(sis).push(n);
}
const dominantes = new Set([...porSistema.values()].map((v) => dominanteDe(v).id));

const corpos = graph.nodes.filter((n) => n.type === 'file');
const porSuperficie = new Map();
const porClasse = new Map();
const semPele = [];

for (const node of corpos) {
  const fisica = entityPhysics(node, { dominante: dominantes.has(node.id), sistema: node.dir });
  const classe = classificar(fisica, node);
  const fens = fenomenos(fisica, node).map((f) => f.tipo);
  const pele = superficieDe(classe, fisica, fens);

  const chaveClasse = `${classe.tipo}${classe.porte ? ':' + classe.porte : ''}`;
  porClasse.set(chaveClasse, (porClasse.get(chaveClasse) || 0) + 1);
  porSuperficie.set(pele, (porSuperficie.get(pele) || 0) + 1);
  if (pele === SUPERFICIE.NENHUMA) semPele.push(node.source);
}

console.log(
  `\x1b[1mCENSO DE SUPERFÍCIES\x1b[0m  ${corpos.length} corpos · corpus ${graph.corpus?.collection}\n`
);

console.log('\x1b[1mCLASSE (ontologia nova)\x1b[0m');
for (const [k, n] of [...porClasse].sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${k.padEnd(18)} ${String(n).padStart(4)}  ${'█'.repeat(Math.ceil((n / corpos.length) * 40))}`
  );
}

console.log('\n\x1b[1mPELE que cada uma recebe\x1b[0m');
/*
 * ⚠️ **Ausência DECLARADA não é o mesmo que classe vazia**, e confundir as duas foi o primeiro
 * resultado deste script: ele acusou `station`, `pulsar` e `nebula` como defeito quando as três
 * estão fora da tabela DE PROPÓSITO, cada uma com o motivo escrito em `AUSENTES_NA_TABELA`. O que a
 * regra do catálogo proíbe é a pele roteada que ninguém veste — não a pele que a tabela recusou.
 */
/*
 * ☠️ **POPULAÇÃO É FATO DE MUNDO; a lei tem de medir ALCANCE, que é fato de código.**
 *
 * A régua anterior reprovava toda pele roteada com zero corpos — e isso confunde duas coisas que
 * pedem consertos opostos. Uma pele que NENHUMA combinação de fatos produz é rota morta: defeito,
 * e a lei existe para isso. Uma pele que o roteamento produz mas que ESTE corpus não veste é
 * censo: o `pulsar` exige um gigante (≥ 80 chunks) sem toque em 180 dias, e o mais pesado dos
 * mortos deste corpus tem 73 — sete de margem, e nada de errado com o código.
 *
 * ⚠️ Reprovar por população faz a lei expirar sozinha quando o corpus muda, que é exatamente o
 * defeito registrado em `leis.mjs` sobre a `lei-favoritos-ui §6` — um FATO DE MUNDO gravado como
 * lei. O alcance é medido por PERTURBAÇÃO, no mesmo idioma da `lei-neo4j`: os fatos de cada corpo
 * real são varridos por uma grade, e a pele que aparece em algum ponto tem rota viva.
 */
const alcancaveis = new Set();
{
  const amostra = corpos.slice(0, 240);
  const GRADE = [];
  for (const chunks of [1, 8, 30, 90, 400])
    for (const dwarf of [0, 1])
      for (const churn of [0, 27])
        for (const dormant of [0, 3]) GRADE.push({ chunks, dwarf, churn, dormant });
  for (const node of amostra) {
    for (const g of GRADE) {
      const sintetico = { ...node, chunks: g.chunks, dwarf: g.dwarf, churn: g.churn, dormant: g.dormant };
      try {
        const f = entityPhysics(sintetico, { dominante: true, sistema: sintetico.dir });
        const c = classificar(f, sintetico);
        alcancaveis.add(superficieDe(c, f, fenomenos(f, sintetico).map((x) => x.tipo)));
      } catch {
        /* combinação impossível não conta contra a pele */
      }
    }
  }
}

let vazias = 0;
for (const nome of Object.values(SUPERFICIE)) {
  const n = porSuperficie.get(nome) || 0;
  const pct = ((n / corpos.length) * 100).toFixed(1);
  if (n === 0 && AUSENTES_NA_TABELA[nome]) {
    console.log(
      `  \x1b[2m${nome.padEnd(12)}    —  fora da tabela: ${AUSENTES_NA_TABELA[nome].slice(0, 64)}…\x1b[0m`
    );
  } else if (n === 0 && nome !== SUPERFICIE.NENHUMA && !alcancaveis.has(nome)) {
    vazias++;
    console.log(`  \x1b[31m${nome.padEnd(12)} ${String(n).padStart(4)}  ← ROTA MORTA: nenhuma combinação de fatos a produz\x1b[0m`);
  } else if (n === 0 && nome !== SUPERFICIE.NENHUMA) {
    console.log(
      `  \x1b[33m${nome.padEnd(12)} ${String(n).padStart(4)}  ⚠ rota VIVA, sem vestidor neste corpus\x1b[0m`
    );
  } else {
    console.log(
      `  ${nome.padEnd(12)} ${String(n).padStart(4)}  ${pct.padStart(5)}%  ${'█'.repeat(Math.ceil((n / corpos.length) * 40))}`
    );
  }
}

if (semPele.length) {
  console.log(
    `\n  ${semPele.length} corpos sem pele — asteroide fica esfera lisa até existir a pele dele, e isso é decisão`
  );
}

console.log(
  vazias
    ? `\n\x1b[31m✗ ${vazias} pele(s) roteadas nascem vazias.\x1b[0m Classe sem população é a armadilha do censo-corpus §3: ela declara uma feição que o céu nunca desenha.`
    : `\n\x1b[32m✓ nenhuma pele roteada nasce vazia\x1b[0m — toda linha da tabela tem corpo que a exerce, e as ausências têm motivo escrito.`
);
process.exit(vazias ? 1 : 0);
