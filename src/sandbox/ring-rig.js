/**
 * O andaime da bancada de anéis: tudo que as quatro variações de `ring-variants.js` dividem.
 *
 * Existe separado porque o que muda entre as variações é UM shader de espalhamento. O resto —
 * billboard, tombo, oclusão pelo limbo, passe de extinção, perfil por família, a estrela — é
 * idêntico, e tem que ser idêntico: uma variação que montasse o anel de outro jeito estaria
 * comparando duas coisas ao mesmo tempo.
 *
 * ⚠️ Os DADOS são os de produção: `profileTexture`/`RING_FAMILIES` entram por import de
 * `space/ring-profiles.js`. Só o material é novo.
 */
import * as THREE from 'three';
import { profileTexture } from '../space/ring-profiles.js';
import { DIRTY_COLORS } from '../space/rings.js';
import { GLSL_PSNOISE } from './ring-noise.js';

export const DIRTY_FAMILIES = {
  modified: 'saturn',
  staged: 'uranus',
  untracked: 'jupiter',
};

/*
 * Espelhos de constantes PRIVADAS de `rings.js` (`FOOTPRINT`, `OPTICAL_DEPTH`, a ordem de
 * desenho). Não são importáveis, e um valor diferente aqui trocaria o rodapé do anel — a
 * comparação com o material de produção passaria a medir escala, não material.
 */
const FOOTPRINT = 0.62;
export const OPTICAL_DEPTH = 2.0;
const ORDER_EXTINCTION = 1;
export const ORDER_SCATTER = 2;
const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * Biblioteca comum. Só comentário de linha aqui dentro: um comentário de bloco em GLSL já
 * fechou cedo demais neste repositório e o erro sai como "shader não compila" sem apontar onde.
 */
export const GLSL_COMMON = /* glsl */ `
  const float TAU = 6.28318530718;
  // Limbo do astro em unidades do quad: 0.6 (disco visivel) / 0.62 (rodape). Ver rings.js.
  const float LIMB = 0.97;
  // Periodo do eixo RADIAL: par (exigencia do psnoise) e grande o bastante para o raio
  // nunca dar a volta dentro do anel. Só o azimute precisa mesmo fechar.
  const float RADIAL_PERIOD = 1024.0;

  ${GLSL_PSNOISE}

  // Banda-limitacao (Quilez). A oitava que oscila mais de uma vez por pixel nao pode ser
  // amostrada: apaga-la custa um smoothstep, e supersampla-la custaria N vezes o shader.
  float fnoise(vec2 p, float cells, float w){
    return psnoise(p, vec2(cells, RADIAL_PERIOD)) * smoothstep(1.0, 0.5, w);
  }

  // Tres oitavas, todas com fator INTEIRO: e o que preserva o periodo azimutal em cada uma.
  // Um fator fracionario (o classico 2.01, contra repeticao) reabriria a costura em +-pi.
  float fbmWake(vec2 q, float cells, float w){
    float t = 0.500 * fnoise(q,       cells,       w);
    t +=      0.250 * fnoise(q * 2.0, cells * 2.0, w * 2.0);
    t +=      0.125 * fnoise(q * 4.0, cells * 4.0, w * 4.0);
    return t;
  }

  // Celula de wake: longa em azimute, fina em raio, cisalhada.
  // O cisalhamento e o angulo de pitch (20-30 graus da direcao orbital) — sai de graca,
  // enquanto rotacionar a coordenada custaria seno e cosseno por fragmento.
  // "cells" TEM que chegar inteiro: e ele que fecha o periodo em vnoise.
  vec2 wakeCoords(float ang, float rad, float cells){
    vec2 q = vec2(ang / TAU * cells, rad * cells * 0.62);
    q.x += q.y * 0.45;
    return q;
  }

  // Assimetria quadrupolar: dois minimos, em ~70 e ~250 graus de longitude, onde os wakes
  // se alinham com a linha de visada. 1.22 rad = 70 graus.
  float wakeAsymmetry(float ang, float amount){
    return 1.0 + amount * cos(2.0 * (ang - 1.22));
  }

  // Angulo de fase — a mesma conta de rings.js. Gelo retroespalha (metade DISTANTE mais
  // clara); poeira sub-micrometrica de Jupiter tem lobo frontal estreito e forte.
  float phaseTerm(float y, float forward){
    float near = clamp(y, 0.0, 1.0);
    float far = clamp(-y, 0.0, 1.0);
    float ice = 0.72 + 0.28 * far;
    float dust = 0.30 + 2.6 * pow(near, 3.0);
    return mix(ice, dust, forward);
  }

  // Metade DISTANTE some atras do astro. p.y < 0 e a distante (rotateX positivo, camera
  // olhando por -Z) — trocar o sinal esconderia justamente a metade que passa NA FRENTE.
  bool occluded(vec2 p, float cosTilt){
    return p.y < 0.0 && length(vec2(p.x, p.y * cosTilt)) < LIMB;
  }
`;

