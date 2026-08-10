#!/usr/bin/env node
/**
 * A LEI DO TOOLING — nenhum script órfão, e a CADEIA na ordem que a medida exige.
 *
 * ## O que ela guarda
 *
 * `scripts/` tem duas famílias. Os GUARDAS rodam no portão e entram nele sozinhos — `leis.mjs`
 * varre o diretório, e a lista de quem não roda é conferida contra a medida. Os MATERIALIZADORES
 * ficam fora do portão de propósito, porque mutam estado compartilhado (o `.cache/` que o servidor
 * anexa, o grafo). Esses precisam de outro dono.
 *
 * Três coisas falham **em silêncio** sem esta lei:
 *
 * 1. ☠️ **O SCRIPT ÓRFÃO.** Um materializador que nenhum alvo do `Makefile` chama existe e ninguém
 *    o roda. Ele não quebra nada — ele deixa de acontecer, e o snapshot que ele escreveria fica
 *    velho enquanto a API continua servindo o arquivo antigo com cara de fato. §1.
 * 2. ☠️ **A ORDEM ERRADA NA RECEITA.** A rede lê o SNAPSHOT, não o banco: fora de ordem os arquivos
 *    saem coerentes entre si e ERRADOS quanto ao grafo. A ordem é DERIVADA do fonte — quem lê um
 *    `.cache/X.json` depende de quem o escreve; quem lê o grafo depende de quem escreve nele —, e
 *    não de uma lista que alguém mantém à mão. §2 e §3.
 * 3. ☠️ **O DOC CONTRADIZENDO A MEDIDA.** Um script declarado *"independente"* na prosa que a medida
 *    mostra ser dependente manda a próxima pessoa rodar a cadeia incompleta, com convicção total.
 *    §4.
 *
 * Uso:  node scripts/lei-tooling.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = {
  erro: '\x1b[31m',
  ok: '\x1b[32m',
  aviso: '\x1b[33m',
  fraco: '\x1b[2m',
  forte: '\x1b[1m',
  fim: '\x1b[0m',
};
let falhas = 0;
const checar = (secao, cond, frase) => {
  if (cond) console.log(`  ${C.ok}✓${C.fim} ${C.fraco}${secao}${C.fim} ${frase}`);
  else {
    falhas += 1;
    console.log(`${C.erro}✗ ${secao} ${frase}${C.fim}`);
  }
};

const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const MAKEFILE = ler('Makefile');
const SCRIPTS = fs
  .readdirSync(path.join(RAIZ, 'scripts'))
  .filter((n) => /\.(mjs|js|py)$/.test(n))
  .sort();

/**
 * A MEDIDA de efeito colateral, RECORTADA de `leis.mjs` — que é a dona dela.
 *
 * ☠️ **Não dá para importar `leis.mjs`:** ele executa o portão inteiro ao ser carregado. E
 * transcrever a medida aqui criaria a segunda fonte que esta base já pagou — duas definições de
 * *"muta estado compartilhado"* divergem na primeira vez que uma delas muda. O recorte é a mesma
 * técnica com que `lei-cena.mjs` alcança a tabela `CENAS`, e ele ACUSA se a função sair de lá.
 */
function medidaDoPortao() {
  const fonte = ler('scripts/leis.mjs');
  const i = fonte.indexOf('const mutaCompartilhado = ');
  if (i < 0) return null;
  const fim = fonte.indexOf('\n};', i);
  if (fim < 0) return null;
  const corpo = fonte
    .slice(i, fim + 3)
    .replace(/readFileSync\(`\$\{RAIZ\}\/scripts\/\$\{nome\}`, 'utf8'\)/, 'LER(nome)');
  // eslint-disable-next-line no-new-func
  return new Function('LER', `${corpo}; return mutaCompartilhado;`)((n) => ler(`scripts/${n}`));
}

console.log(`${C.forte}LEI DO TOOLING${C.fim}  ${C.fraco}${SCRIPTS.length} scripts${C.fim}\n`);

const mutaCompartilhado = medidaDoPortao();

// ────────────────────────────────────────────────────── §1 · NENHUM SCRIPT ÓRFÃO

/**
 * Scripts que legitimamente não têm alvo, com o motivo.
 *
 * ⚠️ Entrada que não casa arquivo nenhum ACUSA: isenção para o vazio é tabela velha protegendo
 * um script que já saiu.
 */
const SEM_ALVO = {
  'baseline.js': 'é colado no console do navegador — não há comando que o rode',
  'leis.mjs': 'é o portão; `make leis` o chama, e ele não muta nada',
};

