/**
 * Anéis planetários: a estrela cujo arquivo está diferente do que está commitado.
 *
 * O céu inteiro mostra conhecimento *indexado*, e índice é sempre uma foto do passado. O anel
 * é a única coisa na cena que fala do disco AGORA: apareceu anel, aquele arquivo mudou depois
 * da última reindexação. É o par visual do `server/dirty.py`.
 *
 * **Três estados, três sistemas de anéis reais** — a estrutura carrega a informação junto com
 * a cor, e não só a cor:
 *
 * | Estado | Família | Por quê |
 * |---|---|---|
 * | `modified` | Saturno | trabalho em curso: o sistema mais rico, faixas largas e Cassini |
 * | `staged` | Urano | preparado: anéis estreitos, separados, arrumados |
 * | `untracked` | Júpiter | sem histórico: halo difuso, quase sem estrutura |
 *
 * Distinguir por cor apenas obrigaria a decorar uma legenda; distinguir também pela silhueta
 * deixa os três reconhecíveis de relance e sobrevive a quem não separa bem as cores. O perfil
 * radial de cada família está em `ring-profiles.js`, com as medidas reais.
 *
 * **É um quad com shader, não um `RingGeometry`.** A primeira versão era anel de geometria com
 * `MeshBasicMaterial`, e media mal em três frentes ao mesmo tempo: a silhueta facetava (um anel
 * grande mostra os segmentos como cantos), a borda era um corte duro numa cena onde tudo tem
 * queda suave, e a faixa era preenchimento uniforme — um donut chapado. Num quad a
 * circunferência é analítica: não há segmento para facetar em tamanho nenhum, e a densidade
 * vem da textura de perfil, que é o que produz as bandas e os vãos.
 *
 * **O anel é billboardado e INCLINADO, não fixo no mundo.** Inclinação de mundo põe o anel de
 * perfil em metade da órbita da câmera — ele some exatamente quando o operador gira a cena.
 * Copiar o quaternion da câmera e depois tombar mantém a mesma elipse de qualquer ângulo.
 *
 * O tombo entra por `rotateZ`/`rotateX`, que multiplicam o quaternion — nunca por `rotation.x`.
 * Escrever no Euler recalcularia o quaternion e descartaria o billboard, que é o defeito que os
 * portais de `satellites.js` já pagaram uma vez (o anel cambaleava a cada quadro).
 *
 * Não há giro nem pulso: o anel é uma circunferência, e girá-la em torno do próprio eixo não
 * muda um pixel. Sai de graça obedecendo `prefers-reduced-motion` — não há movimento a reduzir.
 */
import * as THREE from 'three';
import { GLSL_OPTICAL_DEPTH, ASPECT_FOLHA } from './optical-depth.js';
import { glslFloat } from './glsl.js';
import { profileTexture } from './ring-profiles.js';
import { RING_BY_STATE } from './catalog.js';
import { rockTexture } from './ring-rock.js';
import { GLSL_PSNOISE } from './ring-noise.js';

/**
 * Uma cor por estado do `git status`. Âmbar, verde-água e violeta se separam bem entre si
 * também nas deficiências de visão de cor mais comuns — e, aqui, a cor é reforço da família,
 * não a única pista.
 */
export const DIRTY_COLORS = {
  modified: 0xffc169,
  staged: 0x7ee0c0,
  untracked: 0xc9a6ff,
};

export const DIRTY_LABELS = {
  modified: 'ALTERADO',
  staged: 'PREPARADO',
  untracked: 'NÃO RASTREADO',
};

/*
 * ⚠️ A tabela estado→família vive no CATÁLOGO, e aqui era uma segunda cópia dela.
 *
 * `RING_BY_STATE` já dizia `modified: {family: 'saturn'}` e este módulo repetia o mesmo mapa com
 * outro nome. Duas cópias que ninguém obriga a concordar é o defeito que este projeto já pagou
 * quatro vezes (`OMEGA_P`, o pulso, a régua do anel, o piso de aspecto): as duas parecem certas
 * isoladamente e divergem no dia em que alguém edita uma. Agora há um dono só.
 */
const familyOf = (state) => (RING_BY_STATE[state] ?? RING_BY_STATE.modified).family;

/*
 * O raio da estrela NÃO é constante aqui — ele chega por `radiusOf` em `follow`.
 *
 * Já foi uma constante (`0.39 * aSize`) e a constante errava por três caminhos ao mesmo tempo,
 * todos medidos: o `graphSpread` escala a geometria e não o ponto (oscilação de 8× no slider),
 * a ignição infla o ponto em até ~4× (a estrela acesa engolia o próprio anel) e `gl_PointSize`
 * é pixel de framebuffer, então a razão mudava ~4× entre monitores. Quem sabe o tamanho
 * aparente do ponto é quem escreve o `gl_PointSize`: `graph.js`.
 */
