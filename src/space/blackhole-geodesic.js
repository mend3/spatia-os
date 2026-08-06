/**
 * GEODÉSICA — o bloco GLSL que traça o raio de luz e desenha o disco onde ele cruza.
 *
 * ## Por que ele existe, e o que ele aposenta
 *
 * O buraco negro era montado em GEOMETRIA: uma esfera opaca para a sombra, um anel de cinco fatias
 * para o disco, e um passe de tela (`lensing.js`) que empurrava a imagem radialmente para fingir a
 * lente. O usuário fotografou o resultado e o diagnóstico dele foi exato — *"as camadas nunca se
 * encontram"*. Elas não se encontravam por duas razões medidas:
 *
 * 1. **O lado de trás do disco não subia por cima da sombra.** Um disco plano visto de perfil
 *    projeta o lado distante sobre a MESMA faixa fina do lado próximo, e ali ele era ocluído pela
 *    esfera opaca. O cabeçalho do `blackhole.js` afirmava que a projeção resolvia isso sozinha; não
 *    resolve, e essa frase esteve errada por três versões.
 * 2. **O anel de fótons era desenhado dentro do preto.** `lensing.js` calculava o raio aparente a
 *    partir de `HORIZON_RADIUS` cru (3,0) enquanto o objeto na cena está multiplicado por
 *    `coreScale` (2,05) — 6,15 de mundo. MEDIDO: o anel caía a **0,69 do raio da esfera opaca**, e
 *    a rampa que suaviza a borda da sombra caía inteira dentro dela. Daí a borda dura e a ausência
 *    total do aro brilhante que é a feição mais reconhecível da referência.
 *
 * Nenhuma das duas se conserta com afinação, porque nenhuma é um número errado: as duas são a
 * consequência de fingir a lente em espaço de tela. Um deslocamento radial da imagem não sabe
 * trazer para a frente uma luz que está atrás de uma malha opaca, e não sabe produzir imagem
 * múltipla. **Traçar o raio sabe as duas coisas de graça.**
 *
 * ## O que se ganha, e nada disso é desenhado explicitamente
 *
 * | feição | de onde ela nasce |
 * |---|---|
 * | o arco do lado distante por cima da sombra | o raio que passa por cima é defletido e cruza o plano do disco ATRÁS do buraco |
 * | o arco por baixo | o mesmo, pelo outro lado |
 * | o anel de fótons fino e brilhante | raios quase capturados dão muitas voltas e cruzam o disco várias vezes |
 * | a sombra com borda macia | a fração de raios capturados cresce continuamente perto do parâmetro de impacto crítico |
 * | as estrelas escorregando em volta | a direção final do raio é reamostrada no fundo já renderizado |
 *
 * As camadas se encontram porque **são o mesmo raio**, não três desenhos que precisam concordar.
 *
 * ## As fontes, e o que foi tirado de cada uma
 *
 * Lidas em disco (`~/.opensrc`/clone local), não de memória, que é a regra deste projeto:
 *
 * - **`vlwkaos/threejs-blackhole`** (ISC) — a integração leapfrog da geodésica nula exata, com o
 *   momento angular conservado: `a = −1,5·h²·p/|p|⁵`, `h² = |p × v|²`. É a forma que este arquivo
 *   usa, porque ela é a equação certa e não custa mais que a aproximação.
 * - **`dgreenheck/webgpu-black-hole`** (MIT) — a estrutura do laço prático: 64 passos, corte por
 *   captura/escape, interseção do disco por TROCA DE SINAL em y com interpolação linear até o
 *   cruzamento, e composição front-to-back por alfa. É o que torna o custo viável em tempo real.
 *
 * O que NÃO veio de lá: as duas desenham o fundo (estrelas, nebulosa) dentro do próprio shader,
 * porque são cenas em que o buraco negro é tudo. Aqui ele divide a tela com 579 corpos, 71
 * galáxias e os vínculos — então o raio que escapa **reamostra a imagem já renderizada** em vez de
 * inventar um céu. É a adaptação central, e é ela que faz o efeito conviver com a cena.
 *
 * ## ⚠️ O que este passe NÃO sabe: PROFUNDIDADE
 *
 * Ele roda depois da cena, sobre a cor, e não lê o depth buffer. Um corpo que passe exatamente na
 * frente da sombra é sobredesenhado pelo preto em vez de tapá-la. A esfera opaca do `blackhole.js`
 * continua existindo justamente por isso — ela escreve profundidade e resolve a oclusão dos corpos
 * ATRÁS. O caso que sobra (corpo bem na linha de visada, na frente) é raro nesta cena: a casca do
 * grafo começa em r ≈ 91 e a sombra tem ~6 de raio na origem. Fica registrado como limite conhecido,
 * não como coisa que não se notou.
 */

