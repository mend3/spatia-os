#!/usr/bin/env node
/**
 * A LEI DO FOCO DE ENTRADA — o ENDEREÇO pedido vence o ÚLTIMO VISITADO.
 *
 * ## O que ela guarda
 *
 * Duas fontes respondem *"que corpo olhar"* quando a cena abre: o endereço (`#/files/<source>`) e
 * `prefs['camera.focus']`. São fatos de naturezas diferentes — um é PEDIDO, o outro é MEMÓRIA — e
 * sem uma regra a resposta sai da ordem em que app e topologia montam, que não é garantida. O
 * sintoma é a câmera voar até o astro pedido e ser puxada para outro em seguida.
 *
 * Três coisas nesse desenho falham **em silêncio**:
 *
 * 1. ☠️ **A ORDEM DE MONTAGEM decidindo.** A regra tem de valer nos DOIS sentidos — pedido antes da
 *    memória e pedido depois dela. Uma implementação que só cancele o pendente cobre um sentido, e
 *    o outro volta a depender de quem montou primeiro. §2 e §3.
 * 2. ☠️ **O PEDIDO PERDIDO.** Focar um astro cuja posição ainda não resolveu não dá erro: o laço de
 *    quadro solta o foco de quem não tem posição, e o pedido some no quadro seguinte. §4.
 * 3. ☠️ **A POSE DE OUTRO ASTRO.** A pose gravada (polar, distância) é do corpo da sessão anterior.
 *    Aplicá-la a um corpo PEDIDO enquadra o novo com o zoom do antigo. A origem tem de viajar com o
 *    alvo até a aplicação, e o ramo que a lê está varrido no fonte. §7 e §10.
 *
 * Roda em `node` sem navegador: `foco-de-entrada.js` é puro e não decide nada sozinho — ele devolve
 * a DECISÃO, e é isso que a torna afirmável aqui.
 *
 * Uso:  node scripts/lei-foco.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarFocoDeEntrada, ORIGEM } from '../src/space/foco-de-entrada.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = { erro: '\x1b[31m', ok: '\x1b[32m', fraco: '\x1b[2m', forte: '\x1b[1m', fim: '\x1b[0m' };
let falhas = 0;
const checar = (secao, cond, frase) => {
  if (cond) console.log(`  ${C.ok}✓${C.fim} ${C.fraco}${secao}${C.fim} ${frase}`);
  else {
    falhas += 1;
    console.log(`${C.erro}✗ ${secao} ${frase}${C.fim}`);
  }
};

const PEDIDO = 'repo/pedido.md';
const SALVO = 'repo/salvo.md';

console.log(`${C.forte}LEI DO FOCO DE ENTRADA${C.fim}  ${C.fraco}pedido × memória${C.fim}\n`);

// ─────────────────────────────────────────────────── §1 · A MEMÓRIA SOZINHA CONTINUA VALENDO

console.log(`${C.forte}§1  SEM PEDIDO, A MEMÓRIA MANDA${C.fim}`);
{
  const f = criarFocoDeEntrada();
  const desfecho = f.lembrar(SALVO, true);
  const pend = f.pendente();
  const aplicado = f.consumir();
  checar(
    '§1',
    desfecho === 'adiar' && pend.source === SALVO && aplicado.origem === ORIGEM.MEMORIA,
    'ninguém pediu nada: a sessão anterior volta, e a origem viaja como `memoria`'
  );

  const g = criarFocoDeEntrada();
  checar(
    '§1b',
    g.lembrar('', false) === 'sem-alvo' && g.pendente() === null,
    'memória vazia não agenda alvo nenhum'
  );
  const h = criarFocoDeEntrada();
  checar(
    '§1c',
    h.lembrar(SALVO, false) === 'sem-alvo' && h.pendente() === null,
    'alvo que o céu NÃO conhece não agenda — storage é entrada não confiável, e o astro pode ter ' +
      'saído da topologia entre as sessões'
  );
}

// ─────────────────────────────────── §2 e §3 · A REGRA VALE NOS DOIS SENTIDOS DE MONTAGEM

console.log(
  `\n${C.forte}§2  PEDIDO ANTES DA MEMÓRIA${C.fim}  ${C.fraco}o app monta antes da topologia${C.fim}`
);
{
  const f = criarFocoDeEntrada();
  const acao = f.pedir(PEDIDO, false);
  const desfecho = f.lembrar(SALVO, true);
  const alvo = f.consumir();
  checar(
    '§2',
    acao === 'adiar' && desfecho === 'cedeu' && alvo.source === PEDIDO,
    `a memória CEDE e o pendente continua sendo o pedido (${alvo.source})`
  );
}

console.log(
  `\n${C.forte}§3  PEDIDO DEPOIS DA MEMÓRIA${C.fim}  ${C.fraco}a topologia chega antes do app${C.fim}`
);
{
  const f = criarFocoDeEntrada();
  f.lembrar(SALVO, true);
  const naMemoria = f.pendente().source;
  f.pedir(PEDIDO, false);
  const alvo = f.consumir();
  checar(
    '§3',
    naMemoria === SALVO && alvo.source === PEDIDO && alvo.origem === ORIGEM.PEDIDO,
    `a memória já estava agendada (${naMemoria}) e o pedido a SOBRESCREVE (${alvo.source})`
  );
}

console.log(`\n${C.forte}§3b  E ELA NÃO VOLTA DEPOIS DE UM PEDIDO JÁ APLICADO${C.fim}`);
{
  const f = criarFocoDeEntrada();
  /* Pedido com posição resolvida: aplica na hora e NÃO deixa pendente. */
  const acao = f.pedir(PEDIDO, true);
  const desfecho = f.lembrar(SALVO, true);
  checar(
    '§3b',
    acao === 'aplicar' && f.pendente() === null && desfecho === 'cedeu',
    'sem pendente para inspecionar, a única testemunha do pedido é o registro — e a memória que ' +
      'chegasse aqui trocaria o astro que o operador acabou de pedir'
  );
}