/* Extinção: idêntica à de produção. Copiada porque o shader de `rings.js` não é exportável. */
const EXTINCTION_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uProfile;
  uniform float uOpacity;
  uniform float uCosTilt;
  uniform vec2 uRadial;
  uniform float uDepth;
  varying vec2 vUv;

  ${GLSL_COMMON}

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float r = d * uRadial.x + uRadial.y;
    if (r < 0.0) discard;
    if (p.y < 0.0) discard;
    if (length(vec2(p.x, p.y * uCosTilt)) > LIMB) discard;

    float blocked = (1.0 - exp(-uDepth * texture2D(uProfile, vec2(r, 0.5)).r)) * uOpacity;
    if (blocked < 0.004) discard;
    gl_FragColor = vec4(vec3(blocked), 1.0);
  }
`;
// ------------------------------------------------------------------ andaime compartilhado

/**
 * A estrela — sprite suave, não esfera.
 *
 * A mesma queda de `graph.js` (`pow(1 - smoothstep(0,1,d), 2.2)`), pelo motivo já documentado
 * no espécime `anel` de `specs.js`: com uma esfera dura a borda externa do anel encosta num
 * disco chapado e o efeito some — a bancada mostraria um defeito que a cena não tem.
 */
export function softStar() {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: [
        'precision highp float;',
        'varying vec2 vUv;',
        'void main(){',
        '  float d = length(vUv * 2.0 - 1.0);',
        '  float core = pow(1.0 - smoothstep(0.0, 1.0, d), 2.2);',
        '  if (core < 0.004) discard;',
        '  gl_FragColor = vec4(vec3(1.0, 0.95, 0.87) * core, core);',
        '}',
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}

/**
 * Um anel montado: quad de espalhamento + passe de extinção, com o billboard e o tombo.
 *
 * O grupo inteiro recebe a transformação, e não cada malha — aqui existe UM anel, então
 * transformar o grupo é a versão simples da mesma conta que `rings.js` faz por malha (lá o
 * pool inteiro divide um grupo, e cada anel está numa estrela diferente).
 */
export function ringRig({ fragment, uniforms = {}, makeProfile = profileTexture }) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const profiles = new Map();
  const materials = [];
  const extras = [];

  function plate(fragmentShader, extraUniforms, blending, order) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uProfile: { value: null },
        uColor: { value: new THREE.Color(DIRTY_COLORS.modified) },
        uOpacity: { value: 0.9 },
        uForward: { value: 0 },
        uRadial: { value: new THREE.Vector2(1, 0) },
        uCosTilt: { value: 1 },
        ...extraUniforms,
      },
      vertexShader: VERTEX,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      ...blending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    group.add(mesh);
    materials.push(material);
    return mesh;
  }

  const shade = plate(
    EXTINCTION_FRAGMENT,
    { uDepth: { value: OPTICAL_DEPTH } },
    {
      blending: THREE.CustomBlending,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcColorFactor,
    },
    ORDER_EXTINCTION
  );
  const scatter = plate(fragment, uniforms, { blending: THREE.AdditiveBlending }, ORDER_SCATTER);

  function profileFor(family) {
    if (!profiles.has(family)) profiles.set(family, makeProfile(family));
    return profiles.get(family);
  }

  /** Escreve só os uniformes que o material declarou — o enxame não tem `uProfile`. */
  function write(name, apply) {
    for (const material of materials) {
      const uniform = material.uniforms[name];
      if (uniform) apply(uniform);
    }
  }

  return {
    group,
    scatter,
    shade,
    profileFor,

    /** Adota uma malha extra (o enxame) no mesmo grupo transformado. */
    adopt(mesh) {
      group.add(mesh);
      materials.push(mesh.material);
      extras.push(mesh);
    },

    /** Aplica a família correspondente ao estado do git. Devolve o perfil escolhido. */
    apply(state) {
      const family = DIRTY_FAMILIES[state] ?? DIRTY_FAMILIES.modified;
      const profile = profileFor(family);
      // d_perfil = (d·reach − 1)/(reach − 1): a região dentro do limbo não existe no perfil.
      const radial = [profile.reach / (profile.reach - 1), -1 / (profile.reach - 1)];
      write('uProfile', (u) => { u.value = profile.texture; });
      write('uRadial', (u) => { u.value.set(radial[0], radial[1]); });
      write('uForward', (u) => { u.value = profile.forward; });
      write('uColor', (u) => { u.value.setHex(DIRTY_COLORS[state] ?? DIRTY_COLORS.modified); });
      return { family, profile };
    },

    orient(camera, tilt, roll, spriteRadius) {
      // Ordem obrigatória: `roll` gira em torno do eixo de visão, `tilt` tomba no eixo X já
      // rolado. Invertida, o rolamento giraria o anel dentro do próprio plano — onde ele é
      // simétrico e nada mudaria. E é `rotateZ`/`rotateX`, nunca `rotation.x`: escrever no
      // Euler recalcula o quaternion e joga fora o billboard.
      group.quaternion.copy(camera.quaternion);
      group.rotateZ(roll);
      group.rotateX(tilt);
      group.scale.setScalar(spriteRadius * FOOTPRINT);
      write('uCosTilt', (u) => { u.value = Math.cos(tilt); });
    },

    setOpacity(value) {
      write('uOpacity', (u) => { u.value = value; });
    },

    dispose() {
      for (const mesh of extras) mesh.geometry.dispose();
      for (const material of materials) material.dispose();
      for (const profile of profiles.values()) profile.texture.dispose();
      profiles.clear();
      geometry.dispose();
    },
  };
}

/** Controles que toda variação tem: sem eles não dá para comparar duas variações. */
export const BASE_CONTROLS = [
  { key: 'estado', label: 'ESTADO GIT', type: 'enum', options: Object.keys(DIRTY_COLORS), value: 'modified' },
  { key: 'tombo', label: 'TOMBO', type: 'range', min: 0, max: 1.5, step: 0.01, value: 1.1 },
  { key: 'raio', label: 'RAIO DA ESTRELA', type: 'range', min: 0.2, max: 1.4, step: 0.02, value: 0.7 },
  { key: 'estrela', label: 'DESENHAR A ESTRELA', type: 'bool', value: true },
];

/** O que vale olhar em QUALQUER variação — herdado do espécime `anel`. */
export const BASE_WATCH = [
  'a metade DISTANTE some atrás da estrela e reaparece — se ela atravessa, a oclusão quebrou',
  'a metade PRÓXIMA escurece o disco da estrela (extinção)',
  'afaste com a roda até ~20 px de raio: é o tamanho REAL na cena, e é aí que a variação vale ou não',
];

/** Rolamento fixo: a bancada varre o tombo, e um rolamento variando junto embaralharia a leitura. */
export const ROLL = 0.4;

