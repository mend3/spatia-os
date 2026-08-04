/**
 * Preferências de UI — estado discreto dos controles, persistido no browser.
 *
 * Divisão de responsabilidade que vale entender antes de acrescentar coisa aqui:
 *
 * | Onde mora | O que é | Por quê |
 * |---|---|---|
 * | `prefs` (aqui) | estado dos controles da UI: toggles, painéis abertos, cinema, mudo | é do operador NESTE navegador; o servidor não tem opinião |
 * | `tuning` | 22 parâmetros numéricos da cena, com faixa e passo | também localStorage, mas tem contrato próprio (SPEC + subscribe) |
 * | servidor | permissões, voz | dirige `claude -p` e chama o TTS — a decisão tem que valer para o processo, não para a aba |
 *
 * A régua: se a configuração muda o que o SERVIDOR faz, ela é do servidor. Se muda o que a
 * tela mostra, é daqui. Voz é do servidor porque quem sintetiza é ele; "VOZ ligada" é daqui
 * porque é escolha de quem está olhando.
 *
 * Toda leitura passa por um default declarado. `get` de chave desconhecida devolve `undefined`
 * em silêncio, e silêncio é o que faz um toggle nascer no estado errado sem ninguém notar.
 */

const STORAGE_KEY = 'espatial.prefs.v1';

export const DEFAULTS = Object.freeze({
  // Controles do rodapé
  'voice.enabled': false,
  /*
   * Três estados, não dois.
   *
   * Era booleano, e `false` era rotulado "AUTO" na tela — mas o cliente mandava `web=0`, que o
   * servidor lê como "não pesquise" EXPLÍCITO. O AUTO nunca pesquisava nada. AUTO de verdade é
   * não mandar o parâmetro, e isso exige um terceiro estado.
   */
  'web.mode': 'auto', // 'auto' | 'on' | 'off'
  'audio.muted': false,

  // Painéis e modos
  'panel.tuning': false,
  'panel.permissions': false,
  'panel.speech': false,
  'view.cinematic': false,

  // Última rota visitada. O hash manda quando presente; isto é o fallback para quem abre a
  // página sem hash e espera voltar onde estava.
  'route.last': '',
});

const listeners = new Set();
let values = { ...DEFAULTS, ...read() };

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // Chave desconhecida é descartada: preferência removida do código não pode ressuscitar do
    // storage de uma versão antiga e ficar sem controle na tela.
    return Object.fromEntries(Object.entries(stored).filter(([key]) => key in DEFAULTS));
  } catch {
    return {};
  }
}

function write() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Modo privado ou storage cheio: a sessão funciona, só não lembra.
  }
}

export function get(key) {
  if (!(key in DEFAULTS)) {
    console.warn(`[prefs] chave não declarada: ${key}`);
    return undefined;
  }
  return values[key];
}

export function set(key, value) {
  if (!(key in DEFAULTS)) {
    console.warn(`[prefs] chave não declarada: ${key}`);
    return;
  }
  if (values[key] === value) return;
  values = { ...values, [key]: value };
  write();
  for (const handler of [...listeners]) {
    try {
      handler(key, value, values);
    } catch (error) {
      console.error('[prefs] assinante falhou', error);
    }
  }
}

export const all = () => ({ ...values });

export function subscribe(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function reset() {
  values = { ...DEFAULTS };
  write();
  for (const handler of [...listeners]) handler(null, null, values);
}
