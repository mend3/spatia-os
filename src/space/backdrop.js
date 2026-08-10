/**
 * FUNDO DO UNIVERSO — uma casca estelar em volta da cena, ligada ou desligada.
 *
 * `assets/sky/stars.jpg` é 8192×4096, razão 2:1 exata: um mapa equirretangular, feito para envolver
 * uma esfera. Ele entra assim, e não como imagem de tela.
 *
 * ## Por que dentro da CENA, e não uma camada CSS atrás do canvas
 *
 * Uma `<div>` com `background-image` atrás do canvas seria mais simples e estaria errada: o canvas
 * teria de virar transparente, e aí o fundo apareceria ATRAVÉS do buraco negro e dos astros — nada
 * na cena poderia tapá-lo, porque nada na cena o alcança.
 *
 * ## Por que uma CASCA, e não um quad em espaço de recorte
 *
 * ☠️ **Quad em espaço de recorte é imune ao ZOOM, e a imunidade é estrutural.** Ele mora na tela, não
 * no mundo: a única paralaxe possível é uma que se calcule à mão, e a que existia lia
 * `camera.position.x / hypot(x, z)` — um vetor NORMALIZADO. Direção sem módulo, então aproximar e
 * afastar entravam na conta como o mesmo número, e o fundo ficava pregado enquanto a cena inteira
 * mergulhava. O sintoma não é um erro: é a ausência de sensação de profundidade, que ninguém sabe
 * onde procurar.
 *
 * Numa casca de raio finito o fenômeno sai de graça e correto. Com a câmera perto do centro a
 * textura chega no tamanho angular dela; recuando na direção da parede, o lado oposto se afasta para
 * `R + r` e a mesma textura COMPRIME num campo fino. Estrelas perto do ponto para onde a câmera vai
 * quase não andam, e as das bordas varrem para fora — que é o que se lê como movimento.
 *
 * ⚠️ **O RAIO é a força do efeito, nunca a ordem de desenho.** A casca tem `depthTest: false` e o
 * `renderOrder` mínimo, então pinta primeiro aconteça o que acontecer e tudo o mais a tapa na ordem
 * natural — a oclusão não depende de ela estar de fato mais longe que os astros. Isso libera o raio
 * para ser escolhido pela PARALAXE que ele produz na faixa de zoom em uso.
 *
 * ⭑ **A refutação que sobreviveu do desenho anterior, porque ela volta a morder em qualquer paralaxe
 * calculada à mão:** azimute entra como SENO, nunca como ângulo. `orbit.azimuth` é ilimitado, então
 * `atan2` tem corte de ramo e a volta completa dá um salto da excursão inteira num quadro só — a
 * mesma família da costura do disco do buraco negro, coordenada cíclica consumida por algo que não é
 * periódico nela. A casca não tem esse problema por não fazer a conta.
 *
 * ## Uma camada, e o que isso custa
 *
 * ⚠️ **Duas cascas de raios diferentes deslizam uma contra a outra**, e esse deslize é uma segunda
 * pista de profundidade — independente da primeira. Com uma só, o que resta é a dilatação por
 * `R + r`, que é a pista principal e a que responde ao zoom. Quem quiser a segunda de volta precisa
 * de um SEGUNDO mapa: repetir este numa casca interna produziria dupla exposição do mesmo céu, não
 * profundidade.
 *
 * ## O ganho é baixo de propósito
 *
 * A cadeia de pós-processamento é 87–90% do tempo de GPU do quadro e o bloom soma tudo que passa do
 * limiar. Um fundo em brilho pleno estouraria o bloom inteiro e apagaria a HUD hairline, que é o
 * oposto de "fundo". `GAIN` mantém a imagem como AMBIENTE — legível, nunca protagonista.
 */
import * as THREE from 'three';