// Inclinação média a partir do plano da tela, ~63°: elipse achatada o bastante para ler como
// anel em perspectiva, aberta o bastante para não virar um traço.
const TILT = 1.1;
/*
 * Até quantos RAIOS DO ASTRO o sistema de anéis pode se estender na tela.
 *
 * ⚠️ Esta constante já foi um "rodapé" — a fração do sprite que o anel inteiro ocupava (0,62),
 * escolhida para conter um sistema que a `reach` real deixava 4,9× mais largo que o astro e que
 * cobria a tela. **Ela produzia geometria impossível, e o defeito era visível:** o disco do
 * astro tem raio `VISIBLE_CORE` (0,6) do sprite, então um quad de meia-extensão 0,62 do sprite
 * punha a borda EXTERNA do anel a 1,03 raio do astro — o anel inteiro dentro do próprio planeta.
 * O teste que esconde a metade distante atrás do astro então comia essa metade toda, e o que
 * chegava à tela era **meio anel, cortado reto**.
 *
 * A correção não é remover o teste (ele está certo: metade do anel PASSA mesmo atrás do astro).
 * É fazer o anel ser maior que o astro. O sistema agora se estende por `min(reach, SPAN_CAP)`
 * raios do astro: real até o teto, e o teto existe pelo motivo medido de antes — no ajuste
 * padrão a câmera fica dentro da casca de nós, e anéis largos demais se sobrepõem.
 *
 * 2,4 mantém Saturno (2,45) e Urano (2,20) praticamente inteiros e só comprime Júpiter (3,20),
 * cujos gossamer são exatamente a parte tênue que menos se perde ao encolher.
 */
// Rascunho do ângulo de visada do anel em foco. No escopo do módulo porque `follow` roda por
// anel por quadro — alocar um Vector3 ali seria lixo por quadro num laço que já é quente.
const NORMAL = new THREE.Vector3();
const TO_CAMERA = new THREE.Vector3();

const SPAN_CAP = 2.4;

/**
 * Que fração do raio do SPRITE é o disco visível da estrela.
 *
 * Este número era um contrato IMPLÍCITO entre `graph.js` (que devolve o raio do sprite) e este
 * módulo (que ancora o anel nele) — e a bancada o expôs na primeira montagem: passando o raio
 * VISÍVEL onde o código esperava o do sprite, o anel inteiro cabia dentro da estrela e não
 * aparecia. Exportado para quem precisar converter entre os dois ter uma fonte só.
 *
 * De onde sai: o núcleo do ponto é `pow(1 - smoothstep(0,1,d), 2.2)` e já caiu a ~2% em d=0.6.
 * É também o que ancora o anel: a meia-extensão do quad é este raio vezes `span`, e o limbo
 * no shader é `1/span`. Divergir esses dois números foi o que cortou o anel ao meio.
 */
export const VISIBLE_CORE = 0.6;
// Dispersão determinística da inclinação e do rolamento. Todos os anéis com o MESMO tombo lê
// como carimbo; os planetas reais não combinaram inclinação entre si.
const TILT_SPREAD = 0.30;
/*
 * Dispersão do ROLAMENTO — quanto o eixo maior da elipse pode sair da horizontal.
 *
 * Era `± π/2`, ou seja **±90°**: metade dos anéis nascia de pé, e um anel vertical não lê como
 * anel — lê como defeito. Pior, ele fazia par com a oclusão da metade distante e o resultado era
 * meio anel cortado por uma reta VERTICAL, que parecia clipping de câmera e não era.
 *
 * ±0,26 rad (~15°) dá o desalinhamento que impede o carimbo repetido sem tirar o objeto da
 * horizontal. Continua determinístico por nó: o mesmo arquivo tem sempre a mesma pose.
 */
const ROLL_SPREAD = 0.52;
/*
 * Voltas por segundo da borda INTERNA (a externa sai daí pelo cisalhamento kepleriano do
 * shader). 0,014 dá ~70s por volta no anel C e ~4min no A: movimento que se percebe olhando,
 * mas que não compete com a órbita dos nós, que é o gesto principal da cena.
 */
const SPIN = 0.014;
const OPACITY = 0.9;
/*
 * Teto de anéis desenhados ao mesmo tempo. Um refactor grande suja centenas de arquivos, e aí
 * o céu vira um campo de anéis que não informa nada. Quem chama recebe quantos ficaram de fora
 * e é responsável por dizê-lo — corte silencioso lê como "é só isso que mudou".
 */
let maxRings = 64;

/*
 * Faixa de transição entre os dois níveis, em pixels de raio do DISCO VISÍVEL do astro.
 *
 * 15,6px é a ordem de grandeza de um astro na vista padrão; 54px, a de quando a câmera está
 * travada num deles. A faixa é LARGA de propósito — transição estreita vira degrau, e degrau é
 * o que faz nível de detalhe parecer bug em vez de detalhe.
 *
 * ⚠️ **Eram 26 e 90, e a mudança é de RÉGUA, não de comportamento.** Estes dois números eram os
 * únicos da engine medidos em raio do SPRITE — metade do `gl_PointSize`, com o teto de 511 do
 * driver junto. Todo o resto (planeta, fotosfera, cometa, pulsar, nebulosa, estação, lente, e o
 * orçamento inteiro de `lod.js`) mede o raio aparente do disco visível, e as duas réguas se
 * convertem exatamente: **visível = 0,6 × sprite**, que é o `VISIBLE_CORE`. Daí `26 × 0,6 = 15,6`
 * e `90 × 0,6 = 54` — a troca de material acontece na MESMA distância de antes, de propósito.
 *
 * O que a régua velha custava: a entrada saturava em 255,5px (o teto do driver, `511 × 0,5`), então
 * de perto o número parava de acompanhar o corpo; e nenhum destes dois valores dava para comparar
 * com nenhum outro limiar da engine sem uma conversão que ninguém tinha escrito.
 *
 * ⚠️ E medir o ANEL em vez do astro (seria `× ring.span`) é outra decisão, não esta: `span` varia
 * por família, então ela moveria a transição de cada anel para um lugar diferente. Quem quiser
 * fazê-la, faça-a por conta própria e olhando.
 */
export const LOD_FAR_PX = 15.6;
export const LOD_NEAR_PX = 54;

