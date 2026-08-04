/**
 * Cliente do backend. Única camada que conhece URLs — o resto do sistema fala por eventos.
 *
 * `ask()` não devolve promessa de resposta: ela empurra cada evento do ciclo cognitivo no
 * barramento assim que chega. É o que faz a animação ser o tempo real da execução em vez
 * de um replay depois do fato.
 */
import { emit } from './bus.js';

const TELEMETRY_INTERVAL_MS = 10_000;

let currentStream = null;

async function json(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({ error: `resposta ilegível de ${path}` }));
  if (!response.ok) throw new Error(body.error || `${response.status} em ${path}`);
  return body;
}

export const health = () => json('/api/health');
export const graph = () => json('/api/graph');
export const search = (query, limit = 8) =>
  json(`/api/search?q=${encodeURIComponent(query)}&n=${limit}`);
export const node = (source) => json(`/api/node?source=${encodeURIComponent(source)}`);
export const file = (path) => json(`/api/file?path=${encodeURIComponent(path)}`);

/**
 * Abre o stream do ciclo cognitivo. `EventSource` não aceita cabeçalho nem POST, mas aqui
 * isso não pesa: a pergunta cabe na query string e a reconexão automática dele é
 * indesejada — o `close()` no `done` evita que o browser reexecute a pergunta sozinho.
 */
export function ask(question, { web = null } = {}) {
  abort();
  const params = new URLSearchParams({ q: question });
  if (web !== null) params.set('web', web ? '1' : '0');

  const stream = new EventSource(`/api/ask?${params}`);
  currentStream = stream;

  stream.onmessage = (message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    emit(event);
    if (event.t === 'done') abort();
  };

  stream.onerror = () => {
    // Um erro depois do `done` é só o fechamento normal; antes dele é queda real.
    if (currentStream !== stream) return;
    abort();
    emit({ t: 'error', service: 'stream', message: 'conexão com o núcleo caiu' });
    emit({ t: 'state', state: 'error', label: 'ENLACE PERDIDO' });
  };
}

export function abort() {
  if (!currentStream) return;
  const stream = currentStream;
  currentStream = null;
  stream.close();
}

export const isStreaming = () => currentStream !== null;

/** Beacon de telemetria da cena — o servidor não tem como saber que o render engasgou. */
export function reportClient(payload) {
  return fetch('/api/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export function startTelemetry(collect) {
  setInterval(() => {
    const sample = collect();
    if (sample) reportClient(sample);
  }, TELEMETRY_INTERVAL_MS);
}
