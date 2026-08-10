#!/usr/bin/env node
/**
 * A LEI DO PALCO — sobre o céu, QUEM PINTA REIVINDICA; quem só POSICIONA cede.
 *
 *     node scripts/lei-palco.mjs        # sai 0 quando as leis valem
 *
 * ## A grandeza é ÁREA, e o mecanismo não é roubo de evento
 *
 * ☠️ Os cinco ouvintes de gesto da cena estão presos ao `canvas` (`space/scene.js`:
 * `pointerdown` · `pointerup` · `pointermove` · `wheel` · `click`), e **não há em `window` quem
 * reencaminhe o gesto**. Um retângulo com `pointer-events: auto` por cima do céu não *disputa* o
 * clique: ele impede que o evento exista para a cena — órbita, zoom e pick ficam mortos naquela
 * área, sem fallback e sem nada acusar.
 *
 * Logo o custo de uma superfície da HUD **não é a tinta dela, é a caixa dela**. E as duas divergem
 * quando a caixa que POSICIONA é maior que a caixa que PINTA: no palco, a moldura do painel é
 * `flex: 1` (estica pela coluna central inteira) enquanto o `.widget-body` para no teto de 62vh e
 * na altura do conteúdo. Tudo entre os dois era transparente, reivindicado, e ficava exatamente
 * onde o corpo em foco e o buraco negro são desenhados.
 *
 * | § | a lei | o que ela impede |
 * |---|---|---|
 * | 0 | a varredura ALCANÇA a moldura e o corpo | seletor renomeado deixando a lei muda |
 * | 1 | a MOLDURA cede o ponteiro | a zona morta voltar pela porta que ela já usou |
 * | 2 | e ela cede porque NÃO PINTA | ceder virar hábito: moldura com fundo tem de reconsiderar |
 * | 3 | quem PINTA reivindica — o corpo tem fundo E ponteiro | fundo sem ponteiro: barra de enfeite |
 * | 4 | o corpo NÃO estica | devolver a coluna inteira por um `height: 100%` |
 * | 5 | o escape do VAZIO sobrevive, e alcança o `.scroll` | descendente com `auto` rearmando a área |
 * | 6 | varredura: todo `pointer-events: auto` se justifica por MEDIDA | superfície nova nascer opaca ao gesto sem ninguém saber |
 *
 * ## Por que a §6 é VARREDURA e não lista de quem pode
 *
 * ⚠️ Lista branca é o defeito, não a solução — foi uma que deixou o `splash.js` escrever na tela
 * sem o oráculo saber. Aqui a varredura pega **toda** regra do `index.html` que conceda
 * `pointer-events: auto` e exige que ela se justifique pelo PRÓPRIO CSS: ou a caixa **pinta**
 * (fundo ou borda não transparentes), ou ela é **controle** (o último composto é `a`/`button`/
 * `input`/`.clickable`, ou o elemento declara `cursor`). O que não se justificar tem de constar de
 * `CEDEM_SEM_PINTAR` **com o motivo escrito** — e forma desconhecida ACUSA, nunca é tolerada.
 * A tabela também é conferida ao contrário: entrada que não casa mais nada é tabela velha, e
 * tabela velha é como esta base perde guarda.
 *
 * ## Por que a RAIZ sai de `import.meta.url` e SÓ dela
 *
 * ☠️ Raiz por argumento, variável de ambiente ou caminho de máquina faz o oráculo ler a árvore que
 * lhe apontarem — e aí ele passa sobre uma CÓPIA MUTADA, atestando guarda que a cópia não tem.
 * Derivada do próprio arquivo, copiar a árvore, quebrar uma linha e rodar o oráculo de lá fica
 * VERMELHO. É o que torna a prova de reprovação possível.
 *
 * ## O que ele NÃO prova
 *
 * Nada sobre a tela. Ele lê o CSS DECLARADO; a área que sobra ao céu por rota é medida, não lei, e
 * quem a responde é `spatia.hud()` — `painelDePalco.aoPonteiro / ponteiro.pontos` contra
 * `painelDePalco.fracaoJanela`, e `ponteiro.fracaoAoCanvas` subindo pela mesma diferença.
 * ⚠️ E ele não modela cascata: duas regras disputando a mesma propriedade **acusam**, porque aí
 * quem decide é a ordem × especificidade e este oráculo não adivinha ordem.
 */
import { readFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

/**
 * Quem reivindica o ponteiro SEM pintar e SEM ser controle, com o motivo.
 *
 * ⚠️ Não é lista de quem pode: é a lista dos que a medida não explica, e cada linha é uma dívida
 * declarada. Entrada nova aqui é uma decisão; entrada que deixou de casar alguma coisa é acusada
 * como tabela velha.
 */
const CEDEM_SEM_PINTAR = {
  '.scroll':
    'a caixa rolável de lista. Sem fundo POR MEDIDA (`hud/yield.js`: fundo opaco na HUD hairline ' +
    'perde legibilidade na tela toda) e sem ponteiro a barra é enfeite, porque o `#hud` é ' +
    '`pointer-events: none`. Ela nunca é a caixa mais externa — no palco vive DENTRO do ' +
    '`.widget-body`, que pinta; nos trilhos, dentro do `aside`. Reivindicar área que o pai já ' +
    'reivindica não acrescenta zona morta sobre o céu.',
};

// ═════════════════════════════════════════════════ o CSS, lido como cascata
const html = readFileSync(`${RAIZ}/index.html`, 'utf8');
const estilos = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
if (!estilos.length) {
  console.error('\x1b[31m✗ nenhum <style> em index.html\x1b[0m — não há o que auditar, e passar seria pior.');
  process.exit(1);
}
const css = estilos.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

/** Regras em ORDEM DE DOCUMENTO, com o contexto de `@media`/`@keyframes` preservado. */
function regrasDe(texto) {
  const saida = [];
  const contexto = [];
  let buffer = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') {
      const seletor = buffer.trim();
      buffer = '';
      if (seletor.startsWith('@')) {
        contexto.push(seletor);
        continue;
      }
      let j = i + 1;
      let profundidade = 1;
      while (j < texto.length && profundidade > 0) {
        if (texto[j] === '{') profundidade++;
        else if (texto[j] === '}') profundidade--;
        j++;
      }
      saida.push({ seletor, corpo: texto.slice(i + 1, j - 1), contexto: contexto.join(' ') });
      i = j - 1;
      continue;
    }
    if (c === '}') {
      contexto.pop();
      buffer = '';
      continue;
    }
    buffer += c;
  }
  return saida;
}

const regras = regrasDe(css).filter((r) => !r.contexto.includes('@keyframes'));

/** As declarações de uma regra, `propriedade → valor`, a última ganhando. */
function declaracoes(corpo) {
  const mapa = new Map();
  for (const parte of corpo.split(';')) {
    const i = parte.indexOf(':');
    if (i < 0) continue;
    const prop = parte.slice(0, i).trim();
    if (!/^[a-z-]+$/.test(prop)) continue;
    mapa.set(prop, parte.slice(i + 1).trim());
  }
  return mapa;
}

// ─────────────────────────────────────── o mínimo de seletor que a lei precisa
/*
 * ⚠️ Separar por vírgula e por combinador tem de ser CIENTE DE PARÊNTESES: o escape do vazio é
 * `:has(> .widget-body > .scroll > .widget-empty:only-child)`, e um split ingênuo em `>` o parte
 * no meio — a lei passaria a falar de um seletor que não existe.
 */