/*
 * Quanto do brilho da imagem chega à tela.
 *
 * ☠️ **O GANHO NÃO ERA O PROBLEMA, e perder tempo nele é a armadilha deste módulo.** Com o mapa
 * carregado, o uniform certo e a casca cobrindo o quadro, o céu ainda saía PRETO — e subir o ganho
 * de 0,16 para 2,5 (15,6×) moveu a média da região de céu de 1,89 para 2,18 em 255. Multiplicador
 * que não multiplica é sinal de que a perda está ANTES dele: era colorimetria (ver `textura()`).
 *
 * ⭑ **A régua é MEDIDA, não gosto.** Amostrando a mesma região de céu em 400×260 px:
 *
 * | | média/255 | acima de 4/255 |
 * |---|---|---|
 * | app de referência | 12,54 | 94,9% |
 * | aqui, ganho 1,0 | 15,89 | 69,6% |
 * | **aqui, ganho 0,8** | **8,76** | 46,3% |
 *
 * Ficar ~30% ABAIXO da referência é decisão: a HUD desta base é hairline e mora SOBRE o céu, o que
 * não vale para os painéis opacos de lá. O bloom soma tudo que passa do limiar, e cada ponto claro
 * do mapa vira mais brilho depois desta multiplicação.
 *
 * Escolhido olhando a CENA com a cadeia ligada. Medir na bancada responderia a pergunta errada,
 * que foi exatamente o erro cometido antes com o τ do anel.
 */
export const GAIN = 0.8;

/**
 * O raio da casca, e ele é a AMPLITUDE do efeito.
 *
 * O trecho de casca à FRENTE da câmera está a `R + r`, então a mesma estrela muda de tamanho
 * aparente na razão `(R + r_longe) / (R + r_perto)`. O zoom do UNIVERSO vai do piso (~5, que sai do
 * raio do corpo mais próximo) a `ZOOM_RANGE.max` = 260 (`scene.js`), e com 420 isso dá **1,60× de
 * excursão** — a referência entrega 1,92× com a câmera indo a 8–200 numa casca de 200.
 *
 * ⚠️ **O alcance da câmera não é `ZOOM_RANGE.max`, é ele MAIS a âncora.** A âncora do universo
 * passeia pelos sistemas e o universo inteiro cabe em ±41,6, então a câmera chega a ~302 — e é 302
 * que a degradação abaixo precisa deixar passar, não 260. Confundir os dois faz o fundo começar a
 * escorregar dentro do gesto normal.
 *
 * ⭑ **Custo medido em 2026-08-10** (UNIVERSO, mesma pose, 3 repetições por versão, `renderCost(90)`):
 * o passe de cena vai de **0,475 ms** (quad em espaço de recorte) para **0,651 ms** com DUAS cascas.
 * Com uma só ele fica entre os dois. O quadro com a cadeia não piora — o pós é por PIXEL, e casca
 * não muda contagem de pixel.
 */
export const SHELL = 420;

/**
 * Até onde a câmera pode ir sem que a casca precise escorregar.
 *
 * ⚠️ Ele tem de ficar ACIMA do alcance real da câmera (`ZOOM_RANGE.max` + a âncora), senão a
 * degradação morde dentro do gesto normal e o fundo para de responder ao zoom **sem sintoma**.
 * `scripts/lei-fundo.mjs` lê o `ZOOM_RANGE` do `scene.js` e confere isto.
 */
export const LIMITE = SHELL * 0.9;

/**
 * A NÉVOA — e ela é o que faz o fundo ter PROFUNDIDADE em vez de só tamanho.
 *
 * ⭑ **O trecho de casca à FRENTE da câmera está a `R + r`; o de trás, a `R − r`.** Uma névoa linear
 * escurece o primeiro e deixa o segundo limpo, então afastar abre uma região escura no centro da
 * vista e aproximar a fecha — com `r → 0` toda a casca fica a `R` e a névoa vira uniforme. É a
 * mesma grandeza que dilata a textura, lida por outro canal: **o zoom passa a informar distância
 * duas vezes**, por tamanho e por extinção.
 *
 * ☠️ **Sem ela o fundo tem dilatação e não tem profundidade** — a diferença que se lê como "falta
 * alguma coisa" sem ter onde apontar.
 *
 * ☠️ **NÃO copie os limiares da referência escalando pelo raio — medido, o resultado é névoa
 * saturada no quadro inteiro.** Lá a câmera chega à PAREDE (`r` até `R`) e o fov é 75°, então a
 * faixa de distância visível é larga e a rampa `0,90R–1,25R` cai dentro dela. Aqui `r` só alcança
 * **0,62R** e o fov é 46°: a 260 o quadro inteiro vê a casca entre **647 e 680** — 33 unidades de
 * variação, tudo além de `1,25R`. A rampa tem de cobrir a faixa que a NOSSA geometria produz, que
 * é `R` (casca com a câmera no centro) a `2R` (o extremo do afastamento).
 *
 * ⚠️ **E a cor é PRETA, não o azul de lá.** `0x000814` é a cor de fundo de cena DELES; aqui o fundo
 * é preto, e importar o azul pinta de azul tudo o que a névoa alcança — que é quase o quadro todo
 * no afastamento. Névoa desvanece PARA O FUNDO, seja ele qual for.
 */
