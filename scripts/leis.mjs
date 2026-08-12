#!/usr/bin/env node
/**
 * AS LEIS — o portão único, e ele existe porque ter 21 guardas não impediu nada.
 *
 *     node scripts/leis.mjs           # roda tudo, sai 1 se qualquer lei cair
 *     node scripts/leis.mjs --lista   # só mostra o que rodaria, e o que NÃO roda e por quê
 *
 * ## Por que ele nasceu
 *
 * ☠️ **Quantidade de arquivo não é cobertura.** Em 2026-08-09 este diretório tinha 21 guardas e a
 * mesma sessão descobriu, um a um, que vários não guardavam o que diziam:
 *
 * | o guarda | o que não pegava |
 * |---|---|
 * | `lei-tela` §8 | era LISTA BRANCA de quatro arquivos: um quinto escrevia na tela à vontade |
 * | `lei-cena` §1–§4 | provavam que a cena não contamina a ontologia — e **não alcançavam a cena AGENTE**, que não a chama. 32 de 72 corpos discordavam entre as cenas, sem nada acusar |
 * | `lei-favoritos-ui` §6 | gravava um FATO DE MUNDO como lei ("0 de 9 texturas em disco") e expirou sozinha na primeira entrega da tarefa irmã |
 * | `lei-tela`, `lei-notice`, `lei-entrada` | tinham a `RAIZ` vinda de caminho absoluto ou argumento — **passavam sobre uma cópia MUTADA**, atestando guarda que a cópia não tinha |
 *
 * O denominador comum não é o número de arquivos: é **ninguém rodar tudo, sempre**. Rodar os 21
 * custa **2,0 s** (medido em 09/08) — não existe razão de custo, existia razão de hábito.
 *
 * ## O que este script NÃO faz, e é decisão
 *
 * ⚠️ **Ele não escolhe quem roda por uma lista.** Lista branca é exatamente o defeito que deixou o
 * `splash.js` escrever na tela sem o oráculo saber. Aqui a regra é a INVERSA: **roda tudo que está
 * em `scripts/`, menos quem for MEDIDO inadmissível** — por EFEITO (muta estado compartilhado) ou
 * por CUSTO DE ADMISSÃO (sobe navegador: ~15 s e um binário externo). Quem muta estado tem
 * efeito colateral e não pode entrar num portão que roda sempre.
 *
 * A medida está em `mutaCompartilhado`, e ela é conferida contra a lista: guarda novo entra
 * sozinho, e materializador novo é acusado pelo que FAZ, não por alguém lembrar de declará-lo. A
 * lista e a medida discordarem **derruba o portão** — porque foi assim que esta base perdeu guarda
 * antes.
 *
 * ⚠️ **E o que sobrar sem classificação é IMPRESSO**, nunca ignorado em silêncio. Um script que
 * este portão não sabe o que é aparece na saída — porque cobertura que não se anuncia é a mesma
 * ilusão que ele existe para desfazer.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SO_LISTAR = process.argv.includes('--lista');

/**
 * Scripts que este portão NÃO roda, com o motivo — e o motivo é sempre EFEITO COLATERAL.
 *
 * ⚠️ Isto não é lista branca de quem roda (essa seria o defeito). É a lista dos que ESCREVEM, e
 * ela é conferida contra a medida: se um arquivo aqui deixar de escrever, ou um de fora passar a
 * escrever, o portão acusa a divergência em vez de seguir com a lista velha.
 */
const NAO_RODAM = {
  'relatorio.mjs': 'reescreve docs/relatorio.md — arquivo VERSIONADO',
  'centralidade.mjs': 'materializa .cache/influencia.json',
  'uso.mjs': 'materializa .cache/uso.json',
  'conectividade.mjs': 'materializa .cache/conectividade.json',
  'vizinhanca.mjs': 'materializa .cache/vizinhanca.json',
  'conceitos.mjs': 'materializa .cache/conceitos.json',
  'similares.mjs': 'escreve no Neo4j',
  'vinculos.mjs': 'escreve no Neo4j',
  'citacoes.mjs': 'escreve no Neo4j',
  'fixture.py': 'CRIA e APAGA o repositório do fixture',
  'baseline.js': 'é colado no console do navegador, não roda em node',
  'lei-pixel.mjs': 'sobe um NAVEGADOR — 15s e um binário externo, num portão de ~5s',
  'leis.mjs': 'é este portão',
};

const arquivos = readdirSync(`${RAIZ}/scripts`)
  .filter((n) => n.endsWith('.mjs') || n.endsWith('.py') || n.endsWith('.js'))
  .sort();

