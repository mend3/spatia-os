/**
 * Dá ENDEREÇO NO MUNDO ao painel de conteúdo do corpo em foco: ele encosta no limbo do astro, anda
 * com a câmera, é iluminado por ele e some quando o corpo some.
 *
 * O escopo é UM caso — **o documento do corpo em foco**. É o único conteúdo de HUD que não compete
 * com os astros, porque ele É o astro em foco; quota, métrica e permissão não têm lugar no mundo, e
 * ocluí-las por um planeta seria feição sem fato.
 *
 * ## O contrato
 *
 * O chamador projeta; este módulo posiciona. Ele não conhece `three`, não lê a cena e só toca o nó
 * que recebe — daí ser exercitável sem GPU por `scripts/lei-ancora.mjs`.
 *
 * ⚠️ **`installApps`/`bodies.js` NÃO é o caminho para isto.** Aquele par posiciona o rótulo de um
 * CORPO DE APP — mobília de interface em órbita do núcleo, que está fora da cena por decisão. O que
 * se reaproveita dele é o padrão (projetar pela câmera, ocluir pelo horizonte), nunca o chamador.
 *
 * ## Por que só propriedades customizadas
 *
 * Ele escreve `--ancora-*` e dois atributos de estado; o CSS decide o que fazer com eles.
 *
 * - `transform` é composto na GPU; `left`/`top` por quadro forçariam reflow do painel a 120 Hz.
 * - **Quem recebe o gesto não pode mudar.** O que se move é o `.widget-body`, que é quem PINTA e por
 *   isso reivindica o ponteiro; a moldura continua `pointer-events: none` e continua onde o flex a
 *   põe. Propriedade customizada não altera comportamento sozinha — só o CSS que a consome altera —,
 *   e é isso que impede este módulo de mexer na regra do palco por acidente.
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
 * Folga entre a borda da CAIXA PINTADA e a borda da janela, em px CSS.
 *
 * ☠️ **O limite é sobre a CAIXA, nunca sobre o deslocamento.** Um teto sobre o deslocamento é
 * PROXY: com um corpo de 172,8 px de raio aparente numa janela de 1426, `dx = −484,8` cabe num teto
 * de 34% da janela e ainda põe a borda esquerda do painel em **−102 px** — deslocamento dentro do
 * limite, texto fora da tela. O corpo em foco sai do quadro quando a câmera orbita; o painel
 * ENCOSTA e para, continuando a apontar a direção sem deixar de ser legível.
 */
const MARGEM_PX = 12;

/**
 * A faixa padrão: a janela inteira. É o que vale quando ninguém mede trilho — e é o certo, porque
 * sem trilho na tela não há o que evitar.
 */
const FAIXA_CHEIA = (larguraPx) => ({ inicio: 0, fim: larguraPx });

/**
 * Quanto a luz precisa andar sobre o painel para valer reescrever o gradiente, em px CSS.
 *
 * `transform` é composto e sai de graça; `radial-gradient` é PINTURA, e repintar uma caixa de
 * ~660×220 por quadro é custo de outra ordem. Abaixo deste passo ninguém vê a diferença.
 *
 * ⚠️ **Com o painel livre a luz não anda:** ele segue o corpo, então a posição RELATIVA à caixa é
 * constante. O gradiente só é reescrito quando o painel prende na borda e o corpo continua — que é
 * exatamente quando há paralaxe a mostrar.
 */
const PASSO_DA_LUZ = 6;

/**
 * Raio aparente, em px CSS, em que o corpo ilumina a superfície com força plena.
 *
 * ⚠️ **Limiar FIXO, e a razão contra ele é adimensional** — nunca posto nem percentil da população.
 * Grandeza derivada de posto encolhe sozinha conforme o corpus cresce; ancorada num limiar fixo,
 * um corpo de 120 px de raio ilumina igual em qualquer céu.
 *
 * O RAIO do gradiente não é constante: ele é a distância da luz até o canto mais distante da caixa,
 * então a queda cobre exatamente a superfície iluminada, em qualquer enquadramento. O que o corpo
 * governa é a FORÇA — astro grande na tela alcança mais longe sobre o painel.
 */
const LUZ_PLENA_PX = 120;

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
 * @param {(larguraPx:number) => ({inicio:number, fim:number})} [medirFaixa]  a faixa em que o painel
 *   pode encostar. ⚠️ **Injetada pelo mesmo motivo que `acharPainel`:** os trilhos são estrutura da
 *   HUD, e este módulo não importa a interface. O padrão é a janela inteira.
 * @param {() => (Element|null)} acharPainel  o nó do painel, procurado a cada quadro — ele monta e
 *   desmonta com a rota, e guardar a referência deixaria o módulo escrevendo num nó órfão
 */
