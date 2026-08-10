/**
 * FOTOSFERA — a superfície de uma ESTRELA, que é a classe padrão do céu.
 *
 * ## Por que ela existe, e por que não é o planeta com outra cor
 *
 * O catálogo proíbe crosta na estrela ("estrela tem FOTOSFERA, não crosta: relevo e mar
 * afirmariam corpo sólido"), e a proibição está certa. Só que ela deixava 371 dos 459 corpos
 * sem nada a revelar no zoom: aproximar de um arquivo comum continuava mostrando um ponto. A
 * resposta fiel não é afrouxar o catálogo — é dar à estrela a superfície QUE ELA TEM.
 *
 * ## As quatro diferenças que importam, e todas mudam o shader
 *
 * 1. **Não há terminador.** Estrela é emissiva; ela não é iluminada de fora. O planeta calcula
 *    `dot(normal, luz)` e é isso que faz uma esfera parecer esfera — aqui esse termo não
 *    existe, e o volume vem do ESCURECIMENTO DE LIMBO.
 * 2. **Escurecimento de limbo é lei, não gosto.** `I(μ)/I₀ = 1 − u(1 − μ)`, com `u ≈ 0.6` no
 *    visível para o Sol. Olhando o centro do disco enxerga-se fundo, onde é mais quente;
 *    olhando a borda, a mesma profundidade óptica é atingida mais alto e mais frio. É a feição
 *    mais reconhecível de uma estrela e ela sozinha já dá o volume.
 * 3. **Granulação são células de convecção**, com centro claro (plasma subindo, quente) e
 *    fronteira escura (descendo, frio). No Sol têm ~1.000 km — 0,15% do raio — e vivem 8 a 20
 *    minutos. Elas FERVEM: a textura tem de mudar, ao contrário do relevo de um planeta.
 * 4. **Manchas são frias, não pretas.** A umbra fica ~2.000 K abaixo dos 5.772 K da fotosfera,
 *    o que pela lei de Stefan–Boltzmann dá cerca de (3800/5772)⁴ ≈ 19% do brilho. Pretas
 *    afirmariam ausência de emissão, que não é o caso.
 *
 * E as fáculas, que aparecem por último e só perto da BORDA: são as paredes quentes dos
 * grânulos, visíveis de viés. Por isso o brilho delas cresce com `1 − μ`, exatamente ao
 * contrário do escurecimento de limbo.
 *
 * ## Custo
 *
 * NÃO MEDIDO em cena ainda. A aritmética: ~14 avaliações de ruído por pixel coberto (duas
 * oitavas de granulação em duas escalas, mais o campo de manchas), contra ~27 do planeta. É
 * mais barata porque não recalcula normal por diferença finita — sem terminador, não há normal
 * a recalcular.
 */
import * as THREE from 'three';
import { GLSL_SIMPLEX3 } from './planet-noise.js';
import * as motion from '../core/motion.js';
import { MOTION } from './motion-catalog.js';
import { glslFloat } from './glsl.js';

const BOIL = MOTION.boil.rates;

/**
 * A PELE FOTOGRAFADA de uma estrela — uma imagem para todas, colorida por temperatura.
 *
 * ⭑ **Procedência RESOLVIDA, e por hash — não por semelhança.** `assets/textures/sun.jpg` é a
 * *2k Sun* do **Solar System Scope**, **CC BY 4.0**: o `sha256` do arquivo aqui e o do
 * `solarsystemscope.com/textures/download/2k_sun.jpg` são o mesmo. Ela havia chegado por um
 * intermediário que não declara licença nenhuma — e intermediário não licencia o que não é dele.
 * A atribuição exigida está em `assets/CREDITS.md`, junto do comando que reconfere.
 *
 * ⚠️ **O carregamento é OPCIONAL e assíncrono, e a falta dela não pode apagar a estrela.** A força
 * só sobe depois que a imagem chega; se ela não existir, `onError` deixa tudo como está e o céu
 * desenha a granulação procedural sozinha, como desenhava antes.
 */
const MAPA_SOLAR = { textura: null, pronta: false };
const FORCA_DO_MAPA = 0.55;

/** Carrega a pele solar uma vez, para todas as estrelas. Chamado no primeiro `build()`. */
function carregarMapaSolar(aoChegar) {
  if (MAPA_SOLAR.textura) return;
  MAPA_SOLAR.textura = new THREE.TextureLoader().load(
    '/assets/textures/sun.jpg',
    (t) => {
      /*
       * `SRGBColorSpace`: o JPEG está em sRGB e o cálculo do shader é linear. Sem isto a
       * luminância vem com gama embutida, o desvio em torno de 0,5 fica torto e o grão sai com
       * contraste errado — o tipo de erro que parece "escolha de valor" e é conversão faltando.
       */
      t.colorSpace = THREE.SRGBColorSpace;
      /*
       * ESPELHADA nos dois eixos. A projeção equirretangular dá a volta em `u`, e desde que a
       * escala passou a seguir a temperatura o `v` também sai de [0,1] — com `ClampToEdge` a
       * última linha da imagem viraria uma faixa esticada sobre o polo. Espelhar fecha a costura
       * sem repetir o mesmo pedaço reconhecível lado a lado.
       */
      t.wrapS = THREE.MirroredRepeatWrapping;
      t.wrapT = THREE.MirroredRepeatWrapping;
      t.anisotropy = 4;
      MAPA_SOLAR.pronta = true;
      aoChegar?.();
    },
    undefined,
    () => {
      // Sem imagem, sem acréscimo — e sem erro no console de quem clonou o repo sem os assets.
      MAPA_SOLAR.textura = null;
      MAPA_SOLAR.pronta = false;
    }
  );
}
const SPIN = MOTION.spin;