/** `smoothstep` do GLSL em JS — a transição é decidida na CPU, uma vez por anel. */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/*
 * Ordem de desenho, e ela é OBRIGATÓRIA.
 *
 * São três coisas na mesma posição: a estrela (ponto aditivo), a extinção (multiplicativa) e a
 * luz espalhada pelo anel (aditiva). A sequência tem que ser exatamente essa — a estrela
 * desenha, o anel escurece o que ficou atrás dele, e só então a luz somada entra.
 *
 * Sem `renderOrder` explícito isso ficaria à mercê da ordenação de transparentes do three, que
 * ordena por DISTÂNCIA — e aqui as três estão à mesma distância, então o resultado seria a
 * ordem de inserção, que não é contrato de nada.
 */
/*
 * τ efetivo da passagem do anel na frente do astro.
 *
 * O anel B real mede 1,5–2,5, e por um tempo esta constante ficou em 2.0 justamente por estar
 * DENTRO dessa faixa. Só que ela foi escolhida com a geometria errada — o sistema inteiro cabia
 * em 1,03 raio do astro, então a área que a extinção pintava era uma lasca no limbo. Corrigida a
 * extensão, a MESMA constante passou a cobrir quase todo o disco e apagou o astro.
 *
 * A lição é a de sempre: número calibrado a olho vale para a geometria em que foi calibrado.
 * 1.2 bloqueia 70% no pico de densidade e quase nada na Divisão de Cassini e no anel C — a
 * passagem continua legível como faixa escura, e o astro sobrevive a ela.
 */
const OPTICAL_DEPTH = 1.2;

/*
 * EXTINÇÃO — o anel na frente do astro ESCURECE, não soma luz.
 *
 * O anel B de Saturno tem profundidade óptica τ≈1.5–2.5: passando na frente do planeta ele
 * aparece como uma faixa ESCURA. Com blending aditivo o desenho fazia o oposto — a metade
 * próxima clareava exatamente o que devia tapar.
 *
 * Este passe desenha SÓ a metade próxima, e só onde ela cruza o disco da estrela: fora dali não
 * há nada para escurecer. A metade distante nem chega aqui — ela já foi descartada pela oclusão
 * do outro passe.
 */
const EXTINCTION_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform float uOpacity;
  uniform float uCosTilt;
  // Limbo do astro em unidades do quad: 1/span. Varia por família, então NÃO é constante.
  uniform float uLimb;
  uniform vec2 uRadial;
  uniform float uDepth;
  varying vec2 vUv;


  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    if (p.y < 0.0) discard;
    float screenR = length(vec2(p.x, p.y * uCosTilt));
    if (screenR > uLimb) discard;

    float density = texture2D(uProfile, vec2(r, 0.5)).r;
    // Beer-Lambert: a fracao que ATRAVESSA e exp(-tau * densidade).
    float transmitted = exp(-uDepth * density);
    float blocked = (1.0 - transmitted) * uOpacity;
    if (blocked < 0.004) discard;
    // Com blendSrc=Zero e blendDst=OneMinusSrcColor, o destino e multiplicado por (1 - src).
    gl_FragColor = vec4(vec3(blocked), 1.0);
  }
