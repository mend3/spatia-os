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

/** Onde a fotosfera começa e onde satura, em pixels de raio na tela. Igual à do planeta. */
export const LOD_FAR_PX = 90;
export const LOD_NEAR_PX = 200;

/** Coeficiente de escurecimento de limbo. 0,6 é o valor solar no visível. */
const LIMB_U = 0.6;
/** Quantos grânulos cabem na volta. O Sol tem ~2 milhões; aqui é o que sobrevive a 200px. */
const CELLS = 26.0;
/** Fração do brilho que resta na umbra de uma mancha: (3800/5772)^4, Stefan-Boltzmann. */
const UMBRA = 0.19;

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
  varying vec3 vObject;

  const float LIMB_U = ${LIMB_U.toFixed(3)};
  const float CELLS = ${CELLS.toFixed(1)};
  const float UMBRA = ${UMBRA.toFixed(3)};

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
    float slow = simplex3(p * CELLS * 0.22 + vec3(0.0, uTime * 0.014, uSeed));
    float fast = simplex3(p * CELLS + vec3(uSeed, uTime * 0.09, 0.0));
    // A oitava fina entra por rampa com o nivel de detalhe: a 90px ela oscila mais de uma vez
    // por pixel e so produz cintilacao.
    float fine = simplex3(p * CELLS * 2.6 + vec3(0.0, uTime * 0.16, uSeed)) * uDetail;
    return slow * 0.42 + fast * 0.44 + fine * 0.14;
  }

  void main(){
    vec3 normal = normalize(vObject);
    // mu = cosseno do angulo entre a normal e a linha de visada. 1 no centro do disco, 0 no
    // limbo. Tudo aqui e funcao dele.
    float mu = clamp(dot(normal, normalize(uCam - vObject)), 0.0, 1.0);

    float cells = granulation(normal);

    /*
     * MANCHAS. Campo separado, de escala muito maior, cortado por limiar alto — mancha e evento
     * raro e localizado, nao modulacao continua do brilho. Elas tambem migram, so que devagar
     * demais para se perceber num olhar; o termo de tempo existe para que duas visitas ao mesmo
     * astro em dias diferentes nao sejam identicas.
     */
    float field = simplex3(normal * 2.3 + vec3(uSeed * 3.1, uTime * 0.004, 0.0));
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
    float limb = 1.0 - LIMB_U * (1.0 - mu);

    /*
     * FACULAS: as paredes quentes dos granulos, visiveis de VIES. Por isso crescem com (1-mu),
     * exatamente ao contrario do escurecimento de limbo — e e essa oposicao que da a textura
     * anelada caracteristica perto da borda.
     */
    float faculae = max(cells, 0.0) * (1.0 - mu) * 0.9;

    float brightness = limb * (0.74 + cells * 0.52) + faculae * 0.8;
    // A mancha multiplica o que sobrou: ela nao APAGA emissao, ela emite menos.
    brightness *= mix(1.0, UMBRA, spot) * mix(1.0, 0.62, penumbra - spot);

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
    vec3 color = mix(uHot, uCool, cold);

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
    gl_FragColor = vec4(color * brightness * 0.72, 1.0);
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

  /*
   * A cor do nó vira o par frio/quente de um corpo negro, não uma paleta arbitrária.
   *
   * `hot` é a mesma matiz dessaturada e clara — plasma a 5.800 K lê como quase branco, com só
   * um traço da cor. `cool` puxa para laranja-vermelho, que é para onde a lei de Wien leva
   * qualquer coisa que esfria. Assim o TIPO do conhecimento continua legível (a matiz) sem que
   * a estrela vire um disco chapado da cor do tipo.
   */
  const hot = new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.34), 0.94);
  const cool = new THREE.Color().setHSL(Math.min(hsl.h, 0.09) || 0.06, 0.72, 0.42);

  /*
   * Mais massa, mais manchas. Não é lei física — é leitura: arquivo grande e muito estruturado
   * ganha mais "acidente" na superfície, e o corpus tem chunks de 1 a 226. É palpite calibrado
   * por legibilidade, e este comentário existe para que ninguém o cite como física.
   */
  const chunks = Number.isFinite(node.chunks) ? node.chunks : 1;
  const spots = THREE.MathUtils.clamp(Math.log2(1 + chunks) / 8, 0, 1) * (0.35 + seed * 0.85);

  return Object.freeze({ seed: seed * 10, hot, cool, spots });
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
        uDetail: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    // 48×32 basta: a esfera não tem deslocamento, então a malha só precisa de silhueta lisa —
    // toda a estrutura mora no fragmento.
    mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
    group.add(mesh);
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
      u.uTime.value = elapsed;
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
