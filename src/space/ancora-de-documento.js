/**
 * O DOCUMENTO DO CORPO EM FOCO, ancorado no MUNDO.
 *
 * ## O que ele responde
 *
 * O conteúdo do astro travado flutuava no centro da tela **sem relação espacial com o astro**, e
 * o operador não tinha como saber se aquilo pertencia ao corpo, ao sistema ou à cena. Este módulo
 * dá ao painel um ENDEREÇO no mundo: ele nasce colado no limbo do corpo, anda com a câmera, e some
 * quando o corpo some.
 *
 * ⚠️ **É a MECÂNICA de `bodies.js` aplicada a outra coisa, e a diferença importa.** `bodies.js`
 * posiciona o RÓTULO de um corpo de app — mobília de UI, tirada do céu por decisão do operador em
 * 2026-08-07 (`main.js`, o bloco de `installApps`). Religar `installApps` traria de volta
 * exatamente o que foi desligado: apps e interruptores orbitando o núcleo. **O que se reaproveita
 * é o padrão — projetar pela câmera e ocluir pelo horizonte —, nunca aquele chamador.**
 *
 * O escopo é UM caso, decidido pelo operador: **o documento do corpo em foco**. Quotas, métricas e
 * permissões continuam fora. O corpo TRAVADO não compete com o astro — ele É o assunto, e o
 * operador acabou de dizer isso com o gesto.
 *
 * ## Por que ele escreve CSS custom property, e não `left`/`top`
 *
 * `transform` é composto na GPU e não invalida layout; `left`/`top` por quadro forçariam reflow do
 * painel inteiro a 120 Hz. É a mesma razão pela qual `bodies.js` usa `visibility` em vez de
 * `display` para os rótulos.
 *
 * ⚠️ **E quem recebe o gesto NÃO muda.** Ele move o `.widget-body`, que é quem PINTA — e a regra
 * do palco é *quem pinta reivindica; quem só posiciona cede* (`lei-palco.mjs`). A moldura
 * (`[data-panel-surface]`) continua `pointer-events: none` e continua onde o flex a põe. A área
 * reivindicada acompanha a tinta porque é a MESMA caixa, deslocada.
 *
 * ⚠️ **Módulo sem `three` no contrato**: ele recebe a câmera e um ponto já projetado pelo
 * chamador, então é testável sem GPU. Ver `scripts/lei-ancora.mjs`.
 */

/**
 * Onde o painel encosta no corpo, em raios aparentes.
 *
 * ⭑ **1 é o limbo.** O documento nasce NA superfície — é isso que o distingue de uma janela que
 * por acaso está perto. A folga é o que impede a borda do painel de comer o limbo desenhado.
 */
const FOLGA_EM_RAIOS = 1.15;
/** Folga mínima em px CSS: com o corpo a 4 px, `1,15 × raio` não separaria nada. */
const FOLGA_MINIMA_PX = 24;

/**
 * Quanto de janela fica entre a borda do painel e a borda da tela, em px CSS.
 *
 * ☠️ **Sem limite, ancorar é PERDER o documento.** O corpo em foco pode sair do quadro (o operador
 * orbita, a câmera deriva), e um painel que o siga sem limite sai junto — o operador fica sem o
 * texto que estava lendo e sem saber por quê. O painel ENCOSTA no limite e para: continua
 * apontando a direção do corpo, sem deixar de ser legível.
 *
 * ☠️ **E o limite é sobre a CAIXA, não sobre o deslocamento — a primeira versão limitou o
 * deslocamento e o defeito sobreviveu na tela.** Com o pulsar preenchendo o quadro (raio aparente
 * 172,8 px), um teto de 34% da janela ainda deixava o painel com a borda esquerda em **−102 px**:
 * o deslocamento estava dentro do teto e o TEXTO estava fora da janela. Um teto sobre o
 * deslocamento é um PROXY do que interessa, e o oráculo que o mede passa verde com o defeito na
 * tela. Quem responde é a caixa pintada contra a janela.
 */
const MARGEM_PX = 12;

/**
 * O estado que o painel publica, para a sonda poder dizer POR QUE ele está onde está.
 *
 * ☠️ *"O documento não se moveu"* tem quatro causas que a tela não separa: não há corpo travado,
 * o painel não está montado, o corpo está atrás da câmera, ou ele está eclipsado pelo horizonte.
 * Cada uma sai por nome — diagnóstico que só existe no caminho feliz não é diagnóstico.
 */
const MOTIVOS = Object.freeze({
  SEM_CORPO: 'sem-corpo-em-foco',
  SEM_PAINEL: 'painel-nao-montado',
  ATRAS: 'corpo-atras-da-camera',
  ECLIPSADO: 'corpo-atras-do-horizonte',
  ANCORADO: 'ancorado',
});

/**
 * @param {() => (Element|null)} acharPainel  o nó do painel, procurado a cada quadro — ele monta e
 *   desmonta com a rota, e guardar a referência deixaria o módulo escrevendo num nó órfão
 */
