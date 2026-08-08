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
import { entityPhysics, classificar, fenomenos } from '../src/space/entity-physics.js';
import { SUPERFICIE, superficieDe, AUSENTES_NA_TABELA } from '../src/space/superficies.js';

const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';

const graph = await fetch(`${SPATIA}/api/graph`).then((r) => r.json()).catch(() => null);
if (!graph) {
  console.error(`sem resposta de ${SPATIA}/api/graph — suba o ./serve.py primeiro.`);
  process.exit(1);
}

// A dominância é contexto e vem da CONTENÇÃO, não do grafo — recalculada como a cena faz.
const porSistema = new Map();
for (const n of graph.nodes) {
  if (n.type !== 'file') continue;
  const dir = n.dir || n.repo || '';
  const atual = porSistema.get(dir);
  if (!atual || (n.chunks || 0) > (atual.chunks || 0)) porSistema.set(dir, n);
}
const dominantes = new Set([...porSistema.values()].map((n) => n.id));

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

console.log(`\x1b[1mCENSO DE SUPERFÍCIES\x1b[0m  ${corpos.length} corpos · corpus ${graph.corpus?.collection}\n`);

console.log('\x1b[1mCLASSE (ontologia nova)\x1b[0m');
for (const [k, n] of [...porClasse].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(18)} ${String(n).padStart(4)}  ${'█'.repeat(Math.ceil((n / corpos.length) * 40))}`);
}

console.log('\n\x1b[1mPELE que cada uma recebe\x1b[0m');
/*
 * ⚠️ **Ausência DECLARADA não é o mesmo que classe vazia**, e confundir as duas foi o primeiro
 * resultado deste script: ele acusou `station`, `pulsar` e `nebula` como defeito quando as três
 * estão fora da tabela DE PROPÓSITO, cada uma com o motivo escrito em `AUSENTES_NA_TABELA`. O que a
 * regra do catálogo proíbe é a pele roteada que ninguém veste — não a pele que a tabela recusou.
 */
let vazias = 0;
for (const nome of Object.values(SUPERFICIE)) {
  const n = porSuperficie.get(nome) || 0;
  const pct = ((n / corpos.length) * 100).toFixed(1);
  if (n === 0 && AUSENTES_NA_TABELA[nome]) {
    console.log(`  \x1b[2m${nome.padEnd(12)}    —  fora da tabela: ${AUSENTES_NA_TABELA[nome].slice(0, 64)}…\x1b[0m`);
  } else if (n === 0 && nome !== SUPERFICIE.NENHUMA) {
    vazias++;
    console.log(`  \x1b[31m${nome.padEnd(12)} ${String(n).padStart(4)}  ← ROTEADA E VAZIA\x1b[0m`);
  } else {
    console.log(`  ${nome.padEnd(12)} ${String(n).padStart(4)}  ${pct.padStart(5)}%  ${'█'.repeat(Math.ceil((n / corpos.length) * 40))}`);
  }
}

if (semPele.length) {
  console.log(`\n  ${semPele.length} corpos sem pele — asteroide fica esfera lisa até existir a pele dele, e isso é decisão`);
}

console.log(
  vazias
    ? `\n\x1b[31m✗ ${vazias} pele(s) roteadas nascem vazias.\x1b[0m Classe sem população é a armadilha do censo-corpus §3: ela declara uma feição que o céu nunca desenha.`
    : `\n\x1b[32m✓ nenhuma pele roteada nasce vazia\x1b[0m — toda linha da tabela tem corpo que a exerce, e as ausências têm motivo escrito.`
);
process.exit(vazias ? 1 : 0);
