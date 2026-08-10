/**
 * Quatro materiais candidatos para o anel planetário — bancada, nada disto está na cena.
 *
 * O anel de produção (`space/rings.js`) é um quad billboardado que lê um perfil de densidade
 * radial 1D. A geometria e a física de fase estão certas e o desenho continua lendo como faixa
 * lisa pintada: falta a granulação. Um anel real é um enxame de bilhões de fragmentos, e o que
 * o olho reconhece como "isto é feito de pedra e gelo" é a estrutura ALÉM do raio — variação
 * no ângulo, aglomerado, sombra de uma faixa sobre a outra.
 *
 * ## O achado que atravessa as quatro
 *
 * A **assimetria quadrupolar** dos wakes de auto-gravidade (dois mínimos, perto de 70° e 250°
 * de longitude, onde os agregados ficam paralelos à linha de visada — Colwell et al. 2006,
 * Cassini/UVIS) é a estrutura de MAIS BAIXA frequência que um anel real tem. Por isso é a
 * única que sobrevive a 20 px de raio, e por isso as quatro a implementam. Todo o resto —
 * grão, pedra, fragmento — é alta frequência e some na minificação; a diferença entre as
 * variações é COMO cada uma some.
 *
 * ## Contrato
 *
 * O mesmo dos espécimes de `specs.js`: `build(ctx)` devolve `{ object, update, dispose }`, e o
 * espécime declara `controls` e `watch`. O campo extra é `thesis` — uma variação sem tese é
 * um slider a mais, não uma alternativa.
 *
 * Para experimentar: `import { RING_VARIANTS } from './ring-variants.js'` em `specs.js` e
 * espalhar no `SPECS`. Este arquivo não faz isso sozinho de propósito.
 *
 * O andaime que as quatro dividem (billboard, extinção, oclusão, estrela) está em
 * `ring-rig.js`; o ruído periódico de Gustavson, em `ring-noise.js`.
 */
import * as THREE from 'three';
import { RING_FAMILIES, profileTexture } from '../space/ring-profiles.js';
import { DIRTY_COLORS, VISIBLE_CORE } from '../space/rings.js';
import {
  BASE_CONTROLS,
  BASE_WATCH,
  GLSL_COMMON,
  OPTICAL_DEPTH,
  ORDER_SCATTER,
  ROLL,
  ringRig,
  softStar,
} from './ring-rig.js';

// ------------------------------------------------------------------ 1 · GRÃO ANALÍTICO

const GRAIN_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uForward;
  uniform float uCosTilt;
  uniform float uGrain;
  uniform float uCells;
  uniform float uWake;
  uniform vec2 uRadial;
  varying vec2 vUv;

  ${GLSL_COMMON}

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    if (occluded(p, uCosTilt)) discard;

    float density = texture2D(uProfile, vec2(r, 0.5)).r;
    float ang = atan(p.y, p.x);

    vec2 q = wakeCoords(ang, r, uCells);
    // fwidth mede a celula que ESTE pixel cobre. Na costura do atan ela explode e a
    // banda-limitacao apaga o grao ali — a falha e uma linha SEM grao, nao uma linha acesa.
    float w = max(fwidth(q.x), fwidth(q.y));
    float grain = 1.0 + uGrain * fbmWake(q, uCells, w);

    density *= max(grain, 0.0) * wakeAsymmetry(ang, uWake);

    float intensity = density * phaseTerm(p.y, uForward) * uOpacity;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

