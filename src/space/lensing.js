/**
 * O buraco negro visto por um observador — e o acabamento de câmera, no mesmo passe.
 *
 * ⚠️ **A frase que este cabeçalho trazia era "a deflexão é analítica: a imagem é reamostrada com
 * deslocamento radial ∝ 1/d²". Isso descrevia o módulo antigo e não descreve mais este.** Vale
 * registrar porque a versão anterior guardou uma afirmação falsa por três iterações, e o custo foi
 * caçar no shader do disco um defeito que morava na arquitetura.
 *
 * ## O princípio, e ele governa o arquivo inteiro
 *
 * > Um buraco negro não é um objeto que faz efeitos. Ele altera a geometria do espaço-tempo, e
 * > todo o resto é consequência dessa única propriedade.
 *
 * Não há aqui um efeito de sombra, um de lente, um de anel e um de disco. Há **uma** função —
 * `tracarGeodesica`, em `blackhole-geodesic.js` — e cada feição é uma leitura dela:
 *
 * | o que se vê | a pergunta que o raio respondeu |
 * |---|---|
 * | a sombra | fui capturado? (`b < √27/2·R_s`, exato e circular) |
 * | a lente | com que direção eu cheguei? |
 * | o anel de fótons | quantas voltas eu dei antes de escapar? |
 * | o disco | onde cruzei o plano equatorial? |
 * | o beaming | o gás naquele ponto vinha na minha direção? |
 * | o arco por cima da sombra | cruzei o plano ATRÁS da massa |
 *
 * Nenhuma dessas linhas é desenhada. Todas acontecem.
 *
 * ## O que a lente precisa saber, e o que faltava
 *
 * Reamostrar a imagem pela direção de chegada exige distinguir de que LADO da massa está a
 * superfície que pintou cada pixel — a cor sozinha não diz. Por isso o passe recebe também a
 * PROFUNDIDADE da cena (`setDepth`): luz de quem está na frente segue reta e não pode ser tocada;
 * luz de quem está atrás curva, e é ela que contorna a sombra em vez de sumir nela.
 *
 * Os efeitos de câmera continuam aqui pelo motivo de sempre — são todos reamostragem da mesma
 * textura, e um passe por efeito custaria uma cópia de framebuffer cada: aberração cromática,
 * distorção de barril, vinheta, grão e scanline.
 *
 * Escolha explícita: **não** há depth of field. Agora que existe depth ele seria possível, mas
 * continua sendo um passe separado e um orçamento que o raymarch já consome.
 */
import * as THREE from 'three';
import { ShaderPass } from '../../vendor/jsm/postprocessing/ShaderPass.js';
import { GLSL_GEODESIC, GEODESIC_STEPS } from './blackhole-geodesic.js';

/**
 * A escada de detalhe do buraco negro, em pixels de raio da SOMBRA.
 *
 * ⚠️ Os números são os mesmos de `rings.js` (26/90) e `planet.js` (90/200), e o reúso é deliberado:
 * `galaxy.js` avisa que uma quarta escada de pixel descorrelacionada nesta cena é uma armadilha de
 * manutenção, e a pergunta aqui é a mesma que lá — *há estrutura dentro deste disco que valha
 * resolver?*
 *
 * MEDIDO nesta cena, com `fov` 80 e framebuffer de 1416 de altura: a sombra vai de **20 px** no
 * fundo do zoom (dist 260) a **432 px** no topo (dist 12). A escada cobre a faixa inteira, com o
 * degrau baixo caindo justamente na vista do céu, que é onde o buraco negro é um detalhe entre 579
 * corpos.
 */
const LOD_FAR_PX = 26;
const LOD_NEAR_PX = 200;
/**
 * Orçamento de passos no degrau mais baixo.
 *
 * ⚠️ Não é zero, e não pode ser: a LENTE tem de sobreviver a qualquer distância. 18 passos ainda
 * atravessam a esfera de influência e produzem sombra e deflexão — o que se perde é a resolução do
 * anel de fótons, que a 20 px não teria onde aparecer de qualquer forma.
 */