/**
 * A casca de arquivo, de `graph.js:SHELLS`. Aqui ela serve como eixo de IDADE para a rotação.
 *
 * Espelhada e não importada porque `graph.js` importa este módulo por outro caminho — e o que se
 * usa é a FAIXA, não o valor: mover a casca muda onde os corpos ficam, não o que "velho" quer
 * dizer. Se as duas divergirem, o pior caso é a rotação saturar num extremo, não quebrar.
 */
const SHELL_INNER = 26;
const SHELL_OUTER = 62;
const SHELL_MID = (SHELL_INNER + SHELL_OUTER) / 2;

/**
 * Período de rotação, em segundos, do corpo mais recente ao mais antigo.
 *
 * Girocronologia: `P ∝ t^0.5` (Skumanich) — o Sol leva 25 dias, uma estrela jovem de tipo solar
 * leva poucos dias. A faixa aqui é de tela: 22 s dá uma volta que se percebe num olhar sem virar
 * pião, e 78 s ainda muda visivelmente entre duas visitas. Fora dessa faixa o eixo deixa de
 * informar — rápido demais vira animação, lento demais vira corpo parado.
 */
const SPIN_PERIOD = { young: 22, old: 78 };

/** Onde a fotosfera começa e onde satura, em pixels de raio na tela. Igual à do planeta. */
export const LOD_FAR_PX = 90;
export const LOD_NEAR_PX = 200;

/**
 * Quanto do raio de referência esta pele PREENCHE com corpo desenhado — aqui, tudo.
 *
 * A malha é uma esfera de raio 1 escalada por `pouso.radius`, então a fotosfera É o corpo. Quem
 * lê isto é `lod.js` (`BODY_SPAN`), para decidir se a coroa do sprite envolve alguma coisa.
 */
export const BODY_SPAN = 1;

/*
 * ## As três referências SOLARES — e por que elas deixaram de ser constantes
 *
 * Eram fixas, e com elas os 136 corpos com fotosfera tinham o MESMO tamanho de grânulo, o mesmo
 * escurecimento de limbo e o mesmo contraste de mancha: mudava só o deslocamento do ruído e a
 * quantidade de manchas. O resultado é o que se vê no céu — muitas estrelas com a mesma cara, e
 * a variação lendo como uma textura repetida em vez de corpos diferentes.
 *
 * Estrelas reais diferem por TEMPERATURA, e ela move as três de uma vez. Os valores abaixo
 * continuam sendo os do Sol; agora são o PONTO MÉDIO de uma faixa, não o céu inteiro.
 */

/** Escurecimento de limbo do Sol no visível. Faixa real: ~0,3 (quente) a ~0,9 (frio). */
const LIMB_U = 0.6;
/** Quantos grânulos cabem na volta, no corpo mediano. O Sol tem ~2 milhões; aqui, o que sobrevive a 200px. */
const CELLS = 26.0;
/** Fração do brilho que resta na umbra: `(3800/5772)^4`, Stefan-Boltzmann, para o Sol. */
const UMBRA = 0.19;

/**
 * `chunks` que saturam a escala de massa. 226 é o maior arquivo do corpus medido em 2026-08-05.
 *
 * Log, não linear: um arquivo de 226 chunks não é 226 vezes mais quente que um de 1 — a mesma
 * compressão que o raio do sprite já usa, e pelo mesmo motivo.
 */
const MASS_LOG_FULL = Math.log2(1 + 226);

/**
 * `churn` que satura a escala de atividade. 27 é o máximo do corpus (mediana 1).
 *
 * ⚠️ Depende do corpus: um repo com muito mais reescrita empurra todo mundo para baixo na escala
 * e o céu perde manchas sem nada ter acontecido com cada arquivo. Se isso aparecer, o valor tem
 * de virar percentil e não máximo.
 */
const CHURN_FULL = 27;