const GRAIN_VARIANT = {
  id: 'anel-grao',
  name: 'V1 · GRÃO ANALÍTICO',
  thesis:
    'A granulação não é partícula: é modulação estocástica da profundidade óptica local. ' +
    'Um campo de ruído em (ângulo, raio) com célula alongada no ângulo de pitch dos wakes, ' +
    'banda-limitado por fwidth — ele granula ao aproximar e some sozinho quando o anel ' +
    'encolhe, em vez de ferver. Zero draw call, zero textura, zero byte a mais.',
  distance: 6,
  controls: [
    ...BASE_CONTROLS,
    { key: 'grao', label: 'GRÃO', type: 'range', min: 0, max: 1.5, step: 0.02, value: 0.7 },
    { key: 'celulas', label: 'CÉLULAS NO AZIMUTE', type: 'range', min: 16, max: 320, step: 4, value: 96 },
    {
      key: 'assimetria',
      label: 'ASSIMETRIA (wakes)',
      type: 'range',
      min: 0,
      max: 0.6,
      step: 0.01,
      value: 0.22,
    },
  ],
  watch: [
    ...BASE_WATCH,
    'as estrias correm ao longo do anel e INCLINADAS, não radiais — é o ângulo de pitch dos wakes',
    'suba CÉLULAS até o grão sumir: ele não deve cintilar antes de sumir, deve desbotar',
    'com ASSIMETRIA alta, dois setores opostos escurecem e ficam PARADOS enquanto você orbita',
  ],
  build(ctx) {
    const rig = ringRig({
      fragment: GRAIN_FRAGMENT,
      uniforms: {
        uGrain: { value: 0.7 },
        uCells: { value: 96 },
        uWake: { value: 0.22 },
      },
    });
    const star = softStar();
    const object = new THREE.Group();
    object.add(star, rig.group);

    return {
      object,
      update(values, camera) {
        star.visible = values.estrela;
        star.scale.setScalar(values.raio / VISIBLE_CORE);
        star.quaternion.copy(camera.quaternion);

        const { family } = rig.apply(values.estado);
        const uniforms = rig.scatter.material.uniforms;
        uniforms.uGrain.value = values.grao;
        // Inteiro obrigatório: é ele que fecha o período do ruído na costura em ±pi.
        uniforms.uCells.value = Math.round(values.celulas);
        uniforms.uWake.value = values.assimetria;
        rig.orient(camera, values.tombo, ROLL, values.raio / VISIBLE_CORE);

        ctx.report({
          família: family,
          alcance: `${RING_FAMILIES[family].reach.toFixed(2)} R`,
          células: Math.round(values.celulas),
          custo: '1 fetch + 9 simplex',
        });
      },
      dispose() {
        rig.dispose();
        star.geometry.dispose();
        star.material.dispose();
      },
    };
  },
};

// ------------------------------------------------------------------ 2 · ENXAME

const SWARM_VERTEX = /* glsl */ `
  attribute float aSize;
  uniform float uCosTilt;
  uniform float uForward;
  uniform float uOpacity;
  uniform float uWake;
  uniform float uWorld;
  uniform float uViewportH;
  varying float vBright;

  ${GLSL_COMMON}

  void main(){
    vec2 q = position.xy;
    if (occluded(q, uCosTilt)) {
      // Fora do frustum e com area zero: mais barato que um discard no fragmento, porque
      // nem chega a rasterizar.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vBright = 0.0;
      return;
    }

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    // gl_PointSize e DIAMETRO em pixel de framebuffer. A conversao mundo->pixel sai da
    // propria matriz de projecao: assim o fragmento tem o mesmo tamanho aparente em
    // qualquer fov, distancia e devicePixelRatio.
    float projScale = uViewportH * projectionMatrix[1][1] * 0.5;
    float px = uWorld * aSize * projScale / max(-mv.z, 0.0001);

    // ARMADILHA: abaixo de 1 px a GPU nao encolhe o ponto, ela desenha 1 px inteiro — o
    // enxame ACENDE conforme o anel diminui, que e exatamente o caso de uso (20 px de raio).
    // Devolver o brilho pela area perdida mantem o integral constante.
    float shrink = clamp(px, 0.0, 1.0);
    gl_PointSize = max(px, 1.0);

    float ang = atan(q.y, q.x);
    vBright = uOpacity * shrink * shrink * phaseTerm(q.y, uForward) * wakeAsymmetry(ang, uWake);
  }
`;

