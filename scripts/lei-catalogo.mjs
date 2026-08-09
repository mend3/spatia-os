#!/usr/bin/env node
/**
 * A LEI DO CATÁLOGO — o contrato de widget NOMEIA o que aceita, a fenda EXIGE o que precisa, e
 * toda chave declarada tem LEITOR. Este script prova isso por auditoria e por perturbação.
 *
 *     node scripts/lei-catalogo.mjs      # sai 0 se a lei vale
 *
 * Não precisa de servidor: o vocabulário é do código, não do céu.
 *
 * ## A lei
 *
 * `registerWidget` espalhava `...contract` sem conferir nada, então `surafce: true` entrava no
 * registro, ninguém o lia, e o defeito aparecia como um painel de palco sem fundo — o disco de
 * acreção atravessando o texto (`index.html:811-814`). Um campo ignorado não erra: ele SOME.
 *
 * A regra que fecha isso é a REGRA DO CATÁLOGO (`HANDOFF.md` §2): nomeie o que a classe ACEITA,
 * ponha a proibição em campo próprio, e **declarar uma invariante não a implementa**. Aqui ela
 * tem três faces, e é preciso as três:
 *
 * 1. **O vocabulário** (`VOCABULARIO_DO_WIDGET`) — o que o contrato aceita. Chave fora dele é
 *    recusada NO REGISTRO, como a tecla com dois donos, não numa fenda vazia meia hora depois.
 * 2. **A exigência por fenda** (`FENDAS[slot].exige`) — no palco, `surface` ausente e
 *    `surface: false` não são a mesma coisa. `null` ≠ `0`: um é *"ninguém decidiu"*, o outro é
 *    *"decidi que não"*, e só o segundo é um contrato.
 * 3. **O leitor** — chave declarada que ninguém lê é o `orbit` do manifesto de app outra vez:
 *    copiada por cada registro novo, sem efeito nenhum. A §2 varre os DOIS sentidos.
 *
 * ## Por que a §4 varre a FONTE, e não só o registro
 *
 * ☠️ **O portão em runtime não alcança o que um INVÓLUCRO engole.** `listWidget`
 * (`apps/widgets-core.js`) desestrutura uma lista fixa de chaves e repassa: uma chave com erro de
 * digitação some ANTES de chegar ao registro, e um padrão (`surface = false`) FABRICA uma decisão
 * que o app nunca tomou — o registro recebe `false` e não tem como saber que ninguém disse nada.
 *
 * Por isso a §4 audita a DECLARAÇÃO, no arquivo do app, onde a ausência ainda é visível. Os
 * invólucros não são uma lista escrita aqui: eles são DESCOBERTOS — toda função cujo corpo chama
 * um portal e cujo primeiro parâmetro é um objeto vira portal, até o ponto fixo. Invólucro novo
 * entra na varredura sozinho.
 *
 * ⚠️ E toda ocorrência de chamada que a varredura não conseguir atribuir a um portal ou a uma
 * declaração é ACUSADA — forma desconhecida acusa, nunca tolera. Foi uma lista branca que deixou
 * o `splash.js` escrever na tela sem oráculo nenhum saber.
 *
 * ## O que ele NÃO prova
 *
 * - **Nada sobre a TELA.** Que o fundo apareça, que o texto fique legível sobre o disco: isso é
 *   quadro, e quadro se mede com as sondas do `spatia`.
 * - **Invólucro em forma que o recortador não vê** — arrow de corpo conciso (`=> registerWidget(…)`)
 *   e método de objeto não são reconhecidos como função. A guarda contra isso é a atribuição da
 *   §4: a chamada dentro deles apareceria como declaração NÃO ATRIBUÍVEL e seria acusada.
 * - **Valor computado.** `slot: escolhe()` não é auditável na fonte; a §4 acusa em vez de supor,
 *   e o portão em runtime continua sendo o backstop.
 * - **Widget registrado fora de `src/`.** Nada aqui alcança código que não esteja na árvore.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VOCABULARIO_DO_WIDGET,
  FENDAS,
  SLOTS,
  registerWidget,
  listWidgets,
  exigidasDaFenda,
  proibidasNaFenda,
} from '../src/kernel/registry.js';

/*
 * ⚠️ A RAIZ sai de `import.meta.url` e SÓ dela. Raiz por argumento ou caminho de máquina faz o
 * oráculo auditar a árvore de origem enquanto roda sobre uma CÓPIA mutada — ele sai verde
 * atestando um guarda que a cópia não tem. Aconteceu quatro vezes nesta base.
 */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const falhas = [];
