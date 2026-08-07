/**
 * PULSAR — o corpo de um arquivo de INFRAESTRUTURA.
 *
 * ## O que o distingue não é o corpo, são os feixes
 *
 * Uma estrela de nêutrons tem ~10 km de raio: em qualquer escala em que o resto da cena caiba,
 * ela é um ponto. O que se observa de um pulsar não é a superfície — é a EMISSÃO polar, dois
 * cones de rádio saindo dos polos magnéticos, e o pulso existe porque o eixo magnético não bate
 * com o de rotação. O feixe varre o observador uma vez por volta, como um farol.
 *
 * Essa desalinhação é obrigatória: com os dois eixos alinhados o feixe apontaria sempre para o
 * mesmo lugar e não haveria pulso nenhum. Aqui ela é `obliquity`, e é o único parâmetro sem o
 * qual o corpo deixa de ser um pulsar.
 *
 * ## Por que infraestrutura
 *
 * Infra é o que bate em ritmo fixo e sustenta o resto: healthcheck, cron, deploy. O corpo que
 * carrega essa leitura é o que emite em período rigoroso — pulsares são os relógios mais estáveis
 * conhecidos. A frequência sai da MASSA, e ao contrário do resto do céu ela é INVERSA: pulsar
 * jovem e massivo gira devagar e desacelera, milissegundo é o velho reciclado. Arquivo pequeno
 * de infra pisca rápido; arquivo grande, devagar.
 *
 * ⚠️ Os feixes são cones aditivos e SEM teste de profundidade, como o remanescente e a coma: são
 * emissão, não sólido. Com teste, o cone que aponta para trás sumiria atrás do corpo, e um pulsar
 * com um feixe só lê como defeito de desenho.
 */
import * as THREE from 'three';
import { createPulse } from './pulsar-pulse.js';
import { createWind } from './pulsar-wind.js';
import { GLSL_SIMPLEX3 } from './planet-noise.js';

/** Onde o pulsar começa a aparecer e onde satura, em pixels de raio. */
export const LOD_FAR_PX = 26;
export const LOD_NEAR_PX = 100;

/**
 * Quanto do raio de referência o CORPO ocupa — e uma estrela de nêutrons é um ponto.
 *
 * Teto de `params.core` (0,10 + até 0,06). São ~10 km de raio: em qualquer escala em que o vento
 * (1,23–2,28 raios) caiba, o corpo é o brilho de onde tudo sai, não a figura. Quem lê é `lod.js`
 * (`BODY_SPAN`) — a coroa do sprite, entre 1,03 e 1,67 raios, cairia dentro do vento.
 */
const CORE_FLOOR = 0.1;
const CORE_GAIN = 0.06;
export const BODY_SPAN = CORE_FLOOR + CORE_GAIN;

/** Comprimento do feixe, em raios do corpo. Curto demais não lê como feixe; longo demais some da tela. */
/*
 * ⚠️ ERA 6,5 E ISSO ERA CALIBRAÇÃO DE QUASAR — o item #5 do brief, e o usuário apontou.
 *
 * Tudo neste corpo mede em `beam`, e o foco da cena enquadra `SKIN_EXTENT.pulsar` raios de âncora
 * — 2,6 quando este comentário foi escrito, 1,2 desde 2026-08-07 (o porquê está em `lod.js`; aqui
 * basta saber que o enquadramento ENCOLHEU e o vento passou a sair do círculo de ajuste de
 * propósito). Com 6,5 as três feições ficavam assim, em raios de âncora, contra os 2,6 de então:
 *
 *     lobo   1,9 a  3,5    1,4x além do enquadramento
 *     jato   8,6 a 16,1    6,2x além
 *     vento 19,1 a 35,5   13,7x além
 *
 * A câmera em foco ficava DENTRO da nuvem de vento por mais de treze vezes, e o que chegava à
 * tela era um ouriço de raias radiais sem núcleo e sem estrutura bipolar. Não era um pulsar
 * grande demais: era um AGN com nome de pulsar.
 *
 * 1,3 põe o objeto inteiro em 2,28 raios no pior caso — dentro do enquadramento — e, mais
 * importante, INVERTE A ORDEM das três feições. Ver `SCALE`.
 */
const BEAM_LENGTH = 1.3;
/** Período de rotação, em segundos: rápido para o corpo leve, lento para o pesado. */
const SPIN_PERIOD = { fast: 0.9, slow: 4.2 };

const hash01 = (text, salt) => {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
};

const VERTEX = /* glsl */ `
  uniform float uCone;
  varying float vAlong;
  varying float vRadial;

  void main(){
    // A geometria poe a base em y=0 (no corpo) e a ponta em y=1. vAlong e a fracao percorrida.
    vAlong = position.y;
    /*
     * vRadial e a distancia ao eixo em fracao do raio LOCAL, e o denominador muda com a peca.
     *
     * No CONE (uCone = 1) o raio cresce com a altura, entao a fracao e xz/y. No CILINDRO
     * (uCone = 0) o raio e constante e igual a 1. Sem esta troca o cilindro herdaria a conta do
     * cone e ficaria com o miolo aceso so na ponta — a divisao por y apagaria a base inteira.
     */
    vRadial = length(position.xz) / max(mix(1.0, position.y, uCone), 1e-4);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  ${GLSL_SIMPLEX3}
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uFall;
  uniform float uEdge;
  uniform float uSpine;
  uniform float uSharp;
  uniform float uAlign;
  uniform float uTime;
  uniform float uSeed;
  uniform float uPlasma;
  varying float vAlong;
  varying float vRadial;

  /*
   * O FEIXE E PLASMA, NAO MATERIAL — item #4 do brief, e a queixa era exata: "mesmo usando shader
   * aditivo ainda percebemos a malha".
   *
   * O que denunciava a geometria era a densidade CONSTANTE: um cone com queda suave e liso demais
   * para ser gas, e o olho le a superficie regular como objeto. Duas oitavas de ruido correndo AO
   * LONGO do eixo quebram isso — a estrutura sobe pelo feixe como a materia sobe de verdade.
   *
   * ⚠️ ORCAMENTO CONTADO ANTES, que e a regra que a espessura do disco do buraco negro ensinou:
   * sao DUAS amostras por fragmento, so dentro do cone (o descarte por fill continua na frente), e
   * nenhuma fatia nova. O cone ocupa ~200x600 px no enquadramento de foco contra os megapixels do
   * disco de acrecao com cinco fatias — duas ordens de grandeza abaixo do que matou a aba.
   *
   * A coordenada e (raio, altura) e nao o mundo: o feixe gira com o eixo magnetico, e ruido em
   * espaco de mundo faria a textura escorregar por dentro dele a cada varredura.
   */
  float plasma(float aoLongo, float doEixo){
    vec3 q = vec3(doEixo * 3.1, aoLongo * 5.2 - uTime * 0.85, uSeed);
    float grande = simplex3(q);
    float fino = simplex3(q * 2.7 + vec3(0.0, uTime * 0.4, 11.0));
    // 1 + ruido centrado: a media continua 1, entao o brilho total do feixe nao muda — o que muda
    // e a DISTRIBUICAO. Sem isso o item viraria "o feixe ficou mais fraco", que e outra coisa.
    return 1.0 + (grande * 0.62 + fino * 0.28) * uPlasma;
  }

  void main(){
    // A emissao cai ao longo do feixe. uFall separa as duas pecas: o LOBO difuso morre depressa
    // (expoente alto) e o JATO colimado quase nao perde brilho no comprimento (expoente ~1), que
    // e o que faz dele uma agulha que atravessa a imagem em vez de um cone que termina.
    float aoLongo = pow(clamp(1.0 - vAlong, 0.0, 1.0), uFall);
    // E cai TAMBEM do eixo para a borda: feixe de radio nao tem parede.
    float doEixo = pow(clamp(1.0 - vRadial, 0.0, 1.0), uEdge);
    /*
     * A ESPINHA — o fio branco no meio do feixe, e e ela que faltava.
     *
     * Nas referencias (o quasar com o jato atravessando o disco, o Crab) o feixe nao e um facho
     * de cor uniforme: e um nucleo BRANCO estourado com um halo colorido em volta. O olho le
     * isso como energia; um cone de uma cor so le como geometria pintada.
     *
     * ⚠️ O expoente e uniform porque a primeira tentativa (40, fixo) reproduziu EXATAMENTE o
     * defeito que ela dizia evitar. Com o cone abrindo 11% e a espinha a 4% do raio dele, o fio
     * aceso ficava em 0,4% do comprimento — menos de um pixel, invisivel. Contas, com o jato a
     * ~200 px na tela: a meia-largura do cone no meio do jato e abertura·100 px, e o fio e a
     * fracao r onde (1-r)^n = 0,5. Para um fio de ~4 px com halo de ~20 px sai abertura 0,2 e
     * n = 17. Regra: a espinha e uma fracao do RAIO DO CONE, entao estreitar o cone estreita o
     * fio junto — os dois numeros nao sao independentes.
     */
    float espinha = pow(clamp(1.0 - vRadial, 0.0, 1.0), uSharp) * uSpine;
    /*
     * BEAMING RELATIVISTICO: o feixe estoura quando aponta para o observador.
     *
     * Nao e so perspectiva. O plasma sobe pelo eixo a uma fracao alta de c, e a radiacao de uma
     * fonte que se aproxima e concentrada para a frente e deslocada para cima em energia — o
     * fator de Doppler entra na intensidade com uma potencia alta (3 a 4 para um jato continuo).
     * E por isso que um blazar, que e o mesmo objeto visto de frente, e ordens de grandeza mais
     * brilhante que a mesma fonte de perfil.
     *
     * uAlign e o cosseno entre o eixo do feixe e a linha de visada, calculado no JS. A potencia 3
     * e o expoente do caso continuo; o piso impede que o feixe de perfil desapareca de vez, que
     * apagaria a informacao em vez de so escurece-la.
     */
    float doppler = 0.35 + 2.4 * pow(clamp(uAlign, 0.0, 1.0), 3.0);
    float fill = (doEixo + espinha) * aoLongo * uAmount * doppler * plasma(vAlong, vRadial);
    if (fill < 0.004) discard;
    /*
     * Branco no fio, SINCROTRON no halo — item #12, e a regra e a mesma do nucleo e da casca.
     *
     * A cor do halo do feixe era o uColor cru, ou seja o tipo do arquivo pintando emissao
     * relativistica: um .tf ficava com halo laranja porque o tipo infra e laranja. O feixe polar e
     * emissao de energia ALTA, entao ele vive na ponta azul-clara da rampa; o tipo entra com o
     * mesmo peso de tingimento que o corpo usa (0,28), e nao mandando na cor.
     */
    vec3 halo = mix(vec3(0.42, 0.78, 1.0), uColor, 0.28);
    gl_FragColor = vec4(mix(halo, vec3(1.0), clamp(espinha, 0.0, 1.0)) * fill, fill);
  }
`;