export function criarAncoraDeDocumento(acharPainel) {
  let ultimo = { motivo: MOTIVOS.SEM_CORPO, x: null, y: null, px: 0, lado: null };
  let painelAnterior = null;

  const soltar = (painel, motivo) => {
    if (painel) {
      painel.removeAttribute('data-ancorado');
      painel.style.removeProperty('--ancora-dx');
      painel.style.removeProperty('--ancora-dy');
    }
    ultimo = { motivo, x: null, y: null, px: 0, lado: null };
  };

  return {
    /**
     * @param {object} ctx
     * @param {{x:number, y:number, z:number}} ctx.ndc   o corpo em foco já projetado (NDC)
     * @param {number} ctx.px        raio aparente do corpo, em px CSS
     * @param {number} ctx.larguraPx tamanho da janela, em px CSS
     * @param {number} ctx.alturaPx
     * @param {boolean} ctx.eclipsado
     */
    atualizar(ctx) {
      const painel = acharPainel();
      /*
       * Painel trocado ou desmontado: o anterior tem de ser SOLTO. Sem isto, um nó que saiu da
       * rota levaria o deslocamento congelado para a próxima vez que montasse — o defeito é mudo,
       * e aparece como "o documento abriu torto".
       */
      if (painelAnterior && painelAnterior !== painel) soltar(painelAnterior, MOTIVOS.SEM_PAINEL);
      painelAnterior = painel;

      if (!painel) return soltar(null, MOTIVOS.SEM_PAINEL);
      if (!ctx) return soltar(painel, MOTIVOS.SEM_CORPO);
      if (ctx.eclipsado) return soltar(painel, MOTIVOS.ECLIPSADO);
      /* `z > 1` é atrás da câmera: a projeção espelha o ponto, e o painel saltaria para o lado errado. */
      if (ctx.ndc.z > 1) return soltar(painel, MOTIVOS.ATRAS);

      const cx = ((ctx.ndc.x + 1) / 2) * ctx.larguraPx;
      const cy = ((1 - ctx.ndc.y) / 2) * ctx.alturaPx;

      const corpo = painel.querySelector(':scope > .widget-body');
      const caixa = corpo ? corpo.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
      /*
       * ☠️ **`getBoundingClientRect` INCLUI o `transform`, e ler a caixa já deslocada realimenta.**
       * O deslocamento do quadro anterior entraria na base do quadro seguinte, e o painel andaria
       * `dx` a cada quadro até sair da janela — uma fuga sem erro nenhum no console. A base é a
       * caixa MENOS o que já foi aplicado, e é por isso que o módulo guarda o último `dx`/`dy`.
       */
      const baseX = caixa.left + caixa.width / 2 - (ultimo.dx ?? 0);
      const baseY = caixa.top + caixa.height / 2 - (ultimo.dy ?? 0);

      const folga = Math.max(ctx.px * FOLGA_EM_RAIOS, ctx.px + FOLGA_MINIMA_PX);
      /*
       * De que LADO do corpo o painel encosta: o lado com mais janela sobrando. Escolher um lado
       * fixo poria o documento fora do quadro sempre que o corpo estivesse naquela borda.
       */
      const lado = cx > ctx.larguraPx / 2 ? -1 : 1;
      const alvoX = cx + lado * (folga + caixa.width / 2);

      /*
       * A caixa PINTADA fica dentro da janela — é ela que carrega o texto, e é ela que o operador
       * perde. Quando a janela é menor que a caixa, o `min` abaixo ficaria acima do `max` e o
       * `clamp` inverteria: o `Math.min` externo garante que o limite inferior nunca ultrapasse o
       * superior, e o painel simplesmente encosta na borda esquerda/superior.
       */
      const prender = (alvo, extensao, janela) => {
        const menor = MARGEM_PX + extensao / 2;
        const maior = Math.max(menor, janela - MARGEM_PX - extensao / 2);
        return Math.max(menor, Math.min(maior, alvo));
      };
      const presoX = prender(alvoX, caixa.width, ctx.larguraPx);
      const presoY = prender(cy, caixa.height, ctx.alturaPx);
      const dx = presoX - baseX;
      const dy = presoY - baseY;

      painel.dataset.ancorado = 'sim';
      painel.style.setProperty('--ancora-dx', `${dx.toFixed(1)}px`);
      painel.style.setProperty('--ancora-dy', `${dy.toFixed(1)}px`);
      ultimo = {
        motivo: MOTIVOS.ANCORADO,
        x: +cx.toFixed(1),
        y: +cy.toFixed(1),
        px: +ctx.px.toFixed(1),
        lado: lado > 0 ? 'direita' : 'esquerda',
        dx: +dx.toFixed(1),
        dy: +dy.toFixed(1),
        /* «encostou na borda» e «acompanhou o corpo» não podem ter a mesma leitura na sonda. */
        noTeto: Math.abs(presoX - alvoX) > 0.5 || Math.abs(presoY - cy) > 0.5,
      };
    },

    /** A sonda: onde o documento está, e por quê. */
    estado: () => ({ ...ultimo }),
  };
}

export { MOTIVOS as MOTIVOS_DA_ANCORA, FOLGA_EM_RAIOS, MARGEM_PX };