const nota = (secao, texto) => falhas.push({ secao, texto });
const rel = (p) => path.relative(RAIZ, p);

// ────────────────────────────────────────────────────────── um leitor de código que respeita aspas

/** Avança um índice por cima de comentário, string e template literal. */
function pulaOQueNaoEhCodigo(texto, i) {
  const dois = texto.slice(i, i + 2);
  if (dois === '//') {
    const fim = texto.indexOf('\n', i);
    return fim < 0 ? texto.length : fim;
  }
  if (dois === '/*') {
    const fim = texto.indexOf('*/', i + 2);
    return fim < 0 ? texto.length : fim + 2;
  }
  const c = texto[i];
  if (c === '"' || c === "'" || c === '`') {
    let j = i + 1;
    while (j < texto.length && texto[j] !== c) j += texto[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, texto.length);
  }
  return i;
}

/**
 * Apaga os COMENTÁRIOS preservando o comprimento (viram espaço) e deixa as strings intactas.
 *
 * ⚠️ As strings ficam porque `slot: 'stage'` é o valor que a §4 precisa ler. Os comentários saem
 * porque este repositório os escreve longos de propósito, e uma chave dentro de um deles
 * desbalanceia qualquer recorte.
 */
function semComentarios(texto) {
  let saida = '';
  let i = 0;
  while (i < texto.length) {
    const dois = texto.slice(i, i + 2);
    if (dois === '//' || dois === '/*') {
      const fim = pulaOQueNaoEhCodigo(texto, i);
      saida += texto.slice(i, fim).replace(/[^\n]/g, ' ');
      i = fim;
      continue;
    }
    const pulou = pulaOQueNaoEhCodigo(texto, i);
    if (pulou !== i) {
      saida += texto.slice(i, pulou);
      i = pulou;
      continue;
    }
    saida += texto[i];
    i++;
  }
  return saida;
}

/** Recorta o trecho equilibrado que começa no primeiro `(`/`{`/`[` a partir de `de`. */
function recorteEquilibrado(texto, de) {
  const ABRE = '({[';
  const FECHA = ')}]';
  let profundidade = 0;
  let comeco = -1;
  for (let i = de; i < texto.length; i++) {
    const pulou = pulaOQueNaoEhCodigo(texto, i);
    if (pulou !== i) {
      i = pulou - 1;
      continue;
    }
    if (ABRE.includes(texto[i])) {
      if (comeco < 0) comeco = i;
      profundidade++;
    } else if (FECHA.includes(texto[i])) {
      profundidade--;
      if (profundidade === 0) return { texto: texto.slice(comeco, i + 1), comeco, fim: i };
      if (profundidade < 0) return null;
    }
  }
  return null;
}

