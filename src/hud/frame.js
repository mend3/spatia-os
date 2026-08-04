/**
 * A moldura: identidade, relógio, estado dos serviços e os medidores de consumo.
 *
 * Regra do briefing que vale repetir aqui porque é o que define a estética: **nada de
 * cards**. Só rótulo minúsculo, valor grande, linha de 1px e muito vazio. O que separa
 * seções é espaço, não borda.
 *
 * Os indicadores de serviço mostram três estados, não dois — `online`, `offline` e
 * `não configurado`. Um provedor de busca sem chave não é uma falha, e pintá-lo de vermelho
 * ensinaria o operador a ignorar vermelho.
 */
import { on } from '../core/bus.js';
import { snapshot } from '../core/state.js';
import { el, set, clock, money } from './dom.js';

const REFRESH_MS = 1000;

export function createFrame(root) {
  const time = root.querySelector('[data-clock-time]');
  const seconds = root.querySelector('[data-clock-seconds]');
  const date = root.querySelector('[data-clock-date]');
  const stateLabel = root.querySelector('[data-state-label]');
  const stateDot = root.querySelector('[data-state-dot]');
  const services = root.querySelector('[data-services]');
  const vitals = root.querySelector('[data-vitals]');

  const indicators = new Map();
  const meters = new Map();

  function service(id, label) {
    const node = el('span', 'svc');
    const dot = el('i', 'dot');
    node.append(dot, el('span', 'svc-label', label));
    services.append(node);
    indicators.set(id, { node, dot });
  }

  for (const [id, label] of [
    ['brain', 'CORE'],
    ['qdrant', 'MEMORY'],
    ['ollama', 'LOCAL'],
    ['graph', 'GRAPH'],
    ['stream', 'LINK'],
  ]) {
    service(id, label);
  }

  function meter(id, label, unit = '') {
    const row = el('div', 'vital');
    const value = el('strong', 'vital-value', '—');
    row.append(el('span', 'vital-label', label), value, el('span', 'vital-unit', unit));
    vitals.append(row);
    meters.set(id, value);
  }

  meter('cost', 'CUSTO DA SESSÃO');
  meter('turns', 'TURNOS');
  meter('cog', 'CARGA COGNITIVA', 'tk');
  meter('window', 'JANELA 5H');
  meter('corpus', 'CORPUS', 'arq');

  function mark(id, status) {
    const indicator = indicators.get(id);
    if (indicator) indicator.dot.dataset.status = status;
  }

  on('ui.state-changed', ({ state, label }) => {
    set(stateLabel, label || state.toUpperCase());
    stateDot.dataset.state = state;
  });

  on('brain', () => mark('brain', 'on'));
  on('error', (event) => {
    if (event.service === 'stream') mark('stream', 'off');
    if (event.service === 'qdrant') mark('qdrant', 'off');
  });
  on('memory', () => mark('qdrant', 'on'));

  setInterval(() => {
    const now = clock();
    set(time, now.time);
    set(seconds, now.seconds);
    set(date, now.date);

    const store = snapshot();
    set(meters.get('cost'), money(store.cost));
    set(meters.get('turns'), store.turns || '—');
    set(meters.get('cog'), store.cogTokens ? store.cogTokens.toLocaleString('pt-BR') : '—');

    if (store.limit?.resets_at) {
      const remaining = Math.max(0, store.limit.resets_at * 1000 - Date.now());
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      set(meters.get('window'), `${hours}h${String(minutes).padStart(2, '0')}`);
    }
    mark('stream', store.streaming ? 'busy' : 'on');
  }, REFRESH_MS);

  return {
    /** Estado real dos serviços, vindo de `/api/health`. */
    applyHealth(health) {
      mark('brain', health.claude_cli || health.brain === 'ollama' ? 'on' : 'off');
      mark('qdrant', health.qdrant?.online ? 'on' : 'off');
      mark('ollama', health.ollama?.online ? 'on' : 'off');
      set(meters.get('corpus'), health.qdrant?.points?.toLocaleString('pt-BR') ?? '—');
    },

    applyGraph(count) {
      mark('graph', count > 0 ? 'on' : 'off');
      set(meters.get('corpus'), `${count}`);
    },
  };
}
