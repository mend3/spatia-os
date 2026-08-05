/**
 * O catálogo da bancada: um objeto por entrada, com os controles que importam para ELE.
 *
 * Cada espécime declara o que monta, o que se pode mexer e — o campo que mais vale — o que
 * OLHAR. Uma bancada sem `watch` vira vitrine: mostra o objeto girando bonito e não diz o que
 * deveria estar acontecendo ali, então quem revisa não sabe se o que vê é o correto.
 *
 * ⚠️ Todo espécime IMPORTA o módulo real da cena. Nada aqui reimplementa geometria ou shader.
 * Uma bancada que copia o objeto para exibi-lo passa a mentir na primeira divergência — e a
 * primeira divergência é exatamente o momento em que ela seria útil.
 */
import * as THREE from 'three';
import {
  createRings, DIRTY_COLORS, VISIBLE_CORE, LOD_FAR_PX, LOD_NEAR_PX,
} from '../space/rings.js';
import { RING_FAMILIES } from '../space/ring-profiles.js';
import { createBlackHole } from '../space/blackhole.js';
import { createBodies } from '../space/bodies.js';
import { createStars } from '../space/stars.js';
import { createSatellites, createWormholes, TOOL_COLORS } from '../space/satellites.js';
import { createParticles } from '../space/particles.js';
import { RING_VARIANTS } from './ring-variants.js';

/** Afinação neutra: a bancada não herda o que o operador ajustou na cena. */
export const NEUTRAL = Object.freeze({
  diskSpin: 1, diskIntensity: 1, diskWidth: 1, breath: 1,
  starSpread: 1, starSize: 1, starBrightness: 1, starDrift: 0,
  graphSpread: 1, graphSpeed: 0, nodeSize: 1, edgeOpacity: 0.2,
  cameraDrift: 0, cameraEase: 9, fov: 46,
  lensStrength: 0.18, bloomStrength: 0, bloomThreshold: 0.8,
  aberration: 0, grain: 0, vignette: 0,
  volume: 0, ambient: 0, brightness: 1,
});

/*
 * As variações do anel entram como espécimes de primeira classe.
 *
 * Elas vivem em arquivo separado porque são CANDIDATAS, não produção: o anel de `space/rings.js`
 * continua sendo o que a cena desenha, e a bancada é onde as quatro disputam. Misturá-las no
 * mesmo arquivo apagaria essa diferença — e a pergunta "qual delas está no ar?" passaria a
 * depender de ler código em vez de olhar.
 */