/**
 * O NÚCLEO não é um círculo — é massa de energia.
 *
 * A queixa foi literal: "simplesmente um círculo com cones". E `MeshBasicMaterial` é exatamente
 * isso: uma cor chapada dentro de uma silhueta perfeita, sem estrutura, sem variação, sem borda
 * viva. Nenhum corpo desta cena que EMITE se parece com isso — a fotosfera ferve, a nebulosa
 * escoa, a coma tem lei de queda. O núcleo do pulsar era o único emissor desenhado como adesivo.
 *
 * O que entra no lugar, e cada termo responde por uma coisa que se vê nas referências:
 *
 * | termo | o que é | o que ele conserta |
 * |---|---|---|
 * | `fervura` | ruído 3D avançado no tempo, duas oitavas | superfície uniforme |
 * | `erupcao` | picos raros e agudos do mesmo campo | massa inerte, sem eventos |
 * | `borda` | o ruído também modula o ALFA no limbo | a silhueta de círculo perfeito |
 * | alfa < 1 | aditivo e translúcido | "as superfícies não devem ser opacas" |
 *
 * ⚠️ Ele é ADITIVO como o resto da emissão desta pele. Um emissor opaco tapa o feixe que sai de
 * trás dele, e o pulsar volta a ter um feixe só — que foi o defeito que pôs os cones sem teste de
 * profundidade em primeiro lugar.
 */
