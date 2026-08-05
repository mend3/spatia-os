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

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uCenter;      // posição do horizonte em coordenadas de tela
  uniform float uRadius;     // raio aparente do horizonte
  uniform float uStrength;   // força da deflexão
  uniform float uAspect;
  uniform float uTime;
  uniform float uGrain;
  uniform float uAberration;
  uniform float uGlitch;
  uniform float uVignette;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  vec2 barrel(vec2 uv, float amount){
    vec2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    return 0.5 + centered * (1.0 + amount * r2);
  }

  void main(){
    vec2 uv = barrel(vUv, 0.06);

    // Aspecto aplicado ao vetor, não à uv: sem isso a lente fica elíptica em tela larga.
    vec2 toCenter = (uv - uCenter) * vec2(uAspect, 1.0);
    float distance = length(toCenter);
    vec2 direction = distance > 0.0001 ? toCenter / distance : vec2(0.0);

    // Deflexão que cresce ao aproximar do horizonte, saturada para não inverter a imagem.
    // Teto baixo de propósito. Sem ele a deflexão perto do horizonte chega a ~0.4 em uv, e
    // o fundo é arrastado em leques enormes: deixa de ler como lente e passa a ler como
    // artefato de shader.
    // Massa pontual desloca a imagem por θ_E²/θ — ∝ 1/θ, NÃO 1/θ².
    //
    // Com o quadrado, dobrar a distância ao horizonte derrubava a deflexão a um quarto em vez
    // de à metade: o efeito virava um borrão apertado colado no horizonte e sumia logo fora
    // dele. Perdia-se a assinatura de "o campo estelar inteiro está sutilmente torcido", que é
    // o que faz uma lente ler como lente e não como filtro local.
    // ⚠️ A ESCALA tem que ser preservada ao trocar a lei, e eu não preservei na primeira
    // tentativa: trocar /d² por /d mantendo uRadius*uRadius no numerador derrubou a
    // deflexão ~20× perto do horizonte (uRadius≈0.033, então dividir por d≈0.05 em vez de por
    // d²≈0.0025) e a lente sumiu da cena. Subir o default de lensStrength não resolveria: o
    // valor fica salvo no localStorage de quem já usou, e a correção precisa valer para ele.
    //
    // uRadius/d é adimensional e vale EXATAMENTE uStrength em d = uRadius — o mesmo que
    // a versão antiga entregava ali. O que muda é só a queda: a metade em 2R, onde antes era um
    // quarto. É a correção da física sem mexer no que o operador já afinou.
    float deflection = uStrength * uRadius / max(distance, uRadius * 0.35);
    deflection = min(deflection, 0.145);
    vec2 lensed = uv - direction * deflection / vec2(uAspect, 1.0);

    // Sombra: dentro do horizonte não sai luz. A borda é suave por causa do anel.
    // Fecha exatamente no raio aparente da esfera, com borda curta. A versão anterior
    // começava em 0.86·R e terminava em 1.02·R: sobrava uma coroa onde a esfera aparecia sem
    // ser apagada, e o disco lensado desenhava crescentes por cima do horizonte. Nada pode
    // ser desenhado sobre um horizonte de eventos.
    float shadow = smoothstep(uRadius * 0.99, uRadius * 1.09, distance);

    // Anel de fótons: estreito, e no limite EXTERNO da transição da sombra.
    //
    // Em 1.02 ele caía dentro da rampa do shadow (0.99→1.09) e era suprimido em ~78% —
    // fisicamente defensável, visualmente o anel desaparecia. A borda da sombra, aqui, É essa
    // rampa; o anel mora onde ela termina.
    float ring = exp(-pow((distance - uRadius * 1.1) / (uRadius * 0.05), 2.0));

    float glitchOffset = uGlitch * (hash(vec2(floor(vUv.y * 90.0), floor(uTime * 14.0))) - 0.5) * 0.05;
    lensed.x += glitchOffset;

    // Aberração cromática: uma amostra por canal, deslocada ao longo do raio da lente.
    // Aberração proporcional à deflexão, mas saturada: franja colorida é para ser notada de
    // relance, não para pintar o céu de arco-íris.
    float shift = uAberration * min(0.0006 + deflection * 0.004, 0.0012);
    vec3 color;
    color.r = texture2D(tDiffuse, lensed + direction * shift).r;
    color.g = texture2D(tDiffuse, lensed).g;
    color.b = texture2D(tDiffuse, lensed - direction * shift).b;

    color *= shadow;

    // O anel de Einstein REALÇA a luz que já está ali; não a inventa. Somar o anel de forma
    // plana desenhava um círculo perfeito em screen-space mesmo onde não havia nada atrás do
    // horizonte — um donut flutuando no vazio, que nenhum buraco negro produz. Multiplicar
    // pela luminância amostrada faz o realce aparecer só onde o disco realmente é dobrado.
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color += vec3(1.0, 0.74, 0.44) * ring * shadow * min(luminance * 2.6, 1.4);

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
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uRadius: { value: 0.09 },
      uStrength: { value: 0.85 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uGrain: { value: 0.03 },
      uAberration: { value: 1 },
      uGlitch: { value: 0 },
      uVignette: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: FRAGMENT,
  });

  const projected = new THREE.Vector3();

  return {
    pass,

    /**
     * Projeta o horizonte para coordenadas de tela a cada quadro. Fixar o centro em (0.5,
     * 0.5) quebraria assim que a câmera orbitasse: a lente descolaria do objeto.
     */
    sync(camera, blackHole, size, { glitch = 0 } = {}) {
      const uniforms = pass.uniforms;
      projected.set(0, 0, 0).applyMatrix4(blackHole.group.matrixWorld).project(camera);
      uniforms.uCenter.value.set((projected.x + 1) / 2, (projected.y + 1) / 2);

      // Raio aparente: o raio do horizonte convertido para fração de tela, via o meio-fov.
      const distance = camera.position.distanceTo(blackHole.group.position);
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
      uniforms.uRadius.value = THREE.MathUtils.clamp(
        blackHole.horizonRadius / (halfHeight * 2),
        0.02,
        0.45
      );
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
