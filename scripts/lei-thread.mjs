/**
 * O ORÁCULO DO `thread` — prova que o FIO chega ao pixel, e que `broken` não passa calado.
 *
 * Roda em node, sem navegador e sem GPU: um DOM de mentira, um `fetch` de mentira, e os módulos
 * REAIS (`hud/streams.js`, `hud/button.js`, `hud/dom.js`, `core/api.js`, `core/bus.js`,
 * `core/state.js`) importados por cima deles. O que ele NÃO prova está no fim da saída.
 *
 * ⚠️ **O lugar dele é `scripts/lei-thread.mjs`** — mora na raiz por acidente de sessão
 * (`scripts/` era território de outra sessão nesta rodada). A RAIZ se acha sozinha nos dois
 * lugares, então mover o arquivo é só mover o arquivo.
 *
 * Uso: node lei-thread.mjs        (sai 0 quando as leis valem)
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/*
 * ☠️ A raiz sai do PRÓPRIO arquivo, nunca de argumento nem de caminho de máquina. Com raiz externa
 * o oráculo importa a árvore que lhe apontarem — passa num clone que nem tem o código, e passa ao
 * ser rodado sobre uma CÓPIA MUTADA, atestando guarda que a cópia não tem. Ele sobe do diretório
 * onde está até achar a árvore, e é isso que o deixa correr da raiz ou de `scripts/`.
 */
const RAIZ = (() => {
  let dir = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
  for (let i = 0; i < 3; i += 1) {
    if (existsSync(`${dir}/src/hud/streams.js`)) return dir;
    dir = dir.replace(/\/[^/]+$/, '');
  }
  throw new Error('árvore do SpatIA não encontrada a partir deste arquivo');
})();
const src = (p) => readFileSync(`${RAIZ}/${p}`, 'utf8');

// O mundo do BOOT precisa de um cliente recém-nascido (o `GET /api/thread` acontece uma vez, na
// criação), e o barramento é módulo global: dois `createStreams` no mesmo processo desenhariam
// duas vezes. Por isso ele roda num processo próprio, e o principal dobra o veredito dele.
const MUNDO = process.argv[2] || 'principal';

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

// ---------------------------------------------------------------- o DOM de mentira
class N {
  constructor(tag) {
    this.tag = tag;
    this.className = '';
    this._text = '';
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.title = '';
    this.style = { setProperty: () => {} };
    this.handlers = {};
  }
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v ?? '');
  }
  append(...ns) {
    for (const n of ns) {
      n.remove();
      n.parent = this;
      this.children.push(n);
    }
  }
  prepend(n) {
    n.remove();
    n.parent = this;
    this.children.unshift(n);
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  replaceChildren(...ns) {
    this.children = [];
    for (const n of ns) this.append(n);
  }
  get lastElementChild() {
    return this.children[this.children.length - 1] ?? null;
  }
  get classList() {
    return {
      add: (c) => {
        if (!this.className.split(/\s+/).includes(c)) this.className = `${this.className} ${c}`.trim();
      },
    };
  }
  addEventListener(tipo, fn) {
    this.handlers[tipo] = fn;
  }
  setAttribute(k, v) {
    this[k] = v;
  }
  querySelector(sel) {
    const alvo = sel.replace(/^\[|\]$/g, '');
    const busca = (n) => {
      if (n.attr === alvo) return n;
      for (const c of n.children) {
        const achado = busca(c);
        if (achado) return achado;
      }
      return null;
    };
    return busca(this);
  }
}

const raiz = new N('body');
for (const attr of ['data-timeline', 'data-memory', 'data-tools', 'data-web', 'data-plan']) {
  const n = new N('div');
  n.attr = attr;
  raiz.append(n);
}
globalThis.document = { createElement: (tag) => new N(tag) };

