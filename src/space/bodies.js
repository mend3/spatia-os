/**
 * Corpos de aplicativo: os destinos em que a câmera pousa.
 *
 * Cada app é um corpo em órbita própria, mais perto do núcleo que o campo de conhecimento —
 * eles são *do sistema*, não conteúdo dele. A hierarquia radial é a semântica: núcleo, apps,
 * conhecimento, satélites de busca, estrelas de fundo.
 *
 * Um corpo é `Mesh` sólido de baixa contagem (icosaedro) + halo billboardado. Sólido de
 * propósito: o céu inteiro é aditivo e etéreo, e um app precisa parecer **coisa** — algo com
 * superfície, em que se pode entrar. Se fosse mais um ponto luminoso, se perderia entre 2600
 * estrelas.
 *
 * O rótulo é DOM, não textura no canvas. Texto em canvas 3D exige atlas de glifos ou sprite
 * por rótulo, e nenhum dos dois casa com a tipografia hairline da HUD; um `<div>` posicionado
 * pela projeção da câmera usa a mesma fonte do resto e fica nítido em qualquer DPI.
 */
import * as THREE from 'three';

const ORBIT_BASE = 12.5;
/*
 * Duas classes de corpo, e a diferença é semântica, não decorativa.
 *
 * `app` = destino: icosaedro grande, órbita externa, a câmera pousa nele.
 * `control` = interruptor do sistema: octaedro pequeno, órbita interna e rápida, clicar
 * alterna algo e a câmera NÃO se move.
 *
 * Órbita interna para os controles porque eles são *do núcleo* — mais perto do sistema que
 * qualquer conteúdo. É a mesma lógica radial do resto: núcleo, controles, apps, conhecimento.
 */
const CONTROL_ORBIT = 7.2;
const HALO_SCALE = 3.4;
const LABEL_FADE_DISTANCE = 120;