const SWARM_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vBright;

  void main(){
    // Queda suave: sem ela cada fragmento e um quadradinho, e mil quadradinhos leem como
    // ruido de compressao, nao como pedra.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.2, 1.0, d);
    float alpha = core * vBright;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

/* Base lisa por baixo do enxame — o mesmo perfil, fraco, para os vãos não lerem como buraco. */
const SWARM_BASE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uForward;
  uniform float uCosTilt;
  uniform vec2 uRadial;
  varying vec2 vUv;

  ${GLSL_COMMON}

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    if (occluded(p, uCosTilt)) discard;

    float intensity = texture2D(uProfile, vec2(r, 0.5)).r * phaseTerm(p.y, uForward) * uOpacity;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

/** Gerador determinístico: dois carregamentos têm que mostrar o MESMO enxame, senão o A/B mente. */
function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Posiciona `count` fragmentos amostrando o PERFIL de produção como densidade de probabilidade.
 *
 * O perfil chega como téxel (`texture.image.data`), não como fórmula: assim a estrutura
 * (Cassini, Encke, os dez aros de Urano) aparece porque não há fragmento ali, e não porque
 * alguém desenhou uma faixa escura. Se `ring-profiles.js` mudar, o enxame muda junto.
 */
function swarmGeometry(profile, count, seed) {
  const data = profile.texture.image.data;
  const texels = data.length / 4;
  const reach = profile.reach;

  // CDF ponderada pela ÁREA do aro. Sem o fator de raio, o mesmo perfil renderia mais
  // fragmento por pixel perto do limbo do que na borda externa — um miolo denso que não existe.
  const cdf = new Float32Array(texels);
  let total = 0;
  for (let i = 0; i < texels; i++) {
    const t = (i + 0.5) / texels;
    total += (data[i * 4] / 255) * (1 + t * (reach - 1));
    cdf[i] = total;
  }

  const random = lcg(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let k = 0; k < count; k++) {
    // Estratificado: um sorteio puro deixa buracos e grumos visíveis com poucos fragmentos.
    const target = ((k + random()) / count) * total;
    let lo = 0;
    let hi = texels - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const t = (lo + 0.5) / texels;
    // Raio do perfil para raio do quad — a inversa exata do `uRadial` do shader.
    const d = (1 + t * (reach - 1)) / reach;
    const angle = random() * Math.PI * 2;
    positions[k * 3] = d * Math.cos(angle);
    positions[k * 3 + 1] = d * Math.sin(angle);

    // Distribuição de tamanho em lei de potência n(a) ∝ a^-3, que é a medida nos anéis reais:
    // quase tudo é pequeno e o punhado de blocos grandes é o que dá textura ao enxame.
    sizes[k] = 1 / Math.sqrt(1 + random() * (1 / 36 - 1));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  return geometry;
}

const SWARM_VARIANT = {
  id: 'anel-enxame',
  name: 'V2 · ENXAME',
  thesis:
    'O anel É um enxame, então que a densidade venha da AMOSTRAGEM e não da opacidade: ' +
    'fragmentos de verdade (Points), com raio sorteado da CDF do perfil e tamanho em lei de ' +
    'potência. As lacunas aparecem porque não há partícula ali. O preço é 64 draw calls a ' +
    'mais e a armadilha do ponto sub-pixel, corrigida no vertex.',
  distance: 6,
  controls: [
    ...BASE_CONTROLS,
    { key: 'fragmentos', label: 'FRAGMENTOS', type: 'range', min: 200, max: 4000, step: 100, value: 1600 },
    {
      key: 'tamanho',
      label: 'TAMANHO DO FRAGMENTO',
      type: 'range',
      min: 0.004,
      max: 0.06,
      step: 0.002,
      value: 0.018,
    },
    { key: 'base', label: 'BASE LISA', type: 'range', min: 0, max: 1, step: 0.02, value: 0.3 },
    {
      key: 'assimetria',
      label: 'ASSIMETRIA (wakes)',
      type: 'range',
      min: 0,
      max: 0.6,
      step: 0.01,
      value: 0.22,
    },
  ],
  watch: [
    ...BASE_WATCH,
    'a Divisão de Cassini é um vão SEM fragmento — se ela aparecer como faixa escura, a CDF errou',
    'afaste até os pontos ficarem sub-pixel: o anel tem que DESBOTAR, não acender',
    'com FRAGMENTOS baixo o enxame fica granuloso mas nunca em grumo — a amostragem é estratificada',
  ],
  build(ctx) {
    const rig = ringRig({ fragment: SWARM_BASE_FRAGMENT });
    const star = softStar();
    const object = new THREE.Group();
    object.add(star, rig.group);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(DIRTY_COLORS.modified) },
        uOpacity: { value: 1 },
        uForward: { value: 0 },
        uCosTilt: { value: 1 },
        uWake: { value: 0.22 },
        uWorld: { value: 0.018 },
        uViewportH: { value: 800 },
      },
      vertexShader: SWARM_VERTEX,
      fragmentShader: SWARM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const swarm = new THREE.Points(new THREE.BufferGeometry(), material);
    swarm.renderOrder = ORDER_SCATTER;
    swarm.frustumCulled = false;
    rig.adopt(swarm);

    /*
     * `gl_PointSize` é pixel de FRAMEBUFFER e a bancada não expõe o renderer aos espécimes.
     * O canvas carrega a altura real do buffer (já com o devicePixelRatio aplicado), que é
     * exatamente a unidade que falta — ler dele é mais honesto que reconstruir de
     * `innerHeight * devicePixelRatio` e errar quando a bancada limitar o DPR.
     */
    const canvas = document.querySelector('canvas');
    let built = '';

    return {
      object,
      update(values, camera) {
        star.visible = values.estrela;
        star.scale.setScalar(values.raio / VISIBLE_CORE);
        star.quaternion.copy(camera.quaternion);

        const { family, profile } = rig.apply(values.estado);
        const count = Math.round(values.fragmentos);
        const key = `${family}:${count}`;
        if (key !== built) {
          swarm.geometry.dispose();
          swarm.geometry = swarmGeometry(profile, count, 0x5eed);
          built = key;
        }

        material.uniforms.uWorld.value = values.tamanho;
        material.uniforms.uWake.value = values.assimetria;
        material.uniforms.uViewportH.value = canvas?.height || 800;
        // O enxame foi adotado pelo rig justamente por isto: `orient` escreve `uCosTilt` em
        // todos os materiais registrados, e a oclusão pelo limbo mora no vertex dele.
        rig.orient(camera, values.tombo, ROLL, values.raio / VISIBLE_CORE);
        rig.scatter.material.uniforms.uOpacity.value = 0.9 * values.base;
        material.uniforms.uOpacity.value = 0.9;

        ctx.report({
          família: family,
          fragmentos: count,
          'no céu (64 anéis)': `${(count * 64).toLocaleString('pt-BR')} pontos`,
          'draw calls': '3 por anel',
        });
      },
      dispose() {
        rig.dispose();
        material.dispose();
        star.geometry.dispose();
        star.material.dispose();
      },
    };
  },
};

