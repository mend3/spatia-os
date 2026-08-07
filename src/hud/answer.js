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
 */
import { on } from '../core/bus.js';
import { snapshot } from '../core/state.js';
import * as api from '../core/api.js';
import { el, set, shortPath, compact } from './dom.js';

// Um passe só para os três inline que o modelo realmente produz: código, negrito e citação.
// Ordem no alternador importa — código primeiro, senão um `**` dentro de crase viraria negrito.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[\d{1,2}\])/g;
const LIST_ITEM = /^\s*(?:[-*•]|\d{1,2}[.)])\s+/;

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

  function highlight(number) {
    for (const row of sourcesNode.children) {
      row.classList.toggle('active', Number(row.dataset.n) === number);
    }
    const source = sources.find((entry) => entry.n === number);
    if (source?.kind === 'memory') inspect(source.label);
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

  on('sources', (event) => {
    stage.classList.add('has-answer');
    sources = event.sources || [];
    sourcesNode.replaceChildren();
    for (const source of sources) {
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
      sourcesNode.append(row);
    }
  });

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