export function criarAncoraDeDocumento(acharPainel, medirFaixa = FAIXA_CHEIA) {
  let medir = medirFaixa;
  let ultimo = { motivo: MOTIVOS.SEM_CORPO, x: null, y: null, px: 0, lado: null };
  let painelAnterior = null;
  /** A última luz ESCRITA no nó, para o limiar de repintura comparar contra ela. */
  let luzEscrita = null;
  let repinturas = 0;

  const soltar = (painel, motivo) => {
    if (painel) {
      painel.removeAttribute('data-ancorado');
      painel.removeAttribute('data-ancora-lado');
      painel.style.removeProperty('--ancora-dx');
      painel.style.removeProperty('--ancora-dy');
      painel.style.removeProperty('--ancora-luz-x');
      painel.style.removeProperty('--ancora-luz-y');
      painel.style.removeProperty('--ancora-luz-raio');
      painel.style.removeProperty('--ancora-luz-forca');
    }
    luzEscrita = null;
    ultimo = { motivo, x: null, y: null, px: 0, lado: null };
  };

  return {
    /**
     * Troca a régua da faixa depois de construído — quem tem o DOM da HUD liga aqui.
     *
     * ⚠️ `null` volta para a janela inteira, e não desliga a âncora: a degradação é perder o recuo
     * dos trilhos, nunca perder o documento.
     */
    medirPor(fn) {
      medir = typeof fn === 'function' ? fn : FAIXA_CHEIA;
    },

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
      const prender = (alvo, extensao, inicio, fim) => {
        const menor = inicio + MARGEM_PX + extensao / 2;
        const maior = Math.max(menor, fim - MARGEM_PX - extensao / 2);
        return Math.max(menor, Math.min(maior, alvo));
      };
      /*
       * ☠️ **A FAIXA é o PALCO, e não a janela — os trilhos são residentes e o leitor os cobria.**
       *
       * Preso à janela inteira, o painel encostava sobre o trilho direito e ficava por cima do
       * CONTEXTO: `.surface` tem `pointer-events: auto` e `z-index: 8`, então ele não só tapava
       * como ROUBAVA o clique dos botões de marca — a queixa foi "impede o uso", que é pior que
       * "atrapalha a leitura".
       *
       * ⚠️ **Os trilhos são MEDIDOS, nunca presumidos:** abaixo de 900 px eles somem por media
       * query, e um recuo cravado comeria palco onde não há trilho nenhum. Sem trilho na tela, a
       * faixa volta a ser a janela por construção.
       */
      const faixa = medir(ctx.larguraPx) || FAIXA_CHEIA(ctx.larguraPx);
      const presoX = prender(alvoX, caixa.width, faixa.inicio, faixa.fim);
      const presoY = prender(cy, caixa.height, 0, ctx.alturaPx);
      const dx = presoX - baseX;
      const dy = presoY - baseY;

      painel.dataset.ancorado = 'sim';
      painel.dataset.ancoraLado = lado > 0 ? 'direita' : 'esquerda';
      painel.style.setProperty('--ancora-dx', `${dx.toFixed(1)}px`);
      painel.style.setProperty('--ancora-dy', `${dy.toFixed(1)}px`);

      /*
       * A LUZ VEM DO CORPO — a mesma lei que os corpos 3D obedecem, aplicada à superfície.
       *
       * O gradiente é centrado no astro em coordenadas da CAIXA, então ele fica preso ao MUNDO
       * enquanto a caixa se move: é daí que sai o paralaxe, sem um segundo mecanismo. Enquanto o
       * painel acompanha o corpo, a luz não anda sobre ele; quando o painel encosta na borda da
       * janela e o corpo continua, ela desliza — que é quando a profundidade tem o que mostrar.
       */
      const luzX = cx - presoX;
      const luzY = cy - presoY;
      const luz = {
        x: luzX,
        y: luzY,
        /* Até o canto mais distante: a queda cobre a superfície inteira em qualquer enquadramento. */
        raio: Math.hypot(Math.abs(luzX) + caixa.width / 2, Math.abs(luzY) + caixa.height / 2),
        forca: Math.min(1, ctx.px / LUZ_PLENA_PX),
      };
      const andou =
        !luzEscrita ||
        Math.abs(luz.x - luzEscrita.x) > PASSO_DA_LUZ ||
        Math.abs(luz.y - luzEscrita.y) > PASSO_DA_LUZ ||
        Math.abs(luz.raio - luzEscrita.raio) > PASSO_DA_LUZ ||
        Math.abs(luz.forca - luzEscrita.forca) > 0.05;
      if (andou) {
        painel.style.setProperty('--ancora-luz-x', `${luz.x.toFixed(0)}px`);
        painel.style.setProperty('--ancora-luz-y', `${luz.y.toFixed(0)}px`);
        painel.style.setProperty('--ancora-luz-raio', `${luz.raio.toFixed(0)}px`);
        painel.style.setProperty('--ancora-luz-forca', luz.forca.toFixed(2));
        luzEscrita = luz;
        repinturas += 1;
      }

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
        /* `repinturas` é o que torna a afirmação «o gradiente não repinta por quadro» checável. */
        luz: { ...luzEscrita, repinturas },
      };
    },

    /** A sonda: onde o documento está, e por quê. */
    estado: () => ({ ...ultimo }),
  };
}

export { MOTIVOS as MOTIVOS_DA_ANCORA, FOLGA_EM_RAIOS, MARGEM_PX, PASSO_DA_LUZ, LUZ_PLENA_PX };
