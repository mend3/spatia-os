/**
 * O VOCABULÁRIO DE TOM — os adjetivos que uma linha da HUD pode carregar, num lugar só.
 *
 * ⚠️ **Módulo PURO: sem DOM, sem `three`, sem importar nada.** É o que permite ao oráculo
 * (`scripts/lei-tom.mjs`) lê-lo no Node e conferir contra o CSS.
 *
 * ## Por que ele existe
 *
 * Tom é um PAR: alguém emite e alguma regra pinta. Com o emissor no JS e a regra no CSS, as duas
 * metades divergem sem que nada acuse — e a divergência não é um erro. Nada quebra, nada avisa: a
 * tela apenas DEIXA DE AFIRMAR o que o código afirmou, na cor de uma linha comum.
 *
 * ⚠️ **Um tom vale para TODA superfície que o aceita.** `anunciar()` (`main.js`) manda o mesmo
 * texto e o mesmo tom para `boot.disco` e `streams.note`: família que não o pinte faz o mesmo fato
 * aparecer numa tela e sumir na outra.
 *
 * ## Como se acrescenta um tom
 *
 * Entrada nova aqui **e** regra no CSS de toda família que o aceita. `scripts/lei-tom.mjs` recusa
 * os dois sentidos: tom declarado sem regra (a tela cala) e regra sem tom declarado (CSS morto).
 */

/**
 * Os tons, com o que cada um AFIRMA. O nome descreve o fato, nunca a cor — cor é decisão do CSS,
 * e um tom chamado `amarelo` amarraria a afirmação à paleta.
 */
export const TONS = Object.freeze({
  '': 'sem adjetivo — o fato é neutro e a linha fica na cor de corpo',
  dim: 'ruído de fundo: aconteceu, e não pede leitura',
  good: 'o que se esperava aconteceu',
  warn: 'aconteceu e DEGRADOU algo — o operador ainda pode agir',
  bad: 'falhou',
});

/**
 * As famílias que carregam tom por CLASSE, e o seletor que cada tom tem de encontrar no CSS.
 *
 * ⚠️ **`[data-tone]` fica FORA, e é escopo declarado, não esquecimento:** ali o tom é ATRIBUTO e a
 * regra é sempre casada com a classe do elemento (`.hs-value[data-tone="warn"]`,
 * `.aviso-age[data-tone="warn"]`), então a pergunta *"que regra pinta este tom?"* só tem resposta
 * sabendo QUAL elemento — e é um par que o próprio CSS já mantém junto.
 *
 * `alvo` é o descendente que recebe a cor, ou `null` quando a própria linha recebe.
 */
export const FAMILIAS = Object.freeze({
  row: Object.freeze({
    alvo: '.row-text',
    onde: 'linha da timeline — `el("div", `row ${tom}`)` em hud/streams.js',
    /** `''` e `dim` pintam a LINHA inteira, não o texto: são estado de leitura, não afirmação. */
    naLinha: Object.freeze(['dim']),
    aceita: Object.freeze(['dim', 'good', 'warn', 'bad']),
  }),
  unit: Object.freeze({
    alvo: '.unit-name',
    onde: 'serviço/hook em apps/index.js — `el("div", `unit ${tom}`)`',
    /*
     * `down` é da família e NÃO é tom: ele diz "está fora", que é um fato do serviço, enquanto o
     * tom qualifica a linha. Ficam separados porque `down` pinta OPACIDADE e um tom pinta cor —
     * empilhá-los faria um serviço fora do ar e degradado disputarem o mesmo canal.
     */
    naLinha: Object.freeze(['down']),
    aceita: Object.freeze(['warn']),
  }),
});

/**
 * A classe de uma linha, com o tom já conferido contra o vocabulário.
 *
 * ⚠️ **Tom desconhecido vira SEM ADJETIVO, e não a classe crua** — é o que impede um
 * `note(…, 'urgente')` de pôr no DOM uma classe que nenhuma regra alcança. A linha sai neutra em
 * vez de sair afirmando na cor errada, que é a degradação certa: perde-se o adjetivo, nunca o fato.
 *
 * ⭑ **Isto NÃO substitui `scripts/lei-tom.mjs` §3, e os dois guardam momentos diferentes:** aqui é
 * o runtime impedindo que a classe morta chegue à tela; lá é o commit impedindo que o engano
 * entre. Sem o oráculo, esta função esconderia o erro em vez de acusá-lo.
 */
export const classeDeLinha = (familia, tom = '') => {
  const cfg = FAMILIAS[familia];
  const aceito = cfg && tom && (cfg.aceita.includes(tom) || cfg.naLinha.includes(tom));
  return aceito ? `${familia} ${tom}` : familia;
};
