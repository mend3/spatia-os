/**
 * O MOTIVO de uma falha de upstream, em uma frase — a mesma para todo mundo que a mostra.
 *
 * O servidor decide o motivo onde o fato existe (`server/net.py`, `UpstreamError.reason`) e o
 * manda no corpo do erro e no evento do stream. Aqui ele vira texto de tela, num lugar só: o
 * `api.js` o cola na mensagem do `Error` (e assim todo `streams.note` já existente ganha a causa
 * de graça) e a timeline o usa no rótulo. Duas traduções da mesma tabela divergiriam na primeira
 * vez que alguém mexesse numa delas — e o operador leria duas causas diferentes para uma falha.
 *
 * ⚠️ Antes disto a tela dizia `FALHA · TTS` e nada mais: chave inválida (401) e serviço fora (503)
 * chegavam idênticos, porque o `502` do gateway apagava o status de quem realmente falhou.
 */

/** Os rótulos do servidor (`metrics.UPSTREAM_REASONS`), na ordem em que o operador os encontra. */
const MOTIVOS = {
  timeout: 'SEM RESPOSTA',
  unreachable: 'INALCANÇÁVEL',
  http_server: 'SERVIÇO FORA',
  http_client: 'PEDIDO RECUSADO',
  parse: 'RESPOSTA ILEGÍVEL',
  other: '',
};

/**
 * Dentro de `http_client` o status separa causas que o operador trata de formas MUITO diferentes:
 * chave errada é config dele, limite excedido é esperar, rota inexistente é versão trocada.
 */
const POR_STATUS = {
  401: 'CHAVE RECUSADA',
  403: 'ACESSO NEGADO',
  404: 'ROTA INEXISTENTE',
  429: 'LIMITE EXCEDIDO',
};

/**
 * A causa em texto, ou string vazia quando não há o que acrescentar.
 *
 * @param {{reason?: string, status?: number}} falha  como o servidor a descreve
 * @returns {string} em caixa alta, no idioma da HUD
 */
export function causaDe({ reason, status } = {}) {
  const porStatus = status ? POR_STATUS[status] : '';
  const base = porStatus || MOTIVOS[reason] || '';
  if (!base) return '';
  // O número entra junto quando existe: "SERVIÇO FORA (503)" diz o que a frase sozinha não diz,
  // e é o que se cola num relato de erro.
  return status ? `${base} (${status})` : base;
}