// ───────────────────────────────────────────────── §4 · PEDIDO SEM POSIÇÃO É ADIADO, NÃO PERDIDO

console.log(`\n${C.forte}§4  O PEDIDO ESPERA A POSIÇÃO${C.fim}`);
{
  const semPos = criarFocoDeEntrada();
  const comPos = criarFocoDeEntrada();
  checar(
    '§4',
    semPos.pedir(PEDIDO, false) === 'adiar' && semPos.pendente().source === PEDIDO,
    'alvo sem posição resolvida ADIA — o laço de quadro solta o foco de quem não tem posição, e ' +
      'aplicar agora perderia o pedido sem erro nenhum'
  );
  checar(
    '§4b',
    comPos.pedir(PEDIDO, true) === 'aplicar' && comPos.pendente() === null,
    'com a posição resolvida aplica na hora, sem passar pela espera'
  );
}

// ─────────────────────────────────────────────────────── §5 · DESTRAVAR TAMBÉM É UM PEDIDO

console.log(`\n${C.forte}§5  DESTRAVAR É PEDIDO${C.fim}`);
{
  const f = criarFocoDeEntrada();
  const acao = f.pedir(null, false);
  const desfecho = f.lembrar(SALVO, true);
  checar(
    '§5',
    acao === 'aplicar' && desfecho === 'cedeu' && f.pendente() === null,
    'quem destravou não quer a sessão anterior de volta — `source` nulo aplica e a memória cede'
  );
}

// ─────────────────────────────────────────── §6 · MEMÓRIA RECUSADA NÃO RESSUSCITA

console.log(`\n${C.forte}§6  MEMÓRIA QUE CEDEU NÃO VOLTA${C.fim}`);
{
  const f = criarFocoDeEntrada();
  f.pedir(PEDIDO, false);
  const tentativas = [f.lembrar(SALVO, true), f.lembrar(SALVO, true), f.lembrar(SALVO, true)];
  checar(
    '§6',
    tentativas.every((t) => t === 'cedeu') && f.pendente().source === PEDIDO,
    `cedeu nas ${tentativas.length} tentativas — «cedeu» não pode ser um estado que se perde`
  );
}

// ────────────────────────────────────────── §7 · A ORIGEM VIAJA ATÉ A APLICAÇÃO

