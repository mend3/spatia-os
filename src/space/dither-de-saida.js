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
 * ⭑ **E a fonte não está quantizada antes:** no recorte com os contornos, os 143 códigos do intervalo
 * estão TODOS presentes (zero lacunas) e o passo modal é 1 LSB. Fosse banda vinda de cima, o
 * histograma teria buracos e dither nenhum a consertaria.
 *
 * `lensing.js` já soma grão (`uGrain`) e ele NÃO alcança o claro. A causa é ONDE ele entra: em luz
 * LINEAR, antes do ACES. O tone mapping comprime as altas luzes, então ali `d(saída)/d(linear)` é
 * pequeno e a amplitude do grão encolhe abaixo de 1/255 — ela não chega ao quantizador exatamente
 * na faixa em que a banda aparece. Nas médias e baixas ela chega, e é por isso que só o claro tem
 * degrau. Vale igual para o `scanline`, que é multiplicativo no mesmo lugar (−0,16% medido no
 * claro, contra os −2,5% que ele declara).
 *
 * ## O que ele consegue, medido — e ☠️ a MÉTRICA que quase o condenou
 *
 * A/B no mesmo quadro, controle fechado (as leituras sem dither saem idênticas ao dígito), faixa
 * clara 190–252, **restrita aos gradientes RASOS** (passo local ≤ 2 LSB, que é onde banda mora):
 *
 * | | média | p90 | p99 | máx |
 * |---|---|---|---|---|
 * | sem dither | 2,43 px | 4 | **21** | **160** |
 * | com dither | 2,11 px | 4 | **11** | **42** |
 *
 * **Banda é CAUDA, não centro** — e é por isso que o p90 não se move enquanto p99 e máximo desabam.
 * O controle é a faixa média (1,09 → 1,10 px, inalterada): lá o grão já ditherava e não havia o que
 * ganhar.
 *
 * ☠️ **Uma primeira medida deu NULO e a conclusão errada quase foi escrita como refutação.** Ela
 * varria a faixa 200–250 inteira, sem filtrar por gradiente raso — e ali a maior parte é SATURADA,
 * onde platô largo é sinal chato e não degrau. A cauda que é o defeito ficava diluída em dezenas de
 * milhares de platôs de 1 px. **Métrica que não isola o regime do defeito devolve nulo com controle
 * fechado**, que é a forma mais convincente de estar errado.
 *
 * ⭑ E que ele CHEGA ao quadro é medido à parte, sem depender de A/B: no claro, a correlação entre o
 * resíduo local e o padrão que estas quatro linhas PREVEEM é **0,60**. Ele domina o resíduo.
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
