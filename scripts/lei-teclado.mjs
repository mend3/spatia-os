#!/usr/bin/env node
/**
 * A LEI DO TECLADO — **nenhuma tecla sobrevive a perder o foco.** Este script PROVA isso.
 *
 *     node scripts/lei-teclado.mjs      # sai 0 se a lei vale
 *
 * ## Por que ele existe
 *
 * `src/core/keys.js` passou a responder *"esta tecla está pressionada AGORA?"*, que é o que
 * movimento contínuo precisa. Uma garantia nova nesta base custa uma prova: **declarar uma
 * invariante não a implementa** — a lua sem superfície, a força do vínculo, a expressão do pulso,
 * o `chegaPleno` e o motivo de upstream estavam todos escritos e ninguém os lia.
 *
 * A consequência de falhar é calada e chega depois: a tecla que estava no dedo quando a janela
 * perdeu o foco tem o seu `keyup` entregue a QUEM RECEBEU O FOCO, então ela fica pressionada para
 * sempre. Não há erro, não há log — só a nave que não para de acelerar quando o operador volta.
 *
 * ## O método: simular os eventos, não ler o código
 *
 * Um `window` e um `document` de mentira recebem os listeners reais do `install()`. Ler o arquivo
 * à procura de `addEventListener('blur')` provaria que a linha existe; simular prova que a linha
 * FAZ o que o cabeçalho promete — inclusive no caminho que ninguém lembra de testar (o ⌘ do macOS
 * engolindo o `keyup` das teclas combinadas com ele).
 *
 * A varredura final é aleatória de propósito: sequências escritas à mão testam o que o autor
 * imaginou, e o modo de falha aqui é justamente a ordem de eventos que ninguém imaginou.
 *
 * ⚠️ Isto prova a MÁQUINA DE ESTADO, não o navegador. Que o Chrome deixe de entregar o `keyup`
 * sob ⌘, e que o `blur` chegue quando a janela vai para trás, são fatos do navegador — sem
 * navegador não há como medi-los aqui, e é por isso que a simulação reproduz o pior caso de cada
 * um em vez de confiar que ele não acontece.
 */

/* Esboço de DOM. `import` é IÇADO — o módulo real só entra depois disto, por import dinâmico. */
function alvoDeEventos() {
  const porTipo = new Map();
  return {
    addEventListener(tipo, fn) {
      if (!porTipo.has(tipo)) porTipo.set(tipo, []);
      porTipo.get(tipo).push(fn);
    },
    emitir(tipo, evento = {}) {
      for (const fn of [...(porTipo.get(tipo) || [])]) fn({ type: tipo, ...evento });
    },
  };
}

const janela = alvoDeEventos();
const documento = alvoDeEventos();
documento.activeElement = null;
documento.hidden = false;
globalThis.window = janela;
globalThis.document = documento;

const keys = await import('../src/core/keys.js');
keys.install();

/** Um `keydown` com o que o módulo lê, e nada mais. */
const tecla = (code, extra = {}) => ({
  code,
  key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  target: null,
  preventDefault() {},
  ...extra,
});

const desce = (code, extra) => janela.emitir('keydown', tecla(code, extra));
const sobe = (code, extra) => janela.emitir('keyup', tecla(code, extra));
const perdeFoco = () => janela.emitir('blur', {});
const vaiParaOFundo = () => {
  documento.hidden = true;
  documento.emitir('visibilitychange', {});
  documento.hidden = false;
};

const CAMPO_DE_TEXTO = { tagName: 'INPUT', type: 'text', isContentEditable: false };
const SLIDER = { tagName: 'INPUT', type: 'range', isContentEditable: false };

