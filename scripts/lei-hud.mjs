#!/usr/bin/env node
/**
 * A LEI DA SONDA DA HUD — o que ela mede é ÁREA QUE ACEITA PONTEIRO, e ela distingue as causas.
 *
 *     node scripts/lei-hud.mjs        # sai 0 quando as onze leis valem
 *
 * `spatia.hud()` existe para destravar T-51 e T-52, que hoje decidem sem número. Uma sonda que
 * mede a grandeza errada é pior que sonda nenhuma: ela dá autoridade ao palpite. As onze leis
 * abaixo são as formas de errar que esta base já pagou, aplicadas a esta sonda.
 *
 * | § | a lei | o que ela impede |
 * |---|---|---|
 * | 1 | a grandeza é o PONTEIRO, não a tinta | HUD hairline que cobre a tela inteira ler como 100% reivindicado |
 * | 2 | o número é MEDIDA: muda quando o DOM muda, e independe do passo | fração constante com cara de medida |
 * | 3 | forma sem identidade ACUSA, e nenhum ponto se perde | lista branca deixando um retângulo reivindicar calado |
 * | 4 | «chegou ao canvas» é o CANVAS, não «não é HUD» | fundo virar céu quando o canvas deixa de aceitar ponteiro |
 * | 5 | recolhido · aberto · sem controle particionam o montado | as três causas de «o painel não apareceu» colapsarem |
 * | 6 | declarado e ausente do DOM é DEFEITO, e sai separado | `#/security` sem `timeline` passar por escolha do operador |
 * | 7 | decisão do operador sobre widget ausente não vira «recolhido aqui» | o quinto dono do estado de tela mentir por rota |
 * | 8 | o armazém tem três estados, e `ilegivel` é `null` | «não medi» virar «medi e não há» |
 * | 9 | `null` ≠ `0` na lista de fontes e no painel de palco | objeto de zeros com cara de medida |
 * | 10 | painel que existe e CEDE ≠ painel que não existe | o escape do CSS sumir sem ninguém notar |
 * | 11 | a sonda não escreve — nem no DOM, nem no armazém | sonda que altera o que mede |
 *
 * ## Como ele alcança a sonda
 *
 * `src/main.js` não é importável em node (ele chama `main()` ao carregar e importa `three`). O
 * oráculo recorta o bloco entre `⟦sonda-hud⟧` e `⟦/sonda-hud⟧` do PRÓPRIO arquivo e o importa
 * como módulo. Não é transcrição: o que roda aqui é o texto que está no disco, e mutar a
 * implementação muta o que o oráculo executa. Marcador ausente REPROVA — apagá-lo não desliga a
 * lei em silêncio.
 *
 * ## Por que a RAIZ sai de `import.meta.url` e só dela
 *
 * ☠️ Raiz por argumento, variável de ambiente ou caminho de máquina faz o oráculo ler a árvore
 * que lhe apontarem — e aí ele passa sobre uma CÓPIA MUTADA, atestando guarda que a cópia não
 * tem. Derivada do próprio arquivo, copiar a árvore, quebrar uma linha e rodar o oráculo de lá
 * fica VERMELHO. É o que torna a prova de reprovação possível.
 *
 * ## O DOM de mentira, e por que ele não é jsdom
 *
 * O mundo daqui implementa a regra do navegador que a sonda consome — `elementFromPoint` devolve
 * o topo da pilha que ACEITA ponteiro, com `pointer-events` herdado — e mais nada. Um jsdom
 * esconderia uma API que a sonda não usa; uma reimplementação generosa passaria a atestar
 * comportamento que ninguém chama. E o seletor que o mundo não modela **explode**, em vez de
 * devolver lista vazia: zero vindo de esboço incompleto é o defeito nº 20 do handoff.
 *
 * ⚠️ **O que ele NÃO prova:** que `elementFromPoint` do Chrome concorde com este modelo em
 * `z-index`, `transform` ou `clip-path`; e nada sobre legibilidade. A grade sobre a tela real só
 * a tela responde — este oráculo prova que a sonda faz a pergunta certa e não perde ponto.
 */
import { readFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

// ───────────────────────────────────────────────── o recorte, e ele é obrigatório
const fonteMain = readFileSync(`${RAIZ}/src/main.js`, 'utf8');
const ABRE = '/* ⟦sonda-hud⟧';
const FECHA = '/* ⟦/sonda-hud⟧';
const iA = fonteMain.indexOf(ABRE);
const iF = fonteMain.indexOf(FECHA);
if (iA < 0 || iF < 0 || iF < iA) {
  console.error(
    `\x1b[31m✗ marcador da sonda ausente em src/main.js\x1b[0m — ${ABRE} … ${FECHA}\n` +
      '  O bloco é o que este oráculo executa. Sem ele não há o que provar, e passar seria pior.'
  );
  process.exit(1);
}
const bloco = fonteMain.slice(iA, iF);
const sonda = await import(
  `data:text/javascript;base64,${Buffer.from(bloco, 'utf8').toString('base64')}`
);
conferir('§0 o bloco exporta medirHud', typeof sonda.medirHud === 'function');
if (typeof sonda.medirHud !== 'function') {
  console.error('\x1b[31m✗ o bloco recortado não exporta medirHud\x1b[0m');
  process.exit(1);
}
const { medirHud } = sonda;

// A sonda tem de estar LIGADA: função que ninguém alcança não mede nada.
conferir(
  '§0 window.spatia expõe hud()',
  /\bhud:\s*\(opcoes\)\s*=>/.test(fonteMain) && /medirHud\(/.test(fonteMain.slice(fonteMain.indexOf('window.spatia')))
);

// ═══════════════════════════════════════════════════════ o mundo de mentira
const escritas = [];

/** Recusa e REGISTRA escrita depois de selado — a sonda não pode alterar o que mede. */
function selavel(alvo, nome, estado) {
  return new Proxy(alvo, {
    set(t, k, v) {
      if (estado.selado) { escritas.push(`${nome}.${String(k)}`); return true; }
      t[k] = v;
      return true;
    },
    deleteProperty(t, k) {
      if (estado.selado) { escritas.push(`delete ${nome}.${String(k)}`); return true; }
      delete t[k];
      return true;
    },
  });
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function casa(no, sel) {
  const attr = /^\[([a-z-]+)\]$/.exec(sel);
  if (attr) return no.dataset[camel(attr[1].replace(/^data-/, ''))] !== undefined;
  const classe = /^\.([a-z-]+)$/.exec(sel);
  if (classe) return String(no.className || '').split(/\s+/).includes(classe[1]);
  // ☠️ Seletor que este mundo não modela ABORTA. Devolver [] daria zero com cara de medida.
  throw new Error(`o mundo de mentira não modela o seletor "${sel}" — modele-o ou a lei mente`);
}

function criarMundo({ largura, altura, dpr = 2, armazenado = null }) {
  const estado = { selado: false };
  const nos = [];
  let ordem = 0;

  const criar = (tag, cfg = {}) => {
    const alvo = {
      tagName: String(tag).toUpperCase(),
      id: cfg.id ?? '',
      className: cfg.classe ?? '',
      dataset: selavel({ ...(cfg.dados || {}) }, `${tag}.dataset`, estado),
      parentElement: null,
      filhos: [],
      caixa: cfg.caixa ?? null,
      estilo: { ...(cfg.estilo || {}) },
      z: cfg.z ?? 0,
      ordem: ordem++,
      getBoundingClientRect() {
        const c = this.caixa ?? { x: 0, y: 0, w: 0, h: 0 };
        return { left: c.x, top: c.y, width: c.w, height: c.h, right: c.x + c.w, bottom: c.y + c.h };
      },
      querySelectorAll(sel) {
        const saida = [];
        const desce = (n) => { for (const f of n.filhos) { if (casa(f, sel)) saida.push(f); desce(f); } };
        desce(this);
        return saida;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
    };
    const no = selavel(alvo, tag, estado);
    nos.push(no);
    if (cfg.pai) { cfg.pai.filhos.push(no); no.parentElement = cfg.pai; }
    return no;
  };

  const html = criar('html');
  const body = criar('body', { pai: html });

  const proprio = (no, k) => no.estilo[k];
  const herdado = (no, k) => {
    for (let n = no; n; n = n.parentElement) if (n.estilo[k] !== undefined) return n.estilo[k];
    return undefined;
  };
  const computado = (no) => ({
    display: proprio(no, 'display') ?? 'block',
    visibility: herdado(no, 'visibility') ?? 'visible',
    pointerEvents: herdado(no, 'pointerEvents') ?? 'auto',
    zIndex: proprio(no, 'zIndex') ?? 'auto',
    fontSize: herdado(no, 'fontSize') ?? '16px',
    lineHeight: herdado(no, 'lineHeight') ?? 'normal',
    maxHeight: proprio(no, 'maxHeight') ?? 'none',
    overflowY: proprio(no, 'overflowY') ?? 'visible',
  });

  const desenhado = (no) => {
    for (let n = no; n; n = n.parentElement) if (proprio(n, 'display') === 'none') return false;
    return computado(no).visibility !== 'hidden';
  };

  const doc = {
    documentElement: html,
    body,
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    querySelector: (sel) => html.querySelector(sel),
    /** A regra do navegador: topo da pilha que aceita ponteiro; `<html>` quando ninguém aceita. */
    elementFromPoint(x, y) {
      const candidatos = nos.filter((n) => {
        if (!n.caixa || !desenhado(n)) return false;
        if (computado(n).pointerEvents === 'none') return false;
        const r = n.getBoundingClientRect();
        return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
      });
      if (!candidatos.length) return html;
      candidatos.sort((a, b) => a.z - b.z || a.ordem - b.ordem);
      return candidatos[candidatos.length - 1];
    },
  };

  const win = {
    innerWidth: largura,
    innerHeight: altura,
    devicePixelRatio: dpr,
    getComputedStyle: computado,
  };

  const armazem = {
    getItem: () => armazenado,
    setItem: (k) => { escritas.push(`localStorage.setItem(${k})`); },
  };

  return { criar, doc, win, armazem, body, selar: () => { estado.selado = true; } };
}

/*
 * A CENA PADRÃO — toda coordenada é múltipla de 16 e de 32 de propósito.
 *
 * Com a grade alinhada, a contagem de pontos é EXATA nos dois passos que as leis usam, e a
 * fração medida é a fração geométrica sem erro de amostragem. Assim uma lei que falhe está
 * falando da sonda, nunca da grade.
 *
 *   janela 960×640 = 614.400 px²          canvas e #hud cobrem a janela INTEIRA
 *   botão de alfa      192×32  =  6.144   dentro do trilho esquerdo
 *   corpo de beta      192×512 = 98.304   dentro do trilho esquerdo
 *   painel gama        320×320 = 102.400  no palco
 *   intruso sem nome    32×32  =  1.024   fora do #hud e sem identidade, e sem cobrir ninguém
 *   ------------------------------------------------------------------------
 *   reivindicado              = 207.872 px² = 0,338333… da janela
 */
const LARGURA = 960;
const ALTURA = 640;
const FRACAO_EXATA = (192 * 32 + 192 * 512 + 320 * 320 + 32 * 32) / (LARGURA * ALTURA);

function cenaPadrao(opcoes = {}) {
  const mundo = criarMundo({
    largura: LARGURA,
    altura: ALTURA,
    // ⚠️ `??` aqui apagaria o caso `null`, que é justamente o operador que nunca decidiu.
    armazenado: 'armazenado' in opcoes
      ? opcoes.armazenado
      : JSON.stringify({ fechadas: ['alfa', 'epsilon'], abertas: ['beta'] }),
  });
  const { criar, body } = mundo;

  const canvas = criar('canvas', {
    id: 'space',
    pai: body,
    caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA },
    estilo: opcoes.canvasCede ? { pointerEvents: 'none' } : {},
  });
  const hud = criar('div', {
    id: 'hud',
    pai: body,
    caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA },
    estilo: { pointerEvents: 'none', zIndex: opcoes.hudElevado ? '3' : 'auto' },
    z: 1,
  });

  const esquerda = criar('aside', {
    classe: 'slot', dados: { slot: 'left' }, pai: hud,
    caixa: { x: 0, y: 0, w: 192, h: ALTURA },
  });
  const alfa = criar('section', {
    classe: 'widget', dados: { widget: 'alfa', collapsed: 'true' }, pai: esquerda,
    caixa: { x: 0, y: 0, w: 192, h: 96 },
  });
  criar('button', {
    classe: 'label', pai: alfa,
    caixa: { x: 0, y: 0, w: 192, h: 32 }, estilo: { pointerEvents: 'auto' },
  });
  const beta = criar('section', {
    classe: 'widget', dados: { widget: 'beta', collapsed: 'false' }, pai: esquerda,
    caixa: { x: 0, y: 96, w: 192, h: 544 },
  });
  criar('div', {
    classe: 'scroll', pai: beta,
    caixa: { x: 0, y: 128, w: 192, h: 512 }, estilo: { pointerEvents: 'auto' },
  });

  const palco = criar('div', {
    classe: 'stage slot', dados: { slot: 'stage' }, pai: hud,
    caixa: { x: 192, y: 0, w: 576, h: ALTURA },
  });
  if (!opcoes.semPainel) {
    criar('section', {
      classe: 'widget', dados: { widget: 'gama', panelSurface: 'true' }, pai: palco,
      caixa: { x: 320, y: 160, w: 320, h: 320 },
      estilo: { pointerEvents: opcoes.painelCede ? 'none' : 'auto', zIndex: '8' },
      z: 8,
    });
  }
  criar('aside', {
    classe: 'slot', dados: { slot: 'right' }, pai: hud,
    caixa: { x: 768, y: 0, w: 192, h: ALTURA },
  });

  // Sem identidade nenhuma, e FORA do `#hud`: é o retângulo que uma lista branca deixaria passar.
  criar('div', {
    classe: 'intruso', pai: body,
    caixa: { x: 800, y: 608, w: 32, h: 32 }, estilo: { pointerEvents: 'auto' }, z: 5,
  });

  mundo.selar();
  return { ...mundo, canvas, hud };
}

const ambiente = (mundo, extra = {}) => ({
  doc: mundo.doc,
  win: mundo.win,
  canvas: mundo.canvas,
  hud: mundo.hud,
  rota: { id: 'files', app: 'files', arg: '' },
  montados: ['alfa', 'beta', 'gama'],
  registrados: ['alfa', 'beta', 'gama', 'delta', 'epsilon'],
  declarados: ['alfa', 'beta', 'gama', 'delta'],
  armazem: mundo.armazem,
  ...extra,
});

// ═══════════════════════════════════════ §1 a grandeza é o PONTEIRO, não a tinta
const base = cenaPadrao();
const m = medirHud(ambiente(base));

conferir('§1 a janela inteira está PINTADA pela HUD', (() => {
  const r = base.hud.getBoundingClientRect();
  return r.width === LARGURA && r.height === ALTURA;
})());
conferir(
  '§1 e mesmo assim o ponteiro reivindicado é a fração geométrica',
  Math.abs(m.ponteiro.fracaoReivindicada - FRACAO_EXATA) < 5e-4,
  `mediu ${m.ponteiro.fracaoReivindicada}, geometria dá ${FRACAO_EXATA.toFixed(6)}`
);
conferir(
  '§1 área desenhada e área ao ponteiro NÃO coincidem',
  m.ponteiro.fracaoReivindicada < 0.5,
  `${m.ponteiro.fracaoReivindicada} — se der ~1, a sonda voltou a medir tinta`
);
conferir(
  '§1 o resto chega ao canvas',
  m.ponteiro.aoCanvas === m.ponteiro.pontos - m.ponteiro.reivindicados,
  `${m.ponteiro.aoCanvas} de ${m.ponteiro.pontos}`
);

// ════════════════════════════════ §2 é MEDIDA: acompanha o DOM e independe do passo
const grosso = medirHud(ambiente(base), { passo: 32 });
conferir(
  '§2 o passo declarado governa a grade',
  grosso.ponteiro.passoPx === 32 &&
    grosso.ponteiro.colunas === Math.ceil(LARGURA / 32) &&
    grosso.ponteiro.linhas === Math.ceil(ALTURA / 32) &&
    grosso.ponteiro.pontos === grosso.ponteiro.colunas * grosso.ponteiro.linhas,
  JSON.stringify({ p: grosso.ponteiro.passoPx, c: grosso.ponteiro.colunas, l: grosso.ponteiro.linhas })
);
conferir(
  '§2 dois passos, a mesma fração',
  Math.abs(grosso.ponteiro.fracaoReivindicada - m.ponteiro.fracaoReivindicada) < 5e-4,
  `${grosso.ponteiro.fracaoReivindicada} × ${m.ponteiro.fracaoReivindicada}`
);
const semPainel = cenaPadrao({ semPainel: true });
const mSemPainel = medirHud(ambiente(semPainel));
conferir(
  '§2 tirar um painel do DOM baixa a fração pela área DELE',
  Math.abs(
    (m.ponteiro.fracaoReivindicada - mSemPainel.ponteiro.fracaoReivindicada) -
      (320 * 320) / (LARGURA * ALTURA)
  ) < 5e-4,
  `${m.ponteiro.fracaoReivindicada} → ${mSemPainel.ponteiro.fracaoReivindicada}`
);

// ═══════════════════════════════ §3 forma sem identidade ACUSA, e nada se perde
conferir(
  '§3 o intruso sem identidade é NOMEADO e contado',
  m.ponteiro.desconhecidos.length === 1 &&
    m.ponteiro.desconhecidos[0]?.dono === 'desconhecido:div.intruso' &&
    m.ponteiro.desconhecidos[0]?.pontos === (32 * 32) / (16 * 16),
  JSON.stringify(m.ponteiro.desconhecidos)
);
conferir(
  '§3 a conservação bate — nenhum ponto sumiu na atribuição',
  m.ponteiro.conservacao.bate &&
    m.ponteiro.conservacao.soma === m.ponteiro.pontos &&
    m.ponteiro.conservacao.somaDonos === m.ponteiro.reivindicados,
  JSON.stringify(m.ponteiro.conservacao)
);
conferir(
  '§3 cada dono carrega a fenda onde mora, e o de fora tem `fenda: null`',
  // `?.` de propósito: quando a atribuição perde um dono, esta lei tem de REPROVAR nomeada em
  // vez de explodir — oráculo que morre acusa o oráculo, não a sonda.
  m.ponteiro.donos.every((d) => 'fenda' in d) &&
    m.ponteiro.donos.find((d) => d.dono.startsWith('desconhecido:'))?.fenda === null &&
    m.ponteiro.donos.find((d) => d.dono === 'widget:beta')?.fenda === 'left',
  JSON.stringify(m.ponteiro.donos)
);
conferir(
  '§3 a soma por fenda é a soma por dono',
  Object.values(m.ponteiro.porFenda).reduce((t, f) => t + f.pontos, 0) === m.ponteiro.reivindicados,
  JSON.stringify(m.ponteiro.porFenda)
);

// ═════════════════════ §4 «chegou ao canvas» é o CANVAS, não «não é interface»
const cedendo = cenaPadrao({ canvasCede: true });
const mCedendo = medirHud(ambiente(cedendo));
conferir(
  '§4 canvas que não aceita ponteiro dá aoCanvas = 0',
  mCedendo.ponteiro.aoCanvas === 0,
  `${mCedendo.ponteiro.aoCanvas}`
);
conferir(
  '§4 e o que sobra vai para aoFundo, não para o céu',
  mCedendo.ponteiro.aoFundo === mCedendo.ponteiro.pontos - mCedendo.ponteiro.reivindicados &&
    mCedendo.ponteiro.reivindicados === m.ponteiro.reivindicados,
  JSON.stringify({ fundo: mCedendo.ponteiro.aoFundo, reiv: mCedendo.ponteiro.reivindicados })
);

// ══════════════════ §5 recolhido · aberto · sem controle particionam o montado
const soma = [...m.widgets.recolhidos, ...m.widgets.abertos, ...m.widgets.semControle];
conferir(
  '§5 as três caixas são o montado, sem sobra nem repetição',
  soma.length === m.widgets.montados.length &&
    new Set(soma).size === soma.length &&
    soma.every((id) => m.widgets.montados.includes(id)),
  JSON.stringify({ soma, montados: m.widgets.montados })
);
conferir(
  '§5 recolhido pelo operador, aberto e sem botão saem em caixas diferentes',
  m.widgets.recolhidos.join() === 'alfa' &&
    m.widgets.abertos.join() === 'beta' &&
    m.widgets.semControle.join() === 'gama',
  JSON.stringify({ r: m.widgets.recolhidos, a: m.widgets.abertos, s: m.widgets.semControle })
);

// ═════════════════════════ §6 declarado e AUSENTE do DOM é defeito, e sai só
conferir(
  '§6 o declarado que não montou é acusado',
  m.widgets.ausentes.join() === 'delta',
  JSON.stringify(m.widgets.ausentes)
);
conferir(
  '§6 e ele NÃO se confunde com o recolhido nem com o fora do manifesto',
  !m.widgets.recolhidos.includes('delta') &&
    m.widgets.naoMontados.includes('delta') &&
    m.widgets.naoMontados.includes('epsilon') &&
    !m.widgets.naoMontados.includes('alfa'),
  JSON.stringify(m.widgets.naoMontados)
);
conferir(
  '§6 montado sem a rota declarar também é acusado',
  medirHud(ambiente(base, { declarados: ['alfa', 'beta'] })).widgets.intrusos.join() === 'gama'
);
conferir(
  '§6 o host e o DOM discordarem é medido, não suposto',
  (() => {
    const d = medirHud(ambiente(base, { montados: ['alfa', 'zeta'] })).widgets.divergenciaHost;
    return d.soNoHost.join() === 'zeta' && d.soNoDom.join() === 'beta,gama';
  })()
);

// ══════ §7 decisão do operador sobre widget ausente não vira «recolhido aqui»
conferir(
  '§7 `epsilon` está fechado no armazém e não está montado nesta rota',
  m.widgets.recolhidosForaDaRota.join() === 'epsilon' &&
    !m.widgets.recolhidos.includes('epsilon'),
  JSON.stringify({
    fora: m.widgets.recolhidosForaDaRota,
    recolhidos: m.widgets.recolhidos,
  })
);

// ══════════════════════════════ §8 os três estados do armazém, e `null` ≠ `[]`
const legado = cenaPadrao({ armazenado: JSON.stringify(['alfa', 'epsilon']) });
conferir(
  '§8 o formato antigo (lista pura) continua sendo lido',
  (() => {
    const o = medirHud(ambiente(legado)).widgets.operador;
    return o.formato === 'lista' && o.fechadas.join() === 'alfa,epsilon';
  })()
);
const vazio = cenaPadrao({ armazenado: null });
conferir(
  '§8 operador que nunca decidiu é `ausente` com listas VAZIAS (medida)',
  (() => {
    const o = medirHud(ambiente(vazio)).widgets.operador;
    return o.formato === 'ausente' && Array.isArray(o.fechadas) && o.fechadas.length === 0;
  })()
);
const quebrado = cenaPadrao({ armazenado: '{nao é json' });
conferir(
  '§8 armazém ilegível devolve `null` — «não medi» não vira «medi e não há»',
  (() => {
    const o = medirHud(ambiente(quebrado)).widgets.operador;
    return o.formato === 'ilegivel' && o.fechadas === null && o.abertas === null;
  })()
);

// ═══════════════════════════════════════════════ §9 `null` ≠ `0` no que falta
conferir('§9 sem lista de fontes no documento, `fontes` é null', m.fontes === null);

const comFontes = criarMundo({ largura: LARGURA, altura: ALTURA });
{
  const { criar, body } = comFontes;
  const cv = criar('canvas', { id: 'space', pai: body, caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA } });
  const h = criar('div', { id: 'hud', pai: body, caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA }, estilo: { pointerEvents: 'none' } });
  comFontes.canvas = cv;
  comFontes.hud = h;
  comFontes.vazia = criar('div', {
    classe: 'sources', dados: { sources: '' }, pai: h,
    caixa: { x: 200, y: 400, w: 400, h: 0 },
  });
  comFontes.selar();
}
conferir(
  '§9 lista MONTADA e vazia: `n: 0` e altura de linha `null`',
  (() => {
    const f = medirHud(ambiente(comFontes)).fontes;
    return f !== null && f.n === 0 && f.alturaLinhaPx === null && f.razaoLinha === null && f.fontePx === null;
  })(),
  JSON.stringify(medirHud(ambiente(comFontes)).fontes)
);

