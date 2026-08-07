/**
 * NEBULOSA — o corpo de um arquivo de COMPOSE, e o único do céu que não tem superfície.
 *
 * ## Por que ela é a ausência de corpo, e não um corpo difuso
 *
 * Todas as outras peles respondem "o que há na superfície deste objeto". A nebulosa responde que
 * não há superfície: é gás e poeira sem contorno, transparente em qualquer direção, com estrutura
 * mas sem limite. Densidades reais ficam em ~10³ partículas/cm³ — melhor vácuo que qualquer bomba
 * de laboratório. O que se vê é integral ao longo da linha de visada, não um limbo.
 *
 * Isso é a leitura certa para um `docker-compose.yml`: ele não é uma coisa, é a região onde várias
 * coisas coexistem. O arquivo declara serviços; o corpo declara extensão sem borda.
 *
 * ## O que a mantém distinta das outras difusas da cena
 *
 * Já existem duas coisas difusas aqui — o remanescente da supernova (`remnant.js`) e a coma do
 * cometa. As três não podem ler igual, e o que as separa é a ESTRUTURA:
 *
 * | | forma | escala |
 * |---|---|---|
 * | coma | radial e lisa, um centro só | ~1 raio |
 * | remanescente | preenchimento com lobos de harmônica baixa | ~1,7 raios |
 * | **nebulosa** | **filamentar, com cavidade escura e vários núcleos** | **~4 raios** |
 *
 * A cavidade é o que fecha a diferença: nebulosa de emissão real tem uma bolha soprada pelo vento
 * das estrelas que a acendem, então o brilho NÃO é máximo no centro. Sem ela, qualquer nuvem
 * radial vira a coma em outro tamanho.
 *
 * ⚠️ Billboard aditivo sem teste de profundidade, pela mesma razão do remanescente: material na
 * frente e atrás ao mesmo tempo. Ver o cabeçalho de `remnant.js`.
 */
import * as THREE from 'three';
import { GLSL_SIMPLEX3 } from './planet-noise.js';
import { MOTION } from './motion-catalog.js';
import { glslFloat } from './glsl.js';

const DRIFT = MOTION.nebulaDrift;

/**
 * Onde a nebulosa começa a aparecer e onde satura, em pixels de raio do corpo.
 *
 * ⚠️ **O teto era 95 e o enquadramento nunca chegava lá** — corrigido em 2026-08-07, quando o
 * `chegaPleno` do `budget()` deixou de ser um campo calculado e virou invariante obrigada.
 * `SKIN_EXTENT.nebula` é 3,4, então a chegada entrega `260/3,4 = 76` px de raio de CORPO: a pele
 * nascia em `level` 0,74 (medido na cena: 0,736) e não havia zoom que ajudasse, porque o chão do
 * zoom é o mesmo enquadramento.
 *
 * A régua estava apertada demais por um motivo específico: ela mede o CORPO, e aqui o corpo não
 * existe — a figura é a nuvem, que vale `span` (3,0–5,3) vezes esse raio. Exigir 95 px de corpo é
 * exigir ~400 px de nuvem, mais da metade da meia-altura desta tela. Em 70 a nuvem chega cheia com
 * 210–370 px, que é a faixa onde a bancada mostra os filamentos e a cavidade (escada medida no
 * espécime `COROA SOB A PELE`: 55 é um nó apagado, 76 lê fraco, 99 lê cheio).
 */
export const LOD_FAR_PX = 22;
export const LOD_NEAR_PX = 70;

/**
 * Quanto do raio de referência o CORPO ocupa — nada: a nebulosa não tem corpo.
 *
 * O arquivo declara serviços e o objeto declara extensão sem borda (ver o cabeçalho). O raio de
 * referência aqui é só a unidade em que a nuvem mede, e ela vai de 3,0 a 5,3 dele. Quem lê é
 * `lod.js` (`BODY_SPAN`): não há superfície para a coroa do sprite envolver.
 */
export const BODY_SPAN = 0;

/** Extensão do quad, em raios do corpo. A nebulosa é MUITO maior que o objeto que a nomeia. */
const SPAN = 4.2;

const hash01 = (text, salt) => {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 100000) / 100000;
};