/**
 * Muta ESTADO COMPARTILHADO? É a medida que separa guarda de materializador.
 *
 * ⚠️ **"Escreve em disco" era a grandeza errada, e a primeira versão usou-a.** Ela acusava
 * `censo-planetas` (que escreve o esboço de `node_modules/three` para si mesmo), `lei-entrada` e
 * `motivo-upstream` (que escrevem temporários do próprio teste) — e **deixava passar** `citacoes` e
 * `vinculos`, que não tocam o disco e escrevem no NEO4J. Efeito colateral não é tocar em arquivo:
 * é mexer no que OUTRO lê.
 *
 * Os dois estados compartilhados desta base são `.cache/` (os snapshots que o servidor anexa) e o
 * grafo. Escrita de Cypher é `MERGE`/`CREATE`/`SET`; `rmtree` é o fixture apagando o corpus.
 */
const mutaCompartilhado = (nome) => {
  const src = readFileSync(`${RAIZ}/scripts/${nome}`, 'utf8');
  const emCache =
    /writeFileSync\(\s*(SAIDA|CACHE|['"`][^'"`]*\.cache\/)/.test(src) ||
    /['"`]\.cache\/[^'"`]*['"`][^\n]*writeFileSync/.test(src);
  // ☠️ **Doc escrito por script é MAIS compartilhado que `.cache/`, não menos: ele é VERSIONADO.**
  // A medida só olhava `.cache/`, o grafo e o fixture — um gerador de relatório passaria por aqui
  // como guarda e reescreveria um arquivo rastreado a cada commit, sujando o diff de quem só
  // queria commitar outra coisa.
  const emDocs = /writeFileSync\(\s*(SAIDA|['"`][^'"`]*docs\/)/.test(src);
  const noGrafo = /\b(MERGE|CREATE|SET)\s/.test(src) && /cypher|neo4j/i.test(src);
  const apagaCorpus = /rmtree|--limpar/.test(src);
  return emCache || emDocs || noGrafo || apagaCorpus;
};

/**
 * A SEGUNDA razão de ficar fora, e ela é de outra natureza: **custo de ADMISSÃO**, não efeito.
 *
 * ☠️ Um oráculo que sobe navegador não muta nada e ainda assim não cabe aqui: são ~15 s e um
 * binário externo num portão que roda a cada commit em ~5 s. Foi por essa propriedade que
 * `make tipos` ficou de fora, e a razão vale igual — o que muda é só qual dependência.
 *
 * ⚠️ **Ela é MEDIDA como a primeira, e por isso ainda é conferida contra a lista.** Declarar
 * bastaria para alguém tirar um guarda do portão escrevendo uma linha, que é exatamente a fuga que
 * a conferência existe para fechar. A régua é lançar um processo de navegador — `spawn` mais um
 * binário do Chrome ou a porta de depuração.
 */
const precisaDeNavegador = (nome) => {
  const src = readFileSync(`${RAIZ}/scripts/${nome}`, 'utf8');
  return /\bspawn\(/.test(src) && /remote-debugging-port|CHROME_BIN|Google Chrome|chromium/i.test(src);
};

const guardas = [];
const fora = [];
const divergentes = [];
for (const nome of arquivos) {
  const declaradoFora = nome in NAO_RODAM;
  const mede = mutaCompartilhado(nome) || precisaDeNavegador(nome);
  // ⚠️ A lista e a medida têm de concordar. Divergirem em silêncio é como esta base perde guarda.
  if (declaradoFora !== mede && !['leis.mjs', 'baseline.js'].includes(nome)) {
    divergentes.push({ nome, declaradoFora, mede });
  }
  (declaradoFora ? fora : guardas).push(nome);
}

if (SO_LISTAR) {
  console.log(`\x1b[1mRODAM\x1b[0m (${guardas.length})`);
  for (const g of guardas) console.log(`  ${g}`);
  console.log(`\n\x1b[1mNÃO RODAM\x1b[0m (${fora.length}) — efeito colateral ou custo de admissão`);
  for (const f of fora) console.log(`  ${f.padEnd(24)} ${NAO_RODAM[f]}`);
  process.exit(0);
}

const rodar = (nome) =>
  new Promise((res) => {
    const py = nome.endsWith('.py');
    const t0 = Date.now();
    const p = spawn(py ? 'python3' : 'node', [`${RAIZ}/scripts/${nome}`], { cwd: RAIZ });
    let saida = '';
    p.stdout.on('data', (d) => {
      saida += d;
    });
    p.stderr.on('data', (d) => {
      saida += d;
    });
    p.on('close', (code) => res({ nome, code, ms: Date.now() - t0, saida }));
  });

// Serial de propósito: vários leem o mesmo `/api/graph`, e paralelo transformaria uma falha do
// servidor em N falhas parecendo N defeitos. 2 s no total — não há o que otimizar.
const resultados = [];
for (const nome of guardas) resultados.push(await rodar(nome));

// ⚠️ `2` sai daqui de propósito: ele é "não pude medir" e tem caixa própria abaixo. Deixá-lo
// em `caidos` é o que fazia um banco vazio ser relatado como oito leis quebradas.
const caidos = resultados.filter((r) => r.code !== 0 && r.code !== 2);
const total = resultados.reduce((s, r) => s + r.ms, 0);

console.log(`\x1b[1mAS LEIS\x1b[0m  ${guardas.length} guardas · ${(total / 1000).toFixed(1)}s\n`);
for (const r of resultados) {
  const marca = r.code === 0 ? '\x1b[32m✓\x1b[0m' : r.code === 2 ? '\x1b[33m⚠\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${marca} ${r.nome.padEnd(24)} ${String(r.ms).padStart(5)}ms`);
}

// ☠️ **DIVERGÊNCIA DERRUBA O PORTÃO — e por várias sessões ela só IMPRIMIU.** O docblock deste
// arquivo sempre afirmou isto; o código emitia uma linha AMARELA entre 39 vistos verdes e saía 0.
// Era a invariante declarada e não implementada, dentro do guarda que existe para pegar
// exatamente isso: script novo que escreve em `.cache/`, no grafo ou num doc versionado passava a
// rodar a cada commit, mutando estado compartilhado, e o aviso rolava a tela.
const divergiu = divergentes.length > 0;
if (divergiu) {
  console.log(
    `\n\x1b[31m✗ a lista e a medida discordam\x1b[0m — quem escreve, ou sobe navegador, tem de estar em NAO_RODAM:`
  );
  for (const d of divergentes) {
    console.log(`  ${d.nome.padEnd(24)} declarado fora: ${d.declaradoFora} · inadmissível: ${d.mede}`);
  }
  console.log(
    '  \x1b[2mdeclarado fora + inadmissível FALSO = entrada velha, tire da lista\x1b[0m\n' +
      '  \x1b[2mdeclarado fora FALSO + inadmissível = escreve e está rodando no portão, acrescente\x1b[0m'
  );
}

/*
 * ☠️ **"NÃO PUDE MEDIR" NÃO É "A LEI CAIU", e confundir os dois acusa o código de um banco vazio.**
 * Guarda que depende do céu servido sai com 2 quando não há topologia (`scripts/lib/ceu-servido.mjs`)
 * — a causa quase sempre é banal: ninguém indexou ainda. Contá-los como quebra faz um clone novo
 * ler "8 LEIS CAÍRAM" e concluir que o repositório está com defeito.
 *
 * ⚠️ O portão CONTINUA saindo 1: nada foi verificado ali, e sair 0 seria o verde de mentira que
 * esta base passa o tempo removendo. O que muda é de quem é a culpa.
 */
const semMedida = resultados.filter((r) => r.code === 2);
if (semMedida.length) {
  console.log(
    `\n\x1b[33m⚠ ${semMedida.length} não puderam MEDIR\x1b[0m — falta topologia, não é defeito de código:`
  );
  for (const r of semMedida) {
    console.log(`  ${r.nome.padEnd(24)} ${(r.saida.split('\n').find((l) => l.trim()) || '').slice(0, 92)}`);
  }
  console.log('  \x1b[2mindexe em #/storage (ou `make indexar`) e rode de novo\x1b[0m');
}

if (caidos.length || divergiu || semMedida.length) {
  if (!caidos.length) {
    console.log(
      divergiu
        ? `\n\x1b[31m✗ o portão cai pela DIVERGÊNCIA acima\x1b[0m — as leis passaram, a cobertura não.`
        : `\n\x1b[33m✗ nenhuma lei quebrou\x1b[0m — mas ${semMedida.length} não puderam medir, e isso não é aprovação.`
    );
    process.exit(1);
  }
  console.log(`\n\x1b[31m✗ ${caidos.length} LEI(S) CAÍRAM\x1b[0m`);
  for (const r of caidos) {
    console.log(`\n\x1b[1m── ${r.nome}\x1b[0m`);
    console.log(r.saida.split('\n').slice(-14).join('\n'));
  }
  process.exit(1);
}

console.log(`\n\x1b[32m✓ as ${guardas.length} leis valem\x1b[0m`);
if (divergentes.length) process.exit(1);