const comLinhas = criarMundo({ largura: LARGURA, altura: ALTURA });
{
  const { criar, body } = comLinhas;
  comLinhas.canvas = criar('canvas', { id: 'space', pai: body, caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA } });
  comLinhas.hud = criar('div', { id: 'hud', pai: body, caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA }, estilo: { pointerEvents: 'none' } });
  const cont = criar('div', {
    classe: 'sources', dados: { sources: '' }, pai: comLinhas.hud,
    caixa: { x: 200, y: 400, w: 400, h: 35 }, estilo: { fontSize: '9px', maxHeight: 'none', overflowY: 'visible' },
  });
  for (let i = 0; i < 3; i++) {
    criar('div', { classe: 'source', pai: cont, caixa: { x: 200, y: 400 + i * 11, w: 400, h: 11 } });
  }
  comLinhas.selar();
}
conferir(
  '§9 com linhas, a altura é MEDIDA da caixa e a razão sai dela',
  (() => {
    const f = medirHud(ambiente(comLinhas)).fontes;
    return f.n === 3 && f.alturaLinhaPx === 11 && f.fontePx === 9 &&
      Math.abs(f.razaoLinha - 11 / 9) < 1e-3 && f.lineHeightComputado === 'normal' &&
      f.maxHeight === 'none' && f.overflowY === 'visible' && f.ancorado === true;
  })(),
  JSON.stringify(medirHud(ambiente(comLinhas)).fontes)
);

