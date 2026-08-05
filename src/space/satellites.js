/**
 * Satélites de busca e wormholes de ferramenta — a atividade do agente como corpos no espaço.
 *
 * **Satélites** (Brave, SerpAPI, SearXNG, DDG) orbitam alto, num plano inclinado em relação
 * ao disco, para ler como "fora do sistema". Provedor sem chave fica *apagado*, não
 * ausente: a tela precisa distinguir "não configurado" de "não respondeu", e um satélite
 * escuro comunica isso sem texto.
 *
 * **Wormholes** abrem onde a ferramenta é chamada, na cor da família (`tool.kind`). Cada um
 * é um anel que cresce, gira e fecha — o par `call`/`result` do protocolo tem começo e fim,
 * e o anel também. Anel que fica aberto para sempre é ferramenta que nunca retornou, e isso
 * é informação.
 */
import * as THREE from 'three';

const SATELLITE_ORBIT = 74;
const MAX_WORMHOLES = 8;

// Portais em arco acima do disco. Slot fixo por portal ativo: posição previsível, e dois
// simultâneos nunca se sobrepõem.
const SLOT_COUNT = 8;
const SLOT_RADIUS = 17;
const SLOT_HEIGHT = 12.5;
const PORTAL_SIZE = 5.8;
// Arco estreito: os portais moram na banda central acima do disco. Um arco largo jogava o
// primeiro slot para trás da coluna da HUD, fora de vista.
const SLOT_ARC = Math.PI * 0.58;
const OPEN_RATE = 6;

const PORTAL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
  O portal é um quad billboardado, não um torus.
  Escalar um torus uniformemente engrossa o tubo junto com o raio — ele infla como borracha
  em vez de abrir. Aqui a abertura é `uOpen` dentro do shader: a geometria nunca muda de
  tamanho, e o giro do vórtice acontece em coordenada polar, onde não disputa o transform
  do objeto com o billboard.
*/
const PORTAL_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime, uOpen, uSpin;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float angle = atan(p.y, p.x);

    // Raio da abertura cresce com uOpen; fora dela não há portal.
    float aperture = uOpen * 0.82;
    if (d > aperture + 0.18) discard;

    // Borda incandescente: gaussiana estreita no raio da abertura.
    float rim = exp(-pow((d - aperture) / 0.075, 2.0));

    // Vórtice: as espirais apertam perto do centro (o -1/d é o que dá a sensação de queda).
    float swirl = sin(angle * 5.0 + uTime * uSpin * 2.6 - 7.0 / max(d, 0.12)) * 0.5 + 0.5;
    float interior = smoothstep(aperture, aperture * 0.15, d) * pow(swirl, 2.2) * 0.55;

    // Núcleo escuro: o portal é um buraco, não um disco luminoso.
    float core = 1.0 - smoothstep(0.0, aperture * 0.55, d);
    float intensity = (rim * 1.15 + interior) * uOpen * (1.0 - core * 0.75);
    if (intensity < 0.004) discard;

    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

// As quatro cores do briefing, mais as famílias que ele não previu.
export const TOOL_COLORS = {
  filesystem: 0x6ee7a0,
  github: 0x5aa9ff,
  database: 0xffd257,
  browser: 0xff9b4a,
  mcp: 0x5ce1e6,
  agent: 0xc59bff,
  shell: 0xd8c9a8,
  planner: 0x8fa3bd,
  // `llm` é o kind que `server/agent.py` emite para `ollama.generate`, e ele não existia aqui:
  // a chamada ao modelo local caía em `other` e saía cinza, indistinguível de qualquer
  // ferramenta desconhecida. `brain.py` afirma que "o cliente lê `kind`, nunca o nome da
  // ferramenta" — e o kind escolhido não estava no vocabulário do cliente.
  llm: 0xffa9d4,
  other: 0x9aa7b8,
};