console.log(
  `${C.forte}§1  NENHUM SCRIPT ÓRFÃO${C.fim}  ${C.fraco}quem muta estado tem alvo no Makefile${C.fim}`
);
{
  checar(
    '§1',
    typeof mutaCompartilhado === 'function',
    '`mutaCompartilhado` continua recortável de `leis.mjs` — é ele o dono da medida de efeito colateral'
  );
  if (typeof mutaCompartilhado === 'function') {
    /*
     * ⚠️ **A varredura é sobre a MEDIDA, não sobre a lista declarada.** Conferir `NAO_RODAM`
     * deixaria passar exatamente o caso que mais importa: o script NOVO, que ainda não está em
     * lista nenhuma. Visto por mutação — um materializador recém-criado passava verde aqui.
     */
    const materializadores = SCRIPTS.filter((n) => !(n in SEM_ALVO) && mutaCompartilhado(n));
    const orfaos = materializadores.filter((n) => !MAKEFILE.includes(`scripts/${n}`));
    checar(
      '§1b',
      orfaos.length === 0,
      `os ${materializadores.length} materializadores têm alvo no Makefile` +
        (orfaos.length
          ? ` — ÓRFÃOS: ${orfaos.join(', ')}. Um snapshot que ninguém rematerializa ` +
            'envelhece enquanto a API continua servindo o arquivo velho com cara de fato'
          : '')
    );
    const isentaVazio = Object.keys(SEM_ALVO).filter((n) => !SCRIPTS.includes(n));
    checar(
      '§1c',
      isentaVazio.length === 0,
      `\`SEM_ALVO\` não isenta arquivo inexistente${isentaVazio.length ? ` — ${isentaVazio.join(', ')}` : ''}`
    );
  }
}

// ────────────────────────────────────── §2 · A CADEIA, DERIVADA DO FONTE

/**
 * Que snapshot cada script ESCREVE e qual ele LÊ — medido, nunca declarado.
 *
 * O meio é `.cache/*.json` para os snapshots e o Neo4j para a topologia. Escrita de Cypher é
 * `MERGE`/`CREATE`/`SET`; leitura é qualquer consulta.
 */
