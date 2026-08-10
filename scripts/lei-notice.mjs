/**
 * O ORÁCULO DO `notice` — prova que o aviso chega ao pixel, e que só o aviso chega.
 *
 * Roda em node, sem navegador e sem GPU: um DOM de mentira, e o módulo REAL (`hud/streams.js`,
 * `hud/dom.js`, `core/bus.js`) importado por cima dele. O que ele NÃO prova está no fim da saída.
 *
 * Uso: node lei-notice.mjs        (sai 0 quando as leis valem)
 */
import { readFileSync } from 'node:fs';

// A raiz sai do PRÓPRIO arquivo, nunca de um caminho de máquina — ver `lei-tela.mjs`.
// (Enquanto este oráculo mora fora de `scripts/`, RAIZ vem do argumento ou do env.)
/*
 * ☠️ A raiz sai do PRÓPRIO arquivo, nunca de argumento nem de caminho de máquina. Com raiz externa
 * o oráculo importa a árvore que lhe apontarem — passa num clone que nem tem o código, e passa ao
 * ser rodado sobre uma CÓPIA MUTADA, atestando guarda que a cópia não tem.
 */
const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = (p) => readFileSync(`${RAIZ}/${p}`, 'utf8');

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
    this.style = {};
    this.hidden = false;
  }
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v ?? '');
  }
  append(...ns) {
    for (const n of ns) {
      n.parent?.remove?.call?.(n);
      n.parent = this;
      this.children.push(n);
    }
  }
  prepend(n) {
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

// Contador de temporizadores: o tique da idade só pode existir enquanto houver aviso de pé.
let timersVivos = 0;
const setIntervalReal = globalThis.setInterval;
const clearIntervalReal = globalThis.clearInterval;
globalThis.setInterval = (...args) => {
  timersVivos += 1;
  return setIntervalReal(...args);
};
globalThis.clearInterval = (id) => {
  timersVivos -= 1;
  return clearIntervalReal(id);
};

// Só o veredito interessa: o módulo grita em `console.error` quando RECUSA, e isso é a prova.
const recusas = [];
console.error = (msg) => recusas.push(String(msg));

const bus = await import(`${RAIZ}/src/core/bus.js`);
const { createStreams } = await import(`${RAIZ}/src/hud/streams.js`);

createStreams(raiz, { toolColor: () => 0x888888 });

// ---------------------------------------------------------------- leitura da tela
const trilho = raiz.querySelector('[data-timeline]');
const bloco = (classe) => trilho.children.find((c) => c.className === classe);
const avisos = () => bloco('avisos').children;
const linhas = () => bloco('timeline-rows').children;
const texto = (n) => [n.textContent, ...n.children.map(texto)].join(' ').replace(/\s+/g, ' ').trim();
const telaDosAvisos = () => avisos().map(texto).join(' | ');
const acharClasse = (n, classe) => {
  if (n.className === classe) return n;
  for (const c of n.children) {
    const a = acharClasse(c, classe);
    if (a) return a;
  }
  return null;
};

const agora = () => Date.now() / 1000;
const aviso = (extra) =>
  bus.emit({
    t: 'notice',
    topic: 'index',
    severity: 'warn',
    label: 'ÍNDICE VENCIDO',
    detail: '12 dias',
    action: 'reindexe a coleção `espatial_fixture`',
    at: agora(),
    ...extra,
  });

// ---------------------------------------------------- §1 silêncio antes do fato
conferir('§1 nenhum aviso antes de o servidor dizer algo', avisos().length === 0);
conferir('§1 o tique não existe sem aviso de pé', timersVivos === 0);

// ---------------------------------------------------- §2 o aviso chega ao pixel
aviso();
conferir('§2 `warn` levanta UM aviso', avisos().length === 1, `${avisos().length}`);
conferir('§2 o `label` chega ao pixel', telaDosAvisos().includes('ÍNDICE VENCIDO'));
conferir('§2 o `detail` chega ao pixel', telaDosAvisos().includes('12 dias'));
conferir(
  '§2 ☠️ o `action` chega ao pixel',
  telaDosAvisos().includes('reindexe a coleção `espatial_fixture`'),
  telaDosAvisos()
);
conferir('§2 a `severity` chega ao pixel como atributo', avisos()[0].dataset.severity === 'warn');
conferir('§2 o `topic` chega ao pixel como família', telaDosAvisos().includes('ÍNDICE'));
conferir('§2 o tique nasce com o primeiro aviso de pé', timersVivos === 1);

// ---------------------------------------------------- §3 warn/alert não escrevem linha
conferir('§3 `warn` não escreve linha de timeline', linhas().length === 0, `${linhas().length}`);

// ---------------------------------------------------- §4 um tópico, UM aviso de pé
aviso({ label: 'ÍNDICE VENCIDO', detail: '13 dias', at: agora() + 1 });
conferir('§4 segundo `warn` do mesmo tópico SUBSTITUI, não soma', avisos().length === 1);
conferir('§4 e o que está na tela é o novo', telaDosAvisos().includes('13 dias'));
bus.emit({
  t: 'notice',
  topic: 'graphdb',
  severity: 'warn',
  label: 'NEO4J FORA',
  detail: 'sem resposta',
  action: 'não rode a cadeia',
  at: agora(),
});
conferir('§4 tópicos diferentes convivem', avisos().length === 2);

// ---------------------------------------------------- §5 reentrega não muda pixel
const antesDoEco = avisos()[0];
const linhasAntes = linhas().length;
const mesmoAt = 1_700_000_000;
aviso({ at: mesmoAt });
const eco = avisos().find((n) => n.dataset.severity === 'warn' && texto(n).includes('12 dias'));
aviso({ at: mesmoAt });
aviso({ at: mesmoAt });
conferir(
  '§5 ☠️ reentrega do mesmo (topic, at) não redesenha o nó',
  avisos().includes(eco) && avisos().length === 2
);
conferir('§5 reentrega não escreve linha nenhuma', linhas().length === linhasAntes);
conferir('§5 (controle) o eco realmente substituiu o aviso anterior', !avisos().includes(antesDoEco));

// ---------------------------------------------------- §6 a IDADE sai do `at`
const idadeDe = (n) => acharClasse(n, 'aviso-age');
const dia = 86_400;
bus.emit({
  t: 'notice',
  topic: 'credential',
  severity: 'alert',
  label: 'CREDENCIAL EXPIRADA',
  detail: 'github expirada',
  action: 'reautorize em `#/security`',
  at: agora() - 10,
});
const recente = avisos().find((n) => texto(n).includes('CREDENCIAL'));
conferir(
  '§6 aviso de dez segundos lê em segundos',
  idadeDe(recente).textContent === 'HÁ 10S',
  idadeDe(recente).textContent
);
conferir('§6 e não carrega tom de idade', idadeDe(recente).dataset.tone === undefined);

bus.emit({
  t: 'notice',
  topic: 'corpus',
  severity: 'warn',
  label: 'ALFA3D',
  detail: '',
  action: 'y',
  at: agora() - 3 * dia,
});
const tresDias = avisos().find((n) => texto(n).includes('ALFA3D'));
conferir('§6 aviso de três dias lê em dias', idadeDe(tresDias).textContent === 'HÁ 3D');
conferir(
  '§6 ⚠️ e NÃO tem o mesmo peso visual do de dez segundos',
  idadeDe(tresDias).dataset.tone === 'warn' && idadeDe(recente).dataset.tone === undefined
);

bus.emit({
  t: 'notice',
  topic: 'topology',
  severity: 'warn',
  label: 'BETA9D',
  detail: '',
  action: 'y',
  at: agora() - 9 * dia,
});
const noveDias = avisos().find((n) => texto(n).includes('BETA9D'));
conferir('§6 nove dias sobe outro degrau', idadeDe(noveDias).dataset.tone === 'bad');
conferir(
  '§6 a idade nunca é negativa (relógio adiantado)',
  (() => {
    bus.emit({
      t: 'notice',
      topic: 'other',
      severity: 'warn',
      label: 'GAMAFUTURO',
      detail: '',
      action: 'y',
      at: agora() + 5_000,
    });
    return idadeDe(avisos().find((n) => texto(n).includes('GAMAFUTURO'))).textContent === 'HÁ 0S';
  })()
);

// ---------------------------------------------------- §7 `info` apaga o de pé
const linhasAntesDoInfo = linhas().length;
bus.emit({
  t: 'notice',
  topic: 'index',
  severity: 'info',
  label: 'ÍNDICE RENOVADO',
  detail: '0 dia(s) de idade',
  at: agora(),
});
conferir(
  '§7 ☠️ `info` apaga o aviso de pé do MESMO tópico',
  !avisos().some((n) => texto(n).includes('ÍNDICE VENCIDO')),
  telaDosAvisos()
);
conferir(
  '§7 e não toca nos outros tópicos',
  avisos().some((n) => texto(n).includes('NEO4J FORA'))
);
conferir('§7 `info` escreve UMA linha de timeline', linhas().length === linhasAntesDoInfo + 1);
conferir(
  '§7 e a linha carrega o fato',
  texto(linhas()[0]).includes('ÍNDICE RENOVADO') && texto(linhas()[0]).includes('0 dia(s) de idade'),
  texto(linhas()[0])
);

// ---------------------------------------------------- §8 o catálogo
bus.emit({
  t: 'notice',
  topic: 'constructor',
  severity: 'warn',
  label: 'IMPOSTOR',
  detail: '',
  action: 'y',
  at: agora(),
});
const impostor = avisos().find((n) => texto(n).includes('IMPOSTOR'));
conferir(
  '§8 ☠️ tópico da cadeia de protótipos não vira rótulo',
  Boolean(impostor) && texto(impostor).includes('SISTEMA') && !texto(impostor).includes('function'),
  impostor ? texto(impostor) : 'não desenhou'
);

const antesDaRecusa = avisos().length;
recusas.length = 0;
bus.emit({
  t: 'notice',
  topic: 'index',
  severity: 'critical',
  label: 'A',
  detail: '',
  action: 'y',
  at: agora(),
});
conferir('§8 severidade fora do catálogo não desenha', avisos().length === antesDaRecusa);
conferir(
  '§8 e a recusa diz por quê',
  recusas.some((m) => m.includes('fora do catálogo'))
);

recusas.length = 0;
bus.emit({ t: 'notice', topic: 'index', severity: 'alert', label: 'B', detail: '', at: agora() });
conferir(
  '§8 ☠️ `alert` sem `action` não desenha — aviso sem o que fazer é ruído',
  avisos().length === antesDaRecusa
);
conferir(
  '§8 e a recusa nomeia o conserto',
  recusas.some((m) => m.includes('diga o que o operador faz'))
);

// ---------------------------------------------------- §9 a poda da timeline
const dePeAntes = avisos().length;
for (let i = 0; i < 40; i += 1) bus.emit({ t: 'query', text: `q${i}`, web: 0 });
conferir(
  '§9 ☠️ a poda de 26 linhas NÃO come os avisos de pé',
  avisos().length === dePeAntes,
  `${avisos().length} de ${dePeAntes}`
);
conferir('§9 e a timeline continua podando', linhas().length === 26, `${linhas().length}`);

// ---------------------------------------------------- §10 o tique morre com o último
for (const topico of ['graphdb', 'credential', 'corpus', 'topology', 'other']) {
  bus.emit({ t: 'notice', topic: topico, severity: 'info', label: 'RESOLVIDO', detail: '', at: agora() });
}
conferir('§10 sem aviso de pé, nenhum aviso na tela', avisos().length === 0, telaDosAvisos());
conferir('§10 e o tique é desligado', timersVivos === 0, `${timersVivos}`);

// ---------------------------------------------------- §11 o assinante existe, e é um só
const fonte = src('src/hud/streams.js');
conferir("§11 existe `on('notice')` em src/hud/streams.js", /on\('notice'/.test(fonte));
conferir(
  '§11 nenhum outro módulo assina `notice`',
  [...src('src/main.js').matchAll(/on\('notice'/g)].length === 0
);
conferir('§11 a HUD não importa a cena nem o kernel', !/from '\.\.\/(space|kernel)\//.test(fonte));

// ---------------------------------------------------- §12 o CSS existe para o que o JS escreve
const html = src('index.html');
for (const classe of [
  'avisos',
  'timeline-rows',
  'aviso',
  'aviso-head',
  'aviso-mark',
  'aviso-topic',
  'aviso-label',
  'aviso-age',
  'aviso-detail',
  'aviso-action',
]) {
  conferir(`§12 \`.${classe}\` tem regra no CSS`, new RegExp(`\\.${classe}[\\s,{:\\[]`).test(html));
}
conferir('§12 a severidade `alert` tem cor própria', /\.aviso\[data-severity="alert"\]/.test(html));
conferir(
  '§12 a idade tem os dois degraus',
  /\.aviso-age\[data-tone="warn"\]/.test(html) && /\.aviso-age\[data-tone="bad"\]/.test(html)
);
conferir(
  '§12 os degraus de idade são os MESMOS do cabeçalho (3d/7d)',
  /IDADE_AMBAR_D = 3/.test(fonte) &&
    /IDADE_VERMELHA_D = 7/.test(fonte) &&
    /age >= 7 \? 'bad' : age >= 3 \? 'warn'/.test(src('src/hud/frame.js'))
);
conferir('§12 o aviso entra na exceção de movimento reduzido', /\.tool, \.aviso,/.test(html));

// ---------------------------------------------------------------- veredito
clearIntervalReal();
console.log(`\n${ok.length} leis provadas`);
for (const f of falhas) console.log(`  ✗ ${f}`);
console.log(falhas.length ? `\nFALHOU: ${falhas.length}` : '\nOK — nenhuma lei quebrada');
console.log(`
NÃO PROVADO AQUI (exige navegador, e nenhuma foto foi tirada):
  · que o bloco cabe no trilho da esquerda sem empurrar a timeline para fora da vista;
  · que \`--busy\` sobre \`--void\` distingue um \`warn\` de um \`alert\` a um metro da tela;
  · que o widget TIMELINE está aberto (\`espatial.collapsed.v1\`) — widget colapsado parece vazio;
  · que a reposição do \`/api/system-events\` chega de fato na assinatura (isso é o servidor).`);
process.exit(falhas.length ? 1 : 0);
