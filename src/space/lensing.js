/**
 * Lente gravitacional + acabamento de câmera, num único passe de tela.
 *
 * Lente de verdade integra geodésicas por pixel. Aqui a deflexão é analítica: a imagem é
 * reamostrada com deslocamento radial ∝ 1/d² em torno da posição do horizonte na tela. O
 * resultado tem a propriedade que importa — as estrelas atrás do núcleo *escorregam* em
 * volta dele quando a câmera se move, e o anel de Einstein aparece onde deve.
 *
 * Os demais efeitos do briefing entram aqui porque são todos reamostragem da mesma textura,
 * e fazer um passe por efeito custaria uma cópia de framebuffer cada: aberração cromática
 * (três amostras deslocadas), distorção de barril, vinheta, grão e scanline.
 *
 * Escolha explícita: **não** há depth of field. DoF honesto exige o depth buffer e um passe
 * separado; o desfoque radial de borda daqui dá a mesma sensação de lente por muito menos.
 */
import * as THREE from 'three';
import { ShaderPass } from '../../vendor/jsm/postprocessing/ShaderPass.js';
import { GLSL_GEODESIC } from './blackhole-geodesic.js';

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
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
    vec3 dirFinal = dir;
    vec4 tracado = tracarGeodesica(uCamPos, dir, dirFinal);
    dirFinal = normalize(mix(dir, dirFinal, clamp(uStrength, 0.0, 1.0)));

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
    color = mix(color, tracado.rgb, tracado.a);
    color += tracado.rgb * (1.0 - tracado.a);

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

      uniforms.uAspect.value = size.width / size.height;
      uniforms.uGlitch.value = glitch;
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