function meios(nome) {
  const src = ler(`scripts/${nome}`);
  const semComentario = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const arquivos = [...semComentario.matchAll(/['"`](\.cache\/[a-z-]+\.json)['"`]/g)].map((m) => m[1]);
  const consts = new Map();
  for (const m of semComentario.matchAll(/const\s+([A-Z_]+)\s*=\s*['"`](\.cache\/[a-z-]+\.json)['"`]/g)) {
    consts.set(m[1], m[2]);
  }
  const resolve = (expr) => {
    const literal = expr.match(/['"`](\.cache\/[a-z-]+\.json)['"`]/);
    if (literal) return literal[1];
    const nomeConst = expr.match(/\b([A-Z_]+)\b/);
    return nomeConst ? (consts.get(nomeConst[1]) ?? null) : null;
  };
  const escreve = new Set();
  const le = new Set();
  for (const m of semComentario.matchAll(/writeFileSync\(([^,]+)/g)) {
    const alvo = resolve(m[1]);
    if (alvo) escreve.add(alvo);
  }
  for (const m of semComentario.matchAll(/readFileSync\(([^,)]+)/g)) {
    const alvo = resolve(m[1]);
    if (alvo) le.add(alvo);
  }
  return {
    escreve,
    le,
    escreveGrafo: /\b(MERGE|CREATE|SET)\s/.test(semComentario) && /cypher|neo4j/i.test(semComentario),
    leGrafo: /MATCH\s/.test(semComentario),
    tocaCache: arquivos.length > 0,
  };
}

const medida = new Map(SCRIPTS.filter((n) => n.endsWith('.mjs')).map((n) => [n, meios(n)]));

/** `a` tem de rodar ANTES de `b`. */
const arestas = [];
for (const [a, ma] of medida) {
  for (const [b, mb] of medida) {
    if (a === b) continue;
    const porArquivo = [...ma.escreve].find((f) => mb.le.has(f));
    if (porArquivo) arestas.push({ antes: a, depois: b, por: porArquivo });
    else if (ma.escreveGrafo && !mb.escreveGrafo && mb.leGrafo)
      arestas.push({ antes: a, depois: b, por: 'grafo' });
  }
}

console.log(
  `\n${C.forte}§2  A CADEIA SAI DO FONTE${C.fim}  ${C.fraco}quem lê depende de quem escreve${C.fim}`
);
{
  checar('§2', arestas.length > 0, `${arestas.length} dependências derivadas do fonte`);
  for (const e of arestas.filter((x) => x.por !== 'grafo')) {
    console.log(
      `  ${C.fraco}·${C.fim} ${e.antes.padEnd(18)} → ${e.depois.padEnd(18)} ${C.fraco}${e.por}${C.fim}`
    );
  }
  const pelaTopologia = arestas.filter((x) => x.por === 'grafo');
  if (pelaTopologia.length) {
    const escritores = [...new Set(pelaTopologia.map((x) => x.antes))].join(', ');
    const leitores = [...new Set(pelaTopologia.map((x) => x.depois))].join(', ');
    console.log(`  ${C.fraco}·${C.fim} pelo GRAFO: ${escritores} ${C.fraco}antes de${C.fim} ${leitores}`);
  }
}

// ─────────────────────────────────── §3 · A RECEITA RESPEITA A CADEIA

console.log(`\n${C.forte}§3  A ORDEM DA RECEITA${C.fim}`);
{
  /** Cada alvo do Makefile, com os scripts que ele chama NA ORDEM em que aparecem. */
  const alvos = new Map();
  let atual = null;
  for (const linha of MAKEFILE.split('\n')) {
    const cabeca = linha.match(/^([a-z][a-z0-9-]*):/);
    if (cabeca) {
      atual = cabeca[1];
      alvos.set(atual, []);
      continue;
    }
    if (!linha.startsWith('\t') && linha.trim() !== '' && !linha.startsWith(' ')) atual = null;
    if (!atual) continue;
    for (const m of linha.matchAll(/scripts\/([a-z-]+\.(?:mjs|js|py))/g)) alvos.get(atual).push(m[1]);
  }

  const foraDeOrdem = [];
  for (const [alvo, chamados] of alvos) {
    for (const e of arestas) {
      const iA = chamados.indexOf(e.antes);
      const iB = chamados.indexOf(e.depois);
      if (iA >= 0 && iB >= 0 && iA > iB) foraDeOrdem.push({ alvo, ...e });
    }
  }
  checar(
    '§3',
    foraDeOrdem.length === 0,
    `nenhuma receita chama um dependente antes da dependência` +
      (foraDeOrdem.length
        ? ` — ${foraDeOrdem.map((f) => `\`${f.alvo}\`: ${f.depois} antes de ${f.antes}`).join('; ')}`
        : '')
  );

  /* Dependência AUSENTE é pior que fora de ordem: a receita sai 1 no meio, ou pior, usa o velho. */
  const faltando = [];
  for (const [alvo, chamados] of alvos) {
    for (const e of arestas) {
      if (chamados.includes(e.depois) && !chamados.includes(e.antes) && e.por !== 'grafo') {
        faltando.push({ alvo, ...e });
      }
    }
  }
  checar(
    '§3b',
    faltando.length === 0,
    'nenhuma receita chama um dependente SEM a dependência' +
      (faltando.length
        ? ` — ${faltando.map((f) => `\`${f.alvo}\` chama ${f.depois} sem ${f.antes} (${f.por})`).join('; ')}`
        : '')
  );
}

// ─────────────────────────── §4 · O DOC NÃO PODE CONTRADIZER A MEDIDA

console.log(`\n${C.forte}§4  O DOC CONTRA A MEDIDA${C.fim}`);
{
  /*
   * ☠️ **Chamar de «independente» não é o único jeito de o doc mentir — OMITIR a aresta é pior.**
   * Um diagrama que desenhe a cadeia sem uma dependência medida manda a próxima pessoa rodar a
   * cadeia incompleta, e a receita sai 1 no meio ou usa o snapshot velho. A conferência é de ORDEM
   * DE LEITURA dentro do bloco que desenha a cadeia: se A tem de rodar antes de B, A aparece antes.
   */
  const porArquivo = arestas.filter((e) => e.por !== 'grafo');
  const dependentes = new Set(porArquivo.map((e) => e.depois));
  const problemas = [];
  for (const doc of ['CLAUDE.md', 'docs/HANDOFF.md']) {
    const texto = ler(doc);
    for (const linha of texto.split('\n')) {
      if (!/independente/i.test(linha)) continue;
      for (const dep of dependentes) {
        if (linha.includes(dep)) problemas.push(`${doc}: «${dep}» chamado de independente`);
      }
    }
    /*
     * Todo bloco que desenhe a cadeia com setas tem de respeitar a ordem medida.
     *
     * ⚠️ **O nome é casado SEM a extensão.** Um diagrama pode escrever `conectividade` ou
     * `conectividade.mjs`, e procurar só a forma com extensão faz a lei passar sobre um bloco que
     * ela não leu — visto por mutação, o diagrama omitindo a aresta saiu verde porque os nomes
     * dele não terminavam em `.mjs`.
     */
    const semExt = (n) => n.replace(/\.[a-z]+$/, '');
    const acha = (bloco, nome) => {
      const m = bloco.match(new RegExp(`\\b${semExt(nome)}\\b`));
      return m ? m.index : -1;
    };
    for (const bloco of texto.split(/```/).filter((b) => /→/.test(b) && /\.(mjs|py)\b|make /.test(b))) {
      for (const e of porArquivo) {
        const iA = acha(bloco, e.antes);
        const iB = acha(bloco, e.depois);
        if (iB >= 0 && (iA < 0 || iA > iB)) {
          problemas.push(
            `${doc}: a cadeia desenhada põe ${semExt(e.depois)} sem ${semExt(e.antes)} antes (${e.por})`
          );
        }
      }
    }
  }
  checar(
    '§4',
    problemas.length === 0,
    'a cadeia desenhada nos docs bate com a medida' +
      (problemas.length ? ` — ${[...new Set(problemas)].join('; ')}` : '')
  );
}

console.log('');
if (falhas) {
  console.log(
    `${C.erro}✗ ${falhas} falha(s)${C.fim}  o tooling tem script sem dono, ou receita fora da cadeia.`
  );
  process.exit(1);
}
console.log(
  `${C.ok}✓ a lei vale${C.fim}  ${C.fraco}todo script tem alvo, e a ordem das receitas sai da ` +
    `medida — não de uma lista mantida à mão.${C.fim}`
);