const falhas = [];
let provas = 0;
function prova(nome, ok, detalhe = '') {
  provas++;
  if (!ok) falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

console.log(`\x1b[1mA LEI DO TECLADO — nenhuma tecla sobrevive a perder o foco\x1b[0m`);

/* ── 1. o fato de tecla pressionada existe ───────────────────────────────────────────────── */
desce('KeyW');
prova('keydown deixa a tecla pressionada', keys.isHeld('KeyW'));
prova('só a tecla pressionada', !keys.isHeld('KeyS'));
sobe('KeyW');
prova('keyup solta', !keys.isHeld('KeyW'));
prova('nada sobra', keys.heldCodes().length === 0, keys.heldCodes().join(','));

/* ── 2. A LEI: as três formas de perder o foco ───────────────────────────────────────────── */
desce('KeyW');
desce('KeyD');
perdeFoco();
prova('blur solta TUDO', keys.heldCodes().length === 0, keys.heldCodes().join(','));

desce('KeyW');
vaiParaOFundo();
prova('aba ao fundo solta tudo', keys.heldCodes().length === 0, keys.heldCodes().join(','));

/*
 * O caso que nenhuma sequência escrita à mão pega: com ⌘ embaixo, o `keyup` do `S` NÃO CHEGA.
 * Só sobe o próprio ⌘ — e é ele que tem de esvaziar o resto.
 */
desce('MetaLeft', { key: 'Meta', metaKey: true });
desce('KeyS', { metaKey: true });
sobe('MetaLeft', { key: 'Meta', metaKey: false });
prova('⌘ ao subir solta o que ele engoliu', keys.heldCodes().length === 0, keys.heldCodes().join(','));

/* ── 3. digitar não é comandar, e o fato físico continua legível ─────────────────────────── */
documento.activeElement = CAMPO_DE_TEXTO;
desce('KeyW');
prova('não vale como comando digitando', !keys.isHeld('KeyW'));
prova('o fato físico continua lá', keys.heldCodes().includes('KeyW'));
documento.activeElement = null;
prova('o mesmo dedo volta a valer fora do campo', keys.isHeld('KeyW'));
sobe('KeyW');

documento.activeElement = SLIDER;
desce('KeyW');
prova('slider é controle, não campo: vale como comando', keys.isHeld('KeyW'));
documento.activeElement = null;
sobe('KeyW');

/* ── 4. o que já existia não mudou ───────────────────────────────────────────────────────── */
let disparos = 0;
const solta = keys.bind({ code: 'KeyZ', label: 'TESTE', group: 'TESTE' }, () => disparos++);
desce('KeyZ');
prova('atalho ainda dispara', disparos === 1, `disparos=${disparos}`);
desce('KeyZ', { repeat: true });
prova('auto-repeat continua bloqueado', disparos === 1, `disparos=${disparos}`);
documento.activeElement = CAMPO_DE_TEXTO;
desce('KeyZ');
prova('atalho continua suprimido digitando', disparos === 1, `disparos=${disparos}`);
documento.activeElement = null;
sobe('KeyZ');

let duplicado = false;
try {
  keys.bind({ code: 'KeyZ', label: 'OUTRO' }, () => {});
} catch {
  duplicado = true;
}
prova('duplicidade continua falhando alto', duplicado);
solta();
prova('desregistrar tira do catálogo', !keys.list().some((e) => e.keys === 'Z'));

/* ── 5. a reserva: catálogo sem despacho ─────────────────────────────────────────────────── */
let despachou = 0;
const soltaReserva = keys.reserve({ code: 'KeyU', label: 'TROCAR CENA', group: 'CENA' });
janela.emitir('keydown', tecla('KeyU', { preventDefault: () => despachou++ }));
prova('reservada NÃO é despachada aqui', despachou === 0, `preventDefault=${despachou}`);
prova(
  'reservada aparece na lista',
  keys.list().some((e) => e.keys === 'U' && e.label === 'TROCAR CENA')
);
let reservaDuplicada = false;
try {
  keys.bind({ code: 'KeyU', label: 'OUTRA COISA' }, () => {});
} catch {
  reservaDuplicada = true;
}
prova('reservada entra na guarda de duplicidade', reservaDuplicada);
soltaReserva();
sobe('KeyU');

/* ── 6. varredura aleatória — a ordem que ninguém imaginou ───────────────────────────────── */
const CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'];
let semente = 20260809;
const sorteio = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/** O último evento visto por tecla — modelo por TECLA, não cópia da implementação. */
const ultimo = new Map();
let fantasmas = 0;
let presas = 0;

for (let i = 0; i < 4000; i++) {
  const dado = sorteio();
  const code = CODES[Math.floor(sorteio() * CODES.length)];
  if (dado < 0.45) {
    desce(code);
    ultimo.set(code, 'down');
  } else if (dado < 0.8) {
    sobe(code);
    ultimo.set(code, 'up');
  } else if (dado < 0.9) {
    perdeFoco();
    for (const k of CODES) ultimo.set(k, 'up');
    if (keys.heldCodes().length) presas++;
  } else {
    vaiParaOFundo();
    for (const k of CODES) ultimo.set(k, 'up');
    if (keys.heldCodes().length) presas++;
  }
  // Nenhuma tecla pode estar pressionada sem um `keydown` sem par antes dela.
  for (const code2 of keys.heldCodes()) if (ultimo.get(code2) !== 'down') fantasmas++;
}
prova('4 000 eventos: nenhuma tecla presa depois de perder o foco', presas === 0, `${presas} vezes`);
prova('4 000 eventos: nenhuma tecla pressionada sem keydown', fantasmas === 0, `${fantasmas} vezes`);

perdeFoco();
prova('estado final limpo', keys.heldCodes().length === 0, keys.heldCodes().join(','));

console.log(`  provas: ${provas}`);
if (falhas.length) {
  console.log(`\n\x1b[31m✗ ${falhas.length} VIOLAÇÕES\x1b[0m`);
  for (const f of falhas) console.log(`  ${f}`);
  console.log(`\n  \x1b[33mUma tecla presa não tem sintoma além do movimento que não para.\x1b[0m`);
  process.exit(1);
}
console.log(
  `\n\x1b[32m✓ a lei vale\x1b[0m  nenhuma tecla sobrevive a blur, a aba ao fundo ou ao ⌘ que engole o keyup.`
);
console.log(
  `  \x1b[2me o despacho de atalho continua idêntico: dispara, bloqueia repeat, cala digitando.\x1b[0m`
);