function dividirPorTopo(texto, separadores) {
  const partes = [];
  let atual = '';
  let profundidade = 0;
  for (const c of texto) {
    if (c === '(' || c === '[') profundidade++;
    else if (c === ')' || c === ']') profundidade--;
    if (profundidade === 0 && separadores.includes(c)) {
      if (atual.trim()) partes.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

const porVirgula = (sel) => dividirPorTopo(sel, ',');
const compostos = (sel) => dividirPorTopo(sel, ' >+~\n\t');
const ultimoComposto = (sel) => compostos(sel).pop() || '';

/**
 * O composto decomposto: tag, ids, classes, atributos e pseudos (o que o torna CONDICIONAL).
 *
 * ☠️ O `#id` é EXIGÊNCIA como qualquer outra, e esquecê-lo faz o oráculo passar sobre a árvore
 * toda: sem ele `#hud` vira composto vazio, casa qualquer elemento, e a lei passa a ler o fundo
 * da HUD como se fosse o fundo da moldura. A primeira versão desta lei fez exatamente isso, e a
 * §2 caiu acusando um `radial-gradient` que é do `#hud`.
 *
 * `::before`/`::after` descrevem uma caixa GERADA, não o elemento — quem casa com elas responde
 * por outra coisa, e por isso não casam com ninguém aqui.
 */
const PSEUDO_ELEMENTOS = new Set([
  'before',
  'after',
  'marker',
  'placeholder',
  'selection',
  'backdrop',
  'first-line',
  'first-letter',
]);

function analisar(composto) {
  /*
   * ☠️ O ARGUMENTO de `:has()`/`:is()` descreve OUTRO elemento, e lê-lo como exigência deste faz
   * o composto pedir classes que o alvo nunca terá — o casamento falha e a lei fica muda no lugar
   * de acusar. Uma mutação de prova pegou isto: `.widget-body:has(> .scroll > .widget-empty…)`
   * era lido como exigindo `.scroll` E `.widget-empty` no próprio corpo.
   * O NOME do pseudo fica (é ele que torna a regra condicional); o que sai é a carga.
   */
  const nu = composto.replace(/\(([^()]|\([^()]*\))*\)/g, '');
  const classes = new Set([...nu.matchAll(/\.([\w-]+)/g)].map((m) => m[1]));
  const ids = new Set([...nu.matchAll(/#([\w-]+)/g)].map((m) => m[1]));
  const atributos = new Set([...nu.matchAll(/\[\s*([\w-]+)/g)].map((m) => m[1]));
  const pseudos = [...nu.matchAll(/::?([\w-]+)/g)].map((m) => m[1]);
  const tag = /^[a-zA-Z][\w-]*/.exec(nu)?.[0]?.toLowerCase() ?? null;
  return {
    classes,
    ids,
    atributos,
    pseudos,
    tag,
    geraCaixa: nu.includes('::') || pseudos.some((p) => PSEUDO_ELEMENTOS.has(p)),
    texto: composto,
  };
}

/** O composto EXIGE do elemento; o elemento tem de satisfazer tudo o que ele exige. */
function casa(composto, elemento) {
  const c = analisar(composto);
  if (c.geraCaixa) return false;
  if (c.tag && c.tag !== elemento.tag) return false;
  if (c.ids.size) return false;
  for (const classe of c.classes) if (!elemento.classes.has(classe)) return false;
  for (const attr of c.atributos) if (!elemento.atributos.has(attr)) return false;
  return true;
}

/** Pseudo que NÃO condiciona a caixa: seleciona o mesmo elemento em qualquer estado. */
const PSEUDOS_INOCENTES = new Set(['root']);
const condicional = (sel, contexto) =>
  Boolean(contexto) || compostos(sel).some((c) => analisar(c).pseudos.some((p) => !PSEUDOS_INOCENTES.has(p)));

/**
 * O valor EFETIVO de uma propriedade para um elemento, e quantas regras a disputam.
 *
 * Só regras INCONDICIONAIS (sem pseudo, sem `@media`) definem o valor; uma condicional que mexa
 * na mesma propriedade entra como DISPUTA, porque aí quem decide é a cascata e este oráculo
 * avisa em vez de fingir que sabe.
 */
function efetivo(elemento, propriedade) {
  let valor = null;
  let disputas = 0;
  const quem = [];
  for (const regra of regras) {
    for (const sel of porVirgula(regra.seletor)) {
      if (!casa(ultimoComposto(sel), elemento)) continue;
      const v = declaracoes(regra.corpo).get(propriedade);
      if (v === undefined) continue;
      disputas++;
      quem.push(sel);
      if (!condicional(sel, regra.contexto)) valor = v;
      break;
    }
  }
  return { valor, disputas, quem };
}

const elemento = (tag, classes, atributos = []) => ({
  tag,
  classes: new Set(classes),
  atributos: new Set(atributos),
  texto: `${tag}${classes.map((c) => `.${c}`).join('')}${atributos.map((a) => `[${a}]`).join('')}`,
});

/*
 * As três caixas do painel de palco, como o host as monta (`kernel/widgets.js`: `section.widget
 * widget-<slot>` com `data-widget` e `data-panel-surface`; `div.widget-body`; e o `div.scroll`
 * que `listWidget` cria dentro do corpo).
 */
const MOLDURA = elemento('section', ['widget', 'widget-stage'], ['data-widget', 'data-panel-surface']);
const CORPO = elemento('div', ['widget-body']);
const ROLO = elemento('div', ['scroll']);

// ══════════════════════════════════════════════════════ §0 a lei alcança
const regrasDaMoldura = regras.filter((r) =>
  porVirgula(r.seletor).some((s) => casa(ultimoComposto(s), MOLDURA) && /panel-surface/.test(s))
);
const regrasDoCorpo = regras.filter((r) =>
  porVirgula(r.seletor).some((s) => casa(ultimoComposto(s), CORPO) && /panel-surface/.test(s))
);
conferir(
  '§0 a varredura ALCANÇA a moldura do painel de palco',
  regrasDaMoldura.length > 0,
  'nenhuma regra casa `section.widget[data-panel-surface]` — o seletor mudou de nome e a lei ficou muda'
);
conferir(
  '§0 e alcança o CORPO do painel',
  regrasDoCorpo.length > 0,
  'nenhuma regra casa `[data-panel-surface] > .widget-body` — sem ela a §3 não guarda nada'
);

// ═══════════════════════════════════════════════ §1 a MOLDURA cede o ponteiro
const ponteiroDaMoldura = efetivo(MOLDURA, 'pointer-events');
conferir(
  '§1 a MOLDURA do painel de palco CEDE o ponteiro',
  ponteiroDaMoldura.valor === 'none',
  `pointer-events = ${ponteiroDaMoldura.valor} — ela é \`flex: 1\` e estica pela coluna central ` +
    'inteira: reivindicar é cancelar órbita, zoom e pick em cima do corpo em foco'
);
conferir(
  '§1 e uma regra só governa esse ponteiro',
  ponteiroDaMoldura.disputas <= 1,
  `${ponteiroDaMoldura.disputas} regras: ${ponteiroDaMoldura.quem.join(' · ')} — quem decide aí é a cascata, não esta lei`
);

// ═════════════════════════════════════════ §2 e ela cede porque NÃO PINTA
/**
 * PINTAR é deixar tinta na tela, e nem toda borda declarada deixa.
 *
 * ⚠️ `border: 1px solid transparent` é reserva de espaço, não desenho — e `.btn` a usa para não
 * pular ao ganhar contorno no hover. Aceitá-la como tinta faria a §6 justificar um reivindicante
 * pelo motivo errado, e o dia em que o `cursor` saísse a lei continuaria verde.
 */
const fundoPinta = (v) => v !== null && !/^(none|transparent|initial|unset)$/.test(String(v).trim());
const bordaPinta = (v) => {
  if (v === null) return false;
  const s = String(v).trim();
  if (/^(none|0|initial|unset)$/.test(s)) return false;
  if (/\btransparent\b/.test(s)) return false;
  return !/^0(px|em|rem)?(\s|$)/.test(s);
};

const fundoDaMoldura = efetivo(MOLDURA, 'background');
const bordaDaMoldura = efetivo(MOLDURA, 'border');
conferir(
  '§2 a moldura NÃO PINTA fundo',
  !fundoPinta(fundoDaMoldura.valor),
  `background = ${fundoDaMoldura.valor} — se ela passou a pintar, a decisão de ceder o ponteiro ` +
    'tem de ser retomada: o operador veria uma superfície e o gesto atravessaria'
);
conferir(
  '§2 nem borda',
  !bordaPinta(bordaDaMoldura.valor),
  `border = ${bordaDaMoldura.valor} — mesma razão: caixa visível que não recebe gesto é mentira de affordance`
);

// ═══════════════════════════════════════ §3 quem PINTA é quem REIVINDICA
const ponteiroDoCorpo = efetivo(CORPO, 'pointer-events');
const fundoDoCorpo = efetivo(CORPO, 'background');
conferir(
  '§3 o CORPO do painel reivindica o ponteiro',
  ponteiroDoCorpo.valor === 'auto',
  `pointer-events = ${ponteiroDoCorpo.valor} — sem isto a moldura cede, o corpo herda o ` +
    '`none` do `#hud` e o painel inteiro fica sem rolagem, seleção nem clique'
);
conferir(
  '§3 e ele PINTA: fundo declarado, em gradiente',
  String(fundoDoCorpo.valor).includes('linear-gradient('),
  `background = ${fundoDoCorpo.valor} — reivindicar sem pintar é a zona morta com outro dono`
);

// ════════════════════════════════════════════════ §4 o corpo NÃO estica
const tetoDoCorpo = efetivo(CORPO, 'max-height');
const alturaDoCorpo = efetivo(CORPO, 'height');
const crescimentoDoCorpo = efetivo(CORPO, 'flex');
conferir(
  '§4 o corpo tem TETO declarado',
  Boolean(tetoDoCorpo.valor) && !/^(none|initial|unset)$/.test(String(tetoDoCorpo.valor)),
  `max-height = ${tetoDoCorpo.valor} — sem teto ele volta a cobrir a coluna e a §1 não terá comprado nada`
);
conferir(
  '§4 e ele não é esticado por altura nem por `flex`',
  (alturaDoCorpo.valor === null || /^(auto|initial|unset)$/.test(String(alturaDoCorpo.valor).trim())) &&
    (crescimentoDoCorpo.valor === null || /^0\s/.test(String(crescimentoDoCorpo.valor))),
  `height = ${alturaDoCorpo.valor} · flex = ${crescimentoDoCorpo.valor} — esticar o que pinta ` +
    'devolveria a coluna inteira ao ponteiro, agora com fundo por cima do astro'
);

// ══════════════════════ §5 o escape do VAZIO sobrevive, e alcança o `.scroll`
/**
 * A ESPECIFICIDADE do seletor, em `(a, b, c)`.
 *
 * ☠️ Existir não é vencer. O escape do vazio está ANTES da regra que concede o ponteiro ao corpo,
 * então empatar em especificidade o mata em silêncio — o painel vazio voltaria a reivindicar e
 * nada acusaria. `:has()`/`:is()`/`:not()` valem pelo argumento MAIS específico; `:where()` vale
 * zero. É a regra da cascata, e é o único ponto em que esta lei precisa modelá-la.
 */
function especificidade(sel) {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const composto of compostos(sel)) {
    let resto = composto;
    for (const m of composto.matchAll(/:(has|is|not|where)\(([\s\S]*)\)/g)) {
      resto = resto.replace(m[0], '');
      if (m[1] === 'where') continue;
      const filhos = porVirgula(m[2]).map(especificidade);
      const maior = filhos.sort((x, y) => y.a - x.a || y.b - x.b || y.c - x.c)[0];
      if (maior) {
        a += maior.a;
        b += maior.b;
        c += maior.c;
      }
    }
    const p = analisar(resto);
    a += p.ids.size;
    b += p.classes.size + p.atributos.size + p.pseudos.filter((x) => !PSEUDO_ELEMENTOS.has(x)).length;
    c += (p.tag ? 1 : 0) + p.pseudos.filter((x) => PSEUDO_ELEMENTOS.has(x)).length;
  }
  return { a, b, c };
}
const vence = (x, y) => (x.a !== y.a ? x.a > y.a : x.b !== y.b ? x.b > y.b : x.c > y.c);
const mostrar = (e) => `${e.a}-${e.b}-${e.c}`;

const doVazio = (alvo) =>
  regras.filter((r) =>
    porVirgula(r.seletor).some(
      (s) =>
        /:has\([^)]*widget-empty[^)]*only-child[^)]*\)/.test(s) &&
        casa(ultimoComposto(s), alvo) &&
        declaracoes(r.corpo).get('pointer-events') === 'none'
    )
  );
conferir(
  '§5 painel VAZIO cede o corpo',
  doVazio(CORPO).length > 0,
  'em repouso o conteúdo é uma dica de uma linha — nem há o que rolar, nem o que selecionar'
);
conferir(
  '§5 e cede o `.scroll` dentro dele',
  doVazio(ROLO).length > 0,
  '`.scroll` declara `pointer-events: auto` por conta própria, e descendente com `auto` volta a ' +
    'ser alvo sob ancestral `none`: sem esta linha o escape cede a caixa e a faixa continua reivindicando'
);

/*
 * ⚠️ E ele tem de VENCER quem concede. O escape está ANTES no documento, então ordem não o salva:
 * quem decide é a especificidade, e empate mataria o escape sem uma linha de aviso.
 */
const selEscape = doVazio(CORPO)
  .flatMap((r) => porVirgula(r.seletor))
  .filter((s) => casa(ultimoComposto(s), CORPO))[0];
/*
 * ⚠️ Contra o MAIS ESPECÍFICO que concede, nunca contra o primeiro. Um `#hud` na frente da regra
 * que dá o ponteiro ao corpo (1-3-0) passa por cima de um escape de 0-7-0 — o `a` vence qualquer
 * `b` —, e comparar com o grant original deixaria a lei verde sobre o escape já morto.
 */
const selConcede = regras
  .filter((r) => declaracoes(r.corpo).get('pointer-events') === 'auto')
  .flatMap((r) => porVirgula(r.seletor))
  .filter((s) => casa(ultimoComposto(s), CORPO) && !condicional(s, ''))
  .sort((x, y) => {
    const [ex, ey] = [especificidade(x), especificidade(y)];
    return ey.a - ex.a || ey.b - ex.b || ey.c - ex.c;
  })[0];
const especEscape = selEscape ? especificidade(selEscape) : null;
const especConcede = selConcede ? especificidade(selConcede) : null;
conferir(
  '§5 e o escape VENCE quem concede — por especificidade, não por ordem',
  Boolean(especEscape && especConcede) && vence(especEscape, especConcede),
  `escape ${especEscape && mostrar(especEscape)} (${selEscape}) contra ` +
    `${especConcede && mostrar(especConcede)} (${selConcede}) — o escape vem ANTES no documento, ` +
    'então empatar é morrer calado'
);

// ═════════════ §6 VARREDURA: todo `pointer-events: auto` se justifica por MEDIDA
const CONTROLES = new Set(['a', 'button', 'input', 'select', 'textarea']);
const pinta = (el) =>
  fundoPinta(efetivo(el, 'background').valor) ||
  bordaPinta(efetivo(el, 'border').valor) ||
  bordaPinta(efetivo(el, 'border-left').valor) ||
  bordaPinta(efetivo(el, 'border-top').valor);

/*
 * ⚠️ CONTROLE antes de PINTA, e a ordem não é gosto. Os dois são justificativa válida, mas o
 * rótulo mente quando erra: `.btn` classificado como «pinta» pela borda transparente sobreviveria
 * ao dia em que o `cursor` saísse, e a lei continuaria verde sobre um retângulo que ninguém sabe
 * por que reivindica.
 */
const reivindicantes = [];
for (const regra of regras) {
  if (declaracoes(regra.corpo).get('pointer-events') !== 'auto') continue;
  for (const sel of porVirgula(regra.seletor)) {
    const composto = ultimoComposto(sel);
    const c = analisar(composto);
    const el = { tag: c.tag, classes: c.classes, atributos: c.atributos, texto: composto };
    const cursor = efetivo(el, 'cursor').valor;
    let veredito;
    if (c.tag && CONTROLES.has(c.tag)) veredito = 'controle (elemento de formulário ou link)';
    else if (c.classes.has('clickable')) veredito = 'controle (`.clickable`, o contrato do `#hud`)';
    else if (cursor) veredito = `controle (\`cursor: ${cursor}\`)`;
    else if (pinta(el)) veredito = 'pinta (fundo ou borda declarados)';
    else if (CEDEM_SEM_PINTAR[composto]) veredito = 'declarado em CEDEM_SEM_PINTAR';
    else veredito = null;
    reivindicantes.push({ seletor: sel, composto, veredito });
  }
}

const injustificados = reivindicantes.filter((r) => !r.veredito);
conferir(
  '§6 todo `pointer-events: auto` do `index.html` se justifica por MEDIDA ou está DECLARADO',
  injustificados.length === 0,
  injustificados
    .map((r) => `\`${r.seletor}\` não pinta, não é controle e não está em CEDEM_SEM_PINTAR`)
    .join(' · ')
);
conferir(
  '§6 a varredura encontrou reivindicantes — ela não está muda',
  reivindicantes.length >= 8,
  `${reivindicantes.length} regras concedem ponteiro; um parser que deixou de casar passa a lei sem guardar nada`
);
const compostosVistos = new Set(reivindicantes.map((r) => r.composto));
const tabelaVelha = Object.keys(CEDEM_SEM_PINTAR).filter((k) => !compostosVistos.has(k));
conferir(
  '§6 e a tabela não está VELHA: toda entrada ainda casa um reivindicante',
  tabelaVelha.length === 0,
  `${tabelaVelha.join(' · ')} — dívida declarada que não existe mais é guarda que ninguém está exercendo`
);

// ───────────────────────────────────────────── §7 o CENSO (medida, não lei)
console.log(`\x1b[1mA LEI DO PALCO\x1b[0m  ${ok.length + falhas.length} leis`);
for (const nome of ok) console.log(`  \x1b[32m✓\x1b[0m ${nome}`);
for (const f of falhas) console.log(`  \x1b[31m✗\x1b[0m ${f}`);

console.log(
  `\n\x1b[1m§7 CENSO\x1b[0m — quem reivindica o ponteiro no \`index.html\` (${reivindicantes.length})`
);
for (const r of reivindicantes) {
  const marca = r.veredito ? '\x1b[32m·\x1b[0m' : '\x1b[31m!\x1b[0m';
  console.log(`  ${marca} ${r.seletor.padEnd(44)} ${r.veredito ?? 'SEM JUSTIFICATIVA'}`);
}
console.log(
  '  ⚠️ é medida, não lei: quanto de céu sobra por rota só `spatia.hud()` responde\n' +
    '     (`painelDePalco.aoPonteiro / ponteiro.pontos` contra `painelDePalco.fracaoJanela`).'
);

if (falhas.length) {
  console.log(`\n\x1b[31m✗ ${falhas.length} lei(s) caíram\x1b[0m`);
  process.exit(1);
}
console.log(
  `\n\x1b[32m✓ as ${ok.length} leis valem\x1b[0m  — a moldura do palco cede (${ponteiroDaMoldura.valor}), ` +
    `o corpo reivindica (${ponteiroDoCorpo.valor}) com teto ${tetoDoCorpo.valor}`
);
