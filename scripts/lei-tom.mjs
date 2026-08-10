#!/usr/bin/env node
/**
 * A LEI DO TOM — quem EMITE um adjetivo tem quem o PINTE, e quem pinta tem quem emita.
 *
 *     node scripts/lei-tom.mjs        # sai 0 se as duas metades do par estiverem casadas
 *
 * ## Por que ele existe
 *
 * Tom emitido sem regra que o pinte não levanta erro nem aviso: a linha sai na cor de corpo e a
 * tela apenas DEIXA DE AFIRMAR o que o código afirmou. Sem executável, a metade que falta não é a
 * que alguém procura.
 *
 * ## As três perguntas
 *
 * | § | a pergunta | o que a ausência significa |
 * |---|---|---|
 * | 1 | todo tom aceito tem regra que o pinta? | a tela cala sobre um fato que o código afirmou |
 * | 2 | toda regra de tom tem tom que a alcance? | CSS morto — a próxima pessoa lê a regra como prova de que a feição existe |
 *
 * ⚠️ **A §2 não é simetria decorativa.** Regra sem emissor é exatamente como um leitor conclui que
 * uma feição está implementada: ele vê o seletor no CSS e para de procurar.
 *
 * | 3 | algum literal de tom foge do vocabulário? | tom inventado num call site — as §§1 e 2 não o veem, porque não há regra a faltar quando não há tom declarado |
 *
 * O vocabulário mora em `src/hud/tons.js`.
 */
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { TONS, FAMILIAS } from '../src/hud/tons.js';

const RAIZ = new URL('..', import.meta.url);
const C = { forte: '\x1b[1m', erro: '\x1b[31m', ok: '\x1b[32m', aviso: '\x1b[33m', fraco: '\x1b[2m', fim: '\x1b[0m' };

const css = await readFile(new URL('index.html', RAIZ), 'utf8');

/** Os arquivos de `src/`, recursivo — sem comentários, que é onde a prosa fingiria de código. */
async function fontes(dir = new URL('src/', RAIZ), saco = []) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const alvo = new URL(item.name + (item.isDirectory() ? '/' : ''), dir);
    if (item.isDirectory()) await fontes(alvo, saco);
    else if (item.name.endsWith('.js')) saco.push([alvo, await readFile(alvo, 'utf8')]);
  }
  return saco;
}
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const arquivos = (await fontes()).map(([u, s]) => [u.pathname.split('/src/')[1], semComentarios(s)]);

/**
 * O seletor que um tom desta família TEM de encontrar.
 *
 * ⚠️ Casado sem espaço em branco significativo e com o alvo opcional: `.row.warn .row-text` e
 * `.row.warn{` são a mesma afirmação para esta lei — o que importa é existir regra alcançando
 * aquele par, não como ela foi escrita.
 */
const pinta = (familia, tom, cfg) => {
  const naLinha = cfg.naLinha.includes(tom);
  const base = `\\.${familia}\\.${tom}`;
  const cauda = naLinha || !cfg.alvo ? '\\s*[,{]' : `\\s+${cfg.alvo.replace('.', '\\.')}\\s*[,{]`;
  return new RegExp(base + cauda).test(css) || new RegExp(base + '\\s*[,{]').test(css);
};

let falhou = false;

// ───────────────────────────────────────────────────────────── §1 · emitido sem quem pinte
console.log(`${C.forte}§1 — todo tom aceito tem regra que o pinta${C.fim}`);
const mudos = [];
for (const [familia, cfg] of Object.entries(FAMILIAS)) {
  for (const tom of [...cfg.aceita, ...cfg.naLinha]) {
    if (!pinta(familia, tom, cfg)) mudos.push(`.${familia}.${tom}`);
  }
}
if (mudos.length) {
  console.log(`\n${C.erro}✗ ${mudos.length} tom(ns) SEM REGRA: ${mudos.join(', ')}${C.fim}`);
  console.log(`  ${C.aviso}O código afirma e a tela não desenha. Nada quebra — ela só deixa de afirmar.${C.fim}`);
  falhou = true;
} else {
  const total = Object.values(FAMILIAS).reduce((n, c) => n + c.aceita.length + c.naLinha.length, 0);
  console.log(`${C.ok}✓ ${total} pares casados${C.fim}  ${C.fraco}${Object.keys(FAMILIAS).join(' · ')}${C.fim}`);
}

// ───────────────────────────────────────────────────────────── §2 · pintado sem quem emita
console.log(`\n${C.forte}§2 — toda regra de tom tem tom que a alcance${C.fim}`);
const mortas = [];
for (const familia of Object.keys(FAMILIAS)) {
  const cfg = FAMILIAS[familia];
  const vivos = new Set([...cfg.aceita, ...cfg.naLinha]);
  for (const m of css.matchAll(new RegExp(`\\.${familia}\\.([a-z-]+)`, 'g'))) {
    if (!vivos.has(m[1])) mortas.push(`.${familia}.${m[1]}`);
  }
}
if (mortas.length) {
  console.log(`\n${C.erro}✗ regra(s) sem emissor: ${[...new Set(mortas)].join(', ')}${C.fim}`);
  console.log(`  ${C.aviso}Quem ler o seletor conclui que a feição existe e para de procurar.${C.fim}`);
  falhou = true;
} else {
  console.log(`${C.ok}✓ nenhuma regra morta${C.fim}`);
}

// ───────────────────────────────────────────────────────────── §3 · o tom que ninguém declarou
console.log(`\n${C.forte}§3 — nenhum tom fora do vocabulário${C.fim}`);
/*
 * Os portões por onde um tom chega a uma linha: `note` é a porta pública, e `tone:`/`tom:` são as
 * chaves com que `stamp` e `pintarFio` o recebem.
 *
 * ⚠️ **`note` leva o tom como argumento POSICIONAL**, não como chave — varrer só `tone:` devolve
 * zero e faz a lei atestar um vocabulário que ninguém usa por essa porta.
 */
const PORTOES = [/\bnote\([\s\S]{0,240}?,\s*'([a-z-]*)'\s*\)/g, /\b(?:tone|tom):\s*'([a-z-]*)'/g];
const intrusos = new Map();
for (const [nome, fonte] of arquivos) {
  for (const portao of PORTOES) {
    for (const m of fonte.matchAll(portao)) {
      if (!(m[1] in TONS)) intrusos.set(`${nome}: '${m[1]}'`, true);
    }
  }
}
if (intrusos.size) {
  console.log(`\n${C.erro}✗ ${intrusos.size} tom(ns) fora de src/hud/tons.js${C.fim}`);
  for (const k of [...intrusos.keys()].slice(0, 8)) console.log(`  ${k}`);
  console.log(`  ${C.aviso}Nenhuma regra o alcança: a linha sai na cor de corpo.${C.fim}`);
  falhou = true;
} else {
  console.log(`${C.ok}✓ ${Object.keys(TONS).length} tons declarados${C.fim}  ${C.fraco}${arquivos.length} arquivos varridos${C.fim}`);
}

process.exit(falhou ? 1 : 0);
