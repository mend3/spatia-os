/**
 * QUASAR — o núcleo ATIVO de uma galáxia massiva, e é essa a classe que faltava.
 *
 * ## Por que ele não é um pulsar com jato
 *
 * O quasar existia nesta cena só como prosa dentro de `pulsar.js`: o jato de lá foi calibrado
 * olhando referências de quasar, e o usuário apontou o erro com todas as letras — *"o quasar não é
 * um pulsar ampliado"*. Não é mesmo, e a diferença não é de escala:
 *
 * | | pulsar | quasar |
 * |---|---|---|
 * | o que emite | a MAGNETOSFERA de uma estrela de nêutrons | um disco de gás caindo num buraco negro |
 * | o motor | rotação + campo dipolar | ACRECÃO — energia gravitacional virando luz |
 * | o que colima | linhas de campo abertas nos polos | o eixo de spin do buraco negro |
 * | onde ele mora | dentro de uma galáxia, como um corpo | NO CENTRO dela, e é o centro |
 * | o que se vê | dois feixes varrendo, pulso rigoroso | disco, corona, toro, jato, lóbulos |
 *
 * A última linha é a que decide a arquitetura deste arquivo. Um pulsar é um corpo do céu como
 * qualquer outro — vira a pele do astro em foco, uma por cena. **Um quasar é o que uma galáxia
 * TEM**, então ele nasce onde as galáxias nascem: num draw instanciado sobre o campo de hubs.
 *
 * ## Quais galáxias, e a resposta não é "as maiores"
 *
 * O que acende um quasar é o buraco negro central, e a massa dele não sai da massa da galáxia —
 * sai da massa do BOJO. É a relação M–σ / Magorrian, e ela é firme: `M_BH ≈ 0,002 M_bojo`, com
 * dispersão pequena o bastante para ser usada como régua.
 *
 * Essa grandeza JÁ EXISTE em `galaxyParams` e ninguém a tinha usado para nada: `concentration` é a
 * fração da massa dos filhos diretos que está no maior deles — o análogo de bulge-to-total, e o
 * eixo que `galaxy-classes.js` mediu e escolheu para decidir a classe de Hubble. Então
 * `bulgeMass = mass × concentration` não é um número novo; é o produto de dois que a galáxia já
 * calcula.
 *
 * ⚠️ **E ela recusa exatamente o que deve recusar.** Um diretório grande com a massa espalhada
 * igualmente entre muitos arquivos tem `concentration` baixa: massa alta, bojo pequeno, nenhum
 * buraco negro para acender. `repo:devshell-one` é o caso vivo — 408 de massa, a MAIOR do corpus,
 * e concentração 0,223: ele NÃO qualifica, e está certo que não. Um limiar em massa pura o poria
 * em primeiro lugar.
 *
 * ## Uma orientação, e ela explica cinco coisas de uma vez
 *
 * `cosView` é o cosseno do ângulo entre o eixo de spin e a linha de visada. É hasheado por objeto,
 * não derivado da câmera — o mesmo idioma que `galaxy-classes.js` declara para a inclinação
 * (*"inclination is a class cue here, not physics"*), e pela mesma razão: em espaço de tela um
 * disco orientado no MUNDO fica de perfil em metade da órbita da câmera e some justamente quando
 * o operador gira a cena.
 *
 * Desse único número saem:
 *
 * 1. **o achatamento do disco de acreção** — o disco é perpendicular ao eixo, então ele projeta
 *    numa elipse comprimida por `cosView` na direção do eixo;
 * 2. **o encurtamento do jato** — jato apontando para você é CURTO na tela (`sin`), não longo;
 * 3. **o beaming Doppler** — o jato que se aproxima estoura e o que se afasta quase some, e é por
 *    isso que M87 mostra um jato só;
 * 4. **o toro esconder ou não o núcleo** — o modelo de unificação inteiro é isto: mesma máquina,
 *    dois nomes conforme a linha de visada cruze ou não o toro de poeira;
 * 5. **os lóbulos NÃO seguirem o jato na assimetria** — eles não são relativísticos, então os dois
 *    aparecem com brilho parecido mesmo quando um jato só é visível. Essa discordância entre jato
 *    (um lado) e lóbulo (dois lados) é a figura clássica de radiogaláxia.
 *
 * Nada disso é ajuste independente: mexer em `cosView` move os cinco juntos, que é o que significa
 * ter uma causa em vez de cinco constantes.
 *
 * ## O que este módulo NÃO desenha, e os motivos são de princípio
 *
 * **A região de linhas largas (BLR).** Ela é REAL e é nomeada no pedido, mas ninguém nunca a viu:
 * a BLR é sub-parsec e só se conhece por ESPECTRO — o alargamento das linhas de emissão. Desenhá-la
 * seria desenhar um diagrama, que é o erro que matou a gaiola de campo do pulsar: *referência não é
 * o mesmo que fenômeno*, e ilustração pedagógica costuma mostrar o que NÃO se vê. O que a BLR
 * produz na imagem é o brilho do contínuo do núcleo, e isso a corona já entrega.
 *
 * **Lente gravitacional por quasar.** `lensing.js` é um passe de TELA, um por quadro, ancorado no
 * buraco negro central da cena. Sete lentes seriam sete reamostragens de tela cheia — e o núcleo de
 * um quasar aqui tem poucos pixels de raio, onde a deflexão seria sub-pixel. O efeito custaria o
 * orçamento inteiro para não aparecer.
 *
 * ## Orçamento de fragmento, CONTADO antes de rodar
 *
 * O disco do buraco negro central já matou a aba uma vez por empilhar amostras de ruído num anel
 * que enche a tela, e a regra que saiu daquilo é contar antes. Aqui:
 *
 * - **7 instâncias** neste corpus (medido), não 71 — só as que qualificam entram no draw.
 * - O quad tem meia-extensão `JET_REACH + LOBE_REACH·1,6 ≈ 6,3` raios de disco, contra os 1,35 do
 *   quad da galáxia: ~21× a área POR INSTÂNCIA, mas em 1/10 das instâncias.
 * - A figura desenhada (agulha + dois lóbulos + núcleo) ocupa ~3% desse quad. Os outros 97% saem
 *   num `discard` de teste 2D, ANTES de qualquer amostra de ruído.
 * - Teto de ruído: **2 amostras de `simplex3` por fragmento aceso**. Jato e lóbulo são regiões
 *   disjuntas, então uma delas paga 1; o NÚCLEO paga mais 1 (as bandas cisalhadas do disco), e o
 *   núcleo se sobrepõe ao jato na base dele. O pior caso são 2, num punhado de fragmentos onde a
 *   agulha nasce; o caso comum continua 1.
 */
import * as THREE from 'three';
import { hash01 } from './graph.js';
import { GLSL_SIMPLEX3 } from './planet-noise.js';
import { GLSL_OPTICAL_DEPTH, ASPECT_FOLHA, ASPECT_PAREDE } from './optical-depth.js';
import { glslFloat } from './glsl.js';

/**
 * Massa de BOJO (`chunks × concentração`) a partir da qual o núcleo acende.
 *
 * ⚠️ MEDIDO no corpus, não escolhido: o limiar em 50 deixa **7 de 72 hubs** ativos, 9,7%. A âncora
 * é a fração observada de galáxias massivas com núcleo ativo — da ordem de 10% em levantamentos de
 * Seyfert, contra ~1% para quasares luminosos. Com 1% este corpus teria 0,7 quasares, o que não é
 * uma imagem; 10% é a ponta defensável da faixa e é a que cabe.
 *
 * E o número está num PLATÔ: 50, 60 e 70 dão os mesmos 7 hubs. O limiar não está pousado num
 * penhasco, então uma mudança pequena do corpus não liga nem desliga um quasar de surpresa.
 */
