/**
 * A resposta e o inspetor de nó.
 *
 * Sem balão de conversa: o texto nasce no centro inferior, embaixo do núcleo, como se
 * emergisse dele. A citação `[n]` é renderizada como marca clicável ligada à fonte de mesmo
 * número — se o número não bate com nada, ele aparece **apagado**, e isso é deliberado: uma
 * citação inventada tem que ser visivelmente inválida, não silenciosamente plausível.
 *
 * O inspetor mostra o conteúdo real do arquivo indexado (via `/api/node`), porque o valor de
 * clicar numa estrela é ler o que ela guarda — não ver metadado sobre ela.
 *
 * A LISTA DE FONTES é limitada pela VISTA, nunca pelo conteúdo: o teto e a rolagem moram no CSS
 * de `.sources`, o total real é publicado no topo, e a citação rola até a linha dela
 * (`deslocamentoAte`). Truncar a lista aqui apagaria o destino de um `[n]` já escrito na resposta.
 *
 * ## A SEGUNDA TESTEMUNHA — por que a lista muda de tamanho conforme a rota
 *
 * A mesma linha é indispensável em oito rotas e redundante numa. `answer` é residente
 * (`apps/residentes.js`); `memory` e `web-results` não são, e o censo de
 * `scripts/lei-residentes.mjs` (§5) diz em quantas rotas cada um mora. Onde o painel existe, a
 * linha imprime **o mesmo campo** que ele: `hit["source"]` na lista e em MEMÓRIA RECUPERADA,
 * `hit["title"]`/`url` na lista e em SATÉLITES DE BUSCA. Onde ele não existe, a lista é a única
 * testemunha — e some com ela é ficar mudo.
 *
 * ☠️ **Por isso a linha nunca é APAGADA: ela é APONTADA.** As linhas que um painel visível já
 * afirma saem, e no lugar delas entra UMA linha que nomeia o painel e carrega **todos os `[n]`
 * daquele grupo** como marca clicável — a mesma `.cite` da prosa. O `[n]` é contrato com o
 * prompt (`agent.sources_of`, `EVENTS.md`), e o painel não mostra número nenhum: apagar a linha
 * sem levar o número junto tiraria da tela a única coisa que a lista tinha de exclusivo.
 */
import { on } from '../core/bus.js';
import { snapshot } from '../core/state.js';
import * as api from '../core/api.js';
import { el, set, shortPath, compact } from './dom.js';

// Um passe só para os três inline que o modelo realmente produz: código, negrito e citação.
// Ordem no alternador importa — código primeiro, senão um `**` dentro de crase viraria negrito.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[\d{1,2}\])/g;
const LIST_ITEM = /^\s*(?:[-*•]|\d{1,2}[.)])\s+/;

/**
 * Como cada espécie de fonte se chama no cabeçalho.
 *
 * ⚠️ A REGRA DO CATÁLOGO: isto NOMEIA o que se sabe ler. Espécie nova não é absorvida pelo total
 * mais próximo — ela sai com o próprio nome cru e ACUSA, porque uma contagem que engole o que não
 * conhece afirma uma composição que ninguém mediu.
 */
const NOME_DA_ESPECIE = { memory: 'DO CORPUS', web: 'DA WEB' };

