/**
 * O ORÁCULO DA TELA — prova que o dono único é único, que a pilha não mente e que não há laço.
 *
 * Roda em node, sem navegador e sem GPU: `core/tela.js` e `core/bus.js` são puros (nenhum
 * `document`, nenhum `three`). O que ele NÃO prova está dito no fim da saída.
 *
 * Uso: node lei-tela.mjs        (sai 0 quando as leis valem)
 */
import { readFileSync, readdirSync } from 'node:fs';

/*
 * ☠️ A raiz sai do PRÓPRIO arquivo, nunca de um caminho absoluto de máquina. Com o caminho fixo o
 * oráculo importa sempre a árvore daquela máquina: ele passa num clone que nem tem o código, e
 * — pior — passa ao ser rodado sobre uma CÓPIA MUTADA, atestando uma guarda que a cópia não tem.
 * É o mesmo defeito que o `AGENT_CWD` absoluto já custou uma vez.
 */
const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = (p) => readFileSync(`${RAIZ}/${p}`, 'utf8');
/** Sem a prosa: o comentário que EXPLICA por que a rota não mora ali satisfaria a lei que o proíbe. */
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

const bus = await import(`${RAIZ}/src/core/bus.js`);
const tela = await import(`${RAIZ}/src/core/tela.js`);

// ---------------------------------------------------------------- §1 pureza
const fonte = src('src/core/tela.js');
conferir(
  '§1 tela não importa cena, router nem DOM',
  !/from '\.\.\/(space|kernel|hud)\//.test(fonte) && !/\bdocument\b|\bwindow\b/.test(fonte)
);
conferir(
  '§1 tela importa só o barramento',
  [...fonte.matchAll(/^import .*from '(.+)';$/gm)].map((m) => m[1]).join(',') === './bus.js'
);

// -------------------------------------------------- §2 o vocabulário do catálogo
const recusa = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.message;
  }
};
conferir('§2 registrar recusa id ausente', Boolean(recusa(() => tela.registrar({}))));
conferir(
  '§2 registrar recusa chave desconhecida',
  Boolean(recusa(() => tela.registrar({ id: 'x1', aoEntrar: () => {} })))
);
tela.registrar({ id: 'splash' });
tela.registrar({ id: 'launcher' });
tela.registrar({ id: 'boot' });
conferir('§2 registrar recusa id duplicado', Boolean(recusa(() => tela.registrar({ id: 'splash' }))));

// ------------------------------------------- §3 só camada DECLARADA entra na frente
const antes = tela.estado().camada;
for (const impostor of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'nao-existe']) {
  tela.mostrar(impostor);
}
conferir(
  '§3 cadeia de protótipos não vira camada',
  tela.estado().camada === antes,
  `camada virou ${tela.estado().camada}`
);

// ---------------------------------------------------------------- §4 a pilha
tela.mostrar('boot');
conferir('§4 mostrar empilha', tela.estado().camadas.join('>') === 'mundo>boot');
tela.mostrar('splash');
tela.mostrar('launcher');
conferir(
  '§4 três camadas na ordem de entrada',
  tela.estado().camadas.join('>') === 'mundo>boot>splash>launcher'
);
tela.sair('splash');
conferir(
  '§4 sair do MEIO não derruba quem está acima',
  tela.estado().camadas.join('>') === 'mundo>boot>launcher' && tela.estado().camada === 'launcher'
);
tela.mostrar('boot');
conferir(
  '§4 mostrar de camada já empilhada trunca o que estava acima',
  tela.estado().camadas.join('>') === 'mundo>boot' && tela.estado().camada === 'boot'
);
tela.sair('boot');
conferir('§4 "a camada acabou" revela o de baixo sem nomeá-lo', tela.estado().camada === 'mundo');
tela.sair('mundo');
tela.sair('mundo');
conferir('§4 o piso nunca sai — a pilha nunca esvazia', tela.estado().camadas.join('>') === 'mundo');
conferir('§4 estado é congelado', Object.isFrozen(tela.estado()) && Object.isFrozen(tela.estado().camadas));

// ------------------------------------------- §5 sem laço, e sem anúncio à toa
let emitidos = 0;
const contarTela = () => {
  emitidos += 1;
};
bus.on('ui.tela', contarTela);
tela.mostrar('boot');
const umaTroca = emitidos;
tela.mostrar('boot');
tela.mostrar('boot');
conferir(
  '§5 commit sem mudança não anuncia',
  emitidos === umaTroca && umaTroca === 1,
  `${emitidos} emissões para 1 troca + 2 repetições`
);
bus.off('ui.tela', contarTela);
tela.sair('boot');

/*
 * O laço que a lição proíbe: quem escuta responde ATUANDO sobre o mesmo dono. Sem a trava do
 * `commit`, isto não termina.
 */