const VERTEX = /* glsl */ `
  varying vec3 vObject;
  void main(){
    vObject = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uCam;
  uniform vec3 uHot;
  uniform vec3 uCool;
  uniform float uTime;
  uniform float uSpots;
  uniform float uSeed;
  uniform float uDetail;
  // As tres que a TEMPERATURA move. Eram constantes, e por isso todo corpo com fotosfera tinha
  // a mesma cara: mesmo grao, mesmo volume, mesmo contraste de mancha. Ver photosphereParams.
  uniform float uLimb;
  uniform float uCells;
  uniform float uUmbra;
  // Rotacao propria: angulo acumulado e eixo (inclinacao). Ver photosphereParams.
  uniform float uSpin;
  uniform float uTilt;
  uniform sampler2D uMapa;
  uniform float uMapaForca;
  uniform float uCroma;
  varying vec3 vObject;

  // Taxas de fervura, do motion-catalog.js. A ORDEM entre elas e a fisica: supergranulacao
  // grande e lenta, granulacao pequena e rapida vivendo dentro dela. (Sem backtick aqui: ele
  // fecha o template do shader.)
  const float BOIL_SLOW = ${glslFloat(BOIL.supergranulation)};
  const float BOIL_FAST = ${glslFloat(BOIL.granulation)};
  const float BOIL_FINE = ${glslFloat(BOIL.fine)};
  const float SPOT_DRIFT = ${glslFloat(BOIL.spots)};

  ${GLSL_SIMPLEX3}

  /*
   * Granulacao: celulas de conveccao que FERVEM.
   *
   * O quarto argumento do simplex e o tempo, entao o campo evolui em vez de girar rigido — que
   * e o que uma textura rolando faria, e o olho reconhece na hora como textura e nao como
   * plasma. As duas escalas sao a supergranulacao (grande, lenta) e a granulacao (pequena,
   * rapida), que e a estrutura real: as celulas pequenas vivem dentro das grandes.
   */
  float granulation(vec3 p){
    float slow = simplex3(p * uCells * 0.22 + vec3(0.0, uTime * BOIL_SLOW, uSeed));
    float fast = simplex3(p * uCells + vec3(uSeed, uTime * BOIL_FAST, 0.0));
    // A oitava fina entra por rampa com o nivel de detalhe: a 90px ela oscila mais de uma vez
    // por pixel e so produz cintilacao.
    float fine = simplex3(p * uCells * 2.6 + vec3(0.0, uTime * BOIL_FINE, uSeed)) * uDetail;
    return slow * 0.42 + fast * 0.44 + fine * 0.14;
  }

  /*
   * A ESTRELA GIRA — e o que gira e a AMOSTRAGEM, nao a malha.
   *
   * Rodar o objeto no espaco moveria tambem o limbo e as faculas, que sao funcao da linha de
   * visada e nao do corpo: a borda escura passearia pelo disco, o que nenhuma estrela faz. O que
   * pertence ao corpo e o campo — granulacao e manchas. Entao o eixo gira as COORDENADAS de
   * amostragem e o resto do shader continua olhando para a camera.
   */
  vec3 rotacionar(vec3 p, float ang, float tilt){
    // Inclina o eixo no plano x-y, gira em torno dele, desinclina. Sem o tilt toda estrela do ceu
    // giraria com o polo para cima, que le como carimbo.
    float ct = cos(tilt), st = sin(tilt);
    vec3 q = vec3(p.x * ct + p.y * st, -p.x * st + p.y * ct, p.z);
    float c = cos(ang), s = sin(ang);
    q = vec3(q.x * c - q.z * s, q.y, q.x * s + q.z * c);
    return vec3(q.x * ct - q.y * st, q.x * st + q.y * ct, q.z);
  }

  void main(){
    vec3 normal = normalize(vObject);
    // mu = cosseno do angulo entre a normal e a linha de visada. 1 no centro do disco, 0 no
    // limbo. Tudo aqui e funcao dele.
    float mu = clamp(dot(normal, normalize(uCam - vObject)), 0.0, 1.0);

    vec3 corpo = rotacionar(normal, uSpin, uTilt);
    float cells = granulation(corpo);

    /*
     * ─────────────────── A TEXTURA DO SOL, e ela entra como DETALHE, nao como cor
     *
     * A pele fotografada da uma estrutura de granulacao que ruido nenhum reproduz de graca. Mas
     * ela e UMA imagem, e o ceu tem muitas estrelas: usada como cor, todas ficariam laranjas e
     * iguais — que e exatamente o defeito que a temperatura existe para negar (a mesma textura em
     * outra posicao nao le como outro corpo).
     *
     * Entao o que se usa dela e a LUMINANCIA, centrada em zero, somada ao campo de granulacao que
     * ja existe. Tres coisas se preservam por construcao:
     *
     * - a COR continua vindo de uHot/uCool, isto e, da temperatura derivada da massa;
     * - a FERVURA continua viva, porque o termo procedural anda no tempo e a foto nao;
     * - o LIMBO, as manchas e as faculas continuam sendo fisica, nao pixel.
     *
     * A projecao e equirretangular sobre o vetor do CORPO (ja girado pelo eixo), entao a textura
     * gira com a estrela em vez de ficar colada na tela. E o deslocamento por uSeed impede que
     * duas estrelas mostrem a mesma mancha no mesmo lugar.
     */
    vec3 croma = vec3(1.0);
    if (uMapaForca > 0.0) {
      /*
       * ⚠️ A foto e UMA so, e deslocar a longitude nao basta: e literalmente "a mesma textura em
       * outra posicao", que este modulo ja registra como o que o olho NAO le como outro corpo.
       * Girar tambem em latitude troca o pedaco do mapa que cruza o disco visivel E move os polos,
       * entao duas estrelas mostram regioes diferentes da imagem em orientacoes diferentes.
       */
      float giroLat = (fract(uSeed * 7.31) - 0.5) * 2.4;
      float cl = cos(giroLat);
      float sl = sin(giroLat);
      vec3 d = normalize(corpo);
      d = vec3(d.x, d.y * cl - d.z * sl, d.y * sl + d.z * cl);
      vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5 + uSeed, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
      /*
       * ⚠️ A ESCALA da foto segue a temperatura, e sem isso ela CANCELA a fisica.
       *
       * uCells ja diz quantos granulos cabem na volta — estrela fria tem granulo GRANDE. Amostrada
       * em escala fixa, a foto impunha o mesmo tamanho de grao a todas as estrelas e apagava
       * exatamente o eixo que separa uma da outra. Aqui ela e esticada ou repetida na razao entre o
       * uCells do corpo e o do Sol, que e a referencia de onde a imagem veio.
       */
      uv *= uCells / ${glslFloat(CELLS)};
      vec3 amostra = texture2D(uMapa, uv).rgb;
      float lum = dot(amostra, vec3(0.2126, 0.7152, 0.0722));
      // Centrada: o que interessa e o DESVIO em relacao ao brilho medio da foto, que e o grao.
      // Somar a luminancia crua deslocaria a exposicao inteira e apagaria o escurecimento de limbo.
      // A forca tambem varia por corpo: com uma foto so para todo o ceu, um peso unico faz de
      // todas as estrelas a mesma mistura. O desvio e do proprio hash do corpo.
      float peso = uMapaForca * (0.55 + fract(uSeed * 13.7) * 0.9);
      cells += (lum - 0.5) * 2.0 * peso;
      /*
       * O MATIZ da foto, separado do brilho dela.
       *
       * Dividir a amostra pela propria luminancia deixa so a RAZAO entre canais — a cor sem a
       * intensidade. Assim o vermelho de uma regiao quente da foto aquece aquele ponto sem
       * clarea-lo, e o brilho continua saindo inteiro da fisica (limbo, granulacao, faculas).
       * uCroma decide quanto disso passa; em 0 a estrela volta a ser so temperatura.
       */
      croma = mix(vec3(1.0), amostra / max(lum, 0.001), uCroma);
    }

    /*
     * MANCHAS. Campo separado, de escala muito maior, cortado por limiar alto — mancha e evento
     * raro e localizado, nao modulacao continua do brilho. Elas tambem migram, so que devagar
     * demais para se perceber num olhar; o termo de tempo existe para que duas visitas ao mesmo
     * astro em dias diferentes nao sejam identicas.
     */
    float field = simplex3(corpo * 2.3 + vec3(uSeed * 3.1, uTime * SPOT_DRIFT, 0.0));
    float spot = smoothstep(0.52, 0.78, field) * uSpots;
    // Penumbra: a borda da mancha e filamentar e menos fria que a umbra.
    float penumbra = smoothstep(0.42, 0.56, field) * uSpots;

    /*
     * ESCURECIMENTO DE LIMBO — a lei, nao um gradiente escolhido.
     *
     * Sem terminador para dar volume, e ELE que faz o disco parecer uma esfera. Olhando o
     * centro do disco a linha de visada penetra mais fundo, onde e mais quente; na borda, a
     * mesma profundidade optica e atingida mais alto e mais frio.
     */
    float limb = 1.0 - uLimb * (1.0 - mu);

    /*
     * FACULAS: as paredes quentes dos granulos, visiveis de VIES. Por isso crescem com (1-mu),
     * exatamente ao contrario do escurecimento de limbo — e e essa oposicao que da a textura
     * anelada caracteristica perto da borda.
     */
    float faculae = max(cells, 0.0) * (1.0 - mu) * 0.9;

    float brightness = limb * (0.74 + cells * 0.52) + faculae * 0.8;
    // A mancha multiplica o que sobrou: ela nao APAGA emissao, ela emite menos.
    brightness *= mix(1.0, uUmbra, spot) * mix(1.0, 0.62, penumbra - spot);

    /*
     * Cor por TEMPERATURA, e o padrao e QUENTE.
     *
     * A primeira versao interpolava pelo brilho ABSOLUTO — e como o brilho medio fica em
     * torno de 0,4 depois da exposicao, o disco inteiro caia no lado frio e a estrela saia
     * marrom, parecendo lua rochosa. O erro foi de referencial: brilho baixo na tela nao
     * significa plasma frio, significa exposicao.
     *
     * O desvio e que manda. Fotosfera e quente por definicao; o que esfria sao a mancha e as
     * calhas de descida entre granulos (ruido negativo). E por isso que mancha solar parece
     * alaranjada CONTRA o branco, e nao cinza.
     */
    float cold = clamp(spot * 0.85 + max(-cells, 0.0) * 0.45, 0.0, 1.0);
    /*
     * ⚠️ A TEMPERATURA continua mandando na cor; a foto so a MODULA. Invertido — a foto como cor
     * base — todas as estrelas do ceu ficariam laranjas iguais, e a temperatura, que e derivada da
     * massa e existe justamente para duas estrelas serem duas estrelas, deixaria de aparecer.
     */
    vec3 color = mix(uHot, uCool, cold) * croma;

    /*
     * EXPOSICAO. A conta acima e fisica e passa de 1 com folga (limbo ~1 vezes granulacao
     * ~1,16 mais faculas); a tela nao. Sem este fator a fotosfera saia branca e chapada e o
     * bloom multiplicava o estouro — o disco virava um borrao azul e a granulacao, que e o
     * ponto do shader, nao aparecia em pixel nenhum.
     *
     * 0.52 e o que mantem o pico logo abaixo do limiar do bloom (0,8 por padrao) e deixa a
     * estrutura visivel. Escolhido na CENA, com a cadeia ligada — a licao que o τ do anel e o
     * ganho do fundo ja tinham dado duas vezes.
     */
    /*
     * EXPOSICAO. A conta acima e fisica e passa de 1; a tela nao. 0.72 mantem o pico logo
     * abaixo do limiar do bloom e deixa a granulacao visivel.
     *
     * ⚠️ O valor anterior (0,52) foi escolhido olhando a CENA — e nao valia nada, porque o
     * shader nem compilava: o que eu estava calibrando era o halo do sprite por baixo. Foi a
     * bancada que expos isso, que e exatamente para o que ela existe.
     */
    /*
     * ESPICULAS NO LIMBO: as linguas de plasma que fazem a borda de uma estrela ser VIVA.
     *
     * Elas so aparecem de vies (crescem com 1-mu, como as faculas) e vem do mesmo campo de ruido
     * que ja ferve — sao a cromosfera vista de perfil, o mesmo material em outra geometria. Sem
     * elas a estrela termina numa circunferencia perfeita, que e a silhueta de um adesivo.
     */
    float espiculas = pow(max(cells, 0.0), 2.2) * pow(1.0 - mu, 3.0) * 2.6;
    brightness += espiculas;

    /*
     * E A SUPERFICIE NAO E OPACA — alfa < 1, e isso e o corpo, nao um efeito.
     *
     * Fotosfera e opticamente espessa no meio do disco e RAREIA no limbo: la a linha de visada
     * atravessa menos plasma antes de sair, e e por isso que o Sol nao tem borda de tesoura. Com
     * alfa 1 a esfera terminava num recorte duro contra o ceu e lia como disco colado.
     *
     * O ruido entra no limiar junto com mu, entao a borda tambem e IRREGULAR e muda com o tempo:
     * a mesma ideia do nucleo do pulsar, e pelo mesmo motivo.
     */
    float limiar = 0.055 + max(cells, 0.0) * 0.10;
    float alfa = smoothstep(0.0, max(limiar, 0.01), mu);
    gl_FragColor = vec4(color * brightness * 0.72 * alfa, alfa);
  }
`;

