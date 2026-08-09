#!/usr/bin/env node
/**
 * A LEI DOS RESIDENTES — o conjunto residente é DECLARADO num lugar só, e IMPOSTO no registro.
 *
 *     node scripts/lei-residentes.mjs      # sai 0 se a lei vale
 *
 * Não precisa de servidor nem de navegador: quem é residente é do código, não do céu.
 *
 * ## A lei
 *
 * ☠️ *"`context` entra em TODAS as listas, como `sky-time` e `timeline`"* estava escrito em DOIS
 * lugares — `OS-SCREENS.md` §0 e um comentário de `apps/index.js` — e imposto em NENHUM.
 * `#/security` era a única das dez rotas sem `timeline`, e nada acusava: o widget não fica vazio,
 * ele simplesmente não existe ali, e a tela não sabe distinguir isso de um painel recolhido pelo
 * operador. **Declarar uma invariante não a implementa** — esta base pagou essa forma cinco vezes.
 *
 * A lei tem quatro faces, e é preciso as quatro:
 *
 * 1. **A declaração** (`RESIDENTES`, `apps/residentes.js`) — dado congelado, cada id com a frase
 *    de por que não pode sair da tela. Sem a frase, o próximo a enxugar uma lista de nove itens
 *    tira o residente sem saber o que está tirando.
 * 2. **O portão** (`declararApp`/`declararVista`) — a recusa é NO REGISTRO, alta, como a da tecla
 *    com dois donos, e ANTES de registrar: recusa com resíduo deixa um app metade dentro.
 * 3. **A varredura** — toda rota de `src/` passa pelo portão, e ninguém alcança o `registerApp` do
 *    kernel por fora. A rota raiz não é app: um portão montado só no `registerApp` deixaria a
 *    décima rota — a inicial — de fora.
 * 4. **A segunda fonte** — o doc normativo aponta para a declaração em vez de transcrevê-la. Foi a
 *    transcrição que divergiu, não o código.
 *
 * ⚠️ **Por que a §3 varre a FONTE.** O portão em runtime só vê o que chega até ele: um app novo que
 * importe `registerApp` direto do kernel nunca passa por `declararApp`, e o boot segue verde com a
 * rota faltando um residente. A varredura audita a DECLARAÇÃO, onde a ausência ainda é visível — e
 * **forma que ela não consegue atribuir é ACUSADA**, nunca tolerada: foi uma lista branca que
 * deixou o `splash.js` escrever na tela sem oráculo nenhum saber.
 *
 * ## O que ele NÃO prova
 *
 * - **Nada sobre a TELA.** Que o widget montado apareça, que caiba na altura da fenda, que o
 *   operador não o tenha recolhido (`espatial.collapsed.v1`): isso é quadro, e quadro se mede com
 *   `spatia.hud()`.
 * - **Que a lista de residentes seja a CERTA.** Ela é decisão de produto; a lei prova que ela é
 *   única, que tem motivo escrito e que ninguém a contorna.
 * - **App registrado fora de `src/`.** Nada aqui alcança código que não esteja na árvore.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerWidget, listApps, SLOTS, ROUTE_ROOT } from '../src/kernel/registry.js';
import {
  RESIDENTES,
  ehResidente,
  listarResidentes,
  residentesAusentes,
  declararApp,
  declararVista,
} from '../src/apps/residentes.js';

/*
 * ⚠️ A RAIZ sai de `import.meta.url` e SÓ dela. Raiz por argumento ou caminho de máquina faz o
 * oráculo auditar a árvore de origem enquanto roda sobre uma CÓPIA mutada — ele sai verde
 * atestando um guarda que a cópia não tem. Aconteceu quatro vezes nesta base.
 */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRO_DO_KERNEL = path.join(RAIZ, 'src', 'kernel', 'registry.js');
/** O único arquivo por onde o `registerApp` do kernel pode entrar. */
const PORTA_UNICA = path.join(RAIZ, 'src', 'apps', 'residentes.js');
/** O doc normativo que descreve o conjunto — e a seção que não pode transcrevê-lo. */
const DOC = path.join(RAIZ, 'docs', 'OS-SCREENS.md');
const SECAO_DO_DOC = 'O conjunto residente';

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
 * ⚠️ Sem isto a varredura lê a prosa: este repositório escreve comentários longos de propósito, e
 * o comentário que EXPLICA os residentes cita `'timeline'` entre aspas dentro do próprio manifesto.
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

