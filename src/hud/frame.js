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
  const headstat = root.querySelector('[data-headstat]');
  const vitals = root.querySelector('[data-vitals]');

  const indicators = new Map();
  const meters = new Map();
  // Último /api/health recebido: o tique de 1s redesenha o cabeçalho com ele sem refazer a
  // chamada. Declarado aqui porque o `setInterval` abaixo o lê.
  let lastHealth = null;

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

  /*
   * Estado residente do cabeçalho.
   *
   * Cada célula responde uma pergunta que o operador tem em QUALQUER app, e nenhuma delas é
   * repetição de widget: os vitais só existem na vista de sistema, e a idade do índice não
   * existia em lugar nenhum.
   *
   * A idade tem tom: verde hoje, amarelo a partir de 3 dias, vermelho a partir de 7. É o único
   * jeito de uma métrica que decai devagar ser notada — número cinza envelhece sem ninguém ver.
   */
  const cells = new Map();

  function headCell(id, label) {
    const value = el('strong', 'hs-value', '—');
    headstat.append(el('span', 'hs-label', label), value);
    cells.set(id, value);
  }

  headCell('cost', 'CUSTO');
  headCell('window', 'JANELA');
  // CHUNKS, não CORPUS. As duas células diziam CORPUS e mostravam números DIFERENTES na mesma
  // tela: aqui os chunks do Qdrant (3.554), no medidor lateral os nós do céu (459). Dois
  // números com o mesmo rótulo ensinam o operador a não confiar em nenhum dos dois.
  headCell('corpus', 'CHUNKS');
  headCell('index', 'ÍNDICE');

  function tone(node, value) {
    if (value) node.dataset.tone = value;
    else delete node.dataset.tone;
  }

  function drawHead(health) {
    const store = snapshot();
    set(cells.get('cost'), money(store.cost));

    if (store.limit?.resets_at) {
      const remaining = Math.max(0, store.limit.resets_at * 1000 - Date.now());
      const hours = Math.floor(remaining / 3_600_000);
      set(cells.get('window'), `${hours}h${String(Math.floor((remaining % 3_600_000) / 60_000)).padStart(2, '0')}`);
      tone(cells.get('window'), store.limit.status === 'allowed' ? '' : 'bad');
    }

    if (!health) return;
    set(cells.get('corpus'), (health.qdrant?.points ?? 0).toLocaleString('pt-BR'));
    tone(cells.get('corpus'), health.qdrant?.online ? '' : 'bad');

    const age = health.index_age_days;
    if (age === null || age === undefined) {
      set(cells.get('index'), '?');
      tone(cells.get('index'), 'warn');
    } else {
      set(cells.get('index'), age === 0 ? 'HOJE' : `${age}d`);
      tone(cells.get('index'), age >= 7 ? 'bad' : age >= 3 ? 'warn' : 'good');
    }
  }

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

    drawHead(lastHealth);

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
      lastHealth = health;
      drawHead(health);
      mark('brain', health.claude_cli || health.brain === 'ollama' ? 'on' : 'off');
      mark('qdrant', health.qdrant?.online ? 'on' : 'off');
      mark('ollama', health.ollama?.online ? 'on' : 'off');
      /*
       * O medidor CORPUS não recebe mais os chunks.
       *
       * Ele é declarado com a unidade `arq` (arquivos) e era escrito aqui com
       * `qdrant.points` — chunks — e logo depois SOBRESCRITO por `applyGraph` com a contagem de
       * nós. Na prática ficava certo por acidente, na ordem do boot; e ficava errado por alguns
       * segundos, exibindo 3.554 sob o rótulo "arq". Quem tem chunk é a célula do cabeçalho.
       */
    },

    applyGraph(count) {
      mark('graph', count > 0 ? 'on' : 'off');
      set(meters.get('corpus'), `${count}`);
    },
  };
}