export const FOG = Object.freeze({ near: SHELL, far: SHELL * 2, color: [0, 0, 0] });

/**
 * Por quanto multiplicar a posição da câmera para achar onde a casca deve ficar.
 *
 * `ancoraLivre` não tem limite — o pan leva a câmera para onde quiser, e vista de FORA uma esfera
 * `BackSide` simplesmente some. Em vez de desaparecer, a casca escorrega para manter a câmera
 * dentro: a paralaxe satura e o fundo continua lá, que é degradar anunciando em vez de falhar
 * calado. Dentro do limite devolve 0 — a casca fica na origem e nada muda.
 *
 * @param {number} raio  distância da câmera à origem
 * @returns {number} fator em [0, 1)
 */
export function escorregarPara(raio) {
  return raio > LIMITE ? 1 - LIMITE / raio : 0;
}

export const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vNdc;
  varying float vDist;

  void main(){
    vUv = uv;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    // A DISTANCIA a camera, que e o que a nevoa consome. Ela varia de R-r a R+r pela casca.
    vDist = length(view.xyz);
    vec4 clip = projectionMatrix * view;
    // A vinheta e de TELA, entao ela precisa da posicao normalizada de tela, nao da UV da esfera.
    vNdc = clip.xy / max(abs(clip.w), 1e-4);
    gl_Position = clip;
  }
`;

export const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uGain;
  uniform vec3 uFogColor;
  uniform vec2 uFogRange;
  varying vec2 vUv;
  varying vec2 vNdc;
  varying float vDist;

  void main(){
    vec3 color = texture2D(uMap, vUv).rgb;

    /*
     * NEVOA LINEAR, a mesma forma de THREE.Fog — e ela e o que da PROFUNDIDADE ao fundo.
     *
     * O trecho de casca a frente esta a R+r e o de tras a R-r, entao afastar mergulha o centro da
     * vista na nevoa e aproximar a dissolve. Linear e nao smoothstep de proposito: e a curva que o
     * app de referencia usa, e trocar por outra muda o quanto a mancha cresce por unidade de zoom.
     */
    float fog = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
    color = mix(color, uFogColor, fog);

    /*
     * Vinheta, e ela nao e estilo.
     *
     * A HUD e hairline e mora nas BORDAS da tela; fundo em brilho cheio ali disputa contraste com
     * texto de 8px e ganha. Escurecendo as bordas, o fundo entrega o centro — que e onde esta o
     * sistema — e devolve as beiradas para a interface.
     *
     * NAO use crase em comentario aqui: ela fecha este template literal e o modulo inteiro vira
     * SyntaxError. Ja aconteceu quatro vezes nesta base.
     */
    float vignette = 1.0 - 0.62 * pow(length(vNdc) * 0.71, 2.0);
    gl_FragColor = vec4(color * uGain * max(vignette, 0.0), 1.0);
  }
`;