const HALO_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uActive, uHover, uTime;
  varying vec2 vUv;
  void main(){
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    // Anel fino que engrossa no hover, e pulsa só quando o app está ativo.
    float ring = exp(-pow((d - 0.72) / (0.055 + uHover * 0.05), 2.0));
    float pulse = 1.0 + uActive * sin(uTime * 2.4) * 0.25;
    float glow = pow(1.0 - d, 2.5) * (0.12 + uHover * 0.18 + uActive * 0.3);
    float intensity = (ring * (0.5 + uHover * 0.6 + uActive * 0.7) + glow) * pulse;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export function createBodies(labelLayer) {
  const group = new THREE.Group();
  const bodies = [];

  const shell = new THREE.IcosahedronGeometry(0.95, 1);
  const controlShell = new THREE.OctahedronGeometry(0.42, 0);
  const haloGeometry = new THREE.PlaneGeometry(1, 1);

  function install(apps) {
    for (const body of bodies) {
      group.remove(body.object);
      body.label.remove();
    }
    bodies.length = 0;

    apps.forEach((app, index) => {
      const color = new THREE.Color(app.color ?? 0xffb35c);
      const isControl = app.type === 'control';
      const geometry = isControl ? controlShell : shell;

      const object = new THREE.Group();
      const core = new THREE.Mesh(
        geometry,
        // `MeshBasicMaterial` porque não há luz na cena: o núcleo é a única fonte, e é
        // aditiva. Um material que reage a luz ficaria preto.
        new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.55) })
      );
      const wire = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.5 })
      );
      object.add(core, wire);

      const halo = new THREE.Mesh(
        haloGeometry,
        new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: color },
            uActive: { value: 0 },
            uHover: { value: 0 },
            uTime: { value: 0 },
          },
          vertexShader: HALO_VERTEX,
          fragmentShader: HALO_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      halo.scale.setScalar(isControl ? HALO_SCALE * 0.42 : HALO_SCALE);
      object.add(halo);
      group.add(object);

      const label = document.createElement('button');
      label.className = `body-label ${isControl ? 'body-control' : ''}`;
      label.dataset.app = app.id;
      label.innerHTML = '';
      if (app.key) {
        label.append(Object.assign(document.createElement('span'),
          { className: 'body-key', textContent: app.key }));
      }
      label.append(Object.assign(document.createElement('span'),
        { className: 'body-name', textContent: app.name }));
      label.style.setProperty('--body-color', `#${color.getHexString()}`);
      labelLayer.append(label);

      const orbit = app.orbit || {};
      bodies.push({
        id: app.id,
        type: app.type || 'app',
        object,
        core,
        wire,
        halo,
        label,
        radius: orbit.radius ?? (app.type === 'control' ? CONTROL_ORBIT : ORBIT_BASE + index * 2.6),
        inclination: orbit.inclination ?? (index % 2 ? 0.42 : -0.28),
        phase: orbit.phase ?? (index / Math.max(apps.length, 1)) * Math.PI * 2,
        // Controles giram mais rápido: órbita interna, período curto. Coerente com Kepler.
        speed: orbit.speed ?? (app.type === 'control' ? 0.19 : 0.055 - index * 0.004),
        active: 0,
        hover: 0,
        position: new THREE.Vector3(),
      });
    });
  }

  const projected = new THREE.Vector3();

  return {
    group,
    install,

    update(delta, elapsed, camera, activeId, hoverId) {
      for (const body of bodies) {
        const angle = body.phase + elapsed * body.speed;
        const planar = Math.cos(body.inclination);
        body.position.set(
          Math.cos(angle) * body.radius * planar,
          Math.sin(body.inclination) * body.radius + Math.sin(elapsed * 0.4 + body.phase) * 0.7,
          Math.sin(angle) * body.radius * planar
        );
        body.object.position.copy(body.position);
        body.core.rotation.y += delta * 0.35;
        body.core.rotation.x += delta * 0.14;
        body.wire.rotation.y -= delta * 0.22;
        body.halo.quaternion.copy(camera.quaternion);

        const wantActive = body.id === activeId ? 1 : 0;
        const wantHover = body.id === hoverId ? 1 : 0;
        // Suavização por tempo, como o resto da cena — nunca fração por quadro.
        const rate = 1 - Math.exp(-7 * delta);
        body.active += (wantActive - body.active) * rate;
        body.hover += (wantHover - body.hover) * rate;
        body.halo.material.uniforms.uActive.value = body.active;
        body.halo.material.uniforms.uHover.value = body.hover;
        body.halo.material.uniforms.uTime.value = elapsed;
        body.wire.material.opacity = 0.35 + body.active * 0.45 + body.hover * 0.3;

        // Rótulo posicionado pela projeção. `visibility` em vez de `display` para não
        // provocar reflow do layer a cada quadro.
        projected.copy(body.position).project(camera);
        const behind = projected.z > 1;
        const distance = camera.position.distanceTo(body.position);
        const visible = !behind && distance < LABEL_FADE_DISTANCE;
        body.label.style.visibility = visible ? 'visible' : 'hidden';
        if (visible) {
          body.label.style.transform =
            `translate(-50%, -50%) translate(${((projected.x + 1) / 2) * 100}vw, ${((1 - projected.y) / 2) * 100}vh)`;
          body.label.style.opacity = String(
            0.45 + body.hover * 0.35 + body.active * 0.55 - Math.max(0, distance - 60) / 140
          );
          body.label.dataset.active = String(body.active > 0.5);
        }
      }
    },

    /**
     * Corpo sob o cursor. Devolve `{id, type}` porque o clique num app e num controle têm
     * consequências diferentes: um navega, o outro alterna.
     */
    pick(raycaster) {
      // Threshold maior no raycast dos controles: eles são pequenos, e mira difícil num
      // interruptor é defeito de usabilidade, não desafio.
      const meshes = bodies.map((body) => body.core);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit) return null;
      const body = bodies.find((entry) => entry.core === hit.object);
      return body ? { id: body.id, type: body.type } : null;
    },

    positionOf(id) {
      return bodies.find((body) => body.id === id)?.position.clone() ?? null;
    },

    ids: () => bodies.map((body) => body.id),
  };
}
