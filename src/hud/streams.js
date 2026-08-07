/**
 * As colunas laterais: timeline, plano, ferramentas, memória e web.
 *
 * A timeline é o perfil real da execução, não decoração. Cada linha carrega a hora e, quando
 * o evento traz `ms`, a duração medida — é assim que se vê que a recuperação custou 8ms e o
 * núcleo 10s, sem abrir o Grafana.
 *
 * Ferramenta aparece com a cor da família (`tool.kind`), a mesma do wormhole na cena. O
 * operador aprende a associação uma vez e passa a ler a cena sem ler o texto.
 */
import { on } from '../core/bus.js';
import { el, set, feed, shortPath, clock } from './dom.js';
import { causaDe } from '../core/upstream.js';

const TIMELINE_LIMIT = 26;
const MEMORY_LIMIT = 8;
const WEB_LIMIT = 8;
const TOOL_LIMIT = 12;

// Só o que merece uma linha. Token e thought passam por aqui centenas de vezes e virariam
// ruído — eles têm canais próprios (o texto da resposta e a trilha de partículas).
const TIMELINE_LABELS = {
  query: () => 'PERGUNTA RECEBIDA',
  plan: (e) => `PLANO · ${e.steps?.length ?? 0} PASSOS`,
  memory: (e) => `MEMÓRIA · ${e.hits?.length ?? 0} CHUNKS`,
  /*
   * ⚠️ A LINHA DO NÚCLEO CARREGA A SESSÃO, e sem ela não havia como cruzar uma execução da tela
   * com o log do CLI — o `session_id` viajava desde sempre e morria aqui.
   *
   * Oito caracteres bastam para grepar e cabem na régua da HUD; o id inteiro, mais o modelo e o
   * diretório de trabalho, vão no `title` da linha, que é copiável. O modelo entra visível porque
   * "qual cérebro respondeu isto" é a segunda pergunta de quem está lendo a timeline.
   */
  brain: (e) => [
    'NÚCLEO ONLINE',
    e.model,
    `${e.tools ?? 0} FERRAMENTAS`,
    e.session ? e.session.slice(0, 8) : null,
  ].filter(Boolean).join(' · '),
  answer: (e) => `RESPOSTA · ${e.turns ?? 1} TURNO(S)`,
  // A causa entra aqui porque `FALHA · TTS` sozinho não diz se a chave está errada ou se o
  // serviço caiu — e o operador trata os dois de formas diferentes. Ver `core/upstream.js`.
  error: (e) => [`FALHA · ${(e.service || '').toUpperCase()}`, causaDe(e)].filter(Boolean).join(' · '),
  done: () => 'CICLO ENCERRADO',
};

/** O que a linha não mostra e o hover revela. Vazio = sem `title`. */
const TIMELINE_TITLES = {
  brain: (e) => [
    e.session && `sessão ${e.session}`,
    e.model && `modelo ${e.model}`,
    e.cwd && `cwd ${e.cwd}`,
    e.mcp?.length && `mcp ${e.mcp.join(', ')}`,
  ].filter(Boolean).join('\n'),
};

