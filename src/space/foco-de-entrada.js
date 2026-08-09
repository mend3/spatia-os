/**
 * Decide QUE CORPO OLHAR na entrada, entre dois fatos de naturezas diferentes.
 *
 * - **PEDIDO** — o endereço (`#/files/<source>`), um clique, um vizinho no painel. É um fato novo.
 * - **MEMÓRIA** — `prefs['camera.focus']`, onde o operador ESTAVA na sessão anterior.
 *
 * As duas responderiam *"que corpo olhar"*, e sem uma regra a resposta sai da ordem em que app e
 * topologia montam — que não é garantida. **Pedido vence memória; memória nunca sobrescreve
 * pedido**, tenha ele chegado antes ou depois.
 *
 * ## Por que existe um estado PENDENTE, e não uma chamada direta
 *
 * ☠️ Focar um astro cuja POSIÇÃO ainda não resolveu perde o foco em silêncio: o laço de quadro
 * solta o foco de quem não tem posição, e o pedido morre no quadro seguinte sem erro nenhum. Todo
 * alvo — pedido ou memória — espera aqui até ter posição.
 *
 * ## Por que a POSE não acompanha as duas
 *
 * A pose gravada (polar, distância) é do astro da sessão anterior. Restaurando a MEMÓRIA ela é a
 * resposta certa — o operador escolheu aquele zoom e o gravou. Sobre um PEDIDO ela enquadra o corpo
 * novo com o zoom do antigo; ali quem responde é o enquadramento por raio, que não inventa pose.
 * Por isso a origem viaja junto com o alvo até a aplicação.
 *
 * Módulo PURO: sem `three`, sem DOM, sem cena. Exercitado por `scripts/lei-foco.mjs`.
 */

/** De onde veio o alvo que está esperando posição. */
export const ORIGEM = Object.freeze({ PEDIDO: 'pedido', MEMORIA: 'memoria' });

/**
 * @returns o árbitro de entrada. Ele não aplica nada — devolve a DECISÃO, e quem age é a cena.
 */
export function criarFocoDeEntrada() {
  /** `{ source, origem }` esperando posição resolver. */
  let pendente = null;
  /**
   * Alguém já PEDIU, esteja o pedido pendente ou já aplicado.
   *
   * ⚠️ Ele não se apaga ao aplicar. Uma memória que chegasse depois de um pedido já aplicado
   * puxaria a câmera para outro astro — e a única testemunha de que houve pedido seria o alvo em
   * foco, que a memória está prestes a trocar.
   */
  let houvePedido = false;

  return {
    /**
     * Um pedido explícito. Aplica agora se o alvo já tem posição; adia se ainda não.
     *
     * `source` nulo é DESTRAVAR, e também é um pedido: quem destravou não quer a memória de volta.
     *
     * @param {string|null} source
     * @param {boolean} temPosicao  o alvo já tem posição no mundo
     * @returns {'aplicar'|'adiar'}
     */
    pedir(source, temPosicao) {
      houvePedido = true;
      if (source && !temPosicao) {
        pendente = { source, origem: ORIGEM.PEDIDO };
        return 'adiar';
      }
      pendente = null;
      return 'aplicar';
    },

    /**
     * A memória da sessão anterior. Cede a qualquer pedido, e não guarda alvo que o céu não conhece.
     *
     * @param {string} source  o que estava em `prefs`
     * @param {boolean} conhecido  o céu tem este nó
     * @returns {'adiar'|'cedeu'|'sem-alvo'}
     */
    lembrar(source, conhecido) {
      if (houvePedido || pendente?.origem === ORIGEM.PEDIDO) return 'cedeu';
      if (!source || !conhecido) return 'sem-alvo';
      pendente = { source, origem: ORIGEM.MEMORIA };
      return 'adiar';
    },

    /**
     * Consome o pendente para aplicar. A ORIGEM viaja junto: é ela que decide se a pose gravada
     * vale.
     *
     * @returns {{source: string, origem: string}|null}
     */
    consumir() {
      const alvo = pendente;
      pendente = null;
      return alvo;
    },

    /** O alvo nunca resolveu posição dentro do prazo. */
    desistir() {
      const alvo = pendente;
      pendente = null;
      return alvo;
    },

    /** O que está esperando, e de onde veio. */
    pendente: () => (pendente ? { ...pendente } : null),
    /** Alguém já pediu — aplicado ou pendente. */
    houvePedido: () => houvePedido,
  };
}