export const QUASAR_BULGE_FLOOR = 50;

/** Massa de bojo de um hub — a grandeza que decide, e ela sai de dois números que já existem. */
export const bulgeMassOf = (params) =>
  (Number.isFinite(params?.mass) ? params.mass : 0) *
  (Number.isFinite(params?.concentration) ? params.concentration : 0);

/** Este hub acende? */
export const isActive = (params) => bulgeMassOf(params) >= QUASAR_BULGE_FLOOR;

/**
 * Alcance do jato, em raios do disco da galáxia.
 *
 * Âncora real: em Cygnus A os lóbulos de rádio se estendem por ~500 mil anos-luz enquanto a
 * galáxia hospedeira tem ~100 mil — os jatos saem MUITO da galáxia, e é isso que os torna
 * inconfundíveis. 5 raios preserva a razão e é o motivo de este módulo precisar de um draw
 * próprio: dentro do quad da galáxia (1,35 raios) o jato seria cortado numa reta.
 */
const JET_REACH = 5.0;
/** Raio do lóbulo, em raios do disco. Ele é o balão inflado onde o jato freia contra o meio. */
const LOBE_REACH = 0.8;
/**
 * Meia-extensão do quad, em raios do disco. Igual em toda direção porque o eixo do jato é uma
 * direção de TELA hasheada — o quad tem de conter a agulha em qualquer ângulo que ela caia.
 *
 * A folga de 1,6 sobre o lóbulo é a cauda da gaussiana dele; cortar em 1,0 deixaria a borda do
 * lóbulo terminando numa reta, que é o defeito que `galaxy.js:180-186` já pagou uma vez.
 */
const QUAD_SPAN = JET_REACH + LOBE_REACH * 1.6;

/**
 * Meia-abertura do cone do toro de poeira, em cosseno.
 *
 * Os modelos de unificação põem a abertura entre 45° e 60°: olhando por DENTRO do cone vê-se o
 * núcleo (tipo 1, linhas largas); olhando por FORA a poeira o esconde (tipo 2, só o jato e os
 * lóbulos sobram). `cos 55° = 0,574` fica no meio da faixa e, com `cosView` uniforme em [0,1],
 * deixa ~57% dos quasares com o núcleo à mostra — o que é o certo por construção, já que a fração
 * obscurecida observada fica perto da metade.
 */
const TORUS_COS = 0.574;

/**
 * Velocidade do jato, em frações de c, e o EXPOENTE DE EXIBIÇÃO que vem com ela.
 *
 * β = 0,9 é Γ ≈ 2,3, a ponta modesta dos jatos de núcleo ativo (VLBI mede Γ de 2 a 20). O fator
 * Doppler é `δ = √(1−β²)/(1 − β·cosθ)` e a intensidade de um jato contínuo vai com `δ^(2+α)`,
 * α ≈ 0,7 para síncrotron — ou seja expoente ~2,7, que aqui é 3, o mesmo que `blackhole.js` e
 * `pulsar.js` já usam. Duplicar o expoente com outro valor faria três módulos discordarem sobre a
 * mesma física.
 *
 * ⚠️ `DISPLAY_GAMMA` NÃO é física, é tela — a mesma nota que `blackhole.js` escreve sobre o
 * `pow(flux, 0.4)` dele. Cru, o contraste jato/contrajato passa de 1000:1 e a tela tem uns dois
 * stops úteis antes do ACES saturar: o jato próximo estoura num borrão branco e o distante some,
 * então não se lê ASSIMETRIA, lê-se um jato só e nenhuma informação sobre o outro. Comprimido, a
 * ordem é preservada — o lado que se aproxima é SEMPRE o mais claro — e a razão cai para a faixa
 * de 5 a 10:1 que se mede em radiogaláxias.
 */
const JET_BETA = 0.9;
const DISPLAY_GAMMA = 0.45;

/** Fator Doppler relativístico, normalizado pelo caso transversal (cosθ = 0 vale 1). */
function dopplerGain(cosTheta) {
  const transversal = Math.sqrt(1 - JET_BETA * JET_BETA);
  const delta = transversal / (1 - JET_BETA * cosTheta);
  // O expoente efetivo é 3 · DISPLAY_GAMMA = 1,35. `delta / transversal` põe o caso de perfil em 1,
  // então o beaming REDISTRIBUI brilho entre os dois lados em vez de multiplicar a cena inteira
  // para cima — a correção que `blackhole.js` teve de fazer depois de ver um lado estourado.
  return (delta / transversal) ** (3 * DISPLAY_GAMMA);
}

/*
 * Salts. Conferidos contra os que já circulam em `src/space/`: 2/3/4/7 (`graph.js`), 11/23/41
 * (`planet.js`), 17 (`photosphere.js`), 43/47 (`pulsar.js`), 53/59/67/71/83 (`galaxy.js`). Reusar
 * um daria a este objeto duas feições derivadas do mesmo número, que é o defeito que `graph.js`
 * descreve: as duas parecem certas isoladas.
 */
const SALT_AXIS = 89;
const SALT_VIEW = 97;
const SALT_KNOT = 101;

/**
 * Os parâmetros do quasar de um hub. Puro e congelado, como `galaxyParams`.
 *
 * Toda a física estática mora AQUI e não no shader, e isso não é estilo: `cosView` é constante por
 * objeto, então o beaming, o achatamento e a obscuração são constantes por objeto. Calculá-los por
 * fragmento seria pagar 7 × (área do quad) vezes por quadro uma conta que muda uma vez na vida.
 *
 * @param {object} galaxy  o retorno de `galaxyParams` do mesmo hub
 * @returns {Readonly<object>|null} `null` se o hub não qualifica
 */
/**
 * As feições que saem de `cosView`, numa função só.
 *
 * Elas moram aqui, e não soltas dentro de `quasarParams`, porque desde que o eixo virou de MUNDO o
 * `cosView` muda a cada quadro com a câmera — então quem as calcula é o laço de desenho, não a
 * montagem do objeto. Uma função só: com uma cópia na montagem e outra no laço, a primeira
 * divergência apareceria justamente quando a revisão fosse útil.
 *
 * @param {number} cosView cosseno do ângulo entre o eixo de spin e a linha de visada, em [0,1]
 */
export function viewFeatures(cosView) {
  const cos = Math.min(Math.max(cosView, 0), 1);
  const sinView = Math.sqrt(Math.max(0, 1 - cos * cos));
  return {
    cosView: cos,
    /*
     * O JATO ENCURTA quando aponta para você — e este é o par que engana: o lado que estoura de
     * brilho é o MESMO que fica curto na tela. Um blazar é um ponto brilhantíssimo com um toco de
     * jato, não um risco enorme. Piso de 0,22 para o toco não sumir de vez.
     */
    jet: JET_REACH * Math.max(0.22, sinView),
    /* O jato próximo e o distante saem do MESMO `cosView` com sinal trocado — é a definição. */
    gainNear: dopplerGain(cos),
    gainFar: dopplerGain(-cos),
    /* O toro esconde o núcleo MULTIPLICANDO; aditivo não sabe tapar. Ver a nota em `quasarParams`. */
    nucleus: THREE.MathUtils.smoothstep(cos, TORUS_COS - 0.16, TORUS_COS + 0.16),
    /** Achatamento do disco de acreção na tela: ele é perpendicular ao eixo. */
    squash: Math.max(0.07, cos),
  };
}

