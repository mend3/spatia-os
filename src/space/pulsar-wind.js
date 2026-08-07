/**
 * VENTO RELATIVÍSTICO — a nuvem de partículas em volta, e ela nunca fica parada.
 *
 * ## O que ela é
 *
 * Um pulsar despeja um vento de pares elétron-pósitron a velocidade próxima à da luz. Ele não é
 * colimado como o jato de um núcleo ativo: sai por toda a magnetosfera, mais denso perto do plano
 * equatorial (onde as linhas de campo fecham) e mais rápido nos polos. É a estrutura que faz um
 * remanescente como o Caranguejo brilhar — e visualmente é o que separa "esfera com cones" de um
 * corpo que ocupa uma região do espaço.
 *
 * ## Por que partículas e não mais um billboard
 *
 * A cena já tem três billboards de emissão (coma, nebulosa, pulso). Mais um seria outra mancha
 * macia, e o que falta aqui é justamente GRANULARIDADE — o vento é feito de coisas discretas, e o
 * olho lê partícula como matéria e mancha como luz. É a mesma decisão que a cauda do cometa tomou
 * quando deixou de ser malha.
 *
 * ## Tudo é `f(relógio)`, como o resto
 *
 * Cada partícula tem uma fase e uma direção fixas no buffer; o raio sai de uma função fechada do
 * tempo. Nenhum buffer é reescrito por quadro — a mesma lei do `motion-catalog.js` que o
 * escoamento da cauda segue.
 */
import * as THREE from 'three';

/**
 * Quantas partículas.
 *
 * 900 é onde a nuvem deixa de ler como punhado de pontos e ainda é irrisório: o céu já move 468
 * nós e as duas caudas do cometa somam 520. Um corpo por cena paga isso sem aparecer no quadro.
 */
const COUNT = 900;

/*
 * Quanto a espiral fecha por raio, em rad por raio de alcance, e quanto cada partícula se desvia
 * dela.
 *
 * `PITCH` 2,1 dá cerca de um terço de volta ao longo do alcance: curva o bastante para a raia
 * radial deixar de existir, pouco o bastante para não virar um redemoinho — que seria a forma
 * errada, porque o escoamento É radial no referencial que gira.
 *
 * `TWIST_SPREAD` é o que transforma 900 espirais limpas numa nuvem. Sem ele o ouriço só ficaria
 * torcido.
 */
const PITCH = 2.1;
const TWIST_SPREAD = 1.6;

