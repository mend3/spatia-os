#!/usr/bin/env node
/**
 * A LEI DA REFERÊNCIA — a linha só sai quando um painel VISÍVEL já a afirma, e o `[n]` fica.
 *
 *     node scripts/lei-referencia.mjs        # sai 0 quando as leis valem
 *
 * A lista de fontes é redundante numa rota e insubstituível em oito. `answer` é residente
 * (`src/apps/residentes.js`); `memory` e `web-results` não são — e é essa assimetria, não o
 * tamanho da lista, que decide o que pode sair da tela. Onde o painel existe, ele imprime **o
 * mesmo campo** que a linha; onde não existe, a linha é a única testemunha.
 *
 * ☠️ **E `[n]` é contrato com o prompt** (`server/agent.py`, `sources_of`; `EVENTS.md`): a
 * numeração que o modelo cita é a que a HUD mostra. Uma linha que some levando o número junto
 * faria `citeMark` desenhar como INVENTADA uma fonte real — o mesmo desfecho que o teto de
 * `.sources` foi construído para evitar. Por isso a linha nunca é apagada: ela é APONTADA.
 *
 * | § | a lei | o que ela impede |
 * |---|---|---|
 * | 1 | a declaração NOMEIA quem reafirma cada espécie | espécie nova cedendo a linha sem ninguém ter medido onde mais ela aparece |
 * | 2 | a testemunha é MEDIDA no DOM, quatro perguntas | «o painel está montado» valendo por «o painel está mostrando isto» |
 * | 3 | nenhuma fonte se perde: todo `[n]` sai da montagem | apagar o destino de uma citação já escrita |
 * | 4 | sem testemunha visível, a lista fica INTEIRA | as oito rotas em que a lista é a única testemunha ficarem mudas |
 * | 5 | o casamento é pelo MESMO CAMPO, dos dois lados | duas fontes distintas colapsando numa por parecença |
 * | 6 | a repintura segue a TELA, não o `ui.route` | ler o mount anterior, que é a armadilha do §4 do handoff |
 * | 7 | o nome do painel vem da MOLDURA, nunca transcrito | segunda fonte para o rótulo, livre para divergir |
 *
 * ## Por que a RAIZ sai de `import.meta.url` e só dela
 *
 * ☠️ Raiz por argumento, variável de ambiente ou caminho de máquina faz o oráculo ler a árvore que
 * lhe apontarem — e aí ele passa sobre uma CÓPIA MUTADA, atestando guarda que a cópia não tem.
 * Derivada do próprio arquivo, copiar a árvore, quebrar uma linha e rodar o oráculo de lá fica
 * VERMELHO. É o que torna a prova de reprovação possível.
 *
 * ## O DOM de mentira, e por que ele não é jsdom
 *
 * Ele modela só a regra que `testemunhaVisivel` consome — subir até a moldura, ler `dataset`,
 * casar atributo com valor — e **explode** no seletor que não conhece, em vez de devolver lista
 * vazia. Zero vindo de esboço incompleto é o armadilha §B-20 de `docs/armadilhas.md`: a lei ficaria verde
 * afirmando que ninguém acha a linha, que é exatamente o estado que ela deveria acusar.
 *
 * ## O que ele NÃO prova
 *
 * Nada sobre a tela: que a linha apontada caiba na régua, que as marcas `.cite` não quebrem em
 * duas linhas, que o painel para o qual ela aponta esteja de fato legível naquele DPR. A §8 é
 * CENSO — medida derivada das constantes declaradas, não lei — e o número de provedores com
 * chave só `websearch.online_providers()` responde, em execução.
 */
import { readFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

const answerSrc = readFileSync(`${RAIZ}/src/hud/answer.js`, 'utf8');
/**
 * O CÓDIGO, sem os comentários.
 *
 * ☠️ Varrer o arquivo inteiro deixaria a PROSA satisfazer a lei: o comentário que explica por que
 * o `ui.route` está proibido contém o nome do evento, e o que nomeia os painéis contém o rótulo
 * que a §7 proíbe transcrever.
 */
const semComentarios = (fonte) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const answer = semComentarios(answerSrc);

const { SEGUNDA_TESTEMUNHA, testemunhaVisivel, montarFontes, apontadasEm } = await import(
  `${RAIZ}/src/hud/answer.js`
);

conferir(
  '§0 o módulo expõe a declaração, a medida e a montagem',
  SEGUNDA_TESTEMUNHA && typeof testemunhaVisivel === 'function'
    && typeof montarFontes === 'function' && typeof apontadasEm === 'function',
  'sem os três não há o que provar por execução, e provar por regex foi como esta base perdeu guarda'
);
if (typeof montarFontes !== 'function' || typeof testemunhaVisivel !== 'function') {
  console.error('\x1b[31m✗ src/hud/answer.js não exporta a montagem\x1b[0m');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════ o DOM de mentira
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const desescapar = (v) => v.replace(/\\(.)/g, '$1');

/** O valor de um atributo, com `data-*` vindo do `dataset` — que é o que o código lê. */
function atributo(no, nome) {
  return nome.startsWith('data-') ? no.dataset[camel(nome.slice(5))] : no.attrs[nome];
}

function casa(no, sel) {
  const comValor = /^\[([a-zA-Z-]+)="((?:[^"\\]|\\.)*)"\]$/.exec(sel);
  if (comValor) return atributo(no, comValor[1]) === desescapar(comValor[2]);
  const presenca = /^\[([a-zA-Z-]+)\]$/.exec(sel);
  if (presenca) return atributo(no, presenca[1]) !== undefined;
  const classe = /^\.([\w-]+)$/.exec(sel);
  if (classe) return String(no.className || '').split(/\s+/).includes(classe[1]);
  // ☠️ Seletor que este mundo não modela ABORTA. Devolver null daria «não achei» com cara de medida.
  throw new Error(`o mundo de mentira não modela o seletor "${sel}" — modele-o ou a lei mente`);
}