// ---------------------------------------------------------------- o servidor de mentira
const chamadas = [];
let respostaDoBoot = { threads: [] };
let respostaDoCorte = { cut: 1, threads: [] };
globalThis.fetch = (url, init = {}) => {
  const metodo = init.method || 'GET';
  chamadas.push({ url, metodo, corpo: init.body ? JSON.parse(init.body) : null });
  return Promise.resolve({
    ok: true,
    json: async () => (metodo === 'POST' ? respostaDoCorte : respostaDoBoot),
  });
};

// Só o veredito interessa: o módulo grita em `console.error` quando RECUSA, e isso é a prova.
const recusas = [];
console.error = (msg) => recusas.push(String(msg));

const CANAL = 'console';
const SESSAO = '7f3a91c2-1d4e-4a77-9b0c-2e5f8a6d3b10';
const hoje = new Date();
hoje.setHours(14, 2, 0, 0);
const NASCEU = hoje.getTime() / 1000;
const drenar = () => new Promise((resolver) => setTimeout(resolver, 0));

if (MUNDO === 'boot-com-fio')
  respostaDoBoot = {
    threads: [{ origin: CANAL, session: SESSAO, turns: 7, since: NASCEU, last: NASCEU }],
  };

const bus = await import(`${RAIZ}/src/core/bus.js`);
const store = await import(`${RAIZ}/src/core/state.js`);
const { createStreams } = await import(`${RAIZ}/src/hud/streams.js`);

store.install();
createStreams(raiz, { toolColor: () => 0x888888 });
await drenar();

// ---------------------------------------------------------------- leitura da tela
const trilho = raiz.querySelector('[data-timeline]');
const bloco = (classe) => trilho.children.find((c) => c.className === classe);
const avisos = () => bloco('avisos').children;
const linhas = () => bloco('timeline-rows').children;
// Tolera o nó AUSENTE de propósito: uma mutação que apaga a linha faria o oráculo estourar em
// vez de nomear a lei que quebrou, e quem lê o traço vai caçar defeito no oráculo.
const texto = (n) =>
  n ? [n.textContent, ...n.children.map(texto)].join(' ').replace(/\s+/g, ' ').trim() : '';
const acharClasse = (n, classe) => {
  if (n.className === classe) return n;
  for (const c of n.children) {
    const a = acharClasse(c, classe);
    if (a) return a;
  }
  return null;
};
const fioNode = () => avisos().find((n) => n.dataset.thread !== undefined) ?? null;
const fioTexto = () => (fioNode() ? texto(fioNode()) : '');
const fioLinha = () => (fioNode() ? (acharClasse(fioNode(), 'row') ?? fioNode().children[0]) : null);
const fioBotao = () => (fioNode() ? (fioNode().children.find((c) => c.className === 'btn') ?? null) : null);
const celula = (classe) => (fioNode() ? (acharClasse(fioNode(), classe)?.textContent ?? '') : '');

const thread = (extra) =>
  bus.emit({
    t: 'thread',
    continuity: 'resumed',
    thread: SESSAO,
    turn: 7,
    since: NASCEU,
    origin: CANAL,
    ...extra,
  });