export function quasarParams(galaxy, viewOverride = null) {
  if (!galaxy || !isActive(galaxy)) return null;
  const path = galaxy.path ?? 'no-path';

  /*
   * O EIXO DO JATO NÃO SEGUE O DISCO DA GALÁXIA, e isso é medido, não licença artística.
   *
   * A direção do jato é o eixo de spin do buraco negro, e levantamentos de Seyfert (Kinney et al.
   * 2000; Schmitt et al. 2003) acham a orientação dele essencialmente NÃO correlacionada com o
   * plano do disco hospedeiro. O buraco negro é 10⁻³ da massa do bojo e não tem por que lembrar
   * de onde o gás veio.
   *
   * É também o que faz o quasar ler como objeto separado: um jato cruzando a galáxia em ângulo é
   * outra coisa acontecendo ali dentro; um jato perpendicular ao disco leria como decoração dele.
   */
  const axis = hash01(path, SALT_AXIS) * Math.PI * 2;
  /*
   * `cosView` uniforme em [0,1] e não em ângulo.
   *
   * Orientações isotrópicas distribuem o COSSENO uniformemente, não o ângulo — sortear o ângulo
   * uniforme concentraria os objetos perto do plano do céu e quase nenhum apontaria para a câmera,
   * apagando os blazares, que são o extremo mais reconhecível da família.
   */
  /*
   * `viewOverride` existe para a BANCADA, e só para ela.
   *
   * `cosView` explica cinco coisas de uma vez (achatamento, encurtamento do jato, beaming, o toro
   * esconder ou não o núcleo, e a espessura do toro), e por isso ele é o único número que uma
   * revisão precisa VARRER. Na cena ele é hasheado por caminho, de propósito — mas sem uma porta,
   * a bancada teria de recalcular as cinco por conta própria, e aí ela mentiria na primeira
   * divergência. Uma fórmula só, com uma entrada a mais.
   */
  const cosView = viewOverride === null ? hash01(path, SALT_VIEW) : Math.min(Math.max(viewOverride, 0), 1);
  const sinView = Math.sqrt(Math.max(0, 1 - cosView * cosView));

  const bulge = bulgeMassOf(galaxy);
  /*
   * Quanto o núcleo brilha acima do piso, comprimido em log. A luminosidade de um quasar cresce
   * com a taxa de acreção e não com a massa, mas a massa é o TETO (limite de Eddington), e é ela
   * que temos. Log porque a faixa do corpus vai de 50 a 226 e o olho não separa 4,5× linear.
   */
  const power = Math.min(1, Math.log2(bulge / QUASAR_BULGE_FLOOR + 1) / 2.4);

  /*
   * ⚠️ O EIXO DE MUNDO — decisão do usuário, e ele troca o que este objeto é.
   *
   * `axis` (acima) é uma direção de TELA, e com ela o quasar tinha sempre a mesma pose: girar a
   * câmera não mudava nada, os dois jatos eram um par esquerda/direita fixo, e a queixa foi
   * literal — *"é impossível inspecionar girando a câmera"*. Um eixo de tela não tem o que revelar.
   *
   * Com um eixo de MUNDO, `cosView` deixa de ser hash e passa a sair da câmera, a cada quadro. E
   * como ele explica cinco feições de uma vez, as cinco passam a responder à órbita juntas: o disco
   * achata, o jato encurta, o beaming troca de lado, o toro cobre ou descobre o núcleo, e a
   * espessura do toro aparece. O preço foi aceito com o olho aberto: em parte da órbita o disco
   * fica de perfil e quase some — que é o que um disco de verdade faz.
   *
   * A direção é sorteada na ESFERA, não no círculo: `z` uniforme em [-1,1] mais azimute uniforme é
   * a única combinação isotrópica. Sortear dois ângulos empilharia objetos nos polos, que é o mesmo
   * erro que `cosView` uniforme evita do outro lado.
   */
  /*
   * `viewOverride` deixou de significar "cosView" e passou a significar a INCLINAÇÃO DO EIXO.
   *
   * Faz sentido só depois da troca: com eixo de mundo, `cosView` é o ângulo entre o eixo e a
   * câmera, então ele não é mais um parâmetro do objeto — é uma relação. O que a bancada pode
   * escolher é para onde o eixo APONTA, e é isso que este número faz agora. Deixá-lo como
   * "cosView" seria um controle que mente: mexe e o objeto não obedece, porque quem manda passou
   * a ser a órbita.
   */
  const zAxis = viewOverride === null ? hash01(path, SALT_AXIS) * 2 - 1 : viewOverride * 2 - 1;
  const azimuteEixo = hash01(path, SALT_AXIS + 17) * Math.PI * 2;
  const raioEixo = Math.sqrt(Math.max(0, 1 - zAxis * zAxis));

  return Object.freeze({
    path,
    bulge,
    axis,
    axisWorld: new THREE.Vector3(
      raioEixo * Math.cos(azimuteEixo),
      raioEixo * Math.sin(azimuteEixo),
      zAxis
    ),
    cosView,
    /*
     * O JATO ENCURTA quando aponta para você — e este é o par que engana: o lado que estoura de
     * brilho é o MESMO que fica curto na tela. Um blazar é um ponto brilhantíssimo com um toco de
     * jato, não um risco enorme. Piso de 0,22 para o toco não sumir de vez e a figura continuar
     * dizendo que há um jato ali.
     */
    jet: JET_REACH * Math.max(0.22, sinView),
    lobe: LOBE_REACH,
    /*
     * O jato próximo e o distante, já com o Doppler resolvido. Os dois saem do MESMO `cosView`
     * com sinal trocado, que é a definição de aproximando-se e afastando-se.
     */
    gainNear: dopplerGain(cosView),
    gainFar: dopplerGain(-cosView),
    /*
     * O TORO ESCONDE O NÚCLEO, e aqui ele "esconde" multiplicando — não ocluindo.
     *
     * Tudo nesta pele é aditivo (é emissão), e aditivo não sabe tapar. A obscuração honesta é a
     * que o desenho pode afirmar: o núcleo entra com peso `nucleus`, e o que sobra na imagem
     * obscurecida é o próprio toro, que continua lá e continua morno — poeira reprocessa o que
     * absorve e reemite no infravermelho. Um quasar tipo 2 não é um quasar apagado; é um quasar
     * com um anel de poeira no lugar do núcleo.
     */
    nucleus: THREE.MathUtils.smoothstep(cosView, TORUS_COS - 0.16, TORUS_COS + 0.16),
    /** Achatamento do disco de acreção na tela: ele é perpendicular ao eixo. */
    squash: Math.max(0.07, cosView),
    power,
    knot: hash01(path, SALT_KNOT) * 40,
    /*
     * A COR DO HUB viaja junto, e não é decoração: `galaxy.js` prova que a cor integrada do disco
     * tem de bater com `KIND_COLORS[kind]` exatamente, porque uma pasta que muda de identidade
     * conforme a câmera chega perto seria pior que o ponto cinza que ela substituiu. O quasar mora
     * dentro dessa galáxia; largar a cor faria o centro dela deixar de dizer de que pasta é.
     */
    tone: galaxy.base,
  });
}