function no(tag, cfg = {}) {
  const alvo = {
    tagName: String(tag).toUpperCase(),
    className: cfg.classe ?? '',
    dataset: { ...(cfg.dados || {}) },
    attrs: { ...(cfg.attrs || {}) },
    texto: cfg.texto ?? '',
    parentElement: null,
    filhos: [],
    get textContent() {
      return this.texto + this.filhos.map((f) => f.textContent).join('');
    },
    querySelectorAll(sel) {
      const saida = [];
      const desce = (n) => { for (const f of n.filhos) { if (casa(f, sel)) saida.push(f); desce(f); } };
      desce(this);
      return saida;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
    closest(sel) {
      for (let n = this; n; n = n.parentElement) if (casa(n, sel)) return n;
      return null;
    },
    getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
  };
  for (const filho of cfg.filhos || []) { alvo.filhos.push(filho); filho.parentElement = alvo; }
  return alvo;
}

/** A moldura de um widget montado, como `kernel/widgets.js` a constrói. */
const moldura = (id, titulo, corpo, { recolhido = false } = {}) =>
  no('section', {
    classe: 'widget widget-right',
    dados: { widget: id, ...(recolhido ? { collapsed: 'true' } : {}) },
    filhos: [
      no('button', { classe: 'label', filhos: [no('span', { classe: 'widget-title', texto: titulo })] }),
      no('div', { classe: 'widget-body', filhos: [corpo] }),
    ],
  });

/** A linha de MEMÓRIA RECUPERADA, como `hud/streams.js` a escreve. */
const linhaDeCorpus = (source) => no('div', { classe: 'hit', dados: { source } });
/** A linha de SATÉLITES DE BUSCA — o `href` do `<a>` é o único campo que a identifica. */
const linhaDeWeb = (url) =>
  no('div', { classe: 'web-item', filhos: [no('a', { classe: 'web-title', attrs: { href: url } })] });

const fonteDeCorpus = (n, label) => ({ n, kind: 'memory', label, section: '' });
const fonteDeWeb = (n, url) => ({ n, kind: 'web', label: `titulo ${n}`, url });

/**
 * A tela: o depósito de cada painel, montado numa moldura ou guardado no SÓTÃO.
 *
 * O sótão não é detalhe de cenário — é o estado real entre montagens (`index.html`, `.attic`), e
 * `querySelector('[data-memory]')` acha o nó lá exatamente igual. É o caso que separa «o painel
 * está na tela» de «o nó existe no documento».
 */
function tela({ corpus = null, web = null } = {}) {
  const sotao = no('div', { classe: 'attic', filhos: [] });
  const raiz = no('html', { filhos: [sotao] });
  const guardar = (deposito, painel) => {
    if (!painel) { sotao.filhos.push(deposito); deposito.parentElement = sotao; return; }
    const m = moldura(painel.widget, painel.titulo, deposito, { recolhido: painel.recolhido });
    if (painel.semTitulo) m.querySelector('.widget-title').texto = '';
    raiz.filhos.push(m);
    m.parentElement = raiz;
  };
  guardar(
    no('div', { dados: { memory: '' }, classe: 'scroll', filhos: (corpus?.linhas || []).map(linhaDeCorpus) }),
    corpus
  );
  guardar(
    no('div', { dados: { web: '' }, classe: 'scroll', filhos: (web?.linhas || []).map(linhaDeWeb) }),
    web
  );
  return raiz;
}

const montar = (fontes, raiz) => montarFontes(fontes, (f) => testemunhaVisivel(f, raiz));
/** Os `[n]` que a montagem devolve, em ordem — a prova de que nenhuma fonte se perdeu. */
const numerosDe = (blocos) =>
  blocos.flatMap((b) => (b.tipo === 'ponteiro' ? b.fontes.map((f) => f.n) : [b.fonte.n]));

// ═══════════════════════════════ §1 a DECLARAÇÃO nomeia quem reafirma o quê
const especies = Object.keys(SEGUNDA_TESTEMUNHA);
conferir(
  '§1 toda espécie declarada nomeia painel, depósito e leitor de linha',
  especies.length > 0 && especies.every((k) => {
    const d = SEGUNDA_TESTEMUNHA[k];
    return typeof d.widget === 'string' && d.widget && /^\[data-[\w-]+\]$/.test(d.deposito)
      && typeof d.daLinha === 'function';
  }),
  JSON.stringify(especies)
);

const coreWidgets = readFileSync(`${RAIZ}/src/apps/widgets-core.js`, 'utf8');
conferir(
  '§1 e o painel que ela nomeia EXISTE como widget registrado',
  especies.every((k) => new RegExp(`id:\\s*'${SEGUNDA_TESTEMUNHA[k].widget}'`).test(coreWidgets)),
  'apontar para um id que ninguém registra deixaria a linha na tela para sempre, sem nada acusar'
);

// A espécie fora da tabela não cede a linha — e não porque seja proibida: porque ninguém mediu.
const inedita = { n: 1, kind: 'grafo', label: 'a/b.md' };
conferir(
  '§1 espécie NÃO declarada nunca perde a linha',
  montar([inedita], tela({ corpus: { widget: 'memory', titulo: 'MEMÓRIA RECUPERADA', linhas: ['a/b.md'] } }))
    .every((b) => b.tipo === 'linha'),
  'absorver o desconhecido pela testemunha mais próxima afirmaria uma redundância que ninguém mediu'
);

// ══════════════════════════ §2 a testemunha é MEDIDA — as quatro perguntas
const CORPUS = ['docs/a.md', 'docs/b.md'];
const fontesDeCorpus = CORPUS.map((s, i) => fonteDeCorpus(i + 1, s));
const painelCheio = { widget: 'memory', titulo: 'MEMÓRIA RECUPERADA', linhas: CORPUS };

conferir(
  '§2 montado, aberto, com a linha e com título: a testemunha VALE',
  apontadasEm(montar(fontesDeCorpus, tela({ corpus: painelCheio }))) === CORPUS.length
);
conferir(
  '§2 o nó no SÓTÃO não é testemunha',
  apontadasEm(montar(fontesDeCorpus, tela({}))) === 0,
  '`querySelector` acha o depósito no sótão igual: presença do nó não é presença do painel'
);
conferir(
  '§2 o painel RECOLHIDO não é testemunha',
  apontadasEm(montar(fontesDeCorpus, tela({ corpus: { ...painelCheio, recolhido: true } }))) === 0,
  'recolhido não mostra nada, e abrir um irmão do trilho recolhe os outros e PERSISTE'
);
conferir(
  '§2 a fonte que o painel PODOU mantém a linha inteira',
  apontadasEm(montar(fontesDeCorpus, tela({ corpus: { ...painelCheio, linhas: [CORPUS[0]] } }))) === 1,
  'o painel guarda as últimas N: montado não implica que ESTE resultado esteja nele'
);
conferir(
  '§2 a moldura SEM título na tela não é testemunha',
  apontadasEm(montar(fontesDeCorpus, tela({ corpus: { ...painelCheio, semTitulo: true } }))) === 0,
  'apontar para um painel que não sabe se chamar troca uma linha legível por uma seta cega'
);
conferir(
  '§2 a moldura de OUTRO widget com o mesmo depósito não é testemunha',
  apontadasEm(montar(fontesDeCorpus, tela({ corpus: { ...painelCheio, widget: 'tools' } }))) === 0,
  'o depósito adotado por outro painel afirmaria a fonte num lugar que não fala dela'
);

// ═════════════════════ §3 nenhuma fonte se perde: todo `[n]` sai da montagem
const WEB = ['https://a.example/1', 'https://b.example/2', 'https://c.example/3'];
const todas = [
  ...fontesDeCorpus,
  ...WEB.map((u, i) => fonteDeWeb(fontesDeCorpus.length + i + 1, u)),
];
const cenarios = {
  'sem painel nenhum': tela({}),
  'só o corpus': tela({ corpus: painelCheio }),
  'só a web, podada': tela({ web: { widget: 'web-results', titulo: 'SATÉLITES DE BUSCA', linhas: WEB.slice(1) } }),
  'os dois abertos': tela({
    corpus: painelCheio,
    web: { widget: 'web-results', titulo: 'SATÉLITES DE BUSCA', linhas: WEB },
  }),
  'os dois recolhidos': tela({
    corpus: { ...painelCheio, recolhido: true },
    web: { widget: 'web-results', titulo: 'SATÉLITES DE BUSCA', linhas: WEB, recolhido: true },
  }),
};
const esperados = todas.map((f) => f.n);
const perdidos = [];
const foraDeOrdem = [];
for (const [nome, raiz] of Object.entries(cenarios)) {
  const ns = numerosDe(montar(todas, raiz));
  if (ns.length !== esperados.length || ns.some((n, i) => n !== esperados[i])) {
    (ns.length === esperados.length ? foraDeOrdem : perdidos).push(`${nome}: [${ns.join(',')}]`);
  }
}
conferir(
  '§3 em toda configuração, os `[n]` da montagem são os da lista — nenhum a menos',
  perdidos.length === 0,
  perdidos.join(' · ')
);
conferir(
  '§3 e na mesma ORDEM: o grupo ocupa o lugar da primeira fonte que absorve',
  foraDeOrdem.length === 0,
  foraDeOrdem.join(' · ')
);
conferir(
  '§3 a linha apontada carrega TODOS os números do grupo',
  montar(todas, cenarios['os dois abertos'])
    .filter((b) => b.tipo === 'ponteiro')
    .every((b) => b.fontes.length > 0 && b.fontes.every((f) => Number.isInteger(f.n))),
  'ponteiro sem número é a linha apagada com outro nome'
);

// ═══════════════ §4 sem testemunha visível a lista fica INTEIRA (as oito rotas)
const semPainel = montar(todas, cenarios['sem painel nenhum']);
conferir(
  '§4 sem painel montado, toda fonte tem linha inteira',
  semPainel.length === todas.length && semPainel.every((b) => b.tipo === 'linha'),
  `${semPainel.length} blocos para ${todas.length} fontes — nas rotas sem painel a lista é a ÚNICA testemunha`
);
conferir(
  '§4 e com os painéis recolhidos também',
  apontadasEm(montar(todas, cenarios['os dois recolhidos'])) === 0
);
conferir(
  '§4 com os dois painéis abertos e completos, sobra ZERO linha inteira',
  montar(todas, cenarios['os dois abertos']).every((b) => b.tipo === 'ponteiro'),
  'é a rota raiz: a lista repetia o painel linha por linha'
);
conferir(
  '§4 e um grupo por painel, nunca um por fonte',
  montar(todas, cenarios['os dois abertos']).length === 2,
  'um ponteiro por linha não devolveria altura nenhuma — o ganho é o AGRUPAMENTO'
);

// ═══════════════════════════════ §5 o casamento é pelo MESMO CAMPO, dos dois lados
const streams = readFileSync(`${RAIZ}/src/hud/streams.js`, 'utf8');
const agent = readFileSync(`${RAIZ}/server/agent.py`, 'utf8');
conferir(
  '§5 corpus: o painel carimba `data-source` e a fonte traz o mesmo `hit["source"]`',
  /\.dataset\.source\s*=\s*hit\.source/.test(streams)
    && /"kind":\s*"memory"[\s\S]{0,120}?"label":\s*hit\["source"\]/.test(agent)
    && SEGUNDA_TESTEMUNHA.memory.daLinha({ label: 'x/y.md' }) === '[data-source="x/y.md"]',
  'renomear o campo de um lado só faria a lista parar de ceder — ou pior, ceder para a fonte errada'
);
conferir(
  '§5 web: o painel carimba o `href` e a fonte traz o mesmo `hit["url"]`',
  /\.href\s*=\s*result\.url/.test(streams)
    && /"kind":\s*"web"[\s\S]{0,120}?"url":\s*hit\["url"\]/.test(agent)
    && SEGUNDA_TESTEMUNHA.web.daLinha({ url: 'https://a/b' }) === '[href="https://a/b"]',
  'o `<a>` é o único campo que identifica um resultado no painel — não há `data-*` lá'
);
conferir(
  '§5 e o valor entra ESCAPADO no seletor',
  SEGUNDA_TESTEMUNHA.memory.daLinha({ label: 'a"b' }) === '[data-source="a\\"b"]',
  'aspas cruas no seletor viram sintaxe inválida, e `querySelector` ABORTA a repintura inteira'
);
conferir(
  '§5 fonte sem o campo que a identifica não cede a linha',
  apontadasEm(montar([{ n: 1, kind: 'web', label: 'sem url' }], cenarios['os dois abertos'])) === 0,
  '`null` ≠ `0`: sem campo não é «não está no painel», é «não dá para saber», e aí a linha fica'
);

// ═══════════════════════ §6 a repintura segue a TELA, e não o evento de rota
/*
 * ⚠️ Procurar `new MutationObserver(` no arquivo não prova nada: com DOIS observadores, trocar um
 * deles por `{ observe() {} }` deixava a lei verde e a lista parava de repintar na navegação.
 * A lei liga o NOME que observa ao que o construiu — e quem observa sem ser observador acusa.
 */
const observadores = new Set(
  [...answer.matchAll(/const\s+(\w+)\s*=\s*new MutationObserver\(/g)].map((m) => m[1])
);
const observam = [...answer.matchAll(/(\w+)\.observe\(([^;]*?)\)/g)]
  .map((m) => ({ nome: m[1], opcoes: m[2] }));
const observaCom = (marca) =>
  observam.some((o) => marca.test(o.opcoes) && observadores.has(o.nome));

conferir(
  '§6 quem observa é um `MutationObserver` de verdade',
  observam.length > 0 && observam.every((o) => observadores.has(o.nome)),
  observam.filter((o) => !observadores.has(o.nome)).map((o) => o.nome).join(', ')
);
conferir(
  '§6 a lista se repinta quando a moldura entra ou sai da fenda',
  observaCom(/childList:\s*true/) && /querySelectorAll\('\[data-slot\]'\)/.test(answer),
  'sem isto a resposta atravessa a navegação apontando para um painel que ficou na rota anterior'
);
conferir(
  '§6 e quando o operador recolhe ou abre o painel',
  observaCom(/attributeFilter:\s*\['data-collapsed'\]/),
  'recolher o painel devolve a linha à lista — é o mesmo fato que a §2 mede'
);
conferir(
  '§6 e NÃO pelo `ui.route`',
  !/'ui\.route'/.test(answer),
  'o router emite `ui.route` ANTES do `host.apply`: repintar ali leria o mount anterior'
);
conferir(
  '§6 a citação alcança a linha do PAINEL, pelo mesmo cálculo da lista',
  /function rolarNoPainel\(/.test(answer)
    && /rolarNoPainel\(/.test(answer.slice(answer.indexOf('function highlight')))
    && /deslocamentoAte\(/.test(answer.slice(answer.indexOf('function rolarNoPainel'))),
  'declarar não implementa: sem a chamada em `highlight`, `[n]` apontaria para um nome de painel'
);

// ═════════════════════ §7 o nome do painel vem da MOLDURA, nunca transcrito
const rotulos = especies
  .map((k) => new RegExp(`id:\\s*'${SEGUNDA_TESTEMUNHA[k].widget}'[^\\n]*title:\\s*'([^']+)'`))
  .map((re) => re.exec(coreWidgets)?.[1])
  .filter(Boolean);
conferir(
  '§7 os rótulos dos painéis são legíveis no registro',
  rotulos.length === especies.length,
  `achei ${rotulos.length} de ${especies.length} — sem eles a lei abaixo não teria o que procurar`
);
/*
 * ⚠️ Aqui a varredura é do CÓDIGO sem comentários, e a razão é a INVERSA da usual: prosa não é
 * renderizada. Citar «MEMÓRIA RECUPERADA» num comentário para explicar o mecanismo é o que os
 * comentários existem para fazer; o que não pode é o rótulo virar literal que a tela imprime.
 */
conferir(
  '§7 e nenhum deles é literal no código do `answer.js`',
  rotulos.every((r) => !answer.includes(r)),
  'o título tem de sair de `.widget-title` na moldura; cópia aqui é segunda fonte livre para divergir'
);

// ───────────────────────────────────────────── §8 o CENSO (medida, não lei)
const numero = (fonte, nome) => {
  const m = new RegExp(`${nome}\\s*=\\s*(\\d+)`).exec(fonte);
  return m ? Number(m[1]) : null;
};
const websearch = readFileSync(`${RAIZ}/server/websearch.py`, 'utf8');
const doServidorCorpus = numero(agent, 'MEMORY_LIMIT');
const porProvedor = numero(websearch, 'MAX_RESULTS');
const noPainelCorpus = numero(streams, 'MEMORY_LIMIT');
const noPainelWeb = numero(streams, 'WEB_LIMIT');

// ─────────────────────────────────────────────────────── o carimbo e a saída
console.log(`\x1b[1mA LEI DA REFERÊNCIA\x1b[0m  ${ok.length + falhas.length} leis`);
for (const nome of ok) console.log(`  \x1b[32m✓\x1b[0m ${nome}`);
for (const f of falhas) console.log(`  \x1b[31m✗\x1b[0m ${f}`);

console.log(`\n\x1b[1m§8 O CENSO\x1b[0m  \x1b[2m(medida, não lei — os números saem destes arquivos)\x1b[0m`);
console.log(
  `  \x1b[2mgrep -n "MEMORY_LIMIT = \\|MAX_RESULTS = " server/agent.py server/websearch.py src/hud/streams.js\x1b[0m`
);
console.log(`  fontes de corpus por resposta   ${doServidorCorpus}   \x1b[2mserver/agent.py · MEMORY_LIMIT\x1b[0m`);
console.log(`  resultados de web por provedor  ${porProvedor}   \x1b[2mserver/websearch.py · MAX_RESULTS\x1b[0m`);
console.log(`  o painel de corpus guarda       ${noPainelCorpus}   \x1b[2msrc/hud/streams.js · MEMORY_LIMIT\x1b[0m`);
console.log(`  o painel de web guarda          ${noPainelWeb}   \x1b[2msrc/hud/streams.js · WEB_LIMIT\x1b[0m`);
if (doServidorCorpus !== null && noPainelCorpus !== null) {
  const cabem = Math.min(doServidorCorpus, noPainelCorpus);
  console.log(
    `  \x1b[2m→ do corpus, ${cabem} de ${doServidorCorpus} cabem no painel; da web, ${noPainelWeb} de ` +
      `${porProvedor}×P (P = provedores com chave, e só \`websearch.online_providers()\` o responde).\x1b[0m`
  );
  console.log(
    '  \x1b[2m→ quantas linhas de fato saem é por RESPOSTA e por TELA: a lista pergunta pela linha exata,\x1b[0m\n' +
      '  \x1b[2m  e `spatia.hud().fontes` é quem mede o resultado na janela.\x1b[0m'
  );
}

if (falhas.length) {
  console.log(`\n\x1b[31m✗ ${falhas.length} lei(s) caíram\x1b[0m`);
  process.exit(1);
}
console.log(
  `\n\x1b[32m✓ as ${ok.length} leis valem\x1b[0m  — ${especies.length} espécies com testemunha declarada, ` +
    `${Object.keys(cenarios).length} configurações de tela conferidas, nenhum \`[n]\` perdido em nenhuma.`
);