emitidos = 0;
const reentrante = () => {
  emitidos += 1;
  tela.mostrar('splash');
};
bus.on('ui.tela', reentrante);
tela.mostrar('boot');
bus.off('ui.tela', reentrante);
conferir(
  '§5 assinante que reage atuando ESTABILIZA',
  emitidos === 2 && emitidos < 10,
  `${emitidos} emissões`
);
tela.mostrar('mundo');

// ------------------------------------------- §6 espelho: escuta e anota, nunca manda de volta
const porTipo = new Map();
const espiao = (e) => porTipo.set(e.t, (porTipo.get(e.t) ?? 0) + 1);
bus.on('*', espiao);
tela.install({ cena: 'agente' });
bus.emit({ t: 'ui.scene-mode', modo: 'universo' });
bus.emit({ t: 'ui.route', route: 'journal', app: 'journal', arg: 'run-2026-08-09-01' });
bus.off('*', espiao);
conferir('§6 tela reflete a cena anunciada', tela.estado().cena === 'universo');
conferir(
  '§6 tela reflete a rota com a sub-rota',
  tela.estado().rota.id === 'journal' && tela.estado().rota.arg === 'run-2026-08-09-01'
);
/*
 * ⚠️ A trava do laço vive no `commit`, e o §5 NÃO a exercita: `mostrar` deduplica antes de chegar
 * lá, então tirar o `diferente()` deixava o §5 passar. Quem a exercita é o ESPELHO — o mesmo fato
 * anunciado duas vezes pelo dono dele. Sem a trava, um assinante de `ui.tela` que reaja atuando
 * volta a não terminar, e o oráculo atestaria uma guarda que não existe mais.
 */
const contarEspelho = () => {
  espelhadas += 1;
};
let espelhadas = 0;
bus.on('ui.tela', contarEspelho);
bus.emit({ t: 'ui.scene-mode', modo: 'universo' });
bus.emit({ t: 'ui.scene-mode', modo: 'universo' });
bus.emit({ t: 'ui.route', route: 'journal', app: 'journal', arg: 'run-2026-08-09-01' });
bus.off('ui.tela', contarEspelho);
conferir(
  '§6 fato REPETIDO pelo dono não reanuncia',
  espelhadas === 0,
  `${espelhadas} emissões de ui.tela para 3 anúncios sem novidade`
);

conferir(
  '§6 tela NUNCA emite ui.scene-mode nem ui.route',
  porTipo.get('ui.scene-mode') === 1 && porTipo.get('ui.route') === 1,
  `scene-mode ${porTipo.get('ui.scene-mode')} · route ${porTipo.get('ui.route')}`
);
conferir(
  '§6 install duas vezes não duplica assinatura',
  (() => {
    tela.install({ cena: 'agente' });
    let n = 0;
    const c = () => {
      n += 1;
    };
    bus.on('ui.tela', c);
    bus.emit({ t: 'ui.scene-mode', modo: 'agente' });
    bus.off('ui.tela', c);
    return n === 1;
  })()
);

// ------------------------------------------- §7 UMA verdade sobre a rota, contra as duas de hoje
const routerSrc = src('src/kernel/router.js');
const corte = (texto, inicio, fim) => {
  const a = texto.indexOf(inicio);
  const b = texto.indexOf(fim, a);
  if (a === -1 || b === -1) throw new Error(`âncora ausente em ${inicio}`);
  return texto.slice(a, b + fim.length);
};
const APPS = ['files', 'journal', 'system'];
const ROUTE_ROOT = corte(src('src/kernel/registry.js'), 'export const ROUTE_ROOT =', ';').match(
  /'([^']+)'/
)[1];
const janela = { location: { hash: '' } };
const parse = new Function(
  'window',
  'hasApp',
  'ROUTE_ROOT',
  `${corte(routerSrc, 'const decodeArg =', ".join('/');")}
   ${corte(routerSrc, '  function parse() {', '\n  }')}
   return parse;`
)(janela, (id) => APPS.includes(id), ROUTE_ROOT);
const CORPUS = [
  '',
  '#/',
  '#/files',
  '#/files/docs/EVENTS.md',
  '#/journal/run-2026-08-09-01',
  '#/journal',
  '#/bogus',
  '#/bogus/x',
  '#/files/nome%20com%20espaco',
  '#/files/%zz',
  '#files',
  '#/FILES',
];
let telaBate = 0;
for (const hash of CORPUS) {
  janela.location.hash = hash;
  const p = parse();
  const app = p.app === ROUTE_ROOT ? null : p.app;
  bus.emit({ t: 'ui.route', route: p.app, app, arg: p.arg });
  const t = tela.estado().rota;
  if (t.id === p.app && t.app === app && t.arg === p.arg) telaBate += 1;
}
conferir(
  '§7 tela repete o decodificador do kernel em todo endereço',
  telaBate === CORPUS.length,
  `${telaBate}/${CORPUS.length}`
);

