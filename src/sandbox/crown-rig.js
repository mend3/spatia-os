/**
 * A COROA DO SPRITE SOB A PELE — o caminho que não era desenhável em lugar nenhum.
 *
 * ⚠️ Até 2026-08-07 nenhum espécime desenhava isto. O `anel` usa uma estrela FALSA (um quad que
 * copia só a queda do núcleo) e o `SISTEMA DE LUAS` importa o material real com `aHalo` em ZERO —
 * ou seja, a bancada sabia desenhar o sprite e sabia desenhar cada pele, e não sabia desenhar os
 * dois no mesmo lugar, que é onde a decisão mora. É o modo de falha que a REGRA DA INSPEÇÃO
 * nomeia: *o caminho onde o defeito morava não era desenhável ali*.
 *
 * ⚠️ Tudo aqui é importado da cena: o material do sprite vem de `graph.createPointMaterial()` e
 * cada pele vem do seu módulo. Uma bancada que reimplementasse o fragmento do sprite aprovaria uma
 * coroa que a cena não desenha — e justo no espécime que existe para julgar a coroa.
 *
 * ## O que este espécime mede, e que nenhum outro media
 *
 * O teto de `gl_PointSize` do driver (`ALIASED_POINT_SIZE_RANGE`, lido do contexto ao vivo). Ele é
 * o que decide onde a coroa cai: enquanto o ponto cabe, a coroa vive entre 1,03 e 1,67 raios do
 * corpo; passado o teto (`px > raio do teto × VISIBLE_CORE`), ela para de crescer em MUNDO e vira
 * um número fixo de pixels de tela. Foi por não estar em lugar nenhum que "escalar a coroa por
 * `SKIN_EXTENT`" chegou a parecer uma saída de uma linha e meia — ela pede 433 px de raio em
 * qualquer pele e o driver entrega 255,5.
 */
import * as THREE from 'three';
import { createPointMaterial, hash01, KIND_COLORS } from '../space/graph.js';
import { VISIBLE_CORE } from '../space/rings.js';
import { diskPx } from '../space/galaxy.js';
import { BODY_SPAN, keepsCrown } from '../space/lod.js';
import { SURFACE } from '../space/solver.js';
import { createPhotosphere, photosphereParams } from '../space/photosphere.js';
import { createStation, stationParams } from '../space/station.js';
import { createComet, cometParams } from '../space/comet.js';
import { createNebula, nebulaParams } from '../space/nebula.js';

/** O nó mínimo que os quatro `*Params` leem. Um só, para as peles não divergirem por entrada. */
const noFalso = (values) => ({
  source: `bancada/coroa/${values.semente.toFixed(3)}`,
  chunks: Math.round(values.massa),
  sections: [],
  churn: 0.4,
  massRank: 0.5,
});

/**
 * O `d` do `gl_PointCoord` onde o núcleo do sprite termina de abrir, e onde ele morre.
 *
 * Espelho em JS do `FRAGMENT` de `graph.js` — existe para o READOUT poder dizer onde a coroa caiu
 * em raios do corpo. ⚠️ É cópia de FORMA, como o espelho de `starRadius` já é: mexeu no shader,
 * mexa aqui. O readout mente em silêncio se os dois divergirem, e mente justamente sobre o número
 * que este espécime existe para publicar.
 */
const CROWN_INNER_D = 0.62;