/**
 * Parâmetros da fotosfera de um nó. Puro e congelado, como `planetParams`.
 *
 * @param {{source?: string, kind?: string, chunks?: number}} node
 * @param {(text: string, salt?: number) => number} hash01
 * @param {number} kindColor  a cor que o céu já usa para este tipo de conhecimento
 */
export function photosphereParams(node, hash01, kindColor) {
  const seed = hash01(node.source ?? 'sem-caminho', 17);
  const base = new THREE.Color(kindColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  const chunks = Number.isFinite(node.chunks) ? node.chunks : 1;

  /*
   * TEMPERATURA — o eixo que faltava, e o que faz duas estrelas serem duas estrelas.
   *
   * Sem ele o céu tinha 136 corpos com o mesmo grão, o mesmo volume e o mesmo contraste de
   * mancha; o hash mexia no deslocamento do ruído, que o olho lê como a MESMA textura em outra
   * posição — não como outro corpo. Estrela real difere por temperatura, e ela move quatro
   * coisas de uma vez: cor, tamanho do grânulo, escurecimento de limbo e contraste da mancha.
   *
   * O que a define aqui é a MASSA, e isso não é analogia solta: a relação massa-luminosidade da
   * sequência principal (`L ∝ M^3.5`) é justamente "mais massa, mais quente". Na cena, massa é
   * `chunks` — então um arquivo de configuração grande lê como estrela branco-azulada e um de
   * uma linha como anã laranja. A informação já estava no corpo; ela só não estava na superfície.
   *
   * ⚠️ Entra pelo RANK (`node.massRank`, escrito em `graph.js:load`), não pelo log da massa. Com o
   * log, a mediana de temperatura do corpus dava 0,22: `chunks` tem mediana 4 e máximo 226, então
   * quase todo o céu caía no mesmo canto frio da faixa e a variedade não aparecia. O rank
   * distribui uniformemente — é o mesmo motivo pelo qual `recency` é posição no ranking e não
   * data. O log continua certo para o TAMANHO do sprite; são duas perguntas sobre o mesmo número.
   *
   * O hash entra como DESVIO pequeno (±12%), não como fonte: sem ele, dois arquivos de mesmo
   * tamanho seriam gêmeos exatos; com ele mandando, a temperatura deixaria de informar.
   */
  /*
   * ⚠️ **A temperatura de uma estrela é o posto dela entre ESTRELAS, não entre todos os arquivos.**
   *
   * `massRank` é a posição no ranking de massa do céu inteiro, e desde que a ontologia nova passou a
   * eleger a estrela como a entidade DOMINANTE do sistema isso virou uma constante disfarçada: a
   * estrela é, por definição, o arquivo mais massivo da pasta dela, então todas caem no topo do
   * ranking global. Medido no `espatial_vivo`: das 17 estrelas, **dez têm `massRank` acima de 0,85**
   * e catorze acima de 0,47. O eixo chegava saturado, e o céu ficava com dezessete estrelas iguais —
   * relatado exatamente assim.
   *
   * `postoEstelar` é o posto DENTRO da população estelar, escrito por quem sabe quem é estrela
   * (`universe.js`). Ele devolve a faixa inteira, e é também a comparação certa em física: a
   * temperatura efetiva de uma estrela se lê contra outras estrelas, não contra planetas.
   *
   * A queda para `massRank` e depois para o log da massa continua, porque quem chama daqui pode não
   * ter população estelar nenhuma para ranquear — e um número saturado ainda é melhor que nenhum.
   */
  const massa = Number.isFinite(node.postoEstelar)
    ? node.postoEstelar
    : Number.isFinite(node.massRank)
      ? node.massRank
      : THREE.MathUtils.clamp(Math.log2(1 + chunks) / MASS_LOG_FULL, 0, 1);
  const temp = THREE.MathUtils.clamp(massa * 0.88 + (seed - 0.5) * 0.24, 0, 1);

  /*
   * A cor do nó vira o par frio/quente de um corpo negro, não uma paleta arbitrária.
   *
   * `hot` é a mesma matiz dessaturada e clara — plasma a 5.800 K lê como quase branco, com só
   * um traço da cor. `cool` puxa para laranja-vermelho, que é para onde a lei de Wien leva
   * qualquer coisa que esfria. Assim o TIPO do conhecimento continua legível (a matiz) sem que
   * a estrela vire um disco chapado da cor do tipo.
   *
   * A TEMPERATURA desloca a matiz ao longo do lugar de Planck: quente puxa para o azul (0,58) e
   * frio para o laranja (0,07). O tipo continua governando o traço de cor; a temperatura governa
   * de que lado do branco ele cai — que é o que separa um corpo do outro à primeira vista.
   */
  /*
   * ⚠️ **A MATIZ BASE passou a ser a TEMPERATURA; o `kind` virou desvio.** Ela era o contrário — a
   * matiz do tipo, empurrada um pouco para o azul conforme a temperatura — e nesta ontologia isso
   * empata o céu: **13 das 17 estrelas são `kind: other`**, então 76% delas partiam da mesma matiz
   * cinza-azulada e chegavam à mesma cor.
   *
   * Agora a temperatura varre a sequência real, de laranja (0,075) a branco-azulado (0,58), e o
   * tipo entra como 30% de desvio — o suficiente para um `doc` e um `config` de mesma massa não
   * serem gêmeos, sem devolver o empate. A regra do §4 do replanejamento continua valendo: o
   * `kind` perdeu o CORPO e mantém a COR — ele só deixou de ser a única voz nela.
   *
   * E a SATURAÇÃO agora cai com a temperatura em vez de subir: estrela fria é laranja saturada,
   * estrela quente é quase branca. Era o oposto, e por isso as frias saíam brancas como as
   * quentes.
   */
  /*
   * ⚠️ **O caminho entre laranja e azul passa pelo BRANCO, não pelo verde** — e interpolar a matiz
   * direto foi um erro meu que a medida pegou: em `temp` 0,5 a matiz caía em 0,33, e o céu ganhava
   * estrelas VERDES. Não existe estrela verde: o locus de Planck atravessa o branco, e é a
   * SATURAÇÃO que vai a zero no meio, não a matiz que passeia pelo espectro.
   *
   * Então a matiz tem dois ancoradouros — laranja no frio, azul no quente — e quem varia
   * continuamente é a saturação, que morre no tipo solar. É a mesma leitura de um diagrama H-R:
   * K/M laranja saturada · G branca · B azul-clara.
   */
  const quente = temp >= 0.5;
  const matizBase = quente ? 0.58 : 0.075;
  /*
   * O `kind` entra como DESVIO pequeno e limitado, nunca como matiz base: a diferença de matiz é
   * medida pelo caminho curto no círculo e presa a ±0,06 (~22°). Sem a trava, um tipo azul puxando
   * uma estrela fria devolveria o verde pela porta dos fundos.
   */
  const curto = ((hsl.h - matizBase + 1.5) % 1) - 0.5;
  const desvio = THREE.MathUtils.clamp(curto * 0.35, -0.06, 0.06);
  // A distância ao tipo solar é o que satura: 0 no meio (branca), 1 nos extremos.
  const extremo = Math.abs(temp - 0.5) * 2;
  const hot = new THREE.Color().setHSL(
    (matizBase + desvio + 1) % 1,
    extremo * (quente ? 0.3 : 0.62) * (0.7 + Math.min(hsl.s, 0.5) * 0.6),
    THREE.MathUtils.lerp(0.74, 0.97, temp)
  );
  const cool = new THREE.Color().setHSL(
    THREE.MathUtils.lerp(0.045, 0.11, temp),
    0.72,
    THREE.MathUtils.lerp(0.34, 0.5, temp)
  );

  /*
   * Grânulo: quantos cabem na volta. Estrela FRIA tem grânulo GRANDE.
   *
   * A célula de convecção escala com a altura de escala de pressão, que cresce quando a
   * temperatura efetiva cai e a gravidade superficial diminui — por isso uma supergigante
   * vermelha tem poucas células enormes e uma anã quente tem um grão fino. 26 é a referência
   * solar e fica no meio da faixa.
   */
  const cells = THREE.MathUtils.lerp(CELLS * 0.42, CELLS * 1.85, temp);

  /*
   * Escurecimento de limbo: forte no frio, fraco no quente.
   *
   * Faixa medida em estrelas reais no visível: `u` vai de ~0,3 nas quentes a ~0,9 nas frias. É a
   * variação mais visível das três — ela muda o quanto o corpo lê como esfera contra disco.
   */
  const limb = THREE.MathUtils.lerp(0.86, 0.34, temp);

  /*
   * Contraste da umbra: `(T_mancha/T_fotosfera)^4`, com a mancha ~1.800 K abaixo.
   *
   * Em estrela quente essa diferença é uma fração menor da temperatura, então a mancha é MENOS
   * escura em termos relativos — o contraste de mancha é uma assinatura de estrela fria.
   */
  const tFot = THREE.MathUtils.lerp(3800, 9000, temp);
  const umbra = THREE.MathUtils.clamp(((tFot - 1800) / tFot) ** 4, 0.05, 0.72);

  /*
   * MANCHAS por ATIVIDADE, não por tamanho — e `churn` é a atividade que este corpus mede.
   *
   * Antes saía da massa ("mais massa, mais manchas"), que o próprio comentário admitia ser
   * palpite de legibilidade e não física. Estrela manchada é estrela ATIVA, e o análogo aqui é o
   * arquivo reescrito muitas vezes: `churn` vai de 0 a 27 no corpus, mediana 1. Agora a mancha
   * informa alguma coisa em vez de repetir o tamanho, que o raio do sprite já diz.
   */
  const churn = Number.isFinite(node.churn) ? node.churn : 0;
  const atividade = THREE.MathUtils.clamp(Math.log2(1 + churn) / Math.log2(1 + CHURN_FULL), 0, 1);
  const spots = atividade * (0.45 + seed * 0.6);

  /*
   * ROTAÇÃO PRÓPRIA — e o período sai da IDADE, o que aqui é o raio orbital.
   *
   * Não é analogia: é **girocronologia**. Estrela de tipo solar perde momento angular por vento
   * magnético e desacelera de forma tão regular que a rotação é usada para DATAR estrelas
   * (`P ∝ t^0.5`, Skumanich). Nesta cena o raio orbital é a recência — então "corpo na periferia
   * gira devagar" é a lei, não uma licença. Era o que faltava para a estrela ter tempo próprio: a
   * granulação já fervia, mas fervura não tem eixo, e um corpo sem eixo não lê como corpo.
   *
   * O SINAL vem do hash, pelo mesmo motivo do planeta: um céu inteiro girando para o mesmo lado
   * lê como carimbo. `span` e `retrograde` são do `motion-catalog.js`, compartilhados com ele —
   * duas leis de rotação seria a duplicata que este projeto já pagou três vezes.
   */
  const raioOrbital = Number.isFinite(node.radius) ? node.radius : SHELL_MID;
  const idade = THREE.MathUtils.clamp((raioOrbital - SHELL_INNER) / (SHELL_OUTER - SHELL_INNER), 0, 1);
  /*
   * ⚠️ O HASH DÁ O SINAL; a IDADE dá a MAGNITUDE. A primeira versão deu as duas ao hash e errou.
   *
   * Escrito como `(seed − retrograde) · span` — a forma que o planeta usa — o hash que cai em cima
   * de `retrograde` produz rotação ZERO, e o corpo fica parado sem que nada explique por quê.
   * Medido no corpus: períodos de 74 s a **21.348 s**, mediana 285 s. Nessa faixa a estrela não
   * gira, ela só não está parada o suficiente para alguém provar.
   *
   * Separando as duas, todo corpo gira e o período fica na faixa que a girocronologia pede: jovem
   * depressa, velho devagar, sem buraco no meio. O retrógrado continua mais lento que o progrado,
   * que é a assimetria que o `motion-catalog.js` declara e o Sistema Solar tem (Vênus é o mais
   * lento dos oito).
   */
  const retrogrado = seed < SPIN.retrograde;
  const spin =
    (retrogrado ? -1 : 1) *
    ((Math.PI * 2) / THREE.MathUtils.lerp(SPIN_PERIOD.young, SPIN_PERIOD.old, idade)) *
    (retrogrado ? 0.6 : 1);

  return Object.freeze({
    seed: seed * 10,
    hot,
    cool,
    spots,
    cells,
    limb,
    umbra,
    temp,
    spin,
    // Eixo inclinado: sem isto todo polo aponta para cima e a rotação vira um carrossel só.
    tilt: (hash01(node.source ?? 'sem-caminho', 19) - 0.5) * 1.1,
  });
}

export function createPhotosphere() {
  const group = new THREE.Group();
  group.visible = false;

  let mesh = null;
  const CAM = new THREE.Vector3();
  const INVERSE = new THREE.Matrix4();

  function build() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uHot: { value: new THREE.Color(0xffffff) },
        uCool: { value: new THREE.Color(0xff7a3c) },
        uTime: { value: 0 },
        uSpots: { value: 0 },
        uSeed: { value: 0 },
        uSpin: { value: 0 },
        uTilt: { value: 0 },
        uLimb: { value: 0.6 },
        uCells: { value: 26.0 },
        uUmbra: { value: 0.19 },
        uDetail: { value: 0 },
        uMapa: { value: MAPA_SOLAR.textura },
        /*
         * ⚠️ **Zero enquanto a imagem não chegou, e zero para sempre se ela não existir.**
         *
         * A pele fotografada é um ACRÉSCIMO, não um requisito: um clone sem `assets/textures/` tem
         * de desenhar a estrela do mesmo jeito, com a granulação procedural sozinha. Sem esta
         * guarda o shader amostraria uma textura nula e o corpo sairia preto — a falha silenciosa
         * clássica, e a pior possível aqui, porque ela some justamente com o corpo que emite luz.
         */
        uMapaForca: { value: 0 },
        /*
         * Quanto do MATIZ da foto atravessa. Ela é uma imagem do SOL — uma anã G — e o céu tem
         * estrelas de outras temperaturas; deixar a cor dela dominar pintaria todas de laranja.
         * ⚠️ **Ele é um EQUALIZADOR, e por isso desceu de 0,45 para 0,22.** A foto é a mesma para
         * todo o céu, então o matiz dela é a única coisa que TODAS as estrelas compartilham — em
         * 0,45 ele pintava as dezessete do mesmo salmão e cobria a temperatura, que é justamente o
         * eixo que as separa. Em 0,22 as regiões ativas continuam aquecendo o disco sem impor a
         * cor de uma anã G a uma estrela azul.
         */
        uCroma: { value: 0.22 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      // A fotosfera deixou de ser opaca (ver o alfa no fim do FRAGMENT). Sem `depthWrite: false`
      // a borda translúcida ainda gravaria profundidade e recortaria o halo do sprite por baixo —
      // o buraco quadrado clássico de superfície transparente escrevendo no z-buffer.
      transparent: true,
      depthWrite: false,
    });
    // 48×32 basta: a esfera não tem deslocamento, então a malha só precisa de silhueta lisa —
    // toda a estrutura mora no fragmento.
    mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
    group.add(mesh);
    /*
     * A força sobe no CALLBACK, não aqui: entre o pedido e a chegada da imagem existem quadros, e
     * ligar antes faria o shader amostrar uma textura vazia — estrela preta por um instante, que é
     * o mesmo modo de falha que a guarda do uniforme evita no caso permanente.
     */
    carregarMapaSolar(() => {
      material.uniforms.uMapa.value = MAPA_SOLAR.textura;
      material.uniforms.uMapaForca.value = FORCA_DO_MAPA;
    });
  }

  return {
    object: group,

    /**
     * @param {object} params  saída de `photosphereParams`
     * @param {THREE.Camera} camera
     * @param {number} px      raio aparente em pixels — decide o nível de detalhe
     * @param {number} elapsed
     * @returns {number} nível resolvido, 0 a 1
     */
    update(params, camera, px, elapsed = 0) {
      const near = THREE.MathUtils.smoothstep(px, LOD_FAR_PX, LOD_NEAR_PX);
      if (near <= 0.001) {
        group.visible = false;
        return 0;
      }
      if (!mesh) build();
      group.visible = true;

      group.updateWorldMatrix(true, false);
      INVERSE.copy(group.matrixWorld).invert();
      CAM.copy(camera.position).applyMatrix4(INVERSE);

      const u = mesh.material.uniforms;
      u.uCam.value.copy(CAM);
      u.uHot.value.copy(params.hot);
      u.uCool.value.copy(params.cool);
      u.uSpots.value = params.spots;
      u.uSeed.value = params.seed;
      // As três que a temperatura move — sem elas o corpo volta a ser o Sol de todo mundo.
      // A rotação usa o MESMO relógio congelável da fervura: `spin` declara `reduced: 'freeze'`,
      // e parar o relógio deixa a estrela virada para um lado, que é um instante legítimo.
      u.uSpin.value = (motion.isReduced() ? 0 : elapsed) * (params.spin ?? 0);
      u.uTilt.value = params.tilt ?? 0;
      u.uLimb.value = params.limb ?? 0.6;
      u.uCells.value = params.cells ?? 26;
      u.uUmbra.value = params.umbra ?? 0.19;
      /*
       * `boil` declara `reduced: 'freeze'` no catálogo, e agora obedece.
       *
       * Parar o relógio congela a granulação inteira num quadro — as células ficam onde estão, com
       * a mancha onde está. É o que `freeze` quer dizer: a superfície continua sendo a superfície
       * que aquela estrela tem, sem nada se mexendo. Zerar `uTime` em vez de guardar o último
       * valor é de propósito: assim o corpo tem a MESMA cara em toda sessão com movimento
       * reduzido, em vez de depender do instante em que a preferência foi lida.
       */
      u.uTime.value = motion.isReduced() ? 0 : elapsed;
      u.uDetail.value = near;
      return near;
    },

    dispose() {
      if (!mesh) return;
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    },
  };
}
