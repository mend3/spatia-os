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
    /*
     * O teto ESCALA COM O OBJETO, e antes não escalava.
     *
     * Era 0.145 absoluto — 14,5% da altura da tela. Com o raio da sombra em ~0.033 UV, isso
     * é um deslocamento máximo de 4,4 RAIOS DE SOMBRA: a distorção ficava maior que o objeto
     * que a produz. Pior, sendo absoluto ele não encolhia quando a câmera se afastava, então
     * quanto menor o buraco negro na tela, MAIOR o borrão em proporção a ele.
     *
     * Amarrado a uRadius, o desenho vira invariante de distância: o campo estelar torce até
     * ~1.2 raio de sombra em volta dela, de perto e de longe.
     *
     * O teto continua existindo por outro motivo, que não mudou: deslocamento em espaço de
     * TELA não sabe fazer lente forte (não produz imagem múltipla nem anel de Einstein de
     * verdade). Passado certo ponto ele deixa de ler como lente e passa a ler como artefato,
     * e o teto é o que impede a técnica de tentar o que ela não consegue.
     */
    /*
     * O TETO SUBIU de 1,2 para 2,0 raios de sombra, e o motivo e a queixa de que "o fundo nao
     * reage". A 1,2 a deflexao saturava logo fora da sombra e o campo estelar mal se movia: o
     * efeito lia como mascara preta com um borrao colado, nao como espaco curvo. O teto continua
     * existindo pela razao que nao mudou — deslocamento em espaco de TELA nao sabe fazer lente
     * forte, nao produz imagem multipla nem anel de Einstein de verdade — mas 1,2 estava
     * cortando bem antes desse limite.
     */
    deflection = min(deflection, uRadius * 2.0);
    vec2 lensed = uv - direction * deflection / vec2(uAspect, 1.0);

    /*
     * SOMBRA GRADUAL — e a rampa curta era o que fazia o objeto ler como BOLA PRETA.
     *
     * Era smoothstep(0,99R → 1,09R): 10% do raio, uma borda de tesoura. O cerebro le isso como
     * superficie solida, e a queixa foi literal — "parece uma esfera preta gigante". Um buraco
     * negro nao tem superficie: o que se ve e a SOMBRA, e a fronteira dela e o lugar mais
     * dificil de localizar da imagem.
     *
     * A fisica: a fracao de raios capturados nao salta de 0 a 1 num raio. Ela cresce
     * continuamente conforme o parametro de impacto se aproxima do critico, e mesmo fora da
     * sombra uma parte da luz ainda cai. Sao dois termos:
     *
     *   nucleo  — a rampa principal, agora com 44% do raio (0,58 a 1,02) em vez de 10%;
     *   residuo — absorcao PARCIAL indo ate 1,9 raios, que e o que faz o escuro "vazar" para
     *             fora da sombra em vez de terminar numa circunferencia.
     *
     * ⚠️ O residuo foi 0,68 ate 2,4R na primeira tentativa e escurecia a CENA, nao so a borda:
     * a 2,4R ele cobre um pedaco grande da tela e a borda interna do disco (que comeca em 1,41R)
     * perdia ate 32% do brilho. Escurecer o disco perto da sombra e desejado — e o "o horizonte
     * engole a luz gradualmente" —, escurecer o ceu inteiro nao e. 0,80 ate 1,9R mantem o
     * vazamento e devolve o disco.
     *
     * O anel de fotons continua fora dos dois, em 1,1R, onde a rampa principal ja fechou.
     */
    float nucleo = smoothstep(uRadius * 0.58, uRadius * 1.02, distance);
    float residuo = mix(0.80, 1.0, smoothstep(uRadius * 1.02, uRadius * 1.9, distance));
    float shadow = nucleo * residuo;

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