const VERTEX = /* glsl */ `
  varying vec2 vPc;
  void main(){
    vPc = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform float uSeed;
  uniform float uAmount;
  uniform float uCavity;
  uniform float uFilament;
  uniform float uTime;
  varying vec2 vPc;

  ${GLSL_SIMPLEX3}

  // Do motion-catalog.js, entrada nebulaDrift. (Sem crase neste comentario: ela fecha o template.)
  const float DRIFT = ${glslFloat(DRIFT.rates.drift)};
  const float CHURN = ${glslFloat(DRIFT.rates.churn)};
  const float BREATH_RATE = ${glslFloat((2 * Math.PI) / DRIFT.period)};
  const float BREATH_AMP = ${glslFloat(DRIFT.amplitude)};

  void main(){
    float d = length(vPc);
    // Fora do disco util nao ha o que integrar. Descartar cedo poupa o ruido nos cantos do quad,
    // que sao 21% da area e nunca aparecem.
    if (d > 1.0) discard;

    /*
     * FILAMENTOS: |ruido| invertido.
     *
     * 1 - |n| concentra o valor onde o ruido cruza zero, e o lugar geometrico disso e uma
     * SUPERFICIE — em corte, uma linha. E o que produz fio em vez de mancha, e e a mesma
     * construcao que da as cristas de um planeta leve. Duas oitavas: a estrutura grande e o
     * detalhe que corre dentro dela.
     */
    /*
     * O CAMPO ANDA. Sem isto a nebulosa e um desenho, e foi assim que ela nasceu.
     *
     * drift desloca a estrutura grande ao longo da terceira dimensao do ruido: e o campo se
     * REFAZENDO, nao uma textura rolando — a diferenca e que o olho reconhece rolagem na hora. A
     * componente em x acrescenta um arraste lateral lento, que e o que da direcao ao gas.
     * churn faz a oitava fina se renovar mais rapido dentro da lenta, na mesma ordem do boil da
     * fotosfera: estrutura grande devagar, detalhe pequeno depressa.
     */
    vec3 p = vec3(vPc * 2.2 + vec2(uTime * DRIFT * 0.12, 0.0), uSeed * 4.0 + uTime * DRIFT);
    float grande = 1.0 - abs(simplex3(p));
    float fino = 1.0 - abs(simplex3(p * 2.7 + vec3(0.0, uTime * CHURN * 0.3, uTime * CHURN)));
    float fio = mix(grande, grande * fino, uFilament);

    /*
     * CAVIDADE: o brilho NAO e maximo no centro.
     *
     * Nebulosa de emissao tem uma bolha soprada pelo vento das estrelas que a ionizam. Sem isto a
     * nuvem vira radial e lisa — que e a coma do cometa em outro tamanho, e a cena ja tem uma.
     */
    // A cavidade RESPIRA: o vento das fontes que a sopram nao e constante. Amplitude pequena de
    // proposito — bolha pulsando forte lia como animacao, e o que se quer e sinal de vida.
    float raio = uCavity * (1.0 + sin(uTime * BREATH_RATE) * BREATH_AMP);
    float casca = smoothstep(0.0, raio, d) * (1.0 - smoothstep(raio * 1.4, 1.0, d));

    float fill = pow(fio, 2.2) * casca * uAmount;
    if (fill < 0.003) discard;

    // A cor esfria para fora: o gas ionizado perto das fontes emite mais alto na energia que a
    // poeira das bordas. Duas cores, uma so mistura — o degrade e a integral, nao um contorno.
    vec3 cor = mix(uCore, uEdge, smoothstep(raio, 1.0, d));
    gl_FragColor = vec4(cor * fill, fill);
  }
`;

/**
 * Parâmetros da nebulosa de um nó. Puro e congelado.
 *
 * @param {{source?: string, id?: string, chunks?: number, sections?: string[]}} node
 * @param {number} color
 */