/** Passos do laço. Limite de laço em GLSL precisa ser constante — ele é interpolado como literal. */
export const GEODESIC_STEPS = 64;

/**
 * O bloco GLSL. Expõe `vec4 tracarGeodesica(vec3 origem, vec3 direcao, out vec3 dirFinal)`.
 *
 * Devolve `vec4(cor, alfa)` do que o RAIO encontrou (disco + captura) e escreve em `dirFinal` a
 * direção com que ele saiu — é ela que reamostra o fundo. Alfa 1 significa "não passa luz do
 * fundo": ou o raio caiu no horizonte, ou o disco ficou opticamente espesso na frente dele.
 */
export const GLSL_GEODESIC = /* glsl */ `
  uniform vec3 uBhPos;        // centro do buraco negro, em MUNDO
  uniform float uRs;          // raio de Schwarzschild, em MUNDO
  uniform float uDiskInner;
  uniform float uDiskOuter;
  uniform float uDiskSpin;
  uniform float uDiskIntensity;
  uniform float uDiskTurbulence;
  uniform float uDiskTime;
  uniform vec3 uHot, uMid, uCool;
  uniform float uErrorMix;
  /*
   * A ESCADA DE DETALHE, e ela e a mesma regra dos outros corpos procedurais desta cena: quanto
   * menor o objeto na tela, menos dele se resolve. planet.js, photosphere.js, pulsar.js e a
   * galaxia todos fazem isso, e o buraco negro era o unico que pagava o preco cheio a qualquer
   * distancia.
   *
   * ⚠️ **A LENTE NAO ENTRA NA ESCADA.** Ela dobra a luz e por isso e percebida de qualquer lugar —
   * e o comportamento que ja existia e nao pode regredir. O que a escada corta e o ORCAMENTO DE
   * PASSOS e o DETALHE DO DISCO, nunca o tracado em si: mesmo no degrau mais baixo o raio continua
   * sendo integrado do inicio ao fim, so que com passos mais longos. Uma sombra ou uma deflexao que
   * sumissem ao afastar seriam a regressao que este comentario existe para impedir.
   *
   *   uSteps      quantos passos o laco pode gastar (o teto do for continua constante, como o GLSL exige)
   *   uStepScale  o passo como fracao do raio — cresce quando ha menos passos, para o raio AINDA
   *               atravessar a esfera de influencia inteira. Sem isso, cortar passos deixaria o raio
   *               parado no meio do caminho e a sombra sumiria de longe.
   *   uDiskDetail 0 = disco sem turbulencia (o fbm e podado); 1 = campo completo
   */
  uniform float uSteps;
  uniform float uStepScale;
  uniform float uDiskDetail;

  /*
   * O RAIO DE INFLUENCIA. Fora dele a deflexao e desprezivel e o disco ja acabou, entao o raio
   * segue reto e o passe nao paga nada — este e o corte que mantem o custo no orcamento.
   *
   * 1,25 x a borda externa do disco: a folga existe para o raio entrar na esfera ANTES de comecar
   * a curvar, senao a integracao comecaria com a deflexao ja acumulada e o arco nasceria torto.
   */
  float raioDeInfluencia(){ return uDiskOuter * 1.25; }

  // Ruido barato, so para o disco ter filamento. Tres oitavas bastam: o alongamento em theta ja
  // faz a leitura de fluxo laminar, e cada oitava aqui e paga por CRUZAMENTO de disco, nao por
  // fragmento — um raio que cruza o plano quatro vezes paga quatro.
  vec2 hash2(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
  }
  float ruido(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)), dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
      mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)), dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x),
      u.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { s += a * ruido(p); p *= 2.17; a *= 0.5; }
    return s;
  }

  /*
   * A EMISSAO DO DISCO no ponto em que o raio o cruzou.
   *
   * hit esta em coordenadas locais do buraco negro, com o disco no plano XZ. dir e a direcao
   * do raio ali — ela entra no Doppler, porque o que desloca a frequencia e a velocidade da fonte
   * PROJETADA na linha de visada.
   */
  vec4 emissaoDoDisco(vec3 hit, vec3 dir){
    float r = length(hit.xz);
    float span = clamp((r - uDiskInner) / (uDiskOuter - uDiskInner), 0.0, 1.0);
    float theta = atan(hit.z, hit.x);

    /*
     * ROTACAO DIFERENCIAL, e o padrao NAO PODE ENROLAR SEM FIM.
     *
     * Esta e a terceira vez que o enrolamento de Lin-Shu aparece neste projeto — matou o campo de
     * arestas, e o disco ja o repetiu uma vez porque nunca passou pelo catalogo de movimento. Duas
     * copias do campo defasadas de meio ciclo, misturadas por peso triangular: cada uma vive meio
     * ciclo e a troca acontece onde a que sai vale zero, entao o cisalhamento e limitado por
     * construcao em vez de crescer com o relogio.
     */
    float keplerian = pow(max(r / uDiskInner, 0.35), -1.5);
    float giro = theta + uDiskTime * uDiskSpin * 6.0;
    float taxa = (keplerian - 1.0) * uDiskSpin * 6.0 * 0.18;
    float fase = fract(uDiskTime / 2.8);
    float peso = abs(fase * 2.0 - 1.0);
    float localA = (fase - 0.5) * 2.8;
    float localB = (fract(uDiskTime / 2.8 + 0.5) - 0.5) * 2.8;
    float radial = span * 9.0 - uDiskTime * uDiskSpin * 0.35;
    /*
     * ⚠️ O DEGRAU BAIXO PODA AS DUAS CHAMADAS DE fbm, e essa e a economia que importa.
     *
     * O filamento e a unica coisa cara aqui: duas amostras de tres oitavas, pagas por CRUZAMENTO de
     * disco — e um raio perto do anel de fotons cruza o plano quatro ou cinco vezes. Com
     * uDiskDetail em 0 o compilador poda os dois ramos e o disco fica liso, que e exatamente o que
     * ele parece quando tem 20 px de raio na tela: nao ha filamento resolvivel ali para desenhar.
     *
     * A constante 0,72 e a MEDIA do campo, entao o brilho medio do disco nao muda ao trocar de
     * degrau — o disco nao pisca quando a camera cruza o limiar, que era o risco real da mudanca.
     * E o mesmo truque do uCheap das fatias do disco antigo.
     */
    float estria = 0.72;
    if (uDiskDetail > 0.01) {
      float estriaA = fbm(vec2((giro + taxa * localA) * 2.4, radial) * vec2(1.0, 2.6)) * 0.5 + 0.5;
      float estriaB = fbm(vec2((giro + taxa * localB) * 2.4, radial) * vec2(1.0, 2.6)) * 0.5 + 0.5;
      estria = mix(0.72, mix(estriaA, estriaB, peso), uDiskDetail);
    }
    estria = pow(estria, mix(1.4, 3.2, uDiskTurbulence * 0.35));

    // Rampa de temperatura de Shakura-Sunyaev: T proporcional a r^(-3/4). O que muda com o raio e
    // o MATIZ, nao so a luminancia — e por isso que a rampa e de cor e nao de brilho.
    float temperatura = pow(1.0 - span, 3.4);
    vec3 cor = mix(uCool, uMid, smoothstep(0.0, 0.55, temperatura));
    cor = mix(cor, uHot, smoothstep(0.5, 1.0, temperatura));
    cor = mix(cor, vec3(0.95, 0.28, 0.22), uErrorMix * 0.7);

    // Bordas macias nas duas pontas: sem elas o anel tem contorno geometrico visivel.
    float borda = smoothstep(0.0, 0.02, span) * (1.0 - smoothstep(0.55, 1.0, span));

    /*
     * Fluxo proporcional a r^(-3), com a curva de EXIBICAO que o disco antigo ja carregava e pelo
     * mesmo motivo: o fluxo cru varre tres ordens de grandeza entre as bordas e a tela tem uns
     * dois stops uteis antes do ACES saturar. pow(., 0.4) preserva a ORDEM e comprime a faixa. E
     * mapeamento de tela, nao constante do modelo.
     */
    float fluxo = pow(max(r / uDiskInner, 1.0), -3.0);
    float brilho = borda * estria * pow(fluxo, 0.4) * uDiskIntensity * 1.8;

    /*
     * BEAMING RELATIVISTICO, e agora ele e de verdade.
     *
     * A versao em geometria ancorava o crescente no azimute da CAMERA porque o disco era um anel
     * chapado e nao havia raio nenhum para projetar. Aqui existe: a velocidade orbital e um vetor,
     * a direcao do raio e outro, e o fator Doppler sai do produto escalar dos dois. O lado que se
     * aproxima fica permanentemente mais claro, sem ninguem escolher qual e — e e essa assimetria
     * fixa que produz o crescente das imagens do EHT.
     *
     * v = sqrt(rs / 2r) e a velocidade circular em unidades de c. A intensidade vai com delta^3
     * (caso continuo), o mesmo expoente que o resto desta cena ja usa.
     */
    vec3 vel = normalize(cross(vec3(0.0, 1.0, 0.0), hit)) * sqrt(uRs / max(2.0 * r, 1e-4));
    float gama = 1.0 / sqrt(max(1.0 - dot(vel, vel), 1e-4));
    float delta = 1.0 / max(gama * (1.0 - dot(normalize(dir), vel)), 1e-3);
    brilho *= pow(clamp(delta, 0.05, 6.0), 3.0);

    float alfa = clamp(brilho * 0.85, 0.0, 1.0);
    return vec4(cor * brilho, alfa);
  }

  /*
   * O TRACADO. Leapfrog sobre a geodesica nula de Schwarzschild.
   *
   * 'h2 = |p x v|^2' e o momento angular especifico, e ele e CONSTANTE ao longo da geodesica —
   * calculado uma vez, na entrada. A aceleracao a = -1,5 h^2 p / |p|^5 e a forma cartesiana exata
   * da equacao de Binet para luz; ela nao custa mais que a aproximacao de campo fraco e nao erra a
   * deflexao perto do horizonte, que e exatamente onde a imagem interessante acontece.
   *
   * ⚠️ A velocidade NAO e renormalizada no laco. Nestas coordenadas o modulo dela se conserva
   * sozinho para um raio de luz, e forcar normalize() a cada passo introduz um erro sistematico
   * que fecha as orbitas cedo demais — o anel de fotons sai fino demais e no raio errado.
   */
  vec4 tracarGeodesica(vec3 origem, vec3 direcao, out vec3 dirFinal){
    dirFinal = direcao;
    vec3 p = origem - uBhPos;
    float R = raioDeInfluencia();

    // Onde o raio entra na esfera de influencia. Sem acerto, ele nao passa nem perto: sai reto e o
    // fragmento inteiro custa estas cinco linhas.
    float b = dot(p, direcao);
    float c = dot(p, p) - R * R;
    float delta = b * b - c;
    float entrada = -b - sqrt(max(delta, 0.0));

    /*
     * ⚠️ QUEM NAO ENTRA NA ESFERA AINDA E DEFLETIDO — e a primeira versao devolvia zero aqui.
     *
     * Isso punha um CORTE DURO na lente: fora da esfera de influencia a imagem ficava intocada, e a
     * distorcao suave que cobria a tela inteira desaparecia. O usuario notou na hora, e estava
     * certo: a versao anterior (deflexao analitica em espaco de tela) distorcia de qualquer lugar,
     * porque e isso que uma lente gravitacional faz — ela nao tem borda.
     *
     * A correcao nao e alargar a esfera (custaria marcha em toda a tela). E usar a deflexao de
     * CAMPO FRACO, que e exata justamente onde a marcha nao vale a pena: alfa = 2 R_s / b, com b
     * o parametro de impacto. Uma raiz quadrada e uma divisao, sem laco nenhum.
     *
     * ⚠️ ESTE COMENTARIO AFIRMAVA que os dois regimes "CASAM na fronteira, la b e grande e alfa e
     * minusculo, entao nao ha degrau" — e era FALSO. Em b = R este ramo entrega 73 px de deflexao e
     * a marcha entregava 2: o degrau de 71 px era a "segunda lente" que o usuario fotografou. Quem
     * casa os dois agora e a CAUDA, no fim de tracarGeodesica. Alfa aqui nunca foi minusculo na
     * fronteira; ele vale a deflexao inteira, porque e exatamente ali que ela toda acontece fora.
     */
    if (delta <= 0.0 || (entrada < 0.0 && c > 0.0)) {
      float ateOMaisPerto = -dot(p, direcao);
      if (ateOMaisPerto > 0.0) {
        vec3 perp = p + direcao * ateOMaisPerto;
        float impacto = length(perp);
        if (impacto > 1e-4) {
          /*
           * ⚠️ AQUI HAVIA UM ENVELOPE, e ele foi REMOVIDO pela REGRA DA FISICA.
           *
           * Eu multiplicava alfa por um smoothstep que zerava a deflexao alem de 3 R, para matar o
           * que o usuario descreveu como "uma segunda lente maior". Media que motivou: com a sombra
           * em 121 px, a deflexao ainda valia 20 px em b = 100 e 5 px em b = 400 — o ceu inteiro
           * entortava.
           *
           * O numero estava certo e a conclusao estava errada. alfa = 2 R_s / b e a deflexao de
           * Einstein: uma massa com este R_s (2,37, contra um grafo que orbita entre 91 e 217)
           * DISTORCE mesmo o ceu inteiro. O incomodo e de composicao, e composicao nao mexe na
           * simulacao — a camera escolhe de onde observar, o pos-processamento escolhe como
           * apresentar, e a fisica fica.
           *
           * Se a distorcao de fundo voltar a incomodar, o conserto e na LINGUAGEM VISUAL (dar pesos
           * diferentes a massa e a imagem deformada, para o olho parar de ler a deformacao como um
           * segundo objeto) ou na camera. Nao aqui.
           */
          // O raio dobra PARA DENTRO, na direcao do centro — dai o sinal negativo.
          dirFinal = normalize(direcao - (perp / impacto) * (2.0 * uRs / impacto));
        }
      }
      return vec4(0.0);
    }
    p += direcao * max(entrada, 0.0);

    vec3 v = direcao;
    vec3 momento = cross(p, v);
    float h2 = dot(momento, momento);

    /*
     * ⚠️ A CAPTURA E ANALITICA, e nao um teste passo a passo — e essa foi a correcao que tirou a
     * sombra FACETADA do degrau baixo do LOD.
     *
     * Testando r < R_s a cada passo, a sombra depende de quao fino e o passo: com o orcamento
     * reduzido (18 passos, passo de 0,28 r) o raio PULA POR CIMA do horizonte e sai do outro lado
     * sem nunca registrar captura. O resultado na tela era uma cunha de bordas retas em vez de um
     * disco, e ela mudava de forma conforme a camera se afastava — exatamente a regressao que o
     * pedido proibe.
     *
     * Mas nao e preciso marchar para saber: para uma geodesica NULA a captura depende so do
     * parametro de impacto, e ele e conservado. b = |p x v| com |v| = 1 no infinito, e a luz cai
     * se e somente se b < sqrt(27)/2 · R_s — que e, por definicao, o raio da SOMBRA. Uma linha, e
     * o resultado e:
     *
     *   - uma silhueta CIRCULAR exata, como um buraco negro de Schwarzschild tem sempre;
     *   - independente do orcamento de passos, entao a sombra e a mesma nos cinco degraus;
     *   - de graga: h2 ja era calculado para a integracao.
     *
     * A marcha continua acontecendo, e continua sendo necessaria — ela e quem desenha o DISCO, e um
     * raio capturado pode muito bem atravessar o disco na frente do buraco antes de cair.
     */
    float bCrit = 2.598076 * uRs;
    bool capturado = h2 < bCrit * bCrit;

    vec3 cor = vec3(0.0);
    float alfa = 0.0;

    for (int i = 0; i < ${GEODESIC_STEPS}; i++) {
      float r2 = dot(p, p);
      float r = sqrt(r2);
      // Caiu no horizonte: nada sai dali. O alfa vai a 1 e o fundo e apagado — e essa a SOMBRA, e
      // a borda dela e macia sozinha, porque raios vizinhos escapam por muito pouco.
      if (r < uRs) break;
      // Escapou da esfera de influencia: para de integrar e entrega a direcao de saida.
      if (r > R && i > 0) break;
      if (alfa > 0.99) break;
      // O ORCAMENTO DA ESCADA. O teto do for continua constante (o GLSL exige), e quem manda no
      // custo real e este corte — com o passo crescendo junto (uStepScale), menos passos ainda
      // atravessam a esfera de influencia inteira, so que mais grosso.
      if (float(i) >= uSteps) break;

      /*
       * ⚠️ O PASSO E ADAPTATIVO, e a primeira versao usou passo FIXO — o defeito mais caro deste
       * arquivo, e ele foi MEDIDO em vez de deduzido da imagem.
       *
       * Com passo uniforme sobre a esfera de influencia, 2R/64 dava **3,12 unidades de mundo, ou
       * 1,32 raios de Schwarzschild**. O integrador atravessava a regiao de campo forte INTEIRA num
       * passo so: sem resolver a esfera de fotons (1,5 rs), nao ha anel, nao ha imagem de ordem
       * superior, e a sombra sai com a forma errada. Era exatamente o que a tela mostrava.
       *
       * A causa e uma diferenca de escala em relacao as referencias, nao um numero mal escolhido:
       * la o disco vai a 6 rs, aqui ele vai a 34 rs. Uma malha uniforme fina o bastante para o
       * horizonte gastaria centenas de passos atravessando o disco externo, onde o raio e reto.
       *
       * passo proporcional a r e a malha certa para um campo que cai com potencia: passos curtos
       * onde a trajetoria curva, longos onde ela e reta. O piso em rs * 0,06 protege o horizonte
       * e o teto impede que um raio distante pule o disco inteiro entre duas amostras.
       */
      float passo = min(r * uStepScale, R * 0.08);

      vec3 anterior = p;
      /*
       * ⚠️ O uRs NA ACELERACAO NAO E DECORACAO — sem ele o integrador descreve OUTRO buraco negro.
       *
       * A equacao de orbita desta forca e u'' + u = 1.5 · massa · u², e a de Schwarzschild para
       * luz e u'' + u = 1.5 · R_s · u². Sem o fator, a massa efetiva vale 1 UNIDADE DE MUNDO — e o
       * resto do arquivo trabalha com uRs = 2,37. Os dois moravam no mesmo if: o teste de
       * captura (b < sqrt(27)/2 · uRs) pintava a sombra de um buraco negro e a marcha entortava a
       * luz do outro, 2,4x mais fraco.
       *
       * Consequencia medida, com a camera a 150: em b = 0,8 R a deflexao dava 33px onde a mesma
       * massa exige 80px. E o raio critico da dinamica (2,598 unidades) caia DENTRO da sombra
       * analitica (6,15), entao a esfera de fotons e as imagens de ordem superior nasciam num lugar
       * que ja estava pintado de preto — nunca podiam aparecer.
       *
       * A referencia (vlwkaos/threejs-blackhole) escreve sem o fator porque LA R_s = 1. Aqui o
       * mundo tem outra escala, e foi a adaptacao que ficou pelo caminho.
       */
      // Leapfrog: acelera, depois anda. A ordem importa — andar antes de acelerar defasa a
      // integracao em meio passo e desloca visivelmente o anel de fotons.
      v += (-1.5 * h2 * uRs * p / (r2 * r2 * r)) * passo;
      p += v * passo;

      /*
       * O DISCO E UM PLANO, entao o raio o cruza quando y TROCA DE SINAL. E dessa linha que saem
       * todas as imagens de ordem superior: um raio que da a volta cruza o plano de novo, e de
       * novo, e cada cruzamento e uma imagem do disco somada por cima.
       *
       * ⚠️ AQUI HOUVE UMA LAJE COM ESPESSURA, e ela foi REVERTIDA. O raciocinio e a licao:
       *
       * Eu troquei este teste por acumulacao de emissao ao longo de uma laje gaussiana, para
       * consertar uma COSTURA HORIZONTAL que atravessava a tela. O diagnostico estava errado — a
       * costura era amostragem fora do buffer de cor (ver o clamp de fundoUv em lensing.js), e
       * a laje nao mudou nada nela. O que ela mudou foi o CUSTO, em dois lugares:
       *
       *   1. uma amostra de emissao POR PASSO dentro da laje, em vez de uma por cruzamento;
       *   2. refino do passo dentro dela — que COME O ORCAMENTO. Com 64 passos no total e uma
       *      travessia gastando dez, o raio esgota antes de alcancar o horizonte, e a sombra e a
       *      lente degradam. O usuario relatou queda de fps E de qualidade grafica.
       *
       * Um disco de espessura zero continua sendo fisicamente errado, e o disco de geometria
       * empilhava cinco fatias por isso. Mas a espessura tem de voltar por conta propria, com o
       * orcamento contado ANTES, e nao de carona num conserto que nao consertou.
       */
      if (anterior.y * p.y < 0.0) {
        float t = -anterior.y / (p.y - anterior.y);
        vec3 hit = mix(anterior, p, t);
        float rd = length(hit.xz);
        if (rd > uDiskInner && rd < uDiskOuter) {
          vec4 amostra = emissaoDoDisco(hit, v);
          // Composicao front-to-back: o que ja esta na frente atenua o que vem atras. E o que faz
          // o disco tapar o proprio lado distante quando ele fica espesso.
          float resto = 1.0 - alfa;
          cor += amostra.rgb * resto;
          alfa += resto * amostra.a;
        }
      }
    }

    dirFinal = normalize(v);

    /*
     * ⚠️ A CAUDA: a deflexao que aconteceu FORA da esfera, e sem ela a lente tinha DUAS BORDAS.
     *
     * A marcha comeca na ENTRADA da esfera, com a direcao ainda reta, e para quando o raio sai.
     * Ela so acumula o que curvou LA DENTRO. O ramo de campo fraco, logo acima, entrega a deflexao
     * de Einstein INTEIRA (2 R_s / b, de menos infinito a mais infinito). Os dois nao se
     * encontram — e o comentario daquele ramo afirmava que sim, que "b e grande e alfa e minusculo,
     * entao nao ha degrau". Era falso, e o degrau foi MEDIDO replicando este integrador em JS:
     *
     *   b = 1,00 R (ultimo de dentro) ....  1,9 px de deflexao
     *   b = 1,01 R (primeiro de fora) .... 73,3 px
     *
     * 71 px de salto, num anel a ~300 px do centro na tela. E EXATAMENTE a "segunda lente maior"
     * que o usuario circulou na foto: uma casca onde a imagem volta a ser reta, cercada por uma
     * faixa que continua deslocada — o olho le a borda como um segundo objeto.
     *
     * A correcao nao e envelope nem mistura: e devolver ao raio o que ele perdeu. A fracao da
     * deflexao total que mora DENTRO do raio R tem forma fechada para esta forca (que cai com
     * 1/r⁴, nao com 1/r² — dai a concentracao maior perto do periastro):
     *
     *   dentro(b) = x0 · (3b² + 2x0²) / (2R³),   x0 = sqrt(R² - b²)
     *
     * Conferida contra a integracao numerica desde o infinito: 0,889 previsto contra 0,889 medido
     * em b = 0,7R. Ela vale 1 quando b vira zero (a cauda some, o campo forte fica intacto) e 0
     * quando b encosta em R (a cauda vira a deflexao inteira, que e o que o ramo de fora entrega).
     * Por construcao os dois regimes se encontram, agora de verdade.
     *
     * ⚠️ Isto NAO e a REGRA DA FISICA sendo violada. O envelope removido ANULAVA deflexao real para
     * a cena incomodar menos; esta cauda ADICIONA deflexao que a tecnica tinha perdido. Depois
     * dela, o perfil medido cai monotonico do centro para a borda — 574, 222, 138, 100, 87, 78 |
     * 73, 67, 57, 46, 37 px — sem casca nenhuma.
     */
    float bCauda = sqrt(h2);
    if (bCauda > 1e-4) {
      float x0 = sqrt(max(R * R - h2, 0.0));
      float dentro = min(x0 * (3.0 * h2 + 2.0 * x0 * x0) / (2.0 * R * R * R), 1.0);
      float alfaCauda = (2.0 * uRs / bCauda) * (1.0 - dentro);
      // Mesma construcao do ramo fraco: o vetor do centro ate o ponto mais proximo da reta de
      // saida aponta para FORA, entao subtrai-lo dobra o raio para DENTRO.
      vec3 perpSaida = p + dirFinal * (-dot(p, dirFinal));
      float impSaida = length(perpSaida);
      if (impSaida > 1e-4) {
        dirFinal = normalize(dirFinal - (perpSaida / impSaida) * alfaCauda);
      }
    }
    /*
     * ⚠️ O ALFA QUE SAI DAQUI E SO A CAPTURA — nao o do disco. Devolver o alfa do disco foi o
     * defeito que deixou "a lente opaca", e a queixa do usuario foi literal.
     *
     * O disco de acrecao e opticamente espesso na natureza, mas nesta cena ele nao pode APAGAR o
     * grafo: 579 corpos orbitam atras e atraves dele, e o disco antigo era AdditiveBlending por
     * exatamente essa razao. Com o alfa do disco na saida, o mix no passe substituia o fundo, e
     * como alfa satura perto de 1 em quase todo o anel, sumiam de uma vez as estrelas, os corpos
     * E a propria distorcao — nao havia mais fundo para ser distorcido.
     *
     * A divisao certa e por FENOMENO, e nao por conveniencia:
     *
     *   - o HORIZONTE bloqueia. E o unico alfa verdadeiro daqui, e ele e 0 ou 1.
     *   - o DISCO emite. Ele SOMA, como todo emissor desta cena (coma, feixe, nebulosa, fotosfera).
     *
     * O alfa interno continua existindo e continua servindo: ele atenua os cruzamentos seguintes,
     * para que o disco oclua o proprio lado distante em vez de somar cinco copias de si mesmo.
     */
    return vec4(cor, capturado ? 1.0 : 0.0);
  }
`;