const MIN_STEPS = 18;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  /*
   * A PROFUNDIDADE DA CENA, e sem ela a lente nao e uma lente.
   *
   * Um fóton que chega de um corpo NA FRENTE da massa nunca passou perto dela: a geodesica dele e
   * reta e a imagem nao pode ser tocada. Um que chega de um corpo ATRAS passou, e a dele curva.
   * A cor sozinha nao distingue os dois casos — as duas superficies pintam o mesmo pixel.
   *
   * uNear/uFar linearizam o buffer nao-linear; uBhDist e a distancia da camera ao centro da
   * massa, que e a fronteira que separa "antes" de "depois".
   */
  uniform sampler2D tDepth;
  uniform float uNear, uFar;
  uniform float uBhDist;
  uniform float uHasDepth;
  uniform float uStrength;   // força da lente, como MULTIPLICADOR do traçado
  uniform float uAspect;
  uniform float uTime;
  uniform float uGrain;
  uniform float uAberration;
  uniform float uGlitch;
  uniform float uVignette;
  // A câmera, para reconstruir o raio de cada pixel e reprojetar a direção de saída.
  uniform vec3 uCamPos;
  uniform vec3 uCamRight, uCamUp, uCamFwd;
  uniform float uTanHalfFov;
  uniform mat4 uViewProj;
  varying vec2 vUv;

  ${GLSL_GEODESIC}

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  vec2 barrel(vec2 uv, float amount){
    vec2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    return 0.5 + centered * (1.0 + amount * r2);
  }

  void main(){
    vec2 uv = barrel(vUv, 0.06);

    /*
     * O RAIO DESTE PIXEL, em espaco de MUNDO.
     *
     * A base da camera chega pronta do JS (direita/cima/frente ja ortonormais) porque reconstrui-la
     * aqui a partir da inversa da projecao custaria duas matrizes por fragmento para produzir
     * exatamente os mesmos tres vetores, iguais para a tela inteira.
     */
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 dir = normalize(
      uCamFwd
      + uCamRight * (ndc.x * uTanHalfFov * uAspect)
      + uCamUp * (ndc.y * uTanHalfFov)
    );

    /*
     * O TRACADO. Ele devolve o que o raio ENCONTROU (disco, e alfa 1 se caiu no horizonte) e a
     * direcao com que saiu. uStrength continua sendo o controle do operador, mas agora ele mistura
     * entre "sem lente" e "lente inteira" em vez de escalar uma deflexao inventada — o painel de
     * afinacao de quem ja usou continua com significado.
     */
    /*
     * DE QUE LADO DA MASSA ESTA A SUPERFICIE QUE PINTOU ESTE PIXEL.
     *
     * O buffer de profundidade e nao-linear; linearizar devolve a distancia real ao longo do
     * eixo da camera. Onde nada foi desenhado o valor satura em 1 e a distancia vai para uFar,
     * que e o comportamento certo: o ceu vazio esta atras de tudo.
     *
     * A fronteira nao e uma linha dura. Ela e uma RAMPA de meia esfera de influencia, porque a
     * curvatura tambem nao tem fronteira — ela cai continuamente, e um corte abrupto aqui poria
     * uma costura visivel no ar onde a fisica nao tem nenhuma.
     */
    float bruto = texture2D(tDepth, uv).x;
    float ndcZ = bruto * 2.0 - 1.0;
    float profundidade = (2.0 * uNear * uFar) / (uFar + uNear - ndcZ * (uFar - uNear));
    /*
     * ⚠️ uHasDepth continua existindo mesmo com a profundidade JA LIGADA, e nao e sobra.
     *
     * setDepth o poe em 1; sem textura ele fica em 0 e o fator vale 1, que reproduz o
     * comportamento antigo (tudo tratado como se estivesse atras da massa). Ele existe porque um
     * sampler NAO LIGADO devolve preto: a profundidade linearizada colapsaria perto de uNear, o
     * fator iria a zero e a lente sumiria INTEIRA — em silencio, sem erro nenhum, exatamente o
     * modo de falha mais caro desta base.
     *
     * Enquanto a montagem da cena puder mudar (e ela mudou tres vezes hoje), o interruptor e o que
     * separa "a lente esta desligada" de "a lente quebrou".
     */
    float atrasDaMassa = mix(1.0, smoothstep(
      uBhDist - uDiskOuter * 1.25,
      uBhDist + uDiskOuter * 0.25,
      profundidade
    ), uHasDepth);

    vec3 dirFinal = dir;
    vec4 tracado = tracarGeodesica(uCamPos, dir, dirFinal);
    /*
     * uStrength e um BOTAO, nao fisica — ele sobrevive por compatibilidade com quem ja afinou o
     * painel. atrasDaMassa e que e fisica: a luz de quem esta na frente segue reta, e por isso a
     * deflexao dela e zerada em vez de atenuada.
     */
    dirFinal = normalize(mix(dir, dirFinal, clamp(uStrength, 0.0, 1.0) * atrasDaMassa));

    /*
     * ONDE O FUNDO E LIDO. A direcao de saida e reprojetada para a tela, entao as estrelas, as
     * galaxias e os corpos ja renderizados ESCORREGAM em volta do buraco — o passe nao inventa um
     * ceu, ele reamostra o que a cena desenhou.
     *
     * ⚠️ Isso e exato so para o que esta no infinito. O grafo orbita a r ~ 91-217 contra ~6 de raio
     * de sombra, entao o erro de paralaxe e pequeno; e a mesma aproximacao que a versao anterior ja
     * fazia, agora com a deflexao certa.
     */
    vec4 clipe = uViewProj * vec4(dirFinal, 0.0);
    vec2 fundoUv = clipe.w > 0.0001 ? (clipe.xy / clipe.w) * 0.5 + 0.5 : uv;

    /*
     * ⚠️ FORA DO QUADRO NAO HA INFORMACAO — e ignorar isso produzia a COSTURA que atravessava a
     * tela inteira.
     *
     * A deflexao forte manda fundoUv para fora de [0,1], e a textura da cena e ClampToEdge: um
     * texel da borda passa a ser esticado por centenas de pixels. O sintoma sao faixas de cor
     * chapada com fronteiras perfeitamente retas — que foi o que o usuario fotografou e eu
     * diagnostiquei errado duas vezes (culpei o disco, depois a espessura dele; nenhum dos dois
     * podia encher o quadro, porque o disco termina em 43 unidades).
     *
     * A luz daquela direcao existe de verdade; o que nao existe e um pixel dela, porque a cena so
     * foi renderizada dentro do quadro. Entao a deflexao e desfeita conforme a amostra sai da tela:
     * perto da borda ela volta ao pixel nao defletido em vez de repetir o texel da borda.
     *
     * ⚠️ E LIMITE DE TECNICA, nao de fisica, e fica declarado como tal: reamostrar a imagem so sabe
     * mostrar o que ja esta nela. Mostrar o que esta fora exigiria renderizar um cubemap por
     * quadro. A margem de 0,04 e a menor que esconde a transicao sem comer lente util.
     */
    vec2 foraDoQuadro = max(vec2(0.0) - fundoUv, fundoUv - vec2(1.0));
    float excesso = max(max(foraDoQuadro.x, foraDoQuadro.y), 0.0);
    fundoUv = mix(fundoUv, uv, smoothstep(0.0, 0.04, excesso));
    // Direcao radial na tela, para a aberracao acompanhar a torcao em vez de apontar sempre igual.
    vec2 desvio = fundoUv - uv;
    vec2 radial = length(desvio) > 0.0001 ? normalize(desvio) : vec2(1.0, 0.0);

    // Aberracao cromatica: uma amostra por canal, deslocada ao longo do desvio da lente. Franja
    // para ser notada de relance, nao para pintar o ceu de arco-iris.
    float shift = uAberration * min(0.0006 + length(desvio) * 0.35, 0.0012);
    float glitchOffset = uGlitch * (hash(vec2(floor(vUv.y * 90.0), floor(uTime * 14.0))) - 0.5) * 0.05;
    fundoUv.x += glitchOffset;

    vec3 color;
    color.r = texture2D(tDiffuse, fundoUv + radial * shift).r;
    color.g = texture2D(tDiffuse, fundoUv).g;
    color.b = texture2D(tDiffuse, fundoUv - radial * shift).b;

    /*
     * A SOMBRA e o alfa do tracado, e nao ha rampa escrita a mao nenhuma.
     *
     * A versao anterior tinha dois smoothsteps de raio (nucleo e residuo) escolhidos para imitar
     * uma borda macia. Aqui a maciez e o resultado: perto do parametro de impacto critico raios
     * vizinhos escapam por muito pouco, entao a fracao capturada varia continuamente de pixel para
     * pixel. A borda mais dificil de localizar da imagem — que e o que um horizonte de eventos tem
     * — sai da fisica em vez de ser aproximada por uma curva.
     */
    /*
     * O HORIZONTE BLOQUEIA, O DISCO SOMA — e a primeira versao misturava os dois num mix so.
     *
     * tracado.a e 1 apenas quando o raio caiu no buraco, entao o fundo e apagado exatamente na
     * sombra e em lugar nenhum mais. O disco entra ADITIVO, como todo emissor desta cena, e por
     * isso as estrelas, as galaxias e os 579 corpos continuam visiveis atraves dele — inclusive
     * DEFORMADOS, que era o que sumia quando o disco substituia o fundo.
     */
    /*
     * A SOMBRA SO APAGA O QUE ESTA ATRAS DA MASSA.
     *
     * Ela nao e uma mascara pintada no centro da tela: e o conjunto dos raios capturados, e um
     * raio so pode capturar luz que viria DE TRAS. Uma superficie na frente continua visivel
     * exatamente onde estava — e por isso que atrasDaMassa multiplica aqui tambem, e nao so na
     * deflexao. Sem isso um corpo passando na frente seria recortado por um buraco preto, que e a
     * mesma inversao de outra forma.
     *
     * O DISCO SOMA, porque ele emite. Todo emissor desta cena e aditivo pelo mesmo motivo.
     */
    /*
     * ⚠️ O DISCO TAMBEM E ATRAS DA MASSA, e esta linha somava ele por cima de tudo.
     *
     * A sombra ja era filtrada por atrasDaMassa; a emissao do disco NAO era, e o comentario acima
     * afirmava a regra inteira enquanto o codigo aplicava metade dela. O usuario fotografou o
     * resultado: um planeta em foco, com o buraco negro longe ATRAS dele, aparecia atravessado pela
     * faixa alaranjada do disco.
     *
     * E ele nomeou a razao sozinho, e ela e exata: o disco NAO dobra a luz, ele EMITE. Deflexao e
     * do nucleo; emissao e materia comum, e materia comum atras de um corpo opaco simplesmente nao
     * chega ao olho. Isto e ocultacao, e nao tem sutileza relativistica nenhuma — nada em campo
     * forte faz um disco de acrecao atravessar um planeta.
     */
    /*
     * A POEIRA E O DISCO SO APARECEM CONFORME SE CHEGA PERTO — pedido do usuario em 2026-08-07.
     *
     * ⚠️ Isto e COMPOSICAO, e por isso mora AQUI e nao no integrador. A REGRA DA FISICA e explicita:
     * a simulacao produz o universo, a camera escolhe como observa-lo, e problema que pode ser
     * resolvido fora da simulacao DEVE ser resolvido fora dela. Um envelope por distancia dentro da
     * deflexao ja foi escrito e REVERTIDO nesta base (e a invariante 5 do handoff) — a lente
     * continua valendo a qualquer distancia, e nada aqui a toca.
     *
     * O que atenua e so a EMISSAO. A sombra (tracado.a) nao entra: ela e o objeto, e um buraco
     * negro longe continua sendo um buraco. Atenuar a sombra o faria desaparecer do ceu, que e o
     * oposto do pedido.
     *
     * A REGUA E O TAMANHO APARENTE, nao a distancia em unidades de mundo — e a mesma que decide
     * nivel de detalhe em todo o resto da cena (ver space/lod.js). uRs/distancia e o raio do horizonte em
     * radianos; dividido por uTanHalfFov vira a fracao da MEIA-ALTURA da tela que ele ocupa, que
     * nao depende de monitor, de zoom nem de fov. Os dois limiares em fracao de meia-altura:
     * abaixo de 0,02 (um risco no ceu) nao ha poeira nenhuma; em 0,22 ela esta cheia.
     */
    float aparente = (uRs / max(length(uCamPos - uBhPos), 1e-3)) / max(uTanHalfFov, 1e-3);
    float poeira = smoothstep(0.02, 0.22, aparente);
    color *= 1.0 - tracado.a * atrasDaMassa;
    color += tracado.rgb * atrasDaMassa * poeira;

    float vignette = mix(1.0, smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.6), uVignette);
    color *= vignette;

    float grain = (hash(vUv * 900.0 + uTime * 60.0) - 0.5) * uGrain;
    float scanline = 1.0 - 0.025 * step(0.5, fract(vUv.y * 420.0));
    gl_FragColor = vec4((color + grain) * scanline, 1.0);
  }
