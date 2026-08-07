/**
 * Estado derivado do stream de eventos, imutável a cada transição.
 *
 * Ninguém escreve aqui direto: o estado é uma função do último evento sobre o anterior.
 * Quem quiser saber "em que regime o sistema está" lê `snapshot()`; quem quiser reagir a
 * uma mudança assina o barramento.
 */
import { on, emit } from './bus.js';

const INITIAL = Object.freeze({
  state: 'boot',
  label: 'INICIANDO',
  question: '',
  answer: '',
  thought: '',
  streaming: false,
  hits: [],
  sources: [],
  webResults: [],
  tools: [],
  plan: [],
  cost: 0,
  turns: 0,
  cogTokens: 0,
  lastError: null,
  limit: null,
  brain: null,
  since: performance.now(),
});

const MAX_TOOLS = 40;

let current = INITIAL;

export const snapshot = () => current;

function commit(patch) {
  const next = Object.freeze({ ...current, ...patch });
  const changedState = next.state !== current.state;
  current = next;
  if (changedState) emit({ t: 'ui.state-changed', state: next.state, label: next.label });
}

/** Liga o store ao barramento. Chamado uma vez no boot. */
export function install() {
  on('query', (e) =>
    commit({
      question: e.text,
      answer: '',
      thought: '',
      streaming: true,
      hits: [],
      sources: [],
      webResults: [],
      tools: [],
      plan: [],
      lastError: null,
      since: performance.now(),
    })
  );

  on('state', (e) => commit({ state: e.state, label: e.label || e.state.toUpperCase() }));
  on('plan', (e) => commit({ plan: e.steps || [] }));
  on('memory', (e) => commit({ hits: e.hits || [] }));
  on('sources', (e) => commit({ sources: e.sources || [] }));
  on('brain', (e) => commit({ brain: e }));
  on('limit', (e) => commit({ limit: e }));
  on('cogload', (e) => commit({ cogTokens: e.tokens || 0 }));
  on('thought', (e) => commit({ thought: (current.thought + e.text).slice(-600) }));
  on('token', (e) => commit({ answer: current.answer + e.text }));

  on('web', (e) => {
    if (e.phase !== 'result') return;
    commit({ webResults: [...current.webResults, ...(e.results || [])] });
  });

  on('tool', (e) => {
    if (e.phase === 'args') return;
    const tools =
      e.phase === 'call'
        ? [...current.tools, { id: e.id, tool: e.tool, kind: e.kind, ok: null, ms: null }]
        : current.tools.map((entry) =>
            entry.id === e.id ? { ...entry, ok: e.ok !== false, ms: e.ms } : entry
          );
    commit({ tools: tools.slice(-MAX_TOOLS) });
  });

  /*
   * `replay` reencena a resposta mas NÃO soma o custo.
   *
   * Reencenar uma execução de ontem não gasta nada; contar de novo faria o gasto da sessão subir
   * por ter olhado o diário, e o número que a HUD mostra deixaria de ser o que se pagou.
   */
  on('answer', (e) =>
    commit({
      answer: e.text || current.answer,
      cost: e.replay ? current.cost : current.cost + (e.cost_usd || 0),
      turns: e.replay ? current.turns : e.turns || current.turns,
      sources: e.sources || current.sources,
    })
  );

  on('error', (e) => commit({ lastError: { service: e.service, message: e.message } }));
  on('done', () => commit({ streaming: false }));
}
