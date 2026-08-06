/**
 * O TRAÇO DAS ÓRBITAS das luas do astro em foco.
 *
 * ## O problema que ele resolve, e por que não era tamanho
 *
 * O piso de legibilidade (`orbital-zones.js`, `MOON_MIN_OVER_OUTER`) fez a lua virar corpo: de
 * 1,27 px de disco visível para 3 a 7. Olhando a cena depois disso, as luas aparecem — e o sistema
 * continua lendo como **pontos espalhados**, não como as bandas radiais disjuntas que o modelo
 * construiu. Aumentar mais o corpo não conserta: o defeito não é a lua ser pequena.
 *
 * A ordenação radial é informação de DOIS INSTANTES. Um ponto parado não diz em que raio ele
 * orbita — diz só onde ele está agora, e a projeção em perspectiva somada ao `INCLINATION_SPREAD`
 * embaralha o resto. É a mesma classe de coisa que a rotação da galáxia: *"movimento, transição e
 * qualquer coisa que dependa de dois instantes precisam do humano ou de duas amostras"*. Desenhar
 * a órbita converte esse tempo em espaço, e é a única saída que não mente sobre a geometria.
 *
 * A alternativa considerada e recusada: apertar o `INCLINATION_SPREAD` até o sistema achatar num
 * plano. Ela devolveria o colar de pérolas que motivou espalhar a inclinação em primeiro lugar, e
 * ainda assim não diria o raio — duas luas no mesmo plano continuam ambíguas em perspectiva.
 *
 * ## Só o astro em foco
 *
 * 106 sistemas traçados ao mesmo tempo seriam ruído, e a pergunta "como este sistema está
 * arranjado" só existe quando alguém travou a câmera num corpo. Mesmo ciclo de vida da fotosfera,
 * do planeta e do remanescente: um por cena, remontado quando o foco muda.
 *
 * ⚠️ **Espaço de coordenadas.** `semiMajor` é unidade LOCAL do grafo; `planetAnchor` devolve MUNDO
 * (já multiplicado por `graphSpread`). O objeto fica na raiz da cena com a posição de mundo do pai
 * e a escala do grupo aplicada à geometria local — pendurá-lo sob `graph.group` aplicaria a escala
 * duas vezes. É o defeito que os arcos de vínculo já pagaram uma vez, a 38% da distância real.
 */
import * as THREE from 'three';
import { moonOffset } from './graph.js';

/**
 * Amostras por volta.
 *
 * 96 põe o erro de corda abaixo de 0,1% do semieixo (`1 − cos(π/96)`), que é menos que a espessura
 * da linha em qualquer enquadramento em que a órbita cabe na tela. Dobrar não muda nada visível e
 * dobra o buffer de um objeto que é remontado a cada troca de foco.
 */
const SAMPLES = 96;

/**
 * Opacidade do traço, e ela é o DEFAULT do slider `moonOrbitOpacity`.
 *
 * O traço é referência, não figura: tem de ceder para a lua e para o astro. 0,22 é onde ele
 * informa a banda sem competir com o corpo — e quem discordar tem o controle no painel, inclusive
 * zero, que devolve o sistema a pontos soltos (o que ele era antes deste módulo existir).
 */
const OPACITY = 0.22;

/**
 * Traço das órbitas de um sistema de luas. Um por cena.
 *
 * @returns {{object: THREE.Object3D, show: Function, hide: Function, dispose: Function}}
 */
export function createMoonOrbits() {
  const object = new THREE.Group();
  object.visible = false;
  const material = new THREE.LineBasicMaterial({
    color: 0x7ee0c0,
    transparent: true,
    opacity: OPACITY,
    depthWrite: false,
  });
  /** Geometrias da montagem corrente — descartadas quando o foco muda. */
  let lines = [];

  function clear() {
    for (const line of lines) {
      object.remove(line);
      line.geometry.dispose();
    }
    lines = [];
  }

  return {
    object,

    /**
     * Remonta o traço para este sistema. Chame só quando o FOCO muda, não por quadro.
     *
     * @param {object[]} moons  as luas do astro (`graph.moonsAt`), em unidades locais do grafo
     */
    build(moons) {
      clear();
      for (const moon of moons) {
        const pontos = new Float32Array(SAMPLES * 3);
        const at = [0, 0, 0];
        for (let s = 0; s < SAMPLES; s += 1) {
          /*
           * Amostragem uniforme na anomalia VERDADEIRA, não na média.
           *
           * As duas fecham a mesma elipse — a diferença é só onde os pontos se acumulam. Pela
           * verdadeira eles ficam densos no periastro, que é onde a curvatura é maior e onde uma
           * corda reta destoaria. Pela média ficariam densos no apoastro, que é o lado reto.
           */
          moonOffset(moon, (s / SAMPLES) * Math.PI * 2, at);
          pontos.set(at, s * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(pontos, 3));
        const line = new THREE.LineLoop(geometry, material);
        // A elipse envolve o astro e o astro pode encher a tela: com o centro fora do volume, o
        // frustum descartaria o traço justamente no enquadramento em que ele é pedido.
        line.frustumCulled = false;
        lines.push(line);
        object.add(line);
      }
    },

    /**
     * Põe o traço sobre o astro. `radiusScale` é a escala do grupo do grafo — ver o aviso de
     * espaço de coordenadas no cabeçalho.
     */
    show(position, spread) {
      if (!lines.length) return;
      object.visible = true;
      object.position.copy(position);
      object.scale.setScalar(spread);
    },

    hide() {
      object.visible = false;
    },

    /** Afinação: só a opacidade. Um material para todas as elipses, então é uma escrita só. */
    tune(values) {
      material.opacity = values.moonOrbitOpacity ?? OPACITY;
    },

    dispose() {
      clear();
      material.dispose();
    },
  };
}
