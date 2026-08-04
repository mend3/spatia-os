/**
 * O buraco negro — o núcleo cognitivo, e a única metáfora do sistema.
 *
 * Composto de quatro peças que juntas dão o visual da referência:
 *
 * 1. `horizon` — esfera pura preta. Não recebe luz nenhuma; ela existe para *ocluir*.
 * 2. `disk` — anel equatorial com shader: fluxo kepleriano (ω ∝ r^-1.5), filamentos por
 *    fbm alongado em θ, e rampa de temperatura do branco interno ao vermelho externo.
 *
 * NÃO existe plano de halo. Havia um, encarando a câmera e centrado na origem — metade dele
 * caía na frente da esfera e, sendo aditivo, lavava o horizonte de âmbar. Onde a esfera
 * ocultava as estrelas sobrava névoa-sem-estrela, e o resultado era um domo com silhueta
 * visível: exatamente o que um horizonte de eventos não pode ter. O bloom sobre o disco
 * largo dá a mesma névoa sem tocar no preto.
 *
 * A assinatura do Interstellar (o lado de trás do disco curvado por cima do horizonte) NÃO
 * é geometria: um disco visto de perfil já projeta o lado distante acima do centro na tela,
 * e o passe de lente em screen-space termina de curvá-lo. Tentar montar isso com anéis
 * perpendiculares produz uma gota/triângulo — foi o que aconteceu na primeira versão.
 *
 * A respiração é uma única fonte de verdade (`pulse`) usada por todas as peças: escala,
 * intensidade e velocidade angular saem dela. Sem isso, cada peça respiraria no seu ritmo e
 * o conjunto pareceria montado em vez de vivo.
 */
import * as THREE from 'three';

// Regimes cognitivos → parâmetros físicos. O buraco negro não "fica animado": ele muda de
// regime, e o regime é o estado real do agente.
export const REGIMES = {
  boot: { spin: 0.05, intensity: 0.25, turbulence: 0.4, breath: 0.02 },
  idle: { spin: 0.18, intensity: 0.75, turbulence: 0.6, breath: 0.035 },
  thinking: { spin: 0.85, intensity: 1.25, turbulence: 1.5, breath: 0.06 },
  retrieving: { spin: 0.6, intensity: 1.1, turbulence: 1.1, breath: 0.05 },
  searching: { spin: 0.7, intensity: 1.0, turbulence: 1.3, breath: 0.055 },
  answering: { spin: 1.15, intensity: 1.6, turbulence: 1.0, breath: 0.045 },
  error: { spin: 0.12, intensity: 0.5, turbulence: 2.6, breath: 0.1 },
};

export const HORIZON_RADIUS = 3.0;
const DISK_INNER = HORIZON_RADIUS * 1.08;
const DISK_OUTER = HORIZON_RADIUS * 13.0;
// Taxa de convergência do regime, em 1/s — NÃO fração por quadro. A transição entre
// regimes cognitivos tem que levar o mesmo tempo a 30 ou a 144fps, e um quadro longo não
// pode virar um salto de intensidade no disco.
const REGIME_RATE = 2.4;

const NOISE = /* glsl */ `
  // Hash e fbm baratos: o disco pede filamento, não realismo de ruído. Três oitavas
  // bastam porque o alongamento em θ já cria a aparência de fluxo laminar.
  vec2 hash2(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
  }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)), dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
      mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)), dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x),
      u.y);
  }
  float fbm(vec2 p){
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < 3; i++) { sum += amp * noise(p); p *= 2.17; amp *= 0.5; }
    return sum;
  }
`;