/** Os membros de nível 1 de um literal de objeto — chave, valor e a FORMA quando não é chave. */
function membrosDoLiteral(txt) {
  const pedacos = [];
  let inicio = 1;
  let profundidade = 0;
  for (let i = 1; i < txt.length - 1; i++) {
    const pulou = pulaOQueNaoEhCodigo(txt, i);
    if (pulou !== i) {
      i = pulou - 1;
      continue;
    }
    const c = txt[i];
    if ('({['.includes(c)) profundidade++;
    else if (')}]'.includes(c)) profundidade--;
    else if (c === ',' && profundidade === 0) {
      pedacos.push(txt.slice(inicio, i));
      inicio = i + 1;
    }
  }
  pedacos.push(txt.slice(inicio, txt.length - 1));

  const membros = [];
  for (const bruto of pedacos) {
    const p = bruto.trim();
    if (!p) continue;
    if (p.startsWith('...')) {
      membros.push({ forma: 'espalhamento', texto: p });
      continue;
    }
    if (p.startsWith('[')) {
      membros.push({ forma: 'chave computada', texto: p });
      continue;
    }
    let m = /^(['"])([^'"]+)\1\s*:([\s\S]*)$/.exec(p);
    if (m) {
      membros.push({ chave: m[2], valor: m[3].trim() });
      continue;
    }
    m = /^([A-Za-z_$][\w$]*)\s*:([\s\S]*)$/.exec(p);
    if (m) {
      membros.push({ chave: m[1], valor: m[2].trim() });
      continue;
    }
    m = /^(?:async\s+)?\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(p);
    if (m) {
      membros.push({ chave: m[1], valor: '(função)' });
      continue;
    }
    m = /^([A-Za-z_$][\w$]*)$/.exec(p);
    if (m) {
      membros.push({ chave: m[1], valor: '(abreviado)' });
      continue;
    }
    membros.push({ forma: 'desconhecida', texto: p.slice(0, 40) });
  }
  return membros;
}

/** Todo `.js` sob um diretório. */
function todosOsFontes(dir) {
  const saida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...todosOsFontes(alvo));
    else if (entrada.name.endsWith('.js')) saida.push(alvo);
  }
  return saida;
}

const linhaDe = (texto, i) => texto.slice(0, i).split('\n').length;

const fontes = todosOsFontes(path.join(RAIZ, 'src')).map((arquivo) => ({
  arquivo,
  texto: semComentarios(fs.readFileSync(arquivo, 'utf8')),
}));

console.log('\x1b[1mLEI DO CATÁLOGO — o contrato nomeia o que ACEITA, a fenda exige o que precisa\x1b[0m');
console.log(`  vocabulário: ${Object.keys(VOCABULARIO_DO_WIDGET).join(', ')}`);
console.log(`  fendas: ${SLOTS.map((s) => `${s}${exigidasDaFenda(s).length ? `(exige ${exigidasDaFenda(s).join('/')})` : ''}`).join(' · ')}`);
console.log(`  ${fontes.length} fontes em src/`);

// ───────────────────────────────────────────────────────── §1 o catálogo, conferido contra si mesmo

console.log('\n\x1b[1m§1 O CATÁLOGO\x1b[0m  o vocabulário e as fendas são coerentes entre si');

const chavesVocabulario = Object.keys(VOCABULARIO_DO_WIDGET);
if (!chavesVocabulario.length) nota('§1', 'o vocabulário está vazio — um catálogo sem chave aceita tudo');
if (!Object.isFrozen(VOCABULARIO_DO_WIDGET)) nota('§1', '`VOCABULARIO_DO_WIDGET` não está congelado');
if (!Object.isFrozen(FENDAS)) nota('§1', '`FENDAS` não está congelada — a tabela é mutável em runtime');
for (const [chave, frase] of Object.entries(VOCABULARIO_DO_WIDGET)) {
  if (typeof frase !== 'string' || frase.length < 12) {
    nota('§1', `a chave \`${chave}\` não diz de que responde — o catálogo é o lugar da frase`);
  }
}
if (Object.keys(FENDAS).join() !== SLOTS.join()) {
  nota('§1', '`SLOTS` e `FENDAS` divergem — duas fontes para a mesma lista de fendas');
}
for (const slot of SLOTS) {
  const fenda = FENDAS[slot];
  if (!Object.isFrozen(fenda)) nota('§1', `a fenda \`${slot}\` não está congelada`);
  if (typeof fenda?.semantica !== 'string' || fenda.semantica.length < 12) {
    nota('§1', `a fenda \`${slot}\` não declara semântica — fenda sem significado cada app inventa a sua`);
  }
  for (const chave of exigidasDaFenda(slot)) {
    if (!Object.hasOwn(VOCABULARIO_DO_WIDGET, chave)) {
      nota('§1', `a fenda \`${slot}\` exige \`${chave}\`, que o vocabulário não aceita — exigência impossível`);
    }
  }
  for (const chave of proibidasNaFenda(slot)) {
    if (!Object.hasOwn(VOCABULARIO_DO_WIDGET, chave)) {
      nota('§1', `a fenda \`${slot}\` proíbe \`${chave}\`, que ninguém pode declarar — proibição vazia`);
    }
    if (exigidasDaFenda(slot).includes(chave)) {
      nota('§1', `a fenda \`${slot}\` exige e proíbe \`${chave}\` ao mesmo tempo`);
    }
  }
  console.log(
    `  ${String(slot).padEnd(6)} exige: ${exigidasDaFenda(slot).join(', ') || '\x1b[2m—\x1b[0m'}` +
      `   proíbe: ${proibidasNaFenda(slot).join(', ') || '\x1b[2m—\x1b[0m'}`
  );
}