export function createStreams(root, { toolColor }) {
  const timeline = feed(root.querySelector('[data-timeline]'), TIMELINE_LIMIT);
  const memory = feed(root.querySelector('[data-memory]'), MEMORY_LIMIT);
  const tools = feed(root.querySelector('[data-tools]'), TOOL_LIMIT);
  const web = feed(root.querySelector('[data-web]'), WEB_LIMIT);
  const plan = root.querySelector('[data-plan]');
  const openTools = new Map();

  function stamp(text, { tone = '', duration = null } = {}) {
    const row = el('div', `row ${tone}`);
    row.append(el('span', 'row-time', clock().time));
    row.append(el('span', 'row-text', text));
    if (duration !== null) row.append(el('span', 'row-meta', `${duration}ms`));
    timeline.push(row);
    return row;
  }

  on('*', (event) => {
    const label = TIMELINE_LABELS[event.t];
    if (!label) return;
    const row = stamp(label(event), {
      tone: event.t === 'error' ? 'bad' : event.t === 'answer' ? 'good' : '',
      duration: event.ms ?? null,
    });
    // O que não cabe na linha vai para o `title`: hover mostra, e dá para copiar. É o único lugar
    // onde um id de 36 caracteres pode existir sem quebrar a régua da HUD.
    const detalhe = TIMELINE_TITLES[event.t]?.(event);
    if (detalhe) row.title = detalhe;
  });

  on('state', (event) => stamp(`› ${event.label || event.state}`, { tone: 'dim' }));

  on('plan', (event) => {
    plan.replaceChildren();
    for (const step of event.steps || []) {
      const row = el('div', 'plan-step');
      row.append(el('i', 'plan-mark'), el('span', 'plan-label', step.label));
      row.append(el('span', 'plan-target', step.target || ''));
      plan.append(row);
    }
  });

  on('memory', (event) => {
    memory.clear();
    for (const hit of event.hits || []) {
      const row = el('div', 'hit');
      row.dataset.source = hit.source;
      const head = el('div', 'hit-head');
      head.append(el('span', 'hit-score', (hit.score ?? 0).toFixed(3)));
      head.append(el('span', 'hit-path', shortPath(hit.source, 46)));
      row.append(head);
      if (hit.section) row.append(el('div', 'hit-section', `§ ${hit.section}`));
      row.append(el('div', 'hit-text', (hit.text || '').slice(0, 150)));
      memory.push(row);
    }
  });

  on('tool', (event) => {
    if (event.phase === 'call') {
      const row = el('div', 'tool');
      const dot = el('i', 'tool-dot');
      dot.style.background = `#${toolColor(event.kind).toString(16).padStart(6, '0')}`;
      row.append(dot, el('span', 'tool-name', event.tool), el('span', 'tool-meta', '···'));
      tools.push(row);
      if (event.id) openTools.set(event.id, row);
      return;
    }

    if (event.phase === 'args') {
      const row = openTools.get(event.id);
      if (row && event.detail) {
        row.append(el('div', 'tool-detail', event.detail));
      }
      return;
    }

    const row = openTools.get(event.id);
    openTools.delete(event.id);
    if (!row) return;
    row.classList.add(event.ok === false ? 'bad' : 'done');
    set(row.querySelector('.tool-meta'), event.ms !== undefined ? `${event.ms}ms` : 'ok');
    /*
     * O QUE A FERRAMENTA DEVOLVEU, e até 2026-08-07 isto era descartado aqui.
     *
     * O servidor já mandava: `agent._tool_result` põe "6 chunks"/"1200 caracteres"/a mensagem do
     * erro, e `brain._tool_results` corta o conteúdo real do `tool_result` em `RESULT_CHARS`
     * (220) e manda no mesmo campo. O `phase: 'args'` logo acima desenhava o `detail` de ENTRADA
     * e o de SAÍDA morria — a tela dizia que a ferramenta rodou e em quantos ms, nunca o que veio.
     *
     * `→` distingue os dois na mesma linha de grade, e a saída é um tom mais clara que a entrada
     * de propósito: o retorno é a metade que informa. Em falha o texto é a mensagem do erro, e aí
     * ele vale mais ainda — era ela que sumia junto.
     */
    if (event.detail) row.append(el('div', 'tool-detail out', `→ ${event.detail}`));
    stamp(`${event.tool} · ${event.ok === false ? 'FALHOU' : 'OK'}`, {
      tone: event.ok === false ? 'bad' : 'dim',
      duration: event.ms ?? null,
    });
  });

  on('web', (event) => {
    if (event.phase === 'start') {
      stamp(`SATÉLITE ${event.provider.toUpperCase()} ATIVADO`, { tone: 'dim' });
      return;
    }
    if (event.phase === 'error') {
      stamp(`SATÉLITE ${event.provider.toUpperCase()} SEM RESPOSTA`, { tone: 'bad' });
      return;
    }
    for (const result of event.results || []) {
      const row = el('div', 'web-item');
      const link = el('a', 'web-title', result.title || result.url);
      link.href = result.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      row.append(el('span', 'web-provider', event.provider), link);
      row.append(el('div', 'web-snippet', result.snippet || ''));
      web.push(row);
    }
  });

  return {
    /** Provedores no boot: satélite apagado aparece como offline, não como ausente. */
    showProviders(providers) {
      web.clear();
      for (const provider of providers) {
        const row = el('div', `web-item ${provider.online ? '' : 'off'}`);
        row.append(el('span', 'web-provider', provider.label));
        row.append(
          el('span', 'web-title', provider.online ? 'pronto' : `requer ${provider.needs}`)
        );
        web.push(row);
      }
    },
    note: (text, tone) => stamp(text, { tone }),
  };
}