/*
 * ☠️ **A SEGUNDA VERDADE SOBRE A ROTA NÃO PODE VOLTAR, e aqui havia uma MEDIDA onde agora há lei.**
 *
 * `core/session.js` guardava um `route` lido do HASH CRU, e este bloco contava quantos endereços
 * ele decodificava diferente do kernel: **7 de 12** (sub-rota, app inexistente, caixa, escape). Era
 * número, não guarda — ele reportava a divergência e deixava-a existir. O campo não tinha leitor em
 * `src/`, então quem o lesse por engano acertaria em 5 endereços e erraria nos outros 7 em silêncio.
 *
 * Apagado o campo, a contagem perde sujeito. O que fica é a proibição: um decodificador de rota é
 * uma superfície de divergência, e esta base já tem UM.
 */
conferir(
  '§7 session.js não guarda uma segunda rota',
  !/\broute\b/.test(semComentarios(src('src/core/session.js'))),
  'core/session.js menciona `route` fora de comentário'
);

/** Todo `.js` sob um diretório, relativo à RAIZ — o que separa varredura de lista branca. */
function varrer(dir) {
  const saida = [];
  for (const entrada of readdirSync(`${RAIZ}/${dir}`, { withFileTypes: true })) {
    const caminho = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) saida.push(...varrer(caminho));
    else if (entrada.name.endsWith('.js')) saida.push(caminho);
  }
  return saida;
}

// ------------------------------------------- §8 quem ESCREVE estado de tela
/*
 * ☠️ **VARREDURA, nunca lista branca.** Isto conferia quatro arquivos NOMEADOS, e por isso não viu
 * `hud/splash.js` nascer escrevendo na tela: um arquivo fora da lista escrevia à vontade e o
 * oráculo saía 0. Guarda que só olha onde já se sabe não é guarda — é a forma exata do defeito que
 * ela existe para pegar. Agora a varredura é de `src/` INTEIRO, e quem importar a `tela` sem estar
 * declarado aqui derruba a lei.
 *
 * ⚠️ Acrescentar um nome a `PERMITIDOS` é uma DECISÃO: cada escritor novo é mais um lugar de onde o
 * estado de tela pode sair, que é exatamente o que a `tela.js` existe para não haver.
 */
/*
 * ⚠️ **LER a tela não é ESCREVER nela, e a lei mede a segunda.** A varredura pegava qualquer
 * `import` de `core/tela.js` — e acusou um LEITOR legítimo (`hud/favoritos-ui.js` lê `estado()`
 * para saber que cena está na tela). Somar leitor à lista branca afrouxaria a lei; o que ela
 * precisa distinguir é quem MUTA a pilha: `registrar`, `mostrar`, `sair`, `install`.
 *
 * Leitor não é perigo: `estado()` devolve objeto congelado, e quem lê não cria dono novo. Quem
 * escreve, sim — cada escritor é mais um lugar de onde o estado de tela pode sair.
 */
const MUTADORES = ['registrar', 'mostrar', 'sair', 'install'];
const PERMITIDOS = ['src/hud/boot.js', 'src/main.js'];
const escritores = varrer('src')
  .filter((arquivo) => {
    const texto = src(arquivo);
    if (!/from '[^']*core\/tela\.js'/.test(texto)) return false;
    // O que ele IMPORTA da tela decide: só quem traz um mutador é escritor.
    // Duas formas de importar, e as duas precisam ser cobertas — foi um `import * as` que
    // escapou da primeira versão desta guarda.
    const nomeados = texto.match(/import\s*\{([^}]*)\}\s*from\s*'[^']*core\/tela\.js'/);
    if (nomeados) return MUTADORES.some((m) => new RegExp(`\\b${m}\\b`).test(nomeados[1]));
    const alias = texto.match(/import\s*\*\s*as\s+(\w+)\s*from\s*'[^']*core\/tela\.js'/);
    if (alias) return MUTADORES.some((m) => texto.includes(`${alias[1]}.${m}(`));
    return true; // forma desconhecida: acusa, nunca tolera
  })
  .sort();
conferir(
  '§8 só os escritores DECLARADOS importam a tela',
  escritores.join(',') === PERMITIDOS.join(','),
  `declarados [${PERMITIDOS.join(', ')}] · encontrados [${escritores.join(', ')}]`
);
conferir('§8 a sonda existe em window.spatia', /tela: \(\) => tela\.estado\(\)/.test(src('src/main.js')));

// ---------------------------------------------------------------- veredito
console.log(`\n${ok.length} leis provadas`);
for (const f of falhas) console.log(`  ✗ ${f}`);
console.log(falhas.length ? `\nFALHOU: ${falhas.length}` : '\nOK — nenhuma lei quebrada');
console.log(`
NÃO PROVADO AQUI (exige navegador):
  · que o \`sair('boot')\` acontece no MESMO instante em que a tela some (o oráculo prova a ordem
    no código, não o quadro);
  · que \`spatia.tela()\` devolve o presente numa aba viva — vale a guarda de sempre
    (\`document.hidden\` + \`hasFocus()\` + \`quadros\` andando).`);
process.exit(falhas.length ? 1 : 0);