const noSotao = criarMundo({ largura: LARGURA, altura: ALTURA });
{
  const { criar, body } = noSotao;
  noSotao.canvas = criar('canvas', { id: 'space', pai: body, caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA } });
  noSotao.hud = criar('div', { id: 'hud', pai: body, caixa: { x: 0, y: 0, w: LARGURA, h: ALTURA }, estilo: { pointerEvents: 'none' } });
  criar('div', { classe: 'sources', dados: { sources: '' }, pai: body, caixa: { x: -9999, y: 0, w: 320, h: 200 } });
  noSotao.selar();
}
conferir(
  '§9 lista estacionada no sótão é medida, e marcada como NÃO ancorada',
  medirHud(ambiente(noSotao)).fontes.ancorado === false
);

// ═══════════════════════ §10 painel que existe e CEDE ≠ painel que não existe
conferir('§10 sem painel de palco montado, o campo é null', mSemPainel.painelDePalco === null);
const cede = cenaPadrao({ painelCede: true });
const mCede = medirHud(ambiente(cede));
conferir(
  '§10 painel montado que cede o ponteiro EXISTE, com `aceitaPonteiro: false`',
  mCede.painelDePalco !== null &&
    mCede.painelDePalco.aceitaPonteiro === false &&
    mCede.painelDePalco.aoPonteiro === 0 &&
    mCede.painelDePalco.widget === 'gama',
  JSON.stringify(mCede.painelDePalco)
);
conferir(
  '§10 painel que captura devolve os pontos DELE',
  m.painelDePalco.aceitaPonteiro === true &&
    m.painelDePalco.aoPonteiro === (320 * 320) / (16 * 16) &&
    Math.abs(m.painelDePalco.fracaoJanela - (320 * 320) / (LARGURA * ALTURA)) < 1e-3,
  JSON.stringify(m.painelDePalco)
);
conferir(
  '§10 a fenda do palco continua medida mesmo com o painel cedendo',
  mCede.fendas.find((f) => f.fenda === 'stage').larguraPx === 576 &&
    mCede.fendas.find((f) => f.fenda === 'stage').aoPonteiro.pontos === 0
);
conferir(
  '§10 os trilhos devolvem altura MEDIDA, não teto suposto',
  (() => {
    const e = m.fendas.find((f) => f.fenda === 'left');
    return e.alturaPx === ALTURA && e.fracaoLargura === 0.2 && e.montados.join() === 'alfa,beta';
  })(),
  JSON.stringify(m.fendas.find((f) => f.fenda === 'left'))
);