/** Os membros de nível 1 de um literal (`{…}` ou `[…]`) — chave, valor e a FORMA quando não é chave. */
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

/** O valor de uma chave, se ela for uma string literal; `null` em qualquer outra forma. */
const textoLiteral = (v) => (v && /^(['"])([^'"]*)\1$/.test(v) ? v.slice(1, -1) : null);

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

/** As chamadas de `nome(` num texto — nunca definições. */
function chamadasDe(texto, nome) {
  const busca = new RegExp(`\\b${nome}\\s*\\(`, 'g');
  const achadas = [];
  let m;
  while ((m = busca.exec(texto))) {
    // Definição do próprio nome, nunca chamada dele. ⚠️ Não vale testar `const X = $`: a atribuição
    // do RESULTADO (`export const SYSTEM_VIEW = declararVista(…)`) tem essa forma, e descartá-la
    // deixava a rota raiz — a décima, a inicial — fora da varredura inteira.
    const antes = texto.slice(Math.max(0, m.index - 24), m.index);
    if (/\b(function|const|let|var)\s+$/.test(antes)) continue;
    const args = recorteEquilibrado(texto, m.index + nome.length);
    if (!args) continue;
    // Parêntese fechado seguido de `{` é definição de método abreviado, nunca chamada.
    if (/^\s*\{/.test(texto.slice(args.fim + 1))) continue;
    achadas.push({ indice: m.index, args: args.texto });
  }
  return achadas;
}

const fontes = todosOsFontes(path.join(RAIZ, 'src')).map((arquivo) => ({
  arquivo,
  texto: semComentarios(fs.readFileSync(arquivo, 'utf8')),
}));

console.log('\x1b[1mLEI DOS RESIDENTES — declarado num lugar só, imposto no registro\x1b[0m');
console.log(`  residentes: ${listarResidentes().join(', ')}`);
console.log(`  ${fontes.length} fontes em src/ · porta única: ${rel(PORTA_UNICA)}`);

// ────────────────────────────────────────────────── §0 os widgets declarados, medidos na fonte

/**
 * Todo widget declarado em `src/`: `id -> {slot, onde}`.
 *
 * A declaração é reconhecida pela FORMA (um literal de argumento com `id` e `slot` em string, e o
 * `slot` sendo uma FENDA de verdade), não pelo nome de quem a recebe — assim `adopt`, `listWidget`
 * e `registerWidget` entram sem serem listados, e um invólucro novo entra também.
 *
 * ⚠️ Duas formas vizinhas NÃO são declaração, e distingui-las é o trabalho:
 * - `{ id, slot }` abreviado é REPASSE dentro de um invólucro — quem declara escreve o id;
 * - `VOCABULARIO_DO_WIDGET` (`kernel/registry.js`) tem as duas chaves e é a tabela que DESCREVE o
 *   que elas são; o valor de `slot` ali é uma frase, não uma fenda.
 *
 * Qualquer mistura das duas formas — id de widget com fenda que não existe, ou uma das duas
 * chaves computada — é ACUSADA, porque é aí que uma declaração de verdade escaparia da varredura.
 */
const widgetsDeclarados = new Map();
for (const { arquivo, texto } of fontes) {
  for (const m of texto.matchAll(/\(\s*\{/g)) {
    const literal = recorteEquilibrado(texto, m.index + m[0].length - 1);
    if (!literal) continue;
    const membros = membrosDoLiteral(literal.texto);
    const idBruto = membros.find((x) => x.chave === 'id')?.valor;
    const slotBruto = membros.find((x) => x.chave === 'slot')?.valor;
    if (idBruto === undefined || slotBruto === undefined) continue;
    const id = textoLiteral(idBruto);
    const slot = textoLiteral(slotBruto);
    const onde = `${rel(arquivo)}:${linhaDe(texto, m.index)}`;
    const pareceId = id !== null && /^[a-z][a-z0-9-]*$/.test(id);
    if (id === null && slot === null) continue;
    if (!pareceId && (slot === null || !SLOTS.includes(slot))) continue;
    if (id === null || slot === null) {
      nota('§0', `${onde} — declaração de widget com ${id === null ? '`id`' : '`slot`'} não literal `
        + '(`' + (id === null ? idBruto : slotBruto).slice(0, 24) + '`) — a varredura não consegue atribuí-la');
      continue;
    }
    if (!SLOTS.includes(slot)) {
      nota('§0', `${onde} — o widget \`${id}\` declara a fenda \`${slot}\`, que não existe`);
      continue;
    }
    if (!widgetsDeclarados.has(id)) widgetsDeclarados.set(id, { slot, onde });
  }
}

// ─────────────────────────────────────────────────────────── §1 a declaração, conferida contra si

console.log('\n\x1b[1m§1 A DECLARAÇÃO\x1b[0m  congelada, com o motivo de cada residente');

if (!Object.isFrozen(RESIDENTES)) nota('§1', '`RESIDENTES` não está congelado — a tabela é mutável em runtime');
if (!listarResidentes().length) nota('§1', '`RESIDENTES` está vazio — conjunto residente vazio não é lei, é ausência de lei');
for (const [id, frase] of Object.entries(RESIDENTES)) {
  if (typeof frase !== 'string' || frase.length < 40) {
    nota('§1', `\`${id}\` não diz por que é residente — sem o motivo, o próximo a enxugar uma lista o tira sem saber o que tira`);
  }
  const declarado = widgetsDeclarados.get(id);
  if (!declarado) {
    nota('§1', `\`${id}\` é residente e não é um widget declarado em src/ — exigência impossível, toda rota morreria no registro`);
  }
  console.log(`  ${declarado ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${id.padEnd(10)} ${(declarado?.slot ?? '\x1b[31mnão existe\x1b[0m').padEnd(8)} ${String(frase).slice(0, 72)}…`);
}

// Os leitores respondem sobre a tabela, e não sobre uma cópia sua.
if (listarResidentes().some((id) => !ehResidente(id))) nota('§1', '`ehResidente` discorda de `RESIDENTES`');
if (ehResidente('nao-existe-este-widget')) nota('§1', '`ehResidente` diz sim para um id que não está na tabela');
if (residentesAusentes(listarResidentes()).length) nota('§1', '`residentesAusentes` acusa falta numa lista completa');
// ☠️ `null` ≠ `0`: lista ausente não é "vista sem residentes", é vista que não decidiu nada.
if (residentesAusentes(undefined).length !== listarResidentes().length) {
  nota('§1', '`residentesAusentes(undefined)` não devolve TODOS — lista ausente estaria passando como vista completa');
}

// ───────────────────────────────────────── §2 o portão: manifestos inválidos enfiados no de verdade

console.log('\n\x1b[1m§2 O PORTÃO\x1b[0m  manifestos enfiados no `declararApp` de verdade');

const mount = () => undefined;
let sequencia = 0;
const idProva = () => `lei-residentes-${sequencia++}`;
// Os residentes existem como widget neste processo, senão o kernel recusaria por outro motivo e a
// prova estaria medindo a recusa errada.
for (const id of listarResidentes()) registerWidget({ id, title: 'T', slot: 'left', mount });
registerWidget({ id: 'lei-residentes-extra', title: 'T', slot: 'left', mount });

const completa = () => [...listarResidentes(), 'lei-residentes-extra'];

function tentar(fn) {
  try {
    fn();
    return null;
  } catch (erro) {
    return erro;
  }
}

/* As mutações provadas, contadas onde acontecem — número escrito à mão envelhece sozinho. */
let provasDeRecusa = 0;
let provasDeAceite = 0;

/** O portão tem de RECUSAR — nomeando o culpado e o que falta, e sem deixar resíduo no registro. */
function recusa(rotulo, fn, { nomeia = [] } = {}) {
  provasDeRecusa++;
  const antes = listApps().length;
  const erro = tentar(fn);
  const depois = listApps().length;
  let ok = true;
  if (!erro) {
    nota('§2', `o portão ACEITOU ${rotulo} — a recusa não existe`);
    ok = false;
  } else if (depois !== antes) {
    nota('§2', `${rotulo} foi recusado e MESMO ASSIM entrou no registro — recusa com resíduo`);
    ok = false;
  } else {
    for (const parte of nomeia) {
      if (!String(erro.message).includes(parte)) {
        nota('§2', `${rotulo} foi recusado sem nomear \`${parte}\`: "${erro.message.slice(0, 90)}"`);
        ok = false;
      }
    }
  }
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} recusa  ${rotulo.padEnd(52)} \x1b[2m${erro ? erro.message.slice(0, 46) : 'ACEITOU'}\x1b[0m`);
}

/** O portão tem de ACEITAR — senão a lei estaria proibindo a rota legítima. */
function aceita(rotulo, fn) {
  provasDeAceite++;
  const erro = tentar(fn);
  if (erro) nota('§2', `o portão RECUSOU ${rotulo}: ${erro.message}`);
  console.log(`  ${erro ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'} aceita  ${rotulo.padEnd(52)} \x1b[2m${erro ? erro.message.slice(0, 46) : ''}\x1b[0m`);
}

aceita('a rota que monta o conjunto inteiro', () => declararApp({ id: idProva(), name: 'P', widgets: completa() }));
aceita('a mesma lista fora de ordem', () => declararApp({ id: idProva(), name: 'P', widgets: [...completa()].reverse() }));

// ☠️ A prova que interessa: CADA residente, um por vez. Provar só com um deles atestaria uma
// guarda que vale para um id e nada diz sobre os outros — foi assim que uma lei ficou cega.
for (const alvo of listarResidentes()) {
  recusa(
    `a rota sem \`${alvo}\``,
    () => declararApp({ id: idProva(), name: 'P', widgets: completa().filter((w) => w !== alvo) }),
    { nomeia: [alvo, RESIDENTES[alvo].slice(0, 24)] }
  );
}
recusa('a rota sem `widgets` nenhum', () => declararApp({ id: idProva(), name: 'P' }), { nomeia: listarResidentes() });
recusa('a rota com `widgets: []`', () => declararApp({ id: idProva(), name: 'P', widgets: [] }), { nomeia: listarResidentes() });

// O invólucro não pode ENGOLIR as recusas de baixo: quem confere residentes continua sendo o
// mesmo que confere widget inexistente e tecla com dois donos.
recusa(
  'o widget inexistente (a recusa do kernel continua de pé)',
  () => declararApp({ id: idProva(), name: 'P', widgets: [...completa(), 'nao-existe'] }),
  { nomeia: ['nao-existe'] }
);
const idRepetido = idProva();
aceita('o primeiro dono do id', () => declararApp({ id: idRepetido, name: 'P', widgets: completa() }));
recusa('o id já registrado', () => declararApp({ id: idRepetido, name: 'P', widgets: completa() }), { nomeia: [idRepetido] });

// A rota raiz não é app, e é a décima: sem portão próprio ela ficaria fora da lei inteira.
aceita('a vista sem app, completa', () => declararVista('prova', completa()));
recusa('a vista sem app, incompleta', () => declararVista('prova', ['lei-residentes-extra']), { nomeia: listarResidentes() });
const vista = declararVista('prova', completa());
if (!Object.isFrozen(vista)) nota('§2', '`declararVista` devolve lista MUTÁVEL — a vista mudaria depois do boot');
if (vista.join() !== completa().join()) nota('§2', '`declararVista` mudou a lista que recebeu');

// ────────────────────────────────────── §3 a varredura: toda rota passa pelo portão, ninguém por fora

console.log('\n\x1b[1m§3 A VARREDURA\x1b[0m  toda rota pelo portão, e o kernel só pela porta única');

/** O que cada import traz, resolvido para caminho absoluto. */
function importacoes(texto, arquivo) {
  const saida = [];
  for (const m of texto.matchAll(/import\s*{([^}]*)}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!m[2].startsWith('.')) continue;
    const modulo = path.resolve(path.dirname(arquivo), m[2]);
    for (const parte of m[1].split(',')) {
      const [origem, apelido] = parte.trim().split(/\s+as\s+/).map((x) => x.trim());
      if (origem) saida.push({ modulo, origem, nome: apelido || origem, indice: m.index });
    }
  }
  return saida;
}

for (const { arquivo, texto } of fontes) {
  if (arquivo === PORTA_UNICA) continue;
  for (const imp of importacoes(texto, arquivo)) {
    if (imp.modulo === REGISTRO_DO_KERNEL && imp.origem === 'registerApp') {
      nota('§3', `${rel(arquivo)}:${linhaDe(texto, imp.indice)} importa \`registerApp\` do kernel — `
        + `a rota declarada aí NÃO passa pelo portão dos residentes. A porta é ${rel(PORTA_UNICA)}`);
    }
  }
  for (const chamada of chamadasDe(texto, 'registerApp')) {
    nota('§3', `${rel(arquivo)}:${linhaDe(texto, chamada.indice)} chama \`registerApp\` direto — o portão dos residentes fica por fora`);
  }
}

/** As rotas declaradas na fonte: `declararApp({…})` e `declararVista(id, [...])`. */
const rotas = [];
for (const { arquivo, texto } of fontes) {
  const visiveis = new Set(
    importacoes(texto, arquivo)
      .filter((imp) => imp.modulo === PORTA_UNICA && ['declararApp', 'declararVista'].includes(imp.origem))
      .map((imp) => imp.nome)
  );
  if (arquivo === PORTA_UNICA) continue;
  for (const nome of visiveis) {
    for (const chamada of chamadasDe(texto, nome)) {
      const onde = `${rel(arquivo)}:${linhaDe(texto, chamada.indice)}`;
      const argumentos = membrosDoLiteral(chamada.args);
      // `declararApp({…})` tem um argumento; `declararVista(id, [...])` tem dois.
      const literal = argumentos[argumentos.length - 1]?.texto ?? argumentos[argumentos.length - 1]?.valor ?? '';
      const bruto = chamada.args.slice(1, -1).trim();
      const manifesto = bruto.startsWith('{') ? recorteEquilibrado(bruto, 0)?.texto : null;
      if (manifesto) {
        const membros = membrosDoLiteral(manifesto);
        const id = textoLiteral(membros.find((x) => x.chave === 'id')?.valor ?? '');
        const listaBruta = membros.find((x) => x.chave === 'widgets')?.valor;
        rotas.push({ onde, id, listaBruta, forma: 'app' });
        continue;
      }
      // A vista: primeiro argumento é a rota, último é a lista. A rota vem da constante do kernel
      // (`ROUTE_ROOT`) e não de uma string solta — o id reservado tem um dono só.
      const virgula = bruto.indexOf(',');
      const lista = virgula > 0 ? bruto.slice(virgula + 1).trim() : null;
      if (lista && lista.startsWith('[')) {
        const idBruto = bruto.slice(0, virgula).trim();
        rotas.push({
          onde,
          id: textoLiteral(idBruto) ?? (idBruto === 'ROUTE_ROOT' ? ROUTE_ROOT : null),
          listaBruta: lista,
          forma: 'vista',
        });
        continue;
      }
      nota('§3', `${onde} — a declaração de rota não é auditável na fonte (\`${(literal || bruto).slice(0, 40)}\`) — `
        + 'o portão em runtime a alcança, esta varredura não, e o que ela não atribui é acusado');
    }
  }
}

const porRota = [];
for (const rota of rotas) {
  const nome = rota.id ?? '(id não literal)';
  if (rota.id === null) {
    nota('§3', `${rota.onde} — a rota não declara \`id\` literal, e uma rota sem nome não é auditável`);
  }
  if (!rota.listaBruta || !rota.listaBruta.startsWith('[')) {
    nota('§3', `${rota.onde} — \`widgets\` não é uma lista literal (\`${String(rota.listaBruta).slice(0, 30)}\`)`);
    continue;
  }
  const membros = membrosDoLiteral(recorteEquilibrado(rota.listaBruta, 0).texto);
  const ids = [];
  let opaca = false;
  for (const membro of membros) {
    const valor = membro.chave ? `${membro.chave}` : membro.texto;
    const literal = textoLiteral(membro.chave ? membro.valor : membro.texto);
    if (literal === null) {
      nota('§3', `${rota.onde} — a rota \`${nome}\` traz um item que não é id literal (\`${String(valor).slice(0, 24)}\`)`);
      opaca = true;
      continue;
    }
    ids.push(literal);
  }
  if (opaca) continue;
  const faltando = residentesAusentes(ids);
  if (faltando.length) {
    nota('§3', `a rota \`${nome}\` (${rota.onde}) não monta ${faltando.join(', ')} — `
      + faltando.map((id) => `\`${id}\`: ${RESIDENTES[id]}`).join(' — '));
  }
  porRota.push({ nome, onde: rota.onde, forma: rota.forma, ids, faltando });
}

if (!porRota.length) {
  nota('§3', 'nenhuma rota encontrada em src/ — a varredura envelheceu, e zero não é prova');
}
/*
 * ☠️ A rota raiz NÃO é app: ela é uma lista exportada, e voltar a escrevê-la como literal a tira do
 * portão sem tirar da tela. É a rota INICIAL — a que o operador vê antes de navegar para qualquer
 * coisa —, então ela é justamente a que ninguém percebe faltando um residente.
 */
if (!porRota.some((r) => r.forma === 'vista' && r.nome === ROUTE_ROOT)) {
  nota('§3', `a rota raiz (\`${ROUTE_ROOT}\`) não é declarada por \`declararVista\` — ela não passa pelo `
    + 'registro de apps, então um portão montado só no `registerApp` deixa de fora a rota inicial');
}
for (const r of porRota) {
  const marca = r.faltando.length ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
  console.log(`  ${marca} ${r.nome.padEnd(10)} ${String(r.ids.length).padStart(2)} widgets  ${r.onde.padEnd(26)} ${r.faltando.length ? `\x1b[31mfalta ${r.faltando.join(', ')}\x1b[0m` : ''}`);
}

// ─────────────────────────────────────────── §4 a segunda fonte: o doc aponta, não transcreve

console.log('\n\x1b[1m§4 A SEGUNDA FONTE\x1b[0m  o doc normativo aponta para a declaração');

const doc = fs.readFileSync(DOC, 'utf8');
const abre = doc.indexOf(SECAO_DO_DOC);
if (abre < 0) {
  nota('§4', `${rel(DOC)} não tem mais a seção "${SECAO_DO_DOC}" — o vocabulário perdeu o dono, e ele não tem outro`);
} else {
  const resto = doc.slice(abre + SECAO_DO_DOC.length);
  const fim = resto.search(/\n#{2,4} /);
  const secao = fim < 0 ? resto : resto.slice(0, fim);
  const apontaParaOCodigo = /residentes\.js|RESIDENTES/.test(secao);
  if (!apontaParaOCodigo) {
    nota('§4', `a seção "${SECAO_DO_DOC}" de ${rel(DOC)} não cita a declaração (\`RESIDENTES\`, \`apps/residentes.js\`) — `
      + 'doc que descreve sem apontar é a segunda fonte que já divergiu uma vez');
  }
  // Todo id de widget citado ali é uma transcrição: ou ele é residente, ou o doc nomeia como
  // residente algo que não é. E citar UM obriga a citar TODOS, senão a divergência volta por omissão.
  const citados = new Set();
  for (const m of secao.matchAll(/`([^`]+)`/g)) {
    const token = m[1].replace(/^core\./, '');
    if (!/^[a-z][a-z0-9-]*$/.test(token)) continue;
    if (ehResidente(token)) {
      citados.add(token);
    } else if (widgetsDeclarados.has(token) || m[1].startsWith('core.')) {
      nota('§4', `a seção "${SECAO_DO_DOC}" nomeia \`${m[1]}\` como residente e ele não está em \`RESIDENTES\` — `
        + 'é a transcrição divergindo, que é o defeito que esta lei fecha');
    }
  }
  if (citados.size && citados.size !== listarResidentes().length) {
    nota('§4', `a seção "${SECAO_DO_DOC}" transcreve ${citados.size} dos ${listarResidentes().length} residentes — `
      + `divergência por omissão. Falta ${listarResidentes().filter((id) => !citados.has(id)).join(', ')}`);
  }
  console.log(`  ${apontaParaOCodigo ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${rel(DOC)} · "${SECAO_DO_DOC}" · ${secao.trim().split('\n').length} linhas · ${citados.size} residentes transcritos`);
}

// ─────────────────────────────────────────────────────────────────────────────── §5 o censo, medido

console.log('\n\x1b[1m§5 O CENSO\x1b[0m  \x1b[2m(medida, não lei — o número de hoje sai desta varredura)\x1b[0m');

/*
 * ⚠️ Os PAINÉIS que a lista de referências duplica, e a pergunta do T-52: `memory` imprime o mesmo
 * `hit.source` das fontes `[1]`–`[6]` e `web-results` o mesmo `title` das `[7]`–`[24]`. Onde eles
 * não estão montados, a lista é a ÚNICA testemunha — a coluna abaixo é o que decide o conserto.
 */
const DUPLICADORES = ['memory', 'tools', 'plan', 'web-results'];
const cabecalho = `  ${'rota'.padEnd(10)} ${'n'.padStart(2)}  ${SLOTS.map((s) => s.padEnd(6)).join(' ')}  ${DUPLICADORES.map((d) => d.padEnd(11)).join(' ')}`;
console.log(`\x1b[2m${cabecalho}\x1b[0m`);
const emQuantasRotas = new Map();
for (const r of porRota) {
  const contagem = new Map(SLOTS.map((s) => [s, 0]));
  for (const id of r.ids) {
    emQuantasRotas.set(id, (emQuantasRotas.get(id) ?? 0) + 1);
    const slot = widgetsDeclarados.get(id)?.slot;
    if (slot) contagem.set(slot, contagem.get(slot) + 1);
  }
  const dup = DUPLICADORES.map((d) => (r.ids.includes(d) ? '\x1b[32msim\x1b[0m        ' : '\x1b[2mnão\x1b[0m        ')).join(' ');
  console.log(`  ${r.nome.padEnd(10)} ${String(r.ids.length).padStart(2)}  ${SLOTS.map((s) => String(contagem.get(s)).padEnd(6)).join(' ')}  ${dup}`);
}
console.log(
  `  \x1b[2m${porRota.length} rotas · ${widgetsDeclarados.size} widgets declarados · `
    + `residentes em ${listarResidentes().map((id) => `${id} ${emQuantasRotas.get(id) ?? 0}/${porRota.length}`).join(' · ')}\x1b[0m`
);
console.log(
  `  \x1b[2mos que a referência duplica: ${DUPLICADORES.map((d) => `${d} ${emQuantasRotas.get(d) ?? 0}/${porRota.length}`).join(' · ')}\x1b[0m`
);

/*
 * ⚠️ A fenda `strip` DECLARA residentes (`FENDAS.strip`, `kernel/registry.js`) e hoje hospeda quem
 * não é. Isto sai como MEDIDA e não como lei de propósito: mover um widget de fenda muda a tela, e
 * a régua da faixa (`index.html:707-710`, largura inteira) não é a do trilho de 230px — a decisão
 * é de produto e tem de ser vista, não deduzida aqui.
 */
const foraDeCasa = [...widgetsDeclarados].filter(([id, w]) => w.slot === 'strip' && !ehResidente(id));
if (foraDeCasa.length) {
  console.log(
    `  \x1b[33m⚠ na fenda \`strip\` (declarada RESIDENTES) mora quem não é: `
      + `${foraDeCasa.map(([id, w]) => `${id} (${w.onde}, ${emQuantasRotas.get(id) ?? 0}/${porRota.length} rotas)`).join(', ')}\x1b[0m`
  );
}

// ────────────────────────────────────────────────────────────────────────────────────── o veredito

if (falhas.length) {
  console.log(`\n\x1b[31m✗ A LEI CAIU — ${falhas.length} apontamento(s)\x1b[0m`);
  for (const f of falhas) console.log(`  \x1b[31m${f.secao}\x1b[0m ${f.texto}`);
  console.log(
    '\n  \x1b[33mResidente que falta numa rota não deixa fenda vazia: ele SOME, e some igual a um\x1b[0m\n'
      + '  \x1b[33mpainel que o operador recolheu. Declarar a invariante em prosa foi o que a perdeu.\x1b[0m'
  );
  process.exit(1);
}

console.log('\n\x1b[32m✓ a lei vale\x1b[0m  o conjunto residente é único, tem motivo escrito, e nenhuma rota o contorna.');
console.log(
  `  \x1b[2m${listarResidentes().length} residentes · ${porRota.length} rotas auditadas na fonte · `
    + `${provasDeRecusa} recusas e ${provasDeAceite} aceites provados por perturbação no portão de verdade.\x1b[0m`
);