`;

export function createLensingPass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uStrength: { value: 0.85 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uGrain: { value: 0.03 },
      uAberration: { value: 1 },
      uGlitch: { value: 0 },
      uVignette: { value: 1 },
      // A câmera, para o traçado montar o raio de cada pixel.
      uCamPos: { value: new THREE.Vector3() },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
      uTanHalfFov: { value: 1 },
      uViewProj: { value: new THREE.Matrix4() },
      // O buraco negro e o disco, em unidades de MUNDO — vêm de `blackHole.geometry()`.
      uBhPos: { value: new THREE.Vector3() },
      uRs: { value: 1 },
      uDiskInner: { value: 4 },
      uDiskOuter: { value: 39 },
      uDiskSpin: { value: 0.18 },
      uDiskIntensity: { value: 0.75 },
      uDiskTurbulence: { value: 0.6 },
      uDiskTime: { value: 0 },
      uErrorMix: { value: 0 },
      uHot: { value: new THREE.Color(0xffdba8) },
      uMid: { value: new THREE.Color(0xff8f3c) },
      uCool: { value: new THREE.Color(0x521705) },
      // A escada de detalhe. Ver `syncLod` e o cabeçalho de `blackhole-geodesic.js`.
      uSteps: { value: GEODESIC_STEPS },
      uStepScale: { value: 0.12 },
      uDiskDetail: { value: 1 },
      // A profundidade da cena. Ligada uma vez por `setDepth`, ver a nota no shader.
      tDepth: { value: null },
      uNear: { value: 0.1 },
      uFar: { value: 900 },
      uBhDist: { value: 1 },
      uHasDepth: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: FRAGMENT,
  });

  return {
    pass,

    /**
     * Projeta o horizonte para coordenadas de tela a cada quadro. Fixar o centro em (0.5,
     * 0.5) quebraria assim que a câmera orbitasse: a lente descolaria do objeto.
     */
    sync(camera, blackHole, size, { glitch = 0 } = {}) {
      const uniforms = pass.uniforms;

      /*
       * A BASE DA CÂMERA, montada aqui e não no shader.
       *
       * São três vetores iguais para a tela inteira; reconstruí-los por fragmento a partir da
       * inversa da projeção custaria duas matrizes por pixel para chegar no mesmo lugar.
       *
       * ⚠️ `uCamUp` sai da MATRIZ da câmera, não de `(0,1,0)`. A cena tem `cameraDrift` e o polar
       * chega perto do zênite: com um "up" fixo o raio ficaria torto exatamente nas poses em que o
       * disco é visto quase de cima, que são as que o operador mais usa.
       */
      camera.updateMatrixWorld();
      uniforms.uCamPos.value.copy(camera.position);
      uniforms.uCamRight.value.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      uniforms.uCamUp.value.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      // A terceira coluna é o eixo +Z da câmera, que aponta para TRÁS: a frente é o negativo dela.
      uniforms.uCamFwd.value.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate();
      uniforms.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      uniforms.uViewProj.value.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );

      /*
       * A geometria vem do `blackHole`, JÁ multiplicada pela escala do grupo. Recalculá-la aqui foi
       * exatamente o defeito medido da versão anterior: este passe lia `horizonRadius` cru e ficava
       * 2,05× menor que o objeto na tela, desenhando o anel de fótons dentro do preto.
       */
      const bh = blackHole.geometry();
      const distancia = Math.max(camera.position.distanceTo(bh.center), 1e-4);
      uniforms.uBhPos.value.copy(bh.center);
      uniforms.uRs.value = bh.rs;
      uniforms.uDiskInner.value = bh.inner;
      uniforms.uDiskOuter.value = bh.outer;
      uniforms.uDiskSpin.value = bh.spin;
      uniforms.uDiskIntensity.value = bh.intensity;
      uniforms.uDiskTurbulence.value = bh.turbulence;
      uniforms.uErrorMix.value = bh.error;
      uniforms.uHot.value.copy(bh.hot);
      uniforms.uMid.value.copy(bh.mid);
      uniforms.uCool.value.copy(bh.cool);

      /*
       * A ESCADA. O raio aparente da sombra é a mesma projeção geométrica que o resto da cena usa
       * (`galaxy.diskPx`, `planet`), nunca `gl_PointSize` — o valor do sprite satura no teto do
       * driver e oscila, e `graph.js` registra que foi assim que a superfície do planeta piscou.
       *
       * `size` vem de `renderer.getSize`, que é CSS; a escada foi medida em pixels de FRAMEBUFFER,
       * então o `devicePixelRatio` entra aqui. Foi essa exata troca de régua que escondeu um DPR
       * inteiro da bancada do anel.
       */
      const alturaFb = size.height * (window.devicePixelRatio || 1);
      const meiaAltura = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distancia;
      const px = (this.shadowRadiusOf(bh) * (alturaFb / 2)) / Math.max(meiaAltura, 1e-4);
      const detalhe = THREE.MathUtils.smoothstep(px, LOD_FAR_PX, LOD_NEAR_PX);

      const passos = THREE.MathUtils.lerp(MIN_STEPS, GEODESIC_STEPS, detalhe);
      uniforms.uSteps.value = passos;
      /*
       * O PASSO CRESCE QUANDO O ORÇAMENTO ENCOLHE, e é isso que impede a escada de virar regressão.
       *
       * Com passo fixo, cortar passos deixaria o raio parado no meio do caminho: a sombra e a
       * deflexão sumiriam ao afastar, que é exatamente o comportamento que o pedido proíbe. Como o
       * passo é proporcional a `r`, o raio percorre `ln(R/R_s)` em unidades de `escala` — então
       * fixar `escala = ln(R/R_s) / (passos · fração)` faz QUALQUER orçamento atravessar a esfera
       * inteira. O 0,62 é a fatia do orçamento gasta chegando até o horizonte; o resto sobra para
       * os cruzamentos do disco e para as voltas perto do anel de fótons.
       */
      const alcance = Math.log(Math.max((bh.outer * 1.25) / Math.max(bh.rs, 1e-4), Math.E));
      uniforms.uStepScale.value = alcance / Math.max(passos * 0.62, 1);
      uniforms.uDiskDetail.value = detalhe;

      // A fronteira que separa "antes da massa" de "depois dela", para o teste de profundidade.
      uniforms.uBhDist.value = distancia;

      uniforms.uAspect.value = size.width / size.height;
      uniforms.uGlitch.value = glitch;
    },

    /** O raio da sombra em mundo, a partir do que `blackHole.geometry()` já devolve. */
    shadowRadiusOf: (bh) => (bh.rs * Math.sqrt(27)) / 2,

    /**
     * Liga a profundidade da cena. Chamada UMA vez, na montagem do composer.
     *
     * A textura é a mesma instância pela vida toda do alvo de render, então não há o que atualizar
     * por quadro — o que muda por quadro é `uBhDist`, e ele é escrito no `sync`.
     */
    setDepth(depthTexture, near, far) {
      pass.uniforms.tDepth.value = depthTexture;
      pass.uniforms.uHasDepth.value = depthTexture ? 1 : 0;
      pass.uniforms.uNear.value = near;
      pass.uniforms.uFar.value = far;
    },

    /** Afinação da lente. `setCinematic` continua por cima, como offset temporário. */
    tune(values) {
      pass.uniforms.uStrength.value = values.lensStrength;
      pass.uniforms.uAberration.value = values.aberration;
      pass.uniforms.uGrain.value = values.grain;
      pass.uniforms.uVignette.value = values.vignette;
    },

    setTime(elapsed) {
      pass.uniforms.uTime.value = elapsed;
      /*
       * O disco tem o PRÓPRIO relógio, e ele é o mesmo número — mas com nome separado de propósito.
       * `uTime` move grão e glitch, que são acabamento de câmera; `uDiskTime` move a matéria. Um
       * "congelar o grão" futuro não pode parar o disco junto.
       */
      pass.uniforms.uDiskTime.value = elapsed;
    },

    /**
     * Modo cinematográfico: lente mais suja e mais forte, como MULTIPLICADOR do que está
     * afinado. Fixar constantes aqui apagaria o ajuste do painel a cada TAB.
     */
    setCinematic(on, values) {
      const factor = on ? 1 : 0;
      pass.uniforms.uGrain.value = values.grain * (1 + factor * 0.85);
      pass.uniforms.uAberration.value = values.aberration * (1 + factor * 0.8);
      pass.uniforms.uStrength.value = values.lensStrength * (1 + factor * 0.24);
    },
  };
}
