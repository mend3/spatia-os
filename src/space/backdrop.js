/**
 * FUNDO DO UNIVERSO — rotação de imagens reais, com transição.
 *
 * Três campanhas do James Webb, em duas resoluções, alternando num tempo configurável. É o único
 * lugar do projeto com binário em disco: todo o resto (áudio, anéis, buraco negro, campo estelar)
 * é procedural. Vale a exceção porque nebulosa não se sintetiza de forma convincente — o que sai
 * de ruído fractal parece ruído fractal, e o que se quer aqui é a imagem que existe.
 *
 * ## Por que dentro da CENA, e não uma camada CSS atrás do canvas
 *
 * Uma `<div>` com `background-image` atrás do canvas seria mais simples e estaria errada: o
 * canvas teria de virar transparente, e aí a nebulosa apareceria ATRAVÉS do buraco negro e dos
 * astros — nada na cena poderia tapá-la, porque nada na cena a alcança. O usuário já reportou
 * exatamente essa classe de defeito antes ("objetos passando direto pelo core").
 *
 * Aqui o fundo é um quad em espaço de recorte desenhado ANTES de tudo (`renderOrder` mínimo, sem
 * teste nem escrita de profundidade). Todo o resto pinta por cima na ordem natural, então a
 * oclusão sai de graça e correta.
 *
 * ## O ganho é baixo de propósito
 *
 * A cadeia de pós-processamento é 87–90% do tempo de GPU do quadro e o bloom soma tudo que passa
 * do limiar. Uma nebulosa em brilho pleno estouraria o bloom inteiro e apagaria a HUD hairline,
 * que é o oposto de "fundo". `GAIN` mantém a imagem como AMBIENTE — legível, nunca protagonista.
 *
 * ## Crédito
 *
 * As três são ESA/Webb, NASA & CSA, sob CC BY 4.0. A atribuição aparece na tela de configuração
 * porque a licença a exige — e porque saber que aquilo é um berçário estelar real, e não textura,
 * é parte do que a imagem comunica. Detalhes em `assets/sky/CREDITS.md`.
 */
import * as THREE from 'three';

/**
 * O catálogo das imagens. Declarativo pelo mesmo motivo de `catalog.js`: o que a cena mostra é
 * dado, não código espalhado.
 */
export const PLATES = [
  {
    id: 'cosmic-cliffs',
    name: 'PENHASCOS CÓSMICOS',
    note: 'NGC 3324, Nebulosa de Carina · berçário estelar a 7.600 anos-luz',
    credit: 'ESA/Webb, NASA & CSA, J. Lee, PHANGS-JWST',
  },
  {
    id: 'rho-ophiuchi',
    name: 'RHO OPHIUCHI',
    note: 'a região de formação estelar mais próxima · 390 anos-luz',
    credit: 'ESA/Webb, NASA & CSA, K. Pontoppidan, A. Pagan',
  },
  {
    id: 'cartwheel',
    name: 'GALÁXIA RODA DE CARRO',
    note: 'ESO 350-40 · anel formado por uma colisão galáctica',
    credit: 'ESA/Webb, NASA & CSA',
  },
];

/*
 * Quanto do brilho original chega à tela.
 *
 * ⚠️ Este número é em espaço LINEAR, e a intuição erra por muito aqui. A textura entra como
 * `SRGBColorSpace`, o three a lineariza, e o `OutputPass` converte de volta no fim — então um
 * ganho de 0,34 linear sai como ~0,61 na tela (0,34^(1/2,2)). A primeira tentativa usou 0,34
 * "para ficar discreto" e entregou uma nebulosa em brilho quase pleno, com a HUD hairline
 * ilegível por cima dela.
 *
 * 0,085 linear ≈ 0,32 percebido: a imagem se lê como AMBIENTE e o texto de 8px sobrevive. E há
 * uma segunda razão para manter baixo — o bloom soma tudo que passa do limiar, então cada ponto
 * claro da nebulosa vira mais brilho ainda depois desta multiplicação.
 *
 * Escolhido olhando a CENA com a cadeia ligada. Medir na bancada responderia a pergunta errada,
 * que foi exatamente o erro cometido antes com o τ do anel.
 */