// ══════════════════════════════════════════════ §11 a sonda não escreve nada
conferir(
  '§11 nenhuma escrita no DOM nem no armazém durante todas as medidas',
  escritas.length === 0,
  escritas.slice(0, 6).join(' · ')
);

// ─────────────────────────────────────────────────────── o carimbo e a saída
conferir(
  '§0 o resultado carimba rota, janela e o instante',
  m.rota.id === 'files' && m.janela.larguraPx === LARGURA && m.janela.dpr === 2 &&
    typeof m.quando === 'string' && m.quando.endsWith('Z')
);

console.log(`\x1b[1mA LEI DA SONDA DA HUD\x1b[0m  ${ok.length + falhas.length} leis`);
for (const nome of ok) console.log(`  \x1b[32m✓\x1b[0m ${nome}`);
for (const f of falhas) console.log(`  \x1b[31m✗\x1b[0m ${f}`);

if (falhas.length) {
  console.log(`\n\x1b[31m✗ ${falhas.length} lei(s) caíram\x1b[0m`);
  process.exit(1);
}
console.log(
  `\n\x1b[32m✓ as ${ok.length} leis valem\x1b[0m  ` +
    `— grade ${m.ponteiro.colunas}×${m.ponteiro.linhas} sobre ${LARGURA}×${ALTURA}, ` +
    `${m.ponteiro.reivindicados} de ${m.ponteiro.pontos} pontos ao ponteiro`
);