// ─────────────────────────────────────────── §2 cada chave declarada tem LEITOR, e vice-versa

console.log('\n\x1b[1m§2 CADA CHAVE TEM LEITOR\x1b[0m  declarada sem leitor é o `orbit` outra vez');

/** Onde `contract.<chave>` é lido, em código. */
function leitoresDe(chave) {
  const busca = new RegExp(`\\bcontract\\s*\\.\\s*${chave}\\b`);
  return fontes.filter(({ texto }) => busca.test(texto)).map(({ arquivo }) => rel(arquivo));
}

for (const chave of chavesVocabulario) {
  const leitores = leitoresDe(chave);
  // `id` e `slot` são lidos pelo próprio registro; os outros têm de ser lidos por quem MONTA.
  if (!leitores.length) {
    nota('§2', `\`${chave}\` está no vocabulário e ninguém lê \`contract.${chave}\` — campo sem leitor`);
  }
  const marca = leitores.length ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${marca} ${chave.padEnd(10)} ${leitores.join(', ') || '\x1b[31mninguém\x1b[0m'}`);
}

const lidas = new Set();
for (const { arquivo, texto } of fontes) {
  for (const m of texto.matchAll(/\bcontract\s*\.\s*([A-Za-z_$][\w$]*)\b/g)) {
    lidas.add(m[1]);
    if (!Object.hasOwn(VOCABULARIO_DO_WIDGET, m[1])) {
      nota('§2', `${rel(arquivo)}:${linhaDe(texto, m.index)} lê \`contract.${m[1]}\`, que o catálogo não declara`);
    }
  }
}

// ───────────────────────────────────────── §3 a perturbação: o portão recusa mesmo, no REGISTRO

console.log('\n\x1b[1m§3 O PORTÃO\x1b[0m  contratos inválidos enfiados no `registerWidget` de verdade');

const mount = () => undefined;
let sequencia = 0;
const idProva = () => `lei-catalogo-${sequencia++}`;

/** Roda uma prova contra o registro real e devolve o erro, ou `null` se ele aceitou. */
function tentar(contrato) {
  try {
    registerWidget(contrato);
    return null;
  } catch (erro) {
    return erro;
  }
}

/** O portão tem de RECUSAR — e recusar sem deixar resíduo no registro. */
function recusa(rotulo, contrato) {
  const id = contrato.id ?? idProva();
  const antes = listWidgets().length;
  const erro = tentar({ ...contrato, id });
  const depois = listWidgets().length;
  if (!erro) {
    nota('§3', `o portão ACEITOU ${rotulo} — a recusa não existe`);
  } else if (depois !== antes) {
    nota('§3', `${rotulo} foi recusado e MESMO ASSIM entrou no registro — recusa com resíduo`);
  } else if (!String(erro.message).includes(id)) {
    nota('§3', `${rotulo} foi recusado sem nomear o culpado: "${erro.message}"`);
  }
  console.log(`  ${erro && depois === antes ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} recusa  ${rotulo.padEnd(46)} \x1b[2m${erro ? erro.message.slice(0, 60) : 'ACEITOU'}\x1b[0m`);
}