const GAIN = 0.085;
/** Segundos da fusão cruzada. Longa de propósito: transição curta vira corte, e corte distrai. */
const FADE_SECONDS = 4;
/** Deslocamento máximo do paralaxe, em fração da imagem. Sutil — fundo que anda muito vira cena. */
const PARALLAX = 0.02;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    // Posicao em espaco de RECORTE direto: o quad cobre a tela sem depender de camera nenhuma.
    // z quase 1 nao importa (o teste de profundidade esta desligado); o que garante a ordem e o
    // renderOrder minimo, e e por ele que tudo o mais pinta por cima.
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uFrom;
  uniform sampler2D uTo;
  uniform float uMix;
  uniform float uGain;
  uniform vec2 uCover;
  uniform vec2 uShift;
  varying vec2 vUv;

  void main(){
    // Enquadramento "cobrir": a imagem nunca estica, sempre sobra e e cortada pelo lado maior.
    vec2 uv = (vUv - 0.5) * uCover + 0.5 + uShift;
    vec3 color = mix(texture2D(uFrom, uv).rgb, texture2D(uTo, uv).rgb, uMix);

    /*
     * Vinheta, e ela nao e estilo.
     *
     * A HUD e hairline e mora nas BORDAS da tela; nebulosa em brilho cheio ali disputa contraste
     * com texto de 8px e ganha. Escurecendo as bordas, o fundo entrega o centro — que e onde
     * esta o sistema — e devolve as beiradas para a interface.
     */
    float vignette = 1.0 - 0.62 * pow(length(vUv - 0.5) * 1.42, 2.0);
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
      uFrom: { value: empty },
      uTo: { value: empty },
      uMix: { value: 0 },
      uGain: { value: 0 },
      uCover: { value: new THREE.Vector2(1, 1) },
      uShift: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.renderOrder = -1000;
  // O quad vive em espaço de recorte: nenhuma matriz o alcança, então nenhum frustum o descarta.
  mesh.frustumCulled = false;
  mesh.visible = false;

  /** Texturas carregadas nesta qualidade, por id. Trocar de qualidade descarta e recarrega. */
  let loaded = new Map();
  let quality = 'high';
  let enabled = false;
  let seconds = 90;
  let fading = true;

  let current = 0;
  let next = 0;
  let held = 0;
  let mix = 0;
  let aspect = 16 / 9;

  const fileOf = (id) => `assets/sky/${id}${quality === 'low' ? '-low' : ''}.jpg`;

  function textureFor(index) {
    const plate = PLATES[index];
    if (loaded.has(plate.id)) return loaded.get(plate.id);
    const texture = loader.load(fileOf(plate.id), (t) => {
      // A proporção só é conhecida DEPOIS de carregar; o enquadramento espera por ela.
      if (t.image) aspect = t.image.width / t.image.height;
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    // Sem repetição: a imagem é cortada para cobrir, e um `wrap` repetido colaria a borda
    // esquerda na direita num paralaxe de 2%, o que aparece como uma emenda vertical.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    loaded.set(plate.id, texture);
    return texture;
  }

  function discard() {
    for (const texture of loaded.values()) texture.dispose();
    loaded = new Map();
  }

  function show(index) {
    current = index;
    next = index;
    mix = 0;
    material.uniforms.uFrom.value = textureFor(index);
    material.uniforms.uTo.value = material.uniforms.uFrom.value;
  }

  return {
    object: mesh,

    /**
     * Aplica as preferências. Chamada no boot e a cada mudança na tela de configuração.
     *
     * @param {{enabled?: boolean, seconds?: number, fade?: boolean, quality?: 'high'|'low'}} options
     */
    apply(options = {}) {
      if (options.quality && options.quality !== quality) {
        quality = options.quality;
        // A qualidade troca o ARQUIVO, então as texturas em memória deixam de valer. Descartar
        // aqui é o que impede a versão antiga de continuar na tela até a próxima virada.
        discard();
        if (enabled) show(current);
      }
      if (typeof options.seconds === 'number') seconds = Math.max(5, options.seconds);
      if (typeof options.fade === 'boolean') fading = options.fade;
      if (typeof options.enabled === 'boolean' && options.enabled !== enabled) {
        enabled = options.enabled;
        mesh.visible = enabled;
        if (enabled) show(current);
        else discard();
      }
      material.uniforms.uGain.value = enabled ? GAIN : 0;
    },

    /** Qual imagem está no ar agora — a tela de configuração mostra o crédito dela. */
    plate: () => PLATES[current],

    update(delta, viewportAspect, camera) {
      if (!enabled) return;

      // Enquadramento "cobrir": corta pelo lado que sobra, nunca estica.
      const ratio = aspect / (viewportAspect || 1);
      material.uniforms.uCover.value.set(ratio > 1 ? 1 / ratio : 1, ratio > 1 ? 1 : ratio);

      /*
       * Paralaxe pela direção da câmera. Sem ele o fundo é um adesivo: a cena inteira gira e a
       * nebulosa fica pregada na tela, o que denuncia que ela não está no mundo. Com 2% ela
       * responde ao gesto sem virar movimento próprio.
       *
       * ⚠️ O AZIMUTE ENTRA COMO SENO, NÃO COMO ÂNGULO — e isso conserta dois erros de uma vez.
       *
       * A conta era `Math.atan2(x, z) * PARALLAX * 0.16`, usada LINEARMENTE no deslocamento de
       * UV. `orbit.azimuth` é ilimitado (`scene.js:354`), então a câmera atravessa o corte de
       * ramo do `atan2` ao dar uma volta, e ali o termo saltava `2π × 0,0032 = 0,0201` de UV num
       * quadro só — que é a excursão INTEIRA da paralaxe. O fundo deslizava 2% ao longo da volta
       * e desfazia tudo de uma vez. É a mesma família da costura do disco do buraco negro:
       * coordenada cíclica consumida por algo que não é periódico nela.
       *
       * E a forma linear estava errada mesmo sem o salto. Paralaxe de um fundo distante é
       * PERIÓDICA no azimute: uma volta completa tem de voltar ao ponto de partida, e uma imagem
       * chapada não tem como deslizar para sempre. `sin` é a forma certa, e `x / hypot(x, z)` É
       * o seno daquele azimute — sem trigonometria, sem corte, contínuo em toda a órbita. O `π`
       * na amplitude preserva a excursão máxima que o `atan2` tinha nos extremos.
       *
       * A latitude não tem esse problema e não foi tocada: `asin` de um valor grampeado varre
       * [-π/2, π/2] sem dar a volta, então não há corte a fechar ali.
       */
      if (camera) {
        const horizonte = Math.hypot(camera.position.x, camera.position.z) || 1;
        material.uniforms.uShift.value.set(
          (camera.position.x / horizonte) * Math.PI * PARALLAX * 0.16,
          -Math.asin(THREE.MathUtils.clamp(camera.position.y / camera.position.length(), -1, 1)) *
            PARALLAX *
            0.16
        );
      }

      if (PLATES.length < 2) return;

      if (mix > 0) {
        // Em transição: avança a mistura e, ao fechar, a imagem de destino vira a atual.
        mix = Math.min(1, mix + delta / (fading ? FADE_SECONDS : 0.0001));
        material.uniforms.uMix.value = mix;
        if (mix >= 1) {
          current = next;
          mix = 0;
          material.uniforms.uMix.value = 0;
          material.uniforms.uFrom.value = material.uniforms.uTo.value;
        }
        return;
      }

      held += delta;
      if (held < seconds) return;
      held = 0;
      next = (current + 1) % PLATES.length;
      const texture = textureFor(next);
      material.uniforms.uTo.value = texture;
      // A proporção da PRÓXIMA passa a valer quando ela entra; as três são 16:9, então isto só
      // importa se alguém trocar uma placa por outra de formato diferente.
      if (texture.image) aspect = texture.image.width / texture.image.height;
      mix = fading ? 0.0001 : 1;
      material.uniforms.uMix.value = mix;
    },

    dispose() {
      discard();
      empty.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}