/** Aspas e barras escapadas, para o valor caber DENTRO de um seletor de atributo. */
const aspas = (valor) => String(valor).replace(/["\\]/g, '\\$&');

/**
 * Qual painel REAFIRMA cada espécie de fonte, e como achar nele a linha DESTA fonte.
 *
 * ⚠️ A REGRA DO CATÁLOGO: isto nomeia as espécies que sabem ter uma segunda testemunha. Espécie
 * fora da tabela **nunca** perde a linha — não porque seja proibida, mas porque ninguém mediu
 * onde mais ela aparece, e «não sei» não autoriza tirar a única testemunha da tela.
 *
 * ☠️ **`daLinha` casa o MESMO CAMPO, nunca uma parecença.** `hit.source` vira `data-source` na
 * linha de MEMÓRIA RECUPERADA (`hud/streams.js`) e vira `label` na fonte de corpus
 * (`server/agent.py`, `sources_of`); `hit.url` vira o `href` do satélite e o `url` da fonte de
 * web. Casar por texto parecido faria duas fontes distintas colapsarem numa, que é como esta base
 * já perdeu grandeza para homônimo.
 *
 * ⚠️ **O painel PODA, e por isso a conferência é por FONTE e não por rota.** `web-results` guarda
 * as últimas `WEB_LIMIT` (`hud/streams.js`) de 18 resultados: «o painel está montado» não implica
 * «este resultado está nele». Perguntar pela linha exata é o que impede a lista de ceder uma
 * testemunha que o painel jogou fora.
 */
export const SEGUNDA_TESTEMUNHA = Object.freeze({
  memory: Object.freeze({
    widget: 'memory',
    deposito: '[data-memory]',
    daLinha: (fonte) => (fonte.label ? `[data-source="${aspas(fonte.label)}"]` : null),
  }),
  web: Object.freeze({
    widget: 'web-results',
    deposito: '[data-web]',
    daLinha: (fonte) => (fonte.url ? `[href="${aspas(fonte.url)}"]` : null),
  }),
});

/**
 * A segunda testemunha desta fonte, se houver uma VISÍVEL agora — ou `null`.
 *
 * São quatro perguntas, e reprovar em qualquer uma devolve `null`, que é «a linha fica». Todas
 * falham para o lado seguro, e nenhuma delas é fato de mundo gravado: são medidas do DOM em
 * vigor, refeitas a cada repintura.
 *
 * | pergunta | o que ela impede |
 * |---|---|
 * | o depósito tem moldura `[data-widget]`? | o nó mora no SÓTÃO (`index.html`, `.attic`) entre as montagens, e `querySelector` o acha lá igual — presença do nó não é presença do painel |
 * | a moldura não está `data-collapsed`? | ☠️ painel recolhido não mostra NADA, e abrir um recolhe todos os irmãos do trilho (`kernel/widgets.js`): na rota raiz os dois painéis são irmãos de `right`, então um clique deixaria a lista sem linha e a tela sem painel |
 * | a linha desta fonte está lá? | a poda do painel (`WEB_LIMIT`) engolir a última testemunha |
 * | a moldura tem título na tela? | apontar para um painel que não sabe se chamar |
 *
 * @param {{kind: string, label?: string, url?: string}} fonte
 * @param {ParentNode} doc  a árvore onde procurar — `document` em produção
 * @returns {{widget: string, titulo: string, deposito: Element, linha: Element}|null}
 */
export function testemunhaVisivel(fonte, doc) {
  const declarada = fonte && Object.hasOwn(SEGUNDA_TESTEMUNHA, fonte.kind)
    ? SEGUNDA_TESTEMUNHA[fonte.kind]
    : null;
  if (!declarada) return null;
  const seletor = declarada.daLinha(fonte);
  if (!seletor) return null;
  const deposito = doc.querySelector(declarada.deposito);
  if (!deposito) return null;
  const moldura = deposito.closest('[data-widget]');
  if (!moldura || moldura.dataset.widget !== declarada.widget) return null;
  if (moldura.dataset.collapsed === 'true') return null;
  const linha = deposito.querySelector(seletor);
  if (!linha) return null;
  const titulo = moldura.querySelector('.widget-title')?.textContent?.trim() || '';
  if (!titulo) return null;
  return { widget: declarada.widget, titulo, deposito, linha };
}

/**
 * A lista, montada: o que ganha linha inteira e o que vira PONTEIRO para um painel.
 *
 * Pura — recebe as fontes e um leitor de testemunha, e devolve blocos. Nada de DOM aqui: é o que
 * permite o oráculo perturbar a testemunha e conferir a montagem inteira sem navegador.
 *
 * ☠️ **Nenhuma fonte se perde.** Toda fonte sai num bloco: `linha` (ela mesma) ou `ponteiro`
 * (agrupada com as irmãs do mesmo painel). O grupo ocupa o lugar da PRIMEIRA fonte que absorve,
 * para a lista continuar em ordem de `[n]`.
 *
 * @param {object[]} fontes
 * @param {(fonte: object) => ({widget: string, titulo: string}|null)} testemunhaDe
 * @returns {Array<{tipo: 'linha', fonte: object}|{tipo: 'ponteiro', widget: string, titulo: string, fontes: object[]}>}
 */
export function montarFontes(fontes, testemunhaDe) {
  const blocos = [];
  const grupos = new Map();
  for (const fonte of fontes) {
    const testemunha = testemunhaDe(fonte);
    if (!testemunha) {
      blocos.push({ tipo: 'linha', fonte });
      continue;
    }
    let grupo = grupos.get(testemunha.widget);
    if (!grupo) {
      grupo = { tipo: 'ponteiro', widget: testemunha.widget, titulo: testemunha.titulo, fontes: [] };
      grupos.set(testemunha.widget, grupo);
      blocos.push(grupo);
    }
    grupo.fontes.push(fonte);
  }
  return blocos;
}

/** Quantas fontes saíram da lista por já estarem num painel visível — medida, por repintura. */
export const apontadasEm = (blocos) =>
  blocos.reduce((soma, b) => soma + (b.tipo === 'ponteiro' ? b.fontes.length : 0), 0);

/**
 * Quanto rolar para uma linha entrar na vista da lista — e **zero exato** quando ela já está.
 *
 * Existe porque o teto de `.sources` (`index.html`) é o que impede as 24 fontes de empilharem
 * sobre o disco, e um teto sem isto quebraria a outra ponta: clicar em `[19]` acenderia uma linha
 * FORA da vista, e a citação — que é contrato com o prompt — deixaria de apontar para alguma
 * coisa. Nada é cortado da lista; o que muda é para onde ela está rolada.
 *
 * ☠️ **Não é `scrollIntoView`.** Aquele rola TODO ancestral rolável, e o ancestral aqui é o
 * `.widget-body`, que é `overflow: hidden` — rolá-lo esconderia a resposta sem barra nenhuma, que
 * é exatamente a doença que o teto veio curar. Isto devolve um número, e quem chama mexe num
 * `scrollTop` só.
 *
 * ⚠️ `topoGrudado` é a altura do cabeçalho `position: sticky`: uma linha logo abaixo do topo da
 * caixa está dentro do retângulo e mesmo assim ESCONDIDA atrás dele. Sem descontá-lo, "já está
 * visível" seria verdade sobre a geometria e mentira sobre a tela.
 *
 * @param {{top: number, bottom: number}} caixa  o retângulo da lista
 * @param {{top: number, bottom: number}} linha  o retângulo da linha
 * @param {number} [topoGrudado]  altura ocupada pelo cabeçalho grudado, em px
 * @returns {number} px a somar em `scrollTop` — negativo sobe, positivo desce, `0` não mexe
 */
export function deslocamentoAte(caixa, linha, topoGrudado = 0) {
  const acima = linha.top - (caixa.top + topoGrudado);
  if (acima < 0) return acima;
  const abaixo = linha.bottom - caixa.bottom;
  if (abaixo > 0) return abaixo;
  return 0;
}

export function createAnswer(root) {
  const body = root.querySelector('[data-answer]');
  const sourcesNode = root.querySelector('[data-sources]');
  const meta = root.querySelector('[data-answer-meta]');
  const inspector = root.querySelector('[data-inspector]');
  const inspectorTitle = root.querySelector('[data-inspector-title]');
  const inspectorBody = root.querySelector('[data-inspector-body]');
  const inspectorClose = root.querySelector('[data-inspector-close]');
  const dismissButton = root.querySelector('[data-answer-dismiss]');
  const stage = root.querySelector('.stage');

  let sources = [];

  /**
   * Renderiza a resposta: parágrafos, listas, negrito, código e citações clicáveis.
   *
   * O modelo escreve markdown mesmo quando não se pede, e mostrar `**assim**` cru denuncia
   * que ninguém tratou a saída. O subconjunto tratado é o que ele de fato produz — não é um
   * parser de markdown, e não pretende ser.
   *
   * Tudo é construído com `createElement`/`createTextNode`. Nada de `innerHTML`: este texto
   * vem de um modelo que acabou de ler arquivos e a web, e é exatamente o tipo de conteúdo
   * que não pode virar HTML executável.
   */
  function render(text) {
    body.replaceChildren();
    for (const block of text.split(/\n{2,}/)) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      const lines = trimmed.split('\n');
      if (lines.every((line) => LIST_ITEM.test(line))) {
        const list = el('ul', 'answer-list');
        for (const line of lines) {
          const item = el('li');
          appendInline(item, line.replace(LIST_ITEM, ''));
          list.append(item);
        }
        body.append(list);
        continue;
      }

      const paragraph = el('p', 'answer-p');
      appendInline(paragraph, lines.join(' '));
      body.append(paragraph);
    }
  }

  function appendInline(target, text) {
    let cursor = 0;
    for (const match of text.matchAll(INLINE)) {
      if (match.index > cursor) {
        target.append(document.createTextNode(text.slice(cursor, match.index)));
      }
      const [token, code, bold, citation] = match;
      if (code) {
        target.append(el('code', 'answer-code', code.slice(1, -1)));
      } else if (bold) {
        target.append(el('strong', 'answer-strong', bold.slice(2, -2)));
      } else if (citation) {
        target.append(citeMark(Number(citation.slice(1, -1))));
      }
      cursor = match.index + token.length;
    }
    if (cursor < text.length) target.append(document.createTextNode(text.slice(cursor)));
  }

  function citeMark(number) {
    const source = sources.find((entry) => entry.n === number);
    const mark = el('button', `cite ${source ? '' : 'invalid'}`, `[${number}]`);
    mark.title = source ? source.label : 'citação sem fonte correspondente';
    if (source) mark.addEventListener('click', () => highlight(number));
    return mark;
  }

  /**
   * Os `[n]` que uma linha da lista responde — um, na linha de fonte; vários, no ponteiro.
   *
   * `data-n` e `data-ns` são campos distintos de propósito: `data-ns` lido como `data-n` daria
   * `NaN` para o ponteiro, e o `[n]` clicado não acharia linha nenhuma para acender.
   */
  const numerosDa = (row) => {
    if (row.dataset.n !== undefined) return [Number(row.dataset.n)];
    if (row.dataset.ns) return row.dataset.ns.split(' ').map(Number);
    return [];
  };

  /**
   * Acender uma citação: a linha da lista que a responde, e a linha do PAINEL que a repete.
   *
   * As duas, e não uma: quando a fonte virou ponteiro, a linha da lista diz *onde* ela mora e o
   * painel é quem a mostra. Rolar só a lista deixaria o `[n]` apontando para um nome de painel.
   */
  function highlight(number) {
    let alvo = null;
    for (const row of sourcesNode.children) {
      const ativa = numerosDa(row).includes(number);
      row.classList.toggle('active', ativa);
      if (ativa) alvo = row;
    }
    if (alvo) rolarAte(alvo);
    const source = sources.find((entry) => entry.n === number);
    if (!source) return;
    rolarNoPainel(source);
    if (source.kind === 'memory') inspect(source.label);
  }

  /** A linha acesa entra na vista da lista rolada, sem tocar no scroll de nenhum ancestral. */
  function rolarAte(linha) {
    const grudado = sourcesNode.querySelector('.sources-total');
    const delta = deslocamentoAte(
      sourcesNode.getBoundingClientRect(),
      linha.getBoundingClientRect(),
      grudado ? grudado.getBoundingClientRect().height : 0
    );
    if (delta) sourcesNode.scrollTop += delta;
  }

  /** E a linha correspondente do painel entra na vista DELE — mesmo cálculo, outro depósito. */
  function rolarNoPainel(fonte) {
    const testemunha = testemunhaVisivel(fonte, root);
    if (!testemunha) return;
    const delta = deslocamentoAte(
      testemunha.deposito.getBoundingClientRect(),
      testemunha.linha.getBoundingClientRect()
    );
    if (delta) testemunha.deposito.scrollTop += delta;
  }

  async function inspect(source) {
    inspector.classList.add('open');
    set(inspectorTitle, shortPath(source, 58));
    set(inspectorBody, 'carregando…');
    try {
      const payload = await api.node(source);
      inspectorBody.replaceChildren();
      if (!payload.chunks?.length) {
        set(inspectorBody, 'nenhum chunk indexado para este arquivo');
        return;
      }
      for (const chunk of payload.chunks) {
        const block = el('div', 'chunk');
        if (chunk.section) block.append(el('div', 'chunk-section', `§ ${chunk.section}`));
        block.append(el('pre', 'chunk-text', chunk.text));
        inspectorBody.append(block);
      }
    } catch (error) {
      set(inspectorBody, `falha ao ler: ${error.message}`);
    }
  }

  on('query', () => {
    sources = [];
    body.replaceChildren();
    sourcesNode.replaceChildren();
    set(meta, '');
    inspector.classList.remove('open');
  });

  /**
   * O TOTAL, publicado no topo da lista — a metade que impede o teto de mentir.
   *
   * O teto de `.sources` mostra ~7 das 24 linhas; sem esta, sete linhas à vista leem como
   * *"isto é tudo o que existe"*, que é o defeito que o teto de 28 arcos da rede já resolveu do
   * mesmo jeito (`apps/context.js`, `legenda()`): o corte viaja com o total real ao lado.
   *
   * A composição sai junto porque ela é fato e não se lê das linhas: corpus e web só se
   * distinguem pelo elemento (`<span>` × `<a>`), nunca por cor ou rótulo.
   */
  function totalDeFontes(lista, apontadas) {
    const porEspecie = new Map();
    for (const fonte of lista) porEspecie.set(fonte.kind, (porEspecie.get(fonte.kind) || 0) + 1);
    const partes = [`${lista.length} ${lista.length === 1 ? 'FONTE' : 'FONTES'}`];
    for (const [especie, n] of porEspecie) {
      partes.push(`${n} ${NOME_DA_ESPECIE[especie] || `DE ESPÉCIE ${String(especie).toUpperCase()}`}`);
    }
    // O que saiu da lista é DITO, pelo mesmo motivo que o total: linha que some sem número ao
    // lado lê como «isto é tudo», e aqui leria como fonte perdida.
    if (apontadas) partes.push(`${apontadas} JÁ EM PAINEL`);
    return el('div', 'sources-total', partes.join('  ·  '));
  }

  /** A linha inteira de uma fonte: `[n]`, o rótulo clicável e a seção. */
  function linhaDeFonte(source) {
    const row = el('div', `source ${source.kind}`);
    row.dataset.n = source.n;
    row.append(el('span', 'source-n', `[${source.n}]`));
    const label =
      source.kind === 'web'
        ? el('a', 'source-label', source.label)
        : el('span', 'source-label', shortPath(source.label, 50));
    if (source.kind === 'web') {
      label.href = source.url;
      label.target = '_blank';
      label.rel = 'noreferrer';
    } else {
      label.addEventListener('click', () => inspect(source.label));
    }
    row.append(label);
    if (source.section) row.append(el('span', 'source-section', `§ ${source.section}`));
    return row;
  }

  /**
   * A linha PONTEIRO: n fontes que um painel visível já afirma, e para onde olhar.
   *
   * O título vem da MOLDURA na tela, nunca de uma constante daqui — transcrever «MEMÓRIA
   * RECUPERADA» criaria uma segunda fonte livre para divergir do rótulo que o operador lê.
   *
   * As marcas são `citeMark`, as mesmas da prosa: mesmo elemento, mesmo alvo de clique, e o
   * `title` de cada uma carrega o rótulo da fonte — o mapa `[n] → fonte` continua na tela, que é
   * a única coisa que a lista tinha e o painel não tem.
   */
  function linhaApontada(bloco) {
    const row = el('div', 'source');
    // `data-ns` (plural) e não `data-n`: lido como singular daria `NaN`, e o `[n]` clicado não
    // acharia linha nenhuma para acender. É a linha da lista, com a mesma régua e outra carga.
    row.dataset.ns = bloco.fontes.map((f) => f.n).join(' ');
    row.append(el('span', 'source-n', `${bloco.fontes.length}×`));
    row.append(el('span', 'source-label', `JÁ EM ${bloco.titulo}`));
    const marcas = el('span', 'source-marcas');
    for (const fonte of bloco.fontes) marcas.append(citeMark(fonte.n));
    row.append(marcas);
    return row;
  }

  /**
   * Repinta a lista contra o DOM DE AGORA.
   *
   * ⚠️ Ela roda em toda mudança de testemunha, não só quando as fontes chegam: a mesma resposta
   * atravessa a navegação (o `answer` é residente e o host preserva o que continua declarado), e
   * o painel que a duplicava fica para trás. Sem repintar, a lista ficaria apontando para um
   * painel que não está mais na tela — que é a falha pior que a redundância.
   */
  function pintarFontes() {
    sourcesNode.replaceChildren();
    if (!sources.length) return;
    // Nada de `slice`: o teto é do CSS, e toda fonte sai daqui em algum bloco.
    const blocos = montarFontes(sources, (fonte) => testemunhaVisivel(fonte, root));
    sourcesNode.append(totalDeFontes(sources, apontadasEm(blocos)));
    for (const bloco of blocos) {
      sourcesNode.append(bloco.tipo === 'ponteiro' ? linhaApontada(bloco) : linhaDeFonte(bloco.fonte));
    }
  }

  on('sources', (event) => {
    stage.classList.add('has-answer');
    sources = event.sources || [];
    pintarFontes();
  });

  /*
   * QUANDO A TESTEMUNHA APARECE OU SOME — e por que não é o `ui.route`.
   *
   * ☠️ O router emite `ui.route` ANTES de montar os widgets (`kernel/router.js`: o `host.apply`
   * mora dentro do `setTimeout` do voo). Repintar nesse evento leria o mount ANTERIOR — é a
   * armadilha de `docs/armadilhas.md` §A, «a sonda lida na mesma chamada que emite vem VELHA», e o
   * conserto por temporizador seria um número sem procedência escolhido para a foto fechar.
   *
   * O que muda a resposta são dois fatos observáveis, e cada um tem seu observador:
   * a moldura entra ou sai da fenda (`childList` nas quatro fendas, sem `subtree` — os quadros
   * são filhos diretos) e o operador recolhe ou abre (`data-collapsed`, atributo só). Atributo
   * com `subtree` não dispara em `childList`, então o stream de tokens e as linhas da timeline
   * não repintam nada.
   */
  const repintar = () => { if (sources.length) pintarFontes(); };
  const fendas = [...root.querySelectorAll('[data-slot]')];
  const daMontagem = new MutationObserver(repintar);
  const doRecolher = new MutationObserver(repintar);
  for (const fenda of fendas) {
    daMontagem.observe(fenda, { childList: true });
    doRecolher.observe(fenda, { attributes: true, subtree: true, attributeFilter: ['data-collapsed'] });
  }

  // Reescrever o texto inteiro a cada token é aceitável: a resposta tem centenas de
  // caracteres, não megabytes, e isso mantém as citações consistentes durante o stream.
  on('token', () => {
    stage.classList.add('has-answer');
    render(snapshot().answer);
  });

  on('answer', (event) => {
    render(event.text || snapshot().answer);
    const parts = [`${((event.ms || 0) / 1000).toFixed(1)}s`];
    if (event.turns) parts.push(`${event.turns} turno(s)`);
    if (event.cost_usd) parts.push(`$${event.cost_usd.toFixed(4)}`);
    /*
     * OS TRÊS NÚMEROS DE TOKEN, e até 2026-08-07 só um deles chegava à tela.
     *
     * `brain.py` manda `in`, `out` e `cache_read` desde sempre; aqui saía "450 tokens", que era o
     * `out` sozinho — e é o menor dos três numa execução com contexto. Sem a ENTRADA não dá para
     * ler o custo ao lado ($ por token de entrada é outra ordem), e sem o CACHE não dá para
     * explicar por que uma execução cara e uma barata têm o mesmo tamanho de prompt.
     */
    const tokens = event.tokens || {};
    if (tokens.in || tokens.out) {
      parts.push(`${compact(tokens.in || 0)} → ${compact(tokens.out || 0)} tokens`);
    }
    if (tokens.cache_read) parts.push(`${compact(tokens.cache_read)} de cache`);
    /*
     * `api_ms` viajava e era descartado. Ele e o tempo de PAREDE contam coisas diferentes: a
     * diferença entre os dois é o que o processo local gastou (subir o CLI, ler settings,
     * montar o prompt). Sem os dois, "demorou 9s" não distingue modelo lento de máquina lenta.
     */
    if (event.api_ms) parts.push(`${(event.api_ms / 1000).toFixed(1)}s no modelo`);
    set(meta, parts.join('  ·  '));
  });

  on('error', (event) => {
    body.append(el('div', 'answer-error', `⚠ ${event.service}: ${event.message}`));
  });

  /*
   * O CLIQUE NO CÉU NÃO ABRE MAIS ESTE INSPETOR.
   *
   * Ele nasceu como "leitura rápida do que se clicou no céu" quando o trilho da direita estava
   * livre. Hoje o painel CONTEXTO mora lá, e os dois se sobrepunham quase inteiros (medido:
   * inspetor em x 1041–1461, contexto em 1158–1460) mostrando o MESMO nome de arquivo em dois
   * títulos empilhados. O `apps/index.js` já apontava a troca: "antes de assinar `ui.select` aqui
   * de novo, remova o de lá".
   *
   * A divisão que sobra tem dono claro e não se sobrepõe: identidade e metadado no trilho da
   * direita, CONTEÚDO no palco central — que é grande, rola, e existe para isso. `inspect`
   * continua vivo para o clique numa CITAÇÃO, que é outro gesto: ali o operador quer conferir a
   * fonte sem sair da resposta.
   */

  /**
   * Três formas de fechar o inspetor: o ×, `Esc` e clicar fora.
   *
   * Ele abria sem nenhuma delas — abrir o conteúdo de uma estrela era um caminho sem volta,
   * e o único jeito de tirar o painel da frente era recarregar a página.
   */
  function close() {
    inspector.classList.remove('open');
    for (const row of sourcesNode.children) row.classList.remove('active');
  }

  /**
   * Limpa a resposta e volta ao céu vazio.
   *
   * Faltava isto: uma vez respondido, o texto e as fontes ficavam na tela para sempre e a
   * única saída era F5. Um observatório tem que poder voltar a observar.
   */
  function dismiss() {
    close();
    body.replaceChildren();
    sourcesNode.replaceChildren();
    set(meta, '');
    sources = [];
    stage.classList.remove('has-answer');
  }

  inspectorClose?.addEventListener('click', close);
  dismissButton?.addEventListener('click', dismiss);


  // Clique fora fecha. O canvas propaga o clique, então basta ignorar cliques internos.
  document.addEventListener('pointerdown', (event) => {
    if (!inspector.classList.contains('open')) return;
    if (inspector.contains(event.target)) return;
    // Clique num nó do céu reabre o inspetor no mesmo gesto; deixar o `ui.select` decidir.
    if (event.target.closest?.('.source, .cite')) return;
    close();
  });

  return {
    inspect,
    close,
    dismiss,
    isInspecting: () => inspector.classList.contains('open'),
    hasAnswer: () => stage.classList.contains('has-answer'),
  };
}