export const SPECS = [
  {
    id: 'anel',
    name: 'ANEL PLANETÁRIO',
    /*
     * A estrela FALSA é de propósito, e é o coração deste espécime.
     *
     * O anel se ancora no raio aparente do ponto (`gl_PointSize`), que na cena depende de
     * corpus, câmera, slider e resolução — cinco variáveis para revisar um efeito que tem
     * duas. Aqui a estrela é uma esfera de raio conhecido e o anel recebe esse raio direto,
     * então o que sobra na imagem é só o material do anel.
     */
    distance: 6,
    controls: [
      { key: 'familia', label: 'FAMÍLIA', type: 'enum', options: Object.keys(RING_FAMILIES), value: 'saturn' },
      { key: 'estado', label: 'ESTADO GIT', type: 'enum', options: Object.keys(DIRTY_COLORS), value: 'modified' },
      { key: 'tombo', label: 'TOMBO', type: 'range', min: 0, max: 1.5, step: 0.01, value: 1.1 },
      { key: 'raio', label: 'RAIO DA ESTRELA', type: 'range', min: 0.2, max: 1.4, step: 0.02, value: 0.7 },
      { key: 'estrela', label: 'DESENHAR A ESTRELA', type: 'bool', value: true },
    ],
    watch: [
      'a metade DISTANTE some atrás da estrela e reaparece — se ela atravessa, a oclusão quebrou',
      'a metade PRÓXIMA escurece o disco da estrela (extinção); com blending aditivo ela clarearia',
      'Saturno: a Divisão de Cassini separa duas faixas largas · Urano: aros finos e separados · Júpiter: halo difuso',
      'gire com o mouse: a elipse mantém a mesma forma (é billboard com tombo, não anel de mundo)',
    ],
    build(ctx) {
      const group = new THREE.Group();

      /*
       * A estrela é um SPRITE SUAVE, não uma esfera dura — e isso a bancada me ensinou.
       *
       * A primeira versão usava uma esfera lisa, por parecer o controle mais limpo. Com ela o
       * anel sumia — e esta bancada acabou provando que o culpado não era a esfera: a borda
       * externa do anel estava a 1,03 raio do astro, ou seja, o anel inteiro cabia dentro do
       * próprio planeta. Na cena o defeito se escondia porque a estrela é um ponto com queda
       * suave e bloom, e o anel caía no halo em vez de num disco chapado. Corrigida a extensão
       * (`SPAN_CAP` em `rings.js`), os dois passaram a mostrar a mesma coisa.
       *
       * O sprite abaixo reproduz a mesma queda do fragmento de `graph.js`
       * (`pow(1 - smoothstep(0,1,d), 2.2)`), porque a bancada tem de mostrar o MESMO astro que
       * a cena — inclusive quando o que ela revela é um defeito real.
       */
      const star = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
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
      group.add(star);

      const rings = createRings();
      group.add(rings.group);

      const positions = new Float32Array([0, 0, 0]);
      return {
        object: group,
        update(values, camera, clock) {
          star.visible = values.estrela;
          // O quad do sprite tem meia-extensão 1 e o disco visível é `VISIBLE_CORE` dele —
          // então a escala é o raio do SPRITE, e o que se vê tem o raio pedido.
          star.scale.setScalar(values.raio / VISIBLE_CORE);
          star.quaternion.copy(camera.quaternion);
          rings.set([{ index: 0, size: 1, state: values.estado, recency: 1 }]);
          // O tombo é do espécime, não do hash do nó: quem revisa quer varrer o ângulo.
          /*
           * ⚠️ O anel espera o raio do SPRITE, não o do disco visível.
           *
           * Na cena quem alimenta isso é `graph.js`, que devolve metade do `gl_PointSize` — e o
           * disco que se VÊ é `VISIBLE_CORE` disso. Passar o raio visível direto (foi o primeiro
           * erro desta bancada) faz o anel inteiro caber dentro da estrela e sumir.
           */
          /*
           * O contrato de `radiusOf` devolve `{world, px}`: mundo escala a malha, pixel decide
           * o NÍVEL DE DETALHE. Aqui o px é derivado do raio pedido e da altura do canvas — na
           * cena ele vem do `gl_PointSize` real.
           */
          const world = values.raio / VISIBLE_CORE;
          const px = (world * window.innerHeight) / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.length());
          rings.follow(positions, camera, () => 1, () => ({ world, px }), clock.elapsed, values.tombo);
          ctx.report({
            'família': values.familia,
            'alcance': `${RING_FAMILIES[values.familia].reach.toFixed(2)} R`,
            'tombo': `${((values.tombo * 180) / Math.PI).toFixed(0)}°`,
            // O nível de detalhe é o que a RÉGUA DE RAIO varre aqui: 0,2 cai na laje e 1,4 na
            // rocha. Sem este número a revisão não sabe qual dos dois materiais está vendo — e
            // o defeito clássico da técnica é justamente a diferença entre os dois.
            'pixels': px.toFixed(0),
            'nível': px < LOD_FAR_PX ? 'LAJE (longe)' : px > LOD_NEAR_PX ? 'ROCHA (perto)' : 'transição',
          });
        },
        dispose: () => rings.dispose(),
      };
    },
  },

  {
    id: 'buraco-negro',
    name: 'BURACO NEGRO',
    distance: 22,
    controls: [
      { key: 'intensidade', label: 'INTENSIDADE', type: 'range', min: 0.1, max: 3, step: 0.05, value: 1 },
      { key: 'largura', label: 'LARGURA DO DISCO', type: 'range', min: 0.4, max: 2, step: 0.02, value: 1 },
      { key: 'giro', label: 'ROTAÇÃO', type: 'range', min: 0, max: 4, step: 0.05, value: 1 },
      { key: 'regime', label: 'REGIME', type: 'enum', options: ['idle', 'thinking', 'answering', 'error'], value: 'idle' },
    ],
    watch: [
      'o crescente do beaming fica PARADO enquanto o disco gira — se ele circula, o tempo voltou para a conta',
      'orbite até ficar de cima: a assimetria some, porque de frente não há componente radial',
      'gradiente de temperatura: anel interno quase branco, névoa externa âmbar e fraca',
      'nada é desenhado por cima do horizonte',
    ],
    build(ctx) {
      const hole = createBlackHole();
      return {
        object: hole.group,
        update(values, camera, clock) {
          hole.setRegime(values.regime);
          hole.tune({ ...NEUTRAL, diskIntensity: values.intensidade, diskWidth: values.largura, diskSpin: values.giro });
          hole.update(clock.delta, clock.elapsed);
          hole.syncView(camera);
          ctx.report({ regime: values.regime, 't': `${clock.elapsed.toFixed(2)}s` });
        },
      };
    },
  },

  {
    id: 'corpos',
    name: 'CORPOS DE APP',
    distance: 9,
    controls: [
      { key: 'ativo', label: 'ATIVO', type: 'bool', value: false },
      { key: 'hover', label: 'SOB O CURSOR', type: 'bool', value: false },
    ],
    watch: [
      'o giro tem que ser VISÍVEL — foi por isto que o material deixou de ser MeshBasicMaterial',
      'o lado voltado para a origem é o iluminado: a fonte da cena é o núcleo',
      'a borda nunca fica totalmente preta (termo de rim)',
    ],
    build(ctx) {
      const bodies = createBodies(document.createElement('div'));
      bodies.install([
        { id: 'a', name: 'ARQUIVOS', color: 0x7ee0c0, orbit: { phase: 0, inclination: 0.2 } },
        { id: 'b', name: 'SISTEMA', color: 0xffab54, orbit: { phase: Math.PI, inclination: -0.3 } },
      ]);
      return {
        object: bodies.group,
        update(values, camera, clock) {
          bodies.update(clock.delta, clock.elapsed, camera, values.ativo ? 'a' : null, values.hover ? 'a' : null);
          ctx.report({ corpos: 2 });
        },
      };
    },
  },

  {
    id: 'satelites',
    name: 'SATÉLITES E WORMHOLES',
    distance: 120,
    controls: [
      { key: 'online', label: 'PROVEDOR NO AR', type: 'bool', value: true },
      { key: 'portal', label: 'FAMÍLIA DO PORTAL', type: 'enum', options: Object.keys(TOOL_COLORS), value: 'filesystem' },
      { key: 'abrir', label: 'ABRIR PORTAL', type: 'action' },
    ],
    watch: [
      'a órbita CRUZA o plano — se o satélite só sobe e desce sem atravessar, a inclinação virou altura fixa',
      'o raio orbital é o declarado (74), não encolhe com a inclinação',
      'o portal abre e fecha pelo mesmo caminho, sem salto',
    ],
    build(ctx) {
      const group = new THREE.Group();
      const sats = createSatellites();
      const holes = createWormholes();
      group.add(sats.group, holes.group);
      let n = 0;
      return {
        object: group,
        onAction(key, values) {
          if (key !== 'abrir') return;
          const id = `p${n++}`;
          holes.open(id, values.portal);
          setTimeout(() => holes.close(id), 2600);
        },
        update(values, camera, clock) {
          sats.install([{ id: 's', label: 'BRAVE', online: values.online }]);
          sats.update(clock.delta, clock.elapsed);
          sats.faceCamera(camera);
          holes.update(clock.delta, clock.elapsed, camera);
          ctx.report({ portais: holes.count() });
        },
      };
    },
  },

  {
    id: 'ceu',
    name: 'CAMPO ESTELAR',
    distance: 60,
    controls: [
      { key: 'tamanho', label: 'TAMANHO', type: 'range', min: 0.2, max: 3, step: 0.05, value: 1 },
      { key: 'brilho', label: 'BRILHO', type: 'range', min: 0, max: 2.5, step: 0.05, value: 0.55 },
      { key: 'instavel', label: 'INSTÁVEL (erro)', type: 'bool', value: false },
    ],
    watch: [
      'a maioria é ponto fraco e frio — se o campo estiver dominado por azul, a distribuição espectral inverteu',
      'quase nenhuma estrela é grande: as grandes são a exceção',
    ],
    build(ctx) {
      const stars = createStars();
      return {
        object: stars.object,
        update(values, camera, clock) {
          stars.setUnstable(values.instavel);
          stars.tune({ ...NEUTRAL, starSize: values.tamanho, starBrightness: values.brilho });
          stars.update(clock.delta, clock.elapsed);
          ctx.report({ 'tamanho': values.tamanho.toFixed(2), 'brilho': values.brilho.toFixed(2) });
        },
      };
    },
  },

  {
    id: 'particulas',
    name: 'PARTÍCULAS',
    distance: 26,
    controls: [
      { key: 'queda', label: 'QUEDA (memória)', type: 'action' },
      { key: 'saida', label: 'SAÍDA (token)', type: 'action' },
      { key: 'estouro', label: 'ESTOURO (erro)', type: 'action' },
    ],
    watch: [
      'a queda termina NO plano do disco, não acima dele',
      'nada mira o centro absoluto: matéria circulariza na borda interna',
    ],
    build(ctx) {
      const particles = createParticles();
      const alvo = new THREE.Vector3(9, 2, 4);
      return {
        object: particles.object,
        onAction(key) {
          if (key === 'queda') particles.infall(alvo, 0x7ee0c0, 22);
          if (key === 'saida') particles.outflow(alvo, 0xffe6bd, 12);
          if (key === 'estouro') particles.burst(new THREE.Vector3(0, 0, 0), 0xff5b45, 40, 9);
        },
        update(values, camera, clock) {
          particles.update(clock.delta);
          ctx.report({ 't': `${clock.elapsed.toFixed(2)}s` });
        },
      };
    },
  },

  ...RING_VARIANTS,
];