/** Textura 1×1 preta: o estado inicial e o que sobra quando o fundo está desligado. */
function blackPixel() {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

export function createBackdrop() {
  const loader = new THREE.TextureLoader();
  const empty = blackPixel();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: empty },
      uGain: { value: 0 },
      uFogColor: { value: new THREE.Color(...FOG.color) },
      uFogRange: { value: new THREE.Vector2(FOG.near, FOG.far) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // Vista por DENTRO: é o que envolve a câmera em vez de ficar à frente dela.
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SHELL, 64, 48), material);
  mesh.renderOrder = -1000;
  // A casca envolve a câmera, então ela nunca sai do frustum — mas o teste custa e não decide nada.
  mesh.frustumCulled = false;
  mesh.visible = false;

  let enabled = false;
  /** Carregada na primeira vez que o fundo é LIGADO, e mantida: religar não deve rebaixar a rede. */
  let mapa = null;

  /**
   * O mapa, com as DUAS decisões que decidem se ele aparece — e nenhuma das duas é o ganho.
   *
   * ☠️ **1 · `LinearSRGBColorSpace` num JPEG sRGB, e é DELIBERADO.** Medido: o mapa tem média
   * **1,43/255** e só **2,4%** dos pixels acima de 8/255 — a imagem inteira vive no rodapé da
   * faixa. Decodificar sRGB→linear leva um pixel de 2/255 para 0,0006 linear, e o *toe* do ACES
   * come o que sobrou: o céu sai PRETO com qualquer ganho praticável. Tratá-lo como já
   * display-referred é o que o app de referência faz com `toneMapped: false`, e é a única forma de
   * a informação atravessar a cadeia. **Isto não vale para foto** — vale para mapa de céu, cuja
   * saída já é a que se quer ver.
   *
   * ⚠️ **O mipmap é o PADRÃO do three, e está certo assim.** Ele NÃO produz a região escura no
   * centro da vista — quem produz é a NÉVOA (`FOG`), e ela é desejada. Desligá-lo remove o efeito
   * junto e devolve cintilação. `anisotropy` fica porque a casca é vista em ângulo raso nas bordas.
   */
  function textura() {
    if (mapa) return mapa;
    mapa = loader.load('assets/sky/stars.jpg');
    mapa.colorSpace = THREE.LinearSRGBColorSpace;
    // Repete em longitude — é o que fecha a volta sem emenda num mapa equirretangular.
    mapa.wrapS = THREE.RepeatWrapping;
    mapa.wrapT = THREE.ClampToEdgeWrapping;
    mapa.anisotropy = 8;
    return mapa;
  }

  return {
    object: mesh,

    /**
     * Liga ou desliga o fundo. É a única coisa que ele configura.
     *
     * @param {{enabled?: boolean}} options
     */
    apply(options = {}) {
      if (typeof options.enabled === 'boolean') enabled = options.enabled;
      mesh.visible = enabled;
      if (enabled) material.uniforms.uMap.value = textura();
      material.uniforms.uGain.value = enabled ? GAIN : 0;
    },

    /**
     * A casca acompanha a câmera quando ela sai do raio — a degradação, não um efeito.
     *
     * @param {number} _delta      não usado: a casca não anima
     * @param {number} _aspect     não usado: mapa equirretangular não depende do enquadramento
     * @param {THREE.Camera} [camera]
     */
    update(_delta, _aspect, camera) {
      if (!enabled || !camera) return;
      mesh.position.copy(camera.position).multiplyScalar(escorregarPara(camera.position.length()));
    },

    /**
     * As causas de "não vejo o fundo", separadas — a foto preta não distingue nenhuma delas.
     *
     * ⚠️ `visivel` é do PRÓPRIO objeto; `naArvore` diz se ele chegou à cena. Um mesh visível fora da
     * árvore desenha exatamente o mesmo nada que um mesh invisível dentro dela.
     */
    sonda() {
      const img = mapa?.image;
      return {
        ligado: enabled,
        visivel: mesh.visible,
        naArvore: mesh.parent !== null,
        ganho: material.uniforms.uGain.value,
        mapaPedido: mapa !== null,
        mapaPronto: Boolean(img && img.width > 0),
        /*
         * ☠️ **O que o SHADER amostra, não o que o módulo carregou.** São coisas diferentes: o mapa
         * pode estar pronto e o uniform continuar apontando para o pixel preto, e a tela é idêntica
         * nos dois casos. Sonda que lê só a variável atesta a metade errada.
         */
        uniformeEhOMapa: material.uniforms.uMap.value === mapa,
        uniformeEhOPreto: material.uniforms.uMap.value === empty,
        dimensoes: img ? [img.width, img.height] : null,
        raioDaCasca: SHELL,
        centro: [+mesh.position.x.toFixed(2), +mesh.position.y.toFixed(2), +mesh.position.z.toFixed(2)],
      };
    },

    dispose() {
      mapa?.dispose();
      mapa = null;
      empty.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}
