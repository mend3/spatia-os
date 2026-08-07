/**
 * OS CONTROLES DA CENA — o que não pertence a espécime nenhum.
 *
 * A cena da bancada tem o mesmo contrato que um espécime: a lista abaixo tem exatamente a forma de
 * `spec.controls` e o mesmo `buildControl` a desenha. Controle global novo é uma linha aqui — não
 * há interface a escrever, e por isso não há lugar onde esquecer de registrar.
 *
 * ⚠️ O que NÃO entra aqui: brilho, contraste e saturação. Eles existem na cena de verdade
 * (`core/tuning.js`, grupo GLOBAL) e são um PASSE DE PÓS-PROCESSAMENTO — a bancada não tem
 * nenhum, de propósito, porque revisar um material através de uma gradação é revisar a soma e não
 * a parcela (ver o cabeçalho de `sandbox/main.js`). Trazê-los para cá daria o controle e tiraria a
 * única coisa que a bancada oferece.
 *
 * O que entra é o que ajuda a MEDIR: o ritmo do relógio, as duas réguas espaciais e o fundo.
 */
import * as THREE from 'three';

/**
 * Fundos, e por que são três.
 *
 * Quase todo material desta cena é ADITIVO — ele soma luz ao que já está no alvo. Sobre o vazio
 * quase preto, "aditivo" e "opaco" são indistinguíveis, e é dessa confusão que nascem os defeitos
 * de blending. Um fundo CINZA os separa na hora: o que é aditivo clareia o cinza e nunca o
 * escurece; o que é opaco o cobre. O fundo CLARO é o caso extremo, onde um material aditivo
 * simplesmente desaparece.
 */
const FUNDOS = Object.freeze({
  vazio: 0x04060a,
  cinza: 0x3a4152,
  claro: 0xc8cedb,
});

/**
 * A lista declarativa. Mesma forma de `spec.controls` — `key`, `label`, `type` e o resto por tipo.
 */
export const GLOBAL_CONTROLS = Object.freeze([
  /*
   * VELOCIDADE — o mesmo papel de `timeScale` no painel da cena: multiplica o passo do relógio,
   * e por isso alcança TODO espécime sem que nenhum deles saiba que ele existe.
   *
   * Aqui ele multiplica `clock.delta`, que é o passo dado por quadro tanto no modo CORRER quanto
   * no botão UM QUADRO. Em 0 a cena congela mesmo com CORRER ligado; acima de 1 ele alcança o
   * fenômeno lento — escoamento da cauda em 4,6 s, farol da estação a 0,9 Hz — que de outro modo
   * exigiria arrastar o slider de INSTANTE por meia tela para dar uma volta.
   */
  { key: 'velocidade', label: 'VELOCIDADE', type: 'range', min: 0, max: 6, step: 0.05, value: 1 },
  { key: 'grade', label: 'GRADE DO PLANO', type: 'bool', value: true },
  /*
   * A ESFERA DE RAIO 1, e ela é a régua que faltava.
   *
   * Praticamente todo número deste projeto é dito "em raios do corpo": `BODY_SPAN`, `SPAN` da
   * nebulosa, a coroa entre 1,03 e 1,67, o alcance do anel. Sem um raio 1 desenhado, conferir
   * qualquer um desses no olho é estimar, e o readout vira a única resposta possível.
   */
  { key: 'referencia', label: 'ESFERA DE RAIO 1', type: 'bool', value: false },
  { key: 'fundo', label: 'FUNDO', type: 'enum', options: Object.keys(FUNDOS), value: 'vazio' },
]);

/**
 * Monta os objetos de cena que os controles globais governam e devolve o aplicador.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 */
export function createGlobals(scene, renderer) {
  const grid = new THREE.GridHelper(200, 40, 0x2d3648, 0x151b25);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  /*
   * Aramada e sem preenchimento: a régua não pode ocluir o objeto que ela mede. `depthWrite` fora
   * pelo mesmo motivo — com ele, a esfera de referência recortaria a metade traseira de qualquer
   * pele transparente e o defeito pareceria do material.
   */
  const referencia = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0x3f6d8c,
      wireframe: true,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );
  referencia.visible = false;
  scene.add(referencia);

  return {
    controls: GLOBAL_CONTROLS,

    apply(values) {
      grid.visible = values.grade;
      referencia.visible = values.referencia;
      renderer.setClearColor(FUNDOS[values.fundo] ?? FUNDOS.vazio, 1);
    },

    /** O multiplicador do relógio, para quem é dono do `clock`. */
    timeScale: (values) => values.velocidade ?? 1,
  };
}