const DISK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  void main(){
    vUv = uv;
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISK_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime, uSpin, uIntensity, uTurbulence, uInner, uOuter, uErrorMix;
  uniform vec3 uHot, uMid, uCool;
  varying vec3 vLocal;
  ${NOISE}

  void main(){
    // RingGeometry é gerada no plano XY (z=0) e só depois o mesh é rotacionado — então o
    // raio e o ângulo do disco saem de xy, não de xz. Ler o par errado não dá erro de
    // compilação: devolve radius=|x| e theta≈0, e o disco simplesmente não aparece.
    // (Sem backtick neste comentário: ele vive dentro de um template literal.)
    float radius = length(vLocal.xy);
    float span = clamp((radius - uInner) / (uOuter - uInner), 0.0, 1.0);
    float theta = atan(vLocal.y, vLocal.x);

    // Rotação diferencial: a borda interna gira muito mais rápido que a externa. É o que
    // impede o disco de parecer uma textura girando rígida.
    float keplerian = pow(max(radius / uInner, 0.35), -1.5);
    float flow = theta + uTime * uSpin * keplerian * 6.0;

    // Coordenada alongada em θ: ruído esticado ao longo do fluxo vira filamento.
    vec2 filament = vec2(flow * 2.4, span * 9.0 - uTime * uSpin * 0.35);
    float striation = fbm(filament * vec2(1.0, 2.6)) * 0.5 + 0.5;
    striation = pow(striation, mix(1.4, 3.2, uTurbulence * 0.35));

    float temperature = pow(1.0 - span, 3.4);
    vec3 color = mix(uCool, uMid, smoothstep(0.0, 0.55, temperature));
    color = mix(color, uHot, smoothstep(0.5, 1.0, temperature));
    color = mix(color, vec3(0.95, 0.28, 0.22), uErrorMix * 0.7);

    // Duas bordas suaves: sem elas o anel tem contorno geométrico visível.
    float edge = smoothstep(0.0, 0.014, span) * (1.0 - smoothstep(0.2, 0.95, span));
    float brightness = edge * striation * (0.5 + temperature * 2.6) * uIntensity * 1.7;

    // Doppler: o lado que vem na direção da câmera brilha mais. Barato e muito eficaz.
    float doppler = 0.72 + 0.55 * smoothstep(-1.0, 1.0, sin(flow));
    brightness *= doppler;

    gl_FragColor = vec4(color * brightness, brightness);
  }
`;

export function createBlackHole() {
  const group = new THREE.Group();

  const uniforms = {
    uTime: { value: 0 },
    uSpin: { value: REGIMES.boot.spin },
    uIntensity: { value: REGIMES.boot.intensity },
    uTurbulence: { value: REGIMES.boot.turbulence },
    uInner: { value: DISK_INNER },
    uOuter: { value: DISK_OUTER },
    uErrorMix: { value: 0 },
    uHot: { value: new THREE.Color(0xffdba8) },
    uMid: { value: new THREE.Color(0xff8f3c) },
    uCool: { value: new THREE.Color(0x521705) },
  };

  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(HORIZON_RADIUS, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  group.add(horizon);

  const diskMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DISK_VERTEX,
    fragmentShader: DISK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const disk = new THREE.Mesh(new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 64), diskMaterial);
  disk.rotation.x = -Math.PI / 2;
  group.add(disk);

  // Sem anel extra colado no horizonte. Nesta inclinação rasante um anel de raio próximo
  // ao da esfera se sobrepõe à silhueta dela, e o passe de lente esfrega isso num espiral
  // dentro do buraco. A borda interna do próprio disco já é a beirada incandescente — e ela
  // está no lugar certo por construção, não por ajuste.


  const target = { ...REGIMES.idle };
  const live = { ...REGIMES.boot };
  let pulse = 0;
  // Escalas do painel de afinação. Multiplicam o regime em vez de substituí-lo: o estado
  // cognitivo continua mandando na forma, e o operador só ajusta a amplitude.
  const tune = { spin: 1, intensity: 1, width: 1, breath: 1 };

  return {
    group,
    horizonRadius: HORIZON_RADIUS,
    diskOuter: DISK_OUTER,

    setRegime(state) {
      Object.assign(target, REGIMES[state] || REGIMES.idle);
      uniforms.uErrorMix.value = state === 'error' ? 1 : 0;
    },

    /** Empurrão de energia: um evento que chega (memória, ferramenta) alimenta o núcleo. */
    surge(amount = 1) {
      live.intensity += amount * 0.5;
      live.turbulence += amount * 0.3;
    },

    update(delta, elapsed) {
      // Aproximação exponencial em vez de salto: a troca de regime tem que ser sentida
      // como aceleração, não como corte. O fator sai do delta, não do número de quadros.
      const factor = 1 - Math.exp(-REGIME_RATE * delta);
      for (const key of Object.keys(target)) {
        live[key] += (target[key] - live[key]) * factor;
      }

      pulse = Math.sin(elapsed * 0.55) * 0.5 + Math.sin(elapsed * 1.37) * 0.25;
      const breath = 1 + pulse * live.breath * tune.breath;

      uniforms.uTime.value = elapsed;
      uniforms.uSpin.value = live.spin * tune.spin;
      uniforms.uIntensity.value = live.intensity * (0.9 + pulse * 0.14) * tune.intensity;
      uniforms.uTurbulence.value = live.turbulence;
      uniforms.uOuter.value = DISK_OUTER * tune.width;

      horizon.scale.setScalar(breath);
      disk.scale.setScalar(1 + pulse * live.breath * tune.breath * 0.45);
      group.rotation.y += delta * live.spin * tune.spin * 0.045;
    },


    /** Afinação: escala o regime, não o troca. */
    tune(values) {
      tune.spin = values.diskSpin;
      tune.intensity = values.diskIntensity;
      tune.width = values.diskWidth;
      tune.breath = values.breath;
      // O disco é geometria fixa; a largura efetiva é o raio externo lido pelo shader, e a
      // borda de fade acompanha porque `span` é normalizado por uOuter.
      disk.scale.setScalar(1);
    },

    intensity: () => live.intensity,
    pulse: () => pulse,
  };
}
