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
/** O arquivo NO DISCO, pela mesma chave que o céu usa. A convenção de caminho é do servidor. */
export const fileBySource = (source) => json(`/api/file?source=${encodeURIComponent(source)}`);
export const dirty = () => json('/api/dirty');
export const integrations = () => json('/api/integrations');
export const mcp = () => json('/api/mcp');
export const speech = () => json('/api/speech');
export const setSpeech = (patch) =>
  fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => (r.ok ? r.json() : r.json().then((b) => Promise.reject(new Error(b.error || r.status)))));

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

/**
 * Stream de eventos do sistema — o que acontece SEM ninguém perguntar (webhooks, hoje).
 *
 * Separado do `ask` de propósito: aquele é o ciclo de uma pergunta e fecha no `done`. Este
 * fica aberto enquanto a página viver, porque o mundo externo não espera o operador.
 *
 * Reconecta com recuo: um servidor reiniciando não pode deixar a cena surda para sempre, e
 * reconectar em loop apertado transformaria a queda num ataque ao próprio servidor.
 */
export function watchSystem() {
  let backoff = 1000;
  const connect = () => {
    const stream = new EventSource('/api/system-events');
    stream.onopen = () => {
      backoff = 1000;
    };
    stream.onmessage = (message) => {
      try {
        emit(JSON.parse(message.data));
      } catch {
        // Frame ilegível não derruba o stream.
      }
    };
    stream.onerror = () => {
      stream.close();
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
  };
  connect();
}

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