export function nebulaParams(node = {}, color = 0xffffff) {
  const path = node.source ?? node.id ?? 'sem-caminho';
  const seed = hash01(path, 53);
  const seedB = hash01(path, 59);
  const chunks = Number.isFinite(node.chunks) ? node.chunks : 1;
  const servicos = node.sections?.length ?? 0;

  const base = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  return Object.freeze({
    seed,
    /** Extensão: mais massa, mais nuvem. Log, como todo tamanho desta cena. */
    span: SPAN * (0.72 + Math.min(Math.log2(1 + chunks) * 0.09, 0.55)),
    /**
     * Raio da cavidade. Mais SERVIÇOS declarados, mais fontes soprando de dentro — bolha maior.
     * É o único uso de `sections` aqui, e é o que liga a forma ao conteúdo do arquivo.
     */
    cavity: THREE.MathUtils.clamp(0.16 + servicos * 0.035, 0.14, 0.46),
    /** Quanto a oitava fina participa: nuvem lisa contra nuvem rendilhada. */
    filament: 0.45 + seedB * 0.5,
    amount: 0.5 + seed * 0.35,
    core: new THREE.Color().setHSL(hsl.h, Math.min(hsl.s + 0.2, 0.9), 0.72),
    edge: new THREE.Color().setHSL((hsl.h + 0.52) % 1, 0.55, 0.34),
  });
}

/**
 * A nebulosa do astro em foco. Uma por cena, como as outras peles.
 */
export function createNebula() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCore: { value: new THREE.Color(0xffffff) },
      uEdge: { value: new THREE.Color(0x335577) },
      uSeed: { value: 0 },
      uAmount: { value: 0 },
      uCavity: { value: 0.25 },
      uFilament: { value: 0.6 },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  /*
   * ⚠️ A NUVEM É FILHA, e até 2026-08-07 ela era o próprio `object` — o que apagava o raio do corpo.
   *
   * `scene.js` escala esta pele por `pouso.radius`, como faz com as outras quatro. Escalando o
   * MESMO objeto por `params.span` aqui dentro, o `setScalar` de lá era sobrescrito todo quadro: a
   * nebulosa tinha tamanho ABSOLUTO em unidades de mundo e o astro que a nomeia não entrava na
   * conta. O arquivo inteiro documenta `span` "em raios do corpo" (ver `SPAN`), e ela não era.
   *
   * Foi a bancada que pegou: no espécime `COROA SOB A PELE`, varrer o RAIO DE REFERÊNCIA de 0,89 a
   * 0,19 mudava o `px` do corpo (259 → 55) e a nuvem ficava do mesmo tamanho na tela, quadro a
   * quadro. As outras três peles nunca tiveram isto porque escalam FILHOS (`nucleo`, `coma`,
   * `montagem`, `core`), que multiplicam com o pai em vez de substituí-lo.
   *
   * O billboard fica na filha, e é seguro porque o grupo pai não gira — `scene.js` só lhe escreve
   * posição e escala. Se algum dia ele girar, esta cópia de quaternion passa a ser local e mente.
   */
  const nuvem = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  nuvem.frustumCulled = false;
  // `renderOrder` é por objeto e não desce do grupo: ele mora na malha, que é quem desenha.
  nuvem.renderOrder = 8;
  const object = new THREE.Group();
  object.add(nuvem);
  object.visible = false;

  return {
    object,

    /**
     * @param {object} params  de `nebulaParams`
     * @param {THREE.Camera} camera
     * @param {number} px      raio aparente do corpo
     * @param {number} elapsed
     * @returns {number} nível de detalhe aplicado, 0…1
     */
    update(params, camera, px, elapsed, reduced = false) {
      const level = THREE.MathUtils.clamp((px - LOD_FAR_PX) / (LOD_NEAR_PX - LOD_FAR_PX), 0, 1);
      object.visible = level > 0.002;
      if (!object.visible) return 0;

      const u = material.uniforms;
      u.uCore.value.copy(params.core);
      u.uEdge.value.copy(params.edge);
      u.uSeed.value = params.seed;
      u.uCavity.value = params.cavity;
      u.uFilament.value = params.filament;
      u.uAmount.value = params.amount * level;
      // Congela o RELÓGIO, não o parâmetro: parada, ela fica num instante legítimo do escoamento.
      // Zerar a amplitude alinharia a cavidade e apagaria a estrutura que ela existe para dar.
      u.uTime.value = reduced ? 0 : elapsed;
      // Na FILHA: multiplica o raio do corpo que `scene.js` pôs no grupo, em vez de apagá-lo.
      nuvem.scale.setScalar(params.span);
      nuvem.quaternion.copy(camera.quaternion);
      return level;
    },

    dispose() {
      // A geometria é da NUVEM desde que ela virou filha — `object` é um grupo e não tem nenhuma.
      nuvem.geometry.dispose();
      material.dispose();
    },
  };
}