/** O portão tem de ACEITAR — senão a lei estaria proibindo o contrato legítimo. */
function aceita(rotulo, contrato) {
  const id = contrato.id ?? idProva();
  const erro = tentar({ ...contrato, id });
  if (erro) nota('§3', `o portão RECUSOU ${rotulo}: ${erro.message}`);
  console.log(`  ${erro ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'} aceita  ${rotulo.padEnd(46)} \x1b[2m${erro ? erro.message.slice(0, 60) : ''}\x1b[0m`);
}

aceita('o contrato mínimo (fenda sem exigência)', { title: 'T', slot: 'left', mount });
aceita('o palco que DECIDIU não ser janela', { title: 'T', slot: 'stage', surface: false, mount });
aceita('o palco que decidiu ser janela', { title: 'T', slot: 'stage', surface: true, mount });
recusa('chave fora do vocabulário (`surafce`)', { title: 'T', slot: 'left', mount, surafce: true });
recusa('chave fora do vocabulário no palco', { title: 'T', slot: 'stage', surface: true, mount, foo: 1 });
recusa('palco SEM `surface` declarado', { title: 'T', slot: 'stage', mount });
recusa('palco com `surface: null` (não é decisão)', { title: 'T', slot: 'stage', surface: null, mount });
recusa('palco com `surface: undefined`', { title: 'T', slot: 'stage', surface: undefined, mount });
recusa('chave proibida pela fenda (`collapsed` no palco)', { title: 'T', slot: 'stage', surface: true, collapsed: true, mount });
recusa('fenda inexistente', { title: 'T', slot: 'centro', mount });
recusa('`mount` que não é função', { title: 'T', slot: 'left', mount: 'depois' });

const idRepetido = idProva();
aceita('o primeiro dono do id', { id: idRepetido, title: 'T', slot: 'left', mount });
recusa('id já registrado (dois donos do mesmo widget)', { id: idRepetido, title: 'T', slot: 'left', mount });

// ─────────────────────────────── §4 a varredura: a DECLARAÇÃO do app, onde a ausência é visível

console.log('\n\x1b[1m§4 A VARREDURA DAS DECLARAÇÕES\x1b[0m  invólucros descobertos, não listados');

/**
 * As funções de um arquivo, com o texto dos parâmetros e do corpo.
 *
 * Só as formas com corpo entre chaves: `function nome(…) {…}`, `const nome = (…) => {…}` e
 * `const nome = function (…) {…}`. O que escapar disso é pego pela ATRIBUIÇÃO, no fim da seção.
 */
function funcoesDoArquivo(texto) {
  const achadas = [];
  const padrao = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*)?\(/g;
  let m;
  while ((m = padrao.exec(texto))) {
    const nome = m[1] || m[2];
    const params = recorteEquilibrado(texto, m.index + m[0].length - 1);
    if (!params) continue;
    let i = params.fim + 1;
    while (i < texto.length && /[\s=>]/.test(texto[i])) i++;
    if (texto[i] !== '{') continue;
    const corpo = recorteEquilibrado(texto, i);
    if (!corpo) continue;
    achadas.push({ nome, params: params.texto, corpo: corpo.texto, de: corpo.comeco, ate: corpo.fim });
  }
  return achadas;
}

/**
 * As posições em que `nome(` é uma CHAMADA neste texto — nunca uma definição.
 *
 * ⚠️ O método abreviado é a armadilha: `adopt(mesh) {` em `sandbox/ring-rig.js` tem a forma exata
 * de uma chamada e fez a varredura eleger um portal que não existe, acusando o chamador dele. Um
 * parêntese fechado seguido de `{` é sempre definição, e nunca chamada.
 */