export const CROWN_SPEC = {
  id: 'coroa',
  name: 'COROA SOB A PELE',
  /*
   * 6 põe o corpo de raio 1 em ~250 px de framebuffer nesta janela — logo ACIMA do teto do
   * driver, que é onde a coroa deixa de sair do corpo. Abrir aqui é abrir no caso que mais engana:
   * a coroa parece não existir, e não é o portão que a apagou, é o rasterizador.
   */
  distance: 6,
  controls: [
    {
      key: 'pele',
      label: 'PELE',
      type: 'enum',
      options: ['fotosfera', 'estação', 'cometa', 'nebulosa'],
      value: 'cometa',
    },
    /*
     * A CHAVE do espécime. Ligada, o sprite inteiro cede sob a pele (`uHaloYield` = 1); desligada,
     * sobra a coroa. É o A/B da decisão de 2026-08-07, e ele tem de poder ser feito no olho —
     * antes deste controle a única forma de ver o "depois" era editar o shader e recarregar.
     */
    { key: 'cede', label: 'A COROA CEDE', type: 'bool', value: true },
    /*
     * Segue o `level` que a cena passa ao `haloOf`: 0 é o sprite intacto (longe, sem pele) e 1 é
     * a pele em detalhe pleno. O meio é a transição, e é lá que uma troca seca apareceria.
     */
    { key: 'nivel', label: 'NÍVEL (halo)', type: 'range', min: 0, max: 1, step: 0.01, value: 1 },
    { key: 'raio', label: 'RAIO DE REFERÊNCIA', type: 'range', min: 0.1, max: 2, step: 0.01, value: 1, roll: false },
    { key: 'massa', label: 'MASSA (chunks)', type: 'range', min: 1, max: 240, step: 1, value: 60 },
    { key: 'semente', label: 'SEMENTE (caminho)', type: 'range', min: 0, max: 1, step: 0.001, value: 0.31 },
    { key: 'reduzido', label: 'MOVIMENTO REDUZIDO', type: 'bool', value: false },
  ],
  watch: [
    '⚠️ ligue e desligue A COROA CEDE em CADA pele: é o A/B que o portão por pele decide',
    'desligada, cometa e nebulosa ganham um DISCO CHAPADO por cima da coma e da nuvem',
    'desligada, fotosfera e estação PERDEM uma atmosfera que estava certa — daí o portão ser por pele',
    '`coroa` começando além de `corpo desenhado` = ela não envolve nada, e é isso que o portão pega',
    '⚠️ suba RAIO e olhe `sprite`: ele trava em 255,5 px e a coroa encolhe para dentro do corpo',
    'NÍVEL de 0 a 1 com A COROA CEDE ligada: o sprite sai CONTÍNUO, sem piscar',
    '⚠️ sem pós-processamento aqui: na cena o bloom engorda a coroa — incomodou aqui, incomoda mais lá',
  ],
  build(ctx) {
    const grupo = new THREE.Group();

    // Um vértice só: o astro em foco. `aHalo` é o que a cena escreve pelo `haloOf`, e é ele que
    // abre o miolo — os outros atributos existem porque o shader os declara.
    const material = createPointMaterial();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(3), 3));
    for (const nome of ['aSize', 'aHidden', 'aIgnition', 'aRecency', 'aSupernova', 'aSeed', 'aHalo']) {
      geometry.setAttribute(nome, new THREE.BufferAttribute(new Float32Array(1), 1));
    }
    const pontos = new THREE.Points(geometry, material);
    pontos.frustumCulled = false;
    grupo.add(pontos);

    const peles = {
      fotosfera: { surface: SURFACE.PHOTOSPHERE, mod: createPhotosphere() },
      'estação': { surface: SURFACE.STATION, mod: createStation() },
      cometa: { surface: SURFACE.COMET, mod: createComet() },
      nebulosa: { surface: SURFACE.NEBULA, mod: createNebula() },
    };
    for (const { mod } of Object.values(peles)) grupo.add(mod.object);

    const ORIGEM = new THREE.Vector3();

    return {
      object: grupo,
      update(values, camera, clock) {
        const no = noFalso(values);
        const cor = KIND_COLORS.config;
        const alturaFb = document.querySelector('canvas')?.height ?? window.innerHeight;
        const distancia = camera.position.length();
        const px = diskPx(values.raio, distancia, alturaFb, camera.fov);

        /*
         * O `aSize` que faz o DISCO VISÍVEL do sprite valer exatamente o raio de referência.
         *
         * Invertido do vertex shader (`gl_PointSize = uSize·aSize·(300/z)`) casado com
         * `starRadius`: o disco visível é `VISIBLE_CORE` do raio do ponto, e a distância cancela
         * dos dois lados — sprite e corpo encolhem juntos, que é o que os torna comparáveis.
         * ⚠️ Sem isto o espécime mediria a relação entre um sprite arbitrário e a pele, e a
         * pergunta é justamente onde a coroa cai EM RAIOS DO CORPO.
         */
        const tangente = Math.tan((camera.fov * Math.PI) / 360);
        const mundo = values.raio / VISIBLE_CORE;
        const pedido = (mundo * alturaFb) / (tangente * distancia);
        geometry.getAttribute('aSize').setX(0, pedido / (material.uniforms.uSize.value * (300 / distancia)));
        geometry.getAttribute('aColor').setXYZ(0, ...new THREE.Color(cor).toArray());
        geometry.getAttribute('aHalo').setX(0, values.nivel);
        for (const nome of ['aSize', 'aColor', 'aHalo']) geometry.getAttribute(nome).needsUpdate = true;
        material.uniforms.uTime.value = clock.elapsed;
        material.uniforms.uHaloYield.value = values.cede ? 1 : 0;

        const escolhida = peles[values.pele];
        for (const [nome, { mod }] of Object.entries(peles)) {
          if (nome !== values.pele) mod.object.visible = false;
          mod.object.scale.setScalar(values.raio);
          mod.object.position.set(0, 0, 0);
        }

        let nivelPele = 0;
        if (values.pele === 'fotosfera') {
          nivelPele = escolhida.mod.update(
            photosphereParams(no, hash01, cor), camera, px, clock.elapsed
          );
        } else if (values.pele === 'estação') {
          nivelPele = escolhida.mod.update(stationParams(no, cor), px, clock.elapsed);
        } else if (values.pele === 'cometa') {
          nivelPele = escolhida.mod.update(
            cometParams(no, cor), ORIGEM, camera, px, clock.elapsed, values.reduzido
          );
        } else {
          nivelPele = escolhida.mod.update(
            nebulaParams(no, cor), camera, px, clock.elapsed, values.reduzido
          );
        }

        /*
         * O TETO É LIDO DO DRIVER, não escrito aqui. Ele varia por máquina (medido em 2026-08-07
         * num M5: `[1, 511]`), e um literal na bancada afirmaria em toda tela o que vale nesta.
         */
        const gl = document.querySelector('canvas')?.getContext('webgl2');
        const teto = gl ? gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] / 2 : Infinity;
        const spriteFb = Math.min(pedido / 2, teto);
        const emRaios = (fb) => (px > 0 ? fb / px : 0);

        ctx.report({
          px: `${px.toFixed(0)} fb · ${(px / (window.devicePixelRatio || 1)).toFixed(0)} na tela`,
          sprite: `${spriteFb.toFixed(0)} fb${pedido / 2 > teto ? `  ⚠️ TETO (pedia ${(pedido / 2).toFixed(0)})` : ''}`,
          coroa: values.cede
            ? 'cedida'
            : `${emRaios(CROWN_INNER_D * spriteFb).toFixed(2)} → ${emRaios(spriteFb).toFixed(2)} raios`,
          'corpo desenhado': `${BODY_SPAN[escolhida.surface].toFixed(2)} raios`,
          'a cena faria': keepsCrown(escolhida.surface) ? 'MANTÉM a coroa' : 'CEDE',
          'nível da pele': nivelPele.toFixed(3),
        });
      },
      dispose() {
        geometry.dispose();
        material.dispose();
        for (const { mod } of Object.values(peles)) mod.dispose?.();
      },
    };
  },
};