console.log(
  `\n${C.forte}§7  A ORIGEM CHEGA JUNTO COM O ALVO${C.fim}  ${C.fraco}é ela que decide a POSE${C.fim}`
);
{
  const mem = criarFocoDeEntrada();
  mem.lembrar(SALVO, true);
  const ped = criarFocoDeEntrada();
  ped.pedir(PEDIDO, false);
  checar(
    '§7',
    mem.consumir().origem === ORIGEM.MEMORIA && ped.consumir().origem === ORIGEM.PEDIDO,
    'consumir devolve a origem — a pose gravada é do astro da sessão anterior, e aplicá-la a um ' +
      'corpo PEDIDO enquadraria o novo com o zoom do antigo'
  );

  const d = criarFocoDeEntrada();
  d.lembrar(SALVO, true);
  const largado = d.desistir();
  checar(
    '§7b',
    largado.source === SALVO && d.pendente() === null,
    'desistir devolve o alvo largado e limpa a espera — o pedido não pode ressuscitar minutos ' +
      'depois e puxar a câmera de onde o operador já está'
  );
}

// ────────────────────────────────────── §8 · O ENDEREÇO PEDE AS DUAS METADES

console.log(`\n${C.forte}§8  O ENDEREÇO PEDE FOCO E LEITURA${C.fim}`);
{
  /*
   * ⚠️ Conferência no FONTE: o ramo do endereço vive dentro da montagem de um app, atrás do
   * kernel de widgets, e alcançá-lo exigiria montar a HUD inteira. O que pode falhar é alguém
   * tirar a metade do foco — e é isso que se varre.
   */
  const fonte = fs.readFileSync(path.join(RAIZ, 'src', 'apps', 'index.js'), 'utf8');
  const i = fonte.indexOf('} else if (ctx.arg) {');
  const ramo = i >= 0 ? fonte.slice(i, fonte.indexOf('\n      }', i)) : '';
  checar('§8', i >= 0, 'o ramo do endereço (`else if (ctx.arg)`) continua em `apps/index.js`');
  checar(
    '§8b',
    /ui\.focus-node/.test(ramo) && /handler\(\{\s*source:\s*ctx\.arg/.test(ramo),
    'ele pede FOCO e LEITURA, como o clique — abrir só o leitor entrega o texto sobre um céu que ' +
      'não sabe de que astro ele é, e o painel de conteúdo fica sem em que ancorar'
  );
}

// ────────────────────────────────── §9 · A POSE SALVA SÓ SE APLICA À MEMÓRIA

console.log(`\n${C.forte}§9  A POSE GRAVADA É DA MEMÓRIA, NUNCA DO PEDIDO${C.fim}`);
{
  const cena = fs.readFileSync(path.join(RAIZ, 'src', 'space', 'scene.js'), 'utf8');
  const i = cena.indexOf('function aplicarFocoPendente');
  const bloco = i >= 0 ? cena.slice(i, cena.indexOf('\n  }', cena.indexOf('startOrbit.distance', i))) : '';
  checar(
    '§9',
    i >= 0 && /startOrbit\.(polar|distance)/.test(bloco),
    'o bloco que restaura a pose continua em `aplicarFocoPendente`'
  );
  /* A restauração da pose tem de estar DENTRO de um ramo que testa a origem. */
  const j = bloco.indexOf('ORIGEM.MEMORIA');
  const k = bloco.indexOf('startOrbit.polar');
  checar(
    '§9b',
    j >= 0 && j < k,
    'e ela está dentro do ramo `origem === ORIGEM.MEMORIA` — sem o ramo, um corpo pedido por ' +
      'endereço nasceria com o zoom gravado para OUTRO astro'
  );
}

console.log('');
if (falhas) {
  console.log(`${C.erro}✗ ${falhas} falha(s)${C.fim}  o endereço pedido não vence o último visitado.`);
  process.exit(1);
}
console.log(
  `${C.ok}✓ a lei vale${C.fim}  ${C.fraco}pedido vence memória nos dois sentidos, o pedido ` +
    `espera a posição, e a pose gravada não atravessa para o corpo pedido.${C.fim}`
);