function chamadasDe(texto, nome) {
  const busca = new RegExp(`\\b${nome}\\s*\\(`, 'g');
  const achadas = [];
  let m;
  while ((m = busca.exec(texto))) {
    const antes = texto.slice(Math.max(0, m.index - 24), m.index);
    if (/\bfunction\s+$/.test(antes) || /\bconst\s+[A-Za-z_$][\w$]*\s*=\s*$/.test(antes)) continue;
    const args = recorteEquilibrado(texto, m.index + nome.length);
    if (!args) continue;
    if (/^\s*\{/.test(texto.slice(args.fim + 1))) continue;
    achadas.push({ indice: m.index, args: args.texto });
  }
  return achadas;
}

/**
 * Quem cada nome importado é, de verdade.
 *
 * ⚠️ Sem isto o portal é um NOME solto, e nome não é identidade: `adopt` é um invólucro de widget
 * em `apps/widgets-core.js` e um método de anel em `sandbox/ring-rig.js`. A varredura segue o
 * import, então o portal é `<módulo>#<nome>` e só é visível em quem o importa.
 */
function importados(texto, arquivo) {
  const mapa = new Map();
  for (const m of texto.matchAll(/import\s*{([^}]*)}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!m[2].startsWith('.')) continue;
    const modulo = path.resolve(path.dirname(arquivo), m[2]);
    for (const parte of m[1].split(',')) {
      const [origem, apelido] = parte.trim().split(/\s+as\s+/).map((x) => x.trim());
      if (origem) mapa.set(apelido || origem, `${modulo}#${origem}`);
    }
  }
  return mapa;
}

/**
 * Os portais: `registerWidget` e toda função que o alcança repassando um objeto.
 *
 * `aceita` são as chaves que o portal deixa passar — as do padrão de desestruturação. Um
 * invólucro que desestrutura uma lista fixa ENGOLE o que não estiver nela, e é por isso que a
 * conferência da chave tem de ser feita contra o portal, não contra o vocabulário.
 */
const CHAVE_SEMENTE = `${path.join(RAIZ, 'src', 'kernel', 'registry.js')}#registerWidget`;
const portais = new Map([
  [CHAVE_SEMENTE, { nome: 'registerWidget', aceita: new Set(chavesVocabulario), padroes: new Map(), onde: 'src/kernel/registry.js' }],
]);

/** Os portais VISÍVEIS num arquivo: os que ele define e os que ele importa. `nome -> chave`. */
function portaisVisiveis(arquivo, texto) {
  const visiveis = new Map();
  for (const [nome, chave] of importados(texto, arquivo)) {
    if (portais.has(chave)) visiveis.set(nome, chave);
  }
  for (const [chave, portal] of portais) {
    if (chave.startsWith(`${arquivo}#`)) visiveis.set(portal.nome, chave);
  }
  return visiveis;
}

