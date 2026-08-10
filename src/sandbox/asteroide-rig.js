/**
 * O ASTEROIDE de arquivo — oito formas de levantamento real, pele emprestada dos planetas.
 *
 * O que este espécime existe para responder, e nada disso se responde na cena cheia:
 *
 * 1. as oito malhas CARREGAM, e o custo delas varia **72×** — de 2.780 a 200.364 triângulos;
 * 2. a UV GERADA prende a textura, ou a costura estica a imagem através de um triângulo?
 * 3. a normal por FACE (o que o STL guarda) desenha rocha; suavizar desenha plástico. Qual serve?
 * 4. `SEMENTE` varia forma e pele juntas — dois corpos vizinhos saem distintos?
 *
 * ⭑ **A SEMENTE é o que este espécime tem de exercitar mais.** Na cena a escolha vem de
 * `hash(node.id)`, e é fixa por corpo; aqui ela é um controle, para varrer o espaço inteiro de
 * combinações sem precisar de oito corpos na tela.
 */
import * as THREE from 'three';
import { asteroideParams, criarAsteroide, MALHAS, PELES } from '../space/asteroide.js';
import { hash01 } from '../space/graph.js';

const RAIO = 1;

export const ASTEROIDE_SPEC = {
  id: 'asteroide',
  name: 'ASTEROIDE (.stl)',
  distance: 4,
  controls: [
    { key: 'semente', label: 'SEMENTE (corpo)', type: 'range', min: 0, max: 40, step: 1, value: 3 },
    { key: 'giro', label: 'GIRO AUTOMÁTICO', type: 'bool', value: true },
    { key: 'suave', label: 'NORMAIS SUAVES', type: 'bool', value: false },
    { key: 'malha', label: 'ARAME (ver topologia)', type: 'bool', value: false },
    { key: 'textura', label: 'TEXTURA', type: 'bool', value: true },
    { key: 'luz', label: 'LUZ FRONTAL', type: 'range', min: 0, max: 3, step: 0.1, value: 1.6 },
    { key: 'ambiente', label: 'LUZ AMBIENTE', type: 'range', min: 0, max: 1, step: 0.05, value: 0.12 },
  ],
  watch: [
    'mova SEMENTE: forma E pele trocam juntas, e a mesma semente devolve sempre o mesmo par — é hash, não sorteio',
    'TEXTURA desligada mostra a forma crua; ligada, procure a COSTURA — uma faixa esticada de polo a polo seria a UV errada',
    'NORMAIS SUAVES: a silhueta não muda e a superfície vira plástico. Facetado é a leitura de rocha, e é o que o formato guarda',
    'o painel mostra o CUSTO da malha sorteada: de 2.780 a 200.364 triângulos, 72× entre a mais leve e a mais pesada',
    'ARAME: a malha de levantamento tem densidade uniforme — diferente de malha modelada à mão',
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const frontal = new THREE.DirectionalLight(0xfff2e0, 1.6);
    frontal.position.set(3, 2, 2);
    const ambiente = new THREE.AmbientLight(0x6f8ab0, 0.12);
    grupo.add(frontal, ambiente);

    const pivo = new THREE.Group();
    grupo.add(pivo);

    let atual = null;
    let sementeMontada = null;
    let suaveAplicado = false;

    /*
     * A remontagem é por SEMENTE, e não por quadro: trocar de malha é carregar arquivo, então o
     * espécime só refaz quando a semente muda. É o mesmo padrão da ESTAÇÃO, onde módulo é contagem
     * discreta e a peça remonta em degraus.
     */
    const montar = (semente) => {
      if (atual) pivo.remove(atual.objeto);
      const params = asteroideParams(`corpo-${semente}`, hash01);
      atual = { ...criarAsteroide(params, RAIO), params };
      pivo.add(atual.objeto);
      sementeMontada = semente;
      suaveAplicado = false;
    };

    return {
      object: grupo,
      update(values, camera, clock) {
        if (values.semente !== sementeMontada) montar(values.semente);
        if (values.giro) pivo.rotation.y = clock.elapsed * 0.3;
        frontal.intensity = values.luz;
        ambiente.intensity = values.ambiente;

        const m = atual?.info.malha;
        if (m) {
          const mat = m.material;
          mat.wireframe = values.malha;
          mat.map = values.textura ? mat.userData.map ?? mat.map : null;
          if (!mat.userData.map) mat.userData.map = mat.map;
          if (!values.textura) mat.map = null;
          else mat.map = mat.userData.map;
          if (values.suave !== suaveAplicado) {
            suaveAplicado = values.suave;
            mat.flatShading = !values.suave;
            mat.needsUpdate = true;
          }
        }

        const info = atual?.info;
        ctx.report(
          info?.erro
            ? { ESTADO: 'FALHOU', MOTIVO: info.erro }
            : !info?.medida
              ? { ESTADO: 'carregando…', MALHA: atual?.params.malha.id ?? '—' }
              : {
                  MALHA: `${atual.params.malha.id} · ${info.medida.triangulos.toLocaleString('pt-BR')} tri`,
                  PELE: atual.params.pele,
                  PESO: `${((info.medida.triangulos / 295652) * 100).toFixed(1)}% do total das ${MALHAS.length}`,
                  NORMAIS: values.suave ? 'suaves (plástico)' : 'do FORMATO (rocha)',
                },
        );
      },
      dispose() {
        atual = null;
      },
    };
  },
};