// ================================================================ o mundo do BOOT
if (MUNDO === 'boot-com-fio') {
  conferir(
    '§B o fio que já existia é desenhado ANTES da primeira pergunta',
    Boolean(fioNode()),
    'nada na tela'
  );
  conferir(
    '§B ele diz que a PRÓXIMA pergunta sabe deste',
    fioTexto().includes('FIO ABERTO') && fioTexto().includes('A PRÓXIMA PERGUNTA SABE DESTE'),
    fioTexto()
  );
  conferir(
    '§B ⚠️ `turns` é CONTAGEM do que já houve, não a ordem da próxima',
    celula('row-meta') === '7 PERGUNTAS',
    celula('row-meta')
  );
  conferir('§B a idade do fio vem do `since`', celula('row-time') === 'DESDE 14:02', celula('row-time'));
  conferir('§B ☠️ ele não escreve linha de timeline', linhas().length === 0, `${linhas().length}`);
  conferir('§B há o que cortar', Boolean(fioBotao()));

  thread({ continuity: 'new', thread: null, turn: 1, since: null });
  conferir(
    '§B a pergunta seguinte reescreve o MESMO nó',
    avisos().filter((n) => n.dataset.thread !== undefined).length === 1
  );
  conferir('§B e o que está na tela é o novo', fioNode()?.dataset.thread === 'new', fioTexto());
} else {
  // ============================================================== o mundo PRINCIPAL
  // ---------------------------------------------------- §1 silêncio antes do fato
  conferir('§1 nenhum fio na tela antes de o servidor dizer que há um', fioNode() === null, fioTexto());
  conferir(
    '§1 ☠️ boot sem fio não escreve "SEM FIO" — não dizer nada é o que é verdade',
    avisos().length === 0 && linhas().length === 0
  );
  conferir(
    '§1 o boot PERGUNTOU pelo fio',
    chamadas.some((c) => c.url === '/api/thread' && c.metodo === 'GET'),
    JSON.stringify(chamadas)
  );

  // ---------------------------------------------------- §2 `resumed` chega ao pixel
  thread();
  conferir(
    '§2 a continuidade chega ao pixel',
    fioTexto().includes('ESTA PERGUNTA SABE DAS ANTERIORES'),
    fioTexto()
  );
  conferir(
    '§2 o `turn` chega ao pixel como a ORDEM da pergunta',
    celula('row-meta') === '7ª PERGUNTA',
    celula('row-meta')
  );
  conferir(
    '§2 o `since` chega ao pixel como a hora do fio',
    celula('row-time') === 'DESDE 14:02',
    celula('row-time')
  );
  conferir(
    '§2 ⚠️ o `turn` não é chamado de TURNO — a palavra já é o laço interno do agente',
    !fioTexto().includes('TURNO') && !celula('row-meta').includes('TURNO'),
    fioTexto()
  );
  conferir(
    '§2 a sessão viaja no `title`, fora da régua da HUD',
    (fioLinha()?.title ?? '').includes(SESSAO),
    fioLinha()?.title ?? ''
  );
  conferir('§2 a continuidade é legível como DADO', fioNode()?.dataset.thread === 'resumed');
  conferir(
    '§2 o normal não sai em tom de alarme',
    !(fioLinha()?.className ?? '').includes('bad'),
    fioLinha()?.className ?? ''
  );

  // ---------------------------------------------------- §3 nada de repetição
  conferir('§3 ☠️ `resumed` NÃO escreve linha de timeline', linhas().length === 0, `${linhas().length}`);
  thread({ turn: 8 });
  conferir('§3 nem na volta seguinte do ciclo', linhas().length === 0, `${linhas().length}`);
  conferir('§3 e a condição acompanha', celula('row-meta') === '8ª PERGUNTA');

  // ---------------------------------------------------- §4 ☠️ o caso que mente por omissão
  const noAr = fioNode();
  thread({ continuity: 'broken', thread: null, turn: 1, since: null });
  conferir(
    '§4 ☠️ `broken` escreve UMA linha de timeline — a execução respondeu sem `error`',
    linhas().length === 1,
    `${linhas().length}`
  );
  conferir(
    '§4 e a linha nomeia o que ACONTECEU',
    texto(linhas()[0]).includes('FIO PERDIDO') &&
      texto(linhas()[0]).includes('O CLI NÃO ACHOU A SESSÃO ANTERIOR'),
    texto(linhas()[0])
  );
  conferir(
    '§4 a linha sai em tom de falha',
    Boolean(linhas()[0]?.className.includes('bad')),
    linhas()[0]?.className ?? 'não há linha'
  );
  conferir(
    '§4 a condição diz o que passou a VALER, e não é a mesma frase',
    fioTexto().includes('ESTA PERGUNTA RODOU DO ZERO') && !fioTexto().includes('O CLI NÃO ACHOU'),
    fioTexto()
  );
  conferir(
    '§4 e ela salta aos olhos',
    (fioLinha()?.className ?? '').includes('bad'),
    fioLinha()?.className ?? ''
  );
  conferir('§4 sem hora de nascimento, porque não há fio', celula('row-time') === '—', celula('row-time'));

  thread({ turn: 2 });
  conferir(
    '§4 ☠️ a pergunta seguinte APAGA a condição — só a linha guarda que aquela resposta não teve memória',
    !fioTexto().includes('RODOU DO ZERO') && texto(linhas()[0]).includes('FIO PERDIDO'),
    fioTexto()
  );
  conferir('§4 (controle) a condição é o mesmo nó desde o começo', fioNode() === noAr);

  // ---------------------------------------------------- §5 `new` × `none`: nenhum é erro
  thread({ continuity: 'new', thread: null, turn: 1, since: null });
  const frasedoNew = fioTexto();
  const ordemDoNew = celula('row-meta');
  const tomDoNew = fioLinha()?.className ?? '';
  thread({ continuity: 'none', thread: null, turn: 1, since: null });
  conferir(
    '§5 ⚠️ `new` e `none` não dizem a mesma coisa',
    frasedoNew !== fioTexto(),
    `${frasedoNew} | ${fioTexto()}`
  );
  conferir('§5 `new` promete a próxima', frasedoNew.includes('A PRÓXIMA PERGUNTA SABERÁ DESTA'), frasedoNew);
  conferir(
    '§5 `none` diz que o cérebro não guarda conversa',
    fioTexto().includes('ESTE CÉREBRO NÃO GUARDA CONVERSA'),
    fioTexto()
  );
  conferir(
    '§5 ☠️ `new` CONTA a pergunta e `none` não conta nada (`null` ≠ `0`)',
    ordemDoNew === '1ª PERGUNTA' && celula('row-meta') === '',
    `${ordemDoNew} | ${celula('row-meta')}`
  );
  conferir(
    '§5 nenhum dos dois é erro',
    !tomDoNew.includes('bad') && !(fioLinha()?.className ?? '').includes('bad')
  );
  conferir('§5 e nenhum dos dois escreve linha', linhas().length === 1, `${linhas().length}`);

  // ---------------------------------------------------- §6 o fio de ONTEM
  thread({ since: NASCEU - 86_400 });
  conferir(
    '§6 ⚠️ um fio de ontem NÃO parece recém-aberto',
    /DESDE \d\d\/\d\d 14:02/.test(celula('row-time')),
    celula('row-time')
  );

  // ---------------------------------------------------- §7 a poda da timeline
  const linhasAntesDaPoda = linhas().length;
  for (let i = 0; i < 40; i += 1) bus.emit({ t: 'query', text: `q${i}`, web: 0 });
  conferir('§7 ☠️ a poda de 26 linhas NÃO come a condição', Boolean(fioNode()));
  conferir(
    '§7 a condição não vive entre as linhas',
    !linhas().some((n) => n.dataset.thread !== undefined) && linhasAntesDaPoda <= 26
  );
  conferir('§7 e a timeline continua podando', linhas().length === 26, `${linhas().length}`);

  // ---------------------------------------------------- §8 convive com o aviso de pé
  bus.emit({
    t: 'notice',
    topic: 'index',
    severity: 'warn',
    label: 'ÍNDICE VENCIDO',
    detail: '12 dias',
    action: 'reindexe a coleção',
    at: Date.now() / 1000,
  });
  conferir(
    '§8 o aviso de pé e o fio convivem no mesmo bloco',
    avisos().length === 2 && Boolean(fioNode()),
    `${avisos().length}`
  );
  conferir(
    '§8 o fio vem primeiro — ele é sobre a pergunta que está sendo feita',
    avisos()[0].dataset.thread !== undefined
  );
  bus.emit({
    t: 'notice',
    topic: 'index',
    severity: 'info',
    label: 'ÍNDICE RENOVADO',
    detail: '',
    at: Date.now() / 1000,
  });
  conferir('§8 ☠️ o `info` que baixa o aviso não derruba o fio', Boolean(fioNode()) && avisos().length === 1);

  // ---------------------------------------------------- §9 o catálogo
  const antesDaRecusa = fioTexto();
  const linhasAntesDaRecusa = linhas().length;
  recusas.length = 0;
  thread({ continuity: 'forked' });
  conferir('§9 continuidade fora do catálogo não desenha', fioTexto() === antesDaRecusa, fioTexto());
  conferir('§9 e não escreve linha', linhas().length === linhasAntesDaRecusa);
  conferir(
    '§9 e a recusa diz por quê',
    recusas.some((m) => m.includes('fora do catálogo')),
    recusas.join(' | ')
  );
  recusas.length = 0;
  thread({ continuity: undefined });
  conferir(
    '§9 continuidade AUSENTE também é recusa — carimbo que falta não é carimbo neutro',
    fioTexto() === antesDaRecusa && recusas.length === 1,
    fioTexto()
  );

  // ---------------------------------------------------- §10 ☠️ `thread` não é `brain`
  conferir(
    '§10 ☠️ o `thread` não escreve no estado do cérebro',
    store.snapshot().brain === null,
    JSON.stringify(store.snapshot().brain)
  );
  conferir('§10 e não inventa campo no estado', store.snapshot().thread === undefined);
  conferir(
    '§10 quem conta ferramenta continua lendo o `brain`',
    /on\('brain', \(event\) => set\(status, `\$\{event\.tools\}/.test(src('src/hud/permissions.js'))
  );
  conferir(
    '§10 nenhuma linha da timeline confundiu fio com núcleo',
    !linhas().some((n) => texto(n).includes('NÚCLEO')),
    'NÚCLEO ONLINE saiu de um `thread`'
  );

  // ---------------------------------------------------- §11 o botão que corta
  thread({ turn: 9 });
  conferir('§11 há botão quando há (ou haverá) fio', Boolean(fioBotao()));
  conferir(
    '§11 e o rótulo diz o que ele faz',
    fioBotao()?.textContent === 'CORTAR O FIO',
    fioBotao()?.textContent ?? 'não há botão'
  );
  thread({ continuity: 'none', thread: null, turn: 1, since: null });
  conferir('§11 ⚠️ `none` não oferece o que não existe', fioBotao() === null, 'botão de pé sem fio possível');

  thread({ turn: 9 });
  chamadas.length = 0;
  await fioBotao()?.handlers.click();
  const corte = chamadas.find((c) => c.metodo === 'POST');
  conferir(
    '§11 o clique corta no SERVIDOR',
    Boolean(corte) && corte.url === '/api/thread',
    JSON.stringify(chamadas)
  );
  conferir(
    '§11 e nomeia a origem — um canal não corta o fio do outro',
    corte?.corpo?.origin === CANAL,
    JSON.stringify(corte?.corpo)
  );
  conferir(
    '§11 o corte escreve UMA linha (é instante, e foi o operador)',
    linhas().filter((n) => texto(n).includes('FIO CORTADO')).length === 1 &&
      texto(linhas()[0]).includes('FIO CORTADO'),
    texto(linhas()[0])
  );
  conferir(
    '§11 a condição passa a dizer que a próxima começa do zero',
    fioTexto().includes('A PRÓXIMA PERGUNTA COMEÇA DO ZERO') && fioNode()?.dataset.thread === 'cut',
    fioTexto()
  );
  conferir('§11 e não sobra botão para cortar o que não há', fioBotao() === null);

  thread({ turn: 9 });
  respostaDoCorte = { cut: 0, threads: [] };
  await fioBotao()?.handlers.click();
  conferir(
    '§11 ☠️ `cut: 0` NÃO afirma corte — o que aconteceu sai do servidor, não do clique',
    texto(linhas()[0]).includes('NÃO HAVIA FIO A CORTAR'),
    texto(linhas()[0])
  );

  thread({ turn: 9 });
  respostaDoCorte = { cut: 0, threads: [{ origin: CANAL, session: SESSAO, turns: 9, since: NASCEU }] };
  await fioBotao()?.handlers.click();
  conferir(
    '§11 fio que o servidor ainda declara continua na tela',
    fioNode()?.dataset.thread === 'resumed' && Boolean(fioBotao()),
    fioTexto()
  );

  // ---------------------------------------------------- §12 o assinante, e o CSS que ele usa
  const fonte = src('src/hud/streams.js');
  conferir("§12 existe `on('thread')` em src/hud/streams.js", /on\('thread'/.test(fonte));
  conferir(
    '§12 e é o único em src/',
    (() => {
      const varredura = spawnSync('grep', ['-rl', "on('thread'", `${RAIZ}/src`], { encoding: 'utf8' });
      const arquivos = varredura.stdout.trim().split('\n').filter(Boolean);
      return arquivos.length === 1 && arquivos[0].endsWith('src/hud/streams.js');
    })(),
    'mais de um assinante'
  );
  conferir('§12 a HUD não importa a cena nem o kernel', !/from '\.\.\/(space|kernel)\//.test(fonte));

  const html = src('index.html');
  for (const classe of ['row', 'row-time', 'row-text', 'row-meta', 'btn']) {
    conferir(`§12 \`.${classe}\` tem regra no CSS`, new RegExp(`\\.${classe}[\\s,{:\\[]`).test(html));
  }
  conferir('§12 os dois tons que o fio usa existem', /\.row\.bad/.test(html) && /\.row\.dim/.test(html));
  // ⚠️ Toda classe que este arquivo escreve tem de ter regra no CSS: o `index.html` é de outra
  // sessão nesta rodada, então classe nova aqui nasceria sem estilo — invisível de tão discreta.
  const classesEscritas = [...fonte.matchAll(/el\('[a-z]+', '([a-z- ]+)'/g)].flatMap((m) => m[1].split(' '));
  const semCSS = classesEscritas.filter((c) => !new RegExp(`\\.${c}[\\s,{:\\[]`).test(html));
  conferir(
    '§12 ⚠️ o fio não inventou classe nenhuma — nada de CSS novo',
    semCSS.length === 0,
    semCSS.join(', ')
  );
  conferir(
    '§12 o botão usa o primitivo, e não um fork',
    /button\(\{/.test(fonte) && /variant: 'outline'/.test(fonte)
  );

  conferir(
    '§13 nenhum handler do barramento estourou',
    !recusas.some((m) => m.includes('[bus]')),
    recusas.join(' | ')
  );

  // ------------------------------------------------ o mundo do boot, num processo próprio
  const filho = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'boot-com-fio'], {
    encoding: 'utf8',
  });
  const linhasDoFilho = filho.stdout.split('\n').filter((l) => l.startsWith('  ✗') || /^\d+ leis/.test(l));
  conferir(
    `§B o mundo do BOOT (processo próprio) — ${linhasDoFilho[0] || 'sem saída'}`,
    filho.status === 0,
    linhasDoFilho.slice(1).join(' | ') || filho.stderr.slice(0, 400)
  );
}

// ---------------------------------------------------------------- veredito
console.log(`\n${ok.length} leis provadas`);
for (const f of falhas) console.log(`  ✗ ${f}`);
console.log(falhas.length ? `\nFALHOU: ${falhas.length}` : '\nOK — nenhuma lei quebrada');
if (MUNDO === 'principal')
  console.log(`
NÃO PROVADO AQUI (exige navegador, e nenhuma foto foi tirada):
  · que a linha do fio cabe no trilho da esquerda sem empurrar a timeline para fora da vista;
  · que \`.row.bad\` distingue o fio perdido da linha de erro que estiver ao lado, a um metro da tela;
  · que o botão CORTAR O FIO não lê como o botão de PARAR a execução;
  · que o widget TIMELINE está aberto (\`espatial.collapsed.v1\`) — widget colapsado parece vazio;
  · que o servidor emite \`broken\` de fato (isso é \`python3 -m server.lei_fio\`).`);
process.exit(falhas.length ? 1 : 0);