let cresceu = true;
while (cresceu) {
  cresceu = false;
  for (const { arquivo, texto } of fontes) {
    const visiveis = portaisVisiveis(arquivo, texto);
    for (const fn of funcoesDoArquivo(texto)) {
      if (portais.has(`${arquivo}#${fn.nome}`)) continue;
      if (![...visiveis.keys()].some((p) => chamadasDe(fn.corpo, p).length)) continue;
      const primeiro = fn.params.replace(/^\(/, '').trim();
      if (primeiro.startsWith('{')) {
        const literal = recorteEquilibrado(fn.params, 0 + fn.params.indexOf('{'));
        const membros = membrosDoLiteral(literal.texto);
        const padroes = new Map();
        const aceita = new Set();
        for (const membro of membros) {
          if (!membro.chave) continue;
          const [nome, padrao] = membro.valor === '(abreviado)'
            ? [membro.chave, null]
            : [membro.chave, membro.valor];
          aceita.add(nome);
          if (padrao) padroes.set(nome, padrao);
        }
        // Desestruturação com padrão escreve `hint = ''`, que o leitor de membros devolve como
        // chave sem `:` — recuperada aqui a partir do texto cru do parâmetro.
        for (const m of literal.texto.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*([^,}]+)/g)) {
          aceita.add(m[1]);
          padroes.set(m[1], m[2].trim());
        }
        for (const m of literal.texto.matchAll(/(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)) aceita.add(m[1]);
        portais.set(`${arquivo}#${fn.nome}`, { nome: fn.nome, aceita, padroes, onde: `${rel(arquivo)}:${linhaDe(texto, fn.de)}` });
        cresceu = true;
      } else if (/^[A-Za-z_$][\w$]*\s*[,)]?$/.test(primeiro.replace(/\)$/, ''))) {
        // Repasse do objeto inteiro: o portal não engole nada, então aceita o vocabulário.
        portais.set(`${arquivo}#${fn.nome}`, {
          nome: fn.nome,
          aceita: new Set(chavesVocabulario),
          padroes: new Map(),
          onde: `${rel(arquivo)}:${linhaDe(texto, fn.de)}`,
        });
        cresceu = true;
      }
    }
  }
}

for (const portal of portais.values()) {
  console.log(`  portal ${portal.nome.padEnd(16)} ${portal.onde.padEnd(34)} aceita: ${[...portal.aceita].join(', ')}`);
}

/*
 * ☠️ Um invólucro NÃO pode ter padrão para chave que alguma fenda EXIGE: o padrão fabrica uma
 * decisão que o app nunca tomou, e o registro recebe um valor sem saber que ninguém o declarou.
 * É a forma exata que faz um portão em runtime parecer armado enquanto não alcança nada.
 */
const exigidasEmAlgumaFenda = new Set(SLOTS.flatMap((slot) => exigidasDaFenda(slot)));
for (const portal of portais.values()) {
  for (const chave of exigidasEmAlgumaFenda) {
    if (portal.padroes.has(chave)) {
      nota('§4', `o invólucro \`${portal.nome}\` (${portal.onde}) tem padrão \`${chave} = ${portal.padroes.get(chave)}\` — `
        + 'ele FABRICA a decisão que a fenda exige do app, e o registro não vê a ausência');
    }
  }
}

/** Toda chamada de portal em src/, atribuída a um corpo de invólucro ou a uma declaração. */
const declaracoes = [];
for (const { arquivo, texto } of fontes) {
  const visiveis = portaisVisiveis(arquivo, texto);
  const corposDePortal = funcoesDoArquivo(texto)
    .filter((fn) => portais.has(`${arquivo}#${fn.nome}`))
    .map((fn) => [fn.de, fn.ate]);
  for (const [nome, chave] of visiveis) {
    for (const chamada of chamadasDe(texto, nome)) {
      // Chamada DENTRO de um invólucro é repasse, não declaração: as chaves ali são as do
      // parâmetro, e auditá-las como se fossem de um app acusaria o invólucro por existir.
      if (corposDePortal.some(([de, ate]) => chamada.indice > de && chamada.indice < ate)) continue;
      declaracoes.push({
        arquivo: rel(arquivo),
        linha: linhaDe(texto, chamada.indice),
        portal: portais.get(chave),
        args: chamada.args,
      });
    }
  }
}

const porFenda = new Map(SLOTS.map((s) => [s, 0]));
const ids = new Map();
let aprovados = 0;