const VERTEX = /* glsl */ `
  attribute vec3 aDir;
  attribute float aPhase;
  attribute float aSize;
  attribute float aTwist;
  uniform float uTime;
  uniform float uReach;
  uniform float uPitch;
  uniform float uBeat;
  uniform float uPixel;
  varying float vT;

  void main(){
    // Fracao do ciclo desta particula. fract() a recicla no corpo quando ela chega ao fim, e como
    // as fases nascem uniformes o ensemble e estacionario — a nuvem nao incha nem esvazia.
    float s = fract(aPhase + uTime * 0.11);
    /*
     * O vento SAI acelerando e depois coasta: sqrt poe muita particula longe e pouca perto, que e
     * o contrario do que se quer numa nuvem ligada ao corpo. Expoente 1.6 mantem a densidade alta
     * perto da magnetosfera e rarefaz para fora, que e o perfil de um vento em expansao livre.
     */
    float r = pow(s, 1.6) * uReach;

    /*
     * ANISOTROPIA: mais rapido nos polos, mais denso no equador.
     *
     * O vento de um pulsar nao e esferico — as linhas de campo fechadas seguram o plasma perto do
     * plano equatorial e as abertas o soltam pelos polos. Alongar o raio ao longo do eixo Y (o
     * eixo magnetico, no referencial deste grupo) e a aproximacao barata dessa forma, e e o que
     * da a cintura que se ve nas imagens.
     */
    /*
     * ⚠️ ESPIRAL, NAO RETA — e era a reta que fazia o objeto virar um OURICO.
     *
     * p = aDir * r com aDir fixo por particula significa que cada uma percorre uma RETA
     * radial saindo do centro. Sao 900 direcoes fixas e 900 fases distintas, entao a qualquer
     * instante existem 900 raias radiais simultaneas: o corpo lia como fogo de artificio, sem
     * nucleo e sem estrutura bipolar.
     *
     * A fisica ja dizia qual e a forma: o rotador magnetico gira enquanto o plasma escoa, e o
     * resultado e uma espiral de Arquimedes (o "vento listrado"). O escoamento e radial no
     * referencial que gira; no nosso ele curva.
     *
     * ⚠️ E O ANGULO SAI DE r, NUNCA DO RELOGIO. Com giro = uTime * omega o padrao enrolaria
     * sem fim — e o enrolamento de Lin-Shu ja matou cinco campos neste projeto. Aqui a FORMA e
     * congelada e a materia atravessa ela, que e exatamente a distincao que MOTION.patternSpin
     * existe para manter.
     *
     * aTwist desalinha cada particula um pouco: sem ele seriam 900 espirais limpas, o que e um
     * ouriço torcido. Com ele a nuvem e difusa, que e o que o item #5 do brief pede.
     */
    float giro = r * uPitch + aTwist;
    float cg = cos(giro);
    float sg = sin(giro);
    vec3 d = vec3(aDir.x * cg - aDir.z * sg, aDir.y, aDir.x * sg + aDir.z * cg);
    vec3 p = d * r;
    /*
     * ⚠️ O ACHATAMENTO AGORA ACONTECE, e a linha anterior nao fazia NADA.
     *
     * Era p.y *= 1.0 + 0.55 * (1.0 - abs(aDir.y)), e o comentario dizia que aquilo dava "a
     * cintura que se ve nas imagens". Medido: no equador p.y ja vale 0, entao o fator 1,55 nao
     * tem o que multiplicar; no polo o fator vale 1. So o meio era afetado, e ELE ERA EMPURRADO
     * PARA O POLO — a nuvem ficava alongada no eixo, o oposto de uma cintura.
     *
     * Multiplicar por menos que 1 e o que achata. A concentracao equatorial de verdade vem da
     * AMOSTRAGEM (ver createWind); isto aqui so termina de fechar o toro.
     */
    p.y *= 0.42;

    // A nuvem RESPIRA junto com o resto: uBeat e o mesmo batimento que pulsa o nucleo e o halo.
    p *= mix(0.94, 1.06, uBeat);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    /*
     * ⚠️ TETO NO TAMANHO DO PONTO, e sem ele o navegador TRAVA.
     *
     * gl_PointSize = tamanho/z nao tem limite superior: a camera chega perto, -mv.z vai a
     * decimos, e cada um dos 900 pontos vira um quad de milhares de pixels. Sao 900 quads
     * aditivos de tela cheia por quadro — overdraw de centenas de vezes a resolucao, e a GPU para.
     *
     * 48 px e generoso para uma particula de vento (o corpo inteiro tem ~260 px de raio no zoom
     * maximo) e limita o pior caso a 900 x 48^2 = 2,1 M fragmentos, cerca de duas telas. O piso de
     * 1 px continua do outro lado, pelo motivo oposto: ponto sub-pixel cintila.
     */
    gl_PointSize = clamp(aSize * (1.0 - s * 0.7) * uPixel / max(-mv.z, 0.001), 1.0, 48.0);
    vT = s;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uNear;
  uniform vec3 uFar;
  uniform float uAmount;
  varying float vT;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float disco = pow(max(1.0 - d, 0.0), 1.6);
    // Densidade cai para fora: a mesma massa numa casca maior. E a particula ESFRIA indo embora —
    // do azul eletrico perto do corpo ao roxo apagado na borda, que e a rampa sincrotron em
    // miniatura.
    float fill = disco * pow(1.0 - vT, 1.6) * uAmount;
    if (fill < 0.003) discard;
    gl_FragColor = vec4(mix(uNear, uFar, vT) * fill, fill);
  }
`;

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * O vento do pulsar em foco. Um por cena.
 *
 * @returns {{object: THREE.Object3D, update: Function, dispose: Function}}
 */
