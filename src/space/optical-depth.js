/**
 * PROFUNDIDADE ÓPTICA — a lei que tira o aspecto CHAPADO de qualquer disco desta cena.
 *
 * ## O defeito que ela conserta, e por que ele aparece em todo disco
 *
 * Um disco desenhado como emissão por pixel é uma FOLHA PINTADA: a cor num ponto só depende de onde
 * o ponto está no disco. Só que a luz que chega ao olho não atravessou "um ponto" — ela atravessou
 * uma COLUNA de matéria, e o comprimento dessa coluna depende do ângulo. É essa diferença que o
 * olho lê como volume, e é a ausência dela que faz o objeto parecer um adesivo.
 *
 * O buraco negro central desta cena não tem esse problema, e não é por talento do shader: é porque
 * lá o raio é INTEGRADO (`blackhole-geodesic.js`), cruza o plano do disco várias vezes e compõe
 * front-to-back — a densidade sai de graça da marcha. Quem não pode marchar (o anel planetário, o
 * disco do quasar, o disco da galáxia — todos billboards) precisa da mesma física em forma fechada.
 *
 * ## A forma fechada, e ela é uma linha
 *
 * Para uma laje fina de espessura `h` e coeficiente de extinção `k`, a profundidade óptica NORMAL
 * (de frente) é `tau0 = k·h`. Vista com a normal a um ângulo `i` da linha de visada, a coluna que a
 * luz atravessa é mais longa por `1/cos(i)`:
 *
 *     tau(i) = tau0 / cos(i)
 *
 * E a fração da luz que sai é Beer–Lambert, `exp(-tau)`. Duas consequências, e as duas são
 * exatamente o que se vê na natureza:
 *
 * 1. **De viés o disco fica MAIS DENSO**, não mais fraco. Um anel de Saturno quase de perfil deixa
 *    de ser translúcido; uma espiral de perfil mostra a faixa escura de poeira no meio. É o mesmo
 *    `1/cos(i)`, e é a razão pela qual esses dois objetos são reconhecíveis DE PERFIL.
 * 2. **A saturação é assintótica.** `1 - exp(-tau)` satura em 1 — a matéria acaba de tapar e para.
 *    Uma multiplicação linear por `1/cos` explodiria no limite, que é o que faz disco de billboard
 *    virar um clarão branco quando a câmera desce ao plano.
 *
 * ⚠️ O PISO em `cos(i)` não é medo de divisão por zero: um disco REAL tem espessura, então a coluna
 * para de crescer quando a linha de visada passa a atravessar a espessura em vez da face. O piso é
 * a razão de aspecto `h/r` da peça — 0,05 para um anel ou um disco de acreção (folhas), ~0,5 para
 * um toro de poeira (parede). Sem ele a lei afirmaria uma folha de espessura zero, que não existe.
 *
 * ## Como usar, e o que NÃO fazer
 *
 * A emissão de um disco (o que ele produz) é atenuada pela própria coluna dele:
 *
 *     brilho = emissao * saidaDaLaje(densidade, cosI, piso)
 *
 * ⚠️ Não multiplique a emissão por `1/cos` direto. A lei aqui é sobre TRANSPORTE — quanto sai do
 * que foi produzido — e ela é limitada por construção. Ganho linear não é.
 */

/** O piso de `cos(i)` de uma FOLHA: anel planetário, disco de acreção, disco de galáxia. */
export const ASPECT_FOLHA = 0.05;
/** O piso de uma PAREDE: o toro de poeira de um núcleo ativo, onde `h/r` é da ordem de 1. */
export const ASPECT_PAREDE = 0.5;

/**
 * O bloco GLSL. Expõe:
 *
 *   `float colunaDaLaje(float densidade, float cosI, float aspecto)` — a profundidade óptica vista
 *     daquele ângulo, já com o piso de espessura aplicado.
 *   `float saidaDaLaje(float densidade, float cosI, float aspecto)` — a fração que ATRAVESSA, em
 *     [0,1), saturando em 1. É esta que multiplica a emissão.
 */
export const GLSL_OPTICAL_DEPTH = /* glsl */ `
  float colunaDaLaje(float densidade, float cosI, float aspecto){
    return densidade / max(abs(cosI), aspecto);
  }
  float saidaDaLaje(float densidade, float cosI, float aspecto){
    return 1.0 - exp(-colunaDaLaje(densidade, cosI, aspecto));
  }
`;