for (const d of declaracoes) {
  const problemas = [];
  const portal = d.portal;
  const literal = d.args && recorteEquilibrado(d.args, 1);
  if (!literal || !literal.texto.startsWith('{')) {
    problemas.push('o argumento não é um literal de objeto — a declaração não é auditável na fonte');
  } else {
    const membros = membrosDoLiteral(literal.texto);
    for (const membro of membros) {
      if (!membro.chave) problemas.push(`forma ${membro.forma} (\`${membro.texto}\`) — o portão não vê o que ela traz`);
    }
    const chaves = membros.filter((x) => x.chave).map((x) => x.chave);
    for (const chave of chaves) {
      if (!portal.aceita.has(chave)) {
        problemas.push(`\`${chave}\` não é chave de \`${portal.nome}\` — ela some antes do registro`);
      }
    }
    const id = membros.find((x) => x.chave === 'id')?.valor?.replace(/^['"]|['"]$/g, '');
    const slotBruto = membros.find((x) => x.chave === 'slot')?.valor ?? '';
    const slot = /^['"]([a-z]+)['"]$/.exec(slotBruto)?.[1];
    if (!slot) {
      problemas.push(`\`slot\` não é literal (\`${slotBruto || 'ausente'}\`) — a fenda não é auditável`);
    } else if (!SLOTS.includes(slot)) {
      problemas.push(`fenda \`${slot}\` não existe`);
    } else {
      porFenda.set(slot, porFenda.get(slot) + 1);
      for (const chave of exigidasDaFenda(slot)) {
        if (!chaves.includes(chave)) {
          problemas.push(`a fenda \`${slot}\` exige \`${chave}\` DECLARADO e a declaração não o traz`);
        }
      }
      for (const chave of proibidasNaFenda(slot)) {
        const valor = membros.find((x) => x.chave === chave)?.valor;
        if (valor && valor !== 'false') problemas.push(`a fenda \`${slot}\` não lê \`${chave}\``);
      }
    }
    if (id) {
      if (ids.has(id)) problemas.push(`o id \`${id}\` já é declarado em ${ids.get(id)}`);
      else ids.set(id, `${d.arquivo}:${d.linha}`);
    }
  }
  if (!problemas.length) aprovados++;
  for (const p of problemas) nota('§4', `${d.arquivo}:${d.linha} — ${p}`);
  const marca = problemas.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
  if (problemas.length) {
    console.log(`  ${marca} ${`${d.arquivo}:${d.linha}`.padEnd(30)} ${problemas.join(' · ').slice(0, 120)}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────── §5 o censo, medido

console.log('\n\x1b[1m§5 O CENSO\x1b[0m  \x1b[2m(medida, não lei — o número de hoje sai desta varredura)\x1b[0m');
console.log(`  ${declaracoes.length} declarações de widget em src/ · ${aprovados} passam pelo portão · ${declaracoes.length - aprovados} não`);
console.log(`  por fenda: ${[...porFenda].map(([s, n]) => `${s} ${n}`).join(' · ')}`);
console.log(`  ids distintos: ${ids.size}`);

if (!declaracoes.length) {
  nota('§4', 'nenhuma declaração de widget encontrada em src/ — a varredura envelheceu, e zero não é prova');
}

// ────────────────────────────────────────────────────────────────────────────────────── o veredito

if (falhas.length) {
  console.log(`\n\x1b[31m✗ A LEI CAIU — ${falhas.length} apontamento(s)\x1b[0m`);
  for (const f of falhas) console.log(`  \x1b[31m${f.secao}\x1b[0m ${f.texto}`);
  console.log(
    '\n  \x1b[33mChave que ninguém confere não erra: ela SOME. O widget nasce sem o que declarou\x1b[0m\n' +
      '  \x1b[33mprecisar, e o operador aprende que o contrato não significa nada.\x1b[0m'
  );
  process.exit(1);
}

console.log('\n\x1b[32m✓ a lei vale\x1b[0m  o contrato nomeia o que aceita, e a fenda recusa o que não pode ler.');
console.log(
  `  \x1b[2m${chavesVocabulario.length} chaves, todas com leitor · ${portais.size} portais descobertos ·\x1b[0m\n` +
    `  \x1b[2m${declaracoes.length} declarações auditadas na fonte, e o portão recusa as ${11} formas inválidas provadas na §3.\x1b[0m`
);
