/**
 * Motor de partículas — o tráfego de informação, visível.
 *
 * Três correntes, cada uma com um significado fixo (a cor e a direção são a legenda):
 *
 * - `infall` — uma memória recuperada **cai** no núcleo. Nasce na estrela, espirala para
 *   dentro. É o evento `memory`.
 * - `outflow` — a resposta **sai** do núcleo em direção ao painel. É o evento `token`.
 * - `burst` — algo aconteceu num ponto (nó novo, erro, clique): poeira estelar radial.
 *
 * Pool fixo com índice circular: alocar e liberar geometria por evento causaria GC no meio
 * da animação, que é exatamente onde um engasgo é visível. Partícula velha é sobrescrita —
 * limite atingido degrada suavemente em vez de crescer sem fim.
 *
 * As trajetórias são Bézier quadráticas com o ponto de controle deslocado
 * perpendicularmente: reta faria a informação "teleportar", e a curva lê como órbita
 * decadente, que é o comportamento físico certo perto de um horizonte.
 */
import * as THREE from 'three';

const POOL = 2400;
const LIFETIME = { infall: 2.2, outflow: 1.5, burst: 1.1 };

const VERTEX = /* glsl */ `
  uniform float uSize;
  attribute float aLife;
  attribute float aScale;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vLife;
  void main(){
    vColor = aColor;
    vLife = aLife;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = max(uSize * aScale * aLife * (240.0 / -viewPosition.z), 0.8);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vLife;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float intensity = pow(1.0 - smoothstep(0.0, 1.0, d), 2.0) * vLife;
    if (intensity < 0.004) discard;
    gl_FragColor = vec4(vColor * intensity, intensity);
  }
`;

export function createParticles() {
  const positions = new Float32Array(POOL * 3);
  const colors = new Float32Array(POOL * 3);
  const lives = new Float32Array(POOL);
  const scales = new Float32Array(POOL);

  // Estado por partícula fora dos atributos: só o que o shader lê precisa virar buffer.
  const state = Array.from({ length: POOL }, () => ({
    active: false,
    kind: 'infall',
    age: 0,
    span: 1,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    control: new THREE.Vector3(),
    spin: 0,
  }));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 3.0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  let cursor = 0;
  const scratch = new THREE.Vector3();
  const color = new THREE.Color();

  function claim() {
    const i = cursor;
    cursor = (cursor + 1) % POOL;
    return i;
  }

  function spawn(kind, from, to, tint, { scale = 1, jitter = 0 } = {}) {
    const i = claim();
    const particle = state[i];
    particle.active = true;
    particle.kind = kind;
    particle.age = 0;
    particle.span = LIFETIME[kind] * (0.75 + Math.random() * 0.5);
    particle.from.copy(from);
    particle.to.copy(to);
    particle.spin = (Math.random() - 0.5) * 2;

    if (jitter) {
      particle.from.x += (Math.random() - 0.5) * jitter;
      particle.from.y += (Math.random() - 0.5) * jitter;
      particle.from.z += (Math.random() - 0.5) * jitter;
    }

    // Controle no meio do caminho, empurrado perpendicularmente ao trajeto e para fora do
    // plano: é o que transforma a queda em espiral.
    particle.control.addVectors(particle.from, particle.to).multiplyScalar(0.5);
    scratch.subVectors(particle.to, particle.from);
    const perpendicular = new THREE.Vector3(-scratch.z, scratch.y * 0.4 + 1.5, scratch.x)
      .normalize()
      .multiplyScalar(scratch.length() * (0.22 + Math.random() * 0.3) * particle.spin);
    particle.control.add(perpendicular);

    color.set(tint);
    colors.set([color.r, color.g, color.b], i * 3);
    scales[i] = scale * (0.6 + Math.random() * 0.8);
    lives[i] = 1;
    positions.set([particle.from.x, particle.from.y, particle.from.z], i * 3);
  }

  return {
    object: points,

    /** Memória recuperada caindo no núcleo. */
    infall(from, tint = 0xffd9a0, count = 14) {
      for (let n = 0; n < count; n++) {
        spawn('infall', from, scratch.set(0, 0, 0), tint, { scale: 1.1, jitter: 1.4 });
      }
    },

    /** Token saindo do núcleo em direção ao painel de resposta. */
    outflow(to, tint = 0xffe6bd, count = 3) {
      for (let n = 0; n < count; n++) {
        spawn('outflow', scratch.set(0, 0, 0), to, tint, { scale: 0.8, jitter: 2.6 });
      }
    },

    /** Poeira estelar radial num ponto — nó novo, clique, erro. */
    burst(at, tint = 0xffffff, count = 22, spread = 5) {
      for (let n = 0; n < count; n++) {
        const direction = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        )
          .normalize()
          .multiplyScalar(spread * (0.4 + Math.random()));
        spawn('burst', at, direction.add(at), tint, { scale: 0.9 });
      }
    },

    update(delta) {
      let dirty = false;
      for (let i = 0; i < POOL; i++) {
        const particle = state[i];
        if (!particle.active) continue;
        particle.age += delta;
        const t = particle.age / particle.span;
        if (t >= 1) {
          particle.active = false;
          lives[i] = 0;
          dirty = true;
          continue;
        }

        // Queda acelera perto do fim (gravidade); emissão desacelera (perde energia).
        const eased = particle.kind === 'infall' ? t * t : 1 - Math.pow(1 - t, 2.2);
        const inverse = 1 - eased;
        const offset = i * 3;
        positions[offset] =
          inverse * inverse * particle.from.x +
          2 * inverse * eased * particle.control.x +
          eased * eased * particle.to.x;
        positions[offset + 1] =
          inverse * inverse * particle.from.y +
          2 * inverse * eased * particle.control.y +
          eased * eased * particle.to.y;
        positions[offset + 2] =
          inverse * inverse * particle.from.z +
          2 * inverse * eased * particle.control.z +
          eased * eased * particle.to.z;

        // Infall some ao ser engolida; as outras desvanecem simetricamente.
        lives[i] = particle.kind === 'infall' ? Math.pow(inverse, 0.6) : Math.sin(Math.PI * t);
        dirty = true;
      }
      if (dirty) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.aLife.needsUpdate = true;
        geometry.attributes.aColor.needsUpdate = true;
        geometry.attributes.aScale.needsUpdate = true;
      }
    },

    live: () => state.reduce((total, particle) => total + (particle.active ? 1 : 0), 0),
  };
}