const CORE_VERTEX = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main(){
    vPos = position;
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  precision highp float;
  ${GLSL_SIMPLEX3}
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uCam;
  uniform vec3 uMag;
  uniform float uBeat;
  varying vec3 vPos;
  varying vec3 vNormal;

  /*
   * SINCROTRON: a cor sai da ENERGIA, e a rampa e a mesma que se ve nas fotos.
   *
   * Eletron relativistico em campo magnetico emite num espectro largo, e o que a imagem mostra e
   * a energia caindo do centro para fora: branco onde estoura, azul, ciano, roxo e vermelho
   * escuro na cauda. Uma cor so com brilho variavel nao produz isso — o que muda com a energia e
   * o MATIZ, nao a luminancia.
   */
  vec3 sincrotron(float e){
    vec3 c = mix(vec3(0.32, 0.02, 0.10), vec3(0.45, 0.10, 0.72), smoothstep(0.0, 0.28, e));
    c = mix(c, vec3(0.16, 0.62, 0.95), smoothstep(0.24, 0.55, e));
    c = mix(c, vec3(0.42, 0.78, 1.0), smoothstep(0.5, 0.78, e));
    return mix(c, vec3(1.0), smoothstep(0.74, 1.0, e));
  }

  void main(){
    vec3 q = vPos * 3.4 + uSeed;
    /*
     * FERVURA: duas oitavas avancando no tempo, a fina mais rapida que a grossa.
     *
     * E a mesma ordem que a granulacao da fotosfera usa, e pelo mesmo motivo: celula grande e
     * lenta com celula pequena e rapida dentro dela le como conveccao. Igualadas, le como
     * textura rolando.
     */
    float grossa = simplex3(q + vec3(0.0, uTime * 0.35, 0.0));
    float fina = simplex3(q * 2.7 - vec3(uTime * 0.8, 0.0, uTime * 0.5));
    float fervura = grossa * 0.62 + fina * 0.38;

    /*
     * ERUPCAO: o mesmo campo, so que so a CRISTA dele.
     *
     * Elevar a potencia alta mata tudo menos os picos mais altos do ruido, entao a superficie
     * fica calma quase toda e estoura em pontos isolados que nascem e morrem. Erupcao nao e
     * ruido mais forte, e ruido RARO — sem o corte, o corpo inteiro pisca junto.
     */
    float erupcao = pow(max(fervura, 0.0), 6.0) * 3.2;

    // Angulo de visada: 1 no meio do disco, 0 no limbo.
    float mu = clamp(dot(normalize(vNormal), normalize(uCam - vPos)), 0.0, 1.0);

    /*
     * A BORDA E IRREGULAR, e e isto que tira o "circulo".
     *
     * O alfa cai no limbo (mu -> 0) como qualquer corpo translucido — a linha de visada atravessa
     * menos plasma la. Somando a fervura ao limiar, a queda acontece mais cedo em umas direcoes e
     * mais tarde em outras: a silhueta ganha lingua e reentrancia, e muda com o tempo.
     */
    float limiar = 0.16 + fervura * 0.22;
    float borda = smoothstep(0.0, max(limiar, 0.02), mu);

    /*
     * Faixa dinamica ALTA de proposito: massa de energia nao e uma cor com textura por cima.
     *
     * Com 0,55 de piso o corpo ficava chapado — um planeta mosqueado. Piso baixo e ganho alto
     * poem as calhas quase apagadas e as cristas estourando, que e o contraste que o olho le como
     * plasma. A erupcao entra por cima disso, nao no lugar dele.
     */
    /*
     * HOTSPOTS POLARES — e a superficie inteira era tratada igual, que era o defeito principal.
     *
     * O que aquece a crosta de uma estrela de neutrons nao e ela mesma: e o plasma acelerado
     * DESCENDO pelas linhas de campo abertas e batendo nas calotas polares magneticas. So ali. O
     * resto da superficie e frio em comparacao, e por isso quase nunca se ve um disco luminoso —
     * ve-se emissao quase pontual que aparece e some conforme a calota entra e sai de vista.
     *
     * uMag e o eixo magnetico em espaco LOCAL. O cosseno ao expoente alto recorta a calota; o
     * valor absoluto acende os DOIS polos, que e o certo — o dipolo e simetrico, e e por isso que
     * um pulsar pisca duas vezes por volta quando a geometria ajuda.
     */
    vec3 n = normalize(vNormal);
    float calota = pow(abs(dot(n, normalize(uMag))), 26.0);
    // A mancha quente nao tem borda limpa: o mesmo campo que ferve a deforma.
    float hotspot = calota * (0.72 + fervura * 0.55);

    /*
     * A ESFERA RECUA. Antes ela era ~90% do que se via; agora e a base fria sobre a qual as
     * calotas estouram — a proporcao que o corpo real tem. O termo de borda continua fazendo a silhueta
     * ser irregular, mas o que chama o olho passa a ser o polo, nao o disco.
     */
    float superficie = (0.08 + fervura * 0.34 + erupcao * 0.9);
    float energia = clamp(superficie * 0.5 + hotspot * 1.35 + erupcao * 0.6, 0.0, 1.0);
    /*
     * CAMADA 2 do halo — o GLOW, e ele nasce aqui porque nao precisa de geometria.
     *
     * Um aro de Fresnel na borda do proprio corpo: a normal ja esta calculada e uCam ja esta no
     * espaco local, entao sao tres instrucoes. Ele fecha o vao entre o disco da superficie e a
     * primeira casca (1,8 raios), que sem isso aparecia como um degrau escuro de meio raio.
     */
    float glow = pow(1.0 - clamp(abs(dot(n, normalize(uCam - vPos))), 0.0, 1.0), 3.0) * 0.85;
    float brilho = (superficie + hotspot * 2.6 + glow) * borda * uAmount * uBeat;
    if (brilho < 0.004) discard;
    // A cor vem da ENERGIA pela rampa sincrotron, e uColor do tipo entra so como tingimento:
    // o corpo tem de continuar dizendo "infra" sem que isso apague a fisica da emissao.
    vec3 cor = mix(sincrotron(energia), uColor, 0.28);
    gl_FragColor = vec4(cor * brilho, brilho);
  }
`;

/**
 * A MAGNETOSFERA — item #3 do brief, e ela não existia mais quando o brief foi relido.
 *
 * ⚠️ O `createFieldCage` que o brief critica ("desenha um dipolo bonito... visualmente parece
 * wireframe") foi DELETADO antes desta sessão. Então o pedido mudou de forma: não é sujar um
 * dipolo existente, é decidir o que desenha o campo. O texto dá a especificação inteira —
 * *dipolo + pequenas flutuações + espessura variável + intensidade variável + algumas linhas
 * quebrando* — e o que ela proíbe implicitamente é a gaiola de linhas: linha geométrica É
 * wireframe, por mais que se a suje.
 *
 * Por isso o campo aqui não é feito de linhas: é uma CASCA onde o dipolo aparece como densidade.
 *
 * ## A conta do dipolo, que é o que faz a forma ser reconhecível
 *
 * Numa linha de campo dipolar, `r = L · sin²(θ)` com θ medido do eixo magnético e L o parâmetro da
 * linha (a distância equatorial em que ela fecha). Invertendo, cada ponto do espaço pertence à
 * linha `L = r / sin²(θ)`. Desenhar `fract(L)` acende superfícies de L constante — as próprias
 * linhas de campo, em volume, sem uma única aresta. É a mesma ideia do anel de Saturno: a forma
 * sai da lei, não de geometria empilhada.
 *
 * As quatro exigências do brief entram assim:
 *   flutuação      ruído somado em L, então a linha ondula em vez de ser uma curva perfeita
 *   espessura      a largura do traço vem do mesmo ruído, e varia ao longo dela
 *   intensidade    o brilho cai com o raio e é modulado por uma segunda oitava
 *   linhas quebrando  um limiar no ruído APAGA trechos — reconexão, sem simular reconexão
 *
 * ⚠️ ORÇAMENTO: duas amostras por fragmento, numa casca de 0,9 raios de âncora vista de dentro
 * (`BackSide`, metade dos fragmentos). É o mesmo custo do halo e uma ordem de grandeza abaixo do
 * disco de acreção. O campo cede junto com o batimento, como todas as outras camadas — item #11.
 */
const CAMPO_FRAGMENT = /* glsl */ `
  precision highp float;
  ${GLSL_SIMPLEX3}
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uTime;
  uniform float uSeed;
  uniform float uBeat;
  uniform vec3 uMag;
  varying vec3 vPos;

  void main(){
    vec3 p = normalize(vPos);
    float r = length(vPos);
    // Angulo ao eixo magnetico. sin^2 e o que a lei do dipolo pede.
    float cosTheta = clamp(dot(p, normalize(uMag)), -1.0, 1.0);
    float sin2 = max(1.0 - cosTheta * cosTheta, 1e-3);

    /*
     * L = r / sin^2(theta) e o parametro da linha de campo que passa por aqui. fract(L * densidade)
     * acende superficies de L constante — as linhas, em volume.
     */
    /*
     * ⚠️ r e 1 nesta casca, e a primeira escrita esqueceu disso: a queda por (1 - r) zerava o campo
     * inteiro, em silencio. Numa SUPERFICIE o parametro da linha vira L = 1/sin^2(theta), que vai
     * de 1 no equador a infinito nos polos — as linhas fechadas se apertam contra o eixo, que e
     * exatamente o que um dipolo faz.
     */
    float L = 1.0 / sin2;
    // Perto do eixo as faixas ficam menores que um pixel e viram cintilacao. O corte e honesto: ali
    // as linhas sao ABERTAS (e por elas que o plasma escapa para o feixe), entao nao ha o que fechar.
    if (L > 7.0) discard;
    vec3 q = vPos * 2.6 + vec3(0.0, uTime * 0.22, uSeed);
    float ondula = simplex3(q) * 0.16;
    float faixa = fract(L * 2.3 + ondula);
    // Traco fino nos dois lados do zero, com a largura vindo do proprio ruido.
    float largura = 0.10 + simplex3(q * 1.9 + 4.0) * 0.05;
    float linha = smoothstep(largura, 0.0, min(faixa, 1.0 - faixa));

    /*
     * AS LINHAS QUEBRAM. Um limiar na segunda oitava apaga trechos inteiros — e isso nao simula
     * reconexao, so mostra o que ela deixa: campo interrompido. Sem isto o dipolo volta a ser o
     * diagrama didatico que o brief recusa.
     */
    float rompe = smoothstep(0.28, 0.62, simplex3(q * 0.9 + 17.0) * 0.5 + 0.5);
    // Cai com o raio (o campo dipolar cai com 1/r^3; aqui basta a leitura) e some no eixo, onde as
    // linhas abertas nao fecham.
    // Concentracao equatorial: e onde as linhas fechadas moram, e some no eixo pelo mesmo motivo
    // do corte acima. o raio continua sendo lido para o ruido, que precisa de tres dimensoes.
    float queda = sin2 * sin2;
    float brilho = linha * rompe * queda * uAmount * uBeat;
    if (brilho < 0.004) discard;
    /*
     * fieldColor — a sexta e ultima cor do item #12, e ela fecha a regra.
     *
     * O campo e a camada de MENOR energia do corpo: nao emite, canaliza. Na rampa sincrotron isso
     * e a ponta roxa, e o tipo do arquivo entra com o mesmo tingimento de 0,28 que o nucleo, a
     * casca e o feixe ja usam. Seis camadas, seis cores, uma regra so: a energia manda.
     */
    gl_FragColor = vec4(mix(vec3(0.45, 0.10, 0.72), uColor, 0.28) * brilho, brilho);
  }
`;

/**
 * O HALO SINCROTRON — item #9 do brief, e ele existia só no pós-processamento.
 *
 * O pedido é literal: *"hoje o bloom depende do pós-processamento, mas o shader pode gerar um halo
 * próprio: núcleo + glow + halo + halo maior. Quatro camadas. Não apenas uma."*
 *
 * As quatro, e onde cada uma mora:
 *   1. NÚCLEO   — a superfície com as calotas, no CORE_FRAGMENT.
 *   2. GLOW     — o aro de Fresnel na borda do próprio núcleo, no mesmo fragmento. Custa três
 *                 instruções e não pede geometria: a normal e a câmera já estão lá.
 *   3. HALO     — esta casca, em 1,8 raios.
 *   4. HALO MAIOR — a mesma casca em 2,8 raios, mais fraca e mais larga.
 *
 * ⚠️ POR QUE NÃO É POST-PROCESSING: bloom de tela borra TUDO o que é brilhante, inclusive o que
 * está atrás; um halo que nasce no objeto acompanha o batimento, tem a cor da energia dele e some
 * quando ele some. O pós continua existindo por cima — o que muda é que agora existe halo mesmo
 * com o bloom em zero, que é o perfil `básico`.
 *
 * ⚠️ ORÇAMENTO DE FRAGMENTO, contado ANTES de escrever, porque foi assim que a espessura do disco
 * do buraco negro matou a aba: este fragmento não tem RUÍDO — são ~10 instruções e nenhuma
 * amostra. As duas cascas são `BackSide` (só a face de trás é rasterizada, metade dos fragmentos)
 * e desenham no máximo 2,8 raios do corpo, que na chegada do foco são ~600 px de raio contra os
 * 742 da meia-altura. Não é o disco de acreção enchendo a tela com cinco fatias de ruído.
 */
/*
 * A NEBULOSA DE VENTO — o ultimo item do #13, e a camada mais externa da hierarquia do brief:
 * "nebulosa (LOD alto): >50 raios, desaparecendo em transparencia".
 *
 * ⚠️ 50 RAIOS DO CORPO, NAO DA ANCORA, e confundir os dois quase matou o item. Com o corpo em
 * 0,10-0,16 de ancora, 50 raios do corpo sao ~7 de ancora contra um quadro de 2,6 — a MESMA razao
 * da cauda do cometa, que ja passou pelo olho do usuario. Lida como raios de ancora, ela daria 19x
 * o quadro e viraria nevoa sobre o ceu inteiro, que foi a conclusao errada de uma primeira leitura.
 *
 * Ela e o que sobra do vento depois do choque de terminacao: eletrons relativisticos presos no
 * campo, irradiando sincrotron. Tres coisas a distinguem do halo, e as tres sao fisica:
 *
 *   1. Ela e BRILHANTE NO LIMBO, nao no meio. O halo usa (1 - b) porque e coluna de gas vista de
 *      fora; a nebulosa e uma CASCA fina e oca, e casca fina tem mais caminho na borda — o mesmo
 *      1/cos(i) do disco do buraco negro, aqui como funcao do parametro de impacto.
 *   2. Ela e FILAMENTAR. A do Caranguejo e uma teia, nao uma bolha: o ruido entra multiplicando, e
 *      com contraste alto o bastante para abrir vazio, senao le como bolha esfumada.
 *   3. Ela e ACHATADA no equador do eixo de ROTACAO, porque o vento sai concentrado no plano
 *      equatorial — a mesma assimetria que `pulsar-wind.js` ja desenha nas particulas.
 */
const NEBULA_FRAGMENT = /* glsl */ `
  precision highp float;
  ${GLSL_SIMPLEX3}
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vNormal;
  varying vec3 vPos;

  // Mesma familia de cor do halo e do nucleo: a rampa sincrotron manda, o tipo do arquivo tinge.
  // Aqui a energia e a MAIS BAIXA das camadas — eletrons ja resfriados, longe do polo —, entao o
  // ponto de partida e o roxo-magenta da cauda da rampa e nao o azul do halo.
  const vec3 ROXO = vec3(0.52, 0.20, 0.66);

  void main(){
    vec3 n = normalize(vNormal);
    float mu = abs(n.z);
    float b = sqrt(max(1.0 - mu * mu, 0.0));
    /*
     * Casca fina: o caminho dentro dela cresce para o limbo, com teto para o caso rasante — o
     * mesmo teto do disco do buraco negro, e pelo mesmo motivo.
     *
     * ⚠️ ELE SO EXISTE VISTO DE FORA, e a primeira versao dependia dele para tudo. Com 7 raios de
     * ancora e a camera enquadrando 2,6, o observador esta DENTRO da casca na maior parte do tempo:
     * ali mu ~ 1 em toda a tela, o realce vale 0,25 constante, e o que sobrava depois do corte eram
     * so os graos mais brilhantes do ruido — chuvisco azul, nao teia. Medido na bancada.
     *
     * Entao ele entra como MODULACAO com piso, e nao como porta: de dentro a nebulosa e um brilho
     * difuso que a teia recorta (que e o que se ve estando dentro de uma), e de fora ela ganha a
     * borda acesa. Os dois regimes existem porque a camera pode estar nos dois lugares.
     */
    float limbo = 0.55 + min(1.0 / max(sqrt(max(1.0 - b * b, 0.0)), 0.16), 4.0) * 0.22;

    // Achatamento equatorial: o vento sai concentrado no plano do equador de rotacao (Y local).
    float doEixo = abs(normalize(vPos).y);
    float equador = 1.0 - doEixo * doEixo * 0.72;

    /*
     * TEIA, e ela precisa de CONTRASTE e nao so de ruido. Duas oitavas com o limiar por baixo:
     * sem o limiar o campo le como bolha esfumada, que e o defeito que o disco do buraco negro
     * ja pagou no item #4. A deriva no tempo e LENTA e RIGIDA (soma, nao multiplica pelo raio):
     * um padrao cuja fase dependesse do raio enrolaria sem fim, que e o Lin-Shu que este projeto
     * ja matou cinco vezes.
     */
    vec3 q = normalize(vPos) * 1.4 + uSeed;
    float teia = snoise(q + vec3(0.0, uTime * 0.03, 0.0)) * 0.5 + 0.5;
    teia += (snoise(q * 2.3 - vec3(0.0, uTime * 0.05, 0.0)) * 0.5 + 0.5) * 0.5;
    // ⚠️ A ESCALA DO RUIDO E A DIFERENCA ENTRE TEIA E CHUVISCO. Em 2,6 a celula cai perto de um
    // pixel quando a casca cobre a tela, e ruido do tamanho de um pixel nao e estrutura: e grao.
    // 1,4 da filamento com largura visivel. O limiar abre vazio; o expoente abaixo de 2 evita
    // esmagar o meio da distribuicao, que e onde o filamento vive.
    teia = clamp((teia / 1.5 - 0.30) / 0.70, 0.0, 1.0);
    teia = pow(teia, 1.5);

    float brilho = limbo * equador * teia * uAmount;
    // Corte alto de proposito: esta casca tem 7 raios de ancora e desenha a tela inteira quando a
    // camera se aproxima. O que nao chega a um bit de cor nao paga a mistura.
    if (brilho < 0.004) discard;
    gl_FragColor = vec4(mix(ROXO, uColor, 0.24) * brilho, brilho);
  }
`;

const HALO_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPos;
  void main(){
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAmount;
  uniform float uBeat;
  uniform float uWidth;
  varying vec3 vNormal;
  varying vec3 vPos;

  /*
   * O AZUL DA RAMPA SINCROTRON, e a cor sai daqui e nao do JS de proposito.
   *
   * O halo e emissao de energia MEDIA — nem o branco estourado do polo nem o vermelho escuro da
   * cauda. Calcular isso no JS pediria uma segunda copia da rampa do CORE_FRAGMENT, em outra
   * linguagem, livre para divergir na primeira vez que alguem mexesse numa das duas. Aqui a regra
   * e a mesma do nucleo: a fisica da emissao manda, o tipo do arquivo entra so como tingimento.
   */
  const vec3 AZUL = vec3(0.16, 0.62, 0.95);

  void main(){
    /*
     * PERFIL DE ATMOSFERA, e a primeira escrita usou o INVERSO — vale registrar porque a diferenca
     * so aparece vendo.
     *
     * Numa casca vista de dentro, (1 - mu) acende a SILHUETA e apaga o meio: o resultado sao dois
     * aros nitidos, concentricos, que leem como anel de vidro em volta do corpo e nao como halo.
     * Conferido na bancada, que e onde isso aparece limpo por nao ter pos-processamento.
     *
     * O que se quer e a coluna vista de fora: brilho no meio caindo para a borda. O parametro de
     * impacto do raio nesta esfera unitaria e sqrt(1 - mu^2) — 0 no centro do disco, 1 no limbo —,
     * entao (1 - b) e o perfil cheio. Uma instrucao a mais e a leitura muda de anel para halo.
     */
    float mu = abs(normalize(vNormal).z);
    float b = sqrt(max(1.0 - mu * mu, 0.0));
    float aro = pow(1.0 - b, uWidth);
    float brilho = aro * uAmount * uBeat;
    if (brilho < 0.003) discard;
    gl_FragColor = vec4(mix(AZUL, uColor, 0.28) * brilho, brilho);
  }
`;

/**
 * Parâmetros do pulsar de um nó. Puro e congelado.
 *
 * @param {{source?: string, id?: string, chunks?: number, massRank?: number}} node
 * @param {number} color
 */
export function pulsarParams(node = {}, color = 0xffffff) {
  const path = node.source ?? node.id ?? 'sem-caminho';
  const seed = hash01(path, 43);
  const seedB = hash01(path, 47);
  const massa = Number.isFinite(node.massRank)
    ? node.massRank
    : THREE.MathUtils.clamp(Math.log2(1 + (node.chunks || 1)) / 8, 0, 1);

  return Object.freeze({
    seed,
    /*
     * Corpo PEQUENO — e a primeira versão ainda era grande demais.
     *
     * A 0,22–0,36 raios ele enchia o centro da tela como uma bola pálida, e a queixa foi literal:
     * "simplesmente um círculo com cones". Estrela de nêutrons tem ~10 km: em qualquer escala em
     * que o feixe caiba, ela é um PONTO. 0,10–0,16 devolve a proporção das referências, em que o
     * corpo é o brilho de onde tudo sai e não a figura principal.
     */
    core: CORE_FLOOR + massa * CORE_GAIN,
    /**
     * Período em segundos. INVERSO da massa, ao contrário do resto do céu — e é a física: pulsar
     * jovem e massivo é lento, o de milissegundo é o velho reciclado por acreção.
     */
    period: THREE.MathUtils.lerp(SPIN_PERIOD.fast, SPIN_PERIOD.slow, massa),
    /**
     * ÂNGULO ENTRE O EIXO MAGNÉTICO E O DE ROTAÇÃO. Sem ele não há pulso.
     *
     * Alinhados, o feixe aponta sempre para o mesmo lugar e o corpo vira uma lâmpada acesa. A
     * faixa (18° a 78°) evita os dois degenerados: quase alinhado quase não pulsa, e a 90° os
     * dois feixes passam juntos e o ritmo dobra sem querer.
     */
    obliquity: THREE.MathUtils.lerp(0.32, 1.36, seed),
    /** Inclinação do eixo de rotação no espaço — senão todo pulsar giraria no mesmo plano. */
    tilt: (seedB - 0.5) * 1.4,
    yaw: seed * Math.PI * 2,
    beam: BEAM_LENGTH * (0.7 + seedB * 0.6),
    color,
  });
}

/**
 * O pulsar do astro em foco. Um por cena, como as outras peles.
 */
const OLHO = new THREE.Vector3();
const EIXO = new THREE.Vector3();
const VISADA = new THREE.Vector3();
const QUAT = new THREE.Quaternion();

/**
 * Alcance de cada camada, em múltiplos de `beam`. Ver a tabela em `update`.
 *
 * `beam` (6,5 · 0,7…1,3 raios) continua sendo o parâmetro por corpo; estas razões constroem a
 * hierarquia espacial em cima dele. Mexer numa camada aqui não move as outras, que era exatamente
 * o problema de tudo sair do mesmo número.
 */
/*
 * A ORDEM destes três é a afirmação do objeto, e ela estava invertida.
 *
 * Era `{ lobe: 0.42, jet: 1.9, wind: 4.2 }` — mas a razão que importa não é o valor absoluto, é
 * qual feição DOMINA. Com o jato em 1,9 e o vento espalhado por 4,2, o que se via era a agulha
 * e um borrão isotrópico atrás dela: a silhueta de um núcleo ativo.
 *
 * Num pulsar quem domina é o VENTO. A Nebulosa do Caranguejo é um toro equatorial com filamentos
 * e dois jatos polares MODESTOS — os jatos existem (Crab e Vela mostram os dois), mas eles são
 * comparáveis ao toro, não dez vezes ele. Cygnus A é a referência do quasar; o Caranguejo é a
 * deste corpo, e a diferença entre as duas é exatamente o que o item #5 pedia.
 *
 * Agora, em raios de âncora: lobo 0,41–0,76 · jato 0,86–1,61 · vento 1,23–2,28. Vento > jato >
 * lobo, e a ORDEM é a afirmação — ela não depende do enquadramento.
 *
 * ⚠️ Estes 2,28 do pior caso eram exatamente o que `SKIN_EXTENT.pulsar` = 2,6 continha. Desde
 * 2026-08-07 o recuo é 1,2 e o vento SAI do círculo de ajuste (sem sair do quadro — ver `lod.js`),
 * porque conter o vento custava o corpo: a 2,6 ele chegava com 87 px medidos e não se lia.
 */
/*
 * ⚠️ O VENTO FOI DE 1,35 A 3,6 EM 2026-08-07 — item #13, e o que autorizou foi o COMETA.
 *
 * O brief pede uma hierarquia grande (magnetosfera 2–5, cone 8–15, vento 20–40 raios) e ela foi
 * refutada uma vez: a 35 raios o `SKIN_EXTENT` teve de ir a 4, e a 4 o corpo chegava abaixo do
 * próprio `LOD_FAR_PX` — o pulsar não era desenhável em distância nenhuma. A lição que saiu dali
 * foi "enquadra-se a FIGURA, não a extensão", e ela ficou aplicada pela metade: as três feições
 * encolheram JUNTAS, então o vento virou uma casca colada no corpo em vez de ambiente.
 *
 * A outra metade chegou com o cometa em 07/08 e foi aprovada no olho: `SKIN_EXTENT.comet` caiu
 * para 1,6 enquadrando a CABEÇA, e a cauda de 9 raios sai do quadro de propósito — ambiente pode e
 * deve sair. O vento do pulsar é a mesma categoria de coisa que a cauda.
 *
 * Então o recuo NÃO muda (1,2, o corpo continua chegando a 217 px, legível) e o vento cresce:
 * 3,6 × beam põe o pior caso em 6,1 raios de âncora contra os 3,7 que o quadro cobre — ele
 * transborda em ~1,6×, na mesma ordem em que a cauda do cometa transborda. O jato e o lobo NÃO
 * mudam: eles são a figura, e é ela que tem de caber.
 */
const SCALE = Object.freeze({ lobe: 0.45, jet: 0.95, wind: 3.6 });

export function createPulsar() {
  /** Leitura do último quadro. Ver `beat()`. */
  const ultimo = { batimento: 0, nivel: 0, alinhamento: 0 };
  /*
   * FILAMENTO DO PULSO, e ele volta LIGADO — mas com DECAIMENTO.
   *
   * A história em três passos, porque o meio dela é a parte útil:
   *
   * 1. O campo desenhava ~16 cristas radiais em volta de um ponto brilhante, e dezesseis cristas
   *    radiais não leem como filamento: leem como ESTRELA DE PONTAS. O usuário pediu para tirar,
   *    e ele saiu — `filamento: 0`.
   * 2. Duas tentativas de consertar a FORMA foram refutadas e estão registradas em
   *    `pulsar-pulse.js`: as facetas do cone não tinham nada a ver, e subir o raio do círculo de
   *    amostragem só multiplica as pontas.
   * 3. O conserto não era da forma — era do TEMPO. Com `decaimento`, a estrutura nasce cheia e
   *    alisa conforme a casca cresce: as cristas só existem no instante em que o pulso nasce,
   *    perto do corpo, e a casca chega lisa na borda. É a física de um choque (nítido onde a
   *    energia foi injetada, disperso conforme o material rarefaz) e resolve a estrela de pontas
   *    sem apagar a estrutura.
   *
   * Por isso os dois entram em 1: o que fazia mal era a crista PERMANENTE, não a crista.
   * `tune({ filamento: 0 })` desliga tudo de novo, e a bancada tem os dois botões separados para
   * a decisão poder ser revista vendo.
   */
  const ajuste = { filamento: 1, decaimento: 1, nebulosa: 1 };
  const group = new THREE.Group();
  group.visible = false;

  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uMag: { value: new THREE.Vector3(0, 1, 0) },
      uBeat: { value: 1 },
    },
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  // 32×24: a esfera não tem deslocamento — a estrutura toda mora no fragmento, e a malha só
  // precisa de silhueta lisa o bastante para o ruído deformá-la.
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), coreMat);
  group.add(core);

  /*
   * AS CAMADAS 3 E 4 do halo sincrotron. Ver `HALO_FRAGMENT` para as quatro e o orçamento.
   *
   * Uma geometria só, compartilhada: 24×16 basta porque não há deslocamento nenhum — a casca é
   * lisa e quem faz a forma é o aro no fragmento. `BackSide` desenha só a face de trás, que é o
   * que dá o aro sem a frente lavar o corpo por cima.
   */
  const cascaGeo = new THREE.SphereGeometry(1, 24, 16);
  const halos = [
    { raio: 1.8, largura: 1.6, ganho: 0.55 },
    { raio: 2.8, largura: 1.1, ganho: 0.3 },
  ].map(({ raio, largura, ganho }) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uAmount: { value: 0 },
        uBeat: { value: 1 },
        uWidth: { value: largura },
      },
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      userData: { raio, ganho },
    });
    const malha = new THREE.Mesh(cascaGeo, material);
    group.add(malha);
    return malha;
  });

  /*
   * A MAGNETOSFERA — ver `CAMPO_FRAGMENT`. Casca única, vista de dentro, com o dipolo aparecendo
   * como densidade. Ela mora no eixo de ROTAÇÃO e não no magnético: o campo é solidário ao corpo,
   * e é o eixo magnético dentro dele (`uMag`) que inclina o dipolo — a mesma hierarquia que já
   * produz o farol.
   */
  const campoMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uBeat: { value: 1 },
      uMag: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: HALO_VERTEX,
    fragmentShader: CAMPO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  const campo = new THREE.Mesh(cascaGeo, campoMat);
  group.add(campo);

  /*
   * A NEBULOSA DE VENTO — ver `NEBULA_FRAGMENT`. A camada mais externa da hierarquia do #13, e a
   * única do pulsar que fica FORA do quadro de propósito: 7 raios de âncora contra `SKIN_EXTENT`
   * 2,6. É a mesma licença que o cometa tem, e pelo mesmo motivo — enquadra-se a FIGURA, não a
   * extensão. Ela mora no grupo (eixo de ROTAÇÃO), não no eixo magnético: o vento sai do equador
   * de rotação, e pendurá-la no eixo magnético a faria oscilar junto com o farol.
   */
  const nebulosaMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
    },
    vertexShader: HALO_VERTEX,
    fragmentShader: NEBULA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    /*
     * ⚠️ DOUBLE SIDE E SEM TESTE DE PROFUNDIDADE, e as duas coisas por medida e nao por gosto.
     *
     * As outras cascas deste arquivo usam BackSide, que e o certo para elas: sao pequenas, a camera
     * fica fora, e desenhar so a face de tras da o aro sem a frente lavar o corpo. Copiei o padrao
     * e a nebulosa ficou quase invisivel na bancada, com a conta dizendo que o brilho minimo era
     * 0,08 — bem acima do corte. Quando a aritmetica e a tela discordam, o defeito nao esta no
     * brilho.
     *
     * Com 7 raios de ancora, o hemisferio DISTANTE cai alem do plano distante da camera e e
     * recortado inteiro; sobra um arco na borda, que era exatamente o que se via. DoubleSide poe o
     * hemisferio de ca de volta, e isso tambem e mais correto: nebulosa e opticamente fina, olha-se
     * ATRAVES dela, entao somar as duas travessias e a fisica e nao um remendo.
     *
     * `depthTest: false` pela mesma razao que a magnetosfera o desliga — ela envolve tudo o que o
     * pulsar tem, e testar profundidade contra o proprio corpo a recortaria em volta dele.
     */
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const nebulosa = new THREE.Mesh(cascaGeo, nebulosaMat);
  // Desenha ANTES de tudo: ela e o fundo do sistema, e sem ordem explicita a ordenacao por
  // transparencia do three a intercala com o feixe conforme a camera gira.
  nebulosa.renderOrder = -1;
  group.add(nebulosa);

  /*
   * DUAS PEÇAS POR POLO, e é a diferença entre "cone" e "pulsar".
   *
   * As referências mostram duas coisas que um cone só não faz ao mesmo tempo. O Crab é um par de
   * LOBOS difusos, largos e curtos, com borda macia — a emissão perto da estrela. O quasar é uma
   * AGULHA colimada, fina e longa, que atravessa a imagem inteira sem perder brilho. As duas são
   * o mesmo fenômeno em escalas diferentes (o plasma sai largo e é colimado pelo campo), e é por
   * isso que elas dividem o eixo e o shader: o que muda são três expoentes e o comprimento.
   */
  function criarMaterial({ fall, edge, spine, sharp, gain, cone, plasma }) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uAmount: { value: 0 },
        uFall: { value: fall },
        uEdge: { value: edge },
        uSpine: { value: spine },
        uSharp: { value: sharp },
        uCone: { value: cone },
        uAlign: { value: 0 },
        uTime: { value: 0 },
        uSeed: { value: 0 },
        // O JATO e colimado e quase homogeneo; o LOBO e difuso e e onde a turbulencia se ve. Um
        // valor por peca, no mesmo lugar em que `gain` ja mora.
        uPlasma: { value: plasma },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      // O ganho vive NO material: ele apareceu duas vezes na primeira escrita (aqui e no laço do
      // `update`), que é a duplicata que esta cena já pagou quatro vezes. Uma cópia só.
      userData: { gain },
    });
  }
  // Jato: quase não perde brilho no comprimento, miolo apertado, espinha branca acesa.
  const jatoMat = criarMaterial({ fall: 0.9, edge: 3.2, spine: 1, sharp: 17, gain: 1.5, cone: 0, plasma: 0.45 });
  // Lobo: morre depressa, borda larga e macia, sem espinha — ele é o halo, não o fio.
  const loboMat = criarMaterial({ fall: 2.2, edge: 1.8, spine: 0, sharp: 1, gain: 0.85, cone: 1, plasma: 0.85 });

  /*
   * O EIXO MAGNÉTICO é um grupo próprio, inclinado dentro do eixo de ROTAÇÃO.
   *
   * Os dois feixes penduram nele, opostos. Girar o grupo externo (rotação) faz o interno
   * (magnético) varrer um cone — que é exatamente o mecanismo do farol, e sai da hierarquia sem
   * nenhuma trigonometria escrita à mão.
   */
  const eixoRotacao = new THREE.Group();
  const eixoMagnetico = new THREE.Group();
  eixoRotacao.add(eixoMagnetico);
  group.add(eixoRotacao);

  const jatos = [];
  const lobos = [];
  for (const lado of [1, -1]) {
    /*
     * ÁPICE NO CORPO, base longe — e a primeira versão fez o contrário.
     *
     * `ConeGeometry` nasce com o ápice em +y e a base em −y. Assim o feixe saía LARGO no corpo e
     * fechava numa ponta ao longe, que é a silhueta de um funil e não de um farol: a luz sai de
     * um ponto e se abre. `rotateX(π)` inverte, e o `translate` põe o ápice na origem para
     * `position.y` valer direto como fração percorrida no shader.
     */
    for (const [mat, lista] of [[jatoMat, jatos], [loboMat, lobos]]) {
      /*
       * O JATO É UM CILINDRO e o LOBO é um cone, e a diferença é a colimação.
       *
       * Jato de núcleo ativo é colimado: ele mantém a largura por distâncias absurdas — é essa
       * propriedade que o torna um jato e não um jorro. Desenhado como cone, ele lia como CUNHA
       * TRIANGULAR, que foi a primeira coisa que apareceu na tela. O feixe de rádio do pulsar, ao
       * contrário, abre mesmo — o cone está certo lá.
       *
       * ⚠️ **E o jato é um QUAD, não um cilindro** — a primeira tentativa foi cilindro e ele
       * simplesmente não apareceu, sem erro nenhum. `CylinderGeometry(…, true)` é aberto: só
       * existe a PAREDE, e nela `length(xz)` vale 1 em todo vértice. Com `uCone = 0` o shader
       * dividia por 1 e obtinha `vRadial = 1` em cada fragmento, o que zera tanto o halo quanto a
       * espinha. Um tubo é uma casca; o feixe precisa do INTERIOR, e cone só funciona porque a
       * parede dele varre raios de 0 (no ápice) a 1.
       *
       * O quad tem largura constante — que é o que colimação significa — e é girado a cada quadro
       * para encarar a câmera (ver `update`), como qualquer rastro. `PlaneGeometry(2, 1)` dá
       * x ∈ [−1, 1] e y ∈ [0, 1], então `length(position.xz)` já é |x| e `position.y` já é a
       * fração percorrida: o mesmo shader serve às duas peças sem um `if`.
       *
       * `ConeGeometry` nasce com o ápice em +y; `rotateX(π)` põe o ápice embaixo, no corpo, para
       * a luz sair de um ponto e abrir. O `translate` põe a base em y=0 nos dois.
       */
      const geo = mat === jatoMat
        ? new THREE.PlaneGeometry(2, 1)
        : new THREE.ConeGeometry(1, 1, 16, 1, true);
      if (mat !== jatoMat) geo.rotateX(Math.PI);
      geo.translate(0, 0.5, 0);
      const feixe = new THREE.Mesh(geo, mat);
      feixe.frustumCulled = false;
      feixe.renderOrder = 9;
      if (lado < 0) feixe.rotation.z = Math.PI;
      lista.push(feixe);
      eixoMagnetico.add(feixe);
    }
  }

  /*
   * O PULSO DE EMISSÃO fica no grupo EXTERNO, não no eixo magnético.
   *
   * A energia que o quasar solta não é canalizada pelos polos como o feixe é: ela sai para todo
   * lado. Pendurada no eixo magnético, a casca giraria com a varredura — uma esfera girando é
   * indistinguível de uma parada, mas o padrão de filamento não é, e ele denunciaria o giro.
   */
  const pulso = createPulse();
  group.add(pulso.object);

  /*
   * O VENTO pendura no eixo magnético: a cintura equatorial dele é definida pelas linhas de campo
   * fechadas, não pelo eixo de rotação. Ele gira com a varredura, e é o certo — a magnetosfera
   * inteira é solidária ao dipolo.
   */
  const vento = createWind();
  eixoMagnetico.add(vento.object);

  return {
    object: group,

    /**
     * @param {object} params  de `pulsarParams`
     * @param {number} px      raio aparente do corpo
     * @param {number} elapsed relógio da cena
     * @param {boolean} reduced  `prefers-reduced-motion` — congela a varredura e a fervura
     * @param {THREE.Camera} camera  para o ângulo de visada do núcleo
     * @returns {number} nível de detalhe aplicado, 0…1
     */
    /**
     * O último quadro, para a bancada e para a sonda — `galaxy.pose()` com outro nome.
     *
     * ⚠️ Existe porque a afirmação central desta arquitetura é INVISÍVEL numa foto: "um batimento
     * só para tudo, como um coração". Várias animações independentes e uma pulsação única
     * produzem imagens parecidas em qualquer instante e só divergem ao longo do tempo — que é
     * exatamente o que screenshot não julga. Com o número na mão, o operador confere que brilho,
     * calota, halo e vento sobem e descem JUNTOS, em vez de precisar acreditar.
     */
    beat: () => ({ ...ultimo }),

    /** Afinação viva. `filamento` 0…1 é a amplitude; `decaimento` 0…1, quanto ela alisa ao longo do ciclo. */
    tune({ filamento = 1, decaimento = 1, nebulosa: nebula = 1 } = {}) {
      ajuste.filamento = filamento;
      ajuste.decaimento = decaimento;
      // A nebulosa entra no MESMO ajuste porque é camada nova e a bancada precisa poder apagá-la:
      // com ela ligada e tênue, um defeito nela lê como fundo sujo. Ver a nota do espécime.
      ajuste.nebulosa = nebula;
    },

    update(params, px, elapsed, reduced = false, camera = null) {
      const level = THREE.MathUtils.clamp((px - LOD_FAR_PX) / (LOD_NEAR_PX - LOD_FAR_PX), 0, 1);
      group.visible = level > 0.002;
      if (!group.visible) return 0;

      /*
       * UM BATIMENTO SÓ para tudo — "como um coração", e é o que faltava.
       *
       * O período já governava a varredura e nada mais: brilho, hotspot, halo e vento corriam em
       * relógios independentes, então o corpo tinha várias animações em vez de uma pulsação. Agora
       * sai daqui um número 0…1 por quadro e todas as camadas o leem.
       *
       * `sin⁴` e não `sin`: o batimento fica quase todo o ciclo baixo e sobe rápido, que é a forma
       * de um pulso e não de uma respiração.
       */
      const batimento = reduced ? 0.5 : Math.sin((elapsed / params.period) * Math.PI) ** 4;
      ultimo.batimento = batimento;
      ultimo.nivel = level;

      core.scale.setScalar(params.core);
      coreMat.uniforms.uColor.value.set(params.color);
      coreMat.uniforms.uAmount.value = level;
      coreMat.uniforms.uSeed.value = params.seed * 37;
      // A fervura CONGELA com movimento reduzido, como o `boil` da fotosfera: o campo parado é um
      // instante legítimo da convecção, e a estrutura continua lá.
      coreMat.uniforms.uTime.value = reduced ? 0 : elapsed;
      // O batimento entra no núcleo como GANHO, não substituindo a fervura: a superfície continua
      // viva entre as batidas, ela só não estoura.
      coreMat.uniforms.uBeat.value = 0.55 + batimento * 0.9;
      // `uCam` em espaço LOCAL do núcleo: o grupo tem rotação e escala próprias, e a conta de
      // ângulo de visada tem de acontecer no mesmo referencial em que `vPos` vive.
      if (camera) core.worldToLocal(coreMat.uniforms.uCam.value.copy(camera.position));

      /*
       * As duas cascas do halo respiram no MESMO batimento — é a exigência do item #11, e ela vale
       * para toda camada nova: um halo com relógio próprio faz o corpo ter duas animações.
       *
       * O raio delas é em raios do CORPO (`params.core`), não do grupo: o corpo é 0,10–0,16 e as
       * cascas seriam invisíveis se multiplicassem só a si mesmas.
       */
      /*
       * A magnetosfera ocupa 0,9 raios de âncora — entre o halo maior (0,36) e o lobo (0,41–0,76),
       * envolvendo os dois. É a camada que o brief chama de magnetosfera na hierarquia de escalas,
       * e ela é a única do pulsar que não escala com o corpo: o campo é do SISTEMA, não da esfera.
       */
      campo.scale.setScalar(0.9);
      campoMat.uniforms.uColor.value.set(params.color);
      campoMat.uniforms.uAmount.value = level * 0.85;
      campoMat.uniforms.uTime.value = reduced ? 0 : elapsed;
      campoMat.uniforms.uSeed.value = params.seed * 53;
      campoMat.uniforms.uBeat.value = 0.5 + batimento * 0.85;

      /*
       * A nebulosa NÃO respira no batimento, e é a única camada que não respira.
       *
       * O #11 pede que o pulso afete tudo, e ele afeta tudo o que é magnetosférico — o que responde
       * ao campo responde ao giro. A nebulosa não: ela tem milhares de anos de idade e o pulso tem
       * segundos. Um plasma que levou séculos para se depositar piscando no relógio do farol seria
       * a animação contradizendo a escala que o próprio #13 acabou de estabelecer.
       *
       * Ela também não escala com o corpo: é do SISTEMA, como a magnetosfera. 7 raios de âncora.
       */
      nebulosa.scale.setScalar(7.0);
      nebulosaMat.uniforms.uColor.value.set(params.color);
      // ⚠️ 0,42 DEIXAVA A CAMADA INVISÍVEL, e "névoa que se lê já está brilhante demais" era um
      // palpite que a bancada refutou: com o realce de limbo valendo 0,25 visto de dentro, o corte
      // do fragmento comia tudo menos os grãos. O ganho é medido contra o que aparece, não contra
      // o receio de que apareça demais.
      nebulosaMat.uniforms.uAmount.value = level * 1.1 * (ajuste.nebulosa ?? 1);
      nebulosaMat.uniforms.uTime.value = reduced ? 0 : elapsed;
      nebulosaMat.uniforms.uSeed.value = params.seed * 61;

      for (const casca of halos) {
        casca.scale.setScalar(params.core * casca.material.userData.raio);
        casca.material.uniforms.uColor.value.set(params.color);
        casca.material.uniforms.uAmount.value = level * casca.material.userData.ganho;
        casca.material.uniforms.uBeat.value = 0.45 + batimento * 1.0;
      }

      /*
       * O raio da base é a ABERTURA e a altura é o ALCANCE, e as duas peças usam razões opostas.
       *
       * O JATO abre 20% e o comprimento vem de `SCALE.jet` — jato relativístico colima em poucos
       * graus, e o que se vê nas referências é uma agulha. (Os 20% são de MALHA; o brilho visível
       * é bem mais fino, feito pela espinha no shader — agulha geométrica fina ficaria sub-pixel
       * e cintilaria, ver o cálculo em FRAGMENT.)
       *
       * O LOBO é curto (38%) e largo (48%): é a emissão perto da estrela, a parte que o Crab
       * mostra como duas asas difusas. Sem ele o jato sai do nada; sem o jato o corpo vira um
       * borrão. A razão entre os dois é o que dá a silhueta de ampulheta das referências.
       */
      for (const mat of [jatoMat, loboMat]) {
        mat.uniforms.uColor.value.set(params.color);
        mat.uniforms.uAmount.value = 0.55 * level * mat.userData.gain;
        // O plasma sobe pelo feixe. Congela com movimento reduzido, como a fervura do núcleo: um
        // campo parado é um instante legítimo, um campo lento é movimento disfarçado.
        mat.uniforms.uTime.value = reduced ? 0 : elapsed;
        mat.uniforms.uSeed.value = params.seed * 23;
      }
      /*
       * ESCALAS DESACOPLADAS — e antes tudo saía do mesmo `beam`, o que prendia o corpo inteiro
       * numa casca só e fazia o pulsar parecer um efeito colado no astro.
       *
       * | camada | alcance | por quê |
       * |---|---|---|
       * | magnetosfera (lobo) | ~2–4 raios | onde as linhas fechadas seguram o plasma |
       * | cone de emissão (jato) | ~8–15 raios | a região colimada |
       * | vento relativístico | ~20–40 raios | expansão livre, e é o que dá o TAMANHO do corpo |
       *
       * A hierarquia é o ponto: três alcances em razão ~4 entre si constroem profundidade que
       * uma casca só nunca dá. `SCALE` guarda as razões contra `beam`, que continua sendo o
       * parâmetro por corpo.
       */
      for (const jato of jatos) jato.scale.set(params.beam * 0.2, params.beam * SCALE.jet, 1);
      for (const lobo of lobos) lobo.scale.set(params.beam * 0.5, params.beam * SCALE.lobe, params.beam * 0.5);
      // O pulso alcança a ponta do LOBO, não a do jato: ele é emissão isotrópica, e ir tão longe
      // quanto a agulha colimada afirmaria que ela não colima nada. Ver `pulsar-pulse.js`.
      pulso.update(params.beam * SCALE.wind, level, elapsed, params.seed, params.color, camera, reduced, ajuste.filamento, ajuste.decaimento);
      vento.update(params.beam * SCALE.wind, level, elapsed, batimento, reduced);

      group.rotation.set(params.tilt, params.yaw, 0);
      eixoMagnetico.rotation.z = params.obliquity;
      /*
       * A rotação CONGELA com movimento reduzido, e não é o parâmetro que congela: é o RELÓGIO.
       *
       * Zerar a obliquidade alinharia os feixes ao eixo e o corpo deixaria de ser um pulsar —
       * a mesma regra que o `bob` e o `spin` seguem no `motion-catalog.js`. Parado, ele fica
       * apontando para um lado, que é um instante legítimo da varredura.
       */
      eixoRotacao.rotation.y = reduced ? 0 : (elapsed / params.period) * Math.PI * 2;

      /*
       * O QUAD DO JATO ENCARA A CÂMERA, e a rotação acontece DEPOIS de todas as outras.
       *
       * Ele é plano: visto de perfil desapareceria, e um pulsar que perde um jato conforme a
       * varredura gira lê como defeito. O único grau de liberdade que não muda a direção do jato
       * é o giro em torno do próprio eixo — então é esse que se usa. `worldToLocal` no eixo
       * magnético leva a câmera para o referencial em que esse giro é simplesmente `rotation.y`,
       * e a conta tem de vir depois de `eixoRotacao`/`eixoMagnetico` já estarem postos, senão ela
       * usa a pose do quadro anterior.
       */
      if (camera) {
        eixoMagnetico.updateWorldMatrix(true, false);
        eixoMagnetico.worldToLocal(OLHO.copy(camera.position));
        const giro = Math.atan2(OLHO.x, OLHO.z);
        for (const jato of jatos) jato.rotation.y = giro;

        /*
         * O eixo magnético em MUNDO, e daí duas coisas que precisam dele.
         *
         * O núcleo recebe o eixo em espaço LOCAL dele para recortar as calotas quentes; os feixes
         * recebem o cosseno contra a linha de visada para o beaming relativístico. É a mesma
         * direção lida em dois referenciais, e é por isso que ela é calculada uma vez só.
         */
        EIXO.set(0, 1, 0).applyQuaternion(eixoMagnetico.getWorldQuaternion(QUAT)).normalize();
        VISADA.copy(camera.position).sub(group.position).normalize();
        const alinhamento = Math.abs(EIXO.dot(VISADA));
        ultimo.alinhamento = alinhamento;
        for (const mat of [jatoMat, loboMat]) mat.uniforms.uAlign.value = alinhamento;
        core.updateWorldMatrix(true, false);
        core.worldToLocal(coreMat.uniforms.uMag.value.copy(group.position).addScaledVector(EIXO, 1));
        // A magnetosfera lê o MESMO eixo, no referencial dela. Duas contas do mesmo ângulo seriam
        // a duplicata que este arquivo já pagou — e o campo inclinado para um lado com o feixe
        // para outro é o tipo de erro que ninguém vê até orbitar.
        campo.updateWorldMatrix(true, false);
        campo.worldToLocal(campoMat.uniforms.uMag.value.copy(group.position).addScaledVector(EIXO, 1));
      }
      return level;
    },

    dispose() {
      cascaGeo.dispose();
      campoMat.dispose();
      for (const casca of halos) casca.material.dispose();
      nebulosaMat.dispose();
      core.geometry.dispose();
      coreMat.dispose();
      for (const feixe of [...jatos, ...lobos]) feixe.geometry.dispose();
      jatoMat.dispose();
      loboMat.dispose();
      pulso.dispose();
      vento.dispose();
    },
  };
}