/*
 * O layout de instância. `aCenter`/`aView` por quadro; o resto é estático e só sobe quando muda,
 * a mesma disciplina de `galaxy.js` (o `put`/`dirty`).
 *
 *   aCenter vec3  por quadro  centro do hub, em unidades de MUNDO
 *   aView   vec4  por quadro  raio do disco (mundo), px do disco, detalhe 0…1, sobra
 *   aAxis   vec3  estático    direção do eixo de spin em TELA (unitária) + achatamento do disco
 *   aReach  vec3  estático    alcance do jato, raio do lóbulo, semente dos nós
 *   aGlow   vec4  estático    ganho do jato próximo, do distante, visibilidade do núcleo, potência
 *   aTone   vec3  estático    a cor do `kind`, para o quasar não largar a identidade do hub
 *
 * ⚠️ A largura do jato e o raio do núcleo NÃO estão aqui, e a primeira versão os pôs. São
 * constantes — o mesmo valor em toda instância — e um atributo por instância para um número igual
 * em todas é um buffer inteiro carregando uma cópia da mesma coisa. Eles entram como literal no
 * GLSL por `glslFloat`, que é o idioma que este projeto já usa para dar UMA casa a uma constante.
 */
const STATIC_LAYOUT = Object.freeze([
  ['aAxis', 3],
  ['aReach', 3],
  ['aGlow', 4],
  ['aTone', 3],
]);

/** Largura do jato e raio do núcleo, em raios do disco. Ver o cálculo da espinha no FRAGMENT. */
const JET_WIDTH = 0.085;
const CORE_RADIUS = 0.16;

const VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec4 aView;
  attribute vec3 aAxis;
  attribute vec3 aReach;
  attribute vec4 aGlow;
  attribute vec3 aTone;

  varying vec2 vP;
  varying vec3 vAxis;
  varying vec3 vReach;
  varying vec4 vGlow;
  varying vec3 vTone;
  varying vec3 vLod;

  void main(){
    vAxis = aAxis;
    vReach = aReach;
    vGlow = aGlow;
    vTone = aTone;
    vP = position.xy * ${glslFloat(QUAD_SPAN)};

    /*
     * PISO DE PIXEL NO NÚCLEO, exatamente como o bojo da galáxia (galaxy.js:reEff). O núcleo tem
     * 0,16 raio de disco; num disco de 26 px isso é 4 px, e num de 6 px é menos de 1 — abaixo de um
     * pixel a cúspide serrilha e o objeto CINTILA quadro a quadro. O piso mexe só no TAMANHO; o
     * brilho é conservado dividindo pela área efetiva, senão um quasar distante ficaria mais
     * brilhante conforme o núcleo se espalha.
     */
    float coreEff = max(${glslFloat(CORE_RADIUS)}, 1.2 / max(aView.y, 1.0));
    vLod = vec3(aView.z, (${glslFloat(CORE_RADIUS * CORE_RADIUS)}) / (coreEff * coreEff), coreEff);

    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    // Hub ATRÁS da câmera projeta com w <= 0 e esfrega o quad pela tela inteira. Três instruções
    // para empurrar o vértice para fora do volume de clipe — o mesmo guard de galaxy.js, e aqui
    // ele importa mais, porque este quad é 4,6x maior de lado.
    if (mv.z > -0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    // Deslocar DEPOIS do modelViewMatrix é o que faz disto um billboard sem quaternion por objeto
    // — impossível num draw instanciado. O preço é que aView.x tem de ser um comprimento de
    // MUNDO já, e é: o grupo mora na raiz da cena, alimentado pelo planetAnchor.
    mv.xy += position.xy * aView.x * ${glslFloat(QUAD_SPAN)};
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uGain;
  uniform float uFlow;

  varying vec2 vP;
  varying vec3 vAxis;
  varying vec3 vReach;
  varying vec4 vGlow;
  varying vec3 vTone;
  varying vec3 vLod;

  ${GLSL_SIMPLEX3}
  ${GLSL_OPTICAL_DEPTH}

  /*
   * A RAMPA DE TEMPERATURA do disco, e ela é a assinatura de cor do objeto.
   *
   * Disco de acrecao e opticamente espesso e cada anel radia como corpo negro na temperatura
   * local, com T proporcional a r^(-3/4) (Shakura-Sunyaev). A borda interna passa de 10^5 K e sai
   * no ultravioleta — na imagem, branco-azulado; indo para fora ela cai por branco, dourado,
   * laranja e vermelho escuro. E por isso que o continuo de um quasar e famosamente AZUL, e e por
   * isso que uma rampa de luminancia sobre uma cor so nao serve: o que muda com o raio e o MATIZ.
   */
  vec3 termico(float t){
    vec3 c = mix(vec3(0.30, 0.05, 0.02), vec3(0.95, 0.40, 0.10), smoothstep(0.0, 0.35, t));
    c = mix(c, vec3(1.0, 0.82, 0.52), smoothstep(0.3, 0.66, t));
    c = mix(c, vec3(0.86, 0.93, 1.0), smoothstep(0.62, 1.0, t));
    return c;
  }

  void main(){
    vec2 p = vP;
    // O referencial do OBJETO: ao longo do eixo de spin e atravessado a ele.
    vec2 eixo = vAxis.xy;
    float aoLongo = dot(p, eixo);
    float atraves = dot(p, vec2(-eixo.y, eixo.x));
    float raio = length(p);

    float jato = vReach.x;
    float lobo = vReach.y;
    float semente = vReach.z;
    const float largura = ${glslFloat(JET_WIDTH)};
    // O raio do núcleo já vem com o piso de pixel aplicado no vértice.
    float nucleo = vLod.z;

    /*
     * ⚠️ O TESTE DE CAIXA VEM PRIMEIRO, e ele e a razao de este modulo caber no orcamento.
     *
     * O quad tem ~6,3 raios de meia-extensao e a figura desenhada (agulha + dois lobos + nucleo)
     * ocupa ~3% dele. Sem este corte, 97% dos fragmentos pagariam a rampa de cor e ate duas
     * amostras de simplex3 para somar zero. Com ele, saem em ~8 instrucoes.
     *
     * As folgas (3,5 larguras, 1,8 lobos, 7 nucleos) sao as caudas das gaussianas correspondentes:
     * cortar na largura nominal terminaria cada peca numa reta.
     *
     * ⚠️ E UMA CAIXA POR PECA, nao uma caixa para todas — a primeira versao tinha uma so, com a
     * folga do JATO, e desenhava o LOBO dentro dela. O lobo e uma bolha de raio lobo, ordens de
     * grandeza mais larga que largura: a caixa estreita passava pelo meio dele e o cortava numa
     * RETA. O usuario fotografou o resultado — *"uma faixa quadrada evidenciando a superficie
     * flat"* — e a leitura era exata: o que aparecia era a borda da regiao de teste, nao uma feicao.
     *
     * A regra que sai daqui: **cada corte tem de usar a cauda da PROPRIA gaussiana que ele corta.**
     * Uma caixa comum e sempre a mais estreita das duas, e a mais estreita e sempre quem aparece.
     */
    float dLongo = abs(aoLongo);
    float dAtraves = abs(atraves);
    // O jato: agulha fina, cortada na cauda da largura DELE.
    bool naAgulha = dAtraves < largura * 3.5 && dLongo < jato * 1.06;
    // Os lobos: dois discos de raio lobo, centrados nas pontas. Corte RADIAL, porque a feicao e
    // redonda — uma caixa alinhada aos eixos deixaria canto visivel em vez de reta.
    bool noLobo = length(vec2(dLongo - jato, atraves)) < lobo * 1.8;
    /*
     * ⚠️ 10 nucleos, e nao 7 — a folga tem de ser a do TORO, que e a peca mais externa daqui.
     *
     * A 7 o corte caia em toroR = 1,24, onde a gaussiana do toro ainda vale
     * exp(-((0,24)/0,42)^2) = 0,72 — 72% do pico, num circulo. Era a borda que o usuario viu
     * "evidenciando que e flat". Mesma regra do lobo: **o corte usa a cauda da propria gaussiana**,
     * E 13,5 e nao 10 porque o toro CRESCEU (pico de 1,35 para 1,8 spans, ver abaixo): a cauda
     * dele agora morre em toroR = 1,79, que e span 3,21, que e raio 13,5 nucleos. A caixa acompanha
     * a feicao — parada em 10, a borda voltava, so que num raio diferente.
     */
    bool noNucleo = raio < nucleo * 13.5;
    if (!naAgulha && !noLobo && !noNucleo) discard;

    vec3 cor = vec3(0.0);
    float luz = 0.0;

    if (noNucleo) {
      /*
       * O DISCO DE ACRECAO, achatado por cosView na direcao do eixo.
       *
       * O disco e perpendicular ao eixo de spin, entao na tela ele projeta numa elipse cujo eixo
       * MENOR e a direcao do eixo — dividir a coordenada ao longo por squash desfaz a projecao e
       * devolve um circulo em que a conta radial vale.
       */
      float squash = max(vAxis.z, 0.07);
      float rd = length(vec2(atraves, aoLongo / squash));
      float span = rd / max(nucleo * 4.2, 1e-4);

      /*
       * A SOMBRA DO HORIZONTE, com rampa LONGA de proposito.
       *
       * cf0d264 mediu isto no buraco negro central: a borda de tesoura fazia o objeto ler como
       * bola preta, e a rampa curta era a causa. Buraco negro nao tem superficie — o que se ve e a
       * sombra, e a fronteira dela e o lugar mais dificil de localizar da imagem.
       */
      float sombra = smoothstep(0.16, 0.52, span);

      /*
       * Brilho de superficie de Shakura-Sunyaev, fluxo proporcional a r^(-3), com a MESMA curva de
       * exibicao que blackhole.js usa e pelo mesmo motivo: o fluxo cru varre tres ordens de
       * grandeza entre as bordas e o ACES satura em dois stops. pow(., 0.4) preserva a ordem e
       * comprime a faixa. E mapeamento de tela, nao constante do modelo.
       */
      float fluxo = pow(max(span, 0.22), -3.0);
      float disco = sombra * pow(fluxo, 0.4) * (1.0 - smoothstep(0.55, 1.0, span));

      /*
       * ⚠️ AS BANDAS CISALHADAS — e é ELA que separa "disco" de "degradê radial pintado".
       *
       * O usuário: *"os discos dos quasares não estão realistas"*. O que faltava não era cor nem
       * brilho: era ESTRUTURA. Um disco liso e axissimétrico não tem como parecer matéria em
       * órbita, porque matéria em órbita CISALHA — a borda interna dá muitas voltas enquanto a
       * externa dá uma, e o padrão que sai disso é a assinatura visual de todo disco de acreção.
       *
       * LIDO NA FONTE (opensrc, black-hole-shader de Bruneton, BSD-3): o DefaultDiscColor
       * dele não desenha gradiente nenhum — compõe a densidade a partir de N faixas de partículas
       * em órbita, cada uma com raio interno, externo, fase e dtheta_dphi, que é a taxa de
       * cisalhamento. A estrutura EMERGE da soma. Aqui não cabe a soma de N faixas (é um billboard
       * de um quad, não um raymarch), mas cabe a causa dela: uma amostra de ruído cuja fase gira
       * com a LEI DE KEPLER, omega ∝ r^(-3/2).
       *
       * ⚠️ A amostra é tirada num CÍRCULO (cos/sen da fase), não no ângulo cru. atan salta de
       * +π para −π e o ruído saltaria junto: uma costura radial fixa na tela, que é o mesmo tipo de
       * defeito que este arquivo já pagou duas vezes em borda de região.
       */
      float fase = atan(aoLongo / squash, atraves);
      float kepler = pow(max(span, 0.18), -1.5);
      float giro = fase + uTime * uFlow * 0.55 * kepler;
      float bandas = simplex3(vec3(cos(giro) * 1.7, sin(giro) * 1.7, span * 5.2 + semente));
      // 0,45 de profundidade: fundo visível o bastante para ler como fluxo, raso o bastante para
      // não quebrar a queda monótona do brilho com o raio, que é a física de Shakura-Sunyaev.
      disco *= 0.62 + 0.45 * (bandas * 0.5 + 0.5);

      /*
       * ⚠️ O BEAMING DO DISCO — o lado que se aproxima estoura, o outro apaga.
       *
       * Um disco inclinado NUNCA aparece simétrico: o gás orbita a fração relevante de c, então a
       * metade que vem na nossa direção é amplificada e a que se afasta some. Nas quatro
       * referências que o usuário mandou isso está em todas, e o jato deste mesmo arquivo já fazia
       * — o disco não fazia, e era a maior discordância entre as duas metades do objeto.
       *
       * A GEOMETRIA: na elipse projetada, o eixo MAIOR (atraves) é onde a velocidade tangencial
       * aponta para a linha de visada — Doppler máximo. No eixo MENOR ela é transversal, e o efeito
       * é zero. Por isso o fator é a componente atraves/rd, escalada por sen(i), e a inclinação
       * já existe: squash É o cosseno dela.
       *
       * A potência 3 não é escolha: é I ∝ delta³ para uma fonte contínua, a MESMA que
       * blackhole.js aplica no disco central (pow(clamp(delta,...), 3.0)). Duas leis iguais em
       * dois arquivos seriam duplicata; uma lei igual aplicada duas vezes é a lei.
       */
      float senI = sqrt(max(1.0 - squash * squash, 0.0));
      // v/c orbital cai com 1/sqrt(r). 0,42 na borda interna é o regime de disco de quasar, onde o
      // gás na ISCO passa de 0,3 c — abaixo disso a assimetria não se lê.
      float beta = 0.42 / sqrt(max(span, 0.16));
      float mu = atraves / max(rd, 1e-4);
      float delta = 1.0 / max(1.0 - beta * senI * mu, 0.08);
      /*
       * ⚠️ TETO EM 3, e nao 7. O 7 saturava o nucleo inteiro em branco.
       *
       * A potencia 3 e a lei certa, mas o disco ja entra com pow(fluxo, 0.4) chegando a ~6 na
       * borda interna: multiplicar por mais 7 estourava a exposicao e a estrutura das bandas
       * desaparecia num blob. O usuario olhou e disse que o objeto estava "sem o nucleo" — e
       * estava: o nucleo existia e ninguem via, porque tudo em volta tambem era branco.
       * O teto e de EXIBICAO, como o pow(., 0.4) ao lado, e fica declarado como tal.
       */
      float beaming = clamp(pow(delta, 3.0), 0.06, 3.0);
      disco *= beaming;

      /*
       * A COLUNA, e e ela que tira o aspecto de adesivo (ver optical-depth.js).
       *
       * O que chega ao olho nao atravessou um PONTO do disco, atravessou uma COLUNA — e a coluna
       * cresce com 1/cos(i). De vies o disco fica mais denso, satura, e para de ser translucido;
       * de frente ele e o mais fino que pode ser. O buraco negro central ganha isso de graca
       * porque la o raio e integrado e cruza o plano; aqui, que e billboard, entra em forma
       * fechada. Densidade 0,9 e opticamente fina de frente (sai 59%) e opaca de perfil.
       */
      disco *= saidaDaLaje(0.9, squash, ${glslFloat(ASPECT_FOLHA)});

      /*
       * A CORONA e compacta, quente e ISOTROPICA — ela nao achata com o disco.
       *
       * Ela e o plasma a 10^9 K logo acima do disco interno, e e ela que produz o raio X duro. Na
       * imagem entra como um caroco branco-azulado no centro que NAO segue a elipse: e essa
       * discordancia de forma entre corona redonda e disco achatado que diz que sao duas coisas.
       */
      float corona = exp(-pow(raio / (nucleo * 0.9), 2.0));

      /*
       * O TORO DE POEIRA. Ele mora no PLANO do disco e e gordo — a razao altura/raio de um toro
       * obscurecedor e da ordem de 1, contra 0,05 de um disco fino, e e essa espessura que faz
       * dele uma parede em vez de uma folha.
       *
       * Ele nasce FORA do disco (comeca onde a poeira sobrevive, no raio de sublimacao) e e frio:
       * entra em vermelho-alaranjado, nunca em branco.
       */
      /*
       * ⚠️ O TORO NAO ACHATA COMO O DISCO, e e SO isso que o faz ler como rosca gorda.
       *
       * Um disco de acrecao e uma FOLHA: h/r ~ 0,05, e visto de perfil ele some numa linha. Um toro
       * obscurecedor e uma PAREDE: h/r da ordem de 1 nos modelos de unificacao, e visto de perfil
       * ele continua uma faixa grossa — e a espessura dele que esconde o nucleo, que e a razao de o
       * toro existir no modelo. Achatar os dois pelo mesmo squash afirmava duas folhas.
       *
       * O piso em 0,5 e essa razao de aspecto: por mais de perfil que a orientacao caia, o toro nao
       * fica mais fino que meio raio. Uma linha, e e ela que separa "elipse" de "volume".
       */
      float squashToro = max(squash, 0.5);
      float spanToro = length(vec2(atraves, aoLongo / squashToro)) / max(nucleo * 4.2, 1e-4);
      /*
       * E ele e MAIOR que o disco, nao do tamanho dele.
       *
       * Nos quatro blueprints de referencia o toro domina a figura e o disco de acrecao e um ponto
       * no meio — a escala real e de parsecs contra dias-luz. Estava em 1,35 (encostado na borda do
       * disco, que morre em 1,0); vai a 1,8, que e o maior que cabe no orcamento de fragmento sem
       * dobrar a area acesa.
       */
      float toroR = spanToro / 1.8;
      // Suporte compacto: no corte (toroR = 1,79, ou seja raio = 13,5 nucleos) a gaussiana ainda
      // vale 3,0% — cinco vezes o piso de descarte. Subtrair o degrau a leva a zero na borda.
      const float PT = 0.030;
      float perfilToro = max(exp(-pow((toroR - 1.0) / 0.42, 2.0)) - PT, 0.0) / (1.0 - PT);
      /*
       * AS FAIXAS DE POEIRA, e elas sao PERIODICAS de proposito.
       *
       * O toro nao cisalha como o disco — ele e frio, denso e gira devagar, e o que as referencias
       * mostram nele sao aneis concentricos regulares, nao filamento turbulento. Entao a estrutura
       * sai de um cosseno em toroR, sem custar amostra de ruido nenhuma; quem quebra a
       * regularidade e a amostra que o DISCO ja tirou, reaproveitada aqui de graca.
       */
      /*
       * ⚠️ 7 voltas e nao 17, e a fase quebrada pelo ruido do disco.
       *
       * A 17, perfeitamente concentricas, as faixas liam como MOIRE — anel de interferencia, nao
       * pista de poeira. Sao dois defeitos juntos: densidade alta demais para o tamanho na tela, e
       * regularidade perfeita, que o olho reconhece como artefato de amostragem. Somar bandas na
       * FASE quebra a concentricidade sem custar amostra nova.
       */
      float faixas = 0.82 + 0.18 * cos(toroR * 7.0 + bandas * 1.6 + semente * 6.2831);
      /*
       * O toro passa pela MESMA lei, com o piso de PAREDE: h/r da ordem de 1, entao a coluna dele
       * para de crescer muito antes da do disco. E por isso que um nucleo tipo 2 nao apaga — o toro
       * satura e continua morno, reemitindo no infravermelho o que absorveu.
       */
      float toro = perfilToro * faixas * (0.86 + 0.14 * bandas) * (0.35 + 0.65 * (1.0 - vGlow.z))
                 * saidaDaLaje(1.6, squashToro, ${glslFloat(ASPECT_PAREDE)});

      /*
       * O nucleo entra com o peso da OBSCURACAO; o toro entra sempre. Ver a nota em quasarParams
       * sobre por que "esconder" aqui e multiplicar e nao ocluir.
       *
       * vLod.y conserva a LUZ do piso de pixel: ele e (raio nominal / raio com piso)^2, entao um
       * nucleo que foi espalhado para nao serrilhar fica proporcionalmente mais fraco e o objeto
       * nao ganha brilho ao se afastar. Ele multiplica a COR e o ALFA juntos — aplicar so num dos
       * dois muda o matiz com a distancia, que e a mesma classe de erro que separar as duas reguas.
       */
      float brilhoDisco = disco * vGlow.z;
      // O Doppler move a COR junto com o brilho: T_obs = T · delta, então o lado que se aproxima
      // não é só mais claro, é mais AZUL. Separar as duas metades do efeito daria um disco que
      // clareia sem esquentar, que é como uma luz refletida se comporta — não uma que vem do gás.
      vec3 corNucleo = termico(clamp((1.0 - span * 1.1) * delta, 0.0, 1.0)) * brilhoDisco
                     + vec3(0.80, 0.90, 1.0) * corona * vGlow.z * 1.6
                     + vec3(0.55, 0.26, 0.12) * toro * 0.9;
      cor += corNucleo * vLod.y;
      luz += (brilhoDisco + corona * 1.6 + toro * 0.9) * vLod.y;
    }

    if (naAgulha) {
      /*
       * O JATO. Duas metades, e o que as separa e o sinal de aoLongo — o lado positivo do eixo e
       * o que se aproxima, e e ele que carrega gainNear.
       */
      float ganho = aoLongo >= 0.0 ? vGlow.x : vGlow.y;
      float s = dLongo / max(jato, 1e-4);

      /*
       * NOS, e nao uma agulha lisa. O jato de M87 e uma fila de nos (HST-1, A, B, C), nao um risco
       * uniforme: o plasma sai em pulsos e choques internos acendem onde um pacote rapido alcanca
       * um lento. Uma amostra de ruido ao longo do eixo, avancando devagar no tempo — o padrao
       * MIGRA para fora, que e o que os nos fazem.
       */
      /*
       * ⚠️ A TAXA FOI MEDIDA EM SEGUNDOS DE TRAVESSIA, nao escolhida no olho.
       *
       * Era 0,22: com a escala espacial 3,1, o padrao andava 0,071 de dLongo por segundo e o jato
       * tem 5 de comprimento — **70 segundos** para um no atravessar. E o mesmo defeito que a
       * galaxia pagou ("nao gira" era 105 s por volta): abaixo do limiar de percepcao, o olho le
       * como parado, e foi assim que o usuario descreveu. A 0,9 a travessia cai para ~17 s, que e
       * o tempo em que um no e visivelmente OUTRO no entre duas olhadas.
       *
       * uFlow e o portao: 0 congela sem apagar nada (o padrao continua, so nao anda), e quem o
       * escolhe e o perfil de qualidade, em scene.js.
       */
      float no = simplex3(vec3(dLongo * 3.1 - uTime * uFlow * 0.9, semente, 12.0)) * 0.5 + 0.5;
      float pulso = 0.62 + 0.75 * no * no;

      /*
       * O perfil ATRAVES tem duas escalas, o mesmo achado do feixe do pulsar: um halo largo e
       * colorido mais uma ESPINHA branca fina no meio. Um facho de uma cor so le como geometria
       * pintada; nucleo estourado com halo em volta le como energia.
       */
      float halo = exp(-pow(dAtraves / largura, 2.0));
      float espinha = exp(-pow(dAtraves / (largura * 0.30), 2.0));

      /*
       * Ao longo do comprimento o jato quase nao perde brilho — e isso que COLIMACAO significa, e e
       * o que o distingue de um jorro. Ele so termina quando bate no lobo, e o corte e macio para
       * a agulha nao acabar numa reta.
       */
      float aoLongoFade = (1.0 - smoothstep(0.72, 1.06, s));
      float feixe = (halo * 0.55 + espinha) * aoLongoFade * pulso * ganho;

      // Sincrotron do jato: azul-branco no fio, tingido pela cor do hub no halo — o quasar tem de
      // continuar dizendo de que pasta ele e.
      cor += mix(vTone * 1.4, vec3(0.82, 0.92, 1.0), clamp(espinha * 1.2, 0.0, 1.0)) * feixe;
      luz += feixe;
    }

    /*
     * OS LOBOS, e eles NAO herdam a assimetria do jato.
     *
     * Lobo e plasma ja freado contra o meio intergalactico: nada ali se move a fracao relevante
     * de c, entao nao ha beaming. Os dois aparecem com brilho parecido mesmo quando so um jato e
     * visivel — e essa discordancia entre agulha de um lado so e par de lobos simetrico e a
     * figura classica de radiogalaxia. Herdar o Doppler aqui apagaria a informacao.
     *
     * ⚠️ FORA do bloco da agulha, e nao dentro dele. Aqui eles estavam presos a caixa estreita do
     * jato, que passava pelo meio da bolha e a cortava numa reta — a faixa retangular fotografada.
     */
    if (noLobo) {
      float dLobo = length(vec2(dLongo - jato, atraves));
      /*
       * SUPORTE COMPACTO: a gaussiana menos o valor que ela tem NO CORTE, renormalizada.
       *
       * Cortar em 1,8 sigma deixa 3,9% do pico — 5x acima do piso de descarte deste shader (0,003),
       * o que trocaria a faixa reta por um disco fantasma de borda visivel. Subtrair o degrau faz o
       * perfil chegar a zero exatamente onde a regiao termina, entao nao ha borda para ver.
       *
       * A conta que decide isto: no corte ANTIGO (a caixa do jato, 0,2975 de meia-altura) a
       * gaussiana do lobo valia exp(-(0,2975/0,8)^2) = 0,87 — 87% do pico cortados numa reta. Era
       * essa a faixa fotografada, e o numero explica por que ela era tao evidente.
       */
      const float PE = 0.0392;  // exp(-1.8^2), o degrau no corte
      float bolha = max(exp(-pow(dLobo / lobo, 2.0)) - PE, 0.0) / (1.0 - PE);
      // A borda do lobo e irregular: ele e uma bolha inflada num meio que nao e uniforme.
      // 0,03 dava ~200 s para a rugosidade do lobo mudar de cara: parado. O lobo e plasma ja
      // freado, entao ele fervilha DEVAGAR de proposito — mas devagar tem de ser perceptivel.
      float rugosidade = 0.70 + 0.55 * (simplex3(vec3(p * 1.6, uTime * uFlow * 0.12 + semente)) * 0.5 + 0.5);
      float lobos = bolha * rugosidade * 0.42;
      cor += mix(vTone, vec3(0.62, 0.72, 0.95), 0.55) * lobos;
      luz += lobos;
    }

    /*
     * vLod.x e a rampa de detalhe: o quasar nasce junto com os bracos da galaxia e satura com a
     * textura dela. Reusar a escada de galaxy.js em vez de inventar uma quarta e deliberado — o
     * proprio modulo avisa que uma quarta escada de pixel descorrelacionada nesta cena e uma
     * armadilha de manutencao.
     */
    float total = luz * uGain * vLod.x * (0.55 + vGlow.w * 0.75);
    if (total < 0.003) discard;
    gl_FragColor = vec4(cor * uGain * vLod.x * (0.55 + vGlow.w * 0.75), total);
  }
`;

/**
 * O campo de quasares: um draw instanciado para os hubs que qualificam.
 *
 * `{ object, update, dispose }` como todo módulo desta camada, e nada é alocado aqui — geometria,
 * material e buffers nascem no primeiro `update` não vazio, a mesma preguiça de `galaxy.js`.
 */
export function createQuasars(capacity = 16) {
  const group = new THREE.Group();

  let geometry = null;
  let material = null;
  let mesh = null;
  let slots = 0;
  let center = null;
  let view = null;
  const buffers = new Map();
  const settings = { gain: 1, flow: 1 };

  function build(size) {
    dispose();
    slots = size;
    geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3)
    );
    geometry.setIndex([0, 1, 2, 2, 1, 3]);

    center = new Float32Array(slots * 3);
    view = new Float32Array(slots * 4);
    geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(center, 3));
    geometry.setAttribute('aView', new THREE.InstancedBufferAttribute(view, 4));
    for (const [name, items] of STATIC_LAYOUT) {
      const array = new Float32Array(slots * items);
      buffers.set(name, array);
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, items));
    }
    // ⚠️ `instanceCount` nasce **Infinity** em r171 e o renderer o prende ao tamanho do primeiro
    // atributo instanciado — deixar no default desenharia a capacidade inteira, slots vazios
    // incluídos. `galaxy.js` documenta a mesma armadilha com a referência de arquivo.
    geometry.instanceCount = 0;

    material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uFlow: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    mesh = new THREE.Mesh(geometry, material);
    // A esfera envolvente de um quad na origem não diz nada sobre onde as instâncias estão.
    mesh.frustumCulled = false;
    // Depois da galáxia (-1): o núcleo ativo é o que está DENTRO dela, e sendo aditivo a ordem só
    // importa para não ficar atrás de quem escreve profundidade.
    mesh.renderOrder = -1;
    group.add(mesh);
  }

  let dirty = false;
  /*
   * A leitura de volta depois da escrita é deliberada: o array é Float32 e o valor que chega é um
   * double, então comparar contra o double cru acusaria mudança todo quadro só por arredondamento.
   * É a disciplina do `put` de `galaxy.js` — a escrita na CPU é grátis, o upload não é.
   */
  function put(array, at, value) {
    const before = array[at];
    array[at] = value;
    if (array[at] !== before) dirty = true;
  }

  /*
   * A POSE, resolvida contra a CÂMERA — e é ela que faz o objeto virar quando a câmera vira.
   *
   * O eixo de spin é uma direção de MUNDO (`params.axisWorld`). Dela saem duas coisas por quadro:
   *
   *   `cosView`  = |eixo · direção de visada|. É o número que explica as cinco feições, e agora ele
   *               muda com a órbita em vez de ser hash. Módulo porque os dois lados do eixo são o
   *               mesmo eixo — quem distingue aproximando de afastando é o par gainNear/gainFar.
   *   a direção  = projeção do eixo na base da câmera (direita, cima). É para onde a agulha aponta
   *   NA TELA     na tela, e é o que muda quando o operador gira a cena.
   *
   * ⚠️ Sem câmera (montagem, primeiro quadro) a pose de partida de `quasarParams` continua valendo.
   * Devolver zero aqui poria todo quasar de perfil no quadro em que a cena monta.
   */
  const EIXO = new THREE.Vector3();
  const VISADA = new THREE.Vector3();
  const DIREITA = new THREE.Vector3();
  const CIMA = new THREE.Vector3();

  function poseDe(p, camera, position) {
    if (!camera || !p.axisWorld) return { cos: Math.cos(p.axis), sin: Math.sin(p.axis), vista: p };
    EIXO.copy(p.axisWorld);
    VISADA.copy(position).sub(camera.position).normalize();
    const cosView = Math.min(1, Math.abs(EIXO.dot(VISADA)));
    DIREITA.setFromMatrixColumn(camera.matrixWorld, 0);
    CIMA.setFromMatrixColumn(camera.matrixWorld, 1);
    const sx = EIXO.dot(DIREITA);
    const sy = EIXO.dot(CIMA);
    // Eixo apontando quase na linha de visada: a projeção some e a direção na tela fica indefinida.
    // Nesse regime o jato já está no piso de comprimento, então qualquer direção serve — e uma
    // constante evita o eixo dar piruetas em torno da degenerescência.
    const norma = Math.hypot(sx, sy);
    const cos = norma > 1e-4 ? sx / norma : 1;
    const sin = norma > 1e-4 ? sy / norma : 0;
    return { cos, sin, vista: viewFeatures(cosView) };
  }

  function writeStatic(i, p, camera, position) {
    const pose = poseDe(p, camera, position);
    const v = pose.vista;
    const axis = buffers.get('aAxis');
    put(axis, i * 3, pose.cos);
    put(axis, i * 3 + 1, pose.sin);
    // O achatamento viaja com o EIXO, e não com o alcance, porque é dele que ele é função: o disco
    // é perpendicular ao eixo de spin, então é a direção do eixo que a projeção comprime.
    put(axis, i * 3 + 2, v.squash);

    const reach = buffers.get('aReach');
    put(reach, i * 3, v.jet);
    put(reach, i * 3 + 1, p.lobe);
    put(reach, i * 3 + 2, p.knot);

    const glow = buffers.get('aGlow');
    put(glow, i * 4, v.gainNear);
    put(glow, i * 4 + 1, v.gainFar);
    put(glow, i * 4 + 2, v.nucleus);
    put(glow, i * 4 + 3, p.power);

    const tone = buffers.get('aTone');
    put(tone, i * 3, p.tone.r);
    put(tone, i * 3 + 1, p.tone.g);
    put(tone, i * 3 + 2, p.tone.b);
  }

  function dispose() {
    if (!mesh) return;
    group.remove(mesh);
    material.dispose();
    geometry.dispose();
    buffers.clear();
    mesh = material = geometry = center = view = null;
    slots = 0;
  }

  return {
    object: group,

    /**
     * @param {{gain?: number, flow?: number}} opts  `flow` é o multiplicador do relógio: 1 é a
     *   taxa nominal, 0 congela. Quem decide é o PERFIL DE QUALIDADE — animação é custo, e num
     *   perfil mínimo ela é a primeira coisa que sai. Congelar não apaga nada: o padrão continua
     *   desenhado, só para de andar.
     */
    tune({ gain = 1, flow = 1 } = {}) {
      settings.gain = gain;
      settings.flow = flow;
    },

    /**
     * Um quadro do campo inteiro.
     *
     * @param {Array<{params: object, position: THREE.Vector3, radius: number}>} entries
     *   `position` e `radius` em unidades de MUNDO, como `graph.planetAnchor` devolve. `radius` é o
     *   raio da ÂNCORA; o disco da galáxia é ele vezes `SPAN`, e é contra o disco que este módulo
     *   mede — por isso quem chama passa o MESMO raio que passa para `galaxy.update`, já
     *   multiplicado. ⚠️ Portanto `object` pertence à RAIZ da cena: pendurá-lo em `graph.group`
     *   aplicaria o `graphSpread` uma segunda vez.
     * @param {THREE.Camera} camera
     * @param {number} viewportHeight  altura de FRAMEBUFFER (`canvas.height`)
     * @param {number} elapsed  relógio da cena, em segundos
     * @param {(radius: number, distance: number, height: number, fov: number) => number} pxOf
     *   a mesma projeção que a galáxia usa (`diskPx`), injetada para os dois não poderem discordar
     *   sobre qual número escolheu o nível de detalhe.
     * @param {{far: number, near: number}} ladder  a escada de LOD da galáxia
     * @returns {number} quantos quasares estão acima do limiar
     */
    update(entries, camera, viewportHeight, elapsed, pxOf, ladder) {
      const count = entries?.length ?? 0;
      if (count === 0) {
        group.visible = false;
        if (geometry) geometry.instanceCount = 0;
        return 0;
      }
      if (!mesh || slots < count) build(Math.max(capacity, count));
      group.visible = true;

      dirty = false;
      let acesos = 0;

      for (let i = 0; i < count; i += 1) {
        const entry = entries[i];
        const radius = entry.radius;
        const px = pxOf(
          radius,
          camera.position.distanceTo(entry.position),
          viewportHeight,
          camera.fov
        );

        center[i * 3] = entry.position.x;
        center[i * 3 + 1] = entry.position.y;
        center[i * 3 + 2] = entry.position.z;
        view[i * 4] = radius;
        view[i * 4 + 1] = px;
        // ⚠️ valor PRIMEIRO — `MathUtils.smoothstep(x, min, max)` é o OPOSTO do `smoothstep` do
        // GLSL, e trocar a ordem é um no-op silencioso. `galaxy.js` registra a mesma pedra.
        view[i * 4 + 2] = THREE.MathUtils.smoothstep(px, ladder.far, ladder.near);
        view[i * 4 + 3] = 0;
        if (px >= ladder.far) acesos += 1;

        writeStatic(i, entry.params, camera, entry.position);
      }

      geometry.instanceCount = count;
      geometry.getAttribute('aCenter').needsUpdate = true;
      geometry.getAttribute('aView').needsUpdate = true;
      if (dirty) for (const [name] of STATIC_LAYOUT) geometry.getAttribute(name).needsUpdate = true;
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uGain.value = settings.gain;
      material.uniforms.uFlow.value = settings.flow;

      return acesos;
    },

    count: () => (geometry ? geometry.instanceCount : 0),

    dispose,
  };
}