// ------------------------------------------------------------------ 3 · PEDREGULHO

/*
 * O campo é MODULAÇÃO, não perfil: a resolução radial continua vindo do perfil 1D de 1024
 * téxeis, e por isso o eixo radial aqui pode ser curto. Separar as duas coisas mantém a
 * lacuna de Encke resolvida e deixa UM campo servir todas as famílias.
 *
 * 128×512 e não quadrado, porque a razão de aspecto na TELA não é 1: a circunferência do anel
 * é ~8× a largura da faixa. Um campo quadrado gasta téxel no eixo curto e entrega estrias
 * borradas no eixo longo — foi exatamente o que a primeira medida mostrou.
 */
const GRAIN_RADIAL_TEXELS = 128;
const GRAIN_AZIM_TEXELS = 512;
/*
 * Contagem de células. O teto não é estético: a oitava mais fina multiplica por 4, e menos de
 * ~2 téxeis por célula aliasa DENTRO da textura, antes de qualquer mipmap poder ajudar.
 * 16×4 = 64 células em 128 téxeis e 60×4 = 240 em 512 — os dois ficam em ~2.
 */
const GRAIN_RADIAL_CELLS = 16;
// Inteiro: é o período que fecha a costura azimutal. Todas as oitavas o multiplicam por
// fator inteiro, senão a costura reabre na oitava fina.
const GRAIN_AZIM_CELLS = 60;
const GRAIN_PITCH = 0.45;