export function createWind() {
  const geometry = new THREE.BufferGeometry();
  const dir = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);
  const twist = new Float32Array(COUNT);
  const posicoes = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i += 1) {
    /*
     * Direção na esfera com densidade ∝ sin²θ — o EQUADOR, não a esfera inteira.
     *
     * ⚠️ Era uniforme por área, e uniforme é a forma errada: o fluxo de energia de um vento de
     * pulsar vai como `sin²θ` a partir do eixo, porque as linhas de campo fechadas seguram o
     * plasma perto do plano equatorial. É daí que vem o TORO — a feição que define a Nebulosa do
     * Caranguejo e que este objeto não tinha. Uma nuvem isotrópica não é um vento de pulsar; é
     * uma explosão.
     *
     * ⚠️ A anisotropia ESTAVA declarada no shader e não acontecia (ver `p.y` no VERTEX). Ela
     * pertence aqui, na amostragem, porque com partículas a densidade É a contagem — nenhuma
     * multiplicação de posição cria concentração onde não há partícula.
     *
     * Amostragem por REJEIÇÃO: `1 − z²` é exatamente `sin²θ` e o máximo é 1, então aceitar com
     * probabilidade `1 − z²` dá a distribuição certa sem inverter uma cúbica. O laço é limitado
     * porque um `while` com hash determinístico que nunca aceite travaria a carga do módulo — o
     * teto cai no valor cru, que é o pior caso e ainda é uma direção válida.
     */
    let z = 0;
    for (let tentativa = 0; tentativa < 8; tentativa += 1) {
      z = hash(i * 7 + tentativa * 2 + 1) * 2 - 1;
      if (hash(i * 7 + tentativa * 2 + 2) <= 1 - z * z) break;
    }
    const fi = hash(i * 3 + 2) * Math.PI * 2;
    const rho = Math.sqrt(Math.max(1 - z * z, 0));
    dir.set([rho * Math.cos(fi), z, rho * Math.sin(fi)], i * 3);
    phase[i] = (i + 0.5) / COUNT;
    size[i] = 0.4 + hash(i * 3 + 3) * 0.9;
    // Desalinhamento por partícula: é o que separa uma nuvem difusa de 900 espirais limpas.
    twist[i] = (hash(i * 3 + 5) - 0.5) * TWIST_SPREAD;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aTwist', new THREE.BufferAttribute(twist, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNear: { value: new THREE.Color(0x6fd0ff) },
      uFar: { value: new THREE.Color(0x5a2b8a) },
      uAmount: { value: 0 },
      uTime: { value: 0 },
      uReach: { value: 1 },
      uPitch: { value: 0 },
      uBeat: { value: 0.5 },
      // Pixel de FRAMEBUFFER sobre z, a mesma régua do sprite de astro e da cauda do cometa. É a
      // quinta vez que este projeto escreve esta linha, e a quinta vez que ela é a mesma conta.
      uPixel: { value: 300 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const pontos = new THREE.Points(geometry, material);
  pontos.frustumCulled = false;
  pontos.renderOrder = 6;
  pontos.visible = false;

  return {
    object: pontos,

    /**
     * @param {number} reach   alcance do vento, em raios do corpo
     * @param {number} level   nível de detalhe, 0…1
     * @param {number} elapsed
     * @param {number} beat    batimento 0…1, compartilhado com o núcleo e o halo
     * @param {boolean} reduced
     */
    update(reach, level, elapsed, beat, reduced = false) {
      /*
       * O vento entra a `level²`: de longe são 900 pontos de 1 px somando um borrão uniforme em
       * volta do corpo, o que apaga o feixe em vez de acrescentar. Perto, ele é a região que o
       * corpo ocupa.
       */
      const forca = level * level;
      pontos.visible = forca > 0.004;
      if (!pontos.visible) return;
      material.uniforms.uAmount.value = 0.5 * forca;
      material.uniforms.uTime.value = reduced ? 0 : elapsed;
      material.uniforms.uReach.value = reach;
      /*
       * ⚠️ O passo da espiral é POR RAIO DE ALCANCE, não por unidade de mundo — senão um pulsar
       * grande enrolaria mais que um pequeno e a forma deixaria de ser uma propriedade do objeto
       * para virar uma do tamanho dele. Dividindo pelo alcance, os dois fecham a mesma fração de
       * volta ao longo da própria nuvem.
       */
      material.uniforms.uPitch.value = PITCH / Math.max(reach, 1e-4);
      material.uniforms.uBeat.value = reduced ? 0.5 : beat;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