`;

const ORDER_EXTINCTION = 1;
const ORDER_SCATTER = 2;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * O fragmento não desenha faixa nenhuma: ele só pergunta ao perfil qual é a densidade naquele
 * raio. Toda a estrutura (largura das faixas, Cassini, Encke, gossamer) mora nos dados, onde é
 * legível e conferível contra a medida real, e não espalhada em constantes de shader.
 *
 * ## O gradiente é ÂNGULO DE FASE, e ele difere por família
 *
 * A primeira versão escurecia "a metade que passa na frente" — e fazia o contrário do que o
 * comentário dizia (com `rotateX` positivo e a câmera olhando por −Z, `p.y > 0` é a metade
 * PRÓXIMA, que era justamente a que recebia brilho cheio). Pior: aplicava a mesma assimetria
 * fraca nas três famílias, quando duas delas pedem o oposto e a terceira pede muito mais.
 *
 * Aqui o primário é uma ESTRELA — fonte emissiva no centro — então a assimetria é puramente de
 * ângulo de fase, e ela é a assinatura física de cada família:
 *
 * | Família | Partícula | Comportamento |
 * |---|---|---|
 * | Saturno, Urano | gelo/rocha centimétrica | RETROespalha: a metade DISTANTE é mais clara |
 * | Júpiter | poeira sub-micrométrica | espalha para FRENTE: ~100× mais brilhante em fase baixa |
 *
 * O anel de Júpiter foi literalmente descoberto assim, pela Voyager 2 olhando para trás — em
 * retroespalhamento ele é quase invisível. Um lobo frontal estreito e forte é o que o torna
 * reconhecível, e é o que `uForward` liga.
 *
 * ## O perfil começa no LIMBO, não no centro
 *
 * `uRadial` remapeia o raio do quad para o raio do perfil. Sem isso, 45% do raio (a região
 * dentro do planeta, onde não existe anel) consumia téxeis e resolução de tela: a lacuna de
 * Encke e os dez anéis de Urano ficavam uma ordem de grandeza abaixo de um pixel — existiam no
 * arquivo e não na imagem. Descartar essa faixa devolve ~1.8× de resolução radial onde há
 * estrutura para ver.
 */const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform sampler2D uRock;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uForward;
  /*
   * DUAS GRANDEZAS QUE ERAM UM NUMERO SO — e a confusao apagava o volume do anel em foco.
   *
   * uCosTilt e ACHATAMENTO DE TELA: quanto a elipse do billboard e espremida em y. Em modo
   * mundo ele vale 1, porque a projecao ja achata e achatar de novo aplicaria o tombo duas vezes.
   *
   * uCosView e o cosseno REAL entre a normal do disco e a direcao da camera — a fisica do
   * caminho obliquo. Enquanto os dois eram o mesmo uniform, o anel em foco (o unico que vira de
   * verdade quando se orbita) recebia 1 aqui tambem, e a profundidade optica ficava pinada em
   * "de frente": ganho constante, volume nenhum. Girar a camera nao revelava nada, que e
   * exatamente o que o foco existe para permitir.
   */
  uniform float uCosTilt;
  uniform float uCosView;
  // Limbo do astro em unidades do quad: 1/span. Varia por família, então NÃO é constante.
  uniform float uLimb;
  uniform float uNear;
  uniform float uPhase;
  uniform vec2 uRadial;
  varying vec2 vUv;

  const float TAU = 6.28318530718;
  const float RADIAL_PERIOD = 1024.0;
  // Wakes: densidade, celulas em azimute, profundidade optica, forca da auto-sombra.
  const float WAKE = 0.16;
  const float CELLS = 96.0;
  const float DEPTH = 2.6;
  const float SHADE = 1.6;
  const float GRAIN = 0.55;
  /*
   * CISALHAMENTO CONGELADO, em VOLTAS entre o limbo e o alcance.
   *
   * Este numero e FORMA, nao taxa: ele nao multiplica o relogio, entao a frequencia radial que
   * ele cria e a mesma no primeiro quadro e uma hora depois. 0,9 volta e a torcao que a versao
   * antiga tinha por volta de t=60s — o ultimo instante em que a bancada ainda mostrava
   * pedregulho redondo. Acima de ~2 voltas eles comecam a esticar e virar fio.
   */
  const float SHEAR_TURNS = 0.9;

  ${GLSL_PSNOISE}
  ${GLSL_OPTICAL_DEPTH}

  // Banda-limitacao (Quilez): a oitava que oscila mais de uma vez por pixel nao pode ser
  // amostrada. Apaga-la custa um smoothstep; supersampla-la custaria N vezes o shader.
  float fnoise(vec2 p, float cells, float w){
    return psnoise(p, vec2(cells, RADIAL_PERIOD)) * smoothstep(1.0, 0.5, w);
  }

  // Fator INTEIRO em cada oitava: e o que preserva o periodo azimutal. O classico 2.01
  // (usado contra repeticao) reabriria a costura em +-pi, bem no meio do anel.
  float fbmWake(vec2 q, float cells, float w){
    float t = 0.500 * fnoise(q,       cells,       w);
    t +=      0.250 * fnoise(q * 2.0, cells * 2.0, w * 2.0);
    t +=      0.125 * fnoise(q * 4.0, cells * 4.0, w * 4.0);
    return t;
  }

  // Celula de wake: longa em azimute, fina em raio, CISALHADA — o cisalhamento e o angulo de
  // pitch (20-30 graus da direcao orbital) e sai de graca; rotacionar custaria sen/cos.
  vec2 wakeCoords(float ang, float rad){
    vec2 q = vec2(ang / TAU * CELLS, rad * CELLS * 0.62);
    q.x += q.y * 0.45;
    return q;
  }

  // Assimetria quadrupolar do anel A: dois minimos, perto de 70 e 250 graus de longitude,
  // onde os wakes se alinham com a linha de visada (Cassini/UVIS).
  float wakeAsymmetry(float ang){
    return 1.0 + WAKE * cos(2.0 * (ang - 1.22));
  }

  /*
   * CISALHAMENTO KEPLERIANO — omega proporcional a r^-1.5, e ele mora na FORMA.
   *
   * Um anel real nao gira como disco rigido: a borda interna completa uma volta em ~6h e a
   * externa em ~14h. Quem desenha isso aqui e uma espiral FIXA — a torcao ja esta na textura, e o
   * padrao inteiro roda como bloco por cima dela. O olho le rotacao diferencial do mesmo jeito,
   * porque o que ele reconhece e a forma torcida, nao a velocidade de cada raio. E e o que impede
   * a leitura de "textura colada num prato girando".
   *
   * O r e a coordenada do PERFIL (0 no limbo, 1 no alcance); a razao de raios reais e
   * (1 + r*(span-1)), e o expoente -1.5 e a terceira lei de Kepler.
   *
   * ⚠️ NUNCA MULTIPLIQUE ISTO PELO RELOGIO — foi exatamente assim que o defeito nasceu.
   *
   * A versao antiga escrevia uPhase * shear(r), com uPhase = elapsed * SPIN: a rotacao
   * diferencial saindo do tempo. Isso ENROLA SEM FIM — a diferenca de fase entre raios vizinhos
   * cresce linear com o relogio e o pedregulho vai sendo esticado ate virar fio. Medido na
   * bancada, no espécime ANEL PLANETARIO: aos 60s ainda havia pedregulho redondo, aos 300s eles
   * ja eram linhas concentricas finas e aos 600s nao sobrava textura nenhuma. Nao satura em lugar
   * nenhum; so piora. Quinta ocorrencia desta lei nesta base, e a primeira fora das peles.
   *
   * A saida e a mesma da galaxia (patternSpin) e do disco do quasar: curvatura CONGELADA em
   * SHEAR_TURNS, e o relogio entrando como uma taxa UNICA (uPhase) que roda o padrao inteiro.
   */
  float shear(float r){
    return pow(1.0 + r * (1.0 / uLimb - 1.0), -1.5);
  }

  float phaseTerm(float y){
    float near = clamp(y, 0.0, 1.0);
    float far = clamp(-y, 0.0, 1.0);
    float ice = 0.72 + 0.28 * far;
    float dust = 0.30 + 2.6 * pow(near, 3.0);
    return mix(ice, dust, uForward);
  }

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    // Metade DISTANTE some atras do astro. p.y < 0 e a distante (rotateX positivo, camera
    // olhando por -Z) — trocar o sinal esconderia a metade que passa NA FRENTE.
    if (p.y < 0.0 && length(vec2(p.x, p.y * uCosTilt)) < uLimb) discard;

    vec2 slab = texture2D(uProfile, vec2(r, 0.5)).rg;
    float density = slab.r;
    float ang = atan(p.y, p.x);

    /*
     * A TORCAO, em voltas — a espiral congelada mais a fase rigida do relogio.
     *
     * Uma conta so, e de proposito: os dois niveis de detalhe liam shear(r) por conta propria e
     * podiam discordar sobre onde a textura esta. E a mesma classe de defeito que as duas reguas
     * de pixel deste arquivo ja custaram, e um pow a menos no ramo de transicao.
     */
    float twist = SHEAR_TURNS * shear(r) + uPhase;

    /*
     * NIVEL DE PERTO — textura de rocha filtrada pelo hardware.
     *
     * uNear e uniforme, entao este ramo e COERENTE no draw call inteiro: a GPU nao paga
     * divergencia, so o custo do lado escolhido. Fora da faixa de transicao, um dos dois
     * simplesmente nao roda.
     *
     * A costura do atan e resolvida com DUAS amostras defasadas de meia volta: a derivada de
     * fract explode em ang=0 e o hardware escolheria o mip mais grosseiro numa linha de 1px.
     */
    float rough = 1.0;
    float sparkle = 0.0;
    if (uNear > 0.001) {
      float a = ang / TAU + twist;
      float v0 = fract(a);
      float v1 = fract(a + 0.5);
      float blend = smoothstep(0.0, 0.06, min(v0, 1.0 - v0));
      vec4 g = mix(texture2D(uRock, vec2(r, v1)), texture2D(uRock, vec2(r, v0)), blend);
      rough = mix(1.0, 2.0 * g.r * (0.6 + 0.8 * g.b), GRAIN);
      // Pedregulho e brilho ADICIONADO onde ja ha material: uma pedra acesa fora do anel
      // seria uma estrela solta, e o ceu ja esta cheio delas.
      sparkle = g.g * 0.9 * density;
    }

    /*
     * NIVEL DE LONGE — laje de profundidade optica finita.
     *
     * Transmissao saturada mais auto-sombra radial: o anel A nasce escuro PORQUE o anel B esta
     * na frente da luz. E o que sobrevive quando o anel tem 20px — o olho le contraste entre
     * faixas, nao textura.
     *
     * O -0.5 na sombra e normalizacao de EXPOSICAO, nao fisica: ancorado em zero, a sombra
     * escureceria o anel inteiro em vez de criar contraste entre borda interna e externa.
     */
    float grainFar = 1.0;
    if (uNear < 0.999) {
      vec2 q = wakeCoords(ang + twist * TAU, r);
      /*
       * ⚠️ A PEGADA DO FRAGMENTO NAO PODE SER MEDIDA ATRAVES DO CORTE DE atan.
       *
       * q.x e linear em ang, e ang vem de atan(p.y, p.x). No pixel onde atan salta de +pi para
       * -pi, fwidth(q.x) le esse salto como se fosse derivada: ~CELLS (96) de uma vez, quando o
       * campo nao mudou nada. A banda-limitacao de fnoise multiplica por smoothstep(1.0, 0.5, w),
       * que zera para w >= 1 — entao o grao SUMIA numa coluna de 1px e grainFar caia para 1,0.
       *
       * ⚠️ Isto NAO era a costura do buraco negro, e a diferenca importa para nao consertar a
       * coisa errada: o campo aqui ja e exatamente periodico (CELLS inteiro, lacunaridade 2,0),
       * entao os dois lados do corte davam o MESMO valor. O que aparecia era uma linha radial de
       * detalhe amputado, nao uma descontinuidade de dado. E a variante fwidth-sobre-atan que
       * ring-noise.js ja nomeia no proprio cabecalho.
       *
       * O conserto e o mesmo padrao que o ramo de ROCHA ja usa logo acima: uma segunda leitura
       * com o corte deslocado de meia volta. Os dois nunca saltam no mesmo pixel, e o MENOR dos
       * dois e sempre a derivada verdadeira — o salto so sabe inflar. Feito assim, e nao pela
       * derivada analitica do angulo, porque q.x tambem carrega o cisalhamento (twist varia com
       * o raio): a forma fechada teria de reproduzir esse termo tambem, e duplicar a conta e
       * exatamente como as duas se desencontram depois.
       */
      float angAlt = ang + (ang < 0.0 ? TAU * 0.5 : -TAU * 0.5);
      float qxAlt = wakeCoords(angAlt + twist * TAU, r).x;
      float w = max(min(fwidth(q.x), fwidth(qxAlt)), fwidth(q.y));
      grainFar = max(1.0 + 0.5 * fbmWake(q, CELLS, w), 0.0);
    }

    density *= mix(grainFar, rough, uNear) * wakeAsymmetry(ang);
    float lit = exp(-SHADE * (slab.g - 0.5));

    /*
     * CAMINHO OBLIQUO — o "tilt effect" medido em Saturno. De perfil a linha de visada
     * atravessa muito mais laje, entao a profundidade optica efetiva e tau/mu: as faixas finas
     * clareiam e as densas SATURAM. O perfil achata sozinho no tombo raso, e essa e a
     * assinatura que separa uma laje de uma pintura.
     */
    /*
     * ⚠️ ESTA LEI NASCEU AQUI e agora mora em optical-depth.js — o anel foi o primeiro objeto
     * desta cena a ter profundidade óptica, e a fórmula ficou trancada dentro dele por meses
     * enquanto o disco do quasar e o da galáxia continuavam chapados. O usuário pediu "o mesmo
     * efeito de densidade e profundidade" para todos, e o certo não era copiá-la duas vezes: era
     * tirá-la daqui. Comportamento IDÊNTICO — mesma exponencial, mesmo piso de 0,05.
     */
    float seen = saidaDaLaje(DEPTH * density, uCosView, ${glslFloat(ASPECT_FOLHA)});

    float intensity = (seen * lit + sparkle * uNear) * phaseTerm(p.y) * uOpacity;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

/** Hash determinístico: o mesmo nó recebe sempre a mesma inclinação, em qualquer sessão. */
function jitter(index, salt) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createRings() {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(2, 2);
  // Uma textura de perfil por família, compartilhada por todos os anéis dela. Construídas sob
  // demanda: uma árvore sem `staged` nunca paga o perfil de Urano.
  const profiles = new Map();
  /*
   * A rocha é UMA textura, compartilhada por todos os anéis, e nasce só quando algum deles
   * chega perto o bastante para usá-la. São 256 KB e ~40ms de construção: pagar isso no boot,
   * numa cena em que talvez ninguém se aproxime de astro nenhum, seria custo por hipótese.
   */
  let rock = null;
  // Pool: os anéis são reatribuídos a cada leitura do `git status` (a cada 15s). Criar e
  // destruir malha e material nesse ritmo é lixo garantido para o coletor.
  const pool = [];
  const active = [];

  function profileFor(family) {
    if (!profiles.has(family)) profiles.set(family, profileTexture(family));
    return profiles.get(family);
  }

  function grow(size) {
    while (pool.length < size) {
      const mesh = new THREE.Mesh(
        geometry,
        // Material por anel: cor, perfil E opacidade variam por anel (a opacidade acompanha a
        // janela temporal, então dois anéis da mesma família divergem nela).
        new THREE.ShaderMaterial({
          uniforms: {
            uProfile: { value: null },
            uColor: { value: new THREE.Color(DIRTY_COLORS.modified) },
            uOpacity: { value: 0 },
            uForward: { value: 0 },
            uRadial: { value: new THREE.Vector2(1, 0) },
            uNear: { value: 0 },
            uRock: { value: null },
            uPhase: { value: 0 },
            uCosTilt: { value: Math.cos(TILT) },
            uCosView: { value: Math.cos(TILT) },
            uLimb: { value: 1 / SPAN_CAP },
          },
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
      );
      mesh.renderOrder = ORDER_SCATTER;
      mesh.visible = false;

      // O passe de extinção compartilha geometria e uniformes de forma; o que muda é o
      // blending e o fato de ele escurecer em vez de somar.
      const shade = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: {
            uProfile: { value: null },
            uOpacity: { value: 0 },
            uCosTilt: { value: Math.cos(TILT) },
            uLimb: { value: 1 / SPAN_CAP },
            uRadial: { value: new THREE.Vector2(1, 0) },
            uDepth: { value: OPTICAL_DEPTH },
          },
          vertexShader: VERTEX,
          fragmentShader: EXTINCTION_FRAGMENT,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendSrc: THREE.ZeroFactor,
          blendDst: THREE.OneMinusSrcColorFactor,
        })
      );
      shade.renderOrder = ORDER_EXTINCTION;
      shade.visible = false;
      mesh.userData.shade = shade;

      group.add(mesh, shade);
      pool.push(mesh);
    }
  }

  return {
    group,

    /**
     * Define quais estrelas ganham anel.
     *
     * `entries`: `[{ index, size, state, recency }]`, onde `index` é a posição do nó no buffer
     * de posições do grafo — é por ele que `follow` acompanha a órbita sem procurar nada.
     *
     * Devolve `{ shown, dropped }`.
     */
    set(entries) {
      const kept = entries.length > maxRings ? entries.slice(0, maxRings) : entries;
      grow(kept.length);

      active.length = 0;
      kept.forEach((entry, slot) => {
        const mesh = pool[slot];
        // DISCO DE DETRITOS é outra família, não outro módulo: os dois são material em órbita e
        // o que muda é o PERFIL — cavidade dominante e cinturão estreito de um lado, faixas
        // coladas no corpo do outro. Quem decide qual é o `solver.js`, por CORPO.
        const family = entry.detritos
          ? 'debris'
          : familyOf(entry.state);
        const profile = profileFor(family);

        mesh.visible = true;
        mesh.userData.shade.visible = true;
        mesh.userData.shade.material.uniforms.uProfile.value = profile.texture;
        mesh.material.uniforms.uProfile.value = profile.texture;
        mesh.material.uniforms.uForward.value = profile.forward;
        // d_perfil = (d·span − 1)/(span − 1): descarta a região dentro do limbo.
        const span = Math.min(profile.reach, SPAN_CAP);
        const radial = [span / (span - 1), -1 / (span - 1)];
        mesh.material.uniforms.uRadial.value.set(...radial);
        mesh.userData.shade.material.uniforms.uRadial.value.set(...radial);
        mesh.material.uniforms.uLimb.value = 1 / span;
        mesh.userData.shade.material.uniforms.uLimb.value = 1 / span;
        mesh.material.uniforms.uColor.value.setHex(
          DIRTY_COLORS[entry.state] ?? DIRTY_COLORS.modified
        );

        active.push({
          mesh,
          index: entry.index,
          recency: entry.recency,
          // Informativo: é a `reach` REAL da família, que a bancada mostra. A extensão que
          // vai à tela é `span` — as duas divergem só quando o teto corta (Júpiter).
          reach: profile.reach,
          // O sistema se estende por tantos raios do astro; o limbo cai em 1/span do quad, que
          // é EXATAMENTE onde `uRadial` faz o perfil começar. Os dois têm de sair do mesmo
          // número — foi a divergência entre eles que cortou o anel ao meio.
          span: Math.min(profile.reach, SPAN_CAP),
          tilt: TILT + (jitter(entry.index, 1) - 0.5) * TILT_SPREAD,
          /*
           * INCLINAÇÃO DE MUNDO, e ela é outra grandeza que o `tilt` — ver `RING_FAMILIES`.
           *
           * `tilt` achata a elipse NA TELA (billboard); esta tomba o disco a partir do plano
           * orbital, que é o que a obliquidade do planeta faz com o anel equatorial dele. A
           * dispersão continua porque planetas reais não combinaram inclinação entre si, e agora
           * ela é um desvio em torno de um valor MEDIDO em vez de em torno de um chute.
           */
          obliquity: profile.obliquity + (jitter(entry.index, 1) - 0.5) * TILT_SPREAD,
          roll: (jitter(entry.index, 2) - 0.5) * ROLL_SPREAD,
        });
      });
      for (let i = kept.length; i < pool.length; i++) {
        pool[i].visible = false;
        pool[i].userData.shade.visible = false;
      }

      return { shown: kept.length, dropped: entries.length - kept.length };
    },

    /**
     * Cola cada anel na estrela dele, neste quadro.
     *
     * `dimOf(recency)` é a MESMA atenuação da janela temporal que o shader das estrelas
     * aplica. Sem ela, arrastar o scrubber para um período antigo apagaria a estrela e
     * deixaria o anel aceso em volta do nada.
     */
    /**
     * @param {number} [elapsed]  relógio da cena, em segundos. É o que faz o anel GIRAR — sem
     *   ele a rocha fica colada e o objeto lê como textura pintada num prato parado.
     * @param {number} [tiltOverride]  tombo fixo, para a BANCADA varrer o ângulo. Na cena o
     *   tombo é por nó (dispersão determinística) e este parâmetro não é passado.
     */
    follow(positions, camera, dimOf, radiusOf, elapsed = 0, tiltOverride, focusedIndex = -1) {
      for (const ring of active) {
        const offset = ring.index * 3;
        ring.mesh.position.set(positions[offset], positions[offset + 1], positions[offset + 2]);
        const tilt = tiltOverride ?? ring.tilt;
        /*
         * ANEL DE MUNDO para o astro EM FOCO; billboard para todo o resto.
         *
         * O billboard existe por um bom motivo: de longe o corpo é um sprite de poucos pixels e o
         * anel é SINAL ("este arquivo está sujo"). Um anel de mundo visto de perfil desaparece —
         * é o que Saturno faz de verdade, e aqui apagaria a informação sem nada ter mudado no
         * arquivo. Encarando a câmera, ele nunca some.
         *
         * ⚠️ Só que billboard NÃO PASSA NA FRENTE. Ele é um plano sem espessura no centro do
         * corpo: tudo que cai dentro da silhueta da esfera é ocluído, então a metade próxima do
         * anel nunca cruza o planeta — e é exatamente isso que toda foto de Saturno mostra. O
         * defeito só aparece quando o corpo deixa de ser sprite e vira esfera, ou seja, em foco.
         * Reportado como "os anéis estão mal posicionados, deixando uma vista feia".
         *
         * Em foco, então, o quad passa a viver no MUNDO: deitado no plano orbital (o `-π/2` põe o
         * plano XY na horizontal) e tombado pela OBLIQUIDADE. Aí a profundidade resolve sozinha o
         * que estava faltando — arco de trás atrás, arco da frente na frente.
         *
         * ⚠️ **Aqui não entra `tilt`, e entrar foi o defeito.** `tilt` é o achatamento da elipse na
         * TELA, calibrado para o billboard; somado ao `-π/2` ele vira ângulo a partir do plano
         * orbital, e 1,1 rad põe todo anel a **63° de obliquidade** — quase Urano, com as
         * referências pedindo Saturno. Daí a queixa de que o anel saía diagonal. A grandeza certa
         * é por família e está medida em `RING_FAMILIES` (Saturno 26,7°, Júpiter 3,1°, Urano 97,8°).
         *
         * `tiltOverride` continua valendo: é a bancada varrendo o ângulo, e ali o número é a
         * variável do experimento, não a pose do corpo.
         */
        if (ring.index === focusedIndex) {
          ring.mesh.rotation.set(-Math.PI / 2 + (tiltOverride ?? ring.obliquity), ring.roll, 0);
          // Sem achatamento no shader: a elipse na tela agora é a PROJEÇÃO de um disco de verdade.
          // Achatar de novo aplicaria o tombo duas vezes.
          ring.mesh.material.uniforms.uCosTilt.value = 1;
          /*
           * ⚠️ MAS a profundidade óptica precisa do ângulo DE VERDADE — e é aqui que o foco
           * ganha o que ele existe para dar: orbitar em volta do corpo revela a forma.
           *
           * A normal do disco é +Z local levado pela orientação da malha; o cosseno com a
           * direção à câmera é o `cos(i)` da lei `tau/cos(i)`. Em módulo porque as duas faces
           * valem — o anel é uma laje, não uma superfície orientada.
           *
           * Enquanto isto herdava o `1` da linha acima, o anel em foco tinha ganho de densidade
           * CONSTANTE: de perfil ele deveria saturar e ficar espesso, e continuava com o mesmo
           * peso de quando visto de frente.
           */
          NORMAL.set(0, 0, 1).applyQuaternion(ring.mesh.quaternion);
          TO_CAMERA.copy(camera.position).sub(ring.mesh.position).normalize();
          ring.mesh.material.uniforms.uCosView.value = Math.abs(NORMAL.dot(TO_CAMERA));
        } else {
          // Ordem importa: `roll` gira em torno do eixo de visão (inclina o eixo maior da elipse
          // na tela) e `tilt` tomba em torno do eixo X já rolado. Invertido, o rolamento passaria
          // a girar o anel dentro do próprio plano — onde ele é simétrico e nada mudaria.
          ring.mesh.quaternion.copy(camera.quaternion);
          ring.mesh.rotateZ(ring.roll);
          ring.mesh.rotateX(tilt);
          // O achatamento na tela depende do tombo DESTE anel, que tem dispersão por nó.
          ring.mesh.material.uniforms.uCosTilt.value = Math.cos(tilt);
          // No billboard os dois COINCIDEM: o quad encara a câmera, então o único ângulo que
          // existe entre o disco e o olho é o próprio tombo. Não há o que orbitar aqui — e é
          // por isso que o volume só se inspeciona em foco.
          ring.mesh.material.uniforms.uCosView.value = Math.cos(tilt);
        }
        // O passe de extinção acompanha posição, orientação e escala do anel — é o MESMO anel,
        // desenhado duas vezes com blendings opostos.
        const shade = ring.mesh.userData.shade;
        // Raio do sprite da estrela AGORA — já com ignição, spread, fov e resolução — vezes o
        // rodapé. É o que mantém o anel colado ao astro em qualquer ajuste do painel e em qualquer
        // monitor. Sem o teto de `gl_PointSize`: ele é verdade sobre o ponto que a GPU desenha e
        // mentira sobre o corpo, e foi por herdá-lo que o anel já descolou. Ver `graph.js`.
        //
        // ⚠️ ANTES do bloco da extinção: ela COPIA esta escala, e na ordem anterior copiava a
        // do quadro PASSADO. Ficava um quadro atrás em toda mudança de tamanho — invisível com
        // a cena parada, e um descolamento durante o pulso de ignição, que é justamente quando
        // o anel mais muda de tamanho.
        const size = radiusOf(ring.index);
        ring.mesh.scale.setScalar(size.world * VISIBLE_CORE * ring.span);
        ring.mesh.material.uniforms.uOpacity.value = OPACITY * dimOf(ring.recency);

        /*
         * NÍVEL DE DETALHE por tamanho na TELA, com transição contínua.
         *
         * De longe o anel é uma LAJE com perfil e auto-sombra radial — o que sobrevive a 20px
         * é contraste entre faixas, não textura. De perto entra a ROCHA, textura polar filtrada
         * pelo hardware, que é a única defesa correta contra minificação de ~40:1. É o que a
         * indústria faz: acima de certa distância todo mundo volta para o anel 2D com perfil.
         *
         * A troca DURA é o defeito conhecido da técnica — o olho pega o instante em que o
         * material muda. A faixa é larga e o shader mistura dentro dela: vê-se o detalhe
         * ENTRAR, não trocar.
         *
         * O gatilho é PIXEL, não distância de mundo: um astro grande e longe ocupa mais tela
         * que um pequeno e perto, e quem decide se vale carregar rocha é a tela.
         */
        const near = smoothstep(LOD_FAR_PX, LOD_NEAR_PX, size.px);
        ring.mesh.material.uniforms.uNear.value = near;
        // Fase da rotação. `ring.roll` entra como defasagem para que dois anéis vizinhos não
        // girem em sincronia — o mesmo motivo da dispersão do tombo.
        // ⚠️ TAXA ÚNICA, e tem de continuar sendo. O cisalhamento kepleriano mora CONGELADO no
        // shader (`SHEAR_TURNS`); multiplicar esta fase por qualquer função do raio — que é o que
        // o shader fazia até 2026-08-06 — enrola o padrão sem limite. Ver a nota em `shear()`.
        ring.mesh.material.uniforms.uPhase.value = elapsed * SPIN + ring.roll;
        if (near > 0.001 && !rock) rock = rockTexture();
        if (rock) ring.mesh.material.uniforms.uRock.value = rock;

        shade.position.copy(ring.mesh.position);
        shade.quaternion.copy(ring.mesh.quaternion);
        shade.scale.copy(ring.mesh.scale);
        shade.material.uniforms.uCosTilt.value = ring.index === focusedIndex ? 1 : Math.cos(tilt);
        shade.material.uniforms.uOpacity.value = ring.mesh.material.uniforms.uOpacity.value;
      }
    },

    /** Teto de anéis — quem decide é o perfil de qualidade. */
    setMaxRings(value) {
      maxRings = Math.max(1, Math.round(value));
    },

    count: () => active.length,

    dispose() {
      active.length = 0;
      for (const mesh of pool) {
        group.remove(mesh, mesh.userData.shade);
        mesh.material.dispose();
        mesh.userData.shade.material.dispose();
      }
      pool.length = 0;
      for (const profile of profiles.values()) profile.texture.dispose();
      profiles.clear();
      geometry.dispose();
    },
  };
}