const wrap = (value, period) => ((value % period) + period) % period;

function hash2(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

/** Ruído de valor bilinear, periódico no eixo Y (o azimute). */
function noise2(x, y, periodY) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const y0 = wrap(iy, periodY);
  const y1 = wrap(iy + 1, periodY);
  const a = hash2(ix, y0);
  const b = hash2(ix + 1, y0);
  const c = hash2(ix, y1);
  const d = hash2(ix + 1, y1);
  return a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy;
}

/**
 * Campo de rocha em coordenadas polares (x = raio, y = azimute), gerado em código.
 *
 * Três canais, três papéis: `R` é a modulação de densidade (0.5 neutro), `G` são pedregulhos
 * acesos e raros, `B` é o aglomerado de baixa frequência. Nasce com mipmap porque essa é a
 * tese: contra minificação de ~40:1 o filtro trilinear do hardware é a única defesa correta —
 * ruído procedural por fragmento não tem como integrar a área que o pixel cobre.
 */
function grainTexture() {
  const data = new Uint8Array(GRAIN_RADIAL_TEXELS * GRAIN_AZIM_TEXELS * 4);

  for (let y = 0; y < GRAIN_AZIM_TEXELS; y++) {
    for (let x = 0; x < GRAIN_RADIAL_TEXELS; x++) {
      const rad = ((x + 0.5) / GRAIN_RADIAL_TEXELS) * GRAIN_RADIAL_CELLS;
      // O cisalhamento inclina a célula no ângulo de pitch dos wakes; o `wrap` do ruído
      // continua fechando a costura porque ele só olha o índice azimutal.
      const azi = ((y + 0.5) / GRAIN_AZIM_TEXELS) * GRAIN_AZIM_CELLS + rad * GRAIN_PITCH;

      const grain =
        0.5 * (noise2(rad, azi, GRAIN_AZIM_CELLS) - 0.5) +
        0.25 * (noise2(rad * 2, azi * 2, GRAIN_AZIM_CELLS * 2) - 0.5) +
        0.125 * (noise2(rad * 4, azi * 4, GRAIN_AZIM_CELLS * 4) - 0.5);

      // Expoente alto = evento raro. É o que separa "pedregulho" de "ruído por toda parte".
      const speck = Math.pow(noise2(rad * 4, azi * 4, GRAIN_AZIM_CELLS * 4), 9);
      const clump = noise2(rad * 0.5, azi * 0.5, GRAIN_AZIM_CELLS * 0.5);

      const offset = (y * GRAIN_RADIAL_TEXELS + x) * 4;
      data[offset] = Math.round(Math.min(1, Math.max(0, 0.5 + grain)) * 255);
      data[offset + 1] = Math.round(Math.min(1, speck) * 255);
      data[offset + 2] = Math.round(Math.min(1, Math.max(0, clump)) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, GRAIN_RADIAL_TEXELS, GRAIN_AZIM_TEXELS, THREE.RGBAFormat);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // O anel é visto sempre em obliquidade forte: sem anisotropia o mip escolhido é o do eixo
  // mais comprimido e a rocha vira borrão liso justamente no tombo em que a cena a usa.
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

const BOULDER_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform sampler2D uRock;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uForward;
  uniform float uCosTilt;
  uniform float uGrain;
  uniform float uBoulder;
  uniform float uWake;
  uniform float uPhase;
  uniform vec2 uRadial;
  varying vec2 vUv;

  ${GLSL_COMMON}

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    if (occluded(p, uCosTilt)) discard;

    float density = texture2D(uProfile, vec2(r, 0.5)).r;
    float ang = atan(p.y, p.x);

    // Costura do atan, resolvida com DUAS amostras defasadas de meia volta.
    // A derivada de fract(a) explode em a=0 e o hardware escolhe o mip mais grosseiro numa
    // linha de 1 px — o remendo e amostrar a copia cuja costura esta do outro lado.
    float a = ang / TAU + uPhase;
    float v0 = fract(a);
    float v1 = fract(a + 0.5);
    float blend = smoothstep(0.0, 0.06, min(v0, 1.0 - v0));
    vec4 g = mix(texture2D(uRock, vec2(r, v1)), texture2D(uRock, vec2(r, v0)), blend);

    float rough = mix(1.0, 2.0 * g.r * (0.6 + 0.8 * g.b), uGrain);
    density *= max(rough, 0.0) * wakeAsymmetry(ang, uWake);

    // Pedregulho e brilho ADICIONADO onde ja ha material: uma pedra iluminada fora do anel
    // seria uma estrela solta, e o ceu ja esta cheio delas.
    float sparkle = g.g * uBoulder * density;

    float intensity = (density * phaseTerm(p.y, uForward) + sparkle) * uOpacity;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

const BOULDER_VARIANT = {
  id: 'anel-pedregulho',
  name: 'V3 · PEDREGULHO',
  thesis:
    'Rocha como TEXTURA filtrável, não como ruído por fragmento: um campo polar 256² gerado ' +
    'em código (grão, pedregulho, aglomerado), com mipmap e anisotropia. É a única variação ' +
    'em que a minificação de 40:1 é resolvida pelo hardware, do jeito certo. Custa 512 KB ' +
    'compartilhados por TODOS os anéis e 3 fetches por fragmento.',
  distance: 6,
  controls: [
    ...BASE_CONTROLS,
    { key: 'grao', label: 'GRÃO', type: 'range', min: 0, max: 1, step: 0.02, value: 0.75 },
    { key: 'pedregulho', label: 'PEDREGULHO', type: 'range', min: 0, max: 4, step: 0.05, value: 1.4 },
    {
      key: 'assimetria',
      label: 'ASSIMETRIA (wakes)',
      type: 'range',
      min: 0,
      max: 0.6,
      step: 0.01,
      value: 0.22,
    },
  ],
  watch: [
    ...BASE_WATCH,
    'não existe linha radial de costura: se aparecer uma, a dupla amostra do atan quebrou',
    'afaste bastante: a rocha tem que BORRAR (mipmap), não cintilar',
    'as três famílias têm fase de rocha diferente — o campo é o mesmo, o deslocamento não',
  ],
  build(ctx) {
    const rock = grainTexture();
    const rig = ringRig({
      fragment: BOULDER_FRAGMENT,
      uniforms: {
        uRock: { value: rock },
        uGrain: { value: 0.75 },
        uBoulder: { value: 1.4 },
        uWake: { value: 0.22 },
        uPhase: { value: 0 },
      },
    });
    const star = softStar();
    const object = new THREE.Group();
    object.add(star, rig.group);

    // Fase de rocha por família: um único campo compartilhado é barato, e sem deslocamento
    // os três anéis mostrariam a MESMA pedra no mesmo lugar.
    const PHASE = { saturn: 0, uranus: 0.37, jupiter: 0.71 };

    return {
      object,
      update(values, camera) {
        star.visible = values.estrela;
        star.scale.setScalar(values.raio / VISIBLE_CORE);
        star.quaternion.copy(camera.quaternion);

        const { family } = rig.apply(values.estado);
        const uniforms = rig.scatter.material.uniforms;
        uniforms.uGrain.value = values.grao;
        uniforms.uBoulder.value = values.pedregulho;
        uniforms.uWake.value = values.assimetria;
        uniforms.uPhase.value = PHASE[family] ?? 0;
        rig.orient(camera, values.tombo, ROLL, values.raio / VISIBLE_CORE);

        ctx.report({
          família: family,
          campo: `${GRAIN_RADIAL_TEXELS}×${GRAIN_AZIM_TEXELS} RGBA · ${((GRAIN_RADIAL_TEXELS * GRAIN_AZIM_TEXELS * 4) / 1024).toFixed(0)} KB`,
          custo: '3 fetch, 0 hash',
        });
      },
      dispose() {
        rig.dispose();
        rock.dispose();
        star.geometry.dispose();
        star.material.dispose();
      },
    };
  },
};

// ------------------------------------------------------------------ 4 · LAJE OPACA

const SLAB_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uForward;
  uniform float uCosTilt;
  uniform float uShade;
  uniform float uDepth;
  uniform float uGrain;
  uniform float uCells;
  uniform float uWake;
  uniform vec2 uRadial;
  varying vec2 vUv;

  ${GLSL_COMMON}

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    if (occluded(p, uCosTilt)) discard;

    vec2 slab = texture2D(uProfile, vec2(r, 0.5)).rg;
    float density = slab.r;
    float column = slab.g;

    float ang = atan(p.y, p.x);
    vec2 q = wakeCoords(ang, r, uCells);
    float w = max(fwidth(q.x), fwidth(q.y));
    density *= max(1.0 + uGrain * fbmWake(q, uCells, w), 0.0);
    density *= wakeAsymmetry(ang, uWake);

    // AUTO-SOMBRA RADIAL. Aqui o primario e uma ESTRELA no centro: a luz sai dele NO plano
    // do anel, entao o caminho da luz e o proprio raio. O que chega neste raio ja atravessou
    // tudo que esta entre a estrela e ele — e o anel A fica atras da parede que e o anel B.
    //
    // O -0.5 e normalizacao de EXPOSICAO, nao fisica: ancorado em zero, subir a sombra
    // escurece o anel inteiro e o slider vira um controle de brilho. Ancorado no meio da
    // coluna, ele faz o que se quer medir — CONTRASTE entre a borda interna e a externa.
    float lit = exp(-uShade * (column - 0.5));

    // CAMINHO OBLIQUO (o "tilt effect" medido em Saturno). De perfil, a linha de visada
    // atravessa muito mais laje: a profundidade optica efetiva e tau/mu. As faixas finas
    // clareiam e as densas SATURAM — o perfil achata sozinho no tombo raso, que e a assinatura
    // que separa uma laje de uma pintura.
    float mu = max(uCosTilt, 0.05);
    float seen = 1.0 - exp(-uDepth * density / mu);

    float intensity = seen * lit * phaseTerm(p.y, uForward) * uOpacity;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

/**
 * Perfil de produção + a COLUNA de profundidade óptica acumulada do limbo até cada raio.
 *
 * A integral é lida dos téxeis do perfil real, não recalculada da fórmula: `ring-profiles.js`
 * continua sendo a única fonte da geometria, e uma mudança lá aparece aqui sem edição.
 * Normalizada em [0,1] porque quem dosa a força é o uniforme — o valor absoluto dependeria da
 * largura do span, que muda por família.
 */
function slabProfile(name) {
  const base = profileTexture(name);
  const source = base.texture.image.data;
  const texels = source.length / 4;

  const column = new Float32Array(texels);
  let accumulated = 0;
  for (let i = 0; i < texels; i++) {
    accumulated += source[i * 4] / 255;
    column[i] = accumulated;
  }
  const total = Math.max(accumulated, 1e-6);

  const data = new Uint8Array(texels * 4);
  for (let i = 0; i < texels; i++) {
    data[i * 4] = source[i * 4];
    data[i * 4 + 1] = Math.round((column[i] / total) * 255);
    data[i * 4 + 3] = 255;
  }
  base.texture.dispose();

  const texture = new THREE.DataTexture(data, texels, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { texture, reach: base.reach, forward: base.forward };
}

const SLAB_VARIANT = {
  id: 'anel-laje',
  name: 'V4 · LAJE OPACA',
  thesis:
    'O anel não é uma faixa colorida: é uma laje de profundidade óptica finita. O que se vê é ' +
    'transmissão SATURADA (1−e^−τ/μ) vezes a luz que sobrou depois de atravessar tudo que está ' +
    'entre a estrela e aquele raio. A estrutura aparece porque a luz é bloqueada — o anel A ' +
    'nasce escuro por estar atrás do anel B — e o tombo muda o perfil, não só a elipse.',
  distance: 6,
  controls: [
    ...BASE_CONTROLS,
    { key: 'sombra', label: 'AUTO-SOMBRA RADIAL', type: 'range', min: 0, max: 4, step: 0.05, value: 1.6 },
    {
      key: 'profundidade',
      label: 'PROFUNDIDADE ÓPTICA',
      type: 'range',
      min: 0.2,
      max: 5,
      step: 0.05,
      value: 1.6,
    },
    { key: 'grao', label: 'GRÃO', type: 'range', min: 0, max: 0.8, step: 0.02, value: 0.28 },
    {
      key: 'assimetria',
      label: 'ASSIMETRIA (wakes)',
      type: 'range',
      min: 0,
      max: 0.6,
      step: 0.01,
      value: 0.22,
    },
  ],
  watch: [
    ...BASE_WATCH,
    'suba AUTO-SOMBRA: o anel A (fora da Cassini) escurece porque o B está na frente da luz',
    'leve o TOMBO ao extremo: as faixas finas clareiam e as densas saturam — o perfil ACHATA',
    'com PROFUNDIDADE alta o anel B vira um platô liso: laje opaca não fica mais brilhante',
  ],
  build(ctx) {
    const rig = ringRig({
      fragment: SLAB_FRAGMENT,
      makeProfile: slabProfile,
      uniforms: {
        uShade: { value: 1.6 },
        uDepth: { value: 1.6 },
        uGrain: { value: 0.28 },
        uCells: { value: 96 },
        uWake: { value: 0.22 },
      },
    });
    const star = softStar();
    const object = new THREE.Group();
    object.add(star, rig.group);

    return {
      object,
      update(values, camera) {
        star.visible = values.estrela;
        star.scale.setScalar(values.raio / VISIBLE_CORE);
        star.quaternion.copy(camera.quaternion);

        const { family } = rig.apply(values.estado);
        const uniforms = rig.scatter.material.uniforms;
        uniforms.uShade.value = values.sombra;
        uniforms.uDepth.value = values.profundidade;
        uniforms.uGrain.value = values.grao;
        uniforms.uWake.value = values.assimetria;
        rig.orient(camera, values.tombo, ROLL, values.raio / VISIBLE_CORE);

        // O passe de extinção tem seu próprio `uDepth` (τ do anel na frente do astro) e ele
        // NÃO é o mesmo número do espalhamento — manter o de produção mantém a comparação.
        rig.shade.material.uniforms.uDepth.value = OPTICAL_DEPTH;

        ctx.report({
          família: family,
          'μ (caminho)': Math.cos(values.tombo).toFixed(2),
          'τ efetivo': (values.profundidade / Math.max(Math.cos(values.tombo), 0.05)).toFixed(2),
          custo: '1 fetch + 9 simplex',
        });
      },
      dispose() {
        rig.dispose();
        star.geometry.dispose();
        star.material.dispose();
      },
    };
  },
};

export const RING_VARIANTS = [GRAIN_VARIANT, SWARM_VARIANT, BOULDER_VARIANT, SLAB_VARIANT];
