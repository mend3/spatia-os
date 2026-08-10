/**
 * DITHER DE SAÍDA — o ruído de 1 LSB que quebra a banda do gradiente claro.
 *
 * ## O defeito, e por que ele mora SÓ no claro
 *
 * O usuário relatou *"degraus em faixas largas no gradiente claro"* em volta do buraco negro. Não é
 * o disco nem o integrador: a cadeia inteira roda em `HalfFloatType` (`EffectComposer` sem alvo, r171)
 * e só o último passo — o canvas — tem 8 bits. Um gradiente suave e largo é o pior caso possível
 * para um quantizador.
 *
 * `lensing.js` já soma grão (`uGrain`), e ele funciona: MEDIDO no mesmo quadro, a largura dos platôs
 * de valor 8 bits fica em **1 px de mediana** no médio (90–140) e no escuro (20–60). No claro
 * (200–250) a mediana também é 1, mas o **p90 é 3 px e o máximo 82 px** — as faixas que ele viu.
 *
 * A causa é ONDE o grão entra: em luz LINEAR, antes do ACES. O tone mapping comprime as altas luzes,
 * então ali `d(saída)/d(linear)` é pequeno e a amplitude do grão encolhe abaixo de 1/255 — ela não
 * alcança o quantizador exatamente na faixa em que a banda aparece. Nas médias e baixas ela alcança,
 * e é por isso que só o claro tem degrau.
 *
 * ## ☠️ O que este módulo NÃO conserta, e a medida que refutou a expectativa
 *
 * **Ele está vivo e é do tamanho certo**, e isso é medido com controle positivo: em A/B no mesmo
 * quadro, ganho 1 muda **8,0% dos pontos** da tela com diferença média 0,08 (ou seja, 8% dos pixels
 * estavam exatamente sobre uma fronteira de quantização), e ganho 60 muda 96,5% — sem esse segundo
 * número, "não mudou nada" seria indistinguível de "a injeção não chegou ao shader".
 *
 * **E mesmo assim ele NÃO move a largura dos platôs no claro.** A/B no mesmo quadro, controle
 * fechado (as duas leituras sem dither saem idênticas ao dígito): sem ele a faixa 200–250 dá
 * p90 2 · p99 5 · máx 16; com ele, p90 2 · p99 6 · máx 12. Nulo.
 *
 * A conclusão que sai daí, e ela é o que impede a próxima sessão de repetir a caçada: **os platôs
 * largos do claro não são degraus de quantização — são sinal genuinamente chato**, região saturada,
 * e dither não quebra o que não é gradiente. A banda que o operador relata tem outra causa, ainda
 * NÃO encontrada. Já descartados por medida: o truncamento da geodésica (0,2% dos pontos na pose
 * dele) e a quantização de 8 bits (isto aqui).
 *
 * O que fica valendo é o que foi provado: a correção de quantização existe, é correta e custa ~0.
 * O que não se pode afirmar é que ela conserta o relato.
 *
 * ## ⚠️ Isto NÃO é um segundo dono do grão
 *
 * São duas grandezas com dois propósitos: `uGrain` é **acabamento de câmera**, afinável pelo painel,
 * em luz linear; este é **correção de quantização**, fixo em 1 LSB, em espaço de saída. Amarrar um
 * ao outro faria o operador apagar a correção ao pedir uma imagem mais limpa.
 *
 * ## As duas escolhas, e nenhuma é gosto
 *
 * **TPDF (diferença de dois uniformes) e não um uniforme só.** Dither uniforme de ±½ LSB descorrela
 * o erro mas deixa a variância dele DEPENDER do sinal — o ruído modula com o gradiente e a banda
 * volta como textura. A diferença de dois uniformes dá densidade triangular em ±1 LSB, que é a
 * amplitude mínima com erro de variância constante.
 *
 * **Ruído de gradiente intercalado (Jiménez) e não `sin`-hash.** Ele distribui o valor pela vizinhança
 * de pixel em vez de sortear cada um sozinho, então a mesma amplitude quebra mais banda. Não depende
 * do relógio de propósito: a 1 LSB um padrão fixo é invisível, e um animado acrescenta cintilação
 * numa cena que já tem grão temporal.
 */

/** O marcador que o oráculo procura no shader composto. Apagá-lo REPROVA. */
export const MARCA = 'dither-de-saida';

/**
 * ⚠️ Sem crase aqui dentro — este texto vira template literal do shader de saída ao ser injetado,
 * e a armadilha e o sintoma estao no cabecalho de `lensing.js`.
 */
export const GLSL_DITHER = /* glsl */ `
  // ${MARCA}: 1 LSB de densidade triangular, em espaco de SAIDA.
  float ign1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float ign2 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 23.0, vec2(0.06711056, 0.00583715))));
  gl_FragColor.rgb += (ign1 - ign2) / 255.0;
`;

/**
 * Injeta o dither no fim do `main()` do shader de saída vendorizado.
 *
 * ☠️ **Ela LEVANTA em vez de devolver a fonte intacta.** Injeção que não acha a âncora e segue em
 * silêncio devolve a banda de volta sem nada acusar — o modo de falha mais caro desta base. Um
 * `three` novo que mude o shader tem de parar o boot, não degradar a imagem.
 */
export function comDither(fonte) {
  const fim = fonte.lastIndexOf('}');
  if (fim < 0) {
    throw new Error('dither-de-saida: o shader de saída não tem um `}` final — a âncora sumiu.');
  }
  /*
   * ⚠️ **A POSIÇÃO É A LEI, e não um detalhe de onde é cômodo enfiar.** Antes da conversão de espaço
   * de cor o mesmo 1/255 vale outra coisa: sRGB não é linear, então a amplitude certa no fim da
   * função é errada por um fator que varia com o brilho — e a correção falharia justamente no claro,
   * que é o caso que ela existe para consertar.
   */
  const conversao = fonte.indexOf('sRGBTransferOETF');
  if (conversao < 0 || conversao > fim) {
    throw new Error(
      'dither-de-saida: não achei `sRGBTransferOETF` antes do fim do `main()`. O dither precisa ' +
      'rodar em espaço de SAÍDA, e sem essa garantia a amplitude de 1 LSB deixa de significar 1 LSB.'
    );
  }
  return `${fonte.slice(0, fim)}${GLSL_DITHER}\n}${fonte.slice(fim + 1)}`;
}