export function createSatellites() {
  const group = new THREE.Group();
  const satellites = [];

  const bodyGeometry = new THREE.OctahedronGeometry(0.85, 0);
  const ringGeometry = new THREE.RingGeometry(1.5, 1.72, 48);

  function install(providers) {
    for (const satellite of satellites) group.remove(satellite.object);
    satellites.length = 0;

    providers.forEach((provider, i) => {
      const angle = (i / Math.max(providers.length, 1)) * Math.PI * 2;
      const material = new THREE.MeshBasicMaterial({
        color: provider.online ? 0xffcf8a : 0x2b3240,
        transparent: true,
        opacity: provider.online ? 0.95 : 0.4,
      });
      const object = new THREE.Group();
      object.add(new THREE.Mesh(bodyGeometry, material));

      const halo = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffb35c,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      object.add(halo);
      group.add(object);

      satellites.push({
        id: provider.id,
        online: provider.online,
        object,
        halo,
        angle,
        // Plano inclinado e alto: separa visualmente "internet" de "conhecimento próprio".
        inclination: 0.5 + i * 0.14,
        activity: 0,
      });
    });
  }

  return {
    group,
    install,

    /** Provedor consultado: acende o halo e devolve a posição, para o rastro de meteoro. */
    activate(providerId) {
      const satellite = satellites.find((entry) => entry.id === providerId);
      if (!satellite) return null;
      satellite.activity = 1;
      return satellite.object.position.clone();
    },

    positionOf(providerId) {
      return satellites.find((entry) => entry.id === providerId)?.object.position.clone() ?? null;
    },

    update(delta, elapsed) {
      for (const satellite of satellites) {
        satellite.angle += delta * (satellite.online ? 0.06 : 0.02);
        const radius = SATELLITE_ORBIT * (1 + Math.sin(elapsed * 0.2 + satellite.inclination) * 0.04);
        /*
         * Mesma correção do céu: rotação real em torno de X.
         *
         * O `y` era constante no ângulo (órbita horizontal que nunca cruza o plano) e ainda
         * levava um `* 0.5` que a achatava numa elipse não-kepleriana. Pior: com
         * `cos(inclinação)` nos outros dois eixos, o raio EFETIVO caía de 74 para ~54 em
         * `i≈0.92` — os satélites "fora do sistema" orbitavam DENTRO da casca de arquivos
         * (46–110), exatamente contra a hierarquia que `bodies.js` declara no cabeçalho.
         */
        const x = Math.cos(satellite.angle) * radius;
        const z = Math.sin(satellite.angle) * radius;
        satellite.object.position.set(
          x,
          z * Math.sin(satellite.inclination),
          z * Math.cos(satellite.inclination)
        );
        satellite.object.rotation.y += delta * 0.6;
        satellite.object.rotation.x += delta * 0.25;

        satellite.activity = Math.max(0, satellite.activity - delta * 0.5);
        satellite.halo.material.opacity = satellite.activity * 0.8;
        satellite.halo.scale.setScalar(1 + (1 - satellite.activity) * 1.6);
      }
    },

    /** O halo tem que encarar a câmera para não virar uma linha. */
    faceCamera(camera) {
      for (const satellite of satellites) satellite.halo.quaternion.copy(camera.quaternion);
    },

    list: () => satellites.map(({ id, online, activity }) => ({ id, online, activity })),
  };
}

export function createWormholes() {
  const group = new THREE.Group();
  const open = [];
  // Slots ocupados por índice: o portal nasce num lugar previsível, não sorteado.
  const taken = new Set();

  const geometry = new THREE.PlaneGeometry(1, 1);

  return {
    group,

    /**
     * Abre um portal. `id` é o tool_use_id, para que `close()` feche o anel certo.
     *
     * Sem posição por parâmetro: ela sai de um slot livre. Sortear a posição fazia portais
     * simultâneos se sobreporem e o mesmo tipo de chamada aparecer em lugar diferente a cada
     * vez — nada para o olho aprender.
     */
    open(id, kind) {
      if (open.length >= MAX_WORMHOLES) retire(open.shift());

      const slot = nextSlot();
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOpen: { value: 0 },
          uSpin: { value: 0.7 + (slot % 3) * 0.35 },
          uColor: { value: new THREE.Color(TOOL_COLORS[kind] ?? TOOL_COLORS.other) },
        },
        vertexShader: PORTAL_VERTEX,
        fragmentShader: PORTAL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(slotPosition(slot));
      mesh.scale.setScalar(PORTAL_SIZE);
      group.add(mesh);
      open.push({ id, slot, mesh, material, open: 0, closing: false });
    },

    close(id) {
      const portal = open.find((entry) => entry.id === id);
      if (portal) portal.closing = true;
    },

    update(delta, elapsed, camera) {
      for (let i = open.length - 1; i >= 0; i--) {
        const portal = open[i];

        // Abertura e colapso pelo mesmo caminho, só com alvo diferente — sem estado extra e
        // sem o salto que um cálculo por idade produzia quando a ferramenta voltava rápido.
        const target = portal.closing ? 0 : 1;
        portal.open += (target - portal.open) * (1 - Math.exp(-OPEN_RATE * delta));

        portal.material.uniforms.uOpen.value = portal.open;
        portal.material.uniforms.uTime.value = elapsed;

        // Billboard puro: só o quaternion da câmera, nunca `rotation`.
        //
        // A versão anterior fazia `rotation.z += …` E `quaternion.slerp(…)` no mesmo objeto.
        // Em three.js os dois são sincronizados: escrever no Euler recalcula o quaternion e
        // descarta o slerp, que no quadro seguinte puxa de volta. Eles brigavam a cada frame
        // e o anel cambaleava. O giro agora vive no shader, onde não disputa transform.
        portal.mesh.quaternion.copy(camera.quaternion);

        if (portal.closing && portal.open < 0.01) {
          retire(portal);
          open.splice(i, 1);
        }
      }
    },

    count: () => open.length,
  };

  function nextSlot() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (!taken.has(i)) {
        taken.add(i);
        return i;
      }
    }
    return 0;
  }

  /** Arco acima do disco: portais simultâneos ficam lado a lado, todos legíveis. */
  function slotPosition(slot) {
    const spread = (slot / (SLOT_COUNT - 1) - 0.5) * SLOT_ARC;
    return new THREE.Vector3(
      Math.sin(spread) * SLOT_RADIUS,
      SLOT_HEIGHT + Math.cos(spread * 2) * 2.2,
      Math.cos(spread) * SLOT_RADIUS * 0.35
    );
  }

  function retire(portal) {
    taken.delete(portal.slot);
    group.remove(portal.mesh);
    portal.material.dispose();
  }
}
